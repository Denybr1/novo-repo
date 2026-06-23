/**
 * commands/missoes.js
 * Slash command /missoes — lista as missões diárias do usuário com progresso.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { MISSIONS, formatMission } = require('../missions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('missoes')
    .setDescription('Veja suas missões diárias e o progresso atual'),

  async execute(interaction) {
    await interaction.deferReply();

    const userId = interaction.user.id;

    try {
      await db.getOrCreateUser(userId);

      const dailyRaw = await db.getDailyMissions(userId);
      const progressMap = new Map(dailyRaw.map((m) => [m.mission_key, m]));

      const completedCount = dailyRaw.filter((m) => m.completed).length;
      const totalCount = MISSIONS.length;

      const missionsText = MISSIONS.map((mission) => {
        const progress = progressMap.get(mission.key) || null;
        return formatMission(mission, progress);
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor('#00FF7F')
        .setTitle(`📋 Missões do Dia — ${interaction.user.username}`)
        .setDescription(
          `**Progresso:** ${completedCount}/${totalCount} missões completas\n\n${missionsText}`
        )
        .setTimestamp()
        .setFooter({ text: 'As missões resetam à meia-noite. Bom jogo!' });

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[/missoes] Erro:', err.message);
      await interaction.editReply({
        content: '❌ Erro ao buscar missões. Tente novamente.',
      });
    }
  },
};
