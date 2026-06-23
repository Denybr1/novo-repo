/**
 * events/voice.js
 * Gerencia todos os eventos de voz do Discord.
 *
 * Responsabilidades:
 *  - Detectar entrada e saída de canais de voz
 *  - Manter mapa em memória de quem está em call (com timestamp de entrada)
 *  - Rodar um loop a cada 60 segundos distribuindo XP/moedas
 *  - Aplicar bônus de combo (call + jogo)
 *  - Desbloquear conquistas e missões relacionadas
 *  - Drop aleatório de moedas
 */

const db = require('../database');
const achievements = require('../achievements');
const { MISSIONS, getMission } = require('../missions');

// ─── Estado em Memória ────────────────────────────────────────────────────────

/**
 * Mapa de usuários atualmente em call.
 * Chave: userId (string)
 * Valor: { joinedAt: Date, guildId: string }
 */
const usersInCall = new Map();

/**
 * Mapa de usuários atualmente detectados jogando algum jogo.
 * Preenchido pelo presence.js e lido aqui para calcular bônus.
 * Chave: userId (string)
 * Valor: gameName (string)
 */
const usersPlaying = new Map();

// ─── Mensagens Gamificadas ────────────────────────────────────────────────────

const CALL_MESSAGES = [
  '🧟 Você sobreviveu mais 1 minuto em call...',
  '📡 Sinal recebido! Você ainda está no call. Por algum motivo.',
  '☕ Mais um minuto nessa call interminável. Segura o café.',
  '🎙️ Microfone ativo. Sanidade: questionável.',
  '👁️ O call te observa. Você ganhou XP.',
  '🌑 Nas profundezas do canal de voz, você persiste.',
  '⏳ Tick tock... você ainda está aqui. Respeito.',
  '🔊 Volume: alto. Paciência: infinita. XP: conquistado.',
  '🛸 Missão em andamento. XP creditado na sua conta galáctica.',
  '🎮 A call não para, o XP não para. Vai que vai!',
];

const COMBO_MESSAGES = [
  '🔥 COMBO ATIVADO! Call + Jogo = XP máximo desbloqueado!',
  '⚡ Multitarefa suprema! Jogando e no call — bônus concedido!',
  '💥 MODO HARDCORE! Você está jogando E no call. Lendário.',
  '🎯 Call + Jogo detectados. Bônus máximo liberado, guerreiro!',
  '🚀 Duplo bônus! Sua dedicação é inspiradora (ou preocupante).',
];

const DROP_MESSAGES = [
  '💸 MOEDA CAIU DO CÉU! Você encontrou um saco de moedas perdido!',
  '🍀 DROP RARO! As moedas te escolheram hoje!',
  '🎲 SORTE ATIVADA! Um bônus misterioso foi creditado!',
  '💰 EVENTO ESPECIAL! Moedas extras pousaram na sua conta!',
];

