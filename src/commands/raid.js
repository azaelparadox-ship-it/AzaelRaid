const {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle
} = require("discord.js");
const { isAdmin } = require("../utils/helpers");
const { createRaid, getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed } = require("../utils/embeds");
const { WOW_ROLES } = require("../utils/wowData");

// Parse une date saisie en heure de Paris (Europe/Paris) → objet Date UTC correct
function parseParisTZ(str) {
  const [datePart, timePart] = str.trim().split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute] = (timePart || "20:00").split(":").map(Number);

  // Utilise Intl pour déterminer l'offset Paris à cette date précise (gère DST)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parisOffset = getParisOffset(new Date(utcGuess));
  return new Date(utcGuess - parisOffset * 60 * 1000);
}

// Retourne l'offset Paris en minutes pour une date donnée
function getParisOffset(date) {
  const utcStr   = date.toLocaleString("en-US", { timeZone: "UTC" });
  const parisStr = date.toLocaleString("en-US", { timeZone: "Europe/Paris" });
  const diff = (new Date(parisStr) - new Date(utcStr)) / 60000;
  return diff;
}

const DIFFICULTIES = ["NM", "HM", "MM"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Lancer un raid viewer (admin/modo uniquement)")
    .addStringOption(opt =>
      opt.setName("difficulte")
        .setDescription("Difficulté du raid")
        .setRequired(true)
        .addChoices(
          { name: "Normal (NM)",       value: "NM" },
          { name: "Héroïque (HM)",     value: "HM" },
          { name: "Mythique (MM)",     value: "MM" }
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
      .setTitle(`Configurer le Raid Viewer (${difficulte})`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("raid_date")
          .setLabel("Date du raid (JJ/MM/AAAA HH:MM)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("21/06/2026 20:45")
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("vote_end")
          .setLabel("Fin du vote (JJ/MM/AAAA HH:MM)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("20/06/2026 20:00")
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction, difficulte) {
    const raidDateRaw = interaction.fields.getTextInputValue("raid_date").trim();
    const voteEndRaw  = interaction.fields.getTextInputValue("vote_end").trim();

    const raidDate   = parseParisTZ(raidDateRaw);
    const voteEndsAt = parseParisTZ(voteEndRaw);

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
    const embed = buildVoteEmbed(raid);
    const components = buildVoteComponents();

    // Ping le rôle communauté
    const msg = await voteChannel.send({
      content: `<@&${process.env.COMMUNITY_ROLE_ID}> 📣 Un nouveau vote de raid est disponible !`,
      embeds: [embed],
      components
    });

    updateRaid(interaction.guildId, { voteMessageId: msg.id });
    await interaction.editReply({ content: `✅ Sondage posté dans <#${process.env.VOTE_CHANNEL_ID}> !` });
  }
};

function buildVoteComponents() {
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
      .setCustomId("vote_close_manual")
      .setLabel("🔒 Clôturer le vote")
      .setStyle(ButtonStyle.Danger)
  );
  return [roleRow];
}

module.exports.buildVoteComponents = buildVoteComponents;
module.exports.parseParisTZ = parseParisTZ;
