import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, GUN_LADDER } from "../engine";
import "../bots"; // side-effect: registers the bot brain with the engine
import { MAPS, MAP_LIST, generateMap, registerMap } from "../maps";
import REG from "../../shared/registry.js";
import { WEAPONS, LOADOUTS, weaponDef } from "../weapons";
import { raycastWorld } from "../physics";
import { v3, dirFromAngles } from "../vec";
import * as C from "../constants";
import type { MatchConfig, PlayerInput } from "../types";

function prng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The simulation is framework-free (no DOM / Three), so it runs headless in Node.
// These tests are the ground truth for game behavior since the renderer can't be
// exercised without a GPU.

function cfg(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: "slayer",
    mapId: "gulch",
    scoreLimit: 25,
    timeLimitSec: 600,
    botCount: 0,
    botSkill: 0.5,
    friendlyFire: false,
    startingLoadout: "recruit",
    ...over,
  };
}

function input(over: Partial<PlayerInput> = {}): PlayerInput {
  return {
    moveX: 0, moveZ: 0, yaw: 0, pitch: 0, jump: false, crouch: false, sprint: false,
    fire: false, altFire: false, reload: false, throwGrenade: false, grenadeType: "frag",
    switchWeapon: -1, zoom: false, pickup: false, seq: 0, ...over,
  };
}

// Build an engine that is already "live" (past warmup + spawn protection).
function liveEngine(c = cfg(), ids = ["a", "b"]): Engine {
  const e = new Engine(c);
  for (const id of ids) {
    const team = c.mode === "team" ? (id === "a" ? "red" : "blue") : "ffa";
    e.addPlayer(id, { name: id, team, isBot: false });
  }
  e.start(0);
  e.step(1 / 60, 4000); // warmup is 3200ms, spawn protect 1800ms → fully live
  return e;
}

test("shared registry stays in sync with the engine and map registry", () => {
  // every registry mode is a real engine mode (has a mode name + boots)
  for (const mode of REG.MODE_IDS as any[]) {
    const e = new Engine(cfg({ mode }));
    e.addPlayer("a", { name: "a", team: "ffa", isBot: false });
    e.start(0);
    assert.ok(e.modeName(), `mode ${mode} is known to the engine`);
  }
  for (const f of REG.FFA_MODES) assert.ok(REG.MODE_IDS.includes(f), `${f} listed as a mode`);
  // registry maps === hand-built maps (ignoring runtime-generated gen_ arenas)
  const handBuilt = Object.keys(MAPS).filter((k) => !k.startsWith("gen_")).sort();
  assert.deepEqual([...REG.MAP_IDS].sort(), handBuilt, "server map whitelist matches game/maps.ts");
});

test("engine ignores inputs for unknown player ids", () => {
  const e = liveEngine();
  e.setInput("total-stranger", input({ fire: true }));
  assert.equal(e.inputs.has("total-stranger"), false);
});

test("players spawn alive and the snapshot is well-shaped", () => {
  const e = liveEngine();
  assert.equal(e.phase, "live");
  const snap = e.snapshot();
  assert.equal(snap.players.length, 2);
  assert.ok(snap.players.every((p) => p.alive));
  assert.ok(Array.isArray(snap.vehicles));
});

test("damage drains the shield, then health, popping the shield", () => {
  const e = liveEngine();
  const t = e.players.get("b")!;
  const a = e.players.get("a")!;
  e.applyDamage(t, 50, a, "ar", false, 4000);
  assert.equal(t.shield, 50);
  assert.equal(t.health, 100);
  e.applyDamage(t, 60, a, "ar", false, 4000);
  assert.equal(t.shield, 0);
  assert.ok(Math.abs(t.health - 90) < 1e-6);
});

test("precision headshots hit hard once shields are down", () => {
  const e = liveEngine();
  const t = e.players.get("b")!;
  const a = e.players.get("a")!;
  t.shield = 0;
  const before = t.health;
  e.applyDamage(t, 22, a, "magnum", true, 4000); // 22 * 2.5 headshot = 55
  assert.ok(before - t.health > 50);
});

