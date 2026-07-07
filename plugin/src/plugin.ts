import http from "node:http";
import { BasePlugin } from "h1z1-server/out/servers/ZoneServer2016/managers/pluginmanager.js";
import { ZoneServer2016 } from "h1z1-server/out/servers/ZoneServer2016/zoneserver.js";
import { ZoneClient2016 as Client } from "h1z1-server/out/servers/ZoneServer2016/classes/zoneclient.js";
import { Items } from "h1z1-server/out/servers/ZoneServer2016/models/enums.js";

interface PluginConfig {
  enabled: boolean;
  httpPort: number;
  bindAddress: string;
  apiToken: string;
  defaultActorName: string;
  userSessionsCollection: string;
  authKeysCollection: string;
  discordIdFields: string[];
  authKeyFields: string[];
}

const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  httpPort: 9877,
  bindAddress: "127.0.0.1",
  apiToken: "",
  defaultActorName: "Discord",
  userSessionsCollection: "user-sessions",
  authKeysCollection: "verified-authkeys",
  discordIdFields: ["discordId", "discordUserId", "userId", "id"],
  authKeyFields: ["authKey", "key"]
};

interface DropTarget {
  type: "all" | "global" | "name" | "discordId";
  value?: string;
}

interface DropRequestBody {
  target?: DropTarget;
  crateIds?: number[];
  announce?: string;
  actor?: string;
}

interface AlertRequestBody {
  message?: string;
  scope?: "server" | "global";
  actor?: string;
}

function firstDefinedField(
  document: Record<string, unknown> | null | undefined,
  fields: string[]
): string | undefined {
  if (!document) return undefined;
  for (const field of fields) {
    const value = document[field];
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      return `${value}`;
    }
  }
  return undefined;
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

export default class DiscordBridgePlugin extends BasePlugin {
  public name = "DiscordBridgePlugin";
  public description =
    "HTTP bridge for Discord bots to trigger crate drops and list players";
  public author = "H1emu";
  public version = "1.0.0";

  private config: PluginConfig = DEFAULT_CONFIG;
  private server?: ZoneServer2016;
  private httpServer?: http.Server;

  public commands = [
    {
      name: "discordbridge",
      description: "Test the Discord bridge API (subcommand: status)",
      permissionLevel: 1,
      execute: async (
        server: ZoneServer2016,
        client: Client,
        args: string[]
      ) => {
        if (args[0]?.toLowerCase() === "status") {
          const online = Object.keys(server._clients).length;
          server.sendChatText(
            client,
            `[DiscordBridge] API http://${this.config.bindAddress}:${this.config.httpPort} — ${online} player(s) online`
          );
          return;
        }
        server.sendChatText(
          client,
          "Usage: /discordbridge status — shows bridge API status"
        );
      }
    }
  ];

  public loadConfig(config: Partial<PluginConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public async init(server: ZoneServer2016): Promise<void> {
    if (!("worldObjectManager" in server) || !server.worldObjectManager) {
      return;
    }

    this.server = server;

    if (!this.config.enabled) {
      console.log("[DiscordBridgePlugin] Disabled via config.");
      return;
    }

    if (!this.config.apiToken || this.config.apiToken === "CHANGE_ME_TO_A_LONG_RANDOM_SECRET") {
      console.warn(
        "[DiscordBridgePlugin] apiToken is not set — HTTP API will reject all requests. Edit plugins/discordbridgeplugin-config.yaml"
      );
    }

    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(
        this.config.httpPort,
        this.config.bindAddress,
        () => resolve()
      );
      this.httpServer!.on("error", reject);
    });

