const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { createRaid, getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed } = require("../utils/embeds");
const { WOW_ROLES } = require("../utils/wowData");

function parseParisTZ(datePart, timePart) {
  const cleanDate = (datePart || "").trim().replace(/-/g, "/");
  const cleanTime = (timePart || "20:00").trim().replace("h", ":");
  const [day, month, year] = cleanDate.split("/").map(Number);
  const [hour, minute]     = cleanTime.split(":").map(Number);
  if ([day, month, year, hour, minute].some(v => isNaN(v))) return null;
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
      return interaction.reply({ content: "❌ Tu n'as pas la permission.", ephemeral: true });
    }
    const existing = getRaid(interaction.guildId);
    if (existing && existing.phase !== "done") {
      return interaction.reply({ content: "⚠️ Un raid est déjà en cours ! Utilise `/raid-cancel` d'abord.", ephemeral: true });
    }

    const difficulte = interaction.options.getString("difficulte");

    const modal = new ModalBuilder()
      .setCustomId(`raid_setup_modal_${difficulte}`)
      .setTitle(`Raid ${difficulte} — Proposer des dates`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("dates")
          .setLabel("Dates proposées (1 par ligne, JJ/MM/AAAA HH:MM)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("21/06/2026 20:45\n22/06/2026 20:45\n28/06/2026 20:45")
          .setMinLength(5)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_end_date")
          .setLabel("Fin du vote — Date (JJ/MM/AAAA)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("20/06/2026")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_end_time")
          .setLabel("Fin du vote — Heure (HH:MM) heure Paris")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("20:00")
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction, difficulte) {
    const datesRaw   = interaction.fields.getTextInputValue("dates");
    const voteEndsAt = parseParisTZ(
      interaction.fields.getTextInputValue("vote_end_date"),
      interaction.fields.getTextInputValue("vote_end_time")
    );

    if (!voteEndsAt || voteEndsAt <= new Date()) {
      return interaction.reply({ content: "❌ Date de fin de vote invalide ou déjà passée.", ephemeral: true });
    }

    // Parse les dates proposées
    const slots = [];
    for (const line of datesRaw.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 5)) {
      const parts = line.split(" ");
      const date  = parseParisTZ(parts[0], parts[1]);
      if (!date) {
        return interaction.reply({ content: `❌ Date invalide : **${line}**\nFormat attendu : JJ/MM/AAAA HH:MM`, ephemeral: true });
      }
      if (date <= voteEndsAt) {
        return interaction.reply({ content: `❌ La date **${line}** doit être après la fin du vote.`, ephemeral: true });
      }
      slots.push({ label: line, date });
    }

    if (slots.length < 1) {
      return interaction.reply({ content: "❌ Ajoute au moins une date.", ephemeral: true });
    }

    createRaid(interaction.guildId, {
      voteChannelId: process.env.VOTE_CHANNEL_ID,
      voteMessageId: null,
      voteEndsAt,
      raidDate: null,       // sera déterminé à la clôture
      slots,
      difficulte,
      votes: {},            // userId → { dates: [0,2], role, wowClass, username }
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
      components: buildVoteComponents(slots)
    });

    updateRaid(interaction.guildId, { voteMessageId: msg.id });
    await interaction.editReply({ content: `✅ Sondage posté dans <#${process.env.VOTE_CHANNEL_ID}> !` });
  }
};

// Composants du sondage — 1 bouton par date + rôle/bench + clôture
function buildVoteComponents(slots) {
  const rows = [];

  // Ligne(s) de dates — max 5 boutons par row
  const dateRow = new ActionRowBuilder();
  const emojis  = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];
  slots.forEach((slot, i) => {
    dateRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_date_${i}`)
        .setLabel(slot.label)
        .setEmoji(emojis[i])
        .setStyle(ButtonStyle.Secondary)
    );
  });
  rows.push(dateRow);

  // Ligne rôles + bench
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
  rows.push(roleRow);

  // Ligne clôture admin
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("vote_close_manual")
        .setLabel("🔒 Clôturer le vote")
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

module.exports.buildVoteComponents = buildVoteComponents;
module.exports.parseParisTZ = parseParisTZ;
