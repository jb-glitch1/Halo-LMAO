import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../engine";
import { MAP_LIST } from "../maps";
import * as C from "../constants";
import type { MatchConfig, PlayerInput } from "../types";

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
