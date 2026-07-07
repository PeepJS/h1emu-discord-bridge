import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { BridgeApiClient } from "./api-client.js";
import { createRateLimiter } from "./rate-limit.js";
import {
  getPermissionTier,
  isCommandBlockedForSupport,
  tierLabel
} from "./permissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json — copy config.example.json and edit it.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const api = new BridgeApiClient(config);
const rateLimiter = createRateLimiter(config);

function crateIdsFromOption(crateOption) {
  const id = crateOption?.value ?? config.defaultCrateId ?? 5063;
  return [id];
}

function estimateCrateCount(commandName, crateIds, recipientCount = 1) {
  const perTarget = crateIds.length;
  if (commandName === "giverewardtoall" || commandName === "globalrewardtoall") {
    return perTarget * recipientCount;
  }
  return perTarget;
}

function formatQuota(usage) {
  return `${usage.remaining}/${usage.limit} crates remaining (${usage.used} used in the last ${usage.windowHours}h)`;
}

async function enforceDropPermission(interaction, commandName, crateIds) {
  const tier = getPermissionTier(interaction, config);

  if (tier === "none") {
    return {
      ok: false,
      reply:
        "You do not have permission to use crate drop commands. Contact an admin if you need access."
    };
  }

  if (tier === "support" && isCommandBlockedForSupport(commandName, config)) {
    return {
      ok: false,
      reply:
        "Support staff cannot run mass drop commands. Use `/cratedrop` or `/cratedropdiscord` for individual players."
    };
  }

  if (tier === "moderator") {
    return { ok: true, tier };
  }

  let recipientCount = 1;
  if (commandName === "giverewardtoall") {
    const players = await api.listPlayers();
    recipientCount = Math.max(players.players?.length ?? 0, 1);
  }

  const crateCount = estimateCrateCount(commandName, crateIds, recipientCount);
  const check = rateLimiter.check(interaction.user.id, crateCount);

  if (!check.allowed) {
    return { ok: false, reply: check.message };
  }

  return { ok: true, tier, crateCount, usage: check.usage };
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Discord bridge bot logged in as ${c.user.tag}`);
  console.log(`Game API: ${config.apiBaseUrl}`);
  if (config.supportRoleIds?.length) {
    console.log(
      `Support rate limit: ${rateLimiter.crateLimit} crates / ${(rateLimiter.windowMs / 3600000).toFixed(0)}h`
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const tier = getPermissionTier(interaction, config);

  if (tier === "none") {
    await interaction.reply({
      content: "You do not have permission to use server admin commands.",
      ephemeral: true
    });
    return;
  }

  try {
    switch (interaction.commandName) {
      case "cratequota": {
        await interaction.deferReply({ ephemeral: true });
        if (tier === "moderator") {
          await interaction.editReply(
            "**Moderator** — unlimited crate drops via Discord."
          );
          break;
        }
        if (tier === "support") {
          const usage = rateLimiter.getUsage(interaction.user.id);
          await interaction.editReply(
            `**Support quota:** ${formatQuota(usage)}\nMass drops (\`/giverewardtoall\`, \`/globalrewardtoall\`) are moderator-only.`
          );
          break;
        }
        await interaction.editReply("You do not have a crate drop quota.");
        break;
      }
      case "players": {
        await interaction.deferReply({ ephemeral: true });
        const data = await api.listPlayers();
        const lines = data.players?.length
          ? data.players.map((p) => `• ${p.name}`).join("\n")
          : "_No players online._";
        await interaction.editReply(`**Online (${data.players.length})**\n${lines}`);
        break;
      }
      case "crates": {
        await interaction.deferReply({ ephemeral: true });
        const data = await api.listCrates();
        const lines = (data.crates ?? [])
          .slice(0, 25)
          .map((c) => `\`${c.id}\` — ${c.name}`)
          .join("\n");
        await interaction.editReply(
          `**Reward crates** (first 25)\n${lines}\n\nUse \`/cratedrop\` with a crate ID.`
        );
        break;
      }
      case "alert": {
        if (tier !== "moderator") {
          await interaction.reply({
            content: "Only moderators can send in-game alerts.",
            ephemeral: true
          });
          return;
        }

        await interaction.deferReply();
        const message = interaction.options.getString("message", true);
        const scope = interaction.options.getString("scope") ?? "server";
        const data = await api.sendAlert({
          message,
          scope,
          actor: `${interaction.user.username} (${tierLabel(tier)})`
        });

        const scopeLabel =
          data.scope === "global" ? "All servers" : "This server";
        await interaction.editReply(
          `**[${scopeLabel}]** Alert sent.\n_${data.message}_`
        );
        break;
      }
      case "cratedrop": {
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const gate = await enforceDropPermission(interaction, "cratedrop", crateIds);
        if (!gate.ok) {
          await interaction.reply({ content: gate.reply, ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const player = interaction.options.getString("player", true);
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "name", value: player },
          crateIds,
          actor: `${interaction.user.username} (${tierLabel(gate.tier)})`,
          announce
        });

        if (gate.tier === "support") {
          rateLimiter.record(interaction.user.id, gate.crateCount);
        }

        const quota =
          gate.tier === "support"
            ? `\n_${formatQuota(rateLimiter.getUsage(interaction.user.id))}_`
            : "";

        await interaction.editReply(
          `Dropped **${data.crateNames}** to **${data.player}**.\n_${data.message}_${quota}`
        );
        break;
      }
      case "giverewardtoall": {
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const gate = await enforceDropPermission(
          interaction,
          "giverewardtoall",
          crateIds
        );
        if (!gate.ok) {
          await interaction.reply({ content: gate.reply, ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "all" },
          crateIds,
          actor: `${interaction.user.username} (${tierLabel(gate.tier)})`,
          announce
        });

        await interaction.editReply(
          `**[This server]** Dropped **${data.crateNames}** to **${data.recipients.length}** player(s).\n_${data.message}_`
        );
        break;
      }
      case "globalrewardtoall": {
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const gate = await enforceDropPermission(
          interaction,
          "globalrewardtoall",
          crateIds
        );
        if (!gate.ok) {
          await interaction.reply({ content: gate.reply, ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "global" },
          crateIds,
          actor: `${interaction.user.username} (${tierLabel(gate.tier)})`,
          announce
        });

        await interaction.editReply(
          `**[All servers]** Global drop of **${data.crateNames}** initiated.\n_${data.message}_`
        );
        break;
      }
      case "cratedropdiscord": {
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const gate = await enforceDropPermission(
          interaction,
          "cratedropdiscord",
          crateIds
        );
        if (!gate.ok) {
          await interaction.reply({ content: gate.reply, ephemeral: true });
          return;
        }

        await interaction.deferReply();
        const user = interaction.options.getUser("user", true);
        const data = await api.dropCrates({
          target: { type: "discordId", value: user.id },
          crateIds,
          actor: `${interaction.user.username} (${tierLabel(gate.tier)})`
        });

        if (gate.tier === "support") {
          rateLimiter.record(interaction.user.id, gate.crateCount);
        }

        const quota =
          gate.tier === "support"
            ? `\n_${formatQuota(rateLimiter.getUsage(interaction.user.id))}_`
            : "";

        await interaction.editReply(
          `Dropped **${data.crateNames}** to **${data.player}** (Discord: ${user.tag}).\n_${data.message}_${quota}`
        );
        break;
      }
      default:
        await interaction.reply({ content: "Unknown command.", ephemeral: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`Failed: ${message}`);
    } else {
      await interaction.reply({ content: `Failed: ${message}`, ephemeral: true });
    }
  }
});

if (!config.discordToken || config.discordToken === "YOUR_DISCORD_BOT_TOKEN") {
  console.error(
    "discordToken is not configured. Copy config.example.json → config.json and set your bot token."
  );
  process.exit(1);
}

client.login(config.discordToken);
