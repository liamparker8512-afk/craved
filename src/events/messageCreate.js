const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/embeds');
const { xpForLevel } = require('../commands/leveling');
const { isFeatureEnabled } = require('../utils/features');
const { isServerStaff } = require('../utils/permissions');

const INVITE_REGEX = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/\S+/i;
// No words are banned out of the box — configure your own list per-server with
// /config bannedwords add|remove|list so nothing offensive ships hardcoded in source.

const xpCooldowns = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    const cfg = db.guildConfig.get(message.guild.id, {});

    // --- Basic automod --- (staff/admins are exempt so they can share invite links etc.)
    if (isFeatureEnabled(message.guild.id, 'automod') && !isServerStaff(message.member, message.guild.id)) {
      const bannedWords = cfg.bannedWords || [];
      const content = message.content.toLowerCase();
      const hasInvite = INVITE_REGEX.test(content);
      const hasBannedWord = bannedWords.some(w => content.includes(w.toLowerCase()));
      if (hasInvite || hasBannedWord) {
        await message.delete().catch(() => {});
        const warnMsg = await message.channel.send(`${message.author}, that message was removed by auto-moderation.`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        if (cfg.logChannelId) {
          const logChannel = await message.guild.channels.fetch(cfg.logChannelId).catch(() => null);
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor(COLORS.danger)
              .setDescription(`🚫 Auto-mod removed a message from ${message.author} in ${message.channel} (${hasInvite ? 'invite link' : 'banned word'}).`)
              .setTimestamp();
            logChannel.send({ embeds: [embed] }).catch(() => {});
          }
        }
        return;
      }
    }

    // --- Leveling ---
    if (!isFeatureEnabled(message.guild.id, 'leveling')) return;
    const cooldownKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();
    const last = xpCooldowns.get(cooldownKey) || 0;
    if (now - last < 60000) return; // 1 message per minute counts toward XP
    xpCooldowns.set(cooldownKey, now);

    const levelKey = `${message.guild.id}-${message.author.id}`;
    const data = db.levels.get(levelKey, { xp: 0, level: 0 });
    const gained = Math.floor(Math.random() * 11) + 15; // 15-25 xp
    data.xp += gained;

    const needed = xpForLevel(data.level);
    if (data.xp >= needed) {
      data.xp -= needed;
      data.level += 1;

      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(`🎉 ${message.author} leveled up to **level ${data.level}**!`)
        ]
      }).catch(() => {});

      const levelRoles = cfg.levelRoles || {};
      const roleId = levelRoles[data.level];
      if (roleId) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) member.roles.add(roleId).catch(() => {});
      }
    }

    db.levels.set(levelKey, data);
  }
};
