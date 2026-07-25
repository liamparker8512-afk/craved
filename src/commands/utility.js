const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('utility')
    .setDescription('Utility commands')
    .addSubcommand(s => s.setName('ping').setDescription('Check the bot\'s latency'))
    .addSubcommand(s => s.setName('userinfo').setDescription('View info about a user')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('serverinfo').setDescription('View info about this server'))
    .addSubcommand(s => s.setName('avatar').setDescription('Get a user\'s avatar')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('help').setDescription('View all bot commands and features')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'ping') {
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      return interaction.editReply(`🏓 Pong! Latency: **${latency}ms** | API: **${Math.round(interaction.client.ws.ping)}ms**`);
    }

    if (sub === 'userinfo') {
      const target = interaction.options.getUser('user') || interaction.user;
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(target.tag)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'ID', value: target.id, inline: true },
          { name: 'Account Created', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Joined Server', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true },
          { name: 'Roles', value: member ? (member.roles.cache.size - 1 > 0 ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r).join(', ').slice(0, 1024) : 'None') : 'N/A' }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'serverinfo') {
      const guild = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL())
        .addFields(
          { name: 'Members', value: `${guild.memberCount}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Boosts', value: `${guild.premiumSubscriptionCount || 0}`, inline: true }
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'avatar') {
      const target = interaction.options.getUser('user') || interaction.user;
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${target.username}'s Avatar`)
        .setImage(target.displayAvatarURL({ size: 1024 }));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📖 Bot Commands & Features')
        .setDescription('Here is everything this bot can do:')
        .addFields(
          { name: '🎫 Tickets', value: '`/ticket setup` `/ticket add` `/ticket remove` `/ticket close`' },
          { name: '🛡️ Moderation', value: '`/mod ban` `/mod kick` `/mod timeout` `/mod untimeout` `/mod warn` `/mod warnings` `/mod clearwarnings` `/mod purge` `/mod lock` `/mod unlock` `/mod slowmode`' },
          { name: '💵 Economy', value: '`/economy balance` `/economy daily` `/economy work` `/economy beg` `/economy rob` `/economy pay` `/economy deposit` `/economy withdraw` `/economy leaderboard` `/economy shop` `/economy buy`' },
          { name: '📈 Leveling', value: '`/level rank` `/level leaderboard` `/level setreward`' },
          { name: '🎮 Roblox', value: '`/roblox verify` `/roblox whois`' },
          { name: '🎉 Giveaways', value: '`/giveaway start` `/giveaway end` `/giveaway reroll`' },
          { name: '💡 Suggestions', value: '`/suggest`' },
          { name: '⚙️ Configuration', value: '`/config welcome` `/config leave` `/config logs` `/config modrole` `/config suggestions`' },
          { name: '🔧 Utility', value: '`/utility ping` `/utility userinfo` `/utility serverinfo` `/utility avatar`' }
        )
        .setFooter({ text: 'Da Hood Remake Bot' });
      return interaction.reply({ embeds: [embed] });
    }
  }
};
