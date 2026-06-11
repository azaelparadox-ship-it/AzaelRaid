const { EmbedBuilder } = require("discord.js");
const { CLASS_EMOJI } = require("./wowData");
const { discordTimestamp } = require("./helpers");

// Embed du sondage de vote
function buildVoteEmbed(raid) {
  const embed = new EmbedBuilder()
    .setTitle("⚔️ Raid Viewer — Vote pour le créneau")
    .setColor(0x9b59b6)
    .setDescription(
      `Vote pour le créneau qui t'arrange le mieux !\n` +
      `Sélectionne aussi ta **classe** et ton **rôle** ci-dessous.\n\n` +
      `🗳️ Le vote se clôture ${discordTimestamp(raid.voteEndsAt)} (${discordTimestamp(raid.voteEndsAt, "R")})`
    )
    .setFooter({ text: "AzaelRaid • Tu peux changer ton vote à tout moment" });

  raid.slots.forEach((slot, i) => {
    const voters = Object.entries(raid.votes)
      .filter(([, v]) => v.slotIndex === i)
      .map(([, v]) => `${CLASS_EMOJI[v.wowClass] || "❓"} ${v.wowClass} (${v.role})`)
      .join("\n") || "*Aucun vote pour l'instant*";
    embed.addFields({ name: `${["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][i] || `Créneau ${i+1}`} ${slot.label}`, value: voters });
  });

  return embed;
}

// Embed des inscriptions (affiché dans le canal raid)
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
    .setDescription(`${raid.registrations.length} joueur(s) inscrit(s)\nUtilise les boutons ci-dessous pour t'inscrire, modifier ou te désinscrire.`)
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
