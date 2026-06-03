import type { Engine } from "./engine";
import { registerBotThink } from "./engine";
import type { PlayerState, PlayerInput } from "./types";
import * as C from "./constants";
import { weaponDef } from "./weapons";
import { raycastWorld } from "./physics";
import {
  Vec3,
  v3,
  vadd,
  vsub,
  vlen,
  vdist,
  vnorm,
  flatForward,
  clamp,
} from "./vec";

interface BotMem {
  targetId: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenPos: Vec3;
  strafeDir: number;
  nextStrafe: number;
  waypoint: Vec3 | null;
  nextWaypointAt: number;
  nextJump: number;
  nextGrenade: number;
  noiseYaw: number;
  noisePitch: number;
  nextNoise: number;
  stuckSince: number;
  lastPos: Vec3;
}

const mem = new Map<string, BotMem>();

function getMem(id: string, now: number): BotMem {
  let m = mem.get(id);
  if (!m) {
    m = {
      targetId: null,
      firstSeenAt: 0,
      lastSeenAt: 0,
      lastSeenPos: v3(),
      strafeDir: Math.random() < 0.5 ? 1 : -1,
      nextStrafe: now + 600,
      waypoint: null,
      nextWaypointAt: 0,
      nextJump: now + 2000,
      nextGrenade: now + 4000,
      noiseYaw: 0,
      noisePitch: 0,
      nextNoise: 0,
      stuckSince: now,
      lastPos: v3(),
    };
    mem.set(id, m);
  }
  return m;
}

function eyeOf(p: PlayerState): Vec3 {
  return v3(p.pos.x, p.pos.y + C.PLAYER_EYE, p.pos.z);
}

function canSee(e: Engine, from: Vec3, to: Vec3): boolean {
  const d = vsub(to, from);
  const dist = vlen(d);
  if (dist < 0.5) return true;
  const dir = { x: d.x / dist, y: d.y / dist, z: d.z / dist };
  const w = raycastWorld(from, dir, dist - 0.4, e.map);
  return !w || w.t >= dist - 0.5;
}

function emptyInput(now: number): PlayerInput {
  return {
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    pitch: 0,
    jump: false,
    crouch: false,
    sprint: false,
    fire: false,
    altFire: false,
    reload: false,
    throwGrenade: false,
    grenadeType: "frag",
    switchWeapon: -1,
    zoom: false,
    pickup: false,
    seq: now,
  };
}

function angleLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function botThink(e: Engine, bot: PlayerState, now: number) {
  const m = getMem(bot.id, now);
  const input = emptyInput(now);
  const skill = clamp(bot.botSkill ?? 0.5, 0, 1);
  const eye = eyeOf(bot);
  const d = weaponDef(bot.weaponId);

  // ---- acquire / validate target ----
  let target: PlayerState | null = m.targetId ? e.players.get(m.targetId) || null : null;
  let visible = false;
  if (target && target.alive) {
    visible = canSee(e, eye, vadd(target.pos, v3(0, 1.1, 0))) && vdist(bot.pos, target.pos) < C.BOT_VIEW_RANGE;
  }
  if (!target || !target.alive || (!visible && now - m.lastSeenAt > 2500)) {
    // search for a new one
    let best: PlayerState | null = null;
    let bestD = C.BOT_VIEW_RANGE;
    for (const t of e.players.values()) {
      if (!t.alive || t.id === bot.id || !e.isEnemy(bot, t)) continue;
      const dist = vdist(bot.pos, t.pos);
      if (dist > bestD) continue;
      if (!canSee(e, eye, vadd(t.pos, v3(0, 1.1, 0)))) continue;
      best = t;
      bestD = dist;
    }
    if (best) {
      if (m.targetId !== best.id) m.firstSeenAt = now;
      target = best;
      visible = true;
      m.targetId = best.id;
    } else if (target && now - m.lastSeenAt > 4000) {
      target = null;
      m.targetId = null;
    }
  }
  if (target && visible) {
    m.lastSeenAt = now;
    m.lastSeenPos = { ...target.pos };
  }

  // ---- aim ----
  if (now >= m.nextNoise) {
    const err = 0.16 * (1 - skill) + 0.015;
    m.noiseYaw = (Math.random() * 2 - 1) * err;
    m.noisePitch = (Math.random() * 2 - 1) * err * 0.6;
    m.nextNoise = now + 120 + Math.random() * 240;
  }
  let aimYaw = bot.yaw;
  let aimPitch = bot.pitch;
  const aimTargetPos = target ? (visible ? target.pos : m.lastSeenPos) : m.waypoint;
  if (aimTargetPos) {
    const to = vsub(vadd(aimTargetPos, v3(0, target ? 1.0 : 0.0, 0)), eye);
    const desiredYaw = Math.atan2(-to.x, -to.z);
    const horiz = Math.hypot(to.x, to.z);
    const desiredPitch = Math.atan2(to.y, horiz);
    const turn = clamp((0.12 + 0.22 * skill) * (visible ? 1 : 0.5), 0, 1);
    aimYaw = angleLerp(bot.yaw, desiredYaw + m.noiseYaw, turn);
    aimPitch = clamp(angleLerp(bot.pitch, desiredPitch + m.noisePitch, turn), -1.4, 1.4);
  }
  bot.yaw = aimYaw;
  bot.pitch = aimPitch;

  // ---- combat movement / engage ----
  const lowHealth = bot.health < 45 && bot.shield <= 0;
  if (target) {
    const dist = vdist(bot.pos, target.pos);
    const fwd = flatForward(bot.yaw);
    const toT = vsub(target.pos, bot.pos);
    const aligned =
      (toT.x * fwd.x + toT.z * fwd.z) / (Math.hypot(toT.x, toT.z) || 1);

    // desired range band per weapon
    let near = 8,
      far = 22;
    if (d.id === "shotgun" || d.id === "sword") {
      near = 1.5;
      far = 6;
    } else if (d.id === "sniper") {
      near = 18;
      far = 60;
    } else if (d.id === "br" || d.id === "magnum") {
      near = 10;
      far = 30;
    } else if (d.id === "rocket") {
      near = 8;
      far = 40;
    }

    if (now >= m.nextStrafe) {
      m.strafeDir = Math.random() < 0.5 ? 1 : -1;
      m.nextStrafe = now + 500 + Math.random() * 900;
    }
    input.moveX = m.strafeDir * (visible ? 0.9 : 0.3);
    if (dist > far) input.moveZ = 1;
    else if (dist < near) input.moveZ = -1;
    else input.moveZ = 0.15 * Math.sin(now / 500);
    if (lowHealth) {
      input.moveZ = -1;
      input.sprint = true;
    }

    // fire decision
    const reaction = C.BOT_REACTION_MIN_MS + (1 - skill) * (C.BOT_REACTION_MAX_MS - C.BOT_REACTION_MIN_MS);
    const inRange = dist <= d.range * 0.95;
    const alignedEnough = aligned > 0.985 - (1 - skill) * 0.02;
    const ammo = bot.ammo[bot.weaponId];
    const hasAmmo = d.type === "melee" || (ammo && ammo.mag > 0);
    if (
      visible &&
      inRange &&
      alignedEnough &&
      hasAmmo &&
      now - m.firstSeenAt > reaction &&
      !lowHealth
    ) {
      input.fire = true;
      if (d.zoom && dist > far * 0.7) input.zoom = true;
    }
    // melee when point blank
    if (visible && dist < C.MELEE_RANGE && d.type !== "melee") input.altFire = true;

    // grenade toss occasionally at mid range
    if (visible && dist > 7 && dist < 22 && now >= m.nextGrenade && Math.random() < 0.5) {
      input.throwGrenade = true;
      input.grenadeType = bot.grenades.plasma > 0 && dist < 14 ? "plasma" : "frag";
      m.nextGrenade = now + 5000 + Math.random() * 5000;
    }

    // combat hop
    if (now >= m.nextJump && Math.random() < 0.4) {
      input.jump = true;
      m.nextJump = now + 900 + Math.random() * 1400;
    }
  } else {
    // ---- roam ----
    if (!m.waypoint || now >= m.nextWaypointAt || vdist(bot.pos, m.waypoint) < 3) {
      m.waypoint = pickWaypoint(e, bot);
      m.nextWaypointAt = now + 6000 + Math.random() * 4000;
    }
    if (m.waypoint) {
      const to = vsub(m.waypoint, bot.pos);
      const desiredYaw = Math.atan2(-to.x, -to.z);
      bot.yaw = angleLerp(bot.yaw, desiredYaw, 0.08);
      input.moveZ = 1;
      input.moveX = 0.1 * Math.sin(now / 700);
    }
    // reload while idle if not full
    const ammo = bot.ammo[bot.weaponId];
    if (ammo && ammo.mag < weaponDef(bot.weaponId).magSize * 0.6) input.reload = true;
  }

  // reload when empty
  const a = bot.ammo[bot.weaponId];
  if (a && a.mag <= 0 && (a.reserve > 0 || weaponDef(bot.weaponId).reserveMax === 0)) {
    input.reload = true;
  }

  // obstacle avoidance: probe forward
  const probeDir = flatForward(bot.yaw);
  const hit = raycastWorld(
    v3(bot.pos.x, bot.pos.y + 0.8, bot.pos.z),
    probeDir,
    2.2,
    e.map,
  );
  if (hit && hit.t < 2.0) {
    input.moveX += m.strafeDir * 0.8;
    if (Math.random() < 0.05) input.jump = true;
  }

  // grab nearby power weapon / powerup
  for (const pk of e.pickups) {
    if (!pk.available) continue;
    const dd = vdist(bot.pos, pk.pos);
    if (dd < 2.2 && Math.abs(bot.pos.y - pk.pos.y) < 2.6) input.pickup = true;
  }

  // unstuck
  if (vdist(bot.pos, m.lastPos) < 0.15) {
    if (now - m.stuckSince > 700) {
      input.jump = true;
      input.moveX = m.strafeDir;
      input.moveZ = -1;
      m.stuckSince = now;
      m.strafeDir *= -1;
    }
  } else {
    m.stuckSince = now;
    m.lastPos = { ...bot.pos };
  }

  e.setInput(bot.id, input);
}

function pickWaypoint(e: Engine, bot: PlayerState): Vec3 {
  const roll = Math.random();
  // head toward the action: a living enemy
  if (roll < 0.45) {
    const enemies: PlayerState[] = [];
    for (const t of e.players.values()) if (t.alive && e.isEnemy(bot, t)) enemies.push(t);
    if (enemies.length) {
      const t = enemies[Math.floor(Math.random() * enemies.length)];
      return { ...t.pos };
    }
  }
  // contest the objective
  if (roll < 0.7) {
    if (e.config.mode === "koth" && e.map.hill) return { ...e.hillPos };
    if (e.config.mode === "oddball") return { ...e.oddballPos };
    return v3(0, 0, 0); // center map for slayer/team
  }
  // grab a power weapon
  const powers = e.pickups.filter((p) => p.available && p.kind === "weapon");
  if (powers.length && roll < 0.88) {
    const p = powers[Math.floor(Math.random() * powers.length)];
    return { ...p.pos };
  }
  const s = e.map.size * 0.8;
  return v3((Math.random() * 2 - 1) * s, 0, (Math.random() * 2 - 1) * s);
}

registerBotThink(botThink);
