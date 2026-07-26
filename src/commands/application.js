const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');
const applicationHandler = require('../handlers/applicationHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Staff/whitelist application system')
    .addSubcommand(s => s.setName('setup').setDescription('Configure where applications get reviewed')
      .addChannelOption(o => o.setName('review_channel').addChannelTypes(ChannelType.GuildText).setDescription('Channel where submitted applications appear').setRequired(true))
      .addRoleOption(o => o.setName('accept_role').setDescription('Role given automatically when an application is accepted').setRequired(false))
      .addRoleOption(o => o.setName('accept_role_2').setDescription('A second role to also give on acceptance (optional)').setRequired(false)))
    .addSubcommandGroup(g => g.setName('question')
      .setDescription('Manage application questions')
      .addSubcommand(s => s.setName('add').setDescription('Add a question to the application form')
        .addStringOption(o => o.setName('text').setDescription('The question to ask').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a question by its number')
        .addIntegerOption(o => o.setName('number').setDescription('Question number (see /application question list)').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all current application questions')))
    .addSubcommandGroup(g => g.setName('blacklist')
      .setDescription('Manage roles that are barred from applying')
      .addSubcommand(s => s.setName('add').setDescription('Prevent members with a role from applying')
        .addRoleOption(o => o.setName('role').setDescription('Role to blacklist').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Allow a previously blacklisted role to apply again')
        .addRoleOption(o => o.setName('role').setDescription('Role to remove from the blacklist').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all currently blacklisted roles')))
    .addSubcommand(s => s.setName('toggle').setDescription('Open or close applications')
      .addBooleanOption(o => o.setName('open').setDescription('True to accept new applications, false to close them').setRequired(true)))
    .addSubcommand(s => s.setName('panel').setDescription('Post an Apply Now button in this channel'))
    .addSubcommand(s => s.setName('apply').setDescription('Start an application right now (DMs you the questions)')),

  // Discord only lets setDefaultMemberPermissions apply to the whole /application command,
  // not per-subcommand — so we deliberately do NOT restrict it at the top level (that would
  // hide /application apply from regular members). Instead every admin-only subcommand below
  // checks ManageGuild itself at runtime, and /application apply stays open to everyone.
  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'apply') {
      return applicationHandler.startApplication(interaction);
    }

    // Everything else is admin-only
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ embeds: [errorEmbed('You need the Manage Server permission to configure applications.')], ephemeral: true });
    }

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('review_channel');
      const role1 = interaction.options.getRole('accept_role');
      const role2 = interaction.options.getRole('accept_role_2');
      const newAcceptRoleIds = [role1, role2].filter(Boolean).map(r => r.id);

      db.guildConfig.update(guildId, cfg => ({
        ...cfg,
        applicationChannelId: channel.id,
        applicationAcceptRoleIds: newAcceptRoleIds.length > 0 ? newAcceptRoleIds : (cfg.applicationAcceptRoleIds || [])
      }));

      const roleText = newAcceptRoleIds.length > 0
        ? ` Accepted applicants will receive: ${newAcceptRoleIds.map(id => `<@&${id}>`).join(', ')}.`
        : '';
      return interaction.reply({ embeds: [successEmbed(`Applications will be reviewed in ${channel}.${roleText}`)] });
    }

    if (group === 'blacklist') {
      if (sub === 'add') {
        const role = interaction.options.getRole('role');
        db.guildConfig.update(guildId, cfg => {
          const blacklist = cfg.applicationBlacklistRoleIds || [];
          if (!blacklist.includes(role.id)) blacklist.push(role.id);
          return { ...cfg, applicationBlacklistRoleIds: blacklist };
        });
        return interaction.reply({ embeds: [successEmbed(`Members with ${role} can no longer apply.`)] });
      }
      if (sub === 'remove') {
        const role = interaction.options.getRole('role');
        db.guildConfig.update(guildId, cfg => ({
          ...cfg,
          applicationBlacklistRoleIds: (cfg.applicationBlacklistRoleIds || []).filter(id => id !== role.id)
        }));
        return interaction.reply({ embeds: [successEmbed(`${role} has been removed from the application blacklist.`)] });
      }
      if (sub === 'list') {
        const cfg = db.guildConfig.get(guildId, {});
        const blacklist = cfg.applicationBlacklistRoleIds || [];
        if (blacklist.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('No roles are currently blacklisted from applying.')] });
        }
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('🚫 Blacklisted Roles').setDescription(blacklist.map(id => `<@&${id}>`).join('\n'))] });
      }
    }

    if (group === 'question') {
      if (sub === 'add') {
        const text = interaction.options.getString('text');
        db.guildConfig.update(guildId, cfg => {
          const questions = cfg.applicationQuestions || [];
          questions.push(text);
          return { ...cfg, applicationQuestions: questions };
        });
        return interaction.reply({ embeds: [successEmbed(`Added question: "${text}"`)] });
      }

      if (sub === 'remove') {
        const number = interaction.options.getInteger('number');
        const cfg = db.guildConfig.get(guildId, {});
        const questions = cfg.applicationQuestions || [];
        if (number < 1 || number > questions.length) {
          return interaction.reply({ embeds: [errorEmbed(`Invalid question number. Use \`/application question list\` to see valid numbers.`)], ephemeral: true });
        }
        const [removed] = questions.splice(number - 1, 1);
        db.guildConfig.update(guildId, c => ({ ...c, applicationQuestions: questions }));
        return interaction.reply({ embeds: [successEmbed(`Removed question: "${removed}"`)] });
      }

      if (sub === 'list') {
        const cfg = db.guildConfig.get(guildId, {});
        const questions = cfg.applicationQuestions || [];
        if (questions.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('No application questions have been set yet. Add one with `/application question add`.')] });
        }
        const embed = new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('📝 Application Questions')
          .setDescription(questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n'));
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (sub === 'toggle') {
      const open = interaction.options.getBoolean('open');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, applicationsOpen: open }));
      return interaction.reply({ embeds: [successEmbed(`Applications are now **${open ? 'open' : 'closed'}**.`)] });
    }

    if (sub === 'panel') {
      const cfg = db.guildConfig.get(guildId, {});
      const questionCount = (cfg.applicationQuestions || []).length;

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📋 Staff Application')
        .setDescription(
          `Interested in joining the **${interaction.guild.name}** staff team? Click the button below to begin.\n\n` +
          `📝 You'll be asked **${questionCount || 'a few'} question(s)** privately in your DMs\n` +
          `⏱️ You'll have **5 minutes** to answer each question\n` +
          `📬 Make sure your DMs are open to server members before applying\n` +
          `✅ Only submit **one** application at a time — be honest and detailed\n\n` +
          `Once submitted, staff will review your application and follow up with you in DMs.`
        )
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: 'Click below to begin — availability is checked automatically when you apply.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('application_apply')
          .setLabel('Apply for Staff')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [successEmbed('Staff application panel posted.')], ephemeral: true });
    }
  }
};
