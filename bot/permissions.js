import { PermissionFlagsBits } from "discord.js";

/**
 * @typedef {"none" | "support" | "moderator"} PermissionTier
 */

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {{
 *   moderatorRoleIds?: string[];
 *   supportRoleIds?: string[];
 *   allowedRoleIds?: string[];
 * }} config
 * @returns {PermissionTier}
 */
export function getPermissionTier(interaction, config) {
  const roles = interaction.member?.roles?.cache;
  if (!roles) return "none";

  const moderatorRoleIds = [
    ...(config.moderatorRoleIds ?? []),
    ...(config.allowedRoleIds ?? [])
  ];

  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    moderatorRoleIds.some((id) => roles.has(id))
  ) {
    return "moderator";
  }

  if ((config.supportRoleIds ?? []).some((id) => roles.has(id))) {
    return "support";
  }

  return "none";
}

/** @param {PermissionTier} tier */
export function tierLabel(tier) {
  switch (tier) {
    case "moderator":
      return "Moderator";
    case "support":
      return "Support";
    default:
      return "None";
  }
}

/**
 * Commands support staff are not allowed to run (mass drops).
 * @param {string} commandName
 * @param {{
 *   supportBlockedCommands?: string[];
 * }} config
 */
export function isCommandBlockedForSupport(commandName, config) {
  const blocked = config.supportBlockedCommands ?? [
    "giverewardtoall",
    "globalrewardtoall"
  ];
  return blocked.includes(commandName);
}
