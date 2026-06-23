/**
 * commands/ranking.js
 * Slash command /ranking — exibe o top 10 usuários por XP.
 *
 * Mostra:
 *  - Posição
 *  - Username (buscado via Discord API)
 *  - Nível
 *  - XP total
 *  - Moedas
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');

// Medalhas para os 3 primeiros
const MEDALS = ['🥇', '🥈', '🥉'];

// Emojis de posição para os demais
function positionEmoji(pos) {
  return MEDALS[pos - 1] || `**${pos}.**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Veja o top 10 usuários mais ativos do servidor'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const topUsers = await db.getRanking(10);

      if (topUsers.length === 0) {
        return interaction.editReply({
          content: '📊 Nenhum usuário no ranking ainda. Comecem a interagir!',
        });
      }

      // Busca username de cada usuário via Discord API
      const rows = await Promise.all(
        topUsers.map(async (row, index) => {
          let username = `Usuário (${row.id})`;
          try {
            const member = await interaction.guild.members.fetch(row.id);
            username = member.user.username;
          } catch {
            // Usuário pode ter saído do servidor
          }

          const medal = positionEmoji(index + 1);
          return `${medal} **${username}** — Nível ${row.level} | ${row.xp.toLocaleString('pt-BR')} XP | 🪙 ${row.coins.toLocaleString('pt-BR')}`;
        })
      );

      // Posição do autor do comando
      const allUsers = await db.getRanking(1000);
      const authorPosition = allUsers.findIndex((u) => u.id === interaction.user.id) + 1;
      const authorData = allUsers.find((u) => u.id === interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Ranking de Atividade — Top 10')
        .setDescription(rows.join('\n'))
        .setTimestamp()
        .setFooter({ text: 'Fique em call e jogue para subir no ranking!' });

      // Adiciona posição do usuário atual se não estiver no top 10
      if (authorPosition > 10 && authorData) {
        embed.addFields({
          name: '📍 Sua Posição',
          value: `Você está em **#${authorPosition}** com ${authorData.xp.toLocaleString('pt-BR')} XP (Nível ${authorData.level})`,
          inline: false,
        });
      } else if (authorPosition > 0 && authorPosition <= 10) {
        embed.addFields({
          name: '📍 Sua Posição',
          value: `Você está em **#${authorPosition}** no ranking! ${authorPosition === 1 ? '👑 Você é o líder!' : 'Continue assim!'}`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[/ranking] Erro:', err.message);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao buscar o ranking. Tente novamente.',
      });
    }
  },
};
