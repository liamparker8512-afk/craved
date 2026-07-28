const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const db = require('../database');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');
const { isServerStaff } = require('../utils/permissions');

const QUESTION_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes per question
const MAX_ANSWER_LENGTH = 1000;

// Tracks users currently mid-application so they can't start a second one
// or get double-triggered by clicking Apply twice. Cleared when they finish/timeout/cancel.
const inProgress = new Set();

function getConfig(guildId) {
  const cfg = db.guildConfig.get(guildId, {});
  // Support both the new multi-role array and the old single-role field so
  // existing configurations keep working after this update.
  const acceptRoleIds = cfg.applicationAcceptRoleIds && cfg.applicationAcceptRoleIds.length > 0
    ? cfg.applicationAcceptRoleIds
    : (cfg.applicationAcceptRoleId ? [cfg.applicationAcceptRoleId] : []);
  const blacklistRoleIds = cfg.applicationBlacklistRoleIds && cfg.applicationBlacklistRoleIds.length > 0
    ? cfg.applicationBlacklistRoleIds
    : (cfg.applicationBlacklistRoleId ? [cfg.applicationBlacklistRoleId] : []);
  return {
    questions: cfg.applicationQuestions || [],
    channelId: cfg.applicationChannelId || null,
    acceptRoleIds,
    blacklistRoleIds,
    pingRoleId: cfg.applicationPingRoleId || null,
    open: cfg.applicationsOpen !== false
  };
}

function reviewButtons(submissionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_accept_${submissionId}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`app_deny_${submissionId}`).setLabel('Deny').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

async function startApplication(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  const cfg = getConfig(guild.id);
  const trackKey = `${guild.id}-${user.id}`;

  if (!cfg.open) {
    return interaction.reply({ embeds: [errorEmbed('Applications are currently closed on this server.')], ephemeral: true });
  }
  if (cfg.questions.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No application questions have been configured yet. Ask an admin to run `/application question add`.')], ephemeral: true });
  }
  if (!cfg.channelId) {
    return interaction.reply({ embeds: [errorEmbed('The application review channel has not been set up yet. Ask an admin to run `/application setup`.')], ephemeral: true });
  }
  if (cfg.blacklistRoleIds.length > 0 && interaction.member.roles.cache.some(r => cfg.blacklistRoleIds.includes(r.id))) {
    return interaction.reply({ embeds: [errorEmbed('You are not able to apply at this time.')], ephemeral: true });
  }
  if (inProgress.has(trackKey)) {
    return interaction.reply({ embeds: [errorEmbed('You already have an application in progress in your DMs.')], ephemeral: true });
  }

  const existing = Object.values(db.applications.all()).find(
    a => a.guildId === guild.id && a.userId === user.id && a.status === 'pending'
  );
  if (existing) {
    return interaction.reply({ embeds: [errorEmbed('You already have a pending application awaiting review.')], ephemeral: true });
  }

  let dmChannel;
  try {
    dmChannel = await user.createDM();
    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`📝 Application — ${guild.name}`)
          .setDescription(`I'll ask you ${cfg.questions.length} question(s). Answer each one as a normal message here. You have ${QUESTION_TIME_LIMIT / 60000} minutes per question.`)
      ]
    });
  } catch (e) {
    return interaction.reply({ embeds: [errorEmbed('I couldn\'t DM you. Please enable direct messages from server members and try again.')], ephemeral: true });
  }

  await interaction.reply({ embeds: [successEmbed('Check your DMs — I\'ve sent you the application questions!')], ephemeral: true });

  inProgress.add(trackKey);
  const answers = [];

  try {
    for (let i = 0; i < cfg.questions.length; i++) {
      const question = cfg.questions[i];
      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(`Question ${i + 1} of ${cfg.questions.length}`)
            .setDescription(question)
        ]
      });

      const collected = await dmChannel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: QUESTION_TIME_LIMIT,
        errors: ['time']
      });

      const answer = collected.first().content.trim().slice(0, MAX_ANSWER_LENGTH) || '*(no text — attachment or empty message)*';
      answers.push({ question, answer });
    }
  } catch (e) {
    inProgress.delete(trackKey);
    await dmChannel.send({ embeds: [errorEmbed('You took too long to respond. Your application has been cancelled — feel free to start over.')] }).catch(() => {});
    return;
  }

  inProgress.delete(trackKey);

  const submissionId = `${guild.id}-${user.id}-${Date.now()}`;
  db.applications.set(submissionId, {
    guildId: guild.id,
    userId: user.id,
    answers,
    status: 'pending',
    submittedAt: Date.now()
  });

  const reviewChannel = await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!reviewChannel) {
    await dmChannel.send({ embeds: [errorEmbed('Your application couldn\'t be delivered — the review channel is missing. Please contact staff directly.')] }).catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('📝 New Application')
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setDescription(`Applicant: ${user} (\`${user.id}\`)`)
    .addFields(answers.map((a, i) => ({
      name: `${i + 1}. ${a.question}`.slice(0, 256),
      value: a.answer.slice(0, 1024) || '—'
    })))
    .setFooter({ text: `Submission ID: ${submissionId}` })
    .setTimestamp();

  const pingContent = cfg.pingRoleId ? `<@&${cfg.pingRoleId}>` : undefined;
  await reviewChannel.send({ content: pingContent, embeds: [embed], components: [reviewButtons(submissionId)] });
  await dmChannel.send({ embeds: [successEmbed('Your application has been submitted! Staff will review it and get back to you.')] }).catch(() => {});
}

