import type {
  PlayerState,
  PlayerInput,
  ProjectileState,
  PickupRuntime,
  KillEvent,
  HitEvent,
  FxEvent,
  Announce,
  Snapshot,
  MatchConfig,
  MapDef,
  Team,
  PowerupId,
  SkullId,
  VehicleState,
} from "./types";
import * as C from "./constants";
import { weaponDef, loadoutById, POWER_WEAPONS } from "./weapons";
import { getMap } from "./maps";
import { raycastWorld, rayCylinder, supportHeight, moveAndCollide } from "./physics";
import { applyMovementStep } from "./movement";
import {
  Vec3,
  v3,
  vadd,
  vsub,
  vscale,
  vnorm,
  vlen,
  vdist,
  dirFromAngles,
  flatForward,
  flatRight,
  clamp,
} from "./vec";

export interface AddPlayerOpts {
  name: string;
  team: Team;
  isBot: boolean;
  botSkill?: number;
  loadout?: string;
  color?: number;
}

const emptyInput = (): PlayerInput => ({
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
  seq: 0,
});

export class Engine {
  config: MatchConfig;
  map: MapDef;
  players = new Map<string, PlayerState>();
  inputs = new Map<string, PlayerInput>();
  prevInputs = new Map<string, PlayerInput>();
  projectiles: ProjectileState[] = [];
  pickups: PickupRuntime[] = [];
  killFeed: KillEvent[] = [];
  hits: HitEvent[] = [];
  fx: FxEvent[] = [];
  announces: Announce[] = [];
  colors = new Map<string, number>();

  tick = 0;
  now = 0;
  startTime = 0;
  warmupUntil = 0;
  endsAt = 0;
  phase: "warmup" | "live" | "over" = "warmup";
  teamScore = { red: 0, blue: 0 };
  winner: Team | string | null = null;

  // mode runtime
  hillIndex = 0;
  hillMoveAt = 0;
  hillPos: Vec3 = v3();
  hillController: Team | null = null;
  hillProgress = 0;
  oddballPos: Vec3 = v3();
  oddballCarrier: string | null = null;

  // infection (Black Friday)
  private _announcedLast = false;
  // vehicles (Wartrolley)
  vehicles: VehicleState[] = [];

  private nextProjId = 1;
  private nextEventId = 1;
  private multi = new Map<string, { count: number; at: number }>();
  private needleStacks = new Map<string, { count: number; at: number; by: string }>();
  private spawnQueue: PlayerState[] = [];
  private rng = mulberry32(0x9e3779b9 ^ Date.now());

  constructor(config: MatchConfig) {
    this.config = config;
    this.map = getMap(config.mapId);
  }

  // ---------------- lifecycle ----------------
  start(now: number) {
    this.now = now;
    this.startTime = now;
    this.warmupUntil = now + 3200;
    this.endsAt = now + 3200 + this.config.timeLimitSec * 1000;
    this.phase = "warmup";
    this.teamScore = { red: 0, blue: 0 };
    this.winner = null;
    this.projectiles = [];
    this._announcedLast = false;
    this.initPickups();
    this.initMode(now);
    this.initVehicles(now);
    if (this.config.mode === "infection") this.setupInfection();
    this.announce("GET READY", "Match starts in a sec…", true);
    for (const p of this.players.values()) this.spawnPlayer(p, now, true);
  }

  hasSkull(id: SkullId) {
    return !!this.config.skulls?.includes(id);
  }

  // Pick the alpha "doorbusters". Prefer bots as patient zero so a solo human
  // usually starts as a survivor.
  setupInfection() {
    const all = [...this.players.values()];
    for (const p of all) {
      p.team = "blue";
      p.infected = false;
    }
    const n = Math.max(1, Math.round(all.length * 0.25));
    const pool = all
      .slice()
      .sort((a, b) => (a.isBot === b.isBot ? this.rng() - 0.5 : a.isBot ? -1 : 1));
    for (let i = 0; i < n && i < pool.length; i++) {
      pool[i].team = "red";
      pool[i].infected = true;
    }
  }

  initVehicles(now: number) {
    this.vehicles = (this.map.vehicleSpawns || []).map((s, i) => ({
      id: "veh_" + i,
      kind: "wartrolley" as const,
      pos: { ...s.pos },
      vel: v3(),
      yaw: s.yaw,
      wheelSpin: 0,
      driver: null,
      gunner: null,
      health: C.VEHICLE_HEALTH,
      fireReadyAt: now,
    }));
  }

  initPickups() {
    this.pickups = this.map.pickups.map((p) => ({
      id: p.id,
      kind: p.kind,
      what: p.what,
      pos: { ...p.pos },
      available: true,
      readyAt: 0,
    }));
  }

  initMode(now: number) {
    if (this.map.hill) {
      this.hillIndex = 0;
      this.hillPos = { ...(this.map.hill.moves?.[0] || this.map.hill.pos) };
      this.hillMoveAt = now + 45000;
    }
    if (this.map.oddballSpawn) {
      this.oddballPos = { ...this.map.oddballSpawn };
      this.oddballCarrier = null;
    }
  }

  addPlayer(id: string, opts: AddPlayerOpts) {
    const lo = loadoutById(opts.loadout || this.config.startingLoadout);
    const p: PlayerState = {
      id,
      name: opts.name,
      team: opts.team,
      isBot: opts.isBot,
      botSkill: opts.botSkill ?? this.config.botSkill,
      pos: v3(0, 0, 0),
      vel: v3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      health: C.MAX_HEALTH,
      shield: C.MAX_SHIELD,
      maxShield: C.MAX_SHIELD,
      alive: false,
      spawnProtectUntil: 0,
      respawnAt: this.now + 800,
      weaponId: lo.weapons[0],
      weapons: [...lo.weapons],
      ammo: {},
      grenades: { frag: 2, plasma: lo.grenade === "plasma" ? 2 : 0 },
      reloadUntil: 0,
      fireReadyAt: 0,
      burstLeft: 0,
      burstNextAt: 0,
      lastDamageAt: 0,
      lastFireAt: 0,
      zoomed: false,
      powerups: {},
      kills: 0,
      deaths: 0,
      assists: 0,
      score: 0,
      streak: 0,
      recentDamagers: {},
      carryingOddball: false,
      firing: false,
      meleeAnim: 0,
      hitFlash: 0,
      grounded: false,
      moving: false,
    };
    this.resetAmmo(p);
    if (opts.color != null) this.colors.set(id, opts.color);
    this.players.set(id, p);
    this.inputs.set(id, emptyInput());
    this.prevInputs.set(id, emptyInput());
    if (this.phase !== "warmup") this.spawnPlayer(p, this.now, false);
    return p;
  }

  removePlayer(id: string) {
    if (this.oddballCarrier === id) this.dropOddball(this.players.get(id));
    for (const v of this.vehicles) {
      if (v.driver === id) v.driver = null;
      if (v.gunner === id) v.gunner = null;
    }
    this.players.delete(id);
    this.inputs.delete(id);
    this.prevInputs.delete(id);
    this.colors.delete(id);
  }

  setInput(id: string, input: PlayerInput) {
    const cur = this.inputs.get(id);
    if (cur) this.prevInputs.set(id, cur);
    this.inputs.set(id, input);
  }

  resetAmmo(p: PlayerState) {
    p.ammo = {};
    for (const w of p.weapons) {
      const d = weaponDef(w);
      p.ammo[w] = { mag: d.magSize, reserve: Math.min(d.reserveMax, d.magSize * 3) };
    }
  }

