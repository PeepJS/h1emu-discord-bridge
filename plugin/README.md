# DiscordBridgePlugin

Server plugin for [h1z1-server](https://github.com/H1emu/h1z1-server) that exposes a **local HTTP API** for crate drops and player lookups. Pair with the optional [Discord Bridge Bot](../../tools/discord-bridge-bot/) so moderators can run `/cratedrop` and `/crateall` from Discord.

## Architecture

```
Discord (slash commands)
        │
        ▼
  discord-bridge-bot  ──HTTP Bearer──▶  DiscordBridgePlugin  ──▶  in-game crate delivery
  (separate process)                    (runs inside zone server)
```

The plugin does **not** connect to Discord itself. That keeps the game server simple and lets you test the HTTP API with curl or the included CLI **without** Discord admin access.

## Requirements

- h1z1-server with plugin support (2016 zone server, survival mode)
- MongoDB for Discord-ID → player lookup (optional; name-based drops work without it)

## Install (server owners)

### 1. Copy the plugin folder

```
your-server/
  plugins/
    DiscordBridgePlugin/
  config.yaml
```

### 2. Build (if using source)

```bash
cd plugins/DiscordBridgePlugin
npm install
npm run build
```

### 3. Configure

On first start, the plugin manager creates `plugins/discordbridgeplugin-config.yaml`. **Set `apiToken` to a long random secret** before exposing the API beyond localhost.

### 4. Start the server

Console should show:

```
[DiscordBridgePlugin] HTTP API listening on http://127.0.0.1:9877
[PluginManager] DiscordBridgePlugin initialized!
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Master switch |
| `httpPort` | `9877` | HTTP API port |
| `bindAddress` | `127.0.0.1` | `127.0.0.1` = local only; use `0.0.0.0` if the bot runs on another machine |
| `apiToken` | *(required)* | Bearer token for API auth |
| `defaultActorName` | `Discord` | Name shown in in-game announcements |
| `authKeysCollection` | `verified-authkeys` | MongoDB collection for Discord verification |
| `userSessionsCollection` | `user-sessions` | MongoDB sessions collection |

## HTTP API

All `/api/*` routes require `Authorization: Bearer YOUR_API_TOKEN`.

### `GET /health`

No auth. Returns plugin status and online player count.

### `GET /api/players`

List online players.

### `GET /api/crates`

List valid reward crate IDs and names.

### `POST /api/crate/drop`

Drop crates to one player or everyone.

```json
{
  "target": { "type": "all" },
  "crateIds": [5063],
  "actor": "Event Bot",
  "announce": "Community crate drop!"
}
```

Target types:

| type | value | Description |
|------|-------|-------------|
| `all` | — | Every online player |
| `name` | character name | Match in-game name (fuzzy) |
| `discordId` | Discord snowflake | Verified player must be online |

## Test without Discord

From repo root (with the zone server running and config token set):

```bash
cd tools/discord-bridge-bot
npm install
cp config.example.json config.json
# Edit config.json — set apiToken to match plugins/discordbridgeplugin-config.yaml
npm run test-api
npm run test-api -- drop-all 5063
npm run test-api -- drop-name "PlayerName" 5063
```

Or with curl:

```bash
curl -s http://127.0.0.1:9877/health
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:9877/api/crates
curl -s -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"target":{"type":"all"},"crateIds":[5063]}' \
  http://127.0.0.1:9877/api/crate/drop
```

## In-game command

| Command | Who | Description |
|---------|-----|-------------|
| `/discordbridge status` | Mod+ | Shows API bind address and online count |

## Common crate IDs

| ID | Crate |
|----|-------|
| 5063 | REWARD_CRATE_H1EMU |
| 5064 | REWARD_CRATE_VICTORY |
| 3626 | REWARD_CRATE_MARAUDER |
| 3821 | REWARD_CRATE_INFERNAL |

Run `GET /api/crates` for the full list on your server.

## Discord bot setup

See [tools/discord-bridge-bot/README.md](../../tools/discord-bridge-bot/README.md). Someone with Discord **Manage Server** permission must:

1. Create a Discord application and bot
2. Invite the bot with `applications.commands` scope
3. Copy bot token + guild ID into `config.json`
4. Run the bot on a machine that can reach the plugin HTTP API

## Security

- Keep `bindAddress` on `127.0.0.1` when the bot runs on the same machine as the game server
- Use a strong `apiToken` and never commit it
- Restrict Discord slash commands to moderator roles in the bot config

## License

GPL-3.0-only (same as h1z1-server)
