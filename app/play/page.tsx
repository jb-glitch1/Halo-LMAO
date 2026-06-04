"use client";
import React, { useEffect, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Logo } from "@/components/Nav";
import Lobby from "@/components/Lobby";
import { getSocket, LobbyClient, HostSession, ClientSession, SessionLike } from "@/game/net";
import type { RoomInfo, MatchConfig, SkullId } from "@/game/types";
import { MAP_LIST } from "@/game/maps";
import { LOADOUTS } from "@/game/weapons";
import { SPARTAN_COLORS } from "@/game/constants";

const GameClient = dynamic(() => import("@/components/GameClient"), { ssr: false });

type View = "menu" | "solo" | "lobby" | "game";

const DEFAULT_CONFIG: MatchConfig = {
  mode: "team", mapId: "gulch", scoreLimit: 25, timeLimitSec: 420,
  botCount: 6, botSkill: 0.55, friendlyFire: false, startingLoadout: "recruit",
};
const MODES = [
  { id: "slayer", name: "Slayer", d: "Free-for-all" },
  { id: "team", name: "Team Slayer", d: "Red vs Blue" },
  { id: "koth", name: "King of the Hill", d: "Hold the zone" },
  { id: "oddball", name: "Oddball", d: "Hold the ball" },
  { id: "infection", name: "Black Friday", d: "Survive the horde" },
] as const;
const SKILLS = [{ v: 0.3, n: "Recruit" }, { v: 0.55, n: "Marine" }, { v: 0.78, n: "ODST" }, { v: 0.95, n: "Legendary" }];
const SKULLS: { id: SkullId; name: string }[] = [
  { id: "thrifty", name: "Thrifty" },
  { id: "boom", name: "Markdown Mayhem" },
  { id: "birthday", name: "Birthday Party" },
  { id: "famine", name: "Famine" },
  { id: "sugar", name: "Sugar Rush" },
];
function hexc(n: number) { return "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6); }

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-hud-amber">Loading…</div>}>
      <PlayInner />
    </Suspense>
  );
}

