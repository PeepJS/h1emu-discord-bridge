# Discord Bridge Bot

Discord companion for [DiscordBridgePlugin](../../plugins/DiscordBridgePlugin/). Lets moderators trigger **reward crate drops** from Discord slash commands.

You can develop and verify the integration **without Discord server access** using the [test API CLI](#test-without-discord) against a running zone server.

## Prerequisites

- [DiscordBridgePlugin](../../plugins/DiscordBridgePlugin/) installed and running on the zone server
- Matching `apiToken` in both plugin config and this bot's `config.json`
- For Discord deployment: someone with **Manage Server** on your Discord guild

## Quick start — test without Discord

1. Start your zone server with DiscordBridgePlugin loaded
2. Set `apiToken` in `plugins/discordbridgeplugin-config.yaml`
3. Copy and edit config:

```bash
cd tools/discord-bridge-bot
cp config.example.json config.json
# Set apiToken to match the plugin config
```

4. Run the CLI:

```bash
npm install
npm run test-api              # health check
npm run test-api -- players   # online players
npm run test-api -- crates    # valid crate IDs
npm run test-api -- giverewardtoall 5063
npm run test-api -- globalrewardtoall 5063
npm run test-api -- drop-name "YourCharacter" 5063
```

If these succeed, the game-server side works. Discord is only the UI layer.

## Discord bot setup (needs guild admin)

### 1. Create a Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications)
2. **New Application** → name it (e.g. "H1Emu Server Bot")
3. **Bot** → **Add Bot** → copy the **token** → `config.json` → `discordToken`
4. **OAuth2** → copy **Client ID** → `config.json` → `clientId`

### 2. Invite the bot

OAuth2 → URL Generator:

- Scopes: `bot`, `applications.commands`
- Bot permissions: no special permissions required (commands are role-gated in code)

Open the generated URL and add the bot to your guild. Copy the guild ID (Developer Mode → right-click server → Copy Server ID) → `config.json` → `guildId`.

### 3. Register slash commands

```bash
npm run register-commands
```

Commands appear in your guild within a minute.

### 4. Configure role tiers

Support and moderator roles are configured separately:

```json
{
  "moderatorRoleIds": ["MOD_ROLE_ID"],
  "supportRoleIds": ["SUPPORT_ROLE_ID"],

  "supportCrateLimit": 5,
  "supportCrateWindowHours": 24,
  "supportBlockedCommands": ["giverewardtoall", "globalrewardtoall"]
}
```

| Tier | Roles | Crate drops |
|------|-------|-------------|
| **Moderator** | `moderatorRoleIds` or Discord Administrator | Unlimited; all commands including mass/global drops |
| **Support** | `supportRoleIds` | Max **5 crates per 24 hours**; individual drops only (`/cratedrop`, `/cratedropdiscord`) |

Support staff can check remaining quota with `/cratequota` (ephemeral).

Usage is tracked per Discord user in `bot/data/rate-limits.json` (rolling 24-hour window).

### 5. Run the bot

```bash
npm start
```

The bot must reach `apiBaseUrl`. Default `http://127.0.0.1:9877` works when the bot runs on the same machine as the game server.

## Slash commands

| Command | Description |
|---------|-------------|
| `/cratequota` | Check support quota (moderators see unlimited notice) |
| `/players` | List online players (ephemeral) |
| `/crates` | List crate IDs (ephemeral) |
| `/cratedrop player:<name> crate:<id>` | Drop to one player by in-game name |
| `/giverewardtoall crate:<id> message:<text>` | Drop to everyone on **this server** |
| `/globalrewardtoall crate:<id> message:<text>` | Drop to everyone on **all servers** |
| `/cratedropdiscord user:<@user> crate:<id>` | Drop to verified Discord user (must be in-game) |

Default crate ID is `5063` (H1Emu crate) — override with `defaultCrateId` in config.

## Remote game server

If the bot runs on a different machine:

1. Plugin config: `bindAddress: "0.0.0.0"` and firewall allow `httpPort`
2. Bot config: `apiBaseUrl: "http://GAME_SERVER_IP:9877"`
3. Use TLS/reverse proxy in production

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Match `apiToken` in plugin and bot config |
| `ECONNREFUSED` | Zone server not running or wrong `apiBaseUrl` |
| Discord commands missing | Run `npm run register-commands` |
| Player not found (discord) | User must verify in Discord **and** be online in-game |
| Permission denied in Discord | Add role to `moderatorRoleIds` or `supportRoleIds` |
| Support limit reached | Wait for rolling window or ask a moderator; check `/cratequota` |

## License

GPL-3.0-only
