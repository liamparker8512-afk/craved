const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { COLORS, successEmbed, errorEmbed } = require('../utils/embeds');

const CURRENCY = '💵';
const DAILY_AMOUNT = 500;
const WORK_MIN = 100, WORK_MAX = 400;
const BEG_MIN = 10, BEG_MAX = 150;
const ROB_COOLDOWN = 30 * 60 * 1000; // 30 min
const WORK_COOLDOWN = 60 * 60 * 1000; // 1 hour
const BEG_COOLDOWN = 15 * 60 * 1000; // 15 min
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

const SHOP_ITEMS = {
  pistol: { name: 'Pistol', price: 2000, emoji: '🔫' },
  vest: { name: 'Kevlar Vest', price: 3500, emoji: '🦺' },
  car: { name: 'Getaway Car', price: 15000, emoji: '🚗' },
  bandana: { name: 'Bandana', price: 750, emoji: '🧣' }
};

function getUser(guildId, userId) {
  const key = `${guildId}-${userId}`;
  return db.economy.get(key, { balance: 500, bank: 0, lastDaily: 0, lastWork: 0, lastRob: 0, lastBeg: 0, inventory: [] });
}

function setUser(guildId, userId, data) {
  const key = `${guildId}-${userId}`;
  db.economy.set(key, data);
}

