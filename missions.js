/**
 * missions.js
 * Define as missões diárias do sistema de gamificação.
 * As missões resetam todo dia (baseado na data atual).
 */

// ─── Definição das Missões ────────────────────────────────────────────────────

const MISSIONS = [
  {
    key: 'call_5min',
    name: 'Aquecimento Vocal',
    emoji: '🎙️',
    description: 'Fique 5 minutos em call',
    goal: 300,         // em segundos
    unit: 'segundos em call',
    reward_xp: 50,
    reward_coins: 20,
  },
  {
    key: 'call_30min',
    name: 'Morador do Call',
    emoji: '🔊',
    description: 'Fique 30 minutos em call hoje',
    goal: 1800,
    unit: 'segundos em call',
    reward_xp: 150,
    reward_coins: 75,
  },
  {
    key: 'jogo_20min',
    name: 'Hora do Game',
    emoji: '🎮',
    description: 'Jogue por 20 minutos hoje',
    goal: 1200,
    unit: 'segundos jogando',
    reward_xp: 100,
    reward_coins: 40,
  },
  {
    key: 'combo_10min',
    name: 'Combo Master',
    emoji: '🔥',
    description: 'Fique 10 minutos em call jogando ao mesmo tempo',
    goal: 600,
    unit: 'segundos em combo',
    reward_xp: 200,
    reward_coins: 100,
  },
  {
    key: 'level_up_once',
    name: 'Em Evolução',
    emoji: '⬆️',
    description: 'Suba de nível uma vez hoje',
    goal: 1,
    unit: 'level ups',
    reward_xp: 50,
    reward_coins: 30,
  },
];

/**
 * Retorna o objeto de missão pelo key.
 */
function getMission(key) {
  return MISSIONS.find((m) => m.key === key) || null;
}

/**
 * Formata uma missão para exibição no Discord.
 * @param {object} mission - definição da missão (de MISSIONS)
 * @param {object} progress - linha da tabela missions do DB (pode ser null)
 */
function formatMission(mission, progress) {
  const current = progress ? progress.progress : 0;
  const completed = progress ? progress.completed : false;

  let goalDisplay;
  // Formata a meta em unidades legíveis se for em segundos
  if (mission.goal >= 60) {
    goalDisplay = `${Math.floor(mission.goal / 60)} min`;
  } else {
    goalDisplay = `${mission.goal}`;
  }

  let progressDisplay;
  if (mission.goal >= 60) {
    progressDisplay = `${Math.floor(current / 60)} min`;
  } else {
    progressDisplay = `${current}`;
  }

  const status = completed
    ? '✅'
    : `${progressDisplay} / ${goalDisplay}`;

  return `${mission.emoji} **${mission.name}** — ${mission.description}\n` +
         `   Recompensa: \`+${mission.reward_xp} XP\` | \`+${mission.reward_coins} 🪙\` | Status: ${status}`;
}

module.exports = {
  MISSIONS,
  getMission,
  formatMission,
};
