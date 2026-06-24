const { PermissionFlagsBits } = require("discord.js");

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminIds = (process.env.ADMIN_ROLE_IDS || "").split(",").map(r => r.trim()).filter(Boolean);
  return adminIds.some(id => member.roles.cache.has(id));
}

function formatDateShort(date) {
  return toDate(date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

// Accepte un objet Date ou une string ISO — toujours retourne un Date
function toDate(date) {
  if (date instanceof Date) return date;
  return new Date(date);
}

// Timestamp Unix Discord (<t:xxx:F>)
function discordTimestamp(date, style = "F") {
  return `<t:${Math.floor(toDate(date).getTime() / 1000)}:${style}>`;
}

function raidRoleName(date) {
  return `Raider du ${formatDateShort(date)}`;
}

module.exports = { isAdmin, formatDateShort, discordTimestamp, raidRoleName, toDate };
