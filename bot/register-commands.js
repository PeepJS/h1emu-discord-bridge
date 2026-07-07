import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { addServerOption, normalizeServers } from "./servers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

if (!fs.existsSync(configPath)) {
  console.error("Missing config.json — copy config.example.json and edit it.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const servers = normalizeServers(config);
const requireServer = servers.length > 1;

/** @param {import("discord.js").SlashCommandBuilder} builder */
function withServer(builder) {
  return addServerOption(builder, servers, requireServer);
}

const commands = [
  new SlashCommandBuilder()
    .setName("cratequota")
    .setDescription("Check your remaining support crate drop quota"),
  withServer(
    new SlashCommandBuilder()
      .setName("alert")
      .setDescription("Send an in-game alert (this server or all servers)")
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Alert text shown to players")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("scope")
          .setDescription("Who receives the alert (default: this server)")
          .setRequired(false)
          .addChoices(
            { name: "This server", value: "server" },
            { name: "All servers", value: "global" }
          )
      )
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("players")
      .setDescription("List players currently online on the selected server")
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("crates")
      .setDescription("List reward crate IDs available for drops")
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("cratedrop")
      .setDescription("Give reward crate(s) to a player")
      .addStringOption((opt) =>
        opt
          .setName("player")
          .setDescription("In-game character name")
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("crate")
          .setDescription("Crate ID (default from config)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Optional in-game announcement override")
          .setRequired(false)
      )
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("giverewardtoall")
      .setDescription("Give reward crate(s) to everyone on the selected server")
      .addIntegerOption((opt) =>
        opt
          .setName("crate")
          .setDescription("Crate ID (default from config)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Optional in-game announcement override")
          .setRequired(false)
      )
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("globalrewardtoall")
      .setDescription("Give reward crate(s) to everyone on all servers")
      .addIntegerOption((opt) =>
        opt
          .setName("crate")
          .setDescription("Crate ID (default from config)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("message")
          .setDescription("Optional in-game announcement override")
          .setRequired(false)
      )
  ),
  withServer(
    new SlashCommandBuilder()
      .setName("cratedropdiscord")
      .setDescription("Give crate(s) to a verified player by Discord user ID")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Discord user (must be verified and in-game)")
          .setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("crate")
          .setDescription("Crate ID (default from config)")
          .setRequired(false)
      )
  )
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(config.discordToken);

try {
  console.log(`Registering ${commands.length} slash command(s)...`);
  if (requireServer) {
    console.log(
      `Server choices: ${servers.map((s) => `${s.name} (${s.id})`).join(", ")}`
    );
  }
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  console.log("Done. Slash commands should appear in your guild shortly.");
} catch (err) {
  console.error(err);
  process.exit(1);
}
