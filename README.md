# 🎮 Discord Gamification Bot

Bot completo de gamificação para Discord com XP, moedas, conquistas, missões diárias e ranking — baseado em atividade em **call de voz** e **jogos detectados**.

---

## 📦 Tecnologias

- **Node.js** (v18+)
- **discord.js** v14
- **SQLite3** (banco de dados local, zero configuração)
- **dotenv** (variáveis de ambiente)

---

## 🚀 Instalação

### 1. Clone ou baixe os arquivos
```bash
cd discord-gamification-bot
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure o ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com seus dados:

```env
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
GUILD_ID=id_do_seu_servidor_aqui
CHANNEL_ID=id_do_canal_para_notificacoes
```

#### Como obter cada valor:
| Variável | Onde encontrar |
|---|---|
| `DISCORD_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Seu App → Bot → Token |
| `CLIENT_ID` | Developer Portal → Seu App → OAuth2 → Client ID |
| `GUILD_ID` | Discord → Clique direito no servidor → "Copiar ID" (modo desenvolvedor ativado) |
| `CHANNEL_ID` | Discord → Clique direito no canal de texto → "Copiar ID" |

### 4. Habilite os Intents Privilegiados

No [Discord Developer Portal](https://discord.com/developers/applications):
1. Vá em **Bot**
2. Ative:
   - ✅ `PRESENCE INTENT` (para detectar jogos)
   - ✅ `SERVER MEMBERS INTENT` (para buscar membros no ranking)
   - ✅ `MESSAGE CONTENT INTENT` (opcional, mas recomendado)

### 5. Registre os Slash Commands

```bash
npm run deploy
```

> ⚠️ Execute isso **antes** de iniciar o bot e **sempre que adicionar novos comandos**.

### 6. Inicie o bot

```bash
npm start
```

---

## 💬 Comandos

| Comando | Descrição |
|---|---|
| `/perfil` | Exibe seu XP, nível, moedas, tempo, conquistas e missões do dia |
| `/perfil @usuario` | Exibe o perfil de outro usuário |
| `/ranking` | Top 10 usuários por XP do servidor |
| `/missoes` | Lista as missões diárias com progresso |

---

## 🎯 Sistema de XP e Moedas

| Situação | XP/min | Moedas/min |
|---|---|---|
| Somente em call | +10 XP | +5 🪙 |
| Somente jogando (sem call) | +15 XP | — |
| **Call + Jogo (COMBO)** | **+30 XP** | **+10 🪙** |

### Drop Aleatório
- 5% de chance por minuto em call de ganhar entre **5 e 25 moedas extras** 💸

### Fórmula de Nível
```
XP necessário para próximo nível = nível_atual × 100
```
Exemplos:
- Nível 1 → 2: 100 XP
- Nível 5 → 6: 500 XP
- Nível 10 → 11: 1000 XP

---

## 🏆 Conquistas

| Conquista | Condição |
|---|---|
| 🎙️ Sobrevivente de Call | 10 minutos em call |
| 🔊 Habitante do Servidor de Voz | 1 hora em call |
| 🎤 Dono do Microfone | 5 horas em call |
| 👽 Ser de Outro Planeta | 24 horas em call no total |
| 🎮 Gamer Iniciante | 30 minutos jogando |
| 🕹️ Gamer Veterano | 3 horas jogando |
| 💀 Sem Vida Social | 10 horas jogando |
| 🔥 Modo Multitarefa | Jogou enquanto estava em call |
| ⬆️ Ascendendo | Nível 5 |
| 🌟 Veterano | Nível 10 |
| 🏆 Lendário | Nível 25 |
| 🐷 Porquinho Feliz | 100 moedas |
| 💰 Magnata | 1000 moedas |

---

## 📋 Missões Diárias

Resetam todo dia à meia-noite (baseado na data local).

| Missão | Objetivo | Recompensa |
|---|---|---|
| 🎙️ Aquecimento Vocal | 5 min em call | +50 XP / +20 🪙 |
| 🔊 Morador do Call | 30 min em call | +150 XP / +75 🪙 |
| 🎮 Hora do Game | 20 min jogando | +100 XP / +40 🪙 |
| 🔥 Combo Master | 10 min call + jogo | +200 XP / +100 🪙 |
| ⬆️ Em Evolução | Subir de nível | +50 XP / +30 🪙 |

---

## 🗄️ Banco de Dados

Criado automaticamente em `gamification.db` ao iniciar o bot.

### Tabelas

**`users`** — dados principais de cada usuário
```sql
id TEXT PRIMARY KEY, xp INTEGER, level INTEGER,
coins INTEGER, tempo_call INTEGER, tempo_jogo INTEGER, last_drop INTEGER
```

**`user_games`** — tempo total por jogo por usuário
```sql
user_id TEXT, game_name TEXT, tempo_total INTEGER
```

**`achievements`** — conquistas desbloqueadas
```sql
user_id TEXT, achievement_name TEXT, unlocked_at INTEGER
```

**`missions`** — progresso de missões diárias
```sql
user_id TEXT, mission_key TEXT, progress INTEGER, completed INTEGER, date TEXT
```

---

## 📁 Estrutura do Projeto

```
discord-gamification-bot/
├── index.js              # Ponto de entrada, registra eventos e inicializa tudo
├── database.js           # Módulo SQLite: tabelas, queries, todas funções async
├── achievements.js       # Definição e verificação de conquistas
├── missions.js           # Definição das missões diárias
├── deploy-commands.js    # Script para registrar slash commands na API Discord
├── events/
│   ├── voice.js          # voiceStateUpdate: entrada/saída de call + loop de XP
│   └── presence.js       # presenceUpdate: detecção de jogos + XP solo
├── commands/
│   ├── perfil.js         # /perfil — exibe perfil completo do usuário
│   ├── ranking.js        # /ranking — top 10 por XP
│   └── missoes.js        # /missoes — missões diárias com progresso
├── .env.example          # Modelo de configuração
├── package.json
└── README.md
```

---

## ⚙️ Permissões Necessárias para o Bot

Ao adicionar o bot ao servidor, garanta que ele tenha:
- `Read Messages / View Channels`
- `Send Messages`
- `Embed Links`
- `Connect` (voz)
- `View Audit Log` (opcional)

---

## 🛠️ Solução de Problemas

**Bot não detecta jogos?**
→ Verifique se o `PRESENCE INTENT` está ativado no Developer Portal.

**Slash commands não aparecem?**
→ Execute `npm run deploy` e aguarde até 1 minuto.

**Banco de dados corrompido?**
→ Delete o arquivo `gamification.db` e reinicie. O bot cria tudo do zero.

**Mensagens não chegam no canal?**
→ Verifique se `CHANNEL_ID` está correto e o bot tem permissão de enviar mensagens nele.
