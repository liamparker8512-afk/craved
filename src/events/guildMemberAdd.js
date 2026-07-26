const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS } = require('../utils/embeds');
const { isFeatureEnabled } = require('../utils/features');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    // --- Auto Role --- (assign configured role(s) to new members, Dyno/Carlbot-style)
    if (isFeatureEnabled(member.guild.id, 'autorole')) {
      const cfg = db.guildConfig.get(member.guild.id, {});
      const autoRoleIds = cfg.autoRoleIds || [];
      const includeBots = cfg.autoRoleIncludeBots === true; // off by default, like Dyno/Carlbot
      const delaySeconds = cfg.autoRoleDelaySeconds || 0;

      if (autoRoleIds.length > 0 && (!member.user.bot || includeBots)) {
        const assign = async () => {
          // Member may have left during the delay, or the bot may have restarted — re-fetch to be safe.
          const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
          if (!freshMember) return;
          await freshMember.roles.add(autoRoleIds).catch(err => {
            console.error(`Failed to assign auto-role(s) to ${member.user.tag}:`, err.message);
          });
        };

        if (delaySeconds > 0) {
          setTimeout(assign, delaySeconds * 1000);
        } else {
          await assign();
        }
      }
    }

    // --- Welcome message ---
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
