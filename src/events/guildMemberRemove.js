const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/embeds');
const { isFeatureEnabled } = require('../utils/features');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!isFeatureEnabled(member.guild.id, 'leave')) return;
    const cfg = db.guildConfig.get(member.guild.id, {});
    if (!cfg.leaveChannelId) return;
    const channel = await member.guild.channels.fetch(cfg.leaveChannelId).catch(() => null);
    if (!channel) return;

    const text = (cfg.leaveMessage || '{user} has left {server}. 👋')
      .replace('{user}', member.user.tag)
      .replace('{server}', member.guild.name);

    const embed = new EmbedBuilder()
      .setColor(COLORS.danger)
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    channel.send({ embeds: [embed] }).catch(() => {});
  }
};
