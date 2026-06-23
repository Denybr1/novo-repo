/**
 * events/presence.js
 * Detecta quando usuários começam ou param de jogar usando presenceUpdate.
 *
 * Lógica:
 *  - Quando um usuário começa a jogar → registra no mapa usersPlaying (de voice.js)
 *    e salva o timestamp de início para calcular tempo ao parar.
 *  - Quando para de jogar → calcula tempo jogado, salva no banco e remove do mapa.
 *  - XP extra por jogar é concedido pelo loop de call (voice.js) via combo bônus.
 *    Se o usuário estiver jogando mas NOT em call, ganha +15 XP a cada minuto aqui.
 */

const db = require('../database');
const achievements = require('../achievements');
const { usersInCall, usersPlaying } = require('./voice');

// ─── Estado em Memória ────────────────────────────────────────────────────────

/**
 * Registra o timestamp de quando cada usuário começou a jogar
 * para calcular duração quando parar.
 * Chave: userId | Valor: { startedAt: Date, gameName: string }
 */
const gameSessionStart = new Map();

/**
 * Timer para usuários que estão JOGANDO mas NÃO estão em call.
 * O XP de jogo fora de call é processado aqui, a cada 60s.
 * Chave: userId | Valor: NodeJS.Timeout
 */
const soloGameTimers = new Map();

// ─── Mensagens ────────────────────────────────────────────────────────────────

async function sendToChannel(client, message) {
  const channelId = process.env.CHANNEL_ID;
  if (!channelId) {
    console.log('[CHANNEL]', message);
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(message);
    }
  } catch (err) {
    console.error('[CHANNEL] Erro ao enviar mensagem:', err.message);
  }
}

// ─── Timer de XP Solo (jogando sem call) ─────────────────────────────────────

/**
 * Inicia um timer que dá +15 XP por minuto para usuários jogando sem estar em call.
 * Quando o usuário entra em call, o voice.js já cuida do bônus; aqui paramos o timer.
 */
function startSoloGameTimer(client, userId, gameName) {
  // Para qualquer timer anterior
  stopSoloGameTimer(userId);

  const timer = setInterval(async () => {
    // Se o usuário entrou em call, o voice.js cuida do XP — não duplicar
    if (usersInCall.has(userId)) return;

    try {
      const TICK_SECONDS = 60;

      // +15 XP por minuto jogando (sem call)
      const levelResult = await db.addXP(userId, 15);
      await db.addTempoJogo(userId, TICK_SECONDS);
      await db.addTempoGame(userId, gameName, TICK_SECONDS);

      console.log(`[PRESENCE] ${userId} jogando "${gameName}" solo — +15 XP`);

      if (levelResult.leveled_up) {
        await sendToChannel(
          client,
          `⬆️ **LEVEL UP!** <@${userId}> subiu para o **nível ${levelResult.new_level}** enquanto jogava **${gameName}**! 🎮`
        );
      }

      // Verifica conquistas
      const newAchievements = await achievements.checkAchievements(userId);
      for (const ach of newAchievements) {
        await sendToChannel(
          client,
          `🏆 <@${userId}> desbloqueou **${ach.name}** ${ach.emoji} jogando ${gameName}!`
        );
      }

      // Missão de jogo solo
      const { incrementMission } = require('../database');
      const { getMission } = require('../missions');
      const mission = getMission('jogo_20min');
      if (mission) {
        const result = await db.incrementMission(userId, 'jogo_20min', TICK_SECONDS, mission.goal);
        if (result.completed && result.progress - TICK_SECONDS < mission.goal) {
          await sendToChannel(
            client,
            `✅ <@${userId}> completou a missão **${mission.emoji} ${mission.name}**!\n> +${mission.reward_xp} XP | +${mission.reward_coins} 🪙`
          );
          await db.addXP(userId, mission.reward_xp);
          await db.addCoins(userId, mission.reward_coins);
        }
      }

    } catch (err) {
      console.error(`[PRESENCE] Erro no timer de jogo solo para ${userId}:`, err.message);
    }
  }, 60 * 1000);

  soloGameTimers.set(userId, timer);
}

