// Single source of truth for content ids shared by the relay server (CJS require)
// and the TypeScript client/sim (ESM import via bundler interop). If you add a
// mode or map, add it HERE — game/__tests__/sim.test.ts cross-checks this list
// against the engine and map registry so client/server can't drift apart again.

const MODE_IDS = ["slayer", "team", "koth", "oddball", "infection", "ctf", "gungame"];

// Modes whose lobby pool is a single FFA group (no red/blue columns).
const FFA_MODES = ["slayer", "infection", "gungame"];

const MAP_IDS = ["gulch", "warehouse", "lattice", "aisle", "dock"];

const SKULL_IDS = ["thrifty", "boom", "birthday", "famine", "sugar"];

const MAX_PLAYERS = 16;
const MAX_BOTS = 15;

module.exports = { MODE_IDS, FFA_MODES, MAP_IDS, SKULL_IDS, MAX_PLAYERS, MAX_BOTS };