test("slayer ends when a player reaches the score limit", () => {
  const e = liveEngine(cfg({ scoreLimit: 1 }));
  const a = e.players.get("a")!;
  const t = e.players.get("b")!;
  e.killPlayer(t, a, "ar", false, 4000);
  assert.equal(a.kills, 1);
  assert.equal(e.phase, "over");
});

test("infection assigns one alpha (preferring bots) and converts fallen survivors", () => {
  const e = new Engine(cfg({ mode: "infection" }));
  e.addPlayer("h1", { name: "h1", team: "ffa", isBot: false });
  e.addPlayer("h2", { name: "h2", team: "ffa", isBot: false });
  e.addPlayer("b1", { name: "b1", team: "ffa", isBot: true });
  e.addPlayer("b2", { name: "b2", team: "ffa", isBot: true });
  e.start(0);
  const infected = [...e.players.values()].filter((p) => p.infected);
  assert.equal(infected.length, 1);
  assert.ok(infected[0].isBot, "alpha should prefer a bot");

  const survivor = [...e.players.values()].find((p) => !p.infected)!;
  e.killPlayer(survivor, undefined, "void", false, 100);
  assert.equal(survivor.infected, true);
  assert.equal(survivor.team, "red");
});

test("thrifty skull removes shields at spawn", () => {
  const e = new Engine(cfg({ skulls: ["thrifty"] }));
  e.addPlayer("a", { name: "a", team: "ffa", isBot: false });
  e.start(0);
  const p = e.players.get("a")!;
  assert.equal(p.maxShield, 0);
  assert.equal(p.shield, 0);
});

test("koth: lone team holder scores exactly once per tick; contested hill scores nobody", () => {
  const e = new Engine(cfg({ mode: "koth", scoreLimit: 999 }));
  e.addPlayer("r", { name: "r", team: "red", isBot: false });
  e.addPlayer("b", { name: "b", team: "blue", isBot: false });
  e.start(0);
  e.step(1 / 60, 4000);
  const r = e.players.get("r")!;
  const b = e.players.get("b")!;
  r.pos = { ...e.hillPos };
  b.pos = { x: e.hillPos.x + 30, y: 0, z: e.hillPos.z + 20 };
  for (let i = 0; i < 60; i++) e.stepMode(1 / 60, 4000);
  assert.ok(Math.abs(r.score - 1) < 0.02, `lone holder scored once, not double (got ${r.score})`);
  assert.ok(Math.abs(e.teamScore.red - 1) < 0.02, "team score accrues at the same rate");
  const before = r.score;
  b.pos = { ...e.hillPos }; // both teams inside -> contested
  for (let i = 0; i < 30; i++) e.stepMode(1 / 60, 4000);
  assert.equal(r.score, before, "contested hill scores nobody");
  assert.equal(e.hillController, null);
});

test("koth FFA: co-occupants contest the hill; only a lone occupant scores", () => {
  const e = liveEngine(cfg({ mode: "koth", scoreLimit: 999 })); // non-team mode -> both players ffa
  const a = e.players.get("a")!;
  const b = e.players.get("b")!;
  a.pos = { ...e.hillPos };
  b.pos = { ...e.hillPos };
  for (let i = 0; i < 30; i++) e.stepMode(1 / 60, 4000);
  assert.equal(a.score + b.score, 0, "two FFA players in the hill = contested, no score");
  b.pos = { x: e.hillPos.x + 30, y: 0, z: e.hillPos.z };
  for (let i = 0; i < 60; i++) e.stepMode(1 / 60, 4000);
  assert.ok(Math.abs(a.score - 1) < 0.02, `lone FFA holder scores (got ${a.score})`);
});

