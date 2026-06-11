// Store en mémoire pour les raids en cours
const raids = new Map();

/**
 * Structure d'un raid :
 * {
 *   guildId,
 *   voteMessageId,
 *   voteChannelId,
 *   voteEndsAt: Date,
 *   raidDate: Date,
 *   slots: [ { label, date } ],
 *   votes: { userId: { slotIndex, wowClass, role } },
 *   registrations: [ { userId, username, wowClass, role, specNote } ],
 *   eventId,
 *   raidRoleId,
 *   registrationMessageId,
 *   reminderSent: false,
 *   phase: "vote" | "registration" | "done"
 * }
 */

function createRaid(guildId, data) {
  raids.set(guildId, { guildId, ...data });
}

function getRaid(guildId) {
  return raids.get(guildId) || null;
}

function updateRaid(guildId, patch) {
  const raid = raids.get(guildId);
  if (!raid) return null;
  Object.assign(raid, patch);
  return raid;
}

function deleteRaid(guildId) {
  raids.delete(guildId);
}

function getAllRaids() {
  return [...raids.values()];
}

module.exports = { createRaid, getRaid, updateRaid, deleteRaid, getAllRaids };
