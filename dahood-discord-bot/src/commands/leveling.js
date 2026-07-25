const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');
const { isServerStaff } = require('../utils/permissions');

function xpForLevel(level) {
  return 5 * (level ** 2) + 50 * level + 100;
}

module.exports = {
  xpForLevel,
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Leveling system')
    .addSubcommand(s => s.setName('rank').setDescription('View your (or someone else\'s) rank')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('leaderboard').setDescription('View the server level leaderboard'))
    .addSubcommand(s => s.setName('setreward').setDescription('(Staff only) Set a role reward for reaching a level')
      .addIntegerOption(o => o.setName('level').setDescription('Level required').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to award').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'rank') {
      const target = interaction.options.getUser('user') || interaction.user;
      const key = `${guildId}-${target.id}`;
      const data = db.levels.get(key, { xp: 0, level: 0 });
      const needed = xpForLevel(data.level);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${target.username}'s Rank`)
        .addFields(
          { name: 'Level', value: `${data.level}`, inline: true },
          { name: 'XP', value: `${data.xp} / ${needed}`, inline: true }
        )
        .setThumbnail(target.displayAvatarURL());
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'leaderboard') {
      const all = db.levels.all();
      const entries = Object.entries(all)
        .filter(([key]) => key.startsWith(`${guildId}-`))
        .map(([key, data]) => ({ userId: key.split('-')[1], ...data }))
        .sort((a, b) => (b.level - a.level) || (b.xp - a.xp))
        .slice(0, 10);

      if (entries.length === 0) return interaction.reply({ embeds: [errorEmbed('No leveling data yet.')] });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📈 Level Leaderboard')
        .setDescription(entries.map((e, i) => `**${i + 1}.** <@${e.userId}> — Level ${e.level} (${e.xp} XP)`).join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'setreward') {
      if (!isServerStaff(interaction.member, guildId)) {
        return interaction.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], ephemeral: true });
      }
      const level = interaction.options.getInteger('level');
      const role = interaction.options.getRole('role');
      db.guildConfig.update(guildId, cfg => {
        const levelRoles = cfg.levelRoles || {};
        levelRoles[level] = role.id;
        return { ...cfg, levelRoles };
      });
      return interaction.reply({ embeds: [successEmbed(`Members reaching level **${level}** will now receive ${role}.`)] });
    }
  }
};
