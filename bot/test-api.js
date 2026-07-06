import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BridgeApiClient } from "./api-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json — copy config.example.json and edit it.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const api = new BridgeApiClient(config);

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case undefined:
    case "health": {
      const data = await api.health();
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "players": {
      const data = await api.listPlayers();
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "crates": {
      const data = await api.listCrates();
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "drop-all":
    case "giverewardtoall": {
      const crateIds = args.map(Number).filter((n) => !Number.isNaN(n));
      if (!crateIds.length) {
        console.error("Usage: npm run test-api -- giverewardtoall <crateId> [crateId...]");
        process.exit(1);
      }
      const data = await api.dropCrates({
        target: { type: "all" },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "globalrewardtoall": {
      const crateIds = args.map(Number).filter((n) => !Number.isNaN(n));
      if (!crateIds.length) {
        console.error("Usage: npm run test-api -- globalrewardtoall <crateId> [crateId...]");
        process.exit(1);
      }
      const data = await api.dropCrates({
        target: { type: "global" },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "drop-name": {
      const [name, ...crateArg] = args;
      const crateIds = crateArg.map(Number).filter((n) => !Number.isNaN(n));
      if (!name || !crateIds.length) {
        console.error(
          "Usage: npm run test-api -- drop-name <characterName> <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await api.dropCrates({
        target: { type: "name", value: name },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "drop-discord": {
      const [discordId, ...crateArg] = args;
      const crateIds = crateArg.map(Number).filter((n) => !Number.isNaN(n));
      if (!discordId || !crateIds.length) {
        console.error(
          "Usage: npm run test-api -- drop-discord <discordUserId> <crateId> [crateId...]"
        );
        process.exit(1);
      }
      const data = await api.dropCrates({
        target: { type: "discordId", value: discordId },
        crateIds,
        actor: "CLI test"
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    default:
      console.log(`H1Emu Discord Bridge — API test CLI

Commands:
  health                         GET /health (no auth)
  players                        List online players
  crates                         List valid crate IDs
  drop-all <id> [id...]          Alias for giverewardtoall
  giverewardtoall <id> [id...]   Crate drop for everyone on this server
  globalrewardtoall <id> [id...] Crate drop for everyone on all servers
  drop-name <name> <id> [id...]  Crate drop for one player by name
  drop-discord <id> <crate...>   Crate drop by verified Discord user ID
`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("[error]", err.message);
  process.exit(1);
});
