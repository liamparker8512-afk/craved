const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType
} = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/embeds');
const { FEATURES, getFeatures, setFeature } = require('../utils/features');
const { isAdmin } = require('../utils/permissions');

const NAV_OPTIONS = [
  { label: 'Feature Toggles', value: 'features', emoji: '🧩', description: 'Turn bot modules on/off' },
  { label: 'Roles', value: 'roles', emoji: '👤', description: 'Set Admin, Staff, and Moderator roles' },
  { label: 'Channels (General)', value: 'channels1', emoji: '📢', description: 'Mod logs, welcome, leave' },
  { label: 'Channels (Tickets)', value: 'channels2', emoji: '🎫', description: 'Suggestions, ticket category, transcripts' },
  { label: 'Applications (General)', value: 'applications1', emoji: '📝', description: 'Review channel, ping role, open/close' },
  { label: 'Applications (Roles)', value: 'applications2', emoji: '🎓', description: 'Accept roles and blacklisted roles' },
  { label: 'Close Panel', value: 'close', emoji: '❌', description: 'Dismiss this panel' }
];

function navRow(current) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('panel_nav')
    .setPlaceholder('Select a settings page...')
    .addOptions(NAV_OPTIONS.map(o => ({ ...o, default: o.value === current })));
  return new ActionRowBuilder().addComponents(menu);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function featuresPage(guild) {
  const state = getFeatures(guild.id);
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🧩 Feature Toggles')
    .setDescription(
      Object.entries(FEATURES).map(([key, meta]) =>
        `${state[key] ? '✅' : '❌'} ${meta.emoji} **${meta.label}**`
      ).join('\n')
    )
    .setFooter({ text: 'Click a button below to toggle that feature.' });

  const buttons = Object.entries(FEATURES).map(([key, meta]) =>
    new ButtonBuilder()
      .setCustomId(`panel_toggle_${key}`)
      .setLabel(meta.label)
      .setEmoji(meta.emoji)
      .setStyle(state[key] ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const rows = chunk(buttons, 5).map(group => new ActionRowBuilder().addComponents(group));
  return { embed, rows: rows.slice(0, 4) }; // leave room for nav row (max 5 rows total)
}

function rolesPage(guild) {
  const cfg = db.guildConfig.get(guild.id, {});
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('👤 Role Configuration')
    .setDescription(
      `**Owner:** ${guild.ownerId ? `<@${guild.ownerId}>` : 'Unknown'} _(always has full access, no role needed)_\n` +
      `**Admin role:** ${cfg.adminRoleId ? `<@&${cfg.adminRoleId}>` : '_Not set — Discord "Administrator" permission only_'}\n` +
      `**Staff role (tickets):** ${cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : '_Not set_'}\n` +
      `**Moderator role (mod commands):** ${cfg.modRoleId ? `<@&${cfg.modRoleId}>` : '_Not set_'}`
    )
    .setFooter({ text: 'Use the dropdowns below to assign each role.' });

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_admin').setPlaceholder('Set Admin role').setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_staff').setPlaceholder('Set Staff role (tickets)').setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_mod').setPlaceholder('Set Moderator role').setMinValues(1).setMaxValues(1)
    )
  ];
  return { embed, rows };
}

function channels1Page(guild) {
  const cfg = db.guildConfig.get(guild.id, {});
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📢 Channels — General')
    .setDescription(
      `**Mod log channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : '_Not set_'}\n` +
      `**Welcome channel:** ${cfg.welcomeChannelId ? `<#${cfg.welcomeChannelId}>` : '_Not set_'}\n` +
      `**Leave channel:** ${cfg.leaveChannelId ? `<#${cfg.leaveChannelId}>` : '_Not set_'}`
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_logs').setPlaceholder('Set mod log channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_welcome').setPlaceholder('Set welcome channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_leave').setPlaceholder('Set leave channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    )
  ];
  return { embed, rows };
}

function channels2Page(guild) {
  const cfg = db.guildConfig.get(guild.id, {});
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎫 Channels — Tickets & Suggestions')
    .setDescription(
      `**Suggestions channel:** ${cfg.suggestionChannelId ? `<#${cfg.suggestionChannelId}>` : '_Not set_'}\n` +
      `**Ticket category:** ${cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : '_Not set_'}\n` +
      `**Ticket transcript channel:** ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : '_Not set_'}`
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_suggestions').setPlaceholder('Set suggestions channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_ticketcategory').setPlaceholder('Set ticket category')
        .addChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_transcript').setPlaceholder('Set transcript channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    )
  ];
  return { embed, rows };
}

function applications1Page(guild) {
  const cfg = db.guildConfig.get(guild.id, {});
  const questionCount = (cfg.applicationQuestions || []).length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📝 Applications — General')
    .setDescription(
      `**Review channel:** ${cfg.applicationChannelId ? `<#${cfg.applicationChannelId}>` : '_Not set_'}\n` +
      `**Ping role on submit:** ${cfg.applicationPingRoleId ? `<@&${cfg.applicationPingRoleId}>` : '_None_'}\n` +
      `**Status:** ${cfg.applicationsOpen !== false ? '✅ Open' : '🔒 Closed'}\n` +
      `**Questions configured:** ${questionCount}\n\n` +
      `_Manage questions with \`/application question add/remove/list\`. Post the Apply button with \`/application panel\`. Accept/blacklist roles are on the next page._`
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('panel_channel_applications').setPlaceholder('Set application review channel')
        .addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_appping').setPlaceholder('Set role to ping on new submissions').setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('panel_app_toggle').setLabel(cfg.applicationsOpen !== false ? 'Close Applications' : 'Open Applications')
        .setStyle(cfg.applicationsOpen !== false ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(cfg.applicationsOpen !== false ? '🔒' : '✅')
    )
  ];
  return { embed, rows };
}

