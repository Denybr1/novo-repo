/**
 * deploy-commands.js
 * Script de registro dos Slash Commands na API do Discord.
 * Execute UMA VEZ (ou sempre que adicionar/mudar comandos):
 *   node deploy-commands.js
 *
 * Usa GUILD_ID para registrar somente no servidor configurado (instantâneo).
 * Para registrar globalmente (pode demorar ~1h), remova o guildId do REST.put.
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`[DEPLOY] Carregado: /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n[DEPLOY] Registrando ${commands.length} comando(s) no servidor ${process.env.GUILD_ID}...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log(`[DEPLOY] ✅ ${data.length} comando(s) registrados com sucesso!\n`);
  } catch (error) {
    console.error('[DEPLOY] ❌ Erro ao registrar comandos:', error);
    process.exit(1);
  }
})();
