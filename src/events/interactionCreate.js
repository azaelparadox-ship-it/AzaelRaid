const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const { getRaid, updateRaid } = require("../utils/store");
const { buildVoteEmbed, buildRegistrationEmbed } = require("../utils/embeds");
const { getClassesForRole, ALL_CLASSES } = require("../utils/wowData");
const { isAdmin } = require("../utils/helpers");
const { buildVoteComponents } = require("../commands/raid");

module.exports = {
  name: "interactionCreate",

  async execute(interaction, client) {
    // Commandes slash
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction).catch(console.error);
      return;
    }

    // Modal setup /raid
    if (interaction.isModalSubmit() && interaction.customId.startsWith("raid_setup_modal")) {
      const diff = interaction.customId.split("_").pop();
      const { handleModal } = require("../commands/raid");
      await handleModal(interaction, diff).catch(console.error);
      return;
    }

    // Modal switch de perso
    if (interaction.isModalSubmit() && interaction.customId === "switch_perso_modal") {
      await handleSwitchModal(interaction);
      return;
    }

    // Clôture manuelle du vote
    if (interaction.isButton() && interaction.customId === "vote_close_manual") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Réservé aux admins/modos.", ephemeral: true });
      }
      const raid = getRaid(interaction.guildId);
      if (!raid || raid.phase !== "vote") {
        return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const { closeVote } = require("./voteScheduler");
      await closeVote(raid, interaction.client);
      await interaction.editReply({ content: "✅ Vote clôturé et event créé !" });
      return;
    }

    // Clic sur une date du sondage
    if (interaction.isButton() && interaction.customId.startsWith("vote_date_")) {
      await handleVoteDate(interaction);
      return;
    }

    // Clic sur un rôle du sondage
    if (interaction.isButton() && interaction.customId.startsWith("vote_role_")) {
      await handleVoteRole(interaction);
      return;
    }

    // Sélection de la classe
    if (interaction.isStringSelectMenu() && interaction.customId === "vote_class") {
      await handleVoteClass(interaction);
      return;
    }

    // Boutons inscriptions
    if (interaction.isButton() && interaction.customId === "reg_join") {
      await showJoinModal(interaction);
      return;
    }
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

// ── Vote : toggle d'une date ───────────────────────────────────────────
async function handleVoteDate(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") {
    return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });
  }

  const slotIndex = parseInt(interaction.customId.split("_")[2]);
  const existing  = raid.votes[interaction.user.id] || { dates: [], username: interaction.member?.displayName || interaction.user.username };
  const dates     = existing.dates || [];

  // Toggle : ajoute ou retire la date
  const newDates = dates.includes(slotIndex)
    ? dates.filter(d => d !== slotIndex)
    : [...dates, slotIndex];

  updateRaid(interaction.guildId, {
    votes: { ...raid.votes, [interaction.user.id]: { ...existing, dates: newDates } }
  });

  await refreshVoteMessage(interaction);

  const action = dates.includes(slotIndex) ? "retirée ❌" : "ajoutée ✅";
  await interaction.reply({
    content: `Date **${raid.slots[slotIndex].label}** ${action} de tes disponibilités !\n${newDates.length > 0 ? `Tu as coché **${newDates.length}** date(s).` : "Tu n'as coché aucune date."}\n\nN'oublie pas de choisir ton **rôle et ta classe** ci-dessous !`,
    ephemeral: true
  });
}