test("splatter after the driver bails is credited to that driver, not booked as suicide", () => {
  const e = liveEngine(cfg({ mapId: "gulch" }), ["drv", "victim"]);
  const drv = e.players.get("drv")!;
  const victim = e.players.get("victim")!;
  const cart = e.vehicles[0];
  drv.pos = { ...cart.pos };
  e.handleVehicleEntry(drv, input({ pickup: true }), input(), 4000);
  e.setInput("drv", input({ moveZ: 1 }));
  for (let i = 0; i < 40; i++) e.stepVehicles(1 / 60, 4000 + i * 16);
  e.handleVehicleEntry(drv, input({ pickup: true }), input(), 4700); // bail at speed
  assert.equal(cart.driver, null, "driver bailed");
  const sp = Math.hypot(cart.vel.x, cart.vel.z);
  assert.ok(sp > C.VEHICLE_SPLATTER_SPEED, "cart still coasting above splatter speed");
  victim.pos = { x: cart.pos.x + (cart.vel.x / sp) * 1.2, y: cart.pos.y, z: cart.pos.z + (cart.vel.z / sp) * 1.2 };
  victim.spawnProtectUntil = 0;
  const vScore = victim.score;
  e.stepVehicles(1 / 60, 4710);
  assert.equal(victim.alive, false, "victim splattered by the coasting cart");
  assert.equal(drv.kills, 1, "kill credited to the recent driver");
  assert.equal(victim.score, vScore, "victim not penalized as a suicide");
});

test("wartrolley: board it, drive it, and splatter someone", () => {
  const e = liveEngine(cfg({ mapId: "gulch" }), ["drv", "victim"]);
  const drv = e.players.get("drv")!;
  const victim = e.players.get("victim")!;
  const cart = e.vehicles[0];
  assert.ok(cart, "Bargain Gulch should have a cart");

  drv.pos = { ...cart.pos };
  e.handleVehicleEntry(drv, input({ pickup: true }), input({ pickup: false }), 4000);
  assert.equal(drv.vehicleId, cart.id);
  assert.equal(cart.driver, "drv");

  e.setInput("drv", input({ moveZ: 1 }));
  const sx = cart.pos.x, sz = cart.pos.z;
  for (let i = 0; i < 30; i++) e.stepVehicles(1 / 60, 4000 + i * 16);
  assert.ok(Math.hypot(cart.pos.x - sx, cart.pos.z - sz) > 1, "cart should have moved");

  const sp = Math.hypot(cart.vel.x, cart.vel.z);
  assert.ok(sp > C.VEHICLE_SPLATTER_SPEED, "cart should be fast enough to splatter");
  victim.pos = { x: cart.pos.x + (cart.vel.x / sp) * 1.2, y: cart.pos.y, z: cart.pos.z + (cart.vel.z / sp) * 1.2 };
  victim.spawnProtectUntil = 0;
  e.stepVehicles(1 / 60, 4600);
  assert.equal(victim.alive, false, "victim in the cart's path should be splattered");
});

test("sandbox integrity: loadouts reference real weapons; DMR present; safe fallback", () => {
  assert.ok(WEAPONS["dmr"], "the DMR exists");
  for (const l of LOADOUTS) {
    for (const w of l.weapons) assert.ok(WEAPONS[w], `loadout ${l.id} references real weapon ${w}`);
  }
  assert.equal(weaponDef("does-not-exist").id, "ar", "unknown weapon falls back to the AR");
});

test("killjoy: ending a 5+ streak announces it to the killer", () => {
  const e = liveEngine();
  const a = e.players.get("a")!;
  const t = e.players.get("b")!;
  t.streak = 6; // the victim is on a spree
  e.killPlayer(t, a, "ar", false, 4000);
  assert.ok(e.announces.some((an) => an.text === "KILLJOY" && an.forId === a.id), "Killjoy awarded to the killer");
});

test("carnage report: accuracy and longest streak are tracked", () => {
  const e = liveEngine();
  const a = e.players.get("a")!;
  const t = e.players.get("b")!;
  // open field on Gulch (away from the central rock mound), 4m apart
  a.pos = { x: 0, y: 0, z: -15 };
  t.pos = { x: 0, y: 0, z: -11 }; // 4m directly ahead (yaw = π faces +z)
  a.yaw = Math.PI;
  a.pitch = 0;
  a.grounded = true;
  a.moving = false;
  e.fireOneHitscan(a, undefined, 4000);
  assert.equal(a.shotsFired, 1);
  assert.equal(a.shotsHit, 1, "a point-blank shot at an enemy counts as a hit");
  e.killPlayer(t, a, "ar", false, 4000);
  assert.equal(a.longestStreak, 1);
});

