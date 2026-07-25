const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const db = require('../database');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');
const { isServerStaff } = require('../utils/permissions');
const { categories } = require('../commands/ticket');

function controlButtons(claimed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimed ? 'Claimed' : 'Claim')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🙋')
      .setDisabled(!!claimed),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
  return row;
}

async function createTicket(interaction, categoryKey) {
  const guild = interaction.guild;
  const cfg = db.guildConfig.get(guild.id, {});

  if (!cfg.ticketCategoryId || !cfg.staffRoleId) {
    return interaction.reply({
      embeds: [errorEmbed('The ticket system has not been set up yet. Ask an admin to run `/ticket setup` first.')],
      ephemeral: true
    });
  }

  const meta = categories[categoryKey];
  if (!meta) {
    return interaction.reply({ embeds: [errorEmbed('Unknown ticket category.')], ephemeral: true });
  }

  // Prevent duplicate open tickets of the same category for the same user
  const allTickets = db.tickets.all();
  const existing = Object.entries(allTickets).find(
    ([, t]) => t.guildId === guild.id && t.userId === interaction.user.id && t.category === categoryKey && t.status === 'open'
  );
  if (existing) {
    return interaction.reply({
      embeds: [errorEmbed(`You already have an open **${meta.label}** ticket: <#${existing[0]}>`)],
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const counter = (cfg.ticketCounter || 0) + 1;
  db.guildConfig.update(guild.id, c => ({ ...c, ticketCounter: counter }));

  const channelName = `${meta.label.toLowerCase().replace(/\s+/g, '-')}-${counter}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: cfg.staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      }
    ]
  });

  db.tickets.set(channel.id, {
    guildId: guild.id,
    userId: interaction.user.id,
    category: categoryKey,
    status: 'open',
    claimedBy: null,
    createdAt: Date.now()
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(
      `Hello ${interaction.user}, thanks for reaching out.\n\n` +
      `Please describe your issue in as much detail as possible (include usernames, evidence, or screenshots if relevant). ` +
      `A member of staff (<@&${cfg.staffRoleId}>) will be with you shortly.`
    )
    .setFooter({ text: `Ticket #${counter} • ${meta.label}` });

  await channel.send({
    content: `${interaction.user} | <@&${cfg.staffRoleId}>`,
    embeds: [embed],
    components: [controlButtons(false)]
  });

  await interaction.editReply({ embeds: [successEmbed(`Your ticket has been created: ${channel}`)] });
}

async function claimTicket(interaction) {
  const ticketData = db.tickets.get(interaction.channel.id);
  if (!ticketData) {
    return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
  }
  if (!isServerStaff(interaction.member, interaction.guild.id)) {
    return interaction.reply({ embeds: [errorEmbed('Only staff can claim tickets.')], ephemeral: true });
  }
  if (ticketData.claimedBy) {
    return interaction.reply({ embeds: [errorEmbed(`This ticket has already been claimed by <@${ticketData.claimedBy}>.`)], ephemeral: true });
  }

  db.tickets.update(interaction.channel.id, t => ({ ...t, claimedBy: interaction.user.id }));

  const msg = interaction.message;
  await msg.edit({ components: [controlButtons(true)] });

  return interaction.reply({ embeds: [successEmbed(`🙋 Ticket claimed by ${interaction.user}.`)] });
}

async function closeTicket(interaction) {
  const ticketData = db.tickets.get(interaction.channel.id);
  if (!ticketData) {
    return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
  }
  if (!isServerStaff(interaction.member, interaction.guild.id) && interaction.user.id !== ticketData.userId) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to close this ticket.')], ephemeral: true });
  }

  await interaction.reply({ embeds: [successEmbed('🔒 Closing this ticket and generating a transcript... this channel will be deleted in 5 seconds.')] });

  // Build a plain-text transcript
  const cfg = db.guildConfig.get(interaction.guild.id, {});
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    const lines = sorted.map(m => {
      const time = new Date(m.createdTimestamp).toISOString();
      const content = m.content || '[embed/attachment]';
      return `[${time}] ${m.author.tag} (${m.author.id}): ${content}`;
    });
    const transcriptText = lines.join('\n') || 'No messages.';

    if (cfg.transcriptChannelId) {
      const logChannel = await interaction.guild.channels.fetch(cfg.transcriptChannelId).catch(() => null);
      if (logChannel) {
        const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), { name: `transcript-${interaction.channel.name}.txt` });
        const meta = categories[ticketData.category] || { label: ticketData.category };
        const summary = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('Ticket Closed')
          .addFields(
            { name: 'Ticket', value: `#${interaction.channel.name}`, inline: true },
            { name: 'Category', value: meta.label, inline: true },
            { name: 'Opened by', value: `<@${ticketData.userId}>`, inline: true },
            { name: 'Claimed by', value: ticketData.claimedBy ? `<@${ticketData.claimedBy}>` : 'Unclaimed', inline: true },
            { name: 'Closed by', value: `${interaction.user}`, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [summary], files: [attachment] });
      }
    }
  } catch (e) {
    console.error('Failed to generate transcript:', e);
  }

  db.tickets.update(interaction.channel.id, t => ({ ...t, status: 'closed', closedAt: Date.now(), closedBy: interaction.user.id }));

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 5000);
}

module.exports = { createTicket, claimTicket, closeTicket, controlButtons };