function PlayInner() {
  const [view, setView] = useState<View>("menu");
  const [name, setName] = useState("Spartan");
  const [color, setColor] = useState(SPARTAN_COLORS[0]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [selfId, setSelfId] = useState("");
  const [err, setErr] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [connecting, setConnecting] = useState(false);

  const lobbyRef = useRef<LobbyClient | null>(null);
  const roomRef = useRef<RoomInfo | null>(null);
  const sessionRef = useRef<{ session: SessionLike; localId: string; isHost: boolean; online: boolean } | null>(null);
  const soloCfgRef = useRef<MatchConfig>(DEFAULT_CONFIG);

  // load profile
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("lmao_profile") || "{}");
      if (p.name) setName(p.name);
      if (typeof p.color === "number") setColor(p.color);
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    localStorage.setItem("lmao_profile", JSON.stringify({ name, color }));
  }, [name, color]);

  const profile = () => ({ name: name.trim().slice(0, 16) || "Spartan", color });

  function ensureLobby(): LobbyClient {
    if (lobbyRef.current) return lobbyRef.current;
    const lobby = new LobbyClient({
      onConnect: () => setSelfId(getSocket().id || ""),
      onDisconnect: () => setConnecting(false),
      onLobby: (r) => {
        roomRef.current = r;
        setRoom(r);
        setSelfId(getSocket().id || "");
        setConnecting(false);
        setView((v) => (v === "game" ? v : "lobby"));
      },
      onStart: (payload) => buildOnlineSession(payload),
      onError: (m) => { setErr(m); setConnecting(false); },
    });
    lobbyRef.current = lobby;
    // extra match-flow listeners
    lobby.socket.on("returnLobby", () => {
      sessionRef.current?.session.stop();
      sessionRef.current = null;
      setView("lobby");
    });
    lobby.socket.on("hostLeft", () => {
      sessionRef.current?.session.stop();
      sessionRef.current = null;
      setErr("Host left — the match was value-engineered out of existence.");
      setRoom(null);
      setView("menu");
    });
    return lobby;
  }

  function buildOnlineSession(payload: { config: MatchConfig; roster: any[]; hostId: string }) {
    const socket = getSocket();
    const localId = socket.id || "";
    const r = roomRef.current;
    if (!r) return;
    const isHost = payload.hostId === localId;
    let session: SessionLike;
    if (isHost) {
      session = new HostSession({ socket, roomCode: r.code, localId, config: payload.config, roster: payload.roster });
    } else {
      const team = payload.roster.find((x) => x.id === localId)?.team || "ffa";
      session = new ClientSession({ socket, roomCode: r.code, localId, mapId: payload.config.mapId, team });
    }
    sessionRef.current = { session, localId, isHost, online: true };
    setView("game");
  }

  function hostRoom() {
    setErr("");
    setConnecting(true);
    ensureLobby().createRoom(profile(), DEFAULT_CONFIG);
  }
  function joinRoom() {
    if (joinCode.trim().length < 3) { setErr("Enter a room code."); return; }
    setErr("");
    setConnecting(true);
    ensureLobby().joinRoom(joinCode, profile());
  }

  function startSolo(cfg: MatchConfig) {
    soloCfgRef.current = cfg;
    const localId = "me";
    const team = cfg.mode === "slayer" || cfg.mode === "infection" ? "ffa" : "red";
    const roster = [{ id: localId, name: profile().name, team, ready: true, isHost: true, loadout: cfg.startingLoadout, spartanColor: color }];
    const session = new HostSession({ socket: null, roomCode: "SOLO", localId, config: cfg, roster: roster as any });
    sessionRef.current = { session, localId, isHost: true, online: false };
    setView("game");
  }

  function leaveGame() {
    sessionRef.current?.session.stop();
    sessionRef.current = null;
    if (lobbyRef.current && roomRef.current) lobbyRef.current.leave();
    roomRef.current = null;
    setRoom(null);
    setView("menu");
  }
  function returnToLobby() {
    const lobby = lobbyRef.current;
    const r = roomRef.current;
    if (lobby && r) lobby.socket.emit("returnLobby", { code: r.code });
    sessionRef.current?.session.stop();
    sessionRef.current = null;
    setView("lobby");
  }
  function leaveLobby() {
    lobbyRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setView("menu");
  }

  // ---------- render ----------
  if (view === "game" && sessionRef.current) {
    const s = sessionRef.current;
    return (
      <GameClient
        key={s.localId + (room?.code || "solo") + view}
        session={s.session}
        localId={s.localId}
        online={s.online}
        isHost={s.isHost}
        onLeave={leaveGame}
        onReturnLobby={s.online && s.isHost ? returnToLobby : undefined}
        onReplay={!s.online ? () => startSolo(soloCfgRef.current) : undefined}
      />
    );
  }

  if (view === "lobby" && room) {
    return <Lobby lobby={ensureLobby()} room={room} selfId={selfId || getSocket().id || ""} onLeave={leaveLobby} />;
  }

  if (view === "solo") {
    return <SoloSetup onStart={startSolo} onBack={() => setView("menu")} initial={soloCfgRef.current} />;
  }

  // MENU
  return (
    <div className="min-h-screen grid-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-10">
          <Logo />
          <a href="/" className="btn-ghost !py-2 !px-4">← Home</a>
        </div>

        {err && <div className="panel border-temu-red/50 p-3 mb-4 text-temu-red text-sm flex items-center justify-between"><span>⚠ {err}</span><button onClick={() => setErr("")} className="text-hud-amber/50">✕</button></div>}

        {/* profile */}
        <div className="panel p-5 mb-6">
          <div className="label mb-3">Your Spartan</div>
          <div className="flex flex-wrap items-center gap-4">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="callsign" className="input text-lg w-56" />
            <div className="flex flex-wrap gap-1.5">
              {SPARTAN_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-lg border-2 transition" style={{ background: hexc(c), borderColor: color === c ? "#fff" : "transparent", transform: color === c ? "scale(1.1)" : "scale(1)" }} />
              ))}
            </div>
          </div>
        </div>

        {/* options */}
        <div className="grid md:grid-cols-3 gap-4">
          <button onClick={() => setView("solo")} className="panel p-6 text-left hover:border-temu-orange/60 hover:-translate-y-1 transition group">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="text-xl font-bold text-hud-amber mb-1">Play vs Bots</h3>
            <p className="text-sm text-hud-amber/55">Jump straight in. Configure a custom match against AI Spartans. No friends required (we won't tell).</p>
            <div className="mt-4 chip bg-temu-orange/20 text-temu-orange border border-temu-orange/40 group-hover:bg-temu-orange/30">Instant →</div>
          </button>

          <button onClick={hostRoom} className="panel p-6 text-left hover:border-hud-cyan/60 hover:-translate-y-1 transition group">
            <div className="text-4xl mb-3">🛰️</div>
            <h3 className="text-xl font-bold text-hud-amber mb-1">Host a Room</h3>
            <p className="text-sm text-hud-amber/55">Create a private room, get a 4-letter code, and invite friends. Empty slots fill with bots.</p>
            <div className="mt-4 chip bg-hud-cyan/20 text-hud-cyan border border-hud-cyan/40">{connecting ? "connecting…" : "Create →"}</div>
          </button>

          <div className="panel p-6 hover:border-hud-green/60 transition">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="text-xl font-bold text-hud-amber mb-1">Join a Room</h3>
            <p className="text-sm text-hud-amber/55 mb-3">Got a code from a friend? Drop in.</p>
            <div className="flex gap-2">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={4} placeholder="CODE" className="input w-24 text-center tracking-[0.3em] font-bold" />
              <button onClick={joinRoom} className="btn-cyan flex-1">{connecting ? "…" : "Join"}</button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-hud-amber/40 mt-8 font-mono">
          Tip: hosting runs the match in your browser. Keep this tab focused for the smoothest game.
        </p>
      </div>
    </div>
  );
}

