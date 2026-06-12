const { EmbedBuilder } = require("discord.js");
const { CLASS_EMOJI } = require("./wowData");
const { discordTimestamp } = require("./helpers");

// Embed du sondage de vote
function buildVoteEmbed(raid) {
  const { voteEndsAt, raidDate, votes } = raid;

  // Compter les votes par rôle
  const tanks = Object.values(votes).filter(v => v.role === "Tank");
  const heals = Object.values(votes).filter(v => v.role === "Heal");
  const dps   = Object.values(votes).filter(v => v.role === "DPS");

  const fmtVoters = (list) => list.length
    ? list.map(v => `${CLASS_EMOJI[v.wowClass] || "❓"} ${v.wowClass}`).join("\n")
    : "*Aucun pour l'instant*";

  return new EmbedBuilder()
    .setTitle("⚔️ Raid Viewer — Disponibilité")
    .setColor(0x9b59b6)
    .setDescription(
      `📅 **Date du raid :** ${discordTimestamp(raidDate)} (${discordTimestamp(raidDate, "R")})\n` +
      `🗳️ **Fin du vote :** ${discordTimestamp(voteEndsAt)} (${discordTimestamp(voteEndsAt, "R")})\n\n` +
      `Clique sur ton rôle pour voter, puis choisis ta classe.\n` +
      `Tu peux modifier ton vote à tout moment.`
    )
    .addFields(
      { name: `🛡️ Tanks (${tanks.length})`, value: fmtVoters(tanks), inline: true },
      { name: `💚 Heals (${heals.length})`, value: fmtVoters(heals), inline: true },
      { name: `⚔️ DPS (${dps.length})`,     value: fmtVoters(dps),   inline: true }
    )
    .setFooter({ text: "AzaelRaid • Les admins peuvent clôturer le vote manuellement" });
}

// Embed des inscriptions
function buildRegistrationEmbed(raid) {
  const tanks = raid.registrations.filter(r => r.role === "Tank");
  const heals = raid.registrations.filter(r => r.role === "Heal");
  const dps   = raid.registrations.filter(r => r.role === "DPS");

  const fmt = (list) => list.length
    ? list.map(r => `${CLASS_EMOJI[r.wowClass] || "❓"} **${r.username}** — ${r.wowClass}${r.specNote ? ` *(${r.specNote})*` : ""}`).join("\n")
    : "*Aucun*";

  return new EmbedBuilder()
    .setTitle(`⚔️ Raid Viewer — ${discordTimestamp(raid.raidDate)}`)
    .setColor(0xe67e22)
    .setDescription(
      `${raid.registrations.length} joueur(s) inscrit(s)\n` +
      `Utilise les boutons ci-dessous pour modifier ou annuler ton inscription.`
    )
    .addFields(
      { name: `🛡️ Tanks (${tanks.length})`, value: fmt(tanks), inline: false },
      { name: `💚 Heals (${heals.length})`, value: fmt(heals), inline: false },
      { name: `⚔️ DPS (${dps.length})`,     value: fmt(dps),   inline: false }
    )
    .setFooter({ text: "AzaelRaid • Tu peux modifier ton inscription à tout moment" });
}

// Embed résumé des groupes
function buildGroupsEmbed(groups, raidDate) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Groupes du Raid — ${discordTimestamp(raidDate)}`)
    .setColor(0x1abc9c);

  groups.forEach((group, i) => {
    const members = group.map(r =>
      `${CLASS_EMOJI[r.wowClass] || "❓"} **${r.username}** — ${r.wowClass} ${r.role}${r.specNote ? ` *(${r.specNote})*` : ""}`
    ).join("\n");
    embed.addFields({ name: `Groupe ${i + 1}`, value: members || "*Vide*", inline: false });
  });

  return embed;
}

module.exports = { buildVoteEmbed, buildRegistrationEmbed, buildGroupsEmbed };
