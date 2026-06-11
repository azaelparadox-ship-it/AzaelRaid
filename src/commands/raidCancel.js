const { SlashCommandBuilder } = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { getRaid, deleteRaid } = require("../utils/store");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-cancel")
    .setDescription("Annule le raid en cours et nettoie le rôle (admin/modo uniquement)"),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true });
    }

    const raid = getRaid(interaction.guildId);
    if (!raid || raid.phase === "done") {
      return interaction.reply({ content: "⚠️ Aucun raid actif à annuler.", ephemeral: true });
    }

    // Supprimer le rôle provisoire
    if (raid.raidRoleId) {
      try {
        const role = await interaction.guild.roles.fetch(raid.raidRoleId);
        if (role) await role.delete("Raid annulé");
      } catch { /* rôle déjà supprimé */ }
    }

    deleteRaid(interaction.guildId);

    await interaction.reply({ content: "🗑️ Le raid a été annulé et le rôle provisoire supprimé." });
  }
};
