const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');

function parseDuration(input) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(input.trim());
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

function giveawayButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway_enter').setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Primary)
  );
}

async function endGiveaway(client, messageId, forceReroll = false) {
  const g = db.giveaways.get(messageId);
  if (!g) return null;
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return null;

  const entrants = g.entrants || [];
  let winners = [];
  if (entrants.length > 0) {
    const pool = [...entrants];
    for (let i = 0; i < Math.min(g.winnerCount, pool.length); i++) {
      const idx = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }
  }

  const resultEmbed = EmbedBuilder.from(message.embeds[0])
    .setDescription(
      winners.length > 0
        ? `🎉 Winner(s): ${winners.map(w => `<@${w}>`).join(', ')}\n\n**Prize:** ${g.prize}`
        : `No valid entries — no winner could be determined.\n\n**Prize:** ${g.prize}`
    )
    .setColor(COLORS.warning);

  await message.edit({ embeds: [resultEmbed], components: [] });

  if (winners.length > 0) {
    await channel.send({
      content: `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${g.prize}**!`
    });
  } else {
    await channel.send('No one entered the giveaway, so no winner could be selected.');
  }

  db.giveaways.update(messageId, gv => ({ ...gv, status: 'ended', winners }));
  return winners;
}

module.exports = {
  parseDuration,
  giveawayButtons,
  endGiveaway,
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('start').setDescription('Start a giveaway')
      .addStringOption(o => o.setName('duration').setDescription('e.g. 30s, 10m, 2h, 1d').setRequired(true))
      .addStringOption(o => o.setName('prize').setDescription('What is being given away').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(false)))
    .addSubcommand(s => s.setName('end').setDescription('End a giveaway early')
      .addStringOption(o => o.setName('message_id').setDescription('The giveaway message ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll').setDescription('Reroll a giveaway winner')
      .addStringOption(o => o.setName('message_id').setDescription('The giveaway message ID').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const durationStr = interaction.options.getString('duration');
      const prize = interaction.options.getString('prize');
      const winnerCount = interaction.options.getInteger('winners') || 1;
      const ms = parseDuration(durationStr);
      if (!ms || ms < 5000) {
        return interaction.reply({ embeds: [errorEmbed('Invalid duration. Use a format like `30s`, `10m`, `2h`, or `1d`.')], ephemeral: true });
      }

      const endsAt = Date.now() + ms;
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🎉 Giveaway!')
        .setDescription(`**Prize:** ${prize}\nClick the button below to enter!\nEnds: <t:${Math.floor(endsAt / 1000)}:R>\nWinners: **${winnerCount}**`)
        .setFooter({ text: `Hosted by ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed], components: [giveawayButtons()] });
      const message = await interaction.fetchReply();

      db.giveaways.set(message.id, {
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        prize,
        winnerCount,
        endsAt,
        entrants: [],
        status: 'active',
        hostId: interaction.user.id
      });

      setTimeout(() => {
        endGiveaway(interaction.client, message.id).catch(console.error);
      }, ms);
      return;
    }

    if (sub === 'end') {
      const messageId = interaction.options.getString('message_id');
      const g = db.giveaways.get(messageId);
      if (!g || g.status !== 'active') {
        return interaction.reply({ embeds: [errorEmbed('No active giveaway found with that message ID.')], ephemeral: true });
      }
      await endGiveaway(interaction.client, messageId);
      return interaction.reply({ embeds: [successEmbed('Giveaway ended.')], ephemeral: true });
    }

    if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id');
      const g = db.giveaways.get(messageId);
      if (!g || g.status !== 'ended') {
        return interaction.reply({ embeds: [errorEmbed('No ended giveaway found with that message ID.')], ephemeral: true });
      }
      const entrants = g.entrants || [];
      if (entrants.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No entrants to reroll from.')], ephemeral: true });
      }
      const winner = entrants[Math.floor(Math.random() * entrants.length)];
      const channel = await interaction.guild.channels.fetch(g.channelId).catch(() => null);
      if (channel) await channel.send(`🎉 New winner for **${g.prize}**: <@${winner}>!`);
      return interaction.reply({ embeds: [successEmbed('Rerolled successfully.')], ephemeral: true });
    }
  }
};
