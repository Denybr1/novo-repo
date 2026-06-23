/**
 * database.js
 * Módulo central de banco de dados SQLite.
 * Cria as tabelas automaticamente e expõe funções async para
 * todas as operações de leitura/escrita do bot.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'gamification.db');

// abre banco
const db = new Database(DB_PATH);
const path = require('path');

// Caminho do arquivo de banco de dados (criado automaticamente na pasta do projeto)
const DB_PATH = path.join(__dirname, 'gamification.db');

// Abre (ou cria) o banco de dados
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[DB] Erro ao abrir banco de dados:', err.message);
  } else {
    console.log('[DB] Banco de dados SQLite conectado em:', DB_PATH);
  }
});

// Ativa suporte a foreign keys e modo WAL para melhor performance
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

/**
 * Inicializa todas as tabelas necessárias.
 * Chamado uma vez ao iniciar o bot.
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabela principal de usuários
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id          TEXT PRIMARY KEY,
          xp          INTEGER NOT NULL DEFAULT 0,
          level       INTEGER NOT NULL DEFAULT 1,
          coins       INTEGER NOT NULL DEFAULT 0,
          tempo_call  INTEGER NOT NULL DEFAULT 0,
          tempo_jogo  INTEGER NOT NULL DEFAULT 0,
          last_drop   INTEGER NOT NULL DEFAULT 0
        )
      `);

      // Histórico de jogos por usuário (tempo total em cada jogo)
      db.run(`
        CREATE TABLE IF NOT EXISTS user_games (
          user_id     TEXT NOT NULL,
          game_name   TEXT NOT NULL,
          tempo_total INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, game_name)
        )
      `);

      // Conquistas desbloqueadas por usuário
      db.run(`
        CREATE TABLE IF NOT EXISTS achievements (
          user_id          TEXT NOT NULL,
          achievement_name TEXT NOT NULL,
          unlocked_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          PRIMARY KEY (user_id, achievement_name)
        )
      `);

      // Missões diárias e seu progresso
      db.run(`
        CREATE TABLE IF NOT EXISTS missions (
          user_id      TEXT NOT NULL,
          mission_key  TEXT NOT NULL,
          progress     INTEGER NOT NULL DEFAULT 0,
          completed    INTEGER NOT NULL DEFAULT 0,
          date         TEXT NOT NULL DEFAULT (date('now')),
          PRIMARY KEY (user_id, mission_key, date)
        )
      `, (err) => {
        if (err) {
          console.error('[DB] Erro ao criar tabelas:', err.message);
          reject(err);
        } else {
          console.log('[DB] Todas as tabelas inicializadas com sucesso.');
          resolve();
        }
      });
    });
  });
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/** Executa uma query sem retorno de linhas (INSERT, UPDATE, DELETE) */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/** Busca uma única linha */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/** Busca múltiplas linhas */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Funções de Usuário ───────────────────────────────────────────────────────

/**
 * Retorna o usuário do banco, criando-o se não existir.
 * @param {string} userId - ID Discord do usuário
 */
async function getOrCreateUser(userId) {
  await run(
    `INSERT OR IGNORE INTO users (id) VALUES (?)`,
    [userId]
  );
  return get(`SELECT * FROM users WHERE id = ?`, [userId]);
}

/**
 * Adiciona XP ao usuário e retorna se subiu de nível.
 * Fórmula de nível: XP necessário = 100 * nível_atual
 * @returns {{ leveled_up: boolean, old_level: number, new_level: number }}
 */
async function addXP(userId, amount) {
  const user = await getOrCreateUser(userId);
  const newXP = user.xp + amount;
  let newLevel = user.level;
  let leveled_up = false;

  // Verifica se o usuário deve subir de nível (pode subir mais de 1 vez)
  while (newXP >= newLevel * 100) {
    newLevel++;
    leveled_up = true;
  }

  await run(
    `UPDATE users SET xp = ?, level = ? WHERE id = ?`,
    [newXP, newLevel, userId]
  );

  return { leveled_up, old_level: user.level, new_level: newLevel };
}

/**
 * Adiciona moedas ao usuário.
 */
async function addCoins(userId, amount) {
  await getOrCreateUser(userId);
  await run(
    `UPDATE users SET coins = coins + ? WHERE id = ?`,
    [amount, userId]
  );
}

/**
 * Incrementa o tempo em call do usuário (em segundos).
 */
async function addTempoCall(userId, segundos) {
  await getOrCreateUser(userId);
  await run(
    `UPDATE users SET tempo_call = tempo_call + ? WHERE id = ?`,
    [segundos, userId]
  );
}

