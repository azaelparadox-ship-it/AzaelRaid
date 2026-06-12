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

    if (raid.registrations.length === 0) {
      return interaction.reply({ content: "⚠️ Aucun joueur inscrit pour l'instant.", ephemeral: true });
    }

    const actifs = raid.registrations.filter(r => r.role !== "Bench");
    const bench  = raid.registrations.filter(r => r.role === "Bench");
    const groups = buildGroups(actifs);
    const embed = buildGroupsEmbed(groups, raid.raidDate, bench);
    await interaction.reply({ embeds: [embed] });
  }
};

// Algorithme de groupage : groupes de 5 en équilibrant Tank/Heal/DPS
// 1 Tank + 1 Heal + 3 DPS par groupe idéalement
function buildGroups(registrations) {
  const tanks = registrations.filter(r => r.role === "Tank");
  const heals = registrations.filter(r => r.role === "Heal");
  const dps   = registrations.filter(r => r.role === "DPS");

  const groups = [];
  const maxGroups = Math.max(tanks.length, heals.length, Math.ceil(dps.length / 3), 1);

  for (let i = 0; i < maxGroups; i++) {
    const group = [];
    if (tanks[i]) group.push(tanks[i]);
    if (heals[i]) group.push(heals[i]);
    // 3 DPS par groupe
    const dpsForGroup = dps.splice(0, Math.min(3, dps.length));
    group.push(...dpsForGroup);
    groups.push(group);
  }

  // S'il reste des DPS, on les répartit
  let extra = [...dps];
  let gi = 0;
  while (extra.length > 0) {
    groups[gi % groups.length].push(extra.shift());
    gi++;
  }

  return groups;
}