function SoloSetup({ onStart, onBack, initial }: { onStart: (c: MatchConfig) => void; onBack: () => void; initial: MatchConfig }) {
  const [cfg, setCfg] = useState<MatchConfig>(initial);
  const set = (p: Partial<MatchConfig>) => setCfg((c) => ({ ...c, ...p }));
  return (
    <div className="min-h-screen grid-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Logo />
          <button onClick={onBack} className="btn-ghost !py-2 !px-4">← Back</button>
        </div>
        <h1 className="text-3xl font-extrabold mb-6">Custom <span className="text-temu-orange">Bot Match</span></h1>
        <div className="panel p-5 space-y-5">
          <div>
            <div className="label mb-2">Mode</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MODES.map((m) => (
                <button key={m.id} onClick={() => set({ mode: m.id, scoreLimit: m.id === "koth" || m.id === "oddball" ? 120 : 25 })} className={`p-2 rounded-lg border text-center ${cfg.mode === m.id ? "border-temu-orange bg-temu-orange/10" : "border-hud-line"}`}>
                  <div className="text-sm font-bold text-hud-amber">{m.name}</div>
                  <div className="text-[10px] text-hud-amber/50">{m.d}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2">Map</div>
            <div className="grid grid-cols-3 gap-2">
              {MAP_LIST.map((m) => (
                <button key={m.id} onClick={() => set({ mapId: m.id })} className={`p-3 rounded-lg border text-left ${cfg.mapId === m.id ? "border-hud-cyan bg-hud-cyan/10" : "border-hud-line"}`}>
                  <div className="text-sm font-bold text-hud-amber">{m.name}</div>
                  <div className="text-[10px] text-hud-amber/50 line-clamp-2">{m.blurb}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="label mb-1">Bots: {cfg.botCount}</div>
              <input type="range" min={1} max={15} value={cfg.botCount} onChange={(e) => set({ botCount: parseInt(e.target.value) })} className="w-full" />
            </div>
            <div>
              <div className="label mb-2">Difficulty</div>
              <div className="grid grid-cols-4 gap-1">
                {SKILLS.map((s) => (
                  <button key={s.v} onClick={() => set({ botSkill: s.v })} className={`text-[10px] px-1 py-1.5 rounded border ${Math.abs(cfg.botSkill - s.v) < 0.06 ? "border-hud-cyan text-hud-cyan bg-hud-cyan/10" : "border-hud-line text-hud-amber/70"}`}>{s.n}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="label mb-2">Your Loadout</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LOADOUTS.map((l) => (
                <button key={l.id} onClick={() => set({ startingLoadout: l.id })} className={`p-2 rounded-lg border text-center ${cfg.startingLoadout === l.id ? "border-temu-orange bg-temu-orange/10" : "border-hud-line"}`}>
                  <div className="text-xs font-bold text-hud-amber">{l.name}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-2">Skulls <span className="text-hud-amber/40 lowercase font-normal tracking-normal">— optional chaos modifiers</span></div>
            <div className="flex flex-wrap gap-2">
              {SKULLS.map((s) => {
                const on = (cfg.skulls || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => set({ skulls: on ? (cfg.skulls || []).filter((x) => x !== s.id) : [...(cfg.skulls || []), s.id] })}
                    className={`px-2 py-1 rounded border text-xs ${on ? "border-temu-gold text-temu-gold bg-temu-gold/10" : "border-hud-line text-hud-amber/60 hover:text-hud-amber"}`}
                  >
                    💀 {s.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-hud-amber/40 mt-1">Or find the hidden skull on the map mid-match to roll a random one.</p>
          </div>
          <button onClick={() => onStart(cfg)} className="btn-primary w-full text-lg !py-3.5">▶ Start Match</button>
        </div>
      </div>
    </div>
  );
}
