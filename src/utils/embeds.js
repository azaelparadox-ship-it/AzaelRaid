const { EmbedBuilder } = require("discord.js");
const { CLASS_EMOJI } = require("./wowData");
const { discordTimestamp } = require("./helpers");

// Embed du sondage de vote multi-dates
function buildVoteEmbed(raid) {
  const { voteEndsAt, slots, votes, difficulte } = raid;

  const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];

  // Compte les votes par slot
  const slotCounts = slots.map((slot, i) => {
    const voters = Object.values(votes).filter(v => v.dates && v.dates.includes(i));
    return { slot, i, voters };
  });

  // Résumé des rôles votants (tous slots confondus, dédupliqués)
  const allVoters  = Object.values(votes);
  const tanks = allVoters.filter(v => v.role === "Tank");
  const heals = allVoters.filter(v => v.role === "Heal");
  const dps   = allVoters.filter(v => v.role === "DPS");
  const bench = allVoters.filter(v => v.role === "Bench");

  const fmtRole = (list) => list.length
    ? list.map(v => `${CLASS_EMOJI[v.wowClass] || "❓"} ${v.wowClass}`).join("\n")
    : "*Aucun*";

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Raid Viewer ${difficulte ? `— ${difficulte}` : ""} — Vote des dates`)
    .setColor(0x9b59b6)
    .setDescription(
      `🗳️ **Fin du vote :** ${discordTimestamp(voteEndsAt)} (${discordTimestamp(voteEndsAt, "R")})\n\n` +
      `**Étape 1 —** Clique sur les dates qui t'arrangent (tu peux en cocher plusieurs)\n` +
      `**Étape 2 —** Choisis ton rôle et ta classe\n` +
      `🪑 *Bench = présent en renfort, pas prioritaire*`
    );

  // Chaque date avec son compteur
  slotCounts.forEach(({ slot, i, voters }) => {
    embed.addFields({
      name: `${emojis[i]} ${slot.label} — ${voters.length} dispo`,
      value: voters.length
        ? voters.map(v => `${CLASS_EMOJI[v.wowClass] || "❓"} ${v.username || "?"} (${v.role || "?"})`).join("\n")
        : "*Personne pour l'instant*",
      inline: false
    });
  });

  // Séparateur visuel
  embed.addFields(
    { name: "─────────────────", value: "**Composition actuelle**", inline: false },
    { name: `🛡️ Tanks (${tanks.length})`, value: fmtRole(tanks), inline: true },
    { name: `💚 Heals (${heals.length})`, value: fmtRole(heals), inline: true },
    { name: `⚔️ DPS (${dps.length})`,     value: fmtRole(dps),   inline: true },
    { name: `🪑 Bench (${bench.length})`,  value: fmtRole(bench), inline: false }
  );

  embed.setFooter({ text: "AzaelRaid • Les admins peuvent clôturer le vote manuellement" });
  return embed;
}

// Embed des inscriptions
function buildRegistrationEmbed(raid) {
  const tanks = raid.registrations.filter(r => r.role === "Tank");
  const heals = raid.registrations.filter(r => r.role === "Heal");
  const dps   = raid.registrations.filter(r => r.role === "DPS");
  const bench = raid.registrations.filter(r => r.role === "Bench");
  const total = raid.registrations.filter(r => r.role !== "Bench").length;

  const fmt = (list) => list.length
    ? list.map(r => `${CLASS_EMOJI[r.wowClass] || "❓"} **${r.username}** — ${r.wowClass}${r.specNote ? ` *(${r.specNote})*` : ""}`).join("\n")
    : "*Aucun*";

  return new EmbedBuilder()
    .setTitle(`⚔️ Raid Viewer ${raid.difficulte ? `— ${raid.difficulte} ` : ""}— ${discordTimestamp(raid.raidDate)}`)
    .setColor(0xe67e22)
    .setDescription(
      `**${total}** joueur(s) inscrit(s) + **${bench.length}** en bench\n` +
      `Utilise les boutons ci-dessous pour modifier ou annuler ton inscription.`
    )
    .addFields(
      { name: `🛡️ Tanks (${tanks.length})`,                         value: fmt(tanks), inline: false },
      { name: `💚 Heals (${heals.length})`,                         value: fmt(heals), inline: false },
      { name: `⚔️ DPS (${dps.length})`,                             value: fmt(dps),   inline: false },
      { name: `🪑 Bench (${bench.length}) — Renfort non prio`,      value: fmt(bench), inline: false }
    )
    .setFooter({ text: "AzaelRaid • Tu peux modifier ton inscription à tout moment" });
}

// Embed groupes
function buildGroupsEmbed(groups, raidDate, bench) {
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Groupes du Raid — ${discordTimestamp(raidDate)}`)
    .setColor(0x1abc9c);

  groups.forEach((group, i) => {
    const members = group.map(r =>
      `${CLASS_EMOJI[r.wowClass] || "❓"} **${r.username}** — ${r.wowClass} ${r.role}${r.specNote ? ` *(${r.specNote})*` : ""}`
    ).join("\n");
    embed.addFields({ name: `Groupe ${i + 1}`, value: members || "*Vide*", inline: false });
  });

  if (bench && bench.length > 0) {
    const benchList = bench.map(r =>
      `${CLASS_EMOJI[r.wowClass] || "❓"} **${r.username}** — ${r.wowClass}${r.specNote ? ` *(${r.specNote})*` : ""}`
    ).join("\n");
    embed.addFields({ name: `🪑 Bench (${bench.length})`, value: benchList, inline: false });
  }

  return embed;
}

module.exports = { buildVoteEmbed, buildRegistrationEmbed, buildGroupsEmbed };
