/**
 * achievements.js
 * Define todas as conquistas disponíveis e a lógica de verificação.
 * Cada conquista tem: chave única, nome, emoji, descrição e condição de desbloqueio.
 */

const db = require('./database');

// ─── Definição das Conquistas ─────────────────────────────────────────────────

const ACHIEVEMENTS = [
  // ── Call ──────────────────────────────────────────────────────────────────
  {
    key: 'call_10min',
    name: 'Sobrevivente de Call',
    emoji: '🎙️',
    description: 'Ficou 10 minutos em call',
    check: (user) => user.tempo_call >= 600,
  },
  {
    key: 'call_1hora',
    name: 'Habitante do Servidor de Voz',
    emoji: '🔊',
    description: 'Ficou 1 hora em call',
    check: (user) => user.tempo_call >= 3600,
  },
  {
    key: 'call_5horas',
    name: 'Dono do Microfone',
    emoji: '🎤',
    description: 'Ficou 5 horas em call',
    check: (user) => user.tempo_call >= 18000,
  },
  {
    key: 'call_24horas',
    name: 'Ser de Outro Planeta',
    emoji: '👽',
    description: 'Ficou 24 horas em call no total',
    check: (user) => user.tempo_call >= 86400,
  },

  // ── Jogo ──────────────────────────────────────────────────────────────────
  {
    key: 'jogo_30min',
    name: 'Gamer Iniciante',
    emoji: '🎮',
    description: 'Jogou por 30 minutos',
    check: (user) => user.tempo_jogo >= 1800,
  },
  {
    key: 'jogo_3horas',
    name: 'Gamer Veterano',
    emoji: '🕹️',
    description: 'Jogou por 3 horas no total',
    check: (user) => user.tempo_jogo >= 10800,
  },
  {
    key: 'jogo_10horas',
    name: 'Sem Vida Social',
    emoji: '💀',
    description: 'Jogou por 10 horas no total',
    check: (user) => user.tempo_jogo >= 36000,
  },

  // ── Combo Call + Jogo ─────────────────────────────────────────────────────
  {
    key: 'combo_call_jogo',
    name: 'Modo Multitarefa',
    emoji: '🔥',
    description: 'Jogou enquanto estava em call',
    // Esta conquista é desbloqueada manualmente no evento de bônus
    check: () => false, // verificada manualmente no voice.js
  },

  // ── XP / Nível ────────────────────────────────────────────────────────────
  {
    key: 'nivel_5',
    name: 'Ascendendo',
    emoji: '⬆️',
    description: 'Chegou ao nível 5',
    check: (user) => user.level >= 5,
  },
  {
    key: 'nivel_10',
    name: 'Veterano',
    emoji: '🌟',
    description: 'Chegou ao nível 10',
    check: (user) => user.level >= 10,
  },
  {
    key: 'nivel_25',
    name: 'Lendário',
    emoji: '🏆',
    description: 'Chegou ao nível 25',
    check: (user) => user.level >= 25,
  },

  // ── Moedas ────────────────────────────────────────────────────────────────
  {
    key: 'rico_100',
    name: 'Porquinho Feliz',
    emoji: '🐷',
    description: 'Acumulou 100 moedas',
    check: (user) => user.coins >= 100,
  },
  {
    key: 'rico_1000',
    name: 'Magnata',
    emoji: '💰',
    description: 'Acumulou 1000 moedas',
    check: (user) => user.coins >= 1000,
  },
];

// ─── Verificador Automático ───────────────────────────────────────────────────

/**
 * Verifica todas as conquistas automáticas para um usuário e desbloqueia as novas.
 * Retorna lista de conquistas recém desbloqueadas.
 *
 * @param {string} userId - ID Discord do usuário
 * @returns {Promise<Array>} - conquistas desbloqueadas agora
 */
async function checkAchievements(userId) {
  const user = await db.getOrCreateUser(userId);
  const newlyUnlocked = [];

  for (const achievement of ACHIEVEMENTS) {
    // Conquistas manuais (check retorna false) são ignoradas aqui
    if (!achievement.check(user)) continue;

    const unlocked = await db.unlockAchievement(userId, achievement.key);
    if (unlocked) {
      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}

/**
 * Desbloqueia uma conquista específica pelo key (para conquistas manuais).
 * Retorna o objeto da conquista se foi desbloqueada agora, null caso contrário.
 *
 * @param {string} userId
 * @param {string} key - chave da conquista em ACHIEVEMENTS
 */
async function unlockByKey(userId, key) {
  const achievement = ACHIEVEMENTS.find((a) => a.key === key);
  if (!achievement) return null;

  const unlocked = await db.unlockAchievement(userId, key);
  return unlocked ? achievement : null;
}

/**
 * Formata uma conquista para exibição em mensagem Discord.
 */
function formatAchievement(achievement) {
  return `${achievement.emoji} **${achievement.name}** — ${achievement.description}`;
}

/**
 * Retorna objeto de conquista pelo key.
 */
function getByKey(key) {
  return ACHIEVEMENTS.find((a) => a.key === key) || null;
}

module.exports = {
  ACHIEVEMENTS,
  checkAchievements,
  unlockByKey,
  formatAchievement,
  getByKey,
};
