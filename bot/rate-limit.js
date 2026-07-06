import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {{ at: number; crates: number }} RateLimitEntry
 * @typedef {Record<string, RateLimitEntry[]>} RateLimitState
 */

/**
 * @param {{
 *   rateLimitStateFile?: string;
 *   supportCrateLimit?: number;
 *   supportCrateWindowHours?: number;
 * }} config
 */
export function createRateLimiter(config) {
  const stateFile =
    config.rateLimitStateFile ??
    path.join(__dirname, "data", "rate-limits.json");
  const crateLimit = config.supportCrateLimit ?? 5;
  const windowMs = (config.supportCrateWindowHours ?? 24) * 60 * 60 * 1000;

  function ensureDir() {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  }

  /** @returns {RateLimitState} */
  function loadState() {
    try {
      if (!fs.existsSync(stateFile)) return {};
      return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
      return {};
    }
  }

  /** @param {RateLimitState} state */
  function saveState(state) {
    ensureDir();
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * @param {string} userId
   * @param {RateLimitState} state
   */
  function pruneUserEntries(userId, state) {
    const cutoff = Date.now() - windowMs;
    const entries = (state[userId] ?? []).filter((e) => e.at >= cutoff);
    if (entries.length) {
      state[userId] = entries;
    } else {
      delete state[userId];
    }
    return entries;
  }

  /**
   * @param {string} userId
   */
  function getUsage(userId) {
    const state = loadState();
    const entries = pruneUserEntries(userId, state);
    saveState(state);
    const used = entries.reduce((sum, e) => sum + e.crates, 0);
    return {
      used,
      limit: crateLimit,
      remaining: Math.max(0, crateLimit - used),
      resetsAt: entries.length
        ? entries[0].at + windowMs
        : Date.now() + windowMs,
      windowHours: config.supportCrateWindowHours ?? 24
    };
  }

  /**
   * @param {string} userId
   * @param {number} crateCount
   */
  function check(userId, crateCount) {
    const usage = getUsage(userId);
    if (usage.used + crateCount > usage.limit) {
      const resetInMs = Math.max(0, usage.resetsAt - Date.now());
      const resetHours = (resetInMs / (60 * 60 * 1000)).toFixed(1);
      return {
        allowed: false,
        usage,
        message: `Support crate limit reached (${usage.used}/${usage.limit} in the last ${usage.windowHours}h). You need ${crateCount} but have ${usage.remaining} remaining. Oldest drops roll off in ~${resetHours}h.`
      };
    }
    return { allowed: true, usage };
  }

  /**
   * @param {string} userId
   * @param {number} crateCount
   */
  function record(userId, crateCount) {
    const state = loadState();
    pruneUserEntries(userId, state);
    if (!state[userId]) state[userId] = [];
    state[userId].push({ at: Date.now(), crates: crateCount });
    saveState(state);
  }

  return { check, record, getUsage, crateLimit, windowMs };
}
