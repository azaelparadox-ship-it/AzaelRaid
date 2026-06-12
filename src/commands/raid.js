const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { createRaid, getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed } = require("../utils/embeds");
const { WOW_ROLES } = require("../utils/wowData");

// Parse une date + heure séparés, en heure de Paris → Date UTC correct
function parseParisTZ(datePart, timePart) {
  // Nettoie et accepte JJ/MM/AAAA ou JJ-MM-AAAA
  const cleanDate = datePart.trim().replace(/-/g, "/");
  const cleanTime = (timePart || "20:00").trim().replace("h", ":");

  const [day, month, year] = cleanDate.split("/").map(Number);
  const [hour, minute]     = cleanTime.split(":").map(Number);

  if ([day, month, year, hour, minute].some(isNaN)) return null;

  const utcGuess    = Date.UTC(year, month - 1, day, hour, minute);
  const parisOffset = getParisOffset(new Date(utcGuess));
  return new Date(utcGuess - parisOffset * 60 * 1000);
}

function getParisOffset(date) {
  const utcStr   = date.toLocaleString("en-US", { timeZone: "UTC" });
  const parisStr = date.toLocaleString("en-US", { timeZone: "Europe/Paris" });
  return (new Date(parisStr) - new Date(utcStr)) / 60000;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Lancer un raid viewer (admin/modo uniquement)")
    .addStringOption(opt =>
      opt.setName("difficulte")
        .setDescription("Difficulté du raid")
        .setRequired(true)
        .addChoices(
          { name: "Normal (NM)",   value: "NM" },
          { name: "Héroïque (HM)", value: "HM" },
          { name: "Mythique (MM)", value: "MM" }
        )
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Tu n'as pas la permission d'utiliser cette commande.", ephemeral: true });
    }

    const existing = getRaid(interaction.guildId);
    if (existing && existing.phase !== "done") {
      return interaction.reply({ content: "⚠️ Un raid est déjà en cours ! Utilise `/raid-cancel` pour l'annuler d'abord.", ephemeral: true });
    }

    const difficulte = interaction.options.getString("difficulte");

    const modal = new ModalBuilder()
      .setCustomId(`raid_setup_modal_${difficulte}`)
      .setTitle(`Raid Viewer ${difficulte} — Dates`);

    modal.addComponents(
      // ── Date du raid ──────────────────────────────────────────────
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("raid_date")
          .setLabel("Date du raid (JJ/MM/AAAA)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("ex : 21/06/2026")
          .setMinLength(8)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("raid_time")
          .setLabel("Heure du raid (HH:MM) — heure Paris")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("ex : 20:45")
          .setMinLength(4)
          .setMaxLength(5)
          .setRequired(true)
      ),
      // ── Fin du vote ───────────────────────────────────────────────
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_end_date")
          .setLabel("Fin du vote — Date (JJ/MM/AAAA)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("ex : 20/06/2026")
          .setMinLength(8)
          .setMaxLength(10)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_end_time")
          .setLabel("Fin du vote — Heure (HH:MM) — heure Paris")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("ex : 20:00")
          .setMinLength(4)
          .setMaxLength(5)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction, difficulte) {
    const raidDate   = parseParisTZ(
      interaction.fields.getTextInputValue("raid_date"),
      interaction.fields.getTextInputValue("raid_time")
    );
    const voteEndsAt = parseParisTZ(
      interaction.fields.getTextInputValue("vote_end_date"),
      interaction.fields.getTextInputValue("vote_end_time")
    );

    if (!raidDate) {
      return interaction.reply({ content: "❌ Date ou heure du raid invalide.\nFormat date : **JJ/MM/AAAA** — Format heure : **HH:MM**", ephemeral: true });
    }
    if (!voteEndsAt || voteEndsAt <= new Date()) {
      return interaction.reply({ content: "❌ Date ou heure de fin de vote invalide ou déjà passée.\nFormat date : **JJ/MM/AAAA** — Format heure : **HH:MM**", ephemeral: true });
    }
    if (voteEndsAt >= raidDate) {
      return interaction.reply({ content: "❌ La fin du vote doit être **avant** la date du raid.", ephemeral: true });
    }

    createRaid(interaction.guildId, {
      voteChannelId: process.env.VOTE_CHANNEL_ID,
      voteMessageId: null,
      voteEndsAt,
      raidDate,
      difficulte,
      votes: {},
      registrations: [],
      eventId: null,
      raidRoleId: null,
      registrationMessageId: null,
      reminderSent: false,
      phase: "vote"
    });

    await interaction.deferReply({ ephemeral: true });

    const voteChannel = await interaction.client.channels.fetch(process.env.VOTE_CHANNEL_ID);
    const raid = getRaid(interaction.guildId);

    const msg = await voteChannel.send({
      content: `<@&${process.env.COMMUNITY_ROLE_ID}> 📣 Un nouveau vote de raid est disponible !`,
      embeds: [buildVoteEmbed(raid)],
      components: buildVoteComponents()
    });

    updateRaid(interaction.guildId, { voteMessageId: msg.id });
    await interaction.editReply({ content: `✅ Sondage posté dans <#${process.env.VOTE_CHANNEL_ID}> !` });
  }
};

function buildVoteComponents() {
  // Ligne 1 : Tank / Heal / DPS / Bench
  const roleRow = new ActionRowBuilder();
  WOW_ROLES.forEach(r => {
    roleRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_role_${r.value}`)
        .setLabel(r.label)
        .setStyle(ButtonStyle.Primary)
    );
  });
  roleRow.addComponents(
    new ButtonBuilder()
      .setCustomId("vote_role_Bench")
      .setLabel("🪑 Bench")
      .setStyle(ButtonStyle.Secondary)
  );

  // Ligne 2 : clôture manuelle (admin)
  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("vote_close_manual")
      .setLabel("🔒 Clôturer le vote")
      .setStyle(ButtonStyle.Danger)
  );

  return [roleRow, adminRow];
}

module.exports.buildVoteComponents = buildVoteComponents;
module.exports.parseParisTZ = parseParisTZ;
