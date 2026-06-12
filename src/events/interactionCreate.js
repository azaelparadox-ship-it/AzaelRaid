const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const { getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed, buildRegistrationEmbed } = require("../utils/embeds");
const { getClassesForRole, ALL_CLASSES } = require("../utils/wowData");
const { isAdmin, discordTimestamp } = require("../utils/helpers");
const { buildVoteComponents } = require("../commands/raid");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    // ── Commandes slash ──────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction).catch(console.error);
      return;
    }

    // ── Modal setup /raid ────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("raid_setup_modal")) {
      const { handleModal } = require("../commands/raid");
      const diff = interaction.customId.split('_').pop();
      await handleModal(interaction, diff).catch(console.error);
      return;
    }

    // ── Modal switch de perso ────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "switch_perso_modal") {
      await handleSwitchModal(interaction);
      return;
    }

    // ── Bouton clôture manuelle du vote ──────────────────────────────
    if (interaction.isButton() && interaction.customId === "vote_close_manual") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Réservé aux admins/modos.", ephemeral: true });
      }
      const { closeVote } = require("./voteScheduler");
      await interaction.deferReply({ ephemeral: true });
      await closeVote(getRaid(interaction.guildId), interaction.client);
      await interaction.editReply({ content: "✅ Vote clôturé et event créé !" });
      return;
    }

    // ── Bouton choix du rôle (vote) ──────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("vote_role_")) {
      await handleVoteRole(interaction);
      return;
    }

    // ── Select choix de la classe (vote) ────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "vote_class") {
      await handleVoteClass(interaction);
      return;
    }

    // ── Boutons inscriptions ─────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === "reg_switch") {
      await showSwitchModal(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "reg_leave") {
      await handleLeave(interaction);
      return;
    }
  }
};

// ── Vote : clic sur un rôle → affiche le select de classe adapté ──────
async function handleVoteRole(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") {
    return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });
  }

  const role = interaction.customId.split("_")[2]; // Tank | Heal | DPS | Bench
  // Le bench peut jouer n'importe quelle classe
  const classes = role === "Bench" ? require("../utils/wowData").ALL_CLASSES : getClassesForRole(role);

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("vote_class")
      .setPlaceholder(`Choisis ta classe (${role})`)
      .addOptions(classes.map(c => ({ label: c, value: `${role}|${c}` })))
  );

  await interaction.reply({
    content: `Tu as choisi **${role}** — sélectionne maintenant ta classe :`,
    components: [selectRow],
    ephemeral: true
  });
}

// ── Vote : sélection de la classe ─────────────────────────────────────
async function handleVoteClass(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") {
    return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });
  }

  const [role, wowClass] = interaction.values[0].split("|");

  updateRaid(interaction.guildId, {
    votes: {
      ...raid.votes,
      [interaction.user.id]: {
        role,
        wowClass,
        username: interaction.member?.displayName || interaction.user.username
      }
    }
  });

  await refreshVoteMessage(interaction);
  await interaction.update({
    content: `✅ Vote enregistré : **${wowClass}** en **${role}** !`,
    components: []
  });
}

// Rafraîchit l'embed du sondage
async function refreshVoteMessage(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid?.voteMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(raid.voteChannelId);
    const msg = await channel.messages.fetch(raid.voteMessageId);
    await msg.edit({ embeds: [buildVoteEmbed(raid)], components: buildVoteComponents() });
  } catch (e) { console.error("refreshVoteMessage:", e.message); }
}

