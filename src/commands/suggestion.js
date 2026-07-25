const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a suggestion for the server/game')
    .addStringOption(o => o.setName('suggestion').setDescription('Your suggestion').setRequired(true)),

  async execute(interaction) {
    const cfg = db.guildConfig.get(interaction.guild.id, {});
    const channelId = cfg.suggestionChannelId || interaction.channel.id;
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.reply({ embeds: [errorEmbed('Suggestions channel is not configured properly. Ask an admin to set it with `/config suggestions`.')], ephemeral: true });
    }

    const text = interaction.options.getString('suggestion');
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(text)
      .setFooter({ text: 'React below to vote!' })
      .setTimestamp();

    const message = await channel.send({ embeds: [embed] });
    await message.react('👍');
    await message.react('👎');

    return interaction.reply({ content: `Your suggestion was posted in ${channel}!`, ephemeral: true });
  }
};