test("bots board and drive an idle Wartrolley", () => {
  const e = new Engine(cfg({ mapId: "gulch" }));
  e.addPlayer("bot", { name: "bot", team: "ffa", isBot: true });
  e.start(0);
  e.step(1 / 60, 4000);
  const cart = e.vehicles[0];
  const bot = e.players.get("bot")!;
  bot.pos = { ...cart.pos }; // park the bot on the cart
  for (let i = 1; i <= 12; i++) e.step(1 / 60, 4000 + i * 16);
  assert.equal(bot.vehicleId, cart.id, "bot should board the cart it's standing on");

  const sx = cart.pos.x, sz = cart.pos.z;
  for (let i = 0; i < 50; i++) e.step(1 / 60, 4200 + i * 16);
  assert.ok(Math.hypot(cart.pos.x - sx, cart.pos.z - sz) > 1, "bot should drive it somewhere");
});

test("spawning never drops you on top of a living enemy", () => {
  const e = new Engine(cfg({ mode: "slayer", mapId: "aisle" }));
  e.addPlayer("a", { name: "a", team: "ffa", isBot: false });
  e.addPlayer("enemy", { name: "enemy", team: "ffa", isBot: false });
  e.start(0);
  e.step(1 / 60, 4000);
  const enemy = e.players.get("enemy")!;
  const target = e.map.spawns[0];
  enemy.pos = { ...target.pos };
  enemy.alive = true;
  let onTop = 0;
  for (let i = 0; i < 40; i++) {
    const sp = e.pickSpawn("ffa");
    if (Math.hypot(sp.pos.x - target.pos.x, sp.pos.z - target.pos.z) < 0.01) onTop++;
  }
  assert.equal(onTop, 0, "the enemy-occupied spawn is never chosen");
});

test("trip mine: arms, then detonates when an enemy steps on it", () => {
  const e = liveEngine();
  const a = e.players.get("a")!;
  const t = e.players.get("b")!;
  a.pos = { x: 0, y: 0, z: -15 };
  a.yaw = Math.PI;
  a.grenades.mine = 1;
  e.throwGrenade(a, input({ throwGrenade: true, grenadeType: "mine" }), 4000);
  assert.ok(e.projectiles.some((p) => p.weapon === "g_mine"), "a mine was placed");
  for (let i = 0; i < 40; i++) e.stepProjectiles(1 / 60, 4000 + i * 16); // let it settle
  const mine = e.projectiles.find((p) => p.weapon === "g_mine")!;
  assert.ok(mine, "mine rests on the ground");
  t.pos = { x: mine.pos.x, y: mine.pos.y, z: mine.pos.z };
  t.spawnProtectUntil = 0;
  const before = t.health + t.shield;
  e.stepProjectiles(1 / 60, 7000); // armed (>800ms) → enemy on it trips it
  assert.equal(e.projectiles.find((p) => p.weapon === "g_mine"), undefined, "mine detonated");
  assert.ok(t.health + t.shield < before, "the enemy took blast damage");
});

test("gun game: kills climb the weapon ladder and finishing it ends the match", () => {
  const e = new Engine(cfg({ mode: "gungame" }));
  e.addPlayer("a", { name: "a", team: "ffa", isBot: false });
  e.addPlayer("b", { name: "b", team: "ffa", isBot: false });
  e.start(0);
  e.step(1 / 60, 4000);
  const a = e.players.get("a")!;
  const b = e.players.get("b")!;
  assert.equal(a.weaponId, GUN_LADDER[0], "starts on the first rung");
  e.killPlayer(b, a, a.weaponId, false, 4000);
  assert.equal(a.gunLevel, 1, "a kill climbs one rung");
  assert.equal(a.weaponId, GUN_LADDER[1], "and immediately hands the next weapon");
  for (let i = 0; i < GUN_LADDER.length + 2 && e.phase === "live"; i++) {
    b.alive = true;
    b.health = 100;
    b.shield = 0;
    e.killPlayer(b, a, a.weaponId, false, 4000);
  }
  assert.equal(e.phase, "over", "completing the ladder ends the match");
});

