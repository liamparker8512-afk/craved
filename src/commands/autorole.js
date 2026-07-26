const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Admin-only: automatically give new members a role when they join')
    .addSubcommand(s => s.setName('add').setDescription('Add a role to be given automatically on join')
      .addRoleOption(o => o.setName('role').setDescription('Role to auto-assign').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Stop auto-assigning a role')
      .addRoleOption(o => o.setName('role').setDescription('Role to remove from auto-assign').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all current auto-roles'))
    .addSubcommand(s => s.setName('includebots').setDescription('Choose whether bots also receive auto-roles when they join')
      .addBooleanOption(o => o.setName('enabled').setDescription('True to include bots, false to only give roles to humans').setRequired(true)))
    .addSubcommand(s => s.setName('delay').setDescription('Set a delay before the role is given (0 to disable, useful against raid bots)')
      .addIntegerOption(o => o.setName('seconds').setDescription('Seconds to wait after joining before assigning the role').setRequired(true))),

  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.guild.id)) {
      return interaction.reply({
        embeds: [errorEmbed('Only the server owner, Administrators, or someone with the configured Admin role can manage auto-roles.')],
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const role = interaction.options.getRole('role');

      if (role.managed) {
        return interaction.reply({ embeds: [errorEmbed(`${role} is managed by an integration/bot and can't be assigned manually.`)], ephemeral: true });
      }
      const botMember = interaction.guild.members.me;
      if (role.position >= botMember.roles.highest.position) {
        return interaction.reply({ embeds: [errorEmbed(`I can't assign ${role} — move my role above it in Server Settings > Roles.`)], ephemeral: true });
      }

      const cfg = db.guildConfig.get(guildId, {});
      const autoRoleIds = cfg.autoRoleIds || [];
      if (autoRoleIds.includes(role.id)) {
        return interaction.reply({ embeds: [errorEmbed(`${role} is already an auto-role.`)], ephemeral: true });
      }
      autoRoleIds.push(role.id);
      db.guildConfig.update(guildId, c => ({ ...c, autoRoleIds }));

      return interaction.reply({
        embeds: [successEmbed(`${role} will now be automatically given to new members. Turn the feature on with \`/panel\` if you haven't already (Feature Toggles → Auto Role).`)]
      });
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      const cfg = db.guildConfig.get(guildId, {});
      const autoRoleIds = (cfg.autoRoleIds || []).filter(id => id !== role.id);
      db.guildConfig.update(guildId, c => ({ ...c, autoRoleIds }));
      return interaction.reply({ embeds: [successEmbed(`${role} has been removed from auto-roles.`)] });
    }

    if (sub === 'list') {
      const cfg = db.guildConfig.get(guildId, {});
      const autoRoleIds = cfg.autoRoleIds || [];
      if (autoRoleIds.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No auto-roles configured yet. Add one with `/autorole add`.')] });
      }
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🎭 Auto-Roles')
        .setDescription(autoRoleIds.map(id => `<@&${id}>`).join('\n'))
        .addFields(
          { name: 'Includes bots?', value: cfg.autoRoleIncludeBots ? 'Yes' : 'No', inline: true },
          { name: 'Delay', value: cfg.autoRoleDelaySeconds ? `${cfg.autoRoleDelaySeconds}s` : 'None (instant)', inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'includebots') {
      const enabled = interaction.options.getBoolean('enabled');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, autoRoleIncludeBots: enabled }));
      return interaction.reply({ embeds: [successEmbed(`Auto-roles will ${enabled ? 'now' : 'no longer'} be given to bots that join.`)] });
    }

    if (sub === 'delay') {
      const seconds = interaction.options.getInteger('seconds');
      if (seconds < 0) {
        return interaction.reply({ embeds: [errorEmbed('Delay cannot be negative.')], ephemeral: true });
      }
      db.guildConfig.update(guildId, cfg => ({ ...cfg, autoRoleDelaySeconds: seconds }));
      return interaction.reply({ embeds: [successEmbed(seconds === 0 ? 'Auto-roles will be given instantly on join.' : `Auto-roles will now be given ${seconds} second(s) after a member joins.`)] });
    }
  }
};
