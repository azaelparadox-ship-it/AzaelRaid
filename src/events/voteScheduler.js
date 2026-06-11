const cron = require("node-cron");
const { getAllRaids, updateRaid } = require("../utils/store");
const { buildRegistrationEmbed } = require("../utils/embeds");
const { buildRegistrationComponents } = require("./interactionCreate");
const { raidRoleName, discordTimestamp } = require("../utils/helpers");

let client;

function start(discordClient) {
  client = discordClient;
  // Toutes les minutes : vérifier les votes à clôturer + envoyer les rappels
  cron.schedule("* * * * *", () => tick());
  // Tous les jours à 2h : supprimer les rôles expirés
  cron.schedule("0 2 * * *", () => cleanExpiredRoles());
}

async function tick() {
  const now = new Date();

  for (const raid of getAllRaids()) {
    // Clôturer le vote
    if (raid.phase === "vote" && now >= raid.voteEndsAt) {
      await closeVote(raid);
    }

    // Rappel H-30 avant le raid
    if (
      raid.phase === "registration" &&
      !raid.reminderSent &&
      raid.raidDate &&
      (raid.raidDate - now) <= 30 * 60 * 1000 &&
      (raid.raidDate - now) > 0
    ) {
      await sendReminder(raid);
    }
  }
}

async function closeVote(raid) {
  try {
    const guild = await client.guilds.fetch(raid.guildId);

    // Trouver le créneau gagnant
    const tally = {};
    raid.slots.forEach((_, i) => tally[i] = 0);
    Object.values(raid.votes).forEach(v => {
      if (v.slotIndex !== undefined) tally[v.slotIndex] = (tally[v.slotIndex] || 0) + 1;
    });
    const winnerIndex = parseInt(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]);
    const winnerSlot = raid.slots[winnerIndex];

    // Parse la date du créneau gagnant depuis le label "Samedi 21/06 20h45"
    const match = winnerSlot.label.match(/(\d{1,2})\/(\d{2})(?:\/(\d{4}))?\s+(\d{1,2})h(\d{2})/);
    let raidDate;
    if (match) {
      const [, day, month, year, hour, min] = match;
      const y = year ? parseInt(year) : new Date().getFullYear();
      raidDate = new Date(y, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
    } else {
      raidDate = new Date(raid.voteEndsAt.getTime() + 24 * 3600 * 1000); // fallback J+1
    }

    // Créer le rôle provisoire
    const roleName = raidRoleName(raidDate);
    const raidRole = await guild.roles.create({
      name: roleName,
      color: 0xe67e22,
      reason: "Rôle provisoire raid viewer AzaelRaid"
    });

    // Assigner le rôle aux votants + construire les inscriptions initiales
    const registrations = [];
    for (const [userId, vote] of Object.entries(raid.votes)) {
      if (vote.slotIndex !== winnerIndex) continue;
      if (!vote.wowClass || !vote.role) continue;
      try {
        const member = await guild.members.fetch(userId);
        await member.roles.add(raidRole.id);
        registrations.push({
          userId,
          username: member.displayName,
          wowClass: vote.wowClass,
          role: vote.role,
          specNote: ""
        });
      } catch { /* membre introuvable */ }
    }

    // Créer l'event Discord
    let eventId = null;
    try {
      const event = await guild.scheduledEvents.create({
        name: "⚔️ Raid Viewer",
        scheduledStartTime: raidDate,
        scheduledEndTime: new Date(raidDate.getTime() + 2 * 3600 * 1000),
        privacyLevel: 2, // GUILD_ONLY
        entityType: 3,   // EXTERNAL
        entityMetadata: { location: "Discord" },
        description: `Raid viewer communautaire — ${registrations.length} joueur(s) inscrit(s)`
      });
      eventId = event.id;
    } catch (e) {
      console.error("Erreur création event Discord:", e.message);
    }

    // Mettre à jour le store
    updateRaid(raid.guildId, {
      phase: "registration",
      raidDate,
      raidRoleId: raidRole.id,
      registrations,
      eventId
    });

    const updatedRaid = getAllRaids().find(r => r.guildId === raid.guildId);

    // Poster le message d'inscriptions
    const raidChannel = await client.channels.fetch(process.env.RAID_CHANNEL_ID);
    const regMsg = await raidChannel.send({
      content: `🎉 Le vote est clôturé ! Le créneau retenu est **${winnerSlot.label}** (${discordTimestamp(raidDate)}).\n<@&${raidRole.id}> tu es automatiquement inscrit si tu as voté pour ce créneau. Tu peux modifier ton perso ci-dessous.`,
      embeds: [buildRegistrationEmbed(updatedRaid)],
      components: buildRegistrationComponents()
    });

    updateRaid(raid.guildId, { registrationMessageId: regMsg.id });

    // Éditer le message de vote pour indiquer la clôture
    try {
      const voteChannel = await client.channels.fetch(raid.voteChannelId);
      const voteMsg = await voteChannel.messages.fetch(raid.voteMessageId);
      await voteMsg.edit({
        content: `✅ Vote clôturé — Créneau retenu : **${winnerSlot.label}**`,
        embeds: [],
        components: []
      });
    } catch { /* */ }

  } catch (err) {
    console.error("Erreur lors de la clôture du vote:", err);
  }
}

async function sendReminder(raid) {
  try {
    const raidChannel = await client.channels.fetch(process.env.RAID_CHANNEL_ID);
    await raidChannel.send(
      `⏰ <@&${raid.raidRoleId}> — Le raid commence dans **30 minutes** (${discordTimestamp(raid.raidDate, "t")}) ! ` +
      `On se retrouve à **20h45** pour le groupage. Bonne chance à tous ! ⚔️`
    );
    updateRaid(raid.guildId, { reminderSent: true });
  } catch (err) {
    console.error("Erreur rappel:", err);
  }
}

async function cleanExpiredRoles() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const raid of getAllRaids()) {
    if (raid.phase !== "registration" || !raid.raidDate || !raid.raidRoleId) continue;
    if (raid.raidDate > yesterday) continue;

    try {
      const guild = await client.guilds.fetch(raid.guildId);
      const role = await guild.roles.fetch(raid.raidRoleId);
      if (role) await role.delete("Rôle provisoire expiré — AzaelRaid");
      updateRaid(raid.guildId, { phase: "done", raidRoleId: null });
      console.log(`[AzaelRaid] Rôle provisoire supprimé pour guild ${raid.guildId}`);
    } catch (err) {
      console.error("Erreur suppression rôle expiré:", err);
    }
  }
}

module.exports = { start };
