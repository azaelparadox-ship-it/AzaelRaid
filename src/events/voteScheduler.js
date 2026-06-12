const cron = require("node-cron");
const { getAllRaids, updateRaid } = require("../utils/store");
const { buildRegistrationEmbed } = require("../utils/embeds");
const { buildRegistrationComponents } = require("./interactionCreate");
const { raidRoleName, discordTimestamp } = require("../utils/helpers");

let client;

function start(discordClient) {
  client = discordClient;
  cron.schedule("* * * * *", () => tick());
  cron.schedule("0 2 * * *", () => cleanExpiredRoles());
}

async function tick() {
  const now = new Date();
  for (const raid of getAllRaids()) {
    if (raid.phase === "vote" && now >= raid.voteEndsAt) {
      await closeVote(raid, client);
    }
    if (
      raid.phase === "registration" && !raid.reminderSent && raid.raidDate &&
      (raid.raidDate - now) <= 30 * 60 * 1000 && (raid.raidDate - now) > 0
    ) {
      await sendReminder(raid);
    }
  }
}

async function closeVote(raid, discordClient) {
  const cl = discordClient || client;
  if (!raid || raid.phase !== "vote") return;

  try {
    const guild = await cl.guilds.fetch(raid.guildId);

    // Créer le rôle provisoire
    const roleName = raidRoleName(raid.raidDate);
    const raidRole = await guild.roles.create({
      name: roleName,
      color: 0xe67e22,
      reason: "Rôle provisoire raid viewer AzaelRaid"
    });

    // Construire les inscriptions depuis les votes
    const registrations = [];
    for (const [userId, vote] of Object.entries(raid.votes)) {
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

    // Créer l'event Discord dans le canal inscription
    let eventId = null;
    try {
      const event = await guild.scheduledEvents.create({
        name: "⚔️ Raid Viewer",
        scheduledStartTime: raid.raidDate,
        scheduledEndTime: new Date(raid.raidDate.getTime() + 2 * 3600 * 1000),
        privacyLevel: 2,
        entityType: 3,
        entityMetadata: { location: "Discord" },
        description: `Raid viewer communautaire — ${registrations.length} joueur(s) inscrit(s)`
      });
      eventId = event.id;
    } catch (e) { console.error("Erreur création event:", e.message); }

    updateRaid(raid.guildId, {
      phase: "registration",
      raidRoleId: raidRole.id,
      registrations,
      eventId
    });

    const updatedRaid = getAllRaids().find(r => r.guildId === raid.guildId);

    // Poster le message d'inscriptions dans le canal raid
    const raidChannel = await cl.channels.fetch(process.env.RAID_CHANNEL_ID);
    const regMsg = await raidChannel.send({
      content:
        `🎉 **Le vote est clôturé !**\n` +
        `📅 Le raid est fixé au ${discordTimestamp(raid.raidDate)} (${discordTimestamp(raid.raidDate, "R")})\n` +
        `<@&${raidRole.id}> tu es inscrit automatiquement si tu as voté. Tu peux modifier ton perso ci-dessous.`,
      embeds: [buildRegistrationEmbed(updatedRaid)],
      components: buildRegistrationComponents()
    });

    updateRaid(raid.guildId, { registrationMessageId: regMsg.id });

    // Marquer le message de vote comme clôturé
    try {
      const voteChannel = await cl.channels.fetch(raid.voteChannelId);
      const voteMsg = await voteChannel.messages.fetch(raid.voteMessageId);
      await voteMsg.edit({ content: `🔒 **Vote clôturé** — Raid fixé au ${discordTimestamp(raid.raidDate)}`, embeds: [], components: [] });
    } catch {}

  } catch (err) {
    console.error("Erreur closeVote:", err);
  }
}

async function sendReminder(raid) {
  try {
    const raidChannel = await client.channels.fetch(process.env.RAID_CHANNEL_ID);
    await raidChannel.send(
      `⏰ <@&${raid.raidRoleId}> — Le raid commence dans **30 minutes** ! ` +
      `Rendez-vous à ${discordTimestamp(raid.raidDate, "t")} pour le groupage ⚔️`
    );
    updateRaid(raid.guildId, { reminderSent: true });
  } catch (err) { console.error("Erreur rappel:", err); }
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
    } catch (e) { console.error("Erreur suppression rôle:", e); }
  }
}

module.exports = { start, closeVote };
