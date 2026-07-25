const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x8B0000, // Da Hood-style deep red
  success: 0x57F287,
  danger: 0xED4245,
  warning: 0xFEE75C,
  info: 0x5865F2
};

function baseEmbed(color = COLORS.primary) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

function successEmbed(description, title = null) {
  const e = baseEmbed(COLORS.success).setDescription(`✅ ${description}`);
  if (title) e.setTitle(title);
  return e;
}

function errorEmbed(description, title = null) {
  const e = baseEmbed(COLORS.danger).setDescription(`❌ ${description}`);
  if (title) e.setTitle(title);
  return e;
}

function infoEmbed(description, title = null) {
  const e = baseEmbed(COLORS.info).setDescription(description);
  if (title) e.setTitle(title);
  return e;
}

module.exports = { COLORS, baseEmbed, successEmbed, errorEmbed, infoEmbed };
