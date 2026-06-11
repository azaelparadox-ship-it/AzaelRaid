const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const { getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed, buildRegistrationEmbed } = require("../utils/embeds");
const { WOW_CLASSES, WOW_ROLES } = require("../utils/wowData");
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

    // ── Modal de setup /raid ─────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "raid_setup_modal") {
      const { handleModal } = require("../commands/raid");
      await handleModal(interaction).catch(console.error);
      return;
    }

    // ── Modal switch de perso ─────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "switch_perso_modal") {
      await handleSwitchModal(interaction);
      return;
    }

    // ── Boutons et selects du vote ────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("vote_slot_")) {
      await handleVoteSlot(interaction);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "vote_class") {
      await handleVoteClass(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("vote_role_")) {
      await handleVoteRole(interaction);
      return;
    }

    // ── Boutons des inscriptions ──────────────────────────────────────
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

// ── Vote : choix du créneau ────────────────────────────────────────────
async function handleVoteSlot(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });

  const slotIndex = parseInt(interaction.customId.split("_")[2]);
  const existing = raid.votes[interaction.user.id] || {};
  updateRaid(interaction.guildId, {
    votes: { ...raid.votes, [interaction.user.id]: { ...existing, slotIndex } }
  });

  await refreshVoteMessage(interaction);
  await interaction.reply({ content: `✅ Créneau **${raid.slots[slotIndex].label}** sélectionné !`, ephemeral: true });
}

// ── Vote : choix de la classe ──────────────────────────────────────────
async function handleVoteClass(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });

  const wowClass = interaction.values[0];
  const existing = raid.votes[interaction.user.id] || {};
  updateRaid(interaction.guildId, {
    votes: { ...raid.votes, [interaction.user.id]: { ...existing, wowClass } }
  });

  await refreshVoteMessage(interaction);
  await interaction.reply({ content: `✅ Classe **${wowClass}** enregistrée !`, ephemeral: true });
}

// ── Vote : choix du rôle ───────────────────────────────────────────────
async function handleVoteRole(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });

  const role = interaction.customId.split("_")[2];
  const existing = raid.votes[interaction.user.id] || {};
  updateRaid(interaction.guildId, {
    votes: { ...raid.votes, [interaction.user.id]: { ...existing, role } }
  });

  await refreshVoteMessage(interaction);
  await interaction.reply({ content: `✅ Rôle **${role}** enregistré !`, ephemeral: true });
}

// Met à jour l'embed du vote sans changer les composants
async function refreshVoteMessage(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || !raid.voteMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(raid.voteChannelId);
    const msg = await channel.messages.fetch(raid.voteMessageId);
    await msg.edit({ embeds: [buildVoteEmbed(raid)], components: buildVoteComponents(raid.slots) });
  } catch { /* message supprimé ou canal inaccessible */ }
}

// ── Switch de perso (modal) ────────────────────────────────────────────
async function showSwitchModal(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId("switch_perso_modal")
    .setTitle("Modifier mon inscription");

  const classInput = new TextInputBuilder()
    .setCustomId("new_class")
    .setLabel("Nouvelle classe (ex: Mage)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const roleInput = new TextInputBuilder()
    .setCustomId("new_role")
    .setLabel("Nouveau rôle : Tank, Heal ou DPS")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const specInput = new TextInputBuilder()
    .setCustomId("new_spec")
    .setLabel("Spé (optionnel, ex: Feu)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(classInput),
    new ActionRowBuilder().addComponents(roleInput),
    new ActionRowBuilder().addComponents(specInput)
  );

  await interaction.showModal(modal);
}

async function handleSwitchModal(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });

  const newClass = interaction.fields.getTextInputValue("new_class").trim();
  const newRoleRaw = interaction.fields.getTextInputValue("new_role").trim();
  const newSpec = interaction.fields.getTextInputValue("new_spec").trim();

  const validRoles = ["Tank", "Heal", "DPS"];
  const newRole = validRoles.find(r => r.toLowerCase() === newRoleRaw.toLowerCase());
  if (!newRole) return interaction.reply({ content: "❌ Rôle invalide. Utilise Tank, Heal ou DPS.", ephemeral: true });

  const validClasses = WOW_CLASSES.map(c => c.toLowerCase());
  if (!validClasses.includes(newClass.toLowerCase())) {
    return interaction.reply({ content: `❌ Classe invalide. Classes disponibles : ${WOW_CLASSES.join(", ")}`, ephemeral: true });
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
  }

  updateRaid(interaction.guildId, { registrations: raid.registrations });
  await refreshRegistrationMessage(interaction, raid);

  // Log dans le canal admin si c'est un switch
  if (oldInfo) {
    try {
      const logChannel = await interaction.client.channels.fetch(process.env.LOG_CHANNEL_ID);
      await logChannel.send(`🔄 **${interaction.user.username}** a switché de **${oldInfo}** → **${newClass} ${newRole}**`);
    } catch { /* pas de canal log */ }
  }

  await interaction.reply({
    content: `✅ Inscription mise à jour : **${newClass}** — **${newRole}**${newSpec ? ` *(${newSpec})*` : ""}`,
    ephemeral: true
  });
}

// ── Désinscription ─────────────────────────────────────────────────────
async function handleLeave(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });

  const before = raid.registrations.length;
  updateRaid(interaction.guildId, {
    registrations: raid.registrations.filter(r => r.userId !== interaction.user.id)
  });

  const updatedRaid = getRaid(interaction.guildId);
  if (updatedRaid.registrations.length === before) {
    return interaction.reply({ content: "⚠️ Tu n'es pas inscrit au raid.", ephemeral: true });
  }

  // Retirer le rôle provisoire
  if (raid.raidRoleId) {
    try {
      await interaction.member.roles.remove(raid.raidRoleId);
    } catch { /* */ }
  }

  await refreshRegistrationMessage(interaction, updatedRaid);
  await interaction.reply({ content: "✅ Tu as été désinscrit du raid.", ephemeral: true });
}

// Met à jour l'embed des inscriptions
async function refreshRegistrationMessage(interaction, raid) {
  if (!raid.registrationMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(process.env.RAID_CHANNEL_ID);
    const msg = await channel.messages.fetch(raid.registrationMessageId);
    await msg.edit({ embeds: [buildRegistrationEmbed(raid)], components: buildRegistrationComponents() });
  } catch { /* */ }
}

// Composants du message d'inscriptions
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
