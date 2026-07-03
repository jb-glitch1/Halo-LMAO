import type { Vec3 } from "./vec";

export type Team = "red" | "blue" | "ffa";
export type GameModeId = "slayer" | "team" | "koth" | "oddball" | "infection" | "ctf" | "gungame" | "juggernaut";
export type SkullId = "thrifty" | "boom" | "birthday" | "famine" | "sugar";

export interface Box {
  // Axis-aligned box collider, world space.
  min: Vec3;
  max: Vec3;
  // visual hint for the renderer
  kind?: "wall" | "crate" | "platform" | "ramp" | "base" | "rock" | "glass";
  color?: number;
  team?: Team; // tints base structures
}

export interface Ramp {
  // Sloped, walkable floor. Rectangular footprint on XZ; surface height rises
  // linearly along `axis` from baseY (low end) to topY (high end).
  min: Vec3; // footprint min (y unused for surface, used as underside)
  max: Vec3; // footprint max
  axis: "x" | "z";
  dir: 1 | -1; // +1: surface rises toward max along axis; -1: rises toward min
  baseY: number;
  topY: number;
  kind?: "ramp";
  color?: number;
  team?: Team;
}

export interface JumpPad {
  pos: Vec3; // center on the ground
  radius: number;
  power: number; // upward launch velocity
  dir?: Vec3; // optional horizontal launch direction
}

export interface SpawnPoint {
  pos: Vec3;
  yaw: number;
  team: Team;
}

export interface PickupSpawn {
  id: string;
  kind: "weapon" | "powerup";
  what: string; // weapon id or powerup id
  pos: Vec3;
  respawnMs: number;
}

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  size: number; // half-extent of the playfield (square), for skybox/camera/minimap
  ambient: number; // hex
  fog: number; // hex
  floorColor: number;
  boxes: Box[];
  ramps: Ramp[];
  jumpPads: JumpPad[];
  spawns: SpawnPoint[];
  pickups: PickupSpawn[];
  hill?: { pos: Vec3; radius: number; moves?: Vec3[] }; // KotH zone(s)
  oddballSpawn?: Vec3;
  vehicleSpawns?: { pos: Vec3; yaw: number }[]; // Wartrolley spawns
  skullSpawn?: Vec3; // hidden chaos-skull easter egg
}

export interface FlagInfo {
  pos: Vec3;
  carrier: string | null;
  home: boolean;
}

export interface VehicleState {
  id: string;
  kind: "wartrolley";
  pos: Vec3;
  vel: Vec3;
  yaw: number; // heading (separate from occupants' look)
  wheelSpin: number; // accumulator for wheel rotation (render)
  driver: string | null;
  gunner: string | null;
  health: number;
  fireReadyAt: number;
  // most recent driver (kept briefly after bailing so coasting-cart splatters
  // are attributed to them instead of being booked as victim suicides)
  lastDriver?: string | null;
  lastDriverAt?: number;
}

export type WeaponType = "hitscan" | "projectile" | "melee";

export interface WeaponDef {
  id: string;
  name: string;
  flavor: string;
  type: WeaponType;
  slot: "primary" | "power" | "sidearm";
  damage: number;
  headshotMult: number;
  rpm: number; // rounds per minute (cadence)
  burst?: number; // shots per trigger pull (BR)
  burstDelayMs?: number;
  magSize: number;
  reserveMax: number;
  reloadMs: number;
  spreadDeg: number; // base cone half-angle in degrees
  movingSpreadDeg?: number; // extra spread while moving
  pellets?: number; // shotgun
  range: number;
  zoom?: number; // scope FOV multiplier (smaller = more zoom)
  // projectile
  projectileSpeed?: number;
  projectileGravity?: number;
  splashRadius?: number;
  splashDamage?: number;
  homing?: number; // needler turn rate
  stickCombine?: number; // needler supercombine count
  // melee
  meleeRange?: number;
  // shields vs health balance ("plasma" drains shields harder)
  shieldMult?: number;
  healthMult?: number;
  color: number; // tracer / model accent
  isPower?: boolean;
  vehicleOnly?: boolean; // mounted weapons — hidden from the arsenal/loadouts
}

export type PowerupId = "overshield" | "speed" | "damage" | "camo";

export interface ProjectileState {
  id: number;
  owner: string;
  team: Team;
  weapon: string;
  pos: Vec3;
  vel: Vec3;
  bornAt: number;
  life: number; // ms
  homing?: number;
  target?: string;
}

