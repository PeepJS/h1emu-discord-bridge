import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits
} from "discord.js";
import { BridgeApiClient } from "./api-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json — copy config.example.json and edit it.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const api = new BridgeApiClient(config);

function isAllowed(interaction) {
  if (!config.allowedRoleIds?.length) {
    return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  }
  return config.allowedRoleIds.some((roleId) =>
    interaction.member?.roles?.cache?.has(roleId)
  );
}

function crateIdsFromOption(crateOption) {
  const id = crateOption?.value ?? config.defaultCrateId ?? 5063;
  return [id];
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Discord bridge bot logged in as ${c.user.tag}`);
  console.log(`Game API: ${config.apiBaseUrl}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!isAllowed(interaction)) {
    await interaction.reply({
      content: "You do not have permission to use server admin commands.",
      ephemeral: true
    });
    return;
  }

  try {
    switch (interaction.commandName) {
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
      case "cratedrop": {
        await interaction.deferReply();
        const player = interaction.options.getString("player", true);
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "name", value: player },
          crateIds,
          actor: interaction.user.username,
          announce
        });
        await interaction.editReply(
          `Dropped **${data.crateNames}** to **${data.player}**.\n_${data.message}_`
        );
        break;
      }
      case "giverewardtoall": {
        await interaction.deferReply();
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "all" },
          crateIds,
          actor: interaction.user.username,
          announce
        });
        await interaction.editReply(
          `**[This server]** Dropped **${data.crateNames}** to **${data.recipients.length}** player(s).\n_${data.message}_`
        );
        break;
      }
      case "globalrewardtoall": {
        await interaction.deferReply();
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const announce = interaction.options.getString("message") ?? undefined;
        const data = await api.dropCrates({
          target: { type: "global" },
          crateIds,
          actor: interaction.user.username,
          announce
        });
        await interaction.editReply(
          `**[All servers]** Global drop of **${data.crateNames}** initiated.\n_${data.message}_`
        );
        break;
      }
      case "cratedropdiscord": {
        await interaction.deferReply();
        const user = interaction.options.getUser("user", true);
        const crateIds = crateIdsFromOption(interaction.options.getInteger("crate"));
        const data = await api.dropCrates({
          target: { type: "discordId", value: user.id },
          crateIds,
          actor: interaction.user.username
        });
        await interaction.editReply(
          `Dropped **${data.crateNames}** to **${data.player}** (Discord: ${user.tag}).\n_${data.message}_`
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