/**
 * Incrementa o tempo jogando do usuário (em segundos).
 */
async function addTempoJogo(userId, segundos) {
  await getOrCreateUser(userId);
  await run(
    `UPDATE users SET tempo_jogo = tempo_jogo + ? WHERE id = ?`,
    [segundos, userId]
  );
}

// ─── Funções de Jogos ─────────────────────────────────────────────────────────

/**
 * Registra ou incrementa o tempo total num jogo específico.
 */
async function addTempoGame(userId, gameName, segundos) {
  await run(
    `INSERT INTO user_games (user_id, game_name, tempo_total)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, game_name)
     DO UPDATE SET tempo_total = tempo_total + ?`,
    [userId, gameName, segundos, segundos]
  );
}

/**
 * Retorna todos os jogos de um usuário ordenados por tempo total.
 */
async function getGamesForUser(userId) {
  return all(
    `SELECT game_name, tempo_total FROM user_games
     WHERE user_id = ? ORDER BY tempo_total DESC`,
    [userId]
  );
}

// ─── Funções de Conquistas ────────────────────────────────────────────────────

/**
 * Verifica se um usuário já tem uma conquista.
 */
async function hasAchievement(userId, name) {
  const row = await get(
    `SELECT 1 FROM achievements WHERE user_id = ? AND achievement_name = ?`,
    [userId, name]
  );
  return !!row;
}

/**
 * Desbloqueia uma conquista para o usuário.
 * Retorna true se foi desbloqueada agora, false se já existia.
 */
async function unlockAchievement(userId, name) {
  const already = await hasAchievement(userId, name);
  if (already) return false;

  await run(
    `INSERT INTO achievements (user_id, achievement_name) VALUES (?, ?)`,
    [userId, name]
  );
  return true;
}

/**
 * Lista todas as conquistas de um usuário.
 */
async function getAchievements(userId) {
  return all(
    `SELECT achievement_name, unlocked_at FROM achievements
     WHERE user_id = ? ORDER BY unlocked_at ASC`,
    [userId]
  );
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

/**
 * Retorna o top N usuários por XP.
 */
async function getRanking(limit = 10) {
  return all(
    `SELECT id, xp, level, coins FROM users ORDER BY xp DESC LIMIT ?`,
    [limit]
  );
}

// ─── Missões ─────────────────────────────────────────────────────────────────

/**
 * Obtém ou cria o progresso de uma missão para hoje.
 */
async function getMissionProgress(userId, missionKey) {
  const today = new Date().toISOString().split('T')[0];
  await run(
    `INSERT OR IGNORE INTO missions (user_id, mission_key, date) VALUES (?, ?, ?)`,
    [userId, missionKey, today]
  );
  return get(
    `SELECT * FROM missions WHERE user_id = ? AND mission_key = ? AND date = ?`,
    [userId, missionKey, today]
  );
}

/**
 * Incrementa o progresso de uma missão e marca como completa se atingir o objetivo.
 * @param {number} goal - meta necessária para completar a missão
 * @returns {{ completed: boolean, progress: number }}
 */
async function incrementMission(userId, missionKey, increment, goal) {
  const today = new Date().toISOString().split('T')[0];
  const current = await getMissionProgress(userId, missionKey);

  // Se já está completa, não faz nada
  if (current.completed) return { completed: true, progress: current.progress };

  const newProgress = current.progress + increment;
  const completed = newProgress >= goal ? 1 : 0;

  await run(
    `UPDATE missions SET progress = ?, completed = ?
     WHERE user_id = ? AND mission_key = ? AND date = ?`,
    [newProgress, completed, userId, missionKey, today]
  );

  return { completed: completed === 1, progress: newProgress };
}

/**
 * Obtém todas as missões do dia para um usuário.
 */
async function getDailyMissions(userId) {
  const today = new Date().toISOString().split('T')[0];
  return all(
    `SELECT * FROM missions WHERE user_id = ? AND date = ?`,
    [userId, today]
  );
}

/**
 * Registra o timestamp do último drop de moedas para o usuário.
 */
async function setLastDrop(userId, timestamp) {
  await run(`UPDATE users SET last_drop = ? WHERE id = ?`, [timestamp, userId]);
}

// ─── Exportações ──────────────────────────────────────────────────────────────

module.exports = {
  initDatabase,
  getOrCreateUser,
  addXP,
  addCoins,
  addTempoCall,
  addTempoJogo,
  addTempoGame,
  getGamesForUser,
  hasAchievement,
  unlockAchievement,
  getAchievements,
  getRanking,
  getMissionProgress,
  incrementMission,
  getDailyMissions,
  setLastDrop,
};
