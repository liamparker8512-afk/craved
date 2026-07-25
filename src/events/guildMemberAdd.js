const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/embeds');
const { isFeatureEnabled } = require('../utils/features');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    if (!isFeatureEnabled(member.guild.id, 'welcome')) return;
    const cfg = db.guildConfig.get(member.guild.id, {});
    if (!cfg.welcomeChannelId) return;
    const channel = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
    if (!channel) return;

    const text = (cfg.welcomeMessage || 'Welcome {user} to {server}! 🎮')
      .replace('{user}', `${member}`)
      .replace('{server}', member.guild.name);

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `Member #${member.guild.memberCount}` })
      .setTimestamp();

    channel.send({ embeds: [embed] }).catch(() => {});
  }
};