  // ---------------- spawning ----------------
  spawnPlayer(p: PlayerState, now: number, initial: boolean) {
    const sp = this.pickSpawn(p.team);
    p.pos = { ...sp.pos };
    p.pos.y = supportHeight(sp.pos.x, sp.pos.z, C.PLAYER_RADIUS, sp.pos.y + 0.5, this.map);
    p.vel = v3(0, 0, 0);
    p.yaw = sp.yaw;
    p.pitch = 0;
    p.health = C.MAX_HEALTH;
    p.shield = C.MAX_SHIELD;
    p.maxShield = C.MAX_SHIELD;
    p.alive = true;
    p.spawnProtectUntil = now + C.SPAWN_PROTECT_MS;
    p.reloadUntil = 0;
    p.fireReadyAt = now + 250;
    p.burstLeft = 0;
    p.zoomed = false;
    p.streak = 0;
    p.powerups = {};
    p.carryingOddball = false;
    p.recentDamagers = {};
    p.vehicleId = null;
    p.vehicleSeat = undefined;
    // loadout — infected get the energy butterknife; survivors their loadout
    if (this.config.mode === "infection" && p.infected) {
      p.weapons = ["sword"];
      p.weaponId = "sword";
      p.grenades = { frag: 0, plasma: 0 };
      p.maxShield = 0;
      p.shield = 0;
      p.health = 150; // tanky melee horde
      p.powerups = { speed: now + 9_000_000 }; // permanently quick
    } else {
      const lo = loadoutById(this.config.startingLoadout);
      p.weapons = [...lo.weapons];
      p.weaponId = lo.weapons[0];
      p.grenades = { frag: this.hasSkull("famine") ? 1 : 2, plasma: lo.grenade === "plasma" ? 2 : 1 };
      if (this.hasSkull("thrifty")) {
        p.maxShield = 0;
        p.shield = 0;
      }
    }
    this.resetAmmo(p);
    if (this.hasSkull("famine")) {
      for (const w of Object.keys(p.ammo)) p.ammo[w].reserve = Math.floor(p.ammo[w].reserve * 0.4);
    }
    this.pushFx("spawn", p.pos, p.team);
  }

