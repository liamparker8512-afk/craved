const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');

async function getRobloxUser(username) {
  const res = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const json = await res.json();
  return json.data && json.data[0] ? json.data[0] : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roblox')
    .setDescription('Roblox account linking')
    .addSubcommand(s => s.setName('verify').setDescription('Link your Roblox account')
      .addStringOption(o => o.setName('username').setDescription('Your Roblox username').setRequired(true)))
    .addSubcommand(s => s.setName('whois').setDescription('Check which Roblox account a Discord user has linked')
      .addUserOption(o => o.setName('user').setDescription('Discord user').setRequired(false)))
    .addSubcommand(s => s.setName('unlink').setDescription('Unlink your Roblox account')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'verify') {
      const username = interaction.options.getString('username');
      await interaction.deferReply({ ephemeral: true });
      try {
        const robloxUser = await getRobloxUser(username);
        if (!robloxUser) {
          return interaction.editReply({ embeds: [errorEmbed(`Could not find a Roblox user named **${username}**.`)] });
        }
        db.roblox.set(interaction.user.id, {
          robloxId: robloxUser.id,
          robloxUsername: robloxUser.name,
          verifiedAt: Date.now()
        });

        // Optionally sync nickname
        const member = interaction.member;
        if (member && member.manageable) {
          await member.setNickname(robloxUser.name.slice(0, 32)).catch(() => {});
        }

        return interaction.editReply({ embeds: [successEmbed(`Linked your Discord to Roblox account **${robloxUser.name}** (ID: ${robloxUser.id}).`)] });
      } catch (e) {
        console.error(e);
        return interaction.editReply({ embeds: [errorEmbed('Failed to reach the Roblox API. Please try again later.')] });
      }
    }

    if (sub === 'whois') {
      const target = interaction.options.getUser('user') || interaction.user;
      const data = db.roblox.get(target.id);
      if (!data) return interaction.reply({ embeds: [errorEmbed(`${target.username} has not linked a Roblox account.`)], ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${target.username}'s Roblox Account`)
        .addFields(
          { name: 'Username', value: data.robloxUsername, inline: true },
          { name: 'Roblox ID', value: `${data.robloxId}`, inline: true },
          { name: 'Profile', value: `https://www.roblox.com/users/${data.robloxId}/profile` }
        )
        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${data.robloxId}&width=420&height=420&format=png`);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'unlink') {
      db.roblox.delete(interaction.user.id);
      return interaction.reply({ embeds: [successEmbed('Your Roblox account has been unlinked.')], ephemeral: true });
    }
  }
};
