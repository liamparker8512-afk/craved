const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');
const { isServerStaff } = require('../utils/permissions');

const TICKET_CATEGORIES = {
  exploiter_report: { label: 'Exploiter Report', emoji: '🛡️', description: 'Report a player exploiting/cheating in-game' },
  staff_report: { label: 'Staff Report', emoji: '🚨', description: 'Report a staff member for misconduct' },
  appeal: { label: 'Appeal', emoji: '📄', description: 'Appeal a ban, mute, or other punishment' },
  other: { label: 'Other', emoji: '❓', description: 'Anything else you need help with' }
};

module.exports = {
  categories: TICKET_CATEGORIES,
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Post the ticket creation panel in this channel')
        .addChannelOption(opt =>
          opt.setName('category')
            .setDescription('Category channels for new tickets should be created under')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true))
        .addRoleOption(opt =>
          opt.setName('staff_role')
            .setDescription('Role that can see and manage tickets')
            .setRequired(true))
        .addChannelOption(opt =>
          opt.setName('transcript_channel')
            .setDescription('Channel where ticket transcripts are logged')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a user from the current ticket')
        .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close the current ticket')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const category = interaction.options.getChannel('category');
      const staffRole = interaction.options.getRole('staff_role');
      const transcriptChannel = interaction.options.getChannel('transcript_channel');

      db.guildConfig.update(interaction.guild.id, cfg => ({
        ...cfg,
        ticketCategoryId: category.id,
        staffRoleId: staffRole.id,
        transcriptChannelId: transcriptChannel ? transcriptChannel.id : cfg.transcriptChannelId,
        ticketCounter: cfg.ticketCounter || 0
      }));

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🎫 Dai Hood Support')
        .setDescription(
          'Need help? Select an option below that matches your issue and a private ticket will be created for you.\n\n' +
          '🛡️ **Exploiter Report** — Report a player exploiting/cheating\n' +
          '🚨 **Staff Report** — Report a staff member for misconduct\n' +
          '📄 **Appeal** — Appeal a ban, mute, or other punishment\n' +
          '❓ **Other** — Anything else you need help with'
        )
        .setFooter({ text: 'Please only open one ticket at a time per category.' });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_create_menu')
        .setPlaceholder('Select a reason to open a ticket')
        .addOptions(
          Object.entries(TICKET_CATEGORIES).map(([value, meta]) => ({
            label: meta.label,
            description: meta.description,
            value,
            emoji: meta.emoji
          }))
        );

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [successEmbed('Ticket panel has been posted.')], ephemeral: true });
    }

    if (sub === 'add' || sub === 'remove') {
      const ticketData = db.tickets.get(interaction.channel.id);
      if (!ticketData) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }
      if (!isServerStaff(interaction.member, interaction.guild.id) && interaction.user.id !== ticketData.userId) {
        return interaction.reply({ embeds: [errorEmbed('You do not have permission to manage this ticket.')], ephemeral: true });
      }
      const user = interaction.options.getUser('user');
      if (sub === 'add') {
        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
        return interaction.reply({ embeds: [successEmbed(`${user} has been added to the ticket.`)] });
      } else {
        await interaction.channel.permissionOverwrites.delete(user.id);
        return interaction.reply({ embeds: [successEmbed(`${user} has been removed from the ticket.`)] });
      }
    }

    if (sub === 'close') {
      const ticketModule = require('../handlers/ticketHandler');
      return ticketModule.closeTicket(interaction);
    }
  }
};