// ── Vote : clic sur un rôle → select classe adapté ────────────────────
async function handleVoteRole(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "vote") {
    return interaction.reply({ content: "⚠️ Aucun vote en cours.", ephemeral: true });
  }

  const role    = interaction.customId.split("_")[2];
  const classes = role === "Bench" ? ALL_CLASSES : getClassesForRole(role);

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("vote_class")
      .setPlaceholder(`Classe pour ${role}`)
      .addOptions(classes.map(c => ({ label: c, value: `${role}|${c}` })))
  );

  await interaction.reply({
    content: `Rôle **${role}** sélectionné — choisis ta classe :`,
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
  const existing = raid.votes[interaction.user.id] || { dates: [] };

  updateRaid(interaction.guildId, {
    votes: {
      ...raid.votes,
      [interaction.user.id]: {
        ...existing,
        role,
        wowClass,
        username: interaction.member?.displayName || interaction.user.username
      }
    }
  });

  await refreshVoteMessage(interaction);

  const datesCount = (existing.dates || []).length;
  await interaction.update({
    content: `✅ **${wowClass}** en **${role}** enregistré !${datesCount === 0 ? "\n⚠️ Tu n'as pas encore coché de date disponible !" : `\nTu es dispo sur **${datesCount}** date(s).`}`,
    components: []
  });
}

// Rafraîchit l'embed du sondage
async function refreshVoteMessage(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid?.voteMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(raid.voteChannelId);
    const msg     = await channel.messages.fetch(raid.voteMessageId);
    await msg.edit({ embeds: [buildVoteEmbed(raid)], components: buildVoteComponents(raid.slots) });
  } catch (e) { console.error("refreshVoteMessage:", e.message); }
}

// ── Nouvelle inscription (joueur n'ayant pas voté) ───────────────────
async function showJoinModal(interaction) {
  const raid = getRaid(interaction.guildId);
  if (!raid || raid.phase !== "registration") {
    return interaction.reply({ content: "⚠️ Les inscriptions ne sont pas ouvertes.", ephemeral: true });
  }

  const already = raid.registrations.find(r => r.userId === interaction.user.id);
  if (already) {
    return interaction.reply({ content: "✅ Tu es déjà inscrit ! Utilise **✏️ Modifier mon perso** pour changer ton inscription.", ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId("switch_perso_modal")
    .setTitle("S'inscrire au raid");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_role")
        .setLabel("Rôle : Tank, Heal, DPS ou Bench")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("DPS")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_class")
        .setLabel("Classe (ex: Mage, Druide...)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Mage")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("new_spec")
        .setLabel("Spé (optionnel, ex: Feu)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
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
        .setLabel("Rôle : Tank, Heal, DPS ou Bench")
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

  const validRoles = ["Tank", "Heal", "DPS", "Bench"];
  const newRole = validRoles.find(r => r.toLowerCase() === newRoleRaw.toLowerCase());
  if (!newRole) return interaction.reply({ content: "❌ Rôle invalide. Utilise Tank, Heal, DPS ou Bench.", ephemeral: true });

  const allowed = newRole === "Bench" ? ALL_CLASSES.map(c => c.toLowerCase()) : getClassesForRole(newRole).map(c => c.toLowerCase());
  if (!allowed.includes(newClass.toLowerCase())) {
    return interaction.reply({
      content: `❌ **${newClass}** ne peut pas jouer **${newRole}**.\nClasses dispo : ${(newRole === "Bench" ? ALL_CLASSES : getClassesForRole(newRole)).join(", ")}`,
      ephemeral: true
    });
  }

  const existing = raid.registrations.find(r => r.userId === interaction.user.id);
  const oldInfo  = existing ? `${existing.wowClass} ${existing.role}` : null;

  if (existing) {
    existing.wowClass  = newClass;
    existing.role      = newRole;
    existing.specNote  = newSpec;
  } else {
    raid.registrations.push({
      userId: interaction.user.id,
      username: interaction.member?.displayName || interaction.user.username,
      wowClass: newClass,
      role: newRole,
      specNote: newSpec
    });
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

async function refreshRegistrationMessage(interaction, raid) {
  if (!raid?.registrationMessageId) return;
  try {
    const channel = await interaction.client.channels.fetch(process.env.RAID_CHANNEL_ID);
    const msg     = await channel.messages.fetch(raid.registrationMessageId);
    await msg.edit({ embeds: [buildRegistrationEmbed(raid)], components: buildRegistrationComponents() });
  } catch (e) { console.error("refreshRegistrationMessage:", e.message); }
}

function buildRegistrationComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("reg_join").setLabel("✋ S'inscrire").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reg_switch").setLabel("✏️ Modifier mon perso").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("reg_leave").setLabel("❌ Se désinscrire").setStyle(ButtonStyle.Danger)
    )
  ];
}

module.exports.buildRegistrationComponents = buildRegistrationComponents;
module.exports.refreshRegistrationMessage   = refreshRegistrationMessage;