    console.log(
      `[DiscordBridgePlugin] HTTP API listening on http://${this.config.bindAddress}:${this.config.httpPort}`
    );
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.config.apiToken) return false;
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return token.length > 0 && token === this.config.apiToken;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";

      if (url.pathname === "/health" && method === "GET") {
        sendJson(res, 200, {
          ok: true,
          plugin: this.name,
          version: this.version,
          playersOnline: Object.keys(this.server?._clients ?? {}).length
        });
        return;
      }

      if (!this.isAuthorized(req)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }

      if (url.pathname === "/api/players" && method === "GET") {
        sendJson(res, 200, {
          ok: true,
          players: this.listOnlinePlayers()
        });
        return;
      }

      if (url.pathname === "/api/crates" && method === "GET") {
        sendJson(res, 200, {
          ok: true,
          crates: this.listCrates()
        });
        return;
      }

      if (url.pathname === "/api/crate/drop" && method === "POST") {
        const body = (await readJsonBody(req)) as DropRequestBody;
        const result = await this.handleCrateDrop(body);
        sendJson(res, result.status, result.body);
        return;
      }

      if (url.pathname === "/api/alert" && method === "POST") {
        const body = (await readJsonBody(req)) as AlertRequestBody;
        const result = this.handleAlert(body);
        sendJson(res, result.status, result.body);
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      console.error("[DiscordBridgePlugin]", error);
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error"
      });
    }
  }

  private listOnlinePlayers(): Array<{
    name: string;
    loginSessionId: string;
  }> {
    const server = this.server;
    if (!server) return [];

    return Object.values(server._clients).map((client) => ({
      name: client.character.name,
      loginSessionId: client.loginSessionId
    }));
  }

  private listCrates(): Array<{ id: number; name: string; droppable: boolean }> {
    const server = this.server;
    if (!server) return [];

    return server.rewardManager.rewards.map((reward) => ({
      id: reward.itemId,
      name: Items[reward.itemId] ?? `CRATE_${reward.itemId}`,
      droppable: reward.dropChances > 0
    }));
  }

  private validateCrateIds(crateIds: number[]): {
    valid: number[];
    invalid: number[];
  } {
    const server = this.server;
    if (!server) return { valid: [], invalid: [] };

    const valid: number[] = [];
    const invalid: number[] = [];

    for (const raw of crateIds) {
      const id = Number(raw);
      const exists = server.rewardManager.rewards.some((r) => r.itemId === id);
      if (exists) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    }

    return { valid, invalid };
  }

  private async resolveClientByDiscordId(
    discordId: string
  ): Promise<Client | undefined> {
    const server = this.server;
    if (!server || server._soloMode) return undefined;

    const verified = await server._db
      .collection(this.config.authKeysCollection)
      .findOne({
        $or: this.config.discordIdFields.map((field) => ({
          [field]: discordId
        }))
      });

    const authKey = firstDefinedField(
      verified as Record<string, unknown> | undefined,
      this.config.authKeyFields
    );
    if (!authKey) return undefined;

    const session = await server._db
      .collection(this.config.userSessionsCollection)
      .findOne({
        $or: this.config.authKeyFields.map((field) => ({
          [field]: authKey
        }))
      });

    const guid = session?.guid as string | undefined;
    if (!guid) return undefined;

    return Object.values(server._clients).find(
      (c) => c.loginSessionId === guid
    );
  }

  private resolveClientByName(name: string): Client | string | undefined {
    const server = this.server;
    if (!server) return undefined;
    return server.getClientByNameOrLoginSession(name);
  }

  private giveCratesToClient(client: Client, crateIds: number[]): void {
    const server = this.server;
    if (!server) return;

    for (const crateId of crateIds) {
      server.rewardManager.addRewardToPlayer(client, crateId);
    }
  }

  private handleAlert(body: AlertRequestBody): {
    status: number;
    body: Record<string, unknown>;
  } {
    const server = this.server;
    if (!server) {
      return { status: 503, body: { ok: false, error: "Server not ready" } };
    }

    const message = body.message?.trim();
    if (!message) {
      return {
        status: 400,
        body: { ok: false, error: "message is required" }
      };
    }

    const scope = body.scope === "global" ? "global" : "server";
    const actor = body.actor?.trim() || this.config.defaultActorName;

    if (scope === "global") {
      server.sendGlobalBroadcastRequest(0, actor, message);
      return {
        status: 200,
        body: {
          ok: true,
          action: "globalalert",
          scope: "global",
          message,
          actor
        }
      };
    }

    server.sendAlertToAll(message, actor);
    return {
      status: 200,
      body: {
        ok: true,
        action: "alert",
        scope: "server",
        message,
        actor
      }
    };
  }

  private async handleCrateDrop(body: DropRequestBody): Promise<{
    status: number;
    body: Record<string, unknown>;
  }> {
    const server = this.server;
    if (!server) {
      return { status: 503, body: { ok: false, error: "Server not ready" } };
    }

    if (server.isBattleRoyale()) {
      return {
        status: 400,
        body: { ok: false, error: "Crate drops are not available in battle royale" }
      };
    }

    const target = body.target ?? { type: "all" };
    const crateIds = body.crateIds ?? [];

    if (!Array.isArray(crateIds) || crateIds.length === 0) {
      return {
        status: 400,
        body: { ok: false, error: "crateIds must be a non-empty array of numbers" }
      };
    }

    const numericCrateIds = crateIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id));
    if (numericCrateIds.length !== crateIds.length) {
      return {
        status: 400,
        body: { ok: false, error: "crateIds must contain only numbers" }
      };
    }

    const { valid, invalid } = this.validateCrateIds(numericCrateIds);
    if (!valid.length) {
      return {
        status: 400,
        body: {
          ok: false,
          error: "No valid crate IDs",
          invalid
        }
      };
    }

    const actor = body.actor?.trim() || this.config.defaultActorName;
    const crateNames = valid.map((id) => Items[id] ?? `${id}`).join(", ");

    if (target.type === "all") {
      const recipients = Object.values(server._clients);
      const message =
        body.announce?.trim() ||
        `${actor} has just initiated a crate drop`;

      server.sendAlertToAll(message);

      for (const client of recipients) {
        this.giveCratesToClient(client, valid);
      }

      return {
        status: 200,
        body: {
          ok: true,
          action: "giverewardtoall",
          scope: "server",
          recipients: recipients.map((c) => c.character.name),
          crateIds: valid,
          crateNames,
          invalid: invalid.length ? invalid : undefined,
          message
        }
      };
    }

    if (target.type === "global") {
      const message =
        body.announce?.trim() ||
        `${actor} has just initiated a global crate drop`;

      server.sendGlobalBroadcastRequest(1, "", message, valid);

      return {
        status: 200,
        body: {
          ok: true,
          action: "globalrewardtoall",
          scope: "global",
          crateIds: valid,
          crateNames,
          invalid: invalid.length ? invalid : undefined,
          message
        }
      };
    }

    if (!target.value?.trim()) {
      return {
        status: 400,
        body: { ok: false, error: "target.value is required for name/discordId drops" }
      };
    }

    let targetClient: Client | undefined;

    if (target.type === "name") {
      const resolved = this.resolveClientByName(target.value.trim());
      if (typeof resolved === "string") {
        return {
          status: 404,
          body: {
            ok: false,
            error: `Player not found. Did you mean ${resolved}?`
          }
        };
      }
      targetClient = resolved;
    } else if (target.type === "discordId") {
      targetClient = await this.resolveClientByDiscordId(target.value.trim());
    } else {
      return {
        status: 400,
        body: { ok: false, error: `Unknown target type: ${target.type}` }
      };
    }

    if (!targetClient) {
      return {
        status: 404,
        body: {
          ok: false,
          error:
            target.type === "discordId"
              ? "No online player found for that Discord ID (must be verified and in-game)"
              : "Player not found or not online"
        }
      };
    }

    const message =
      body.announce?.trim() ||
      `${actor} rewarded ${targetClient.character.name} with ${crateNames}`;

    server.sendAlertToAll(message);
    this.giveCratesToClient(targetClient, valid);

    return {
      status: 200,
      body: {
        ok: true,
        action: "drop_player",
        player: targetClient.character.name,
        crateIds: valid,
        crateNames,
        invalid: invalid.length ? invalid : undefined,
        message
      }
    };
  }
}
