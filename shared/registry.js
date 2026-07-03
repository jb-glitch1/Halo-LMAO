// Single source of truth for content ids + config validation, shared by the
// relay server (CJS require) and the TypeScript client/sim (ESM import via
// bundler interop). If you add a mode or map, add it HERE —
// game/__tests__/sim.test.ts cross-checks these lists against the engine and
// map registry so client/server can't drift apart again.

const MODE_IDS = ["slayer", "team", "koth", "oddball", "infection", "ctf", "gungame"];

// Modes whose lobby pool is a single FFA group (no red/blue columns).
const FFA_MODES = ["slayer", "infection", "gungame"];

const MAP_IDS = ["gulch", "warehouse", "lattice", "aisle", "dock"];

const SKULL_IDS = ["thrifty", "boom", "birthday", "famine", "sugar"];

const MAX_PLAYERS = 16;
const MAX_BOTS = 15;

function sanitizeName(n) {
  return String(n || "Spartan").slice(0, 16).replace(/[^\w \-]/g, "") || "Spartan";
}

// Clamp/whitelist an untrusted match config into a safe, complete one.
function defaultConfig(c = {}) {
  return {
    mode: MODE_IDS.includes(c.mode) ? c.mode : "team",
    mapId: MAP_IDS.includes(c.mapId) ? c.mapId : "gulch",
    scoreLimit: Math.max(3, Math.min(500, parseInt(c.scoreLimit) || 25)),
    timeLimitSec: Math.max(60, Math.min(1800, parseInt(c.timeLimitSec) || 420)),
    botCount: Math.max(0, Math.min(MAX_BOTS, parseInt(c.botCount ?? 6))),
    botSkill: Math.max(0, Math.min(1, typeof c.botSkill === "number" ? c.botSkill : 0.6)),
    friendlyFire: !!c.friendlyFire,
    startingLoadout: typeof c.startingLoadout === "string" ? c.startingLoadout : "recruit",
    skulls: Array.isArray(c.skulls) ? c.skulls.filter((s) => SKULL_IDS.includes(s)).slice(0, SKULL_IDS.length) : undefined,
  };
}

module.exports = { MODE_IDS, FFA_MODES, MAP_IDS, SKULL_IDS, MAX_PLAYERS, MAX_BOTS, sanitizeName, defaultConfig };