export interface PlayerInput {
  // per-frame intent from a client
  moveX: number; // strafe -1..1
  moveZ: number; // fwd -1..1 (1 = forward)
  yaw: number;
  pitch: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  fire: boolean;
  altFire: boolean; // melee / zoom toggle depending on context
  reload: boolean;
  throwGrenade: boolean;
  grenadeType: "frag" | "plasma" | "mine";
  switchWeapon: number; // -1 none, 0/1 slot, 2 = swap
  zoom: boolean;
  pickup: boolean;
  seq: number;
}

export interface PlayerState {
  id: string;
  name: string;
  team: Team;
  isBot: boolean;
  botSkill?: number; // 0..1
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  shield: number;
  maxShield: number;
  alive: boolean;
  spawnProtectUntil: number;
  respawnAt: number;
  weaponId: string;
  weapons: string[]; // up to 2
  ammo: Record<string, { mag: number; reserve: number }>;
  grenades: { frag: number; plasma: number; mine: number };
  reloadUntil: number;
  fireReadyAt: number;
  burstLeft: number;
  burstNextAt: number;
  lastDamageAt: number;
  lastFireAt: number;
  zoomed: boolean;
  // powerups
  powerups: Partial<Record<PowerupId, number>>; // id -> expiry ms
  // scoring
  kills: number;
  deaths: number;
  assists: number;
  score: number; // mode score (kills, hill time, etc.)
  streak: number;
  longestStreak: number;
  shotsFired: number;
  shotsHit: number;
  // bookkeeping
  lastAttacker?: string;
  recentDamagers: Record<string, number>; // id -> last time, for assists
  carryingOddball: boolean;
  // fx hints for renderer
  firing: boolean;
  meleeAnim: number; // timestamp of melee swing
  hitFlash: number;
  grounded: boolean;
  moving: boolean;
  // infection (Black Friday): role flag, true once "value-acquired"
  infected?: boolean;
  // CTF: which team's banner this player is carrying (null = none)
  carryingFlag?: Team | null;
  // Gun Game: current rung on the weapon ladder
  gunLevel?: number;
  // Juggernaut: wearer of the crown (buffed, everyone hunts them)
  isJuggernaut?: boolean;
  // vehicle occupancy
  vehicleId?: string | null;
  vehicleSeat?: "driver" | "gunner";
}

export interface KillEvent {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  medal?: string;
  ts: number;
}

export interface HitEvent {
  id: number;
  attacker: string;
  victim: string;
  amount: number;
  headshot: boolean;
  killed: boolean;
  shieldBreak: boolean;
  ts: number;
}

export interface FxEvent {
  id: number;
  kind:
    | "tracer"
    | "impact"
    | "explosion"
    | "muzzle"
    | "melee"
    | "spawn"
    | "death"
    | "shieldpop"
    | "stick"
    | "pickup"
    | "lift"
    | "splatter"
    | "confetti";
  pos: Vec3;
  pos2?: Vec3; // for tracers (end)
  team?: Team;
  weapon?: string;
  scale?: number;
  ts: number;
}

export interface PickupRuntime {
  id: string;
  kind: "weapon" | "powerup";
  what: string;
  pos: Vec3;
  available: boolean;
  readyAt: number;
}

export interface Announce {
  id: number;
  text: string;
  sub?: string;
  big?: boolean;
  ts: number;
  forId?: string; // if set, only that player should hear/see it
}

export interface MatchConfig {
  mode: GameModeId;
  mapId: string;
  scoreLimit: number; // kills or points
  timeLimitSec: number;
  botCount: number;
  botSkill: number; // 0..1
  friendlyFire: boolean;
  startingLoadout: string; // loadout id
  skulls?: SkullId[]; // active chaos modifiers
}

export interface Snapshot {
  t: number; // server time ms
  tick: number;
  phase: "warmup" | "live" | "over";
  mode: GameModeId;
  mapId: string;
  timeLeftMs: number;
  scoreLimit: number;
  teamScore: { red: number; blue: number };
  hill?: { pos: Vec3; radius: number; controller: Team | null; progress: number };
  oddball?: { pos: Vec3; carrier: string | null };
  flags?: { red: FlagInfo; blue: FlagInfo };
  players: PlayerState[];
  projectiles: ProjectileState[];
  vehicles?: VehicleState[];
  pickups: PickupRuntime[];
  kills: KillEvent[]; // recent
  hits: HitEvent[]; // recent damage events (for hitmarkers)
  fx: FxEvent[]; // recent fx since last snapshot
  announces: Announce[];
  winner?: Team | string | null;
}

// Lobby / room types (shared with server)
export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team;
  ready: boolean;
  isHost: boolean;
  loadout: string;
  spartanColor: number;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  config: MatchConfig;
  players: LobbyPlayer[];
  state: "lobby" | "in-game";
}
