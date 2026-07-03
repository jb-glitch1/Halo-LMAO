// Global simulation tuning. One place to balance the whole game.

export const TICK_HZ = 60; // host simulation rate
export const SNAPSHOT_HZ = 20; // network broadcast rate
export const DT = 1 / TICK_HZ;

// Player physical
export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_EYE = 1.55;
export const CROUCH_HEIGHT = 1.1;
export const CROUCH_EYE = 0.95;
export const STEP_HEIGHT = 0.45; // auto-climb stairs/cover this tall

// Movement (Halo-ish: weighty but mobile)
export const MOVE_SPEED = 7.2; // m/s base
export const SPRINT_MULT = 1.5;
export const CROUCH_MULT = 0.5;
export const AIR_CONTROL = 0.35;
export const ACCEL_GROUND = 70;
export const ACCEL_AIR = 18;
export const FRICTION = 9;
export const GRAVITY = 22;
export const JUMP_VELOCITY = 8.4;
export const ZOOM_MOVE_MULT = 0.55;

// Health & shields (classic Halo: shield + health, shield regens)
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const SHIELD_REGEN_DELAY_MS = 3500; // after taking damage
export const SHIELD_REGEN_PER_SEC = 70;
export const HEALTH_REGEN_DELAY_MS = 7000;
export const HEALTH_REGEN_PER_SEC = 12;
export const SPAWN_PROTECT_MS = 1800;

// Respawn
export const RESPAWN_MS = 4000;

// Grenades
export const GRENADE_FUSE_MS = 1400;
export const FRAG_DAMAGE = 130;
export const FRAG_RADIUS = 5.2;
export const PLASMA_DAMAGE = 120;
export const PLASMA_RADIUS = 4.6;
export const GRENADE_THROW_SPEED = 18;
export const GRENADE_GRAVITY = 20;
export const MAX_GRENADES = 4;

// Melee
export const MELEE_DAMAGE = 80;
export const MELEE_RANGE = 2.2;
export const MELEE_BACK_INSTAKILL = true; // assassination from behind
export const MELEE_COOLDOWN_MS = 650;

// Combat feel
export const HEADSHOT_ZONE_Y = PLAYER_HEIGHT - 0.32; // height above feet that counts as the head
export const ASSIST_WINDOW_MS = 4000;

// Multikill / spree timing
export const MULTIKILL_WINDOW_MS = 4500;
export const SPREE_THRESHOLDS = [5, 10, 15, 20, 25, 30];

// Powerups
export const OVERSHIELD_AMOUNT = 100; // extra shield (stacks to 2x)
export const POWERUP_DURATION_MS = 30000;
export const SPEED_MULT = 1.35;
export const DAMAGE_MULT = 2.0;

// Bots
export const BOT_VIEW_RANGE = 60;
export const BOT_FOV = Math.PI * 0.9; // ~160 deg awareness cone (wide, they "feel" you)
export const BOT_REACTION_MIN_MS = 120;
export const BOT_REACTION_MAX_MS = 520;

// Wartrolley (vehicle) — arcade shopping-cart 'hog
export const VEHICLE_HEALTH = 800;
export const VEHICLE_RADIUS = 1.25;
export const VEHICLE_HEIGHT = 1.5;
export const VEHICLE_ACCEL = 26; // m/s^2 throttle
export const VEHICLE_MAX_SPEED = 18;
export const VEHICLE_REVERSE_SPEED = 7;
export const VEHICLE_TURN_RATE = 2.3; // rad/s (scaled by speed)
export const VEHICLE_FRICTION = 2.4; // coasting decel
export const VEHICLE_SPLATTER_SPEED = 7; // min speed to flatten a Spartan
export const VEHICLE_SEAT_EYE = 1.55; // camera height while riding
export const VEHICLE_CANNON_RPM = 480;

// Misc
export const KILLFEED_KEEP = 6;
export const FX_KEEP = 80;
export const WORLD_FLOOR_Y = 0;
export const FALL_KILL_Y = -25; // pits

// Spartan / player colors (budget palette)
export const SPARTAN_COLORS = [
  0x3aa0ff, 0xff4d5e, 0x5dff9b, 0xffcf4d, 0xb06bff, 0x36e7ff, 0xff8a3d, 0xe0e0e0,
  0x8d5a2b, 0xff66c4, 0x6b8e23, 0x00bfa5,
];

export const TEAM_COLOR = { red: 0xff4d5e, blue: 0x3aa0ff, ffa: 0xffcf4d } as const;

// Format a numeric color as a CSS hex string (shared by the UI layers).
export const hexc = (n: number): string => "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);
