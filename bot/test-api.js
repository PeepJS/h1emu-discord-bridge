import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerRegistry } from "./servers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json — copy config.example.json and edit it.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const serverRegistry = createServerRegistry(config);

function parseArgs(argv) {
  const args = [...argv];
  let serverId;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--server" && args[i + 1]) {
      serverId = args[i + 1];
      args.splice(i, 2);
      break;
    }
  }

  const command = args[0];
  const rest = args.slice(1);
  return { serverId, command, rest };
}

const { serverId, command, rest: args } = parseArgs(process.argv.slice(2));

async function main() {
  switch (command) {
    case undefined:
    case "health": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const data = await client.health();
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "servers": {
      console.log(JSON.stringify(serverRegistry.servers, null, 2));
      break;
    }
    case "players": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const data = await client.listPlayers();
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "crates": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const data = await client.listCrates();
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "drop-all":
    case "giverewardtoall": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const crateIds = args.map(Number).filter((n) => !Number.isNaN(n));
      if (!crateIds.length) {
        console.error(
          "Usage: npm run test-api -- [--server id] giverewardtoall <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await client.dropCrates({
        target: { type: "all" },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "globalrewardtoall": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const crateIds = args.map(Number).filter((n) => !Number.isNaN(n));
      if (!crateIds.length) {
        console.error(
          "Usage: npm run test-api -- [--server id] globalrewardtoall <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await client.dropCrates({
        target: { type: "global" },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "drop-name": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const [name, ...crateArg] = args;
      const crateIds = crateArg.map(Number).filter((n) => !Number.isNaN(n));
      if (!name || !crateIds.length) {
        console.error(
          "Usage: npm run test-api -- [--server id] drop-name <characterName> <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await client.dropCrates({
        target: { type: "name", value: name },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "drop-discord": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const [discordId, ...crateArg] = args;
      const crateIds = crateArg.map(Number).filter((n) => !Number.isNaN(n));
      if (!discordId || !crateIds.length) {
        console.error(
          "Usage: npm run test-api -- [--server id] drop-discord <discordUserId> <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await client.dropCrates({
        target: { type: "discordId", value: discordId },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    case "alert": {
      const { server, client } = serverRegistry.resolveFromId(serverId);
      const scopeArg = args[args.length - 1];
      const scope =
        scopeArg === "global" || scopeArg === "server" ? scopeArg : "server";
      const messageParts =
        scopeArg === "global" || scopeArg === "server"
          ? args.slice(0, -1)
          : args;
      const message = messageParts.join(" ").trim();
      if (!message) {
        console.error(
          'Usage: npm run test-api -- [--server id] alert "Your message here" [server|global]'
        );
        process.exit(1);
      }
      const data = await client.sendAlert({
        message,
        scope,
        actor: "CLI test"
      });
      console.log(JSON.stringify({ server: server.id, ...data }, null, 2));
      break;
    }
    default:
      console.log(`H1Emu Discord Bridge — API test CLI

Commands:
  servers                        List configured game servers
  health                         GET /health (no auth)
  players                        List online players
  crates                         List valid crate IDs
  alert "message" [server|global]  In-game alert
  drop-all <id> [id...]          Alias for giverewardtoall
  giverewardtoall <id> [id...]   Crate drop for everyone on selected server
  globalrewardtoall <id> [id...] Crate drop for everyone on all servers
  drop-name <name> <id> [id...]  Crate drop for one player by name
  drop-discord <id> <crate...>   Crate drop by verified Discord user ID

Use --server <id> when multiple servers are configured.
Default server: ${serverRegistry.defaultServerId}
`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("[error]", err.message);
  process.exit(1);
});
