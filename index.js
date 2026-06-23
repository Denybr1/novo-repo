/**
 * index.js
 * Ponto de entrada principal do Bot de Gamificação Discord.
 *
 * Responsabilidades:
 *  - Carregar variáveis de ambiente
 *  - Inicializar banco de dados
 *  - Criar o client Discord com os intents necessários
 *  - Registrar todos os eventos e comandos dinamicamente
 *  - Iniciar o loop de XP
 *  - Logar o bot
 */

// ─── Configuração de Ambiente ─────────────────────────────────────────────────
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

const db                            = require('./database');
const { startXPLoop, handleVoiceState } = require('./events/voice');
const { handlePresenceUpdate }      = require('./events/presence');

// ─── Validação de Variáveis de Ambiente ───────────────────────────────────────
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[CONFIG] ❌ Variável de ambiente obrigatória não definida: ${key}`);
    console.error('[CONFIG] Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }
}

// ─── Criação do Client Discord ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // Necessário para comandos e guild info
    GatewayIntentBits.GuildVoiceStates, // Necessário para voiceStateUpdate
    GatewayIntentBits.GuildPresences,   // Necessário para presenceUpdate (detecção de jogo)
    GatewayIntentBits.GuildMembers,     // Necessário para buscar membros no ranking
    GatewayIntentBits.GuildMessages,    // Necessário para enviar mensagens
  ],
  partials: [Partials.GuildMember, Partials.User],
});

// ─── Coleção de Comandos Slash ────────────────────────────────────────────────
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`[COMMANDS] Carregado: /${command.data.name}`);
  } else {
    console.warn(`[COMMANDS] ⚠️  Arquivo ignorado (falta data/execute): ${file}`);
  }
}

// ─── Evento: Bot Pronto ───────────────────────────────────────────────────────
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`\n✅ Bot online como: ${readyClient.user.tag}`);
  console.log(`🌐 Conectado a ${readyClient.guilds.cache.size} servidor(es)\n`);

  // Define o status do bot
  readyClient.user.setPresence({
    activities: [{ name: '🎮 Rastreando atividade', type: 0 }],
    status: 'online',
  });

  // Inicia o loop de XP (roda a cada 60s para usuários em call)
  startXPLoop(readyClient);
});

// ─── Evento: Slash Commands ───────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`[COMMANDS] Comando não encontrado: ${interaction.commandName}`);
    return interaction.reply({
      content: '❌ Comando não encontrado.',
      ephemeral: true,
    });
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[COMMANDS] Erro em /${interaction.commandName}:`, err);
    const payload = { content: '❌ Ocorreu um erro ao executar este comando.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// ─── Evento: Voz ─────────────────────────────────────────────────────────────
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceState(oldState, newState, client).catch((err) => {
    console.error('[VOICE] Erro no handler:', err.message);
  });
});

// ─── Evento: Presença (detecção de jogo) ─────────────────────────────────────
client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
  handlePresenceUpdate(oldPresence, newPresence, client).catch((err) => {
    console.error('[PRESENCE] Erro no handler:', err.message);
  });
});

// ─── Tratamento de Erros Globais ──────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Rejeição não tratada em:', promise, '\nMotivo:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Exceção não capturada:', err);
});

// ─── Inicialização ────────────────────────────────────────────────────────────
(async () => {
  try {
    // 1. Inicializa banco de dados (cria tabelas se não existirem)
    console.log('[INIT] Inicializando banco de dados...');
    await db.initDatabase();

    // 2. Loga o bot no Discord
    console.log('[INIT] Conectando ao Discord...');
    await client.login(process.env.DISCORD_TOKEN);

  } catch (err) {
    console.error('[INIT] ❌ Falha ao iniciar o bot:', err.message);
    process.exit(1);
  }
})();