  pickSpawn(team: Team) {
    const pool = this.map.spawns.filter(
      (s) => s.team === team || (team === "ffa" ? true : s.team === "ffa"),
    );
    const usable = pool.length ? pool : this.map.spawns;
    // farthest from nearest living enemy
    let best = usable[0];
    let bestScore = -Infinity;
    for (const s of usable) {
      let nearest = Infinity;
      for (const o of this.players.values()) {
        if (!o.alive) continue;
        if (this.sameTeam(team, o.team) && team !== "ffa") continue;
        if (team === "ffa" && o.team === "ffa") {
          // any other player counts in ffa
        }
        nearest = Math.min(nearest, vdist(s.pos, o.pos));
      }
      const score = (nearest === Infinity ? 999 : nearest) + this.rng() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  sameTeam(a: Team, b: Team) {
    return a === b && a !== "ffa";
  }
  isEnemy(a: PlayerState, b: PlayerState) {
    if (a.id === b.id) return false;
    if (this.config.mode === "slayer") return true; // FFA
    return !this.sameTeam(a.team, b.team);
  }

  // ---------------- main step ----------------
  step(dt: number, now: number) {
    this.now = now;
    this.tick++;

    if (this.phase === "warmup" && now >= this.warmupUntil) {
      this.phase = "live";
      this.announce("FIGHT!", this.modeName(), true);
    }

    // bots decide inputs
    for (const p of this.players.values()) {
      if (p.isBot) {
        // lazy import to avoid cycle at module top
        botThink(this, p, now);
      }
    }

    for (const p of this.players.values()) {
      const input = this.inputs.get(p.id) || emptyInput();
      const prev = this.prevInputs.get(p.id) || emptyInput();
      if (!p.alive) {
        if (now >= p.respawnAt && this.phase !== "over") this.spawnPlayer(p, now, false);
        continue;
      }
      // aim
      if (!p.isBot) {
        p.yaw = input.yaw;
        p.pitch = clamp(input.pitch, -1.5, 1.5);
      }
      // enter / exit a Wartrolley with E
      this.handleVehicleEntry(p, input, prev, now);
      if (p.vehicleId) {
        // riding: movement + cannon handled in stepVehicles
        this.regen(p, dt, now);
        this.expirePowerups(p, now);
        this.prevInputs.set(p.id, input);
        continue;
      }
      this.applyMovement(p, input, dt, now);
      this.regen(p, dt, now);
      this.handleWeapons(p, input, prev, now);
      this.expirePowerups(p, now);
      // fall safety
      if (p.pos.y < C.FALL_KILL_Y) this.killPlayer(p, undefined, "void", false, now);
      // store prev input
      this.prevInputs.set(p.id, input);
    }

    this.stepVehicles(dt, now);
    this.stepProjectiles(dt, now);
    this.stepPickups(now);
    this.cleanNeedles(now);
    if (this.phase === "live") this.stepMode(dt, now);
    if (this.phase === "live" && now >= this.endsAt) this.endMatch("time");
  }

  // ---------------- movement ----------------
  applyMovement(p: PlayerState, input: PlayerInput, dt: number, now: number) {
    const speedPU = p.powerups.speed && p.powerups.speed > now ? C.SPEED_MULT : 1;
    const oddballMult = p.carryingOddball ? 1.05 : 1;
    const sugar = this.hasSkull("sugar") ? 1.22 : 1;
    const res = applyMovementStep(p, input, dt, this.map, {
      speedMult: speedPU * oddballMult * sugar,
      zoomed: p.zoomed,
    });
    p.grounded = res.grounded;
    p.moving = res.moving;
    for (const lift of res.lifts) this.pushFx("lift", lift);
  }

  regen(p: PlayerState, dt: number, now: number) {
    if (now - p.lastDamageAt > C.SHIELD_REGEN_DELAY_MS && p.shield < p.maxShield) {
      p.shield = Math.min(p.maxShield, p.shield + C.SHIELD_REGEN_PER_SEC * dt);
    }
    if (
      now - p.lastDamageAt > C.HEALTH_REGEN_DELAY_MS &&
      p.health < C.MAX_HEALTH &&
      p.shield >= p.maxShield
    ) {
      p.health = Math.min(C.MAX_HEALTH, p.health + C.HEALTH_REGEN_PER_SEC * dt);
    }
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 3);
  }

  // ---------------- weapons ----------------
  handleWeapons(p: PlayerState, input: PlayerInput, prev: PlayerInput, now: number) {
    const d = weaponDef(p.weaponId);
    p.zoomed = !!d.zoom && input.zoom;

    // weapon switch
    if (input.switchWeapon === 2 && prev.switchWeapon !== 2) {
      this.swapWeapon(p);
    }
    // reload
    if (
      input.reload &&
      p.reloadUntil === 0 &&
      d.magSize > 1 &&
      (p.ammo[p.weaponId]?.mag ?? 0) < d.magSize &&
      ((p.ammo[p.weaponId]?.reserve ?? 0) > 0 || d.reserveMax === 0)
    ) {
      p.reloadUntil = now + d.reloadMs;
      p.burstLeft = 0;
    }
    if (p.reloadUntil > 0 && now >= p.reloadUntil) {
      this.finishReload(p, d);
    }

    // grenade
    if (input.throwGrenade && !prev.throwGrenade) this.throwGrenade(p, input, now);

    // pickup
    if (input.pickup && !prev.pickup) this.tryPickup(p, now);

    // melee (altFire) — quick melee with any weapon, or sword primary handled in fire
    if (input.altFire && !prev.altFire && now >= p.fireReadyAt && d.type !== "melee") {
      this.doMelee(p, now, C.MELEE_DAMAGE, C.MELEE_RANGE);
      p.fireReadyAt = now + C.MELEE_COOLDOWN_MS;
    }

    // continue an in-progress burst
    if (p.burstLeft > 0 && now >= p.burstNextAt && p.reloadUntil === 0) {
      this.fireOneHitscan(p, d, now);
      p.burstLeft--;
      p.burstNextAt = now + (d.burstDelayMs || 70);
      if (p.burstLeft === 0) p.fireReadyAt = now + 60000 / d.rpm;
    }

    // primary fire
    const wantFire = input.fire;
    if (wantFire && now >= p.fireReadyAt && p.reloadUntil === 0 && p.burstLeft === 0) {
      this.fireWeapon(p, d, now);
    }
    p.firing = wantFire && now - p.lastFireAt < 120;
  }

  finishReload(p: PlayerState, d = weaponDef(p.weaponId)) {
    const a = p.ammo[p.weaponId] || { mag: 0, reserve: 0 };
    if (d.reserveMax === 0) {
      a.mag = d.magSize; // vented battery / no reserve
    } else {
      const need = d.magSize - a.mag;
      const take = Math.min(need, a.reserve);
      a.mag += take;
      a.reserve -= take;
    }
    p.ammo[p.weaponId] = a;
    p.reloadUntil = 0;
  }

  fireWeapon(p: PlayerState, d = weaponDef(p.weaponId), now = this.now) {
    const a = p.ammo[p.weaponId];
    if (d.type === "melee") {
      this.doMelee(p, now, d.damage, d.meleeRange || d.range, true);
      p.fireReadyAt = now + 60000 / d.rpm;
      p.lastFireAt = now;
      return;
    }
    if (!a || a.mag <= 0) {
      // auto reload if empty
      if ((a?.reserve ?? 0) > 0 || d.reserveMax === 0) p.reloadUntil = now + d.reloadMs;
      p.fireReadyAt = now + 200;
      return;
    }
    if (d.burst && d.burst > 1) {
      p.burstLeft = Math.min(d.burst, a.mag);
      p.burstNextAt = now;
      // first shot fires immediately on next branch
      this.fireOneHitscan(p, d, now);
      p.burstLeft--;
      p.burstNextAt = now + (d.burstDelayMs || 70);
      if (p.burstLeft === 0) p.fireReadyAt = now + 60000 / d.rpm;
      return;
    }
    if (d.type === "projectile") {
      this.fireProjectileWeapon(p, d, now);
    } else {
      this.fireOneHitscan(p, d, now);
    }
    p.fireReadyAt = now + 60000 / d.rpm;
  }

  private aimOrigin(p: PlayerState): Vec3 {
    return v3(p.pos.x, p.pos.y + C.PLAYER_EYE, p.pos.z);
  }
  private aimDir(p: PlayerState, spreadDeg: number): Vec3 {
    const base = dirFromAngles(p.yaw, p.pitch);
    if (spreadDeg <= 0) return base;
    const s = (spreadDeg * Math.PI) / 180;
    // random small rotation
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(this.rng()) * s;
    // build perpendicular basis
    const up = Math.abs(base.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const right = vnorm(cross(base, up));
    const realUp = cross(right, base);
    const dir = vnorm(
      vadd(base, vadd(vscale(right, Math.cos(a) * r), vscale(realUp, Math.sin(a) * r))),
    );
    return dir;
  }

  fireOneHitscan(p: PlayerState, d = weaponDef(p.weaponId), now = this.now) {
    const a = p.ammo[p.weaponId];
    if (!a || a.mag <= 0) return;
    a.mag--;
    p.lastFireAt = now;
    const origin = this.aimOrigin(p);
    const moving = p.moving ? d.movingSpreadDeg || d.spreadDeg : 0;
    const spread = d.spreadDeg + (p.zoomed ? 0 : moving) + (p.grounded ? 0 : d.spreadDeg);
    const pellets = d.pellets || 1;
    this.pushFx("muzzle", origin, p.team, d.id);
    for (let i = 0; i < pellets; i++) {
      const dir = this.aimDir(p, pellets > 1 ? d.spreadDeg : spread);
      this.resolveHitscanRay(p, d, origin, dir, now);
    }
  }

  resolveHitscanRay(p: PlayerState, d = weaponDef(p.weaponId), origin: Vec3, dir: Vec3, now = this.now) {
    const wall = raycastWorld(origin, dir, d.range, this.map);
    const wallDist = wall ? wall.t : d.range;
    let hitP: PlayerState | null = null;
    let hitDist = wallDist;
    let hitY = 0;
    for (const t of this.players.values()) {
      if (!t.alive || t.id === p.id) continue;
      if (!this.isEnemy(p, t) && !this.config.friendlyFire) {
        // still allow ray to pass; do not hit friendlies
      }
      const rc = rayCylinder(
        origin,
        dir,
        t.pos.x,
        t.pos.y,
        t.pos.z,
        C.PLAYER_RADIUS + 0.05,
        C.PLAYER_HEIGHT,
        wallDist,
      );
      if (rc && rc.t < hitDist) {
        // friendly fire guard
        if (!this.isEnemy(p, t) && !this.config.friendlyFire) continue;
        hitDist = rc.t;
        hitP = t;
        hitY = rc.y;
      }
    }
    const end = vadd(origin, vscale(dir, hitDist));
    this.pushFx("tracer", origin, p.team, d.id, undefined, end);
    if (hitP) {
      const headshot = hitY - hitP.pos.y >= C.PLAYER_HEIGHT - 0.32;
      this.pushFx("impact", end, hitP.team, d.id);
      this.applyDamage(hitP, d.damage, p, d.id, headshot, now);
    } else if (wall) {
      this.pushFx("impact", end, undefined, d.id);
    }
  }

  fireProjectileWeapon(p: PlayerState, d = weaponDef(p.weaponId), now = this.now) {
    const a = p.ammo[p.weaponId];
    if (!a || a.mag <= 0) return;
    a.mag--;
    p.lastFireAt = now;
    const origin = vadd(this.aimOrigin(p), vscale(dirFromAngles(p.yaw, p.pitch), 0.6));
    const dir = this.aimDir(p, d.spreadDeg);
    const vel = vscale(dir, d.projectileSpeed || 40);
    let target: string | undefined;
    if (d.homing) target = this.nearestEnemyInView(p, 60, 0.5)?.id;
    this.projectiles.push({
      id: this.nextProjId++,
      owner: p.id,
      team: p.team,
      weapon: d.id,
      pos: origin,
      vel,
      bornAt: now,
      life: 4000,
      homing: d.homing,
      target,
    });
    this.pushFx("muzzle", origin, p.team, d.id);
  }

  throwGrenade(p: PlayerState, input: PlayerInput, now: number) {
    const type = input.grenadeType;
    if (p.grenades[type] <= 0) return;
    p.grenades[type]--;
    const origin = vadd(this.aimOrigin(p), vscale(dirFromAngles(p.yaw, p.pitch), 0.6));
    const dir = dirFromAngles(p.yaw, p.pitch);
    const vel = vadd(vscale(dir, C.GRENADE_THROW_SPEED), v3(0, 2.5, 0));
    this.projectiles.push({
      id: this.nextProjId++,
      owner: p.id,
      team: p.team,
      weapon: type === "plasma" ? "g_plasma" : "g_frag",
      pos: origin,
      vel,
      bornAt: now,
      life: C.GRENADE_FUSE_MS,
    });
  }

  doMelee(p: PlayerState, now: number, dmg: number, range: number, lunge = false) {
    p.meleeAnim = now;
    p.lastFireAt = now;
    const origin = this.aimOrigin(p);
    const dir = dirFromAngles(p.yaw, p.pitch);
    let best: PlayerState | null = null;
    let bestD = range + (lunge ? 1.5 : 0);
    for (const t of this.players.values()) {
      if (!t.alive || t.id === p.id) continue;
      if (!this.isEnemy(p, t)) continue;
      const to = vsub(t.pos, p.pos);
      const dist = Math.hypot(to.x, to.z);
      if (dist > bestD) continue;
      const fwd = flatForward(p.yaw);
      const dot = (to.x * fwd.x + to.z * fwd.z) / (dist || 1);
      if (dot < 0.4) continue;
      if (dist < bestD) {
        bestD = dist;
        best = t;
      }
    }
    if (best) {
      // backstab assassination
      const fwdT = flatForward(best.yaw);
      const fromBehind =
        (p.pos.x - best.pos.x) * fwdT.x + (p.pos.z - best.pos.z) * fwdT.z < -0.2;
      const isAssassination = C.MELEE_BACK_INSTAKILL && fromBehind && !lunge;
      this.pushFx("melee", best.pos, p.team);
      if (lunge) {
        // sword lunge pulls attacker in
        const pull = vnorm(vsub(best.pos, p.pos));
        p.pos.x += pull.x * Math.min(bestD, 2);
        p.pos.z += pull.z * Math.min(bestD, 2);
      }
      this.applyDamage(
        best,
        isAssassination ? 9999 : dmg,
        p,
        isAssassination ? "assassin" : lunge ? "sword" : "melee",
        false,
        now,
      );
    }
  }

  // ---------------- projectiles ----------------
  stepProjectiles(dt: number, now: number) {
    const keep: ProjectileState[] = [];
    for (const pr of this.projectiles) {
      const d = pr.weapon.startsWith("g_") ? null : weaponDef(pr.weapon);
      const isGrenade = pr.weapon.startsWith("g_");
      // gravity
      if (isGrenade) pr.vel.y -= C.GRENADE_GRAVITY * dt;
      else if (d?.projectileGravity) pr.vel.y -= d.projectileGravity * dt;

      // homing
      if (pr.homing && pr.target) {
        const t = this.players.get(pr.target);
        if (t && t.alive) {
          const want = vnorm(vsub(vadd(t.pos, v3(0, 1, 0)), pr.pos));
          const cur = vnorm(pr.vel);
          const sp = vlen(pr.vel);
          const blended = vnorm(vadd(cur, vscale(want, pr.homing * dt)));
          pr.vel = vscale(blended, sp);
        }
      }

      const stepLen = vlen(pr.vel) * dt;
      const dir = vnorm(pr.vel);
      // check collisions along the step
      const wall = raycastWorld(pr.pos, dir, stepLen + 0.2, this.map);
      let hitPlayer: PlayerState | null = null;
      let hitDist = wall ? wall.t : stepLen + 0.2;
      for (const t of this.players.values()) {
        if (!t.alive || t.id === pr.owner) continue;
        if (!this.config.friendlyFire && this.sameTeam(pr.team, t.team)) continue;
        const rc = rayCylinder(
          pr.pos,
          dir,
          t.pos.x,
          t.pos.y,
          t.pos.z,
          C.PLAYER_RADIUS + 0.1,
          C.PLAYER_HEIGHT,
          hitDist,
        );
        if (rc && rc.t < hitDist) {
          hitDist = rc.t;
          hitPlayer = t;
        }
      }

      if (hitPlayer || (wall && wall.t <= stepLen)) {
        const point = vadd(pr.pos, vscale(dir, hitDist));
        this.detonate(pr, point, hitPlayer, now);
        continue; // remove projectile
      }

      // advance
      pr.pos = vadd(pr.pos, vscale(pr.vel, dt));

      // grenade fuse / projectile lifetime
      if (isGrenade) {
        if (now - pr.bornAt >= pr.life) {
          this.detonate(pr, pr.pos, null, now);
          continue;
        }
        // bounce off floor
        const ground = supportHeight(pr.pos.x, pr.pos.z, 0.2, pr.pos.y + 0.2, this.map);
        if (pr.pos.y <= ground + 0.18) {
          pr.pos.y = ground + 0.18;
          pr.vel.y = Math.abs(pr.vel.y) * 0.4;
          pr.vel.x *= 0.6;
          pr.vel.z *= 0.6;
        }
      } else if (now - pr.bornAt >= pr.life) {
        continue; // expire silently
      }
      keep.push(pr);
    }
    this.projectiles = keep;
  }

  detonate(pr: ProjectileState, point: Vec3, direct: PlayerState | null, now: number) {
    const owner = this.players.get(pr.owner);
    if (pr.weapon === "needler") {
      // stick & supercombine
      if (direct) {
        const st = this.needleStacks.get(direct.id) || { count: 0, at: now, by: pr.owner };
        st.count++;
        st.at = now;
        st.by = pr.owner;
        this.needleStacks.set(direct.id, st);
        this.pushFx("stick", point, pr.team, "needler");
        this.applyDamage(direct, weaponDef("needler").damage, owner, "needler", false, now);
        const combine = weaponDef("needler").stickCombine || 7;
        if (st.count >= combine) {
          this.needleStacks.delete(direct.id);
          this.pushFx("explosion", direct.pos, pr.team, "needler", 1.4);
          this.applyDamage(direct, weaponDef("needler").splashDamage || 70, owner, "needler_combine", false, now);
          this.splash(point, weaponDef("needler").splashRadius || 3, 30, owner, "needler", now, direct.id);
        }
      } else {
        this.pushFx("impact", point, pr.team, "needler");
        this.applyDamage(direct, 0, owner, "needler", false, now);
      }
      return;
    }
    if (pr.weapon === "g_plasma") {
      // sticky: if a player is very close, stick to them visually (already detonating on fuse)
      this.pushFx("explosion", point, pr.team, "plasma", 1.2);
      this.splash(point, C.PLASMA_RADIUS, C.PLASMA_DAMAGE, owner, "plasma_nade", now);
      return;
    }
    if (pr.weapon === "g_frag") {
      this.pushFx("explosion", point, pr.team, "frag", 1.3);
      this.splash(point, C.FRAG_RADIUS, C.FRAG_DAMAGE, owner, "frag", now);
      return;
    }
    // rocket
    if (direct) this.applyDamage(direct, weaponDef("rocket").damage, owner, "rocket_direct", false, now);
    this.pushFx("explosion", point, pr.team, "rocket", 1.6);
    this.splash(point, weaponDef("rocket").splashRadius || 5, weaponDef("rocket").splashDamage || 100, owner, "rocket", now, direct?.id);
  }

  splash(
    center: Vec3,
    radius: number,
    maxDmg: number,
    owner: PlayerState | undefined,
    weaponId: string,
    now: number,
    skipId?: string,
  ) {
    for (const t of this.players.values()) {
      if (!t.alive) continue;
      if (t.id === skipId) continue;
      if (owner && !this.config.friendlyFire && this.sameTeam(owner.team, t.team) && t.id !== owner.id)
        continue;
      const center2 = vadd(t.pos, v3(0, 0.9, 0));
      const dist = vdist(center, center2);
      if (dist > radius) continue;
      // line of sight (don't blast through walls)
      const dir = vnorm(vsub(center2, center));
      const w = raycastWorld(center, dir, dist - 0.3, this.map);
      if (w && w.t < dist - 0.4) continue;
      const falloff = 1 - dist / radius;
      const dmg = maxDmg * (0.35 + 0.65 * falloff);
      // self damage reduced
      const self = owner && owner.id === t.id ? 0.5 : 1;
      this.applyDamage(t, dmg * self, owner, weaponId, false, now);
    }
  }

  // ---------------- damage & death ----------------
  applyDamage(
    target: PlayerState | null | undefined,
    baseAmount: number,
    attacker: PlayerState | undefined,
    weaponId: string,
    headshot: boolean,
    now: number,
  ) {
    if (!target || !target.alive) return;
    if (now < target.spawnProtectUntil) return;
    if (this.phase !== "live") return;
    if (
      attacker &&
      attacker.id !== target.id &&
      this.sameTeam(attacker.team, target.team) &&
      !this.config.friendlyFire
    )
      return;

    const def = this.weaponForDamage(weaponId);
    let dmg = baseAmount;
    if (attacker && attacker.powerups.damage && attacker.powerups.damage > now)
      dmg *= C.DAMAGE_MULT;

    const shieldMult = def?.shieldMult ?? 1;
    const healthMult = def?.healthMult ?? 1;
    const hadShield = target.shield > 0;

    let toShield = dmg * shieldMult;
    if (target.shield > 0) {
      if (toShield >= target.shield) {
        const shieldBase = target.shield / shieldMult;
        const overflowBase = dmg - shieldBase;
        target.shield = 0;
        this.pushFx("shieldpop", vadd(target.pos, v3(0, 1, 0)), target.team);
        let hd = overflowBase * healthMult;
        if (headshot) hd *= def?.headshotMult ?? 1;
        target.health -= hd;
      } else {
        target.shield -= toShield;
      }
    } else {
      let hd = dmg * healthMult;
      if (headshot) hd *= def?.headshotMult ?? 1;
      target.health -= hd;
    }

    target.lastDamageAt = now;
    target.hitFlash = 1;
    const killed = target.health <= 0;
    const shieldBreak = hadShield && target.shield <= 0;
    if (attacker && attacker.id !== target.id) {
      target.lastAttacker = attacker.id;
      target.recentDamagers[attacker.id] = now;
      this.hits.push({
        id: this.nextEventId++,
        attacker: attacker.id,
        victim: target.id,
        amount: Math.round(dmg),
        headshot,
        killed,
        shieldBreak,
        ts: now,
      });
      if (this.hits.length > 64) this.hits.shift();
    }
    if (killed) {
      this.killPlayer(target, attacker, weaponId, headshot, now);
    }
  }

  weaponForDamage(weaponId: string) {
    const map: Record<string, string> = {
      rocket_direct: "rocket",
      rocket: "rocket",
      frag: "ar",
      plasma_nade: "plasma",
      needler_combine: "needler",
      sword: "sword",
      assassin: "sword",
      melee: "ar",
      void: "ar",
    };
    const id = map[weaponId] || weaponId;
    return weaponDef(id);
  }

  killPlayer(
    victim: PlayerState,
    attacker: PlayerState | undefined,
    weaponId: string,
    headshot: boolean,
    now: number,
  ) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.health = 0;
    victim.shield = 0;
    victim.deaths++;
    victim.respawnAt = now + C.RESPAWN_MS;
    victim.streak = 0;
    this.needleStacks.delete(victim.id);
    this.dropOddball(victim);
    if (victim.vehicleId) {
      const ve = this.vehicles.find((x) => x.id === victim.vehicleId);
      if (ve) {
        if (ve.driver === victim.id) ve.driver = null;
        if (ve.gunner === victim.id) ve.gunner = null;
      }
      victim.vehicleId = null;
      victim.vehicleSeat = undefined;
    }
    this.pushFx("death", vadd(victim.pos, v3(0, 0.8, 0)), victim.team);

    const betrayal =
      attacker && attacker.id !== victim.id && this.sameTeam(attacker.team, victim.team);
    const suicide = !attacker || attacker.id === victim.id;

    const medals: string[] = [];
    if (attacker && !suicide && !betrayal) {
      attacker.kills++;
      attacker.streak++;
      if (this.config.mode === "slayer" || this.config.mode === "team") {
        attacker.score++;
        if (this.config.mode === "team") this.teamScore[attacker.team as "red" | "blue"]++;
      }
      // multikill
      const mk = this.multi.get(attacker.id);
      if (mk && now - mk.at <= C.MULTIKILL_WINDOW_MS) {
        mk.count++;
        mk.at = now;
      } else {
        this.multi.set(attacker.id, { count: 1, at: now });
      }
      const mkc = this.multi.get(attacker.id)!.count;
      const mkName = MULTIKILL_NAMES[Math.min(mkc, MULTIKILL_NAMES.length - 1)];
      if (mkc >= 2 && mkName) {
        medals.push(mkName);
        this.announce(mkName.toUpperCase(), MULTIKILL_SUB[Math.min(mkc, MULTIKILL_SUB.length - 1)], true, attacker.id);
      }
      // sprees
      if (C.SPREE_THRESHOLDS.includes(attacker.streak)) {
        const idx = C.SPREE_THRESHOLDS.indexOf(attacker.streak);
        const name = SPREE_NAMES[Math.min(idx, SPREE_NAMES.length - 1)];
        medals.push(name);
        this.announce(name.toUpperCase(), `${attacker.streak} kills, zero chill`, true, attacker.id);
      }
      // special medals
      const wd = this.weaponForDamage(weaponId);
      if (weaponId === "assassin") medals.push("Backstab Boutique");
      else if (weaponId === "sword") medals.push("Buttered");
      else if (wd.id === "sniper" && headshot) medals.push("Sharpshooter (clearance)");
      else if (headshot) medals.push("Headshot");
      else if (wd.id === "shotgun") medals.push("Hug Specialist");
      else if (weaponId === "splatter") medals.push("Road Rage (clearance)");
      else if (weaponId.startsWith("rocket")) medals.push("Boom Tube Bargain");
      else if (weaponId === "needler_combine") medals.push("Pink Mist (off-brand)");
      else if (weaponId.startsWith("plasma") || weaponId === "frag") medals.push("Discount Demolition");
      // first blood
      if (this.totalKills() === 0) medals.push("First Blood (overpriced)");
      // revenge
      if (victim.id === attacker.lastAttacker) medals.push("Revenge (pettiness +5)");
      // assists
      for (const id in victim.recentDamagers) {
        if (id === attacker.id) continue;
        if (now - victim.recentDamagers[id] > C.ASSIST_WINDOW_MS) continue;
        const helper = this.players.get(id);
        if (helper && !this.sameTeam(helper.team, victim.team)) helper.assists++;
      }
    } else if (betrayal && attacker) {
      attacker.score = Math.max(0, attacker.score - 1);
      this.announce("BETRAYAL", "Team-kill discount applied", false, attacker.id);
      medals.push("Betrayal");
    } else if (suicide) {
      victim.score = Math.max(0, victim.score - 1);
      this.announce("OOPS", "You played yourself", false, victim.id);
    }

    const ke: KillEvent = {
      id: this.nextEventId++,
      killer: attacker ? attacker.id : "world",
      victim: victim.id,
      weapon: weaponId,
      headshot,
      medal: medals[0],
      ts: now,
    };
    this.killFeed.push(ke);
    while (this.killFeed.length > C.KILLFEED_KEEP) this.killFeed.shift();

    // ---- skull modifiers on death ----
    if (this.hasSkull("boom")) {
      const at = vadd(victim.pos, v3(0, 0.8, 0));
      this.pushFx("explosion", at, victim.team, "frag", 1.2);
      this.splash(at, C.FRAG_RADIUS * 0.9, C.FRAG_DAMAGE, undefined, "frag", now, victim.id);
    }
    if (this.hasSkull("birthday") && headshot) {
      this.pushFx("confetti", vadd(victim.pos, v3(0, 1.4, 0)), attacker?.team);
      this.announce("GRUNT BIRTHDAY PARTY", "🎉 surprise!", true, attacker?.id);
    }

    // ---- infection: a fallen survivor joins the horde ----
    if (this.config.mode === "infection" && !victim.infected) {
      victim.infected = true;
      victim.team = "red";
      this.teamScore.red += 1;
      if (attacker && attacker.id !== victim.id) attacker.score++;
      this.announce("VALUE-ACQUIRED", "you have been infected", true, victim.id);
    }

    this.checkWin(now);
  }

  totalKills() {
    let n = 0;
    for (const p of this.players.values()) n += p.kills;
    return n;
  }

  // ---------------- pickups ----------------
  stepPickups(now: number) {
    for (const pk of this.pickups) {
      if (!pk.available && now >= pk.readyAt) pk.available = true;
    }
  }

  tryPickup(p: PlayerState, now: number) {
    for (const pk of this.pickups) {
      if (!pk.available) continue;
      if (vdist(p.pos, pk.pos) > 2.4) continue;
      if (Math.abs(p.pos.y - pk.pos.y) > 2.6) continue;
      if (pk.kind === "weapon") {
        this.giveWeapon(p, pk.what);
      } else {
        this.givePowerup(p, pk.what as PowerupId, now);
      }
      pk.available = false;
      const def = this.map.pickups.find((m) => m.id === pk.id);
      pk.readyAt = now + (def?.respawnMs || 30000);
      this.pushFx("pickup", pk.pos, p.team);
      this.announce("PICKED UP", this.pickupLabel(pk.what), false, p.id);
    }
  }

  pickupLabel(what: string) {
    if (POWERUP_LABELS[what]) return POWERUP_LABELS[what];
    return weaponDef(what).name;
  }

  giveWeapon(p: PlayerState, weaponId: string) {
    const d = weaponDef(weaponId);
    // power weapons replace the current slot (keep sidearm)
    if (p.weapons.includes(weaponId)) {
      // refill
      p.ammo[weaponId] = { mag: d.magSize, reserve: Math.min(d.reserveMax, d.magSize * 3) };
      p.weaponId = weaponId;
      return;
    }
    // replace the non-sidearm slot, or current
    const idx = p.weapons.findIndex((w) => weaponDef(w).slot !== "sidearm");
    const slot = idx >= 0 ? idx : 0;
    p.weapons[slot] = weaponId;
    p.weaponId = weaponId;
    p.ammo[weaponId] = { mag: d.magSize, reserve: Math.min(d.reserveMax, d.magSize * 3) };
  }

  givePowerup(p: PlayerState, id: PowerupId, now: number) {
    if (id === "overshield") {
      p.shield = C.MAX_SHIELD + C.OVERSHIELD_AMOUNT;
    } else {
      p.powerups[id] = now + C.POWERUP_DURATION_MS;
    }
  }

  expirePowerups(p: PlayerState, now: number) {
    for (const k of Object.keys(p.powerups) as PowerupId[]) {
      if ((p.powerups[k] || 0) <= now) delete p.powerups[k];
    }
    // overshield decay toward max
    if (p.shield > p.maxShield) {
      p.shield = Math.max(p.maxShield, p.shield - 4 * (1 / C.TICK_HZ));
    }
  }

  swapWeapon(p: PlayerState) {
    if (p.weapons.length < 2) return;
    const cur = p.weapons.indexOf(p.weaponId);
    const next = (cur + 1) % p.weapons.length;
    p.weaponId = p.weapons[next];
    p.reloadUntil = 0;
    p.burstLeft = 0;
    p.fireReadyAt = Math.max(p.fireReadyAt, this.now + 250);
  }

  // ---------------- helpers ----------------
  nearestEnemyInView(p: PlayerState, range: number, minDot: number): PlayerState | null {
    const eye = this.aimOrigin(p);
    const look = dirFromAngles(p.yaw, p.pitch);
    let best: PlayerState | null = null;
    let bestScore = -Infinity;
    for (const t of this.players.values()) {
      if (!t.alive || t.id === p.id || !this.isEnemy(p, t)) continue;
      const to = vsub(vadd(t.pos, v3(0, 1, 0)), eye);
      const dist = vlen(to);
      if (dist > range) continue;
      const dot = (to.x * look.x + to.y * look.y + to.z * look.z) / (dist || 1);
      if (dot < minDot) continue;
      const score = dot - dist / range;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  cleanNeedles(now: number) {
    for (const [id, st] of this.needleStacks) {
      if (now - st.at > 3000) this.needleStacks.delete(id);
    }
  }

  dropOddball(p?: PlayerState | null) {
    if (!p) return;
    if (this.oddballCarrier === p.id) {
      this.oddballCarrier = null;
      this.oddballPos = vadd(p.pos, v3(0, 1, 0));
      p.carryingOddball = false;
    }
  }

  // ---------------- vehicles (Wartrolley) ----------------
  handleVehicleEntry(p: PlayerState, input: PlayerInput, prev: PlayerInput, now: number) {
    if (p.isBot) return; // carts are a human toy in v1
    if (!input.pickup || prev.pickup) return; // rising edge of E
    if (p.vehicleId) {
      const v = this.vehicles.find((x) => x.id === p.vehicleId);
      if (v) {
        if (v.driver === p.id) v.driver = null;
        if (v.gunner === p.id) v.gunner = null;
        const side = flatRight(v.yaw);
        p.pos = {
          x: v.pos.x + side.x * (C.VEHICLE_RADIUS + 0.9),
          y: v.pos.y,
          z: v.pos.z + side.z * (C.VEHICLE_RADIUS + 0.9),
        };
        p.pos.y = supportHeight(p.pos.x, p.pos.z, C.PLAYER_RADIUS, p.pos.y + 0.6, this.map);
        p.vel = v3();
      }
      p.vehicleId = null;
      p.vehicleSeat = undefined;
      return;
    }
    // board the nearest cart with a free seat
    let best: VehicleState | null = null;
    let bestD = 3.4;
    for (const v of this.vehicles) {
      if (v.driver && v.gunner) continue;
      const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    if (!best) return;
    if (!best.driver) {
      best.driver = p.id;
      p.vehicleSeat = "driver";
    } else {
      best.gunner = p.id;
      p.vehicleSeat = "gunner";
    }
    p.vehicleId = best.id;
  }

  stepVehicles(dt: number, now: number) {
    for (const v of this.vehicles) {
      // detach dead / stale occupants
      const dCheck = v.driver ? this.players.get(v.driver) : null;
      if (v.driver && (!dCheck || !dCheck.alive || dCheck.vehicleId !== v.id)) v.driver = null;
      const gCheck = v.gunner ? this.players.get(v.gunner) : null;
      if (v.gunner && (!gCheck || !gCheck.alive || gCheck.vehicleId !== v.id)) v.gunner = null;

      const drv = v.driver ? this.players.get(v.driver) || null : null;

      // ---- drive ----
      const fwd = flatForward(v.yaw);
      let throttle = 0;
      let steer = 0;
      if (drv) {
        const di = this.inputs.get(drv.id) || emptyInput();
        throttle = clamp(di.moveZ, -1, 1);
        steer = clamp(di.moveX, -1, 1);
      }
      const speed = Math.hypot(v.vel.x, v.vel.z);
      // steering scales with speed (a parked cart barely turns); reversed in reverse
      v.yaw -= steer * C.VEHICLE_TURN_RATE * dt * clamp(speed / 6, 0.12, 1.2) * (throttle < -0.1 ? -1 : 1);
      if (throttle !== 0) {
        const accel = C.VEHICLE_ACCEL * throttle;
        v.vel.x += fwd.x * accel * dt;
        v.vel.z += fwd.z * accel * dt;
      } else {
        const f = Math.max(0, 1 - C.VEHICLE_FRICTION * dt);
        v.vel.x *= f;
        v.vel.z *= f;
      }
      const sp = Math.hypot(v.vel.x, v.vel.z);
      const cap = throttle < 0 ? C.VEHICLE_REVERSE_SPEED : C.VEHICLE_MAX_SPEED;
      if (sp > cap) {
        v.vel.x = (v.vel.x / sp) * cap;
        v.vel.z = (v.vel.z / sp) * cap;
      }
      v.vel.y -= C.GRAVITY * dt;
      moveAndCollide(v.pos, v.vel, C.VEHICLE_RADIUS, C.VEHICLE_HEIGHT, dt, this.map);
      const lim = this.map.size - 1.2;
      v.pos.x = clamp(v.pos.x, -lim, lim);
      v.pos.z = clamp(v.pos.z, -lim, lim);
      v.wheelSpin += (throttle >= 0 ? 1 : -1) * Math.hypot(v.vel.x, v.vel.z) * dt * 2;

      // ---- splatter anyone in the way at speed ----
      if (Math.hypot(v.vel.x, v.vel.z) > C.VEHICLE_SPLATTER_SPEED) {
        const reach = (C.VEHICLE_RADIUS + C.PLAYER_RADIUS) ** 2;
        for (const t of this.players.values()) {
          if (!t.alive || t.vehicleId === v.id) continue;
          if (now < t.spawnProtectUntil) continue;
          if (Math.abs(t.pos.y - v.pos.y) > 2) continue;
          const dx = t.pos.x - v.pos.x;
          const dz = t.pos.z - v.pos.z;
          if (dx * dx + dz * dz < reach) {
            if (drv && !this.isEnemy(drv, t) && !this.config.friendlyFire) continue;
            this.pushFx("splatter", vadd(t.pos, v3(0, 0.8, 0)), drv?.team);
            this.applyDamage(t, 9999, drv || undefined, "splatter", false, now);
          }
        }
      }

      // ---- seat occupants + cannon ----
      this.seatOccupant(v, v.driver, "driver");
      this.seatOccupant(v, v.gunner, "gunner");
      for (const shooterId of [v.driver, v.gunner]) {
        if (!shooterId) continue;
        const s = this.players.get(shooterId);
        if (!s) continue;
        const si = this.inputs.get(s.id) || emptyInput();
        if (si.fire && now >= v.fireReadyAt) {
          this.fireVehicleCannon(v, s, now);
          v.fireReadyAt = now + 60000 / C.VEHICLE_CANNON_RPM;
        }
        s.firing = si.fire;
      }
    }
  }

  private seatOccupant(v: VehicleState, id: string | null, seat: "driver" | "gunner") {
    if (!id) return;
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const back = seat === "gunner" ? -1 : 0.2;
    const fwd = flatForward(v.yaw);
    p.pos = { x: v.pos.x + fwd.x * back, y: v.pos.y, z: v.pos.z + fwd.z * back };
    p.vel = { ...v.vel };
    p.grounded = true;
    p.moving = Math.hypot(v.vel.x, v.vel.z) > 0.6;
  }

  private fireVehicleCannon(v: VehicleState, shooter: PlayerState, now: number) {
    const d = weaponDef("turret");
    const eye = v3(shooter.pos.x, shooter.pos.y + C.VEHICLE_SEAT_EYE, shooter.pos.z);
    const origin = vadd(eye, vscale(dirFromAngles(shooter.yaw, shooter.pitch), 1.2));
    this.pushFx("muzzle", origin, shooter.team, "turret");
    this.resolveHitscanRay(shooter, d, origin, this.aimDir(shooter, d.spreadDeg), now);
    shooter.lastFireAt = now;
  }

  // ---------------- modes ----------------
  stepMode(dt: number, now: number) {
    if (this.config.mode === "koth" && this.map.hill) {
      if (now >= this.hillMoveAt && this.map.hill.moves && this.map.hill.moves.length > 1) {
        this.hillIndex = (this.hillIndex + 1) % this.map.hill.moves.length;
        this.hillPos = { ...this.map.hill.moves[this.hillIndex] };
        this.hillMoveAt = now + 45000;
        this.announce("HILL MOVED", "Chase the discount zone", false);
      }
      const r = this.map.hill.radius;
      const present = new Set<Team>();
      const occupants: PlayerState[] = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (vdist(p.pos, this.hillPos) <= r && Math.abs(p.pos.y - this.hillPos.y) < 3) {
          occupants.push(p);
          present.add(p.team);
        }
      }
      let controller: Team | null = null;
      if (this.config.mode === "koth") {
        if (occupants.length) {
          if (this.config.friendlyFire || true) {
            // team koth: a team controls if it's the only team present
            const teams = new Set(occupants.map((o) => o.team));
            if (teams.size === 1) controller = occupants[0].team;
          }
        }
      }
      this.hillController = controller;
      if (controller) {
        if (controller === "red" || controller === "blue") {
          this.teamScore[controller] += dt;
        }
        for (const o of occupants) if (o.team === controller) o.score += dt;
        this.hillProgress = Math.min(1, this.hillProgress + dt * 0.2);
        if (Math.max(this.teamScore.red, this.teamScore.blue) >= this.config.scoreLimit) {
          this.endMatch("score");
        }
        // FFA koth: top occupant scores
        if (controller === "ffa") {
        }
      } else {
        this.hillProgress = Math.max(0, this.hillProgress - dt * 0.1);
      }
      // ffa koth handled by per-player score above when single player in zone
      if (this.config.mode === "koth" && occupants.length === 1) {
        occupants[0].score += dt;
        if (occupants[0].score >= this.config.scoreLimit) this.endMatch("score");
      }
    }

    if (this.config.mode === "oddball") {
      // pickup
      if (!this.oddballCarrier) {
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if (vdist(p.pos, this.oddballPos) < 1.6) {
            this.oddballCarrier = p.id;
            p.carryingOddball = true;
            this.announce("BALL SECURED", `${p.name} has the ball`, false);
            break;
          }
        }
      } else {
        const carrier = this.players.get(this.oddballCarrier);
        if (carrier && carrier.alive) {
          this.oddballPos = vadd(carrier.pos, v3(0, 1.2, 0));
          carrier.score += dt;
          if (carrier.team === "red" || carrier.team === "blue") this.teamScore[carrier.team] += dt;
          if (carrier.score >= this.config.scoreLimit) this.endMatch("score");
        } else {
          this.oddballCarrier = null;
        }
      }
    }

    if (this.config.mode === "infection") {
      let survivors = 0;
      for (const p of this.players.values()) {
        if (p.infected) continue;
        survivors++;
        if (p.alive) {
          p.score += dt;
          this.teamScore.blue += dt;
        }
      }
      if (survivors === 1 && !this._announcedLast) {
        this._announcedLast = true;
        this.announce("LAST SHOPPER STANDING", "everyone wants what's in your cart", true);
      }
      if (survivors === 0) this.endMatch("score");
    }

    // slayer/team win by kills handled in killPlayer via checkWin
  }

  checkWin(now: number) {
    if (this.phase !== "live") return;
    if (this.config.mode === "slayer") {
      for (const p of this.players.values()) {
        if (p.kills >= this.config.scoreLimit) return this.endMatch("score");
      }
    } else if (this.config.mode === "team") {
      if (this.teamScore.red >= this.config.scoreLimit || this.teamScore.blue >= this.config.scoreLimit)
        return this.endMatch("score");
    }
  }

  endMatch(reason: "score" | "time") {
    this.phase = "over";
    this.winner = this.computeWinner();
    let wname: string;
    let sub: string;
    if (this.config.mode === "infection") {
      wname = this.winner === "red" ? "THE HORDE WINS" : "SURVIVORS WIN";
      sub = this.winner === "red" ? "everyone got value-acquired" : "you outlasted the doorbusters";
    } else if (this.usesTeams()) {
      wname = this.winner === "red" ? "RED WINS" : this.winner === "blue" ? "BLUE WINS" : "DRAW";
      sub = reason === "time" ? "Time! (clock was also clearance)" : "Score limit reached";
    } else {
      wname = `${this.winnerName()} WINS`;
      sub = reason === "time" ? "Time! (clock was also clearance)" : "Score limit reached";
    }
    this.announce(wname, sub, true);
  }

  usesTeams() {
    return this.config.mode === "team" || this.config.mode === "infection";
  }

  computeWinner(): Team | string | null {
    if (this.config.mode === "infection") {
      const anySurvivor = [...this.players.values()].some((p) => !p.infected);
      return anySurvivor ? "blue" : "red";
    }
    if (this.config.mode === "team") {
      if (this.teamScore.red === this.teamScore.blue) return null;
      return this.teamScore.red > this.teamScore.blue ? "red" : "blue";
    }
    // FFA-ish: highest score
    let best: PlayerState | null = null;
    for (const p of this.players.values()) {
      if (!best || p.score > best.score) best = p;
    }
    return best ? best.id : null;
  }
  winnerName() {
    const id = this.computeWinner();
    const p = id ? this.players.get(id as string) : null;
    return p ? p.name : "NOBODY";
  }

  modeName() {
    return (
      {
        slayer: "SLAYER — every Spartan for themselves",
        team: "TEAM SLAYER — red vs blue",
        koth: "KING OF THE HILL — hold the discount zone",
        oddball: "ODDBALL — hold the cursed ball",
        infection: "BLACK FRIDAY — survive the doorbuster horde",
      } as Record<string, string>
    )[this.config.mode];
  }

  // ---------------- events ----------------
  pushFx(kind: FxEvent["kind"], pos: Vec3, team?: Team, weapon?: string, scale?: number, pos2?: Vec3) {
    this.fx.push({
      id: this.nextEventId++,
      kind,
      pos: { ...pos },
      pos2: pos2 ? { ...pos2 } : undefined,
      team,
      weapon,
      scale,
      ts: this.now,
    });
    if (this.fx.length > C.FX_KEEP) this.fx.shift();
  }

  announce(text: string, sub?: string, big?: boolean, forId?: string) {
    this.announces.push({ id: this.nextEventId++, text, sub, big, ts: this.now, forId });
    if (this.announces.length > 24) this.announces.shift();
  }

  // ---------------- snapshot ----------------
  snapshot(forId?: string): Snapshot {
    const players = [...this.players.values()].map((p) => ({
      ...p,
      pos: { ...p.pos },
      vel: { ...p.vel },
      ammo: p.ammo,
    }));
    const snap: Snapshot = {
      t: this.now,
      tick: this.tick,
      phase: this.phase,
      mode: this.config.mode,
      mapId: this.map.id,
      timeLeftMs: Math.max(0, this.endsAt - this.now),
      scoreLimit: this.config.scoreLimit,
      teamScore: { red: Math.floor(this.teamScore.red), blue: Math.floor(this.teamScore.blue) },
      players,
      projectiles: this.projectiles.map((p) => ({ ...p, pos: { ...p.pos }, vel: { ...p.vel } })),
      vehicles: this.vehicles.map((v) => ({ ...v, pos: { ...v.pos }, vel: { ...v.vel } })),
      pickups: this.pickups.map((p) => ({ ...p, pos: { ...p.pos } })),
      kills: this.killFeed.slice(),
      hits: this.hits.slice(),
      fx: this.fx.slice(),
      announces: this.announces.slice(),
      winner: this.winner,
    };
    if (this.map.hill) {
      snap.hill = {
        pos: { ...this.hillPos },
        radius: this.map.hill.radius,
        controller: this.hillController,
        progress: this.hillProgress,
      };
    }
    if (this.map.oddballSpawn) {
      snap.oddball = { pos: { ...this.oddballPos }, carrier: this.oddballCarrier };
    }
    return snap;
  }

  // drain transient events after broadcasting
  drainEvents() {
    this.fx = [];
    this.announces = [];
    this.hits = [];
  }
}

// helper cross without importing more
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MULTIKILL_NAMES = [
  "",
  "",
  "Double Kill",
  "Triple Kill",
  "Overkill",
  "Killtacular",
  "Killtrocity",
  "Killimanjaro",
  "Killtastrophe",
  "Killpocalypse",
  "Killionaire",
];
const MULTIKILL_SUB = [
  "",
  "",
  "buy one get one free",
  "the hat trick (knockoff)",
  "someone call HR",
  "absolutely uncalled for",
  "this is a problem",
  "scaling a mountain of regret",
  "catastrophic value",
  "the apocalypse, but cheaper",
  "you broke the budget",
];
const SPREE_NAMES = [
  "Killing Spree",
  "Killing Frenzy",
  "Running Riot",
  "Rampage",
  "Untouchable",
  "Invincible (probably)",
];

const POWERUP_LABELS: Record<string, string> = {
  overshield: "Off-brand Overshield",
  speed: "Definitely-Legal Speed Boost",
  damage: "Damage Boost (questionable)",
  camo: "Active Camo (mostly works)",
};

// botThink is imported lazily to avoid a static import cycle.
let _botThink: ((e: Engine, p: PlayerState, now: number) => void) | null = null;
export function registerBotThink(fn: (e: Engine, p: PlayerState, now: number) => void) {
  _botThink = fn;
}
function botThink(e: Engine, p: PlayerState, now: number) {
  if (_botThink) _botThink(e, p, now);
}
