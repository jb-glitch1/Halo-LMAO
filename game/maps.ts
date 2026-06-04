import type { MapDef, Box, Ramp, SpawnPoint, PickupSpawn, JumpPad } from "./types";
import { v3 } from "./vec";

// ---- geometry helpers (axis-aligned only) ----
function box(
  cx: number,
  cz: number,
  w: number,
  d: number,
  y0: number,
  y1: number,
  kind: Box["kind"] = "wall",
  color?: number,
  team?: Box["team"],
): Box {
  return {
    min: { x: cx - w / 2, y: y0, z: cz - d / 2 },
    max: { x: cx + w / 2, y: y1, z: cz + d / 2 },
    kind,
    color,
    team,
  };
}
function wall(x1: number, z1: number, x2: number, z2: number, h: number, t = 0.8, color?: number): Box {
  const cx = (x1 + x2) / 2;
  const cz = (z1 + z2) / 2;
  const w = Math.max(Math.abs(x2 - x1), t);
  const d = Math.max(Math.abs(z2 - z1), t);
  return box(cx, cz, w, d, 0, h, "wall", color);
}
// sloped, walkable ramp
function slope(
  cx: number,
  cz: number,
  w: number,
  d: number,
  axis: "x" | "z",
  dir: 1 | -1,
  baseY: number,
  topY: number,
  color?: number,
  team?: Box["team"],
): Ramp {
  return {
    min: { x: cx - w / 2, y: baseY, z: cz - d / 2 },
    max: { x: cx + w / 2, y: topY, z: cz + d / 2 },
    axis,
    dir,
    baseY,
    topY,
    kind: "ramp",
    color,
    team,
  };
}
function perimeter(size: number, h = 6, color = 0x223040): Box[] {
  return [
    wall(-size, -size, size, -size, h, 1.2, color),
    wall(-size, size, size, size, h, 1.2, color),
    wall(-size, -size, -size, size, h, 1.2, color),
    wall(size, -size, size, size, h, 1.2, color),
  ];
}
function spawn(x: number, z: number, yaw: number, team: SpawnPoint["team"], y = 0): SpawnPoint {
  return { pos: v3(x, y, z), yaw, team };
}

// =====================================================================
// MAP 1 — Bargain Gulch (Blood Gulch, but everything was on clearance)
// =====================================================================
function bargainGulch(): MapDef {
  const S = 52;
  const boxes: Box[] = [...perimeter(S, 7, 0x2b3d2f)];
  const ramps: Ramp[] = [];

  function base(side: 1 | -1, color: number, team: "red" | "blue") {
    const bz = side * (S - 12); // -40 / +40
    boxes.push(box(0, bz, 16, 10, 3.2, 4.0, "base", color, team)); // roof
    boxes.push(box(-6, bz, 1.2, 1.2, 0, 3.2, "base", color, team));
    boxes.push(box(6, bz, 1.2, 1.2, 0, 3.2, "base", color, team));
    boxes.push(box(-7.4, bz, 1.2, 10, 0, 4.4, "base", color, team)); // side wall
    boxes.push(box(7.4, bz, 1.2, 10, 0, 4.4, "base", color, team));
    boxes.push(box(0, bz + side * 5.1, 16, 1.0, 0, 4.6, "base", color, team)); // back wall
    // ramp up to roof from field side
    const fieldZ = bz - side * 5; // toward center
    ramps.push(
      slope(0, fieldZ - side * 3, 6, 6, "z", side === 1 ? -1 : 1, 0, 3.2, color, team),
    );
  }
  base(-1, 0xff4d5e, "red");
  base(1, 0x3aa0ff, "blue");

  boxes.push(box(0, 0, 9, 9, 0, 2.0, "rock", 0x6b6f5a));
  boxes.push(box(0, 0, 5, 5, 2.0, 3.0, "rock", 0x7a7e66)); // sniper perch
  ramps.push(slope(0, 6, 4, 4, "z", -1, 0, 2.0, 0x6b6f5a)); // ramp onto mound
  boxes.push(box(-16, 8, 4, 4, 0, 2.4, "rock", 0x6b6f5a));
  boxes.push(box(16, -8, 4, 4, 0, 2.4, "rock", 0x6b6f5a));
  boxes.push(box(-20, -14, 3, 6, 0, 1.8, "rock", 0x6b6f5a));
  boxes.push(box(20, 14, 3, 6, 0, 1.8, "rock", 0x6b6f5a));
  boxes.push(box(-10, -22, 5, 3, 0, 1.6, "crate", 0x5a4d3a));
  boxes.push(box(10, 22, 5, 3, 0, 1.6, "crate", 0x5a4d3a));

  const jumpPads: JumpPad[] = [
    { pos: v3(-14, 0, 0), radius: 2.2, power: 12, dir: v3(0.4, 0, 0) },
    { pos: v3(14, 0, 0), radius: 2.2, power: 12, dir: v3(-0.4, 0, 0) },
  ];

  const spawns: SpawnPoint[] = [
    spawn(-6, -S + 16, 0, "red"),
    spawn(6, -S + 16, 0, "red"),
    spawn(0, -S + 19, 0, "red"),
    spawn(-9, -S + 14, 0.2, "red"),
    spawn(-6, S - 16, Math.PI, "blue"),
    spawn(6, S - 16, Math.PI, "blue"),
    spawn(0, S - 19, Math.PI, "blue"),
    spawn(9, S - 14, Math.PI - 0.2, "blue"),
    spawn(-22, 0, Math.PI / 2, "ffa"),
    spawn(22, 0, -Math.PI / 2, "ffa"),
    spawn(0, 24, Math.PI, "ffa"),
    spawn(0, -24, 0, "ffa"),
  ];

  const pickups: PickupSpawn[] = [
    { id: "sniper_mid", kind: "weapon", what: "sniper", pos: v3(0, 3.0, 0), respawnMs: 60000 },
    { id: "rocket_w", kind: "weapon", what: "rocket", pos: v3(-26, 0, 18), respawnMs: 90000 },
    { id: "sword_e", kind: "weapon", what: "sword", pos: v3(26, 0, -18), respawnMs: 75000 },
    { id: "shotty_n", kind: "weapon", what: "shotgun", pos: v3(0, 0, -28), respawnMs: 45000 },
    { id: "shotty_s", kind: "weapon", what: "shotgun", pos: v3(0, 0, 28), respawnMs: 45000 },
    { id: "over_mid", kind: "powerup", what: "overshield", pos: v3(0, 3.6, 0), respawnMs: 120000 },
    { id: "dmg_w", kind: "powerup", what: "damage", pos: v3(-30, 0, -22), respawnMs: 120000 },
  ];

  return {
    id: "gulch",
    name: "Bargain Gulch",
    blurb: "Two bases. One canyon. Zero refunds. The everything-on-clearance classic.",
    size: S,
    ambient: 0x6a7a55,
    fog: 0x9fb88a,
    floorColor: 0x55683f,
    boxes,
    ramps,
    jumpPads,
    spawns,
    pickups,
    hill: {
      pos: v3(0, 0, 0),
      radius: 6,
      moves: [v3(0, 0, 0), v3(-20, 0, 16), v3(20, 0, -16), v3(0, 0, 22), v3(0, 0, -22)],
    },
    oddballSpawn: v3(0, 3.2, 0),
    vehicleSpawns: [
      { pos: v3(-30, 0, 10), yaw: Math.PI / 2 },
      { pos: v3(30, 0, -10), yaw: -Math.PI / 2 },
    ],
    skullSpawn: v3(-44, 0, -44),
  };
}

// =====================================================================
// MAP 2 — Clearance Warehouse (tight, boxy, indoor CQB)
// =====================================================================
function warehouse(): MapDef {
  const S = 30;
  const boxes: Box[] = [...perimeter(S, 9, 0x2a2f3a)];
  const ramps: Ramp[] = [];

  const crate = (x: number, z: number, h = 2.2) => box(x, z, 3, 3, 0, h, "crate", 0x6a5a3a);
  for (let i = -2; i <= 2; i++) {
    boxes.push(crate(-14, i * 7, 2.4));
    boxes.push(crate(14, i * 7, 2.4));
  }
  boxes.push(box(0, 0, 8, 8, 0, 1.4, "crate", 0x5a4d3a));
  boxes.push(box(0, 0, 8, 8, 3.4, 4.0, "platform", 0x44506a)); // catwalk
  ramps.push(slope(0, -8, 3, 8, "z", 1, 0, 3.4, 0x44506a)); // ramp up to catwalk
  boxes.push(box(-10, 12, 4, 3, 0, 1.8, "crate", 0x6a5a3a));
  boxes.push(box(10, -12, 4, 3, 0, 1.8, "crate", 0x6a5a3a));
  boxes.push(box(-10, -18, 5, 2, 0, 2.2, "crate", 0x6a5a3a));
  boxes.push(box(10, 18, 5, 2, 0, 2.2, "crate", 0x6a5a3a));
  boxes.push(box(-20, 0, 0.4, 8, 0, 3, "glass", 0x3a5a6a));
  boxes.push(box(20, 0, 0.4, 8, 0, 3, "glass", 0x3a5a6a));

  const jumpPads: JumpPad[] = [
    { pos: v3(-22, 0, 22), radius: 1.8, power: 10 },
    { pos: v3(22, 0, -22), radius: 1.8, power: 10 },
  ];

  const spawns: SpawnPoint[] = [
    spawn(-24, -24, Math.PI / 4, "red"),
    spawn(-20, -24, Math.PI / 4, "red"),
    spawn(-24, -20, Math.PI / 4, "red"),
    spawn(24, 24, -Math.PI * 0.75, "blue"),
    spawn(20, 24, -Math.PI * 0.75, "blue"),
    spawn(24, 20, -Math.PI * 0.75, "blue"),
    spawn(24, -24, -Math.PI / 4, "ffa"),
    spawn(-24, 24, Math.PI * 0.75, "ffa"),
    spawn(0, 24, Math.PI, "ffa"),
    spawn(0, -24, 0, "ffa"),
  ];

  const pickups: PickupSpawn[] = [
    { id: "sword_mid", kind: "weapon", what: "sword", pos: v3(0, 4.0, 0), respawnMs: 70000 },
    { id: "shotty_w", kind: "weapon", what: "shotgun", pos: v3(-22, 0, 0), respawnMs: 40000 },
    { id: "shotty_e", kind: "weapon", what: "shotgun", pos: v3(22, 0, 0), respawnMs: 40000 },
    { id: "needler_n", kind: "weapon", what: "needler", pos: v3(0, 0, -24), respawnMs: 50000 },
    { id: "rocket_s", kind: "weapon", what: "rocket", pos: v3(0, 0, 24), respawnMs: 90000 },
    { id: "over_w", kind: "powerup", what: "overshield", pos: v3(-22, 0, 22), respawnMs: 110000 },
    { id: "speed_e", kind: "powerup", what: "speed", pos: v3(22, 0, -22), respawnMs: 90000 },
  ];

  return {
    id: "warehouse",
    name: "Clearance Warehouse",
    blurb: "Aisle after aisle of close-quarters regret. Mind the catwalk.",
    size: S,
    ambient: 0x4a5260,
    fog: 0x20262e,
    floorColor: 0x2e333d,
    boxes,
    ramps,
    jumpPads,
    spawns,
    pickups,
    hill: { pos: v3(0, 4.0, 0), radius: 4.5, moves: [v3(0, 4.0, 0), v3(-14, 0, 0), v3(14, 0, 0)] },
    oddballSpawn: v3(0, 1.6, 0),
    skullSpawn: v3(-26, 0, 26),
  };
}

// =====================================================================
// MAP 3 — Lattice of Disappointment (vertical, lifts, pits)
// =====================================================================
function lattice(): MapDef {
  const S = 32;
  const boxes: Box[] = [...perimeter(S, 12, 0x2b2540)];
  const ramps: Ramp[] = [];

  boxes.push(box(0, 0, 12, 12, 6, 6.8, "platform", 0x3a3358)); // top mid
  boxes.push(box(0, 0, 12, 12, 0, 0.6, "platform", 0x2a2540)); // basement
  const ring = (x: number, z: number, h: number, w = 9, d = 9, c = 0x453a66) =>
    boxes.push(box(x, z, w, d, h, h + 0.6, "platform", c));
  ring(-20, -20, 3.5);
  ring(20, 20, 3.5);
  ring(-20, 20, 5.0);
  ring(20, -20, 5.0);
  ring(0, -22, 2.0, 12, 7);
  ring(0, 22, 2.0, 12, 7);
  boxes.push(box(-10, -20, 11, 2, 3.5, 4.1, "platform", 0x4a4070));
  boxes.push(box(10, 20, 11, 2, 3.5, 4.1, "platform", 0x4a4070));
  boxes.push(box(0, -11, 3, 11, 2.0, 2.6, "platform", 0x4a4070));
  boxes.push(box(0, 11, 3, 11, 2.0, 2.6, "platform", 0x4a4070));
  boxes.push(box(-4, -4, 1.5, 1.5, 6.8, 9, "wall", 0x564a7a));
  boxes.push(box(4, 4, 1.5, 1.5, 6.8, 9, "wall", 0x564a7a));
  // ramps from ground to the low rings
  ramps.push(slope(0, -26.5, 4, 5, "z", 1, 0, 2.0, 0x4a4070));
  ramps.push(slope(0, 26.5, 4, 5, "z", -1, 0, 2.0, 0x4a4070));

  const jumpPads: JumpPad[] = [
    { pos: v3(0, 0.6, 0), radius: 2.0, power: 14 },
    { pos: v3(-20, 3.5, -20), radius: 1.8, power: 11 },
    { pos: v3(20, 3.5, 20), radius: 1.8, power: 11 },
    { pos: v3(-20, 5.0, 20), radius: 1.8, power: 9 },
    { pos: v3(20, 5.0, -20), radius: 1.8, power: 9 },
  ];

  const spawns: SpawnPoint[] = [
    spawn(-20, -20, Math.PI / 4, "red", 3.6),
    spawn(-18, -22, Math.PI / 4, "red", 3.6),
    spawn(-22, -18, Math.PI / 4, "red", 3.6),
    spawn(20, 20, -Math.PI * 0.75, "blue", 3.6),
    spawn(18, 22, -Math.PI * 0.75, "blue", 3.6),
    spawn(22, 18, -Math.PI * 0.75, "blue", 3.6),
    spawn(-20, 20, Math.PI * 0.75, "ffa", 5.1),
    spawn(20, -20, -Math.PI / 4, "ffa", 5.1),
    spawn(0, -22, Math.PI, "ffa", 2.1),
    spawn(0, 22, 0, "ffa", 2.1),
  ];

  const pickups: PickupSpawn[] = [
    { id: "sniper_top", kind: "weapon", what: "sniper", pos: v3(0, 7.0, 0), respawnMs: 55000 },
    { id: "rocket_r", kind: "weapon", what: "rocket", pos: v3(-20, 5.2, 20), respawnMs: 90000 },
    { id: "sword_basement", kind: "weapon", what: "sword", pos: v3(0, 0.8, 0), respawnMs: 70000 },
    { id: "needler_b", kind: "weapon", what: "needler", pos: v3(20, 5.2, -20), respawnMs: 50000 },
    { id: "over_top", kind: "powerup", what: "overshield", pos: v3(4, 7.0, 4), respawnMs: 120000 },
    { id: "camo_b", kind: "powerup", what: "camo", pos: v3(-4, 7.0, -4), respawnMs: 120000 },
  ];

  return {
    id: "lattice",
    name: "Lattice of Disappointment",
    blurb: "Vertical, unforgiving, mostly air. The grav-lifts are doing their best.",
    size: S,
    ambient: 0x5a4a7a,
    fog: 0x140f24,
    floorColor: 0x171326,
    boxes,
    ramps,
    jumpPads,
    spawns,
    pickups,
    hill: { pos: v3(0, 7.0, 0), radius: 4.5, moves: [v3(0, 7.0, 0), v3(-20, 3.6, -20), v3(20, 3.6, 20)] },
    oddballSpawn: v3(0, 7.0, 0),
    skullSpawn: v3(0, 0.8, 0),
  };
}

export const MAPS: Record<string, MapDef> = {
  gulch: bargainGulch(),
  warehouse: warehouse(),
  lattice: lattice(),
};

export const MAP_LIST = Object.values(MAPS);

export function getMap(id: string): MapDef {
  return MAPS[id] || MAPS.gulch;
}
