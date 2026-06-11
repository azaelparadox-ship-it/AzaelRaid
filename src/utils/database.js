const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'azaelraid.db'));

// Activation WAL pour meilleures performances
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Création des tables ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS raids (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    poll_message_id TEXT,
    event_message_id TEXT,
    discord_event_id TEXT,
    role_id       TEXT,
    raid_date     TEXT,
    raid_time     TEXT,
    vote_end_date TEXT NOT NULL,
    title         TEXT NOT NULL DEFAULT 'Raid Viewer',
    status        TEXT NOT NULL DEFAULT 'vote',
    max_players   INTEGER DEFAULT 20,
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vote_slots (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    raid_id  INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
    label    TEXT NOT NULL,
    date     TEXT NOT NULL,
    time     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    raid_id      INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN ('tank','heal','dps')),
    class        TEXT NOT NULL,
    spec         TEXT,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(raid_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    raid_id INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    slot_id INTEGER NOT NULL REFERENCES vote_slots(id) ON DELETE CASCADE,
    UNIQUE(raid_id, user_id)
  );
`);

// ─── Raids ─────────────────────────────────────────────────────────────────
const createRaid = db.prepare(`
  INSERT INTO raids (guild_id, vote_end_date, title, max_players, created_by)
  VALUES (@guild_id, @vote_end_date, @title, @max_players, @created_by)
`);

const getRaid = db.prepare(`SELECT * FROM raids WHERE id = ?`);
const getActiveRaid = db.prepare(`SELECT * FROM raids WHERE guild_id = ? AND status != 'done' ORDER BY id DESC LIMIT 1`);
const getAllActiveRaids = db.prepare(`SELECT * FROM raids WHERE guild_id = ? AND status != 'done'`);

const updateRaid = (id, fields) => {
  const keys = Object.keys(fields).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE raids SET ${keys} WHERE id = @id`).run({ ...fields, id });
};

const getRaidsToClose = db.prepare(`
  SELECT * FROM raids WHERE status = 'vote' AND vote_end_date <= datetime('now')
`);

const getRaidsToRemindRole = db.prepare(`
  SELECT * FROM raids WHERE status = 'open'
  AND raid_date IS NOT NULL AND raid_time IS NOT NULL
`);

// ─── Créneaux ──────────────────────────────────────────────────────────────
const addSlot = db.prepare(`
  INSERT INTO vote_slots (raid_id, label, date, time) VALUES (@raid_id, @label, @date, @time)
`);
const getSlots = db.prepare(`SELECT * FROM vote_slots WHERE raid_id = ?`);
const getSlot = db.prepare(`SELECT * FROM vote_slots WHERE id = ?`);

// ─── Votes ─────────────────────────────────────────────────────────────────
const upsertVote = db.prepare(`
  INSERT INTO votes (raid_id, user_id, slot_id) VALUES (@raid_id, @user_id, @slot_id)
  ON CONFLICT(raid_id, user_id) DO UPDATE SET slot_id = excluded.slot_id
`);
const getVotesForRaid = db.prepare(`SELECT * FROM votes WHERE raid_id = ?`);
const getUserVote = db.prepare(`SELECT * FROM votes WHERE raid_id = ? AND user_id = ?`);

const getWinningSlot = (raidId) => {
  return db.prepare(`
    SELECT slot_id, COUNT(*) as count
    FROM votes WHERE raid_id = ?
    GROUP BY slot_id ORDER BY count DESC LIMIT 1
  `).get(raidId);
};

// ─── Inscriptions ──────────────────────────────────────────────────────────
const upsertRegistration = db.prepare(`
  INSERT INTO registrations (raid_id, user_id, username, role, class, spec)
  VALUES (@raid_id, @user_id, @username, @role, @class, @spec)
  ON CONFLICT(raid_id, user_id) DO UPDATE SET
    role = excluded.role, class = excluded.class,
    spec = excluded.spec, username = excluded.username
`);

const removeRegistration = db.prepare(`
  DELETE FROM registrations WHERE raid_id = ? AND user_id = ?
`);

const getRegistrations = db.prepare(`SELECT * FROM registrations WHERE raid_id = ? ORDER BY role, registered_at`);
const getUserRegistration = db.prepare(`SELECT * FROM registrations WHERE raid_id = ? AND user_id = ?`);
const countRegistrations = db.prepare(`SELECT COUNT(*) as count FROM registrations WHERE raid_id = ?`);

module.exports = {
  db,
  createRaid, getRaid, getActiveRaid, getAllActiveRaids, updateRaid,
  getRaidsToClose, getRaidsToRemindRole,
  addSlot, getSlots, getSlot,
  upsertVote, getVotesForRaid, getUserVote, getWinningSlot,
  upsertRegistration, removeRegistration, getRegistrations,
  getUserRegistration, countRegistrations,
};
