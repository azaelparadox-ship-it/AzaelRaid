const cron = require("node-cron");
const { getAllRaids, updateRaid } = require("../utils/store");
const { buildRegistrationEmbed } = require("../utils/embeds");
const { buildRegistrationComponents } = require("./interactionCreate");
const { raidRoleName, discordTimestamp, toDate } = require("../utils/helpers");

let client;

function start(discordClient) {
  client = discordClient;
  cron.schedule("* * * * *", () => tick());
  // 1h00 heure Paris — suppression silencieuse des rôles expirés
  cron.schedule("0 1 * * *", () => cleanExpiredRoles(), { timezone: "Europe/Paris" });
}

async function tick() {
  const now = Date.now();

  for (const raid of getAllRaids()) {
    // Clôturer le vote
    if (raid.phase === "vote" && now >= toDate(raid.voteEndsAt).getTime()) {
      await closeVote(raid, client);
    }

    // Rappel H-30 : on compare les timestamps bruts (ms), pas d'objet Date intermédiaire
    if (raid.phase === "registration" && !raid.reminderSent && raid.raidDate) {
      const raidTs = toDate(raid.raidDate).getTime();
      const diff   = raidTs - now;
      if (diff <= 30 * 60 * 1000 && diff > 0) {
        await sendReminder(raid);
      }
    }
  }
}

async function closeVote(raid, discordClient) {
  const cl = discordClient || client;
  if (!raid || raid.phase !== "vote") return;

  try {
    const guild = await cl.guilds.fetch(raid.guildId);

    // Date gagnante
    const tally = {};
    raid.slots.forEach((_, i) => tally[i] = 0);
    Object.values(raid.votes).forEach(v => {
      (v.dates || []).forEach(i => { tally[i] = (tally[i] || 0) + 1; });
    });

    const winnerIndex = parseInt(
      Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    );
    const winnerSlot = raid.slots[winnerIndex];
    const raidDate   = toDate(winnerSlot.date);

    // Rôle provisoire — "colors" au lieu de "color" (fix deprecation)
    const raidRole = await guild.roles.create({
      name: raidRoleName(raidDate),
      colors: [0xe67e22],
      reason: "Rôle provisoire raid viewer AzaelRaid"
    });

    // Inscrire les votants dispo ce jour
    const registrations = [];
    for (const [userId, vote] of Object.entries(raid.votes)) {
      if (!(vote.dates || []).includes(winnerIndex)) continue;
      if (!vote.wowClass || !vote.role) continue;
      try {
        const member = await guild.members.fetch(userId);
        await member.roles.add(raidRole.id);
        registrations.push({
          userId,
          username: vote.username || member.displayName,
          wowClass: vote.wowClass,
          role: vote.role,
          specNote: ""
        });
      } catch {}
    }

    // Event Discord
    let eventId = null;
    try {
      const event = await guild.scheduledEvents.create({
        name: `⚔️ Raid Viewer ${raid.difficulte || ""}`,
        scheduledStartTime: raidDate,
        scheduledEndTime: new Date(raidDate.getTime() + 2 * 3600 * 1000),
        privacyLevel: 2,
        entityType: 3,
        entityMetadata: { location: "Discord" },
        description: `Raid viewer ${raid.difficulte || ""} — ${registrations.length} joueur(s) inscrit(s)`
      });
      eventId = event.id;
    } catch (e) { console.error("Erreur création event:", e.message); }

    updateRaid(raid.guildId, {
      phase: "registration",
      raidDate: raidDate.toISOString(),
      raidRoleId: raidRole.id,
      registrations,
      eventId
    });

    const updatedRaid = getAllRaids().find(r => r.guildId === raid.guildId);

    // Message d'inscriptions dans le canal raid
    const raidChannel = await cl.channels.fetch(process.env.RAID_CHANNEL_ID);
    const regMsg = await raidChannel.send({
      content:
        `🎉 **Vote clôturé !**\n` +
        `📅 Date retenue : **${winnerSlot.label}** avec **${tally[winnerIndex]} vote(s)**\n` +
        `${discordTimestamp(raidDate)} (${discordTimestamp(raidDate, "R")})\n\n` +
        `<@&${raidRole.id}> tu es inscrit automatiquement. Tu peux modifier ton perso ci-dessous.`,
      embeds: [buildRegistrationEmbed(updatedRaid)],
      components: buildRegistrationComponents()
    });

    updateRaid(raid.guildId, { registrationMessageId: regMsg.id });

    // Clôturer le message de vote
    try {
      const voteChannel = await cl.channels.fetch(raid.voteChannelId);
      const voteMsg     = await voteChannel.messages.fetch(raid.voteMessageId);
      const recap = raid.slots
        .map((s, i) => `${["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][i]} ${s.label} — **${tally[i]} vote(s)**${i === winnerIndex ? " 🏆" : ""}`)
        .join("\n");
      await voteMsg.edit({
        content: `🔒 **Vote clôturé**\n\n${recap}\n\n✅ Date retenue : **${winnerSlot.label}**`,
        embeds: [],
        components: []
      });
    } catch {}

    console.log(`[AzaelRaid] Vote clôturé — date retenue : ${winnerSlot.label}`);

  } catch (err) {
    console.error("Erreur closeVote:", err);
  }
}

async function sendReminder(raid) {
  try {
    console.log(`[AzaelRaid] Envoi rappel — raid à ${toDate(raid.raidDate).toISOString()}`);
    const raidChannel = await client.channels.fetch(process.env.RAID_CHANNEL_ID);
    await raidChannel.send(
      `⏰ <@&${raid.raidRoleId}> — Le raid commence dans **30 minutes** ! ` +
      `Rendez-vous à ${discordTimestamp(raid.raidDate, "t")} pour le groupage ⚔️`
    );
    updateRaid(raid.guildId, { reminderSent: true });
    console.log(`[AzaelRaid] Rappel envoyé avec succès`);
  } catch (err) {
    console.error("Erreur rappel:", err);
  }
}

async function cleanExpiredRoles() {
  const now = Date.now();
  console.log(`[AzaelRaid] Nettoyage des rôles expirés`);
  for (const raid of getAllRaids()) {
    if (raid.phase !== "registration" || !raid.raidDate || !raid.raidRoleId) continue;
    if (toDate(raid.raidDate).getTime() > now) continue;
    try {
      const guild = await client.guilds.fetch(raid.guildId);
      const role  = await guild.roles.fetch(raid.raidRoleId);
      if (role) {
        await role.delete("Rôle provisoire expiré — AzaelRaid");
        console.log(`[AzaelRaid] Rôle ${role.name} supprimé`);
      }
      updateRaid(raid.guildId, { phase: "done", raidRoleId: null });
    } catch (e) { console.error("Erreur suppression rôle:", e.message); }
  }
}

module.exports = { start, closeVote };
