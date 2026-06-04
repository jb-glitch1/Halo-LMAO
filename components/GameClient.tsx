"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import HUD, { HudModel, RadarBlip, KillRow, ScoreRow } from "./HUD";
import { Renderer, type GraphicsQuality } from "@/game/renderer";
import { InputManager } from "@/game/input";
import { getAudio } from "@/game/audio";
import { weaponDef } from "@/game/weapons";
import { MAX_SHIELD } from "@/game/constants";
import { GUN_LADDER } from "@/game/engine";
import type { SessionLike } from "@/game/net";
import type { Snapshot, PlayerState } from "@/game/types";

interface Props {
  session: SessionLike;
  localId: string;
  online: boolean;
  isHost: boolean;
  onLeave: () => void;
  onReturnLobby?: () => void;
  onReplay?: () => void;
}

const MODE_LABEL: Record<string, string> = {
  slayer: "SLAYER", team: "TEAM SLAYER", koth: "KING OF THE HILL", oddball: "ODDBALL",
};
const POWERUP_COLOR: Record<string, string> = { overshield: "#36e7ff", speed: "#ffcf4d", damage: "#ff4d5e", camo: "#b06bff" };

function hexc(n: number) { return "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6); }
function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

const SETTINGS_KEY = "lmao_settings";
function loadSettings(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function GameClient({ session, localId, online, isHost, onLeave, onReturnLobby, onReplay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const imRef = useRef<InputManager | null>(null);
  const rafRef = useRef<number>(0);

  const [hud, setHud] = useState<HudModel | null>(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [endInfo, setEndInfo] = useState<{ winnerText: string; roster: ScoreRow[]; useTeams: boolean; teamScore: { red: number; blue: number } } | null>(null);
  const [scoreboard, setScoreboard] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sens, setSens] = useState<number>(() => loadSettings().sens ?? 2.3);
  const [vol, setVol] = useState<number>(() => loadSettings().vol ?? 0.7);
  const [gfx, setGfx] = useState<GraphicsQuality>(() => loadSettings().gfx ?? "high");
  const [announcer, setAnnouncer] = useState<"cashier" | "infomercial" | "manager">(() => loadSettings().announcer ?? "cashier");
  const [fov, setFov] = useState<number>(() => loadSettings().fov ?? 78);
  const [invertY, setInvertY] = useState<boolean>(() => loadSettings().invertY ?? false);
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => loadSettings().reduceMotion ?? (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [colorblind, setColorblind] = useState<boolean>(() => loadSettings().colorblind ?? false);
  const colorblindRef = useRef(colorblind);
  const liveRef = useRef(false);

  // event-dedupe + transient refs
  const lastFx = useRef(0);
  const lastHit = useRef(0);
  const lastAnn = useRef(0);
  const hitmarker = useRef({ active: false, headshot: false, killed: false, ts: 0 });
  const medals = useRef<{ id: number; text: string; sub?: string; big?: boolean; ts: number }[]>([]);
  const banner = useRef<{ text: string; sub?: string; ts: number } | null>(null);
  const prevHp = useRef(200);
  const dmgDir = useRef<{ ang: number; ts: number } | null>(null);
  const fpsRef = useRef({ frames: 0, last: 0, fps: 0 });
  const endedRef = useRef(false);
  const pausedRef = useRef(false);
  const sbRef = useRef(false);

  const audio = getAudio();

  // ---- mount ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new Renderer(canvas, gfx);
    renderer.setMap(session.map);
    rendererRef.current = renderer;
    liveRef.current = false;
    audio.ambience(true); // choir swell over the warmup
    const im = new InputManager(canvas);
    imRef.current = im;
    im.setSensitivity((sens / 1000));

    im.onPause = () => {
      if (!endedRef.current) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    im.onLockChange = (locked) => {
      if (locked) {
        pausedRef.current = false;
        setPaused(false);
        audio.resume();
      }
    };

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Tab") { e.preventDefault(); sbRef.current = true; setScoreboard(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Tab") { sbRef.current = false; setScoreboard(false); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    let last = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dtMs = Math.min(50, now - last);
      last = now;

      const im = imRef.current!;
      const input = im.poll();
      session.update(dtMs, now, input);
      const snap = session.getSnapshot();
      const local = session.getLocalRender();

      if (snap) {
        renderer.applySnapshot(snap, localId, session.localTeam);
        processEvents(snap, local, now);
        if (snap.phase === "live" && !liveRef.current) {
          liveRef.current = true;
          audio.ambience(false); // cut the choir when the fight starts
        }
        if (snap.phase === "over" && !endedRef.current) {
          endedRef.current = true;
          handleEnd(snap);
        }
      }
      renderer.renderFrame(local, dtMs / 1000, now);

      // fps
      const f = fpsRef.current;
      f.frames++;
      if (now - f.last > 500) { f.fps = Math.round((f.frames * 1000) / (now - f.last)); f.frames = 0; f.last = now; }

      // HUD ~22Hz
      if (now - hudClock.current > 45) {
        hudClock.current = now;
        if (snap) setHud(buildHud(snap, local, input, now));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      im.unbind();
      renderer.dispose();
      audio.ambience(false);
      session.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hudClock = useRef(0);

  // apply settings
  useEffect(() => { imRef.current?.setSensitivity(sens / 1000); }, [sens]);
  useEffect(() => { audio.setVolume(vol); }, [vol, audio]);
  useEffect(() => { rendererRef.current?.setQuality(gfx); }, [gfx]);
  useEffect(() => { audio.setAnnouncerStyle(announcer); }, [announcer, audio]);
  useEffect(() => { rendererRef.current?.setFov(fov); }, [fov]);
  useEffect(() => { imRef.current?.setInvertY(invertY); }, [invertY]);
  useEffect(() => { rendererRef.current?.setReduceMotion(reduceMotion); }, [reduceMotion]);
  useEffect(() => { colorblindRef.current = colorblind; }, [colorblind]);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sens, vol, gfx, announcer, fov, invertY, reduceMotion, colorblind }));
    } catch { /* storage unavailable */ }
  }, [sens, vol, gfx, announcer, fov, invertY, reduceMotion, colorblind]);

  const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  const processEvents = useCallback((snap: Snapshot, local: { pos: { x: number; y: number; z: number }; yaw: number }, now: number) => {
    const camPos = local.pos;
    const cy = Math.cos(local.yaw), sy = Math.sin(local.yaw);
    // left/right pan of a world point relative to where we're looking
    const panOf = (p: { x: number; z: number }) => {
      const dx = p.x - camPos.x, dz = p.z - camPos.z;
      const dh = Math.hypot(dx, dz) || 1;
      return Math.max(-1, Math.min(1, (dx * cy + dz * -sy) / dh)) * 0.85;
    };
    // fx sounds
    for (const fx of snap.fx) {
      if (fx.id <= lastFx.current) continue;
      const d = dist(camPos, fx.pos);
      const pan = panOf(fx.pos);
      switch (fx.kind) {
        case "muzzle": if (fx.weapon) audio.weapon(fx.weapon, d, pan); break;
        case "explosion": audio.sfx("explosion", d, pan); break;
        case "shieldpop": audio.sfx("shieldbreak", d, pan); break;
        case "melee": audio.weapon("sword", d, pan); break;
        case "lift": audio.sfx("lift", d, pan); break;
        case "pickup": audio.sfx("pickup", d, pan); break;
        case "spawn": if (d < 4) audio.sfx("spawn", 0); break;
        case "death": audio.sfx("death", d, pan); break;
        case "splatter": audio.sfx("splatter", d, pan); break;
        case "confetti": audio.sfx("confetti", d, pan); break;
      }
    }
    if (snap.fx.length) lastFx.current = Math.max(lastFx.current, snap.fx[snap.fx.length - 1].id);

    // hits → hitmarker
    for (const h of snap.hits) {
      if (h.id <= lastHit.current) continue;
      if (h.attacker === localId) {
        hitmarker.current = { active: true, headshot: h.headshot, killed: h.killed, ts: now };
        audio.sfx(h.killed ? "kill" : "hit");
      }
    }
    if (snap.hits.length) lastHit.current = Math.max(lastHit.current, snap.hits[snap.hits.length - 1].id);

    // announces → medals / banner
    for (const a of snap.announces) {
      if (a.id <= lastAnn.current) continue;
      if (a.forId && a.forId !== localId) continue;
      if (a.forId === localId) {
        medals.current.push({ id: a.id, text: a.text, sub: a.sub, big: a.big, ts: now });
        audio.announce(a.text);
      } else {
        banner.current = { text: a.text, sub: a.sub, ts: now };
        if (a.big) audio.sfx("go");
      }
    }
    if (snap.announces.length) lastAnn.current = Math.max(lastAnn.current, snap.announces[snap.announces.length - 1].id);
  }, [audio, localId]);

  const nameOf = (snap: Snapshot, id: string) => snap.players.find((p) => p.id === id)?.name || (id === "world" ? "the void" : "someone");

  const buildHud = useCallback((snap: Snapshot, local: ReturnType<SessionLike["getLocalRender"]>, input: ReturnType<InputManager["poll"]>, now: number): HudModel => {
    const self = snap.players.find((p) => p.id === localId);
    const def = weaponDef(local.weaponId);
    const ammo = self?.ammo[local.weaponId] || { mag: 0, reserve: 0 };
    const reloading = self && self.reloadUntil > snap.t && def.reloadMs > 0 ? 1 - (self.reloadUntil - snap.t) / def.reloadMs : 0;

    // damage detection (sfx + directional indicator)
    const hp = (self?.health ?? 0) + (self?.shield ?? 0);
    if (self?.alive && hp < prevHp.current - 1) {
      audio.sfx("damage");
      const atk = self.lastAttacker ? snap.players.find((p) => p.id === self.lastAttacker) : undefined;
      if (atk && atk.id !== localId) {
        const dx = atk.pos.x - self.pos.x, dz = atk.pos.z - self.pos.z;
        const cyy = Math.cos(local.yaw), syy = Math.sin(local.yaw);
        const fwd = -(dx * -syy + dz * -cyy);
        const rgt = dx * cyy + dz * -syy;
        dmgDir.current = { ang: Math.atan2(rgt, fwd), ts: now };
      }
    }
    prevHp.current = self?.alive ? hp : 200;

    // radar
    const range = 30;
    const cy = Math.cos(local.yaw), sy = Math.sin(local.yaw);
    const blips: RadarBlip[] = [];
    const rosterHasTeams = snap.players.some((p) => p.team === "red");
    for (const p of snap.players) {
      if (p.id === localId || !p.alive) continue;
      const dx = p.pos.x - local.pos.x, dz = p.pos.z - local.pos.z;
      const dh = Math.hypot(dx, dz);
      if (dh > range) continue;
      const enemy = session.localTeam === "ffa" || p.team !== session.localTeam || snap.mode === "slayer";
      if (enemy && !p.moving && dh > 6) continue; // motion tracker: only moving enemies
      // forward = (-sin, -cos); right = (cos, -sin)
      const fwd = -(dx * -sy + dz * -cy);
      const rgt = dx * cy + dz * -sy;
      blips.push({ x: rgt / range, y: fwd / range, enemy, up: p.pos.y > local.pos.y + 1.5, down: p.pos.y < local.pos.y - 1.5 });
    }

    // killfeed
    const killfeed: KillRow[] = snap.kills.slice(-5).map((k) => {
      const kp = snap.players.find((p) => p.id === k.killer);
      const vp = snap.players.find((p) => p.id === k.victim);
      const tcol = (t?: string) => (t === "red" ? 0xff4d5e : t === "blue" ? 0x3aa0ff : 0xffcf4d);
      return {
        id: k.id, killer: nameOf(snap, k.killer), victim: nameOf(snap, k.victim), weapon: k.weapon.replace(/_.*/, ""),
        headshot: k.headshot, medal: k.medal, mine: k.killer === localId,
        killerColor: hexc(tcol(kp?.team)),
        victimColor: hexc(tcol(vp?.team)),
      };
    }).reverse();

    // medals prune
    medals.current = medals.current.filter((md) => now - md.ts < 3000);
    const bannerActive = banner.current && now - banner.current.ts < 2800 ? banner.current : undefined;

    // pickup prompt
    let pickup: { label: string } | undefined;
    if (self?.alive) {
      for (const pk of snap.pickups) {
        if (!pk.available) continue;
        if (Math.hypot(self.pos.x - pk.pos.x, self.pos.z - pk.pos.z) < 2.4 && Math.abs(self.pos.y - pk.pos.y) < 2.6) {
          pickup = { label: pk.kind === "weapon" ? weaponDef(pk.what).name : pk.what };
          break;
        }
      }
    }

    // powerups
    const powerups = self ? Object.entries(self.powerups).filter(([, v]) => (v as number) > snap.t).map(([id, v]) => ({ id, secs: ((v as number) - snap.t) / 1000, color: POWERUP_COLOR[id] || "#fff" })) : [];

    // scores
    const useTeams = snap.mode !== "slayer" && rosterHasTeams;
    let topName = "—", topScore = 0;
    for (const p of snap.players) { if (p.score > topScore) { topScore = p.score; topName = p.name; } }

    const roster: ScoreRow[] = snap.players.map((p) => ({
      name: p.name, score: Math.floor(p.score), kills: p.kills, deaths: p.deaths, team: p.team, you: p.id === localId, bot: p.isBot,
    }));

    const hm = hitmarker.current;
    const hmActive = hm.active && now - hm.ts < 130;

    const inHill = !!(snap.hill && self && Math.hypot(self.pos.x - snap.hill.pos.x, self.pos.z - snap.hill.pos.z) < snap.hill.radius);

    return {
      alive: !!self?.alive,
      health: self?.health ?? 0,
      shield: self?.shield ?? 0,
      maxShield: MAX_SHIELD,
      overshield: (self?.shield ?? 0) > MAX_SHIELD + 1,
      weaponName: def.name,
      weaponColor: hexc(def.color),
      mag: ammo.mag, reserve: ammo.reserve, reserveInfinite: def.reserveMax === 0,
      reloading: Math.max(0, Math.min(1, reloading)),
      grenades: self?.grenades ?? { frag: 0, plasma: 0, mine: 0 },
      grenadeType: input.grenadeType,
      spread: Math.min(1, (def.spreadDeg + (self?.moving ? def.movingSpreadDeg ?? 0 : 0)) / 6),
      zoomed: local.zoomed,
      hitmarker: { active: hmActive, headshot: hm.headshot, killed: hm.killed },
      radar: { blips, range },
      mode: snap.mode, modeLabel: MODE_LABEL[snap.mode] || snap.mode,
      timeLeft: fmtTime(snap.timeLeftMs), scoreLimit: snap.scoreLimit,
      useTeams, teamScore: snap.teamScore, topName, topScore: Math.floor(topScore), myScore: Math.floor(self?.score ?? 0),
      hill: snap.mode === "koth" && snap.hill ? { controller: snap.hill.controller, inside: inHill } : undefined,
      oddball: snap.mode === "oddball" && snap.oddball ? { carrier: snap.oddball.carrier ? nameOf(snap, snap.oddball.carrier) : null, mine: snap.oddball.carrier === localId } : undefined,
      killfeed,
      medals: medals.current.map((md) => ({ id: md.id, text: md.text, sub: md.sub, big: md.big })),
      death: { active: !self?.alive, killer: self?.lastAttacker ? nameOf(snap, self.lastAttacker) : "", respawnIn: self ? (self.respawnAt - snap.t) / 1000 : 0 },
      damageFlash: self?.hitFlash ?? 0,
      lowShield: !!self?.alive && (self?.shield ?? 1) <= 0 && (self?.health ?? 100) < 55,
      pickup, powerups,
      banner: bannerActive ? { text: bannerActive.text, sub: bannerActive.sub } : undefined,
      streak: self?.streak ?? 0,
      scoreboardOpen: sbRef.current,
      roster,
      fps: fpsRef.current.fps,
      connecting: online && !isHost && !self,
      driving: self?.vehicleId ? { seat: self.vehicleSeat || "driver" } : undefined,
      infection: snap.mode === "infection"
        ? { role: self?.infected ? "infected" : "survivor", survivorsLeft: snap.players.filter((p) => !p.infected).length }
        : undefined,
      ctf: snap.mode === "ctf" && snap.flags
        ? {
            yourHome: (session.localTeam === "red" ? snap.flags.red : snap.flags.blue).home,
            enemyHome: (session.localTeam === "red" ? snap.flags.blue : snap.flags.red).home,
            youCarry: (session.localTeam === "red" ? snap.flags.blue : snap.flags.red).carrier === localId,
          }
        : undefined,
      gungame: snap.mode === "gungame" ? { level: self?.gunLevel ?? 0, total: GUN_LADDER.length } : undefined,
      damageDir: dmgDir.current && now - dmgDir.current.ts < 1100 ? dmgDir.current.ang : null,
      colorblind: colorblindRef.current,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId, online, isHost, session, audio]);

  const handleEnd = useCallback((snap: Snapshot) => {
    imRef.current?.exitLock();
    const useTeams = snap.mode !== "slayer" && snap.players.some((p) => p.team === "red");
    let winnerText = "MATCH OVER";
    if (snap.mode === "infection") {
      winnerText = snap.players.some((p) => !p.infected) ? "SURVIVORS WIN" : "THE HORDE WINS";
    } else if (useTeams) {
      winnerText = snap.teamScore.red === snap.teamScore.blue ? "IT'S A DRAW" : snap.teamScore.red > snap.teamScore.blue ? "RED TEAM WINS" : "BLUE TEAM WINS";
    } else {
      let best: PlayerState | null = null;
      for (const p of snap.players) if (!best || p.score > best.score) best = p;
      winnerText = best ? `${best.name.toUpperCase()} WINS` : "NOBODY WINS";
    }
    const roster: ScoreRow[] = snap.players.map((p) => ({
      name: p.name, score: Math.floor(p.score), kills: p.kills, deaths: p.deaths, team: p.team,
      you: p.id === localId, bot: p.isBot,
      accuracy: p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0,
      bestStreak: p.longestStreak,
    }));
    setEndInfo({ winnerText, roster, useTeams, teamScore: snap.teamScore });
    setEnded(true);
    audio.announce(winnerText);
  }, [audio, localId]);

  const resume = () => { imRef.current?.requestLock(); };

  return (
    <div ref={wrapRef} className="fixed inset-0 bg-black scanlines vignette overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full" />

      {hud && <HUD m={hud} />}

      {/* click-to-start prompt when not locked and not paused/ended */}
      {!paused && !ended && hud && !imLocked() && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="panel px-6 py-4 text-center pointer-events-none">
            <div className="text-hud-amber font-bold text-lg">Click to lock mouse & play</div>
            <div className="text-hud-amber/50 text-sm mt-1">Esc to release · Tab for scoreboard</div>
          </div>
        </div>
      )}

      {/* pause menu */}
      {paused && !ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/70">
          <div className="panel p-6 w-80 text-center">
            <h2 className="text-2xl font-extrabold title-shimmer mb-4">PAUSED</h2>
            {!settingsOpen ? (
              <div className="flex flex-col gap-2">
                <button className="btn-primary" onClick={resume}>Resume</button>
                <button className="btn-ghost" onClick={() => setSettingsOpen(true)}>Settings</button>
                <button className="btn-ghost !text-temu-red !border-temu-red/40" onClick={onLeave}>Leave Match</button>
                <p className="text-xs text-hud-amber/40 mt-2">Click Resume to re-lock your mouse.</p>
              </div>
            ) : (
              <div className="text-left space-y-3">
                <div>
                  <label className="label">Mouse Sensitivity: {sens.toFixed(1)}</label>
                  <input type="range" min={0.5} max={6} step={0.1} value={sens} onChange={(e) => setSens(parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="label">Volume: {Math.round(vol * 100)}%</label>
                  <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} className="w-full" />
                </div>
                <div>
                  <label className="label">Field of View: {fov}</label>
                  <input type="range" min={70} max={100} step={1} value={fov} onChange={(e) => setFov(parseInt(e.target.value))} className="w-full" />
                </div>
                <label className="flex items-center gap-2 text-sm text-hud-amber/70">
                  <input type="checkbox" checked={invertY} onChange={(e) => setInvertY(e.target.checked)} />
                  Invert look (Y axis)
                </label>
                <label className="flex items-center gap-2 text-sm text-hud-amber/70">
                  <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} />
                  Reduce motion (less screen shake)
                </label>
                <label className="flex items-center gap-2 text-sm text-hud-amber/70">
                  <input type="checkbox" checked={colorblind} onChange={(e) => setColorblind(e.target.checked)} />
                  Colorblind radar (shapes)
                </label>
                <div>
                  <label className="label">Graphics</label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {(["low", "med", "high"] as GraphicsQuality[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => setGfx(q)}
                        className={`px-2 py-1.5 rounded text-xs font-mono uppercase tracking-wider border transition ${gfx === q ? "bg-hud-cyan/20 border-hud-cyan/60 text-hud-cyan" : "border-hud-line text-hud-amber/60 hover:text-hud-amber"}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-hud-amber/40 mt-1">Lower this if the framerate dips. &quot;Low&quot; turns off bloom.</p>
                </div>
                <div>
                  <label className="label">Announcer</label>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    {([["cashier", "Cashier"], ["infomercial", "Infomercial"], ["manager", "Manager"]] as const).map(([id, lbl]) => (
                      <button
                        key={id}
                        onClick={() => setAnnouncer(id)}
                        className={`px-1 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider border transition ${announcer === id ? "bg-hud-cyan/20 border-hud-cyan/60 text-hud-cyan" : "border-hud-line text-hud-amber/60 hover:text-hud-amber"}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn-ghost w-full" onClick={() => setSettingsOpen(false)}>Back</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* results */}
      {ended && endInfo && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 fade-in overflow-auto py-6">
          <div className="panel p-6 w-[680px] max-w-[94vw]">
            <h1 className="text-4xl font-extrabold text-center title-shimmer mb-1">{endInfo.winnerText}</h1>
            <p className="text-center text-hud-amber/50 text-sm mb-5 font-mono">gg — no refunds</p>
            <ResultsTable info={endInfo} localId={localId} />
            <div className="flex flex-wrap gap-2 justify-center mt-6">
              {!online && onReplay && <button className="btn-primary" onClick={onReplay}>↻ Play Again</button>}
              {online && isHost && onReturnLobby && <button className="btn-primary" onClick={onReturnLobby}>← Return to Lobby</button>}
              {online && !isHost && <span className="text-hud-amber/60 text-sm self-center">Waiting for host…</span>}
              <button className="btn-ghost" onClick={onLeave}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function imLocked() {
  return typeof document !== "undefined" && !!document.pointerLockElement;
}

function ResultsTable({ info, localId }: { info: { roster: ScoreRow[]; useTeams: boolean; teamScore: { red: number; blue: number } }; localId: string }) {
  const rows = [...info.roster].sort((a, b) => b.score - a.score || b.kills - a.kills);
  return (
    <div>
      {info.useTeams && (
        <div className="flex justify-center gap-8 mb-4 text-2xl font-extrabold">
          <span className="text-temu-red">RED {info.teamScore.red}</span>
          <span className="text-hud-amber/30">vs</span>
          <span className="text-hud-blue">BLUE {info.teamScore.blue}</span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-4 text-xs text-hud-amber/50 mb-1 px-2 font-mono uppercase tracking-wider">
        <span>Player</span><span>Score</span><span>Kills</span><span>Deaths</span><span>K/D</span><span>Acc</span><span title="best streak">🔥</span>
      </div>
      <div className="max-h-[40vh] overflow-auto">
        {rows.map((r, i) => (
          <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-4 px-2 py-1.5 rounded tabular-nums ${r.you ? "bg-hud-amber/10 border border-hud-amber/20" : i % 2 ? "bg-black/20" : ""}`}>
            <span className="truncate flex items-center gap-1">
              {i === 0 && <span>👑</span>}
              {r.bot && <span className="text-hud-amber/30">🤖</span>}
              <span className="w-2 h-2 rounded-full" style={{ background: r.team === "red" ? "#ff4d5e" : r.team === "blue" ? "#3aa0ff" : "#ffcf4d" }} />
              <span className={r.you ? "font-bold text-hud-amber" : "text-hud-amber/80"}>{r.name}</span>
            </span>
            <span className="text-hud-cyan font-bold">{r.score}</span>
            <span className="text-hud-green">{r.kills}</span>
            <span className="text-temu-red/80">{r.deaths}</span>
            <span className="text-hud-amber/60">{r.deaths ? (r.kills / r.deaths).toFixed(1) : r.kills.toFixed(1)}</span>
            <span className="text-hud-blue">{r.accuracy ?? 0}%</span>
            <span className="text-temu-gold">{r.bestStreak ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
