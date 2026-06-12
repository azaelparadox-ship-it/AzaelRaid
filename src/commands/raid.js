const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { createRaid, getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed } = require("../utils/embeds");
const { WOW_ROLES, getClassesForRole } = require("../utils/wowData");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Lancer un raid viewer (admin/modo uniquement)"),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    }

    const existing = getRaid(interaction.guildId);
    if (existing && existing.phase !== "done") {
      return interaction.reply({ content: "⚠️ Un raid est déjà en cours ! Utilise `/raid-cancel` pour l'annuler d'abord.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId("raid_setup_modal")
      .setTitle("Configurer le Raid Viewer");

    const raidDateInput = new TextInputBuilder()
      .setCustomId("raid_date")
      .setLabel("Date du raid (JJ/MM/AAAA HH:MM)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("21/06/2026 20:45")
      .setRequired(true);

    const voteEndInput = new TextInputBuilder()
      .setCustomId("vote_end")
      .setLabel("Fin du vote (JJ/MM/AAAA HH:MM)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("20/06/2026 20:00")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(raidDateInput),
      new ActionRowBuilder().addComponents(voteEndInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const raidDateRaw = interaction.fields.getTextInputValue("raid_date").trim();
    const voteEndRaw  = interaction.fields.getTextInputValue("vote_end").trim();

    const parseDate = (str) => {
      const [datePart, timePart] = str.split(" ");
      const [day, month, year] = datePart.split("/").map(Number);
      const [hour, minute] = (timePart || "20:00").split(":").map(Number);
      return new Date(year, month - 1, day, hour, minute, 0);
    };

    const raidDate  = parseDate(raidDateRaw);
    const voteEndsAt = parseDate(voteEndRaw);

    if (isNaN(raidDate.getTime())) {
      return interaction.reply({ content: "❌ Date du raid invalide. Format : JJ/MM/AAAA HH:MM", ephemeral: true });
    }
    if (isNaN(voteEndsAt.getTime()) || voteEndsAt <= new Date()) {
      return interaction.reply({ content: "❌ Date de fin de vote invalide ou déjà passée.", ephemeral: true });
    }
    if (voteEndsAt >= raidDate) {
      return interaction.reply({ content: "❌ La fin du vote doit être avant la date du raid.", ephemeral: true });
    }

    createRaid(interaction.guildId, {
      voteChannelId: process.env.VOTE_CHANNEL_ID,
      voteMessageId: null,
      voteEndsAt,
      raidDate,
      votes: {},
      registrations: [],
      eventId: null,
      raidRoleId: null,
      registrationMessageId: null,
      reminderSent: false,
      phase: "vote"
    });

    await interaction.deferReply({ ephemeral: true });

    // Poster le sondage dans le canal vote
    const voteChannel = await interaction.client.channels.fetch(process.env.VOTE_CHANNEL_ID);
    const raid = getRaid(interaction.guildId);
    const embed = buildVoteEmbed(raid);
    const components = buildVoteComponents();

    const msg = await voteChannel.send({ embeds: [embed], components });
    updateRaid(interaction.guildId, { voteMessageId: msg.id });

    await interaction.editReply({ content: `✅ Sondage posté dans <#${process.env.VOTE_CHANNEL_ID}> !` });
  }
};

// Composants du sondage de vote
function buildVoteComponents() {
  const rows = [];

  // Boutons de rôle (1er choix — détermine les classes disponibles)
  const roleRow = new ActionRowBuilder();
  WOW_ROLES.forEach(r => {
    roleRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_role_${r.value}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  });
  // Bouton clôturer le vote (admin)
  roleRow.addComponents(
    new ButtonBuilder()
      .setCustomId("vote_close_manual")
      .setLabel("🔒 Clôturer le vote")
      .setStyle(ButtonStyle.Danger)
  );
  rows.push(roleRow);

  return rows;
}

module.exports.buildVoteComponents = buildVoteComponents;
