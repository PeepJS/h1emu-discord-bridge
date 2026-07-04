/**
 * Builds dist/discordbridgeplugin-VERSION.zip for GitHub Releases.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
const version = pkg.version;
const staging = path.join(root, "dist", "DiscordBridgePlugin");
const zipPath = path.join(root, "dist", `discordbridgeplugin-${version}.zip`);

const include = [
  "plugin.js",
  "out",
  "data",
  "package.json",
  "package-lock.json",
  "README.md"
];

fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

for (const entry of include) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) {
    console.error(`Missing required path: ${entry}`);
    process.exit(1);
  }
  const dest = path.join(staging, entry);
  fs.cpSync(src, dest, { recursive: true });
}

execSync("npm install --omit=dev", { cwd: staging, stdio: "inherit" });

fs.mkdirSync(path.dirname(zipPath), { recursive: true });
if (process.platform === "win32") {
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(
    `cd "${path.join(root, "dist")}" && zip -r "${zipPath}" DiscordBridgePlugin`,
    { stdio: "inherit" }
  );
}

console.log(`\nRelease package: ${zipPath}`);