function fmt(n) {
  return `${CURRENCY} ${n.toLocaleString()}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Da Hood economy system')
    .addSubcommand(s => s.setName('balance').setDescription('Check your (or someone else\'s) balance')
      .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)))
    .addSubcommand(s => s.setName('daily').setDescription('Claim your daily cash'))
    .addSubcommand(s => s.setName('work').setDescription('Work a job to earn cash'))
    .addSubcommand(s => s.setName('beg').setDescription('Beg for some spare cash'))
    .addSubcommand(s => s.setName('rob').setDescription('Attempt to rob another player')
      .addUserOption(o => o.setName('user').setDescription('User to rob').setRequired(true)))
    .addSubcommand(s => s.setName('pay').setDescription('Pay another user')
      .addUserOption(o => o.setName('user').setDescription('User to pay').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to pay').setRequired(true)))
    .addSubcommand(s => s.setName('deposit').setDescription('Deposit cash into your bank')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount (or leave blank for all)').setRequired(false)))
    .addSubcommand(s => s.setName('withdraw').setDescription('Withdraw cash from your bank')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount (or leave blank for all)').setRequired(false)))
    .addSubcommand(s => s.setName('leaderboard').setDescription('View the richest players'))
    .addSubcommand(s => s.setName('shop').setDescription('View the item shop'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy an item from the shop')
      .addStringOption(o => o.setName('item').setDescription('Item id').setRequired(true)
        .addChoices(...Object.entries(SHOP_ITEMS).map(([id, item]) => ({ name: item.name, value: id }))))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'balance') {
      const target = interaction.options.getUser('user') || interaction.user;
      const data = getUser(guildId, target.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${target.username}'s Wallet`)
        .addFields(
          { name: 'Cash on hand', value: fmt(data.balance), inline: true },
          { name: 'Bank', value: fmt(data.bank), inline: true },
          { name: 'Net worth', value: fmt(data.balance + data.bank), inline: true }
        )
        .setThumbnail(target.displayAvatarURL());
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'daily') {
      const data = getUser(guildId, interaction.user.id);
      const now = Date.now();
      if (now - data.lastDaily < DAILY_COOLDOWN) {
        const remaining = DAILY_COOLDOWN - (now - data.lastDaily);
        return interaction.reply({ embeds: [errorEmbed(`You already claimed your daily. Try again <t:${Math.floor((now + remaining) / 1000)}:R>.`)], ephemeral: true });
      }
      data.balance += DAILY_AMOUNT;
      data.lastDaily = now;
      setUser(guildId, interaction.user.id, data);
      return interaction.reply({ embeds: [successEmbed(`You claimed your daily reward of ${fmt(DAILY_AMOUNT)}!`)] });
    }

    if (sub === 'work') {
      const data = getUser(guildId, interaction.user.id);
      const now = Date.now();
      if (now - data.lastWork < WORK_COOLDOWN) {
        const remaining = WORK_COOLDOWN - (now - data.lastWork);
        return interaction.reply({ embeds: [errorEmbed(`You're tired. You can work again <t:${Math.floor((now + remaining) / 1000)}:R>.`)], ephemeral: true });
      }
      const jobs = ['ran a package across town', 'did a corner shift', 'flipped some stolen goods', 'drove a getaway car', 'watched the block'];
      const earned = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      data.balance += earned;
      data.lastWork = now;
      setUser(guildId, interaction.user.id, data);
      return interaction.reply({ embeds: [successEmbed(`You ${job} and earned ${fmt(earned)}!`)] });
    }

    if (sub === 'beg') {
      const data = getUser(guildId, interaction.user.id);
      const now = Date.now();
      if (now - data.lastBeg < BEG_COOLDOWN) {
        const remaining = BEG_COOLDOWN - (now - data.lastBeg);
        return interaction.reply({ embeds: [errorEmbed(`Give it a rest. Try begging again <t:${Math.floor((now + remaining) / 1000)}:R>.`)], ephemeral: true });
      }
      const earned = Math.floor(Math.random() * (BEG_MAX - BEG_MIN + 1)) + BEG_MIN;
      data.balance += earned;
      data.lastBeg = now;
      setUser(guildId, interaction.user.id, data);
      return interaction.reply({ embeds: [successEmbed(`A stranger felt bad for you and gave you ${fmt(earned)}.`)] });
    }

    if (sub === 'rob') {
      const target = interaction.options.getUser('user');
      if (target.id === interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('You cannot rob yourself.')], ephemeral: true });
      }
      const robber = getUser(guildId, interaction.user.id);
      const now = Date.now();
      if (now - robber.lastRob < ROB_COOLDOWN) {
        const remaining = ROB_COOLDOWN - (now - robber.lastRob);
        return interaction.reply({ embeds: [errorEmbed(`You're laying low. Try robbing again <t:${Math.floor((now + remaining) / 1000)}:R>.`)], ephemeral: true });
      }
      const victim = getUser(guildId, target.id);
      if (victim.balance < 100) {
        return interaction.reply({ embeds: [errorEmbed(`${target.username} doesn't have enough cash on hand to be worth robbing.`)], ephemeral: true });
      }
      robber.lastRob = now;
      const success = Math.random() < 0.45;
      if (success) {
        const stolen = Math.floor(victim.balance * (Math.random() * 0.3 + 0.1));
        victim.balance -= stolen;
        robber.balance += stolen;
        setUser(guildId, interaction.user.id, robber);
        setUser(guildId, target.id, victim);
        return interaction.reply({ embeds: [successEmbed(`💰 You robbed **${target.username}** and got away with ${fmt(stolen)}!`)] });
      } else {
        const fine = Math.floor(robber.balance * (Math.random() * 0.2 + 0.05));
        robber.balance = Math.max(0, robber.balance - fine);
        setUser(guildId, interaction.user.id, robber);
        return interaction.reply({ embeds: [errorEmbed(`🚔 You got caught trying to rob **${target.username}** and paid a ${fmt(fine)} fine.`)] });
      }
    }

    if (sub === 'pay') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (target.id === interaction.user.id) return interaction.reply({ embeds: [errorEmbed('You cannot pay yourself.')], ephemeral: true });
      if (amount <= 0) return interaction.reply({ embeds: [errorEmbed('Amount must be positive.')], ephemeral: true });
      const payer = getUser(guildId, interaction.user.id);
      if (payer.balance < amount) return interaction.reply({ embeds: [errorEmbed('You do not have enough cash.')], ephemeral: true });
      const receiver = getUser(guildId, target.id);
      payer.balance -= amount;
      receiver.balance += amount;
      setUser(guildId, interaction.user.id, payer);
      setUser(guildId, target.id, receiver);
      return interaction.reply({ embeds: [successEmbed(`You paid **${target.username}** ${fmt(amount)}.`)] });
    }

    if (sub === 'deposit' || sub === 'withdraw') {
      const data = getUser(guildId, interaction.user.id);
      let amount = interaction.options.getInteger('amount');
      if (sub === 'deposit') {
        if (amount == null) amount = data.balance;
        if (amount <= 0 || amount > data.balance) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], ephemeral: true });
        data.balance -= amount;
        data.bank += amount;
        setUser(guildId, interaction.user.id, data);
        return interaction.reply({ embeds: [successEmbed(`Deposited ${fmt(amount)} into your bank.`)] });
      } else {
        if (amount == null) amount = data.bank;
        if (amount <= 0 || amount > data.bank) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], ephemeral: true });
        data.bank -= amount;
        data.balance += amount;
        setUser(guildId, interaction.user.id, data);
        return interaction.reply({ embeds: [successEmbed(`Withdrew ${fmt(amount)} from your bank.`)] });
      }
    }

    if (sub === 'leaderboard') {
      const all = db.economy.all();
      const entries = Object.entries(all)
        .filter(([key]) => key.startsWith(`${guildId}-`))
        .map(([key, data]) => ({ userId: key.split('-')[1], net: data.balance + data.bank }))
        .sort((a, b) => b.net - a.net)
        .slice(0, 10);

      if (entries.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No economy data yet.')] });
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('💰 Richest Players')
        .setDescription(entries.map((e, i) => `**${i + 1}.** <@${e.userId}> — ${fmt(e.net)}`).join('\n'));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'shop') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🛒 Da Hood Shop')
        .setDescription(
          Object.entries(SHOP_ITEMS).map(([id, item]) => `${item.emoji} **${item.name}** — ${fmt(item.price)} \`(/economy buy item:${item.name})\``).join('\n')
        );
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'buy') {
      const itemId = interaction.options.getString('item');
      const item = SHOP_ITEMS[itemId];
      if (!item) return interaction.reply({ embeds: [errorEmbed('Item not found.')], ephemeral: true });
      const data = getUser(guildId, interaction.user.id);
      if (data.balance < item.price) return interaction.reply({ embeds: [errorEmbed(`You need ${fmt(item.price)} to buy this, but only have ${fmt(data.balance)}.`)], ephemeral: true });
      data.balance -= item.price;
      data.inventory.push(itemId);
      setUser(guildId, interaction.user.id, data);
      return interaction.reply({ embeds: [successEmbed(`You bought a ${item.emoji} **${item.name}** for ${fmt(item.price)}!`)] });
    }
  }
};
