const { getRaid, setRaid } = require('./store');
const { buildRaidEmbed, buildParticipantList } = require('./embeds');
const { COLORS } = require('./constants');

/**
 * Vérifie si le vote du raid courant est expiré.
 * Si oui, détermine le créneau gagnant et ouvre les inscriptions.
 */
async function checkExpiredVotes(client) {
  try {
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const raid = getRaid(guildId);
      if (!raid || raid.phase !== 'vote') continue;
      if (Date.now() < raid.voteEndsAt) continue;

      // Récupérer le message du vote pour compter les réactions
      const voteChannel = guild.channels.cache.get(process.env.VOTE_CHANNEL_ID);
      if (!voteChannel) continue;

      let voteMessage;
      try {
        voteMessage = await voteChannel.messages.fetch(raid.voteMessageId);
      } catch { continue; }

      // Compter les votes par créneau (réactions numériques 1️⃣ 2️⃣ 3️⃣)
      const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      let bestSlot = null;
      let bestCount = -1;

      for (let i = 0; i < raid.slots.length; i++) {
        const reaction = voteMessage.reactions.cache.get(NUMBER_EMOJIS[i]);
        const count = reaction ? reaction.count - 1 : 0; // -1 pour exclure le bot
        if (count > bestCount) {
          bestCount = count;
          bestSlot = raid.slots[i];
        }
      }

      if (!bestSlot) continue;

      // Mise à jour du raid : phase inscriptions
      raid.phase = 'open';
      raid.selectedSlot = bestSlot;
      raid.participants = {};
      // Transférer les votes comme pré-inscriptions
      for (const [userId, voter] of Object.entries(raid.voters || {})) {
        if (voter.slot === bestSlot.id) {
          raid.participants[userId] = {
            userId,
            username: voter.username,
            character: voter.character || null,
            wowClass: voter.wowClass || null,
            role: voter.role || null,
            registeredAt: Date.now(),
          };
        }
      }

      setRaid(guildId, raid);

      // Créer le rôle provisoire
      await createRaidRole(guild, raid);

      // Attribuer le rôle aux pré-inscrits
      for (const userId of Object.keys(raid.participants)) {
        await assignRaidRole(guild, userId, raid.roleId);
      }

      // Créer l'event Discord
      await createDiscordEvent(guild, raid);

      // Poster le message d'inscriptions dans le canal raid
      const raidChannel = guild.channels.cache.get(process.env.RAID_CHANNEL_ID);
      if (raidChannel) {
        const { embed, components } = buildRaidEmbed(raid);
        const raidMsg = await raidChannel.send({ embeds: [embed], components });
        raid.raidMessageId = raidMsg.id;
        setRaid(guildId, raid);
      }

      // Mettre à jour le message de vote pour indiquer la clôture
      await voteMessage.edit({
        content: `✅ Vote clôturé ! Créneau retenu : **${bestSlot.label}** avec ${bestCount} vote(s). Les inscriptions sont ouvertes dans <#${process.env.RAID_CHANNEL_ID}> !`,
        components: [],
      });
    }
  } catch (err) {
    console.error('[Scheduler] checkExpiredVotes:', err);
  }
}

/**
 * Envoie un rappel 30 minutes avant le début du groupage (20h15 pour 20h45).
 */
async function checkRaidReminders(client) {
  try {
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const raid = getRaid(guildId);
      if (!raid || raid.phase !== 'open' || raid.reminderSent) continue;

      const raidTime = new Date(raid.selectedSlot.datetime).getTime();
      const reminderTime = raidTime - 30 * 60 * 1000; // 30 min avant
      if (Date.now() < reminderTime) continue;

      const raidChannel = guild.channels.cache.get(process.env.RAID_CHANNEL_ID);
      if (!raidChannel) continue;

      const participantMentions = Object.keys(raid.participants)
        .map(id => `<@${id}>`)
        .join(' ');

      const roleId = raid.roleId;
      const mention = roleId ? `<@&${roleId}>` : participantMentions;

      await raidChannel.send({
        content: `⚔️ **Rappel raid viewer !** ${mention}\nLe groupage commence dans **30 minutes** (${raid.selectedSlot.label}). Soyez prêts en jeu ! 🏰`,
      });

      raid.reminderSent = true;
      setRaid(guildId, raid);
    }
  } catch (err) {
    console.error('[Scheduler] checkRaidReminders:', err);
  }
}

/**
 * Supprime les rôles provisoires expirés (le lendemain du raid).
 */
async function cleanExpiredRoles(client) {
  try {
    const guilds = client.guilds.cache;
    for (const [guildId, guild] of guilds) {
      const raid = getRaid(guildId);
      if (!raid || !raid.roleId || !raid.selectedSlot) continue;

      const raidDay = new Date(raid.selectedSlot.datetime);
      raidDay.setHours(23, 59, 59, 999);
      if (Date.now() <= raidDay.getTime()) continue;

      // Supprimer le rôle Discord
      try {
        const role = guild.roles.cache.get(raid.roleId);
        if (role) await role.delete('Nettoyage automatique post-raid');
      } catch (e) {
        console.error('[Scheduler] Suppression rôle:', e);
      }

      // Archiver le raid (passer en phase "closed")
      const logChannel = guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          content: `📁 Raid du **${new Date(raid.selectedSlot.datetime).toLocaleDateString('fr-FR')}** archivé. ${Object.keys(raid.participants).length} participant(s) au total.`,
        });
      }

      const { deleteRaid } = require('./store');
      deleteRaid(guildId);
    }
  } catch (err) {
    console.error('[Scheduler] cleanExpiredRoles:', err);
  }
}

/**
 * Crée un rôle Discord provisoire pour le raid (ex: "Raider du 12/06/2026").
 */
async function createRaidRole(guild, raid) {
  try {
    const date = new Date(raid.selectedSlot.datetime);
    const label = `Raider du ${date.toLocaleDateString('fr-FR')}`;
    const role = await guild.roles.create({
      name: label,
      color: 0x9b59b6,
      reason: 'Rôle provisoire AzaelRaid',
    });
    raid.roleId = role.id;
  } catch (err) {
    console.error('[createRaidRole]', err);
  }
}

/**
 * Attribue le rôle provisoire à un membre.
 */
async function assignRaidRole(guild, userId, roleId) {
  try {
    if (!roleId) return;
    const member = await guild.members.fetch(userId);
    if (member) await member.roles.add(roleId);
  } catch (err) {
    console.error(`[assignRaidRole] userId=${userId}`, err);
  }
}

/**
 * Crée un event Discord natif pour le raid.
 */
async function createDiscordEvent(guild, raid) {
  try {
    const startTime = new Date(raid.selectedSlot.datetime);
    const endTime = new Date(startTime.getTime() + 3 * 60 * 60 * 1000); // +3h

    const event = await guild.scheduledEvents.create({
      name: `⚔️ Raid viewer — ${startTime.toLocaleDateString('fr-FR')}`,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      privacyLevel: 2, // GUILD_ONLY
      entityType: 3,   // EXTERNAL
      entityMetadata: { location: 'World of Warcraft' },
      description: `Raid viewer communautaire ! Inscris-toi dans <#${process.env.RAID_CHANNEL_ID}> avec ta classe et ton rôle.`,
    });

    raid.discordEventId = event.id;
  } catch (err) {
    console.error('[createDiscordEvent]', err);
  }
}

module.exports = {
  checkExpiredVotes,
  checkRaidReminders,
  cleanExpiredRoles,
  createRaidRole,
  assignRaidRole,
};