// ── Switch de perso ───────────────────────────────────────────────────
async function showSwitchModal(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") {
    return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });
  }

  const existing = raid.registrations.find(r => r.userId === interaction.user.id);

  const modal = new ModalBuilder()
    .setCustomId("switch_perso_modal")
    .setTitle("Modifier mon inscription");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_role")
        .setLabel("Rôle : Tank, Heal ou DPS")
        .setStyle(TextInputStyle.Short)
        .setValue(existing?.role || "")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_class")
        .setLabel("Classe (ex: Mage, Druide...)")
        .setStyle(TextInputStyle.Short)
        .setValue(existing?.wowClass || "")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_spec")
        .setLabel("Spé (optionnel, ex: Feu)")
        .setStyle(TextInputStyle.Short)
        .setValue(existing?.specNote || "")
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handleSwitchModal(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") {
    return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });
  }

  const newRoleRaw = interaction.fields.getTextInputValue("new_role").trim();
  const newClass   = interaction.fields.getTextInputValue("new_class").trim();
  const newSpec    = interaction.fields.getTextInputValue("new_spec").trim();

  const validRoles = ["Tank", "Heal", "DPS"];
  const newRole = validRoles.find(r => r.toLowerCase() === newRoleRaw.toLowerCase());
  if (!newRole) return interaction.reply({ content: "❌ Rôle invalide. Utilise Tank, Heal ou DPS.", ephemeral: true });

  // Vérification classe selon rôle
  const allowed = getClassesForRole(newRole).map(c => c.toLowerCase());
  if (!allowed.includes(newClass.toLowerCase())) {
    return interaction.reply({
      content: `❌ **${newClass}** ne peut pas jouer **${newRole}**.\nClasses disponibles : ${getClassesForRole(newRole).join(", ")}`,
      ephemeral: true
    });
  }

  const existing = raid.registrations.find(r => r.userId === interaction.user.id);
  const oldInfo = existing ? `${existing.wowClass} ${existing.role}` : null;

  if (existing) {
    existing.wowClass = newClass;
    existing.role = newRole;
    existing.specNote = newSpec;
  } else {
    raid.registrations.push({
      userId: interaction.user.id,
      username: interaction.member?.displayName || interaction.user.username,
      wowClass: newClass,
      role: newRole,
      specNote: newSpec
    });
    // Assigner le rôle provisoire
    if (raid.raidRoleId) {
      try { await interaction.member.roles.add(raid.raidRoleId); } catch {}
    }
  }

  updateRaid(interaction.guildId, { registrations: raid.registrations });
  await refreshRegistrationMessage(interaction, getRaid(interaction.guildId));

  if (oldInfo) {
    try {
      const logChannel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
      await logChannel.send(`🔄 **${interaction.user.username}** a switché : **${oldInfo}** → **${newClass} ${newRole}**`);
    } catch {}
  }

  await interaction.reply({
    content: `✅ Inscription mise à jour : **${newClass}** — **${newRole}**${newSpec ? ` *(${newSpec})*` : ""}`,
    ephemeral: true
  });
}

// ── Désinscription ────────────────────────────────────────────────────
async function handleLeave(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") {
    return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });
  }

  const before = raid.registrations.length;
  updateRaid(interaction.guildId, {
    registrations: raid.registrations.filter(r => r.userId !== interaction.user.id)
  });

  if (getRaid(interaction.guildId).registrations.length === before) {
    return interaction.reply({ content: "⚠️ Tu n'es pas inscrit au raid.", ephemeral: true });
  }

  if (raid.raidRoleId) {
    try { await interaction.member.roles.remove(raid.raidRoleId); } catch {}
  }

  await refreshRegistrationMessage(interaction, getRaid(interaction.guildId));
  await interaction.reply({ content: "✅ Tu as été désinscrit du raid.", ephemeral: true });
}

// Rafraîchit l'embed des inscriptions
async function refreshRegistrationMessage(interaction, raid) {
  if (!raid?.registrationMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(process.env.RAID_CHANNEL_ID);
    const msg = await channel.messages.fetch(raid.registrationMessageId);
    await msg.edit({ embeds: [buildRegistrationEmbed(raid)], components: buildRegistrationComponents() });
  } catch (e) { console.error("refreshRegistrationMessage:", e.message); }
}

function buildRegistrationComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reg_switch").setLabel("✏️ Modifier mon perso").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("reg_leave").setLabel("❌ Se désinscrire").setStyle(ButtonStyle.Danger)
    )
  ];
}

module.exports.buildRegistrationComponents = buildRegistrationComponents;
module.exports.refreshRegistrationMessage = refreshRegistrationMessage;
