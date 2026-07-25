const { errorEmbed } = require('../utils/embeds');
const ticketHandler = require('../handlers/ticketHandler');
const panelHandler = require('../handlers/panelHandler');
const { isFeatureEnabled, FEATURES } = require('../utils/features');
const db = require('../database');

// Which slash command name is gated behind which feature toggle.
// Utility, config, and panel are always available since they're needed to manage the bot itself.
const COMMAND_FEATURE_MAP = {
  ticket: 'tickets',
  mod: 'moderation',
  economy: 'economy',
  level: 'leveling',
  giveaway: 'giveaways',
  suggest: 'suggestions'
};

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        const featureKey = COMMAND_FEATURE_MAP[interaction.commandName];
        if (featureKey && !isFeatureEnabled(interaction.guild.id, featureKey)) {
          const meta = FEATURES[featureKey];
          return interaction.reply({
            embeds: [errorEmbed(`The **${meta.label}** module is currently disabled on this server. An admin can re-enable it with \`/panel\`.`)],
            ephemeral: true
          });
        }

        try {
          await command.execute(interaction);
        } catch (err) {
          console.error(err);
          const payload = { embeds: [errorEmbed('Something went wrong while running that command.')], ephemeral: true };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload).catch(() => {});
          } else {
            await interaction.reply(payload).catch(() => {});
          }
        }
        return;
      }

      // Admin panel components (buttons + select menus)
      if (interaction.customId && interaction.customId.startsWith('panel_')) {
        return panelHandler.route(interaction);
      }

      // Ticket category select menu
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_create_menu') {
        if (!isFeatureEnabled(interaction.guild.id, 'tickets')) {
          return interaction.reply({ embeds: [errorEmbed('The ticket system is currently disabled on this server.')], ephemeral: true });
        }
        const categoryKey = interaction.values[0];
        await ticketHandler.createTicket(interaction, categoryKey);
        return;
      }

      // Buttons
      if (interaction.isButton()) {
        if (interaction.customId === 'ticket_claim' || interaction.customId === 'ticket_close') {
          if (!isFeatureEnabled(interaction.guild.id, 'tickets')) {
            return interaction.reply({ embeds: [errorEmbed('The ticket system is currently disabled on this server.')], ephemeral: true });
          }
          return interaction.customId === 'ticket_claim' ? ticketHandler.claimTicket(interaction) : ticketHandler.closeTicket(interaction);
        }
        if (interaction.customId === 'giveaway_enter') {
          if (!isFeatureEnabled(interaction.guild.id, 'giveaways')) {
            return interaction.reply({ embeds: [errorEmbed('Giveaways are currently disabled on this server.')], ephemeral: true });
          }
          const g = db.giveaways.get(interaction.message.id);
          if (!g || g.status !== 'active') {
            return interaction.reply({ embeds: [errorEmbed('This giveaway has ended.')], ephemeral: true });
          }
          const entrants = g.entrants || [];
          if (entrants.includes(interaction.user.id)) {
            db.giveaways.update(interaction.message.id, gv => ({
              ...gv,
              entrants: gv.entrants.filter(id => id !== interaction.user.id)
            }));
            return interaction.reply({ content: '❌ You left the giveaway.', ephemeral: true });
          } else {
            db.giveaways.update(interaction.message.id, gv => ({
              ...gv,
              entrants: [...(gv.entrants || []), interaction.user.id]
            }));
            return interaction.reply({ content: '🎉 You entered the giveaway! Click again to leave.', ephemeral: true });
          }
        }
        // Reaction role buttons: customId format "rr_<roleId>"
        if (interaction.customId.startsWith('rr_')) {
          if (!isFeatureEnabled(interaction.guild.id, 'reactionroles')) {
            return interaction.reply({ embeds: [errorEmbed('Reaction roles are currently disabled on this server.')], ephemeral: true });
          }
          const roleId = interaction.customId.slice(3);
          const member = interaction.member;
          const hasRole = member.roles.cache.has(roleId);
          if (hasRole) {
            await member.roles.remove(roleId).catch(() => {});
            return interaction.reply({ content: `Removed <@&${roleId}>.`, ephemeral: true });
          } else {
            await member.roles.add(roleId).catch(() => {});
            return interaction.reply({ content: `Gave you <@&${roleId}>.`, ephemeral: true });
          }
        }
      }
    } catch (err) {
      console.error('Unhandled interaction error:', err);
    }
  }
};
