const { SlashCommandBuilder } = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { getRaid } = require("../utils/store");
const { buildGroupsEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-groupes")
    .setDescription("Génère et affiche les groupes du raid (admin/modo uniquement)"),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true });
    }

    const raid = getRaid(interaction.guildId);
    if (!raid || raid.phase !== "registration") {
      return interaction.reply({ content: "⚠️ Aucun raid en phase d'inscription.", ephemeral: true });
    }

    const actifs = raid.registrations.filter(r => r.role !== "Bench");
    const bench  = raid.registrations.filter(r => r.role === "Bench");

    if (actifs.length === 0) {
      return interaction.reply({ content: "⚠️ Aucun joueur inscrit (hors bench) pour l'instant.", ephemeral: true });
    }

    const groups = buildGroups(actifs);
    const embed  = buildGroupsEmbed(groups, raid.raidDate, bench);
    await interaction.reply({ embeds: [embed] });
  }
};

// Groupes de 5 — max 2 tanks et 5 heals par groupe
function buildGroups(registrations) {
  const tanks = [...registrations.filter(r => r.role === "Tank")];
  const heals = [...registrations.filter(r => r.role === "Heal")];
  const dps   = [...registrations.filter(r => r.role === "DPS")];

  const groups = [];
  const maxGroups = Math.max(Math.ceil(tanks.length / 2), Math.ceil(heals.length / 5), Math.ceil(dps.length / 3), 1);

  for (let i = 0; i < maxGroups; i++) {
    const group = [];

    // Max 2 tanks par groupe
    group.push(...tanks.splice(0, Math.min(2, tanks.length)));
    // Max 5 heals par groupe (en pratique 1-2)
    group.push(...heals.splice(0, Math.min(5, heals.length)));
    // 3 DPS pour compléter jusqu'à 5
    const dpsSlots = Math.max(0, 5 - group.length);
    group.push(...dps.splice(0, Math.min(dpsSlots, dps.length)));

    groups.push(group);
  }

  // Débordement de DPS → répartis dans les groupes existants
  let gi = 0;
  while (dps.length > 0) {
    groups[gi % groups.length].push(dps.shift());
    gi++;
  }

  return groups;
}
