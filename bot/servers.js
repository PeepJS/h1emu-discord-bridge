import { BridgeApiClient } from "./api-client.js";

/**
 * @typedef {{ id: string; name: string; apiBaseUrl: string; apiToken: string }} ServerConfig
 */

/**
 * @param {Record<string, unknown>} config
 * @returns {ServerConfig[]}
 */
export function normalizeServers(config) {
  const fallbackToken = `${config.apiToken ?? ""}`;

  if (Array.isArray(config.servers) && config.servers.length > 0) {
    return config.servers.map((entry) => {
      const server = entry;
      if (!server.id || !server.name || !server.apiBaseUrl) {
        throw new Error(
          "Each servers[] entry requires id, name, and apiBaseUrl in config.json"
        );
      }
      return {
        id: `${server.id}`,
        name: `${server.name}`,
        apiBaseUrl: `${server.apiBaseUrl}`,
        apiToken: `${server.apiToken ?? fallbackToken}`
      };
    });
  }

  if (config.apiBaseUrl) {
    return [
      {
        id: `${config.defaultServerId ?? "default"}`,
        name: `${config.defaultServerName ?? "Default Server"}`,
        apiBaseUrl: `${config.apiBaseUrl}`,
        apiToken: fallbackToken
      }
    ];
  }

  throw new Error(
    "No servers configured. Add servers[] or apiBaseUrl to config.json"
  );
}

/**
 * @param {Record<string, unknown>} config
 */
export function createServerRegistry(config) {
  const servers = normalizeServers(config);
  const defaultServerId = `${config.defaultServerId ?? servers[0].id}`;
  const byId = new Map(
    servers.map((server) => [server.id, new BridgeApiClient(server)])
  );

  return {
    servers,
    defaultServerId,
    hasMultiple: servers.length > 1,

    /** @param {string} serverId */
    getClient(serverId) {
      const client = byId.get(serverId);
      if (!client) {
        throw new Error(
          `Unknown server "${serverId}". Valid: ${servers.map((s) => s.id).join(", ")}`
        );
      }
      return client;
    },

    /** @param {import("discord.js").ChatInputCommandInteraction} interaction */
    resolveFromInteraction(interaction) {
      const selected = interaction.options.getString("server");
      const serverId = selected ?? defaultServerId;
      const server = servers.find((entry) => entry.id === serverId);
      if (!server) {
        throw new Error(`Unknown server "${serverId}"`);
      }
      return {
        server,
        client: this.getClient(server.id)
      };
    },

    /** @param {string | undefined} serverId */
    resolveFromId(serverId) {
      const id = serverId ?? defaultServerId;
      const server = servers.find((entry) => entry.id === id);
      if (!server) {
        throw new Error(
          `Unknown server "${id}". Valid: ${servers.map((s) => s.id).join(", ")}`
        );
      }
      return {
        server,
        client: this.getClient(server.id)
      };
    }
  };
}

/**
 * @param {import("discord.js").SlashCommandBuilder} builder
 * @param {ServerConfig[]} servers
 * @param {boolean} required
 */
export function addServerOption(builder, servers, required) {
  if (servers.length <= 1) {
    return builder;
  }

  const option = builder.addStringOption((opt) => {
    let configured = opt
      .setName("server")
      .setDescription("Which game server to run this command on")
      .setRequired(required);

    for (const server of servers.slice(0, 25)) {
      configured = configured.addChoices({
        name: server.name,
        value: server.id
      });
    }

    return configured;
  });

  return option;
}
