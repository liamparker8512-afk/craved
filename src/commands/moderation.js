const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');

async function logAction(guild, description) {
  const cfg = db.guildConfig.get(guild.id, {});
  if (!cfg.logChannelId) return;
  const channel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (!channel) return;
  const embed = new EmbedBuilder().setColor(COLORS.warning).setDescription(description).setTimestamp();
  channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s.setName('ban').setDescription('Ban a member')
      .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('kick').setDescription('Kick a member')
      .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('timeout').setDescription('Timeout (mute) a member')
      .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
      .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)))
    .addSubcommand(s => s.setName('untimeout').setDescription('Remove timeout from a member')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('warn').setDescription('Warn a member')
      .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand(s => s.setName('warnings').setDescription('View a member\'s warnings')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('clearwarnings').setDescription('Clear a member\'s warnings')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('purge').setDescription('Bulk delete messages')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock the current channel'))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock the current channel'))
    .addSubcommand(s => s.setName('slowmode').setDescription('Set channel slowmode')
      .addIntegerOption(o => o.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'ban') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member && !member.bannable) {
        return interaction.reply({ embeds: [errorEmbed('I cannot ban this user (role hierarchy or missing permissions).')], ephemeral: true });
      }
      await guild.members.ban(user.id, { reason: `${reason} | By ${interaction.user.tag}` });
      await logAction(guild, `🔨 **${user.tag}** was banned by ${interaction.user} | Reason: ${reason}`);
      return interaction.reply({ embeds: [successEmbed(`**${user.tag}** has been banned. Reason: ${reason}`)] });
    }

    if (sub === 'kick') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });
      if (!member.kickable) return interaction.reply({ embeds: [errorEmbed('I cannot kick this user (role hierarchy or missing permissions).')], ephemeral: true });
      await member.kick(`${reason} | By ${interaction.user.tag}`);
      await logAction(guild, `👢 **${user.tag}** was kicked by ${interaction.user} | Reason: ${reason}`);
      return interaction.reply({ embeds: [successEmbed(`**${user.tag}** has been kicked. Reason: ${reason}`)] });
    }

    if (sub === 'timeout') {
      const user = interaction.options.getUser('user');
      const minutes = interaction.options.getInteger('minutes');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });
      if (!member.moderatable) return interaction.reply({ embeds: [errorEmbed('I cannot timeout this user (role hierarchy or missing permissions).')], ephemeral: true });
      await member.timeout(minutes * 60 * 1000, `${reason} | By ${interaction.user.tag}`);
      await logAction(guild, `🔇 **${user.tag}** was timed out for ${minutes}m by ${interaction.user} | Reason: ${reason}`);
      return interaction.reply({ embeds: [successEmbed(`**${user.tag}** has been timed out for ${minutes} minute(s). Reason: ${reason}`)] });
    }

    if (sub === 'untimeout') {
      const user = interaction.options.getUser('user');
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });
      await member.timeout(null, `Timeout removed by ${interaction.user.tag}`);
      return interaction.reply({ embeds: [successEmbed(`Timeout removed for **${user.tag}**.`)] });
    }

    if (sub === 'warn') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const key = `${guild.id}-${user.id}`;
      const list = db.warnings.get(key, []);
      list.push({ reason, moderatorId: interaction.user.id, timestamp: Date.now() });
      db.warnings.set(key, list);
      await logAction(guild, `⚠️ **${user.tag}** was warned by ${interaction.user} | Reason: ${reason}`);
      return interaction.reply({ embeds: [successEmbed(`**${user.tag}** has been warned. Reason: ${reason} (${list.length} total warning(s))`)] });
    }

    if (sub === 'warnings') {
      const user = interaction.options.getUser('user');
      const key = `${guild.id}-${user.id}`;
      const list = db.warnings.get(key, []);
      if (list.length === 0) {
        return interaction.reply({ embeds: [successEmbed(`**${user.tag}** has no warnings.`)] });
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`Warnings for ${user.tag}`)
        .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderatorId}> (<t:${Math.floor(w.timestamp / 1000)}:R>)`).join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'clearwarnings') {
      const user = interaction.options.getUser('user');
      const key = `${guild.id}-${user.id}`;
      db.warnings.set(key, []);
      return interaction.reply({ embeds: [successEmbed(`Cleared all warnings for **${user.tag}**.`)] });
    }

    if (sub === 'purge') {
      const amount = interaction.options.getInteger('amount');
      if (amount < 1 || amount > 100) {
        return interaction.reply({ embeds: [errorEmbed('Amount must be between 1 and 100.')], ephemeral: true });
      }
      const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
      return interaction.reply({ embeds: [successEmbed(`Deleted ${deleted ? deleted.size : 0} message(s).`)], ephemeral: true });
    }

    if (sub === 'lock') {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      return interaction.reply({ embeds: [successEmbed('🔒 Channel locked.')] });
    }

    if (sub === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
      return interaction.reply({ embeds: [successEmbed('🔓 Channel unlocked.')] });
    }

    if (sub === 'slowmode') {
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({ embeds: [successEmbed(seconds === 0 ? 'Slowmode disabled.' : `Slowmode set to ${seconds}s.`)] });
    }
  }
};
