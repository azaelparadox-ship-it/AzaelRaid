const { PermissionFlagsBits } = require("discord.js");

// Vérifie si un membre a un des rôles admin configurés
function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminIds = (process.env.ADMIN_ROLE_IDS || "").split(",").map(r => r.trim()).filter(Boolean);
  return adminIds.some(id => member.roles.cache.has(id));
}

// Formate une date en français : "Samedi 14 juin à 20h45"
function formatDate(date) {
  return date.toLocaleString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris"
  }).replace(":", "h");
}

// Formate une date courte pour le nom du rôle : "14/06/2025"
function formatDateShort(date) {
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}

// Timestamp Unix Discord (<t:xxx:F>)
function discordTimestamp(date, style = "F") {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

// Construit le nom du rôle provisoire
function raidRoleName(date) {
  return `Raider du ${formatDateShort(date)}`;
}

module.exports = { isAdmin, formatDate, formatDateShort, discordTimestamp, raidRoleName };
