/**
 * database.js
 * Banco SQLite para bot Discord (Railway friendly)
 */

const Database = require('better-sqlite3');
const path = require('path');

// Caminho do banco
const DB_PATH = path.join(__dirname, 'gamification.db');

// Abre/cria banco
const db = new Database(DB_PATH);

// ─────────────────────────────────────────────
// Inicialização do banco
// ─────────────────────────────────────────────

function initDatabase() {
  // Usuários
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      coins INTEGER DEFAULT 0,
      tempo_call INTEGER DEFAULT 0,
      tempo_jogo INTEGER DEFAULT 0,
      last_drop INTEGER DEFAULT 0
    )
  `).run();

  // Jogos
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_games (
      user_id TEXT,
      game_name TEXT,
      tempo_total INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, game_name)
    )
  `).run();

  // Conquistas
  db.prepare(`
    CREATE TABLE IF NOT EXISTS achievements (
      user_id TEXT,
      achievement_name TEXT,
      unlocked_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_id, achievement_name)
    )
  `).run();

  // Missões
  db.prepare(`
    CREATE TABLE IF NOT EXISTS missions (
      user_id TEXT,
      mission_key TEXT,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      date TEXT,
      PRIMARY KEY (user_id, mission_key, date)
    )
  `).run();

  console.log('[DB] Banco inicializado com sucesso');
}

// ─────────────────────────────────────────────
// USUÁRIO
// ─────────────────────────────────────────────

function getOrCreateUser(userId) {
  db.prepare(`INSERT OR IGNORE INTO users (id) VALUES (?)`).run(userId);
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

function addXP(userId, amount) {
  const user = getOrCreateUser(userId);

  let xp = user.xp + amount;
  let level = user.level;
  let leveledUp = false;

  while (xp >= level * 100) {
    level++;
    leveledUp = true;
  }

  db.prepare(`UPDATE users SET xp = ?, level = ? WHERE id = ?`)
    .run(xp, level, userId);

  return { leveledUp, level };
}

function addCoins(userId, amount) {
  getOrCreateUser(userId);
  db.prepare(`UPDATE users SET coins = coins + ? WHERE id = ?`)
    .run(amount, userId);
}

function addTempoCall(userId, sec) {
  getOrCreateUser(userId);
  db.prepare(`UPDATE users SET tempo_call = tempo_call + ? WHERE id = ?`)
    .run(sec, userId);
}

function addTempoJogo(userId, sec) {
  getOrCreateUser(userId);
  db.prepare(`UPDATE users SET tempo_jogo = tempo_jogo + ? WHERE id = ?`)
    .run(sec, userId);
}

// ─────────────────────────────────────────────
// JOGOS
// ─────────────────────────────────────────────

function addTempoGame(userId, game, sec) {
  db.prepare(`
    INSERT INTO user_games (user_id, game_name, tempo_total)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, game_name)
    DO UPDATE SET tempo_total = tempo_total + ?
  `).run(userId, game, sec, sec);
}

function getGamesForUser(userId) {
  return db.prepare(`
    SELECT game_name, tempo_total
    FROM user_games
    WHERE user_id = ?
    ORDER BY tempo_total DESC
  `).all(userId);
}

// ─────────────────────────────────────────────
// CONQUISTAS
// ─────────────────────────────────────────────

function unlockAchievement(userId, name) {
  const exists = db.prepare(`
    SELECT 1 FROM achievements
    WHERE user_id = ? AND achievement_name = ?
  `).get(userId, name);

  if (exists) return false;

  db.prepare(`
    INSERT INTO achievements (user_id, achievement_name)
    VALUES (?, ?)
  `).run(userId, name);

  return true;
}

function getAchievements(userId) {
  return db.prepare(`
    SELECT * FROM achievements
    WHERE user_id = ?
    ORDER BY unlocked_at ASC
  `).all(userId);
}

// ─────────────────────────────────────────────
// RANKING
// ─────────────────────────────────────────────

function getRanking(limit = 10) {
  return db.prepare(`
    SELECT id, xp, level, coins
    FROM users
    ORDER BY xp DESC
    LIMIT ?
  `).all(limit);
}

// ─────────────────────────────────────────────
// MISSÕES
// ─────────────────────────────────────────────

function getMission(userId, key) {
  const date = new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT OR IGNORE INTO missions (user_id, mission_key, date)
    VALUES (?, ?, ?)
  `).run(userId, key, date);

  return db.prepare(`
    SELECT * FROM missions
    WHERE user_id = ? AND mission_key = ? AND date = ?
  `).get(userId, key, date);
}

function incrementMission(userId, key, inc, goal) {
  const date = new Date().toISOString().split('T')[0];
  const m = getMission(userId, key);

  if (m.completed) return { completed: true };

  const progress = m.progress + inc;
  const completed = progress >= goal ? 1 : 0;

  db.prepare(`
    UPDATE missions
    SET progress = ?, completed = ?
    WHERE user_id = ? AND mission_key = ? AND date = ?
  `).run(progress, completed, userId, key, date);

  return { completed: !!completed, progress };
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  initDatabase,
  getOrCreateUser,
  addXP,
  addCoins,
  addTempoCall,
  addTempoJogo,
  addTempoGame,
  getGamesForUser,
  unlockAchievement,
  getAchievements,
  getRanking,
  getMission,
  incrementMission
};