test("ctf: grabbing the enemy banner and carrying it home scores a capture", () => {
  const e = new Engine(cfg({ mode: "ctf", scoreLimit: 3 }));
  e.addPlayer("r", { name: "r", team: "red", isBot: false });
  e.addPlayer("b", { name: "b", team: "blue", isBot: false });
  e.start(0);
  e.step(1 / 60, 4000); // live
  const flags = e.flags!;
  assert.ok(flags, "ctf initialises banners");
  const r = e.players.get("r")!;

  r.pos = { ...flags.blue.home }; // red player stands on the blue banner
  e.stepCtf(1 / 60, 4000);
  assert.equal(flags.blue.carrier, "r", "red grabs the blue banner");
  assert.equal(r.carryingFlag, "blue");

  r.pos = { ...flags.red.home }; // carry it back to red's base (red banner is home)
  const before = e.teamScore.red;
  e.stepCtf(1 / 60, 4001);
  assert.equal(e.teamScore.red, before + 1, "red scores a capture");
  assert.equal(flags.blue.carrier, null, "blue banner returns after the capture");
});

test("raycast broadphase matches the exhaustive result on every map", () => {
  const rnd = prng(0x1234abcd);
  for (const m of MAP_LIST) {
    for (let i = 0; i < 250; i++) {
      const origin = v3((rnd() * 2 - 1) * m.size, rnd() * 9, (rnd() * 2 - 1) * m.size);
      const dir = dirFromAngles(rnd() * Math.PI * 2, (rnd() - 0.5) * Math.PI * 0.98);
      const dist = 4 + rnd() * 120;
      const fast = raycastWorld(origin, dir, dist, m);
      const slow = raycastWorld(origin, dir, dist, m, true);
      const ft = fast ? Math.round(fast.t * 1e5) : -1;
      const st = slow ? Math.round(slow.t * 1e5) : -1;
      assert.equal(ft, st, `${m.id} ray ${i}: broadphase ${ft} vs exhaustive ${st}`);
    }
  }
});

test("generated arenas are valid: spawns present, players land on ground, in bounds", () => {
  for (let s = 1; s <= 14; s++) {
    const m = registerMap(generateMap(s * 1337 + 7));
    assert.ok(m.spawns.length >= 8, `${m.id} has enough spawns`);
    const e = new Engine(cfg({ mapId: m.id }));
    e.addPlayer("a", { name: "a", team: "red", isBot: false });
    e.addPlayer("b", { name: "b", team: "blue", isBot: false });
    e.start(0);
    for (let i = 0; i < 30; i++) e.step(1 / 60, 4000 + i * 16);
    for (const p of e.players.values()) {
      assert.ok(p.alive, `${m.id}: player stays alive`);
      assert.ok(Number.isFinite(p.pos.y) && p.pos.y > C.FALL_KILL_Y, `${m.id}: not in the void`);
      assert.ok(Math.abs(p.pos.x) <= m.size + 1 && Math.abs(p.pos.z) <= m.size + 1, `${m.id}: in bounds`);
    }
  }
});

test("every map boots players onto solid ground, in bounds, alive", () => {
  assert.ok(MAP_LIST.length >= 4, "at least four arenas");
  for (const m of MAP_LIST) {
    const e = liveEngine(cfg({ mapId: m.id }), ["a", "b"]);
    for (let i = 0; i < 30; i++) e.step(1 / 60, 4000 + i * 16);
    assert.ok(m.spawns.length >= 4, `${m.id}: has spawns`);
    for (const p of e.players.values()) {
      assert.ok(p.alive, `${m.id}: player stays alive while idle`);
      assert.ok(Number.isFinite(p.pos.y), `${m.id}: finite height`);
      assert.ok(p.pos.y > C.FALL_KILL_Y, `${m.id}: did not fall into the void`);
      assert.ok(Math.abs(p.pos.x) <= m.size && Math.abs(p.pos.z) <= m.size, `${m.id}: inside the playfield`);
    }
  }
});
