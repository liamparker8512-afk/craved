// Staff Management System — promotions, demotions, and strikes.
// Admin-only (server owner, native Administrator permission, or the bot's configured
// Admin role — see /config adminrole or /panel). Drop this file into src/commands/ and
// it will be auto-loaded; run `npm run deploy` afterward to register it with Discord.

const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database'); // read-only use: just to look up the configured log channel
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');

// --- Self-contained storage (kept separate from database.js on purpose) ---
// Uses the same DATA_DIR env var convention as database.js so both point at the
// same persistent volume on hosts like Railway (where the app's build path can vary).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'staffRecords.json');

function loadRecords() {
  if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
  } catch (e) {
    console.error('Failed to parse staffRecords.json, resetting it.', e);
    return {};
  }
}

function saveRecords(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getRecord(guildId, userId) {
  const all = loadRecords();
  const key = `${guildId}-${userId}`;
  return all[key] || { strikes: [], history: [] };
}

function updateRecord(guildId, userId, updater) {
  const all = loadRecords();
  const key = `${guildId}-${userId}`;
  const current = all[key] || { strikes: [], history: [] };
  const updated = updater(current);
  all[key] = updated;
  saveRecords(all);
  return updated;
}

async function logToChannel(guild, embed, invokingChannelId) {
  const cfg = db.guildConfig.get(guild.id, {});
  const channelId = cfg.staffLogChannelId || cfg.logChannelId;
  if (!channelId) return 'not-configured';
  // If the configured log channel is the same channel the command was run in,
  // the reply embed below already serves as the log — don't post a second copy.
  if (channelId === invokingChannelId) return 'same-channel';
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return 'not-configured';
  await channel.send({ embeds: [embed] }).catch(() => {});
  return 'sent';
}

async function dmUser(user, embed) {
  await user.send({ embeds: [embed] }).catch(() => {}); // ignore if DMs are closed
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Admin-only: manage staff promotions, demotions, and strikes')
    .addSubcommand(s => s.setName('promote').setDescription('Promote a staff member')
      .addUserOption(o => o.setName('user').setDescription('Staff member to promote').setRequired(true))
      .addStringOption(o => o.setName('rank').setDescription('New rank/title (e.g. "Senior Moderator")').setRequired(true))
      .addRoleOption(o => o.setName('add_role').setDescription('Role to grant for the new rank').setRequired(false))
      .addRoleOption(o => o.setName('remove_role').setDescription('Old rank role to remove').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the promotion').setRequired(false)))
    .addSubcommand(s => s.setName('demote').setDescription('Demote a staff member')
      .addUserOption(o => o.setName('user').setDescription('Staff member to demote').setRequired(true))
      .addStringOption(o => o.setName('rank').setDescription('New (lower) rank/title').setRequired(true))
      .addRoleOption(o => o.setName('add_role').setDescription('Role to grant for the new rank').setRequired(false))
      .addRoleOption(o => o.setName('remove_role').setDescription('Old rank role to remove').setRequired(false))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the demotion').setRequired(false)))
    .addSubcommand(s => s.setName('strike').setDescription('Issue a strike to a staff member')
      .addUserOption(o => o.setName('user').setDescription('Staff member to strike').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason for the strike').setRequired(true)))
    .addSubcommand(s => s.setName('removestrike').setDescription('Remove a specific strike by number')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
      .addIntegerOption(o => o.setName('number').setDescription('Strike number (see /staff strikes)').setRequired(true)))
    .addSubcommand(s => s.setName('clearstrikes').setDescription('Clear all strikes for a staff member')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true)))
    .addSubcommand(s => s.setName('strikes').setDescription('View a staff member\'s strikes')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true)))
    .addSubcommand(s => s.setName('history').setDescription('View a staff member\'s full promotion/demotion/strike history')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true)))
    .addSubcommand(s => s.setName('setlogchannel').setDescription('Set a dedicated channel for staff promotion/demotion/strike logs')
      .addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Log channel (defaults to your general mod log channel if not set)').setRequired(true))),

  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.guild.id)) {
      return interaction.reply({
        embeds: [errorEmbed('Only the server owner, Administrators, or someone with the configured Admin role can use the staff management system.')],
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'setlogchannel') {
      const channel = interaction.options.getChannel('channel');
      db.guildConfig.update(guild.id, cfg => ({ ...cfg, staffLogChannelId: channel.id }));
      return interaction.reply({ embeds: [successEmbed(`Staff promotion/demotion/strike logs will now be posted in ${channel}.`)] });
    }

    const target = interaction.options.getUser('user');

    if (sub === 'promote' || sub === 'demote') {
      const rank = interaction.options.getString('rank');
      const addRole = interaction.options.getRole('add_role');
      const removeRole = interaction.options.getRole('remove_role');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const isPromotion = sub === 'promote';

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) {
        return interaction.reply({ embeds: [errorEmbed('That user is not a member of this server.')], ephemeral: true });
      }

      if (addRole) {
        if (!member.manageable || addRole.position >= guild.members.me.roles.highest.position) {
          return interaction.reply({ embeds: [errorEmbed(`I can't assign ${addRole} — check my role is positioned above it in Server Settings > Roles.`)], ephemeral: true });
        }
        await member.roles.add(addRole).catch(() => {});
      }
      if (removeRole) {
        await member.roles.remove(removeRole).catch(() => {});
      }

      updateRecord(guild.id, target.id, record => {
        record.history.push({
          type: isPromotion ? 'promote' : 'demote',
          rank,
          reason,
          issuedBy: interaction.user.id,
          timestamp: Date.now()
        });
        return record;
      });

      const embed = new EmbedBuilder()
        .setColor(isPromotion ? COLORS.success : COLORS.danger)
        .setTitle(isPromotion ? '⬆️ Staff Promotion' : '⬇️ Staff Demotion')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Staff Member', value: `${target} (\`${target.id}\`)`, inline: true },
          { name: 'New Rank', value: rank, inline: true },
          { name: isPromotion ? 'Promoted By' : 'Demoted By', value: `${interaction.user}`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      const logStatus = await logToChannel(guild, embed, interaction.channel.id);
      await dmUser(target, EmbedBuilder.from(embed).setDescription(`This happened in **${guild.name}**.`));

      if (logStatus === 'not-configured') {
        embed.setFooter({ text: '⚠️ No staff log channel is configured — use /staff setlogchannel so these are recorded somewhere visible.' });
      }
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'strike') {
      const reason = interaction.options.getString('reason');
      const record = updateRecord(guild.id, target.id, r => {
        r.strikes.push({ reason, issuedBy: interaction.user.id, timestamp: Date.now() });
        r.history.push({ type: 'strike', reason, issuedBy: interaction.user.id, timestamp: Date.now() });
        return r;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('⚠️ Staff Strike Issued')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Staff Member', value: `${target} (\`${target.id}\`)`, inline: true },
          { name: 'Issued By', value: `${interaction.user}`, inline: true },
          { name: 'Total Strikes', value: `${record.strikes.length}`, inline: true },
          { name: 'Reason', value: reason }
        )
        .setTimestamp();

      const logStatus = await logToChannel(guild, embed, interaction.channel.id);
      await dmUser(target, EmbedBuilder.from(embed).setDescription(`You received a strike in **${guild.name}**.`));

      if (logStatus === 'not-configured') {
        embed.setFooter({ text: '⚠️ No staff log channel is configured — use /staff setlogchannel so these are recorded somewhere visible.' });
      }
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'removestrike') {
      const number = interaction.options.getInteger('number');
      const record = getRecord(guild.id, target.id);
      if (number < 1 || number > record.strikes.length) {
        return interaction.reply({ embeds: [errorEmbed('Invalid strike number. Use `/staff strikes` to see valid numbers.')], ephemeral: true });
      }
      const [removed] = record.strikes.splice(number - 1, 1);
      updateRecord(guild.id, target.id, r => {
        r.strikes = record.strikes;
        r.history.push({ type: 'strike_removed', reason: removed.reason, issuedBy: interaction.user.id, timestamp: Date.now() });
        return r;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🗑️ Strike Removed')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Staff Member', value: `${target} (\`${target.id}\`)`, inline: true },
          { name: 'Removed By', value: `${interaction.user}`, inline: true },
          { name: 'Remaining Strikes', value: `${record.strikes.length}`, inline: true },
          { name: 'Removed Strike Reason', value: removed.reason }
        )
        .setTimestamp();

      await logToChannel(guild, embed, interaction.channel.id);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'clearstrikes') {
      const record = getRecord(guild.id, target.id);
      const count = record.strikes.length;
      updateRecord(guild.id, target.id, r => {
        r.strikes = [];
        r.history.push({ type: 'strikes_cleared', reason: `Cleared ${count} strike(s)`, issuedBy: interaction.user.id, timestamp: Date.now() });
        return r;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🧹 Strikes Cleared')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'Staff Member', value: `${target} (\`${target.id}\`)`, inline: true },
          { name: 'Cleared By', value: `${interaction.user}`, inline: true },
          { name: 'Strikes Cleared', value: `${count}`, inline: true }
        )
        .setTimestamp();

      await logToChannel(guild, embed, interaction.channel.id);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'strikes') {
      const record = getRecord(guild.id, target.id);
      if (record.strikes.length === 0) {
        return interaction.reply({ embeds: [successEmbed(`${target} has no strikes.`)] });
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`Strikes for ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .setDescription(record.strikes.map((s, i) => `**${i + 1}.** ${s.reason} — issued by <@${s.issuedBy}> (<t:${Math.floor(s.timestamp / 1000)}:R>)`).join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'history') {
      const record = getRecord(guild.id, target.id);
      if (record.history.length === 0) {
        return interaction.reply({ embeds: [successEmbed(`${target} has no staff history yet.`)] });
      }
      const icons = { promote: '⬆️', demote: '⬇️', strike: '⚠️', strike_removed: '🗑️', strikes_cleared: '🧹' };
      const sorted = [...record.history].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`Staff History — ${target.tag}`)
        .setThumbnail(target.displayAvatarURL())
        .setDescription(
          sorted.map(h => {
            const icon = icons[h.type] || '•';
            const label = h.type === 'promote' || h.type === 'demote' ? `${h.type === 'promote' ? 'Promoted' : 'Demoted'} to **${h.rank}**` : h.reason;
            return `${icon} ${label} — by <@${h.issuedBy}> (<t:${Math.floor(h.timestamp / 1000)}:R>)`;
          }).join('\n')
        )
        .setFooter({ text: record.history.length > 20 ? `Showing 20 most recent of ${record.history.length} total entries` : `${record.history.length} total entries` });
      return interaction.reply({ embeds: [embed] });
    }
  }
};
