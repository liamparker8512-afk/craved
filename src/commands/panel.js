const { SlashCommandBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { errorEmbed } = require('../utils/embeds');
const panelHandler = require('../handlers/panelHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Open the admin control panel to toggle features and configure roles/channels'),

  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.guild.id)) {
      return interaction.reply({
        embeds: [errorEmbed('Only the server owner, Administrators, or someone with the configured Admin role can open the panel.')],
        ephemeral: true
      });
    }
    const { embed, components } = panelHandler.renderPage(interaction.guild, 'features');
    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
};
