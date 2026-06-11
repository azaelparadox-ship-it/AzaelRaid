const { SlashCommandBuilder } = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { getRaid, updateRaid } = require("../utils/store");
const { buildRegistrationEmbed } = require("../utils/embeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-kick")
    .setDescription("Retire un joueur du raid (admin/modo uniquement)")
    .addUserOption(opt =>
      opt.setName("joueur").setDescription("Le joueur à retirer").setRequired(true)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Permission insuffisante.", ephemeral: true });
    }

    const raid = getRaid(interaction.guildId);
    if (!raid || raid.phase !== "registration") {
      return interaction.reply({ content: "⚠️ Aucun raid en phase d'inscription en cours.", ephemeral: true });
    }

    const target = interaction.options.getUser("joueur");
    const before = raid.registrations.length;
    updateRaid(interaction.guildId, {
      registrations: raid.registrations.filter(r => r.userId !== target.id)
    });
    const updatedRaid = getRaid(interaction.guildId);

    if (updatedRaid.registrations.length === before) {
      return interaction.reply({ content: `⚠️ ${target.username} n'est pas inscrit au raid.`, ephemeral: true });
    }

    // Retirer le rôle provisoire
    try {
      const member = await interaction.guild.members.fetch(target.id);
      if (updatedRaid.raidRoleId) await member.roles.remove(updatedRaid.raidRoleId);
    } catch { /* membre introuvable ou déjà parti */ }

    // Mettre à jour l'embed des inscriptions
    try {
      const channel = await interaction.client.channels.fetch(process.env.RAID_CHANNEL_ID);
      const msg = await channel.messages.fetch(updatedRaid.registrationMessageId);
      const { buildRegistrationComponents } = require("../events/interactionCreate");
      await msg.edit({ embeds: [buildRegistrationEmbed(updatedRaid)], components: buildRegistrationComponents() });
    } catch { /* canal ou message introuvable */ }

    // Log dans le canal admin
    try {
      const logChannel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
      await logChannel.send(`🦵 **${interaction.user.username}** a retiré **${target.username}** du raid.`);
    } catch { /* pas de canal log configuré */ }

    await interaction.reply({ content: `✅ **${target.username}** a été retiré du raid.`, ephemeral: true });
  }
};