function randomMessage(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Formata segundos para string legível (ex: 1h 23min 45s)
 */
function formatTime(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Envia mensagem no canal configurado via env.
 * Se não houver canal configurado, loga no console.
 */
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

// ─── Verificação de Conquistas e Missões ─────────────────────────────────────

/**
 * Após cada tick de XP, verifica conquistas automáticas e envia notificações.
 */
async function checkAndNotify(client, userId, username) {
  const newAchievements = await achievements.checkAchievements(userId);
  for (const ach of newAchievements) {
    await sendToChannel(
      client,
      `🏆 <@${userId}> desbloqueou a conquista **${ach.name}** ${ach.emoji}\n> *${ach.description}*`
    );
  }
}

/**
 * Atualiza progresso de missões de call/jogo e notifica conclusões.
 */
async function updateMissions(client, userId, secondsCall, secondsGame, secondsCombo, leveledUp) {
  const missionUpdates = [
    { key: 'call_5min', increment: secondsCall },
    { key: 'call_30min', increment: secondsCall },
    { key: 'jogo_20min', increment: secondsGame },
    { key: 'combo_10min', increment: secondsCombo },
  ];

  if (leveledUp) {
    missionUpdates.push({ key: 'level_up_once', increment: 1 });
  }

  for (const update of missionUpdates) {
    const mission = getMission(update.key);
    if (!mission || update.increment === 0) continue;

    const result = await db.incrementMission(userId, update.key, update.increment, mission.goal);

    // Notifica quando completa pela primeira vez (progress cruzou o goal)
    if (result.completed && result.progress - update.increment < mission.goal) {
      await sendToChannel(
        client,
        `✅ <@${userId}> completou a missão diária **${mission.emoji} ${mission.name}**!\n` +
        `> Recompensa: \`+${mission.reward_xp} XP\` | \`+${mission.reward_coins} 🪙\``
      );
      await db.addXP(userId, mission.reward_xp);
      await db.addCoins(userId, mission.reward_coins);
    }
  }
}

// ─── Loop Principal de XP ─────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 60 * 1000; // 60 segundos

/**
 * Inicia o loop de recompensas.
 * A cada 60 segundos, percorre todos os usuários em call e distribui XP/moedas.
 */
function startXPLoop(client) {
  setInterval(async () => {
    if (usersInCall.size === 0) return;

    console.log(`[XP LOOP] Tick — ${usersInCall.size} usuário(s) em call`);

    for (const [userId, data] of usersInCall.entries()) {
      try {
        const isPlaying = usersPlaying.has(userId);
        const gameName = isPlaying ? usersPlaying.get(userId) : null;

        let xpGain = 0;
        let coinsGain = 0;
        let secondsCombo = 0;

        const TICK_SECONDS = 60; // 1 minuto por tick

        if (isPlaying) {
          // COMBO: call + jogo — máximo bônus
          xpGain = 30;
          coinsGain = 10;
          secondsCombo = TICK_SECONDS;

          // Desbloqueia conquista de combo (manual)
          const comboAch = await achievements.unlockByKey(userId, 'combo_call_jogo');
          if (comboAch) {
            await sendToChannel(
              client,
              `🏆 <@${userId}> desbloqueou a conquista **${comboAch.name}** ${comboAch.emoji}\n> *${comboAch.description}*`
            );
          }
        } else {
          // Somente call
          xpGain = 10;
          coinsGain = 5;
        }

        // ── Aplica XP ──────────────────────────────────────────────────────
        const levelResult = await db.addXP(userId, xpGain);
        await db.addCoins(userId, coinsGain);
        await db.addTempoCall(userId, TICK_SECONDS);

        // ── Jogo: registra tempo no jogo específico ────────────────────────
        if (isPlaying && gameName) {
          await db.addTempoJogo(userId, TICK_SECONDS);
          await db.addTempoGame(userId, gameName, TICK_SECONDS);
        }

        // ── Drop Aleatório de Moedas (5% de chance por tick) ──────────────
        if (Math.random() < 0.05) {
          const dropAmount = Math.floor(Math.random() * 20) + 5; // 5 a 25 moedas
          await db.addCoins(userId, dropAmount);
          await sendToChannel(
            client,
            `${randomMessage(DROP_MESSAGES)} <@${userId}> recebeu **+${dropAmount} 🪙**!`
          );
        }

        // ── Notifica Level Up ─────────────────────────────────────────────
        if (levelResult.leveled_up) {
          await sendToChannel(
            client,
            `⬆️ **LEVEL UP!** <@${userId}> subiu para o **nível ${levelResult.new_level}**! 🎉`
          );
        }

        // ── Verifica Conquistas ────────────────────────────────────────────
        await checkAndNotify(client, userId, userId);

        // ── Atualiza Missões ───────────────────────────────────────────────
        await updateMissions(
          client,
          userId,
          TICK_SECONDS,                          // segundos em call
          isPlaying ? TICK_SECONDS : 0,          // segundos jogando
          secondsCombo,                          // segundos em combo
          levelResult.leveled_up
        );

      } catch (err) {
        console.error(`[XP LOOP] Erro ao processar usuário ${userId}:`, err.message);
      }
    }
  }, TICK_INTERVAL_MS);

  console.log(`[XP LOOP] Loop iniciado — tick a cada ${TICK_INTERVAL_MS / 1000}s`);
}

// ─── Handler: voiceStateUpdate ────────────────────────────────────────────────

/**
 * Registrado no client como evento voiceStateUpdate.
 * Detecta entrada e saída de canais de voz.
 */
async function handleVoiceState(oldState, newState, client) {
  const userId = newState.id || oldState.id;

  // Ignora bots
  if (newState.member?.user?.bot || oldState.member?.user?.bot) return;

  const wasInCall = oldState.channelId !== null;
  const isInCall = newState.channelId !== null;

  // ── Entrou em call ────────────────────────────────────────────────────────
  if (!wasInCall && isInCall) {
    usersInCall.set(userId, { joinedAt: new Date(), guildId: newState.guild.id });
    console.log(`[VOICE] ${userId} entrou no canal "${newState.channel.name}"`);

    // Garante que o usuário existe no banco
    await db.getOrCreateUser(userId);

    await sendToChannel(
      client,
      `📞 <@${userId}> entrou no call **${newState.channel.name}**! O contador de XP começou... ⏱️`
    );
  }

  // ── Saiu do call ─────────────────────────────────────────────────────────
  else if (wasInCall && !isInCall) {
    const session = usersInCall.get(userId);
    usersInCall.delete(userId);

    if (session) {
      const seconds = Math.floor((new Date() - session.joinedAt) / 1000);
      console.log(`[VOICE] ${userId} saiu do call (sessão: ${formatTime(seconds)})`);

      await sendToChannel(
        client,
        `📴 <@${userId}> saiu do call. Tempo de sessão: **${formatTime(seconds)}** — até a próxima! 👋`
      );
    }
  }

  // ── Mudou de canal ────────────────────────────────────────────────────────
  else if (wasInCall && isInCall && oldState.channelId !== newState.channelId) {
    console.log(`[VOICE] ${userId} mudou para canal "${newState.channel.name}"`);
    // Mantém o usuário no mapa (continua acumulando XP)
  }
}

// ─── Exportações ──────────────────────────────────────────────────────────────

module.exports = {
  usersInCall,
  usersPlaying,
  startXPLoop,
  handleVoiceState,
};