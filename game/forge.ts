// Forge-lite ("DIY Display Assembly"): a tiny buildable-map format.
// Framework-free so share codes and built maps are unit-testable in Node.
// A map is a set of grid cells (2u squares) painted with one of three block
// brushes; everything else (perimeter, spawns, pickups, objectives) is stock.

import type { MapDef, Box, SpawnPoint, PickupSpawn } from "./types";
import { v3 } from "./vec";

export const FORGE_GRID = 14; // cells span -FORGE_GRID..FORGE_GRID per axis
const CELL = 2; // world units per cell
const S = 34; // arena half-extent (perimeter sits at ±S)

export type ForgeCell = [number, number, number]; // gridX, gridZ, brushId
export interface ForgeData {
  v: 1;
  n: string;
  c: ForgeCell[];
}

export const BRUSHES = [
  { id: 1, name: "Crate", h: 1.6, color: 0x6a5a3a }, // jumpable cover
  { id: 2, name: "Wall", h: 4.0, color: 0x47506a }, // sightline blocker
  { id: 3, name: "Block", h: 2.8, color: 0x5a6275 }, // tall cover
] as const;

// base64 that works in both the browser and Node (tests) without bundler
// Buffer shims — the JSON payload is plain ASCII.
const B: any = (globalThis as any).Buffer;
const b64e = (s: string) => (typeof btoa !== "undefined" ? btoa(s) : B.from(s, "binary").toString("base64"));
const b64d = (s: string) => (typeof atob !== "undefined" ? atob(s) : B.from(s, "base64").toString("binary"));

export function encodeForge(d: ForgeData): string {
  return b64e(JSON.stringify(d));
}

// Strictly validate an untrusted share code; null on anything malformed.
export function decodeForge(code: string): ForgeData | null {
  try {
    const d = JSON.parse(b64d(code.trim()));
    if (d?.v !== 1 || !Array.isArray(d.c)) return null;
    const name = String(d.n || "Untitled Aisle").slice(0, 24).replace(/[^\w \-']/g, "") || "Untitled Aisle";
    const seen = new Set<string>();
    const cells: ForgeCell[] = [];
    for (const raw of d.c.slice(0, 500)) {
      if (!Array.isArray(raw) || raw.length !== 3) return null;
      const x = Number(raw[0]), z = Number(raw[1]), b = Number(raw[2]);
      if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
      if (Math.abs(x) > FORGE_GRID || Math.abs(z) > FORGE_GRID) return null;
      if (b !== 1 && b !== 2 && b !== 3) return null;
      const k = x + "," + z;
      if (seen.has(k)) continue;
      seen.add(k);
      cells.push([x, z, b]);
    }
    return { v: 1, n: name, c: cells };
  } catch {
    return null;
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildForgeMap(d: ForgeData): MapDef {
  const boxes: Box[] = [];
  const t = 1.2, wallH = 8, wallC = 0x2b2f3a;
  boxes.push({ min: v3(-S, 0, -S), max: v3(S, wallH, -S + t), kind: "wall", color: wallC });
  boxes.push({ min: v3(-S, 0, S - t), max: v3(S, wallH, S), kind: "wall", color: wallC });
  boxes.push({ min: v3(-S, 0, -S), max: v3(-S + t, wallH, S), kind: "wall", color: wallC });
  boxes.push({ min: v3(S - t, 0, -S), max: v3(S, wallH, S), kind: "wall", color: wallC });
  for (const [gx, gz, b] of d.c) {
    const br = BRUSHES.find((q) => q.id === b)!;
    const x = gx * CELL, z = gz * CELL;
    boxes.push({ min: v3(x - 1, 0, z - 1), max: v3(x + 1, br.h, z + 1), kind: b === 2 ? "wall" : "crate", color: br.color });
  }

  const spawns: SpawnPoint[] = [];
  for (const dx of [-9, -3, 3, 9]) {
    spawns.push({ pos: v3(dx, 0, -S + 5), yaw: 0, team: "red" });
    spawns.push({ pos: v3(-dx, 0, S - 5), yaw: Math.PI, team: "blue" });
  }
  spawns.push({ pos: v3(-S + 5, 0, 0), yaw: Math.PI / 2, team: "ffa" });
  spawns.push({ pos: v3(S - 5, 0, 0), yaw: -Math.PI / 2, team: "ffa" });

  const pickups: PickupSpawn[] = [
    { id: "f_sniper", kind: "weapon", what: "sniper", pos: v3(0, 0, 0), respawnMs: 60000 },
    { id: "f_rocket", kind: "weapon", what: "rocket", pos: v3(-S + 7, 0, -S + 7), respawnMs: 90000 },
    { id: "f_sword", kind: "weapon", what: "sword", pos: v3(S - 7, 0, S - 7), respawnMs: 75000 },
    { id: "f_shotty", kind: "weapon", what: "shotgun", pos: v3(0, 0, -S + 7), respawnMs: 45000 },
    { id: "f_over", kind: "powerup", what: "overshield", pos: v3(0, 0, S - 7), respawnMs: 120000 },
  ];

  return {
    id: "forge_" + hash(encodeForge(d)),
    name: d.n,
    blurb: "A DIY Display Assembly original. Some assembly clearly occurred.",
    size: S,
    ambient: 0x4a5266,
    fog: 0x3a4152,
    floorColor: 0x272b34,
    boxes,
    ramps: [],
    jumpPads: [],
    spawns,
    pickups,
    hill: { pos: v3(0, 0, 0), radius: 4.5, moves: [v3(0, 0, 0), v3(-16, 0, 0), v3(16, 0, 0)] },
    oddballSpawn: v3(0, 1, 0),
    skullSpawn: v3(-S + 5, 0, S - 5),
  };
}
