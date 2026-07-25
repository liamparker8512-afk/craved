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

const QUESTION_TIME_LIMIT = 5 * 60 * 1000;
const MAX_ANSWER_LENGTH = 1000;

const inProgress = new Set();

function getConfig(guildId) {
  const cfg = db.guildConfig.get(guildId, {});
  return {
    questions: cfg.applicationQuestions || [],
    channelId: cfg.applicationChannelId || null,
    acceptRoleId: cfg.applicationAcceptRoleId || null,
    open: cfg.applicationsOpen !== false
  };
}

function reviewButtons(submissionId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${submissionId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`app_deny_${submissionId}`)
      .setLabel('Deny')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
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
    return interaction.reply({ embeds: [errorEmbed('No application questions have been configured yet.')], ephemeral: true });
  }

  if (!cfg.channelId) {
    return interaction.reply({ embeds: [errorEmbed('The application review channel has not been configured yet.')], ephemeral: true });
  }

  if (inProgress.has(trackKey)) {
    return interaction.reply({ embeds: [errorEmbed('You already have an application in progress.')], ephemeral: true });
  }

  const existing = Object.values(db.applications.all()).find(
    a => a.guildId === guild.id &&
      a.userId === user.id &&
      a.status === 'pending'
  );

  if (existing) {
    return interaction.reply({ embeds: [errorEmbed('You already have a pending application.')], ephemeral: true });
  }

  let dmChannel;

  try {
    dmChannel = await user.createDM();

    await dmChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`📝 Application — ${guild.name}`)
          .setDescription(
            `You will be asked **${cfg.questions.length} question(s)**.\n\n` +
            `Reply normally with your answers.\n` +
            `You have **5 minutes per question**.`
          )
      ]
    });

  } catch {
    return interaction.reply({
      embeds: [errorEmbed('I could not DM you. Please enable DMs and try again.')],
      ephemeral: true
    });
  }

  await interaction.reply({
    embeds: [successEmbed('Check your DMs — your application has started!')],
    ephemeral: true
  });

  inProgress.add(trackKey);

  const answers = [];

  try {

    for (let i = 0; i < cfg.questions.length; i++) {

      const question = cfg.questions[i];

      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(`Question ${i + 1}/${cfg.questions.length}`)
            .setDescription(question)
        ]
      });


      const collected = await dmChannel.awaitMessages({
        filter: msg =>
          msg.author.id === user.id &&
          !msg.author.bot,
        max: 1,
        time: QUESTION_TIME_LIMIT
      });


      if (collected.size === 0) {
        throw new Error('timeout');
      }


      const answer = collected.first().content
        .trim()
        .slice(0, MAX_ANSWER_LENGTH)
        || '*(No text provided)*';


      answers.push({
        question,
        answer
      });
    }


  } catch {

    inProgress.delete(trackKey);

    await dmChannel.send({
      embeds: [
        errorEmbed(
          'You took too long to answer. Your application has been cancelled.'
        )
      ]
    }).catch(() => {});

    return;
  }


  inProgress.delete(trackKey);


  await dmChannel.send({
    embeds: [
      successEmbed(
        '✅ Application completed!\n\nYour application has been sent to the staff team for review.'
      )
    ]
  }).catch(() => {});


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
    return dmChannel.send({
      embeds: [
        errorEmbed('Your application could not be delivered. Please contact staff.')
      ]
    });
  }


  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('📝 New Application')
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL()
    })
    .setDescription(
      `**Applicant:** ${user}\n\n` +
      `**Username:** ${user.tag}\n` +
      `**Display Name:** ${user.globalName || user.username}\n` +
      `**User ID:** \`${user.id}\`\n` +
      `**Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`
    )
    .addFields(
      answers.map((a, i) => ({
        name: `${i + 1}. ${a.question}`.slice(0, 256),
        value: a.answer.slice(0, 1024) || '—'
      }))
    )
    .setFooter({
      text: `Submission ID: ${submissionId}`
    })
    .setTimestamp();


  await reviewChannel.send({
    embeds: [embed],
    components: [reviewButtons(submissionId)]
  });


  await dmChannel.send({
    embeds: [
      successEmbed(
        'Your application has been submitted! Staff will review it and contact you.'
      )
    ]
  }).catch(() => {});
}


async function handleAccept(interaction, submissionId) {
  if (!isServerStaff(interaction.member, interaction.guild.id)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to review applications.')], ephemeral: true });
  }

  const submission = db.applications.get(submissionId);

  if (!submission || submission.status !== 'pending') {
    return interaction.reply({ embeds: [errorEmbed('This application has already been reviewed.')], ephemeral: true });
  }

  db.applications.update(submissionId, s => ({
    ...s,
    status: 'accepted',
    reviewedBy: interaction.user.id,
    reviewedAt: Date.now()
  }));

  const cfg = getConfig(interaction.guild.id);

  const applicant = await interaction.guild.members.fetch(submission.userId).catch(() => null);

  if (applicant && cfg.acceptRoleId) {
    await applicant.roles.add(cfg.acceptRoleId).catch(() => {});
  }

  const user = await interaction.client.users.fetch(submission.userId).catch(() => null);

  if (user) {
    await user.send({
      embeds: [
        successEmbed(`Your application for **${interaction.guild.name}** has been accepted! 🎉`)
      ]
    }).catch(() => {});
  }

  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(COLORS.success)
    .setDescription(
      `${interaction.message.embeds[0].description}\n\n✅ **Accepted** by ${interaction.user}`
    );

  await interaction.update({
    embeds: [updatedEmbed],
    components: [reviewButtons(submissionId, true)]
  });
}


function denyModal(submissionId) {
  const modal = new ModalBuilder()
    .setCustomId(`app_deny_modal_${submissionId}`)
    .setTitle('Deny Application');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return modal;
}


async function handleDenyButton(interaction, submissionId) {
  if (!isServerStaff(interaction.member, interaction.guild.id)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to review applications.')], ephemeral: true });
  }

  return interaction.showModal(denyModal(submissionId));
}


async function handleDenyModalSubmit(interaction, submissionId) {
  const submission = db.applications.get(submissionId);

  if (!submission) {
    return interaction.reply({
      embeds: [errorEmbed('Application not found.')],
      ephemeral: true
    });
  }

  const reason =
    interaction.fields.getTextInputValue('reason') ||
    'No reason provided.';


  db.applications.update(submissionId, s => ({
    ...s,
    status: 'denied',
    reviewedBy: interaction.user.id,
    reviewedAt: Date.now(),
    reason
  }));


  const user = await interaction.client.users.fetch(submission.userId).catch(() => null);

  if (user) {
    await user.send({
      embeds: [
        errorEmbed(
          `Your application for **${interaction.guild.name}** was denied.\n\nReason: ${reason}`
        )
      ]
    }).catch(() => {});
  }


  const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(COLORS.danger)
    .setDescription(
      `${interaction.message.embeds[0].description}\n\n❌ **Denied** by ${interaction.user}\n**Reason:** ${reason}`
    );


  await interaction.update({
    embeds: [updatedEmbed],
    components: [reviewButtons(submissionId, true)]
  });
}


module.exports = {
  startApplication,
  handleAccept,
  handleDenyButton,
  handleDenyModalSubmit,
  getConfig
};
