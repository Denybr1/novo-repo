/**
 * commands/perfil.js
 * Slash command /perfil — exibe o perfil de gamificação do usuário.
 *
 * Mostra:
 *  - XP atual e progresso até o próximo nível
 *  - Nível atual
 *  - Moedas
 *  - Tempo total em call
 *  - Tempo total jogando
 *  - Jogo mais jogado
 *  - Lista de conquistas
 *  - Missões do dia
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { getAchievements, getByKey } = require('../achievements');
const { MISSIONS, getMission, formatMission } = require('../missions');

// ─── Formatadores ─────────────────────────────────────────────────────────────

/**
 * Formata segundos para string legível.
 */
function formatTime(segundos) {
  if (segundos < 60) return `${segundos}s`;
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}min`);
  return parts.join(' ') || '0min';
}

/**
 * Barra de progresso de XP com caracteres Unicode.
 * @param {number} current - XP atual no nível
 * @param {number} needed  - XP necessário para subir
 * @param {number} bars    - quantidade de blocos na barra
 */
function xpBar(current, needed, bars = 10) {
  const filled = Math.round((current / needed) * bars);
  const empty = bars - filled;
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

// ─── Comando ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Veja seu perfil de gamificação ou o de outro usuário')
    .addUserOption((opt) =>
      opt
        .setName('usuario')
        .setDescription('Usuário para ver o perfil (padrão: você mesmo)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    // Determina o alvo: usuário mencionado ou quem usou o comando
    const target = interaction.options.getUser('usuario') || interaction.user;
    const userId = target.id;

    try {
      // ── Dados Básicos do Usuário ──────────────────────────────────────────
      const user = await db.getOrCreateUser(userId);

      const xpParaProximoNivel = user.level * 100;
      const xpNoNivelAtual = user.xp - (user.level > 1
        ? Array.from({ length: user.level - 1 }, (_, i) => (i + 1) * 100).reduce((a, b) => a + b, 0)
        : 0);

      // Calcula XP acumulado até o nível atual para deduzir do total
      let xpAcumulado = 0;
      for (let i = 1; i < user.level; i++) {
        xpAcumulado += i * 100;
      }
      const xpNesteNivel = user.xp - xpAcumulado;
      const progressPercent = Math.min(100, Math.round((xpNesteNivel / xpParaProximoNivel) * 100));

      // ── Jogos ─────────────────────────────────────────────────────────────
      const games = await db.getGamesForUser(userId);
      const topGame = games.length > 0 ? games[0] : null;

      // ── Conquistas ────────────────────────────────────────────────────────
      const userAchievements = await db.getAchievements(userId);

      // ── Missões do Dia ────────────────────────────────────────────────────
      const dailyMissionsRaw = await db.getDailyMissions(userId);
      const missionProgressMap = new Map(
        dailyMissionsRaw.map((m) => [m.mission_key, m])
      );

      // ── Monta Embed ───────────────────────────────────────────────────────
      const embed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle(`🎮 Perfil de ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: 'Sistema de Gamificação' });

      // ── Campo: Status Geral ───────────────────────────────────────────────
      embed.addFields({
        name: '📊 Status Geral',
        value: [
          `**Nível:** ${user.level}`,
          `**XP:** ${user.xp.toLocaleString('pt-BR')} total`,
          `**Progresso:** \`${xpBar(xpNesteNivel, xpParaProximoNivel)}\` ${progressPercent}%`,
          `**XP para lvl ${user.level + 1}:** ${xpNesteNivel} / ${xpParaProximoNivel}`,
          `**🪙 Moedas:** ${user.coins.toLocaleString('pt-BR')}`,
        ].join('\n'),
        inline: false,
      });

      // ── Campo: Tempo ──────────────────────────────────────────────────────
      embed.addFields({
        name: '⏱️ Tempo',
        value: [
          `**📞 Em Call:** ${formatTime(user.tempo_call)}`,
          `**🎮 Jogando:** ${formatTime(user.tempo_jogo)}`,
          topGame
            ? `**🏆 Jogo Favorito:** ${topGame.game_name} (${formatTime(topGame.tempo_total)})`
            : `**🏆 Jogo Favorito:** *Nenhum ainda*`,
        ].join('\n'),
        inline: false,
      });

      // ── Campo: Jogos Detectados ───────────────────────────────────────────
      if (games.length > 0) {
        const gamesText = games
          .slice(0, 5)
          .map((g, i) => `${i + 1}. **${g.game_name}** — ${formatTime(g.tempo_total)}`)
          .join('\n');
        embed.addFields({
          name: '🕹️ Jogos Mais Jogados',
          value: gamesText || 'Nenhum jogo detectado ainda.',
          inline: false,
        });
      }

      // ── Campo: Conquistas ─────────────────────────────────────────────────
      if (userAchievements.length > 0) {
        const achievementText = userAchievements
          .slice(0, 10) // Limita a 10 para não estourar o embed
          .map((a) => {
            const def = getByKey(a.achievement_name);
            return def
              ? `${def.emoji} **${def.name}**`
              : `🏅 ${a.achievement_name}`;
          })
          .join('\n');

        embed.addFields({
          name: `🏆 Conquistas (${userAchievements.length})`,
          value: achievementText,
          inline: false,
        });
      } else {
        embed.addFields({
          name: '🏆 Conquistas',
          value: '*Nenhuma conquista ainda. Continue ativo!*',
          inline: false,
        });
      }

      // ── Campo: Missões do Dia ─────────────────────────────────────────────
      const missionsText = MISSIONS.map((mission) => {
        const progress = missionProgressMap.get(mission.key) || null;
        return formatMission(mission, progress);
      }).join('\n\n');

      embed.addFields({
        name: '📋 Missões do Dia',
        value: missionsText || '*Sem missões ativas.*',
        inline: false,
      });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[/perfil] Erro:', err.message);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao buscar seu perfil. Tente novamente.',
      });
    }
  },
};
