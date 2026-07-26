const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');

// --- Permission hierarchy ---
// Owner:  the actual Discord server owner. Always has full access, no role needed.
// Admin:  Discord "Administrator" permission holders, OR anyone with the configurable
//         admin role (set via /panel or /config adminrole). Can access the admin panel
//         and all /config commands.
// Staff:  the configurable staff role (ticket access) or moderator role (mod commands).
//         Assign these Discord roles to whoever should have those powers — the bot
//         checks membership of the role at runtime, no manual list to maintain.

function isOwner(member, guildId) {
  if (!member) return false;
  return member.guild.ownerId === member.id;
}

function isAdmin(member, guildId) {
  if (!member) return false;
  if (isOwner(member, guildId)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const cfg = db.guildConfig.get(guildId, {});
  if (cfg.adminRoleId && member.roles.cache.has(cfg.adminRoleId)) return true;
  return false;
}

function isServerStaff(member, guildId) {
  if (!member) return false;
  if (isAdmin(member, guildId)) return true;
  const cfg = db.guildConfig.get(guildId, {});
  if (cfg.staffRoleId && member.roles.cache.has(cfg.staffRoleId)) return true;
  if (cfg.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
  return false;
}

function isModerator(member, guildId) {
  if (!member) return false;
  if (isAdmin(member, guildId)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  const cfg = db.guildConfig.get(guildId, {});
  if (cfg.modRoleId && member.roles.cache.has(cfg.modRoleId)) return true;
  return false;
}

module.exports = { isOwner, isAdmin, isServerStaff, isModerator };