/**
 * Para o timer de XP solo do usuário.
 */
function stopSoloGameTimer(userId) {
  if (soloGameTimers.has(userId)) {
    clearInterval(soloGameTimers.get(userId));
    soloGameTimers.delete(userId);
  }
}

// ─── Handler: presenceUpdate ──────────────────────────────────────────────────

/**
 * Chamado sempre que a presença de um usuário muda.
 * Detecta início e fim de sessões de jogo.
 */
async function handlePresenceUpdate(oldPresence, newPresence, client) {
  if (!newPresence || !newPresence.member) return;

  // Ignora bots
  if (newPresence.member.user.bot) return;

  const userId = newPresence.userId;

  // ── Detecta qual jogo está rodando agora ──────────────────────────────────
  const currentGame = newPresence.activities?.find(
    (activity) => activity.type === 0 // 0 = PLAYING (jogando um jogo)
  );

  const previousGame = oldPresence?.activities?.find(
    (activity) => activity.type === 0
  );

  const currentGameName = currentGame?.name || null;
  const previousGameName = previousGame?.name || null;

  // ── Nenhuma mudança relevante ─────────────────────────────────────────────
  if (currentGameName === previousGameName) return;

  // ── Parou de jogar ────────────────────────────────────────────────────────
  if (previousGameName && !currentGameName) {
    const session = gameSessionStart.get(userId);
    usersPlaying.delete(userId);
    stopSoloGameTimer(userId);

    if (session) {
      const seconds = Math.floor((new Date() - session.startedAt) / 1000);
      gameSessionStart.delete(userId);

      // Salva o tempo total (já foi incrementado tick a tick, mas salva o restante)
      const remainder = seconds % 60;
      if (remainder > 0) {
        await db.addTempoJogo(userId, remainder);
        await db.addTempoGame(userId, session.gameName, remainder);
      }

      console.log(
        `[PRESENCE] ${userId} parou de jogar "${session.gameName}" (${Math.floor(seconds / 60)}min)`
      );

      await sendToChannel(
        client,
        `🎮 <@${userId}> parou de jogar **${session.gameName}**. Sessão: \`${Math.floor(seconds / 60)} min\`.`
      );
    }
  }

  // ── Começou a jogar (ou mudou de jogo) ────────────────────────────────────
  else if (currentGameName) {
    // Se mudou de jogo, encerra sessão anterior
    if (previousGameName) {
      const session = gameSessionStart.get(userId);
      if (session) {
        const seconds = Math.floor((new Date() - session.startedAt) / 1000);
        const remainder = seconds % 60;
        if (remainder > 0) {
          await db.addTempoJogo(userId, remainder);
          await db.addTempoGame(userId, session.gameName, remainder);
        }
        console.log(`[PRESENCE] ${userId} mudou de "${previousGameName}" para "${currentGameName}"`);
      }
    } else {
      // Começou a jogar do zero
      console.log(`[PRESENCE] ${userId} começou a jogar "${currentGameName}"`);
      await db.getOrCreateUser(userId);

      await sendToChannel(
        client,
        `🎮 <@${userId}> começou a jogar **${currentGameName}**! 🕹️`
      );
    }

    // Registra início da sessão e atualiza o mapa de jogadores ativos
    gameSessionStart.set(userId, { startedAt: new Date(), gameName: currentGameName });
    usersPlaying.set(userId, currentGameName);

    // Inicia timer de XP solo (só ativo se não estiver em call)
    startSoloGameTimer(client, userId, currentGameName);
  }
}

// ─── Exportações ──────────────────────────────────────────────────────────────

module.exports = {
  handlePresenceUpdate,
  gameSessionStart,
  soloGameTimers,
};