function applications2Page(guild) {
  const cfg = db.guildConfig.get(guild.id, {});
  const acceptRoleIds = cfg.applicationAcceptRoleIds || (cfg.applicationAcceptRoleId ? [cfg.applicationAcceptRoleId] : []);
  const blacklistRoleIds = cfg.applicationBlacklistRoleIds || [];

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎓 Applications — Roles')
    .setDescription(
      `**Accept role(s):** ${acceptRoleIds.length > 0 ? acceptRoleIds.map(id => `<@&${id}>`).join(', ') : '_Not set_'} _(select up to 2)_\n` +
      `**Blacklisted role(s):** ${blacklistRoleIds.length > 0 ? blacklistRoleIds.map(id => `<@&${id}>`).join(', ') : '_None_'}`
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_appaccept').setPlaceholder('Set accept role(s) — up to 2').setMinValues(1).setMaxValues(2)
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('panel_role_appblacklist').setPlaceholder('Set blacklisted role(s)').setMinValues(1).setMaxValues(5)
    )
  ];
  return { embed, rows };
}

function renderPage(guild, page) {
  let embed, rows;
  if (page === 'roles') ({ embed, rows } = rolesPage(guild));
  else if (page === 'channels1') ({ embed, rows } = channels1Page(guild));
  else if (page === 'channels2') ({ embed, rows } = channels2Page(guild));
  else if (page === 'applications1') ({ embed, rows } = applications1Page(guild));
  else if (page === 'applications2') ({ embed, rows } = applications2Page(guild));
  else ({ embed, rows } = featuresPage(guild)); // default: features

  const components = [navRow(page), ...rows];
  return { embed, components };
}

const CHANNEL_KEY_MAP = {
  logs: 'logChannelId',
  welcome: 'welcomeChannelId',
  leave: 'leaveChannelId',
  suggestions: 'suggestionChannelId',
  ticketcategory: 'ticketCategoryId',
  transcript: 'transcriptChannelId',
  applications: 'applicationChannelId'
};

const ROLE_KEY_MAP = {
  admin: 'adminRoleId',
  staff: 'staffRoleId',
  mod: 'modRoleId',
  appaccept: 'applicationAcceptRoleIds',
  appblacklist: 'applicationBlacklistRoleIds',
  appping: 'applicationPingRoleId'
};

// Which role-select keys store an array of role IDs (vs. a single role ID)
const MULTI_VALUE_ROLE_KEYS = new Set(['appaccept', 'appblacklist']);

async function route(interaction) {
  if (!isAdmin(interaction.member, interaction.guild.id)) {
    return interaction.reply({ content: '❌ You no longer have permission to use this panel.', ephemeral: true });
  }

  const id = interaction.customId;

  if (id === 'panel_nav') {
    const page = interaction.values[0];
    if (page === 'close') {
      return interaction.update({ content: '✅ Panel closed.', embeds: [], components: [] });
    }
    const { embed, components } = renderPage(interaction.guild, page);
    return interaction.update({ embeds: [embed], components });
  }

  if (id.startsWith('panel_toggle_')) {
    const key = id.replace('panel_toggle_', '');
    const current = getFeatures(interaction.guild.id)[key];
    setFeature(interaction.guild.id, key, !current);
    const { embed, components } = renderPage(interaction.guild, 'features');
    return interaction.update({ embeds: [embed], components });
  }

  if (id === 'panel_app_toggle') {
    const cfg = db.guildConfig.get(interaction.guild.id, {});
    const newState = !(cfg.applicationsOpen !== false);
    db.guildConfig.update(interaction.guild.id, c => ({ ...c, applicationsOpen: newState }));
    const { embed, components } = renderPage(interaction.guild, 'applications1');
    return interaction.update({ embeds: [embed], components });
  }

  if (id.startsWith('panel_role_')) {
    const shortKey = id.replace('panel_role_', '');
    const dbKey = ROLE_KEY_MAP[shortKey];
    const value = MULTI_VALUE_ROLE_KEYS.has(shortKey) ? interaction.values : interaction.values[0];
    db.guildConfig.update(interaction.guild.id, cfg => ({ ...cfg, [dbKey]: value }));
    let page = 'roles';
    if (shortKey === 'appaccept' || shortKey === 'appblacklist') page = 'applications2';
    if (shortKey === 'appping') page = 'applications1';
    const { embed, components } = renderPage(interaction.guild, page);
    return interaction.update({ embeds: [embed], components });
  }

  if (id.startsWith('panel_channel_')) {
    const shortKey = id.replace('panel_channel_', '');
    const dbKey = CHANNEL_KEY_MAP[shortKey];
    const channelId = interaction.values[0];
    db.guildConfig.update(interaction.guild.id, cfg => ({ ...cfg, [dbKey]: channelId }));
    let page = 'channels1';
    if (['suggestions', 'ticketcategory', 'transcript'].includes(shortKey)) page = 'channels2';
    if (shortKey === 'applications') page = 'applications1';
    const { embed, components } = renderPage(interaction.guild, page);
    return interaction.update({ embeds: [embed], components });
  }
}

module.exports = { renderPage, route };
