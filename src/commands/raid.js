const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ComponentType
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { createRaid, getRaid } = require("../utils/store");
const { buildVoteEmbed } = require("../utils/embeds");
const { WOW_CLASSES, WOW_ROLES } = require("../utils/wowData");

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

    // Modal principal : saisie des créneaux et date de fin du vote
    const modal = new ModalBuilder()
      .setCustomId("raid_setup_modal")
      .setTitle("⚔️ Configurer le Raid Viewer");

    const slots = new TextInputBuilder()
      .setCustomId("slots")
      .setLabel("Créneaux à proposer (1 par ligne, ex: Samedi 21/06 20h45)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Samedi 21/06 20h45\nDimanche 22/06 20h45")
      .setRequired(true);

    const voteEnd = new TextInputBuilder()
      .setCustomId("vote_end")
      .setLabel("Fin du vote (JJ/MM/AAAA HH:MM, heure Paris)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("20/06/2025 20:00")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(slots),
      new ActionRowBuilder().addComponents(voteEnd)
    );

    await interaction.showModal(modal);
  },

  // Gestion du retour du modal
  async handleModal(interaction) {
    const slotsRaw = interaction.fields.getTextInputValue("slots");
    const voteEndRaw = interaction.fields.getTextInputValue("vote_end");

    // Parse date de fin
    const [datePart, timePart] = voteEndRaw.trim().split(" ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = (timePart || "20:00").split(":").map(Number);
    const voteEndsAt = new Date(year, month - 1, day, hour, minute, 0);

    if (isNaN(voteEndsAt.getTime()) || voteEndsAt <= new Date()) {
      return interaction.reply({ content: "❌ Date de fin de vote invalide ou déjà passée. Format : JJ/MM/AAAA HH:MM", ephemeral: true });
    }

    // Parse créneaux
    const slotLines = slotsRaw.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 5);
    if (slotLines.length < 1) {
      return interaction.reply({ content: "❌ Ajoute au moins un créneau.", ephemeral: true });
    }

    const slots = slotLines.map(label => ({ label, date: null })); // date parsée après le vote

    // Création du raid en store
    createRaid(interaction.guildId, {
      voteChannelId: interaction.channelId,
      voteMessageId: null,
      voteEndsAt,
      raidDate: null,
      slots,
      votes: {},
      registrations: [],
      eventId: null,
      raidRoleId: null,
      registrationMessageId: null,
      reminderSent: false,
      phase: "vote"
    });

    await interaction.deferReply();

    // Construction des composants du sondage
    const components = buildVoteComponents(slots);
    const embed = buildVoteEmbed({ voteEndsAt, slots, votes: {} });

    const msg = await interaction.editReply({ embeds: [embed], components });

    const { updateRaid } = require("../utils/store");
    updateRaid(interaction.guildId, { voteMessageId: msg.id });
  }
};

function buildVoteComponents(slots) {
  const rows = [];

  // Boutons de vote pour chaque créneau (max 5 par row)
  const slotRow = new ActionRowBuilder();
  const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];
  slots.forEach((slot, i) => {
    slotRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_slot_${i}`)
        .setLabel(slot.label)
        .setEmoji(emojis[i])
        .setStyle(ButtonStyle.Secondary)
    );
  });
  rows.push(slotRow);

  // Select classe
  const classSelect = new StringSelectMenuBuilder()
    .setCustomId("vote_class")
    .setPlaceholder("Choisis ta classe WoW")
    .addOptions(WOW_CLASSES.map(c => ({ label: c, value: c })));
  rows.push(new ActionRowBuilder().addComponents(classSelect));

  // Boutons rôle
  const roleRow = new ActionRowBuilder();
  WOW_ROLES.forEach(r => {
    roleRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_role_${r.value}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  });
  rows.push(roleRow);

  return rows;
}

module.exports.buildVoteComponents = buildVoteComponents;
