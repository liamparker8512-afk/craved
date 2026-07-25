const { SlashCommandBuilder, ChannelType } = require('discord.js');
const db = require('../database');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');

// Note: everything here is also configurable visually through /panel.
// This command exists for admins who prefer typing exact values directly.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings for this server (see also /panel for a visual dashboard)')
    .addSubcommand(s => s.setName('welcome').setDescription('Set the welcome channel and message')
      .addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Welcome channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Use {user} and {server} as placeholders').setRequired(false)))
    .addSubcommand(s => s.setName('leave').setDescription('Set the leave channel and message')
      .addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Leave channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Use {user} and {server} as placeholders').setRequired(false)))
    .addSubcommand(s => s.setName('logs').setDescription('Set the moderation log channel')
      .addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Log channel').setRequired(true)))
    .addSubcommand(s => s.setName('adminrole').setDescription('Set the admin role (can use /panel and /config)')
      .addRoleOption(o => o.setName('role').setDescription('Admin role').setRequired(true)))
    .addSubcommand(s => s.setName('modrole').setDescription('Set the moderator role (can use /mod commands)')
      .addRoleOption(o => o.setName('role').setDescription('Moderator role').setRequired(true)))
    .addSubcommand(s => s.setName('staffrole').setDescription('Set the staff role (used for tickets)')
      .addRoleOption(o => o.setName('role').setDescription('Staff role').setRequired(true)))
    .addSubcommand(s => s.setName('suggestions').setDescription('Set the suggestions channel')
      .addChannelOption(o => o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Suggestions channel').setRequired(true)))
    .addSubcommandGroup(g => g.setName('bannedwords')
      .setDescription('Manage the auto-moderation banned word list')
      .addSubcommand(s => s.setName('add').setDescription('Add a word/phrase to the banned list')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase to ban').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a word/phrase from the banned list')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase to remove').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all currently banned words/phrases'))),

  async execute(interaction) {
    if (!isAdmin(interaction.member, interaction.guild.id)) {
      return interaction.reply({ embeds: [errorEmbed('Only the server owner, Administrators, or someone with the configured Admin role can use this command.')], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message') || 'Welcome {user} to {server}! 🎮';
      db.guildConfig.update(guildId, cfg => ({ ...cfg, welcomeChannelId: channel.id, welcomeMessage: message }));
      return interaction.reply({ embeds: [successEmbed(`Welcome messages will be sent in ${channel}.`)] });
    }

    if (sub === 'leave') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message') || '{user} has left {server}. 👋';
      db.guildConfig.update(guildId, cfg => ({ ...cfg, leaveChannelId: channel.id, leaveMessage: message }));
      return interaction.reply({ embeds: [successEmbed(`Leave messages will be sent in ${channel}.`)] });
    }

    if (sub === 'logs') {
      const channel = interaction.options.getChannel('channel');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, logChannelId: channel.id }));
      return interaction.reply({ embeds: [successEmbed(`Moderation logs will be sent in ${channel}.`)] });
    }

    if (sub === 'adminrole') {
      const role = interaction.options.getRole('role');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, adminRoleId: role.id }));
      return interaction.reply({ embeds: [successEmbed(`Admin role set to ${role}. Members with this role can now use /panel and /config.`)] });
    }

    if (sub === 'modrole') {
      const role = interaction.options.getRole('role');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, modRoleId: role.id }));
      return interaction.reply({ embeds: [successEmbed(`Moderator role set to ${role}.`)] });
    }

    if (sub === 'staffrole') {
      const role = interaction.options.getRole('role');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, staffRoleId: role.id }));
      return interaction.reply({ embeds: [successEmbed(`Staff role set to ${role}.`)] });
    }

    if (sub === 'suggestions') {
      const channel = interaction.options.getChannel('channel');
      db.guildConfig.update(guildId, cfg => ({ ...cfg, suggestionChannelId: channel.id }));
      return interaction.reply({ embeds: [successEmbed(`Suggestions channel set to ${channel}.`)] });
    }

    const group = interaction.options.getSubcommandGroup(false);
    if (group === 'bannedwords') {
      if (sub === 'add') {
        const word = interaction.options.getString('word').toLowerCase().trim();
        db.guildConfig.update(guildId, cfg => {
          const bannedWords = cfg.bannedWords || [];
          if (!bannedWords.includes(word)) bannedWords.push(word);
          return { ...cfg, bannedWords };
        });
        return interaction.reply({ embeds: [successEmbed('Added to the banned word list. Turn on auto-moderation via `/panel` for it to take effect.')], ephemeral: true });
      }
      if (sub === 'remove') {
        const word = interaction.options.getString('word').toLowerCase().trim();
        const cfg = db.guildConfig.get(guildId, {});
        const bannedWords = (cfg.bannedWords || []).filter(w => w !== word);
        db.guildConfig.update(guildId, c => ({ ...c, bannedWords }));
        return interaction.reply({ embeds: [successEmbed('Removed from the banned word list (if it was present).')], ephemeral: true });
      }
      if (sub === 'list') {
        const cfg = db.guildConfig.get(guildId, {});
        const bannedWords = cfg.bannedWords || [];
        if (bannedWords.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('No banned words configured yet. Add one with `/config bannedwords add`.')], ephemeral: true });
        }
        return interaction.reply({ content: `Banned words/phrases (${bannedWords.length}): ||${bannedWords.join(', ')}||`, ephemeral: true });
      }
    }
  }
};