async function handleAccept(interaction, submissionId) {
  if (!isServerStaff(interaction.member, interaction.guild.id)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to review applications.')], ephemeral: true });
  }
  const submission = db.applications.get(submissionId);
  if (!submission || submission.status !== 'pending') {
    return interaction.reply({ embeds: [errorEmbed('This application has already been reviewed.')], ephemeral: true });
  }

  db.applications.update(submissionId, s => ({ ...s, status: 'accepted', reviewedBy: interaction.user.id, reviewedAt: Date.now() }));

  const cfg = getConfig(interaction.guild.id);
  const applicant = await interaction.guild.members.fetch(submission.userId).catch(() => null);
  if (applicant && cfg.acceptRoleIds.length > 0) {
    await applicant.roles.add(cfg.acceptRoleIds).catch(() => {});
  }

  const user = await interaction.client.users.fetch(submission.userId).catch(() => null);
  if (user) {
    await user.send({ embeds: [successEmbed(`Your application for **${interaction.guild.name}** has been **accepted**! 🎉`)] }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(COLORS.success)
    .setDescription(`${interaction.message.embeds[0].description}\n\n✅ **Accepted** by ${interaction.user}`);

  await interaction.update({ embeds: [updatedEmbed], components: [reviewButtons(submissionId, true)] });
}

function denyModal(submissionId) {
  const modal = new ModalBuilder().setCustomId(`app_deny_modal_${submissionId}`).setTitle('Deny Application');
  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (sent to the applicant)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false)
    .setPlaceholder('Optional — leave blank to send a generic message');
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

async function handleDenyButton(interaction, submissionId) {
  if (!isServerStaff(interaction.member, interaction.guild.id)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to review applications.')], ephemeral: true });
  }
  const submission = db.applications.get(submissionId);
  if (!submission || submission.status !== 'pending') {
    return interaction.reply({ embeds: [errorEmbed('This application has already been reviewed.')], ephemeral: true });
  }
  return interaction.showModal(denyModal(submissionId));
}

async function handleDenyModalSubmit(interaction, submissionId) {
  const submission = db.applications.get(submissionId);
  if (!submission || submission.status !== 'pending') {
    return interaction.reply({ embeds: [errorEmbed('This application has already been reviewed.')], ephemeral: true });
  }

  const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided.';
  db.applications.update(submissionId, s => ({ ...s, status: 'denied', reviewedBy: interaction.user.id, reviewedAt: Date.now(), reason }));

  const user = await interaction.client.users.fetch(submission.userId).catch(() => null);
  if (user) {
    await user.send({ embeds: [errorEmbed(`Your application for **${interaction.guild.name}** was **denied**.\n\n**Reason:** ${reason}`)] }).catch(() => {});
  }

  const originalEmbed = interaction.message.embeds[0];
  const updatedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor(COLORS.danger)
    .setDescription(`${originalEmbed.description}\n\n❌ **Denied** by ${interaction.user}\n**Reason:** ${reason}`);

  await interaction.update({ embeds: [updatedEmbed], components: [reviewButtons(submissionId, true)] });
}

module.exports = { startApplication, handleAccept, handleDenyButton, handleDenyModalSubmit, getConfig };
