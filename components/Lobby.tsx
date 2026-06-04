"use client";
import React, { useState } from "react";
import type { LobbyClient } from "@/game/net";
import type { RoomInfo, MatchConfig, Team } from "@/game/types";
import { MAP_LIST } from "@/game/maps";
import { LOADOUTS } from "@/game/weapons";
import { SPARTAN_COLORS } from "@/game/constants";

const MODES: { id: MatchConfig["mode"]; name: string; teams: boolean }[] = [
  { id: "slayer", name: "Slayer (FFA)", teams: false },
  { id: "team", name: "Team Slayer", teams: true },
  { id: "koth", name: "King of the Hill", teams: true },
  { id: "oddball", name: "Oddball", teams: true },
  { id: "infection", name: "Black Friday", teams: false },
  { id: "ctf", name: "Capture the Banner", teams: true },
  { id: "gungame", name: "Clearance Ladder", teams: false },
];
const SKILLS = [
  { v: 0.3, n: "Recruit" }, { v: 0.55, n: "Marine" }, { v: 0.75, n: "ODST" }, { v: 0.95, n: "Legendary" },
];
function hexc(n: number) { return "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6); }

export default function Lobby({ lobby, room, selfId, onLeave }: { lobby: LobbyClient; room: RoomInfo; selfId: string; onLeave: () => void }) {
  const me = room.players.find((p) => p.id === selfId);
  const isHost = room.hostId === selfId;
  const cfg = room.config;
  const teamMode = cfg.mode === "team" || cfg.mode === "koth" || cfg.mode === "oddball" || cfg.mode === "ctf";
  const [copied, setCopied] = useState(false);
  const [chat, setChat] = useState("");

  const copyCode = () => {
    navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const red = room.players.filter((p) => p.team === "red");
  const blue = room.players.filter((p) => p.team === "blue");
  const ffa = room.players.filter((p) => p.team === "ffa");
  const allReady = room.players.every((p) => p.ready || p.id === room.hostId);

  return (
    <div className="min-h-screen grid-bg py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="label mb-1">Room Code — share it</div>
            <button onClick={copyCode} className="group flex items-center gap-3">
              <span className="text-5xl font-extrabold tracking-[0.3em] title-shimmer">{room.code}</span>
              <span className="chip bg-hud-panel2 border border-hud-line text-hud-cyan group-hover:border-hud-cyan/60">
                {copied ? "copied!" : "📋 copy"}
              </span>
            </button>
          </div>
          <button className="btn-ghost !text-temu-red !border-temu-red/40" onClick={onLeave}>← Leave Room</button>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* roster */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-hud-amber">Lobby · {room.players.length} player{room.players.length !== 1 ? "s" : ""}</h2>
              <span className="text-xs text-hud-amber/50 font-mono">empty slots → bots</span>
            </div>
            {teamMode ? (
              <div className="grid grid-cols-2 gap-4">
                <TeamCol title="RED" color="#ff4d5e" players={red} selfId={selfId} hostId={room.hostId} onJoin={() => lobby.setTeam("red")} canJoin={me?.team !== "red"} />
                <TeamCol title="BLUE" color="#3aa0ff" players={blue} selfId={selfId} hostId={room.hostId} onJoin={() => lobby.setTeam("blue")} canJoin={me?.team !== "blue"} />
              </div>
            ) : (
              <TeamCol title="FREE FOR ALL" color="#ffcf4d" players={ffa} selfId={selfId} hostId={room.hostId} />
            )}
          </div>

          {/* controls */}
          <div className="space-y-4">
            {/* self */}
            <div className="panel p-4">
              <div className="label mb-2">You</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded" style={{ background: hexc(me?.spartanColor ?? 0x3aa0ff) }} />
                <span className="font-bold text-hud-amber flex-1 truncate">{me?.name}</span>
                {isHost && <span className="chip bg-temu-gold/20 text-temu-gold border border-temu-gold/40">HOST</span>}
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {SPARTAN_COLORS.map((c) => (
                  <button key={c} onClick={() => lobby.setColor(c)} className="w-6 h-6 rounded border-2" style={{ background: hexc(c), borderColor: me?.spartanColor === c ? "#fff" : "transparent" }} />
                ))}
              </div>
              <div className="label mb-1">Loadout</div>
              <select className="input w-full mb-3 text-sm" value={me?.loadout} onChange={(e) => lobby.setLoadout(e.target.value)}>
                {LOADOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {!isHost && (
                <button className={`btn w-full ${me?.ready ? "btn-cyan" : "btn-ghost"}`} onClick={() => lobby.setReady(!me?.ready)}>
                  {me?.ready ? "✓ Ready" : "Ready Up"}
                </button>
              )}
            </div>

            {/* host config */}
            {isHost && (
              <div className="panel p-4 space-y-3">
                <div className="label">Match Settings (host)</div>
                <div>
                  <div className="text-xs text-hud-amber/60 mb-1">Mode</div>
                  <div className="grid grid-cols-2 gap-1">
                    {MODES.map((mo) => (
                      <button key={mo.id} onClick={() => lobby.setConfig({ mode: mo.id })} className={`text-xs px-2 py-1.5 rounded border ${cfg.mode === mo.id ? "border-hud-cyan text-hud-cyan bg-hud-cyan/10" : "border-hud-line text-hud-amber/70"}`}>{mo.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-hud-amber/60 mb-1">Map</div>
                  <div className="grid grid-cols-3 gap-1">
                    {MAP_LIST.map((mp) => (
                      <button key={mp.id} onClick={() => lobby.setConfig({ mapId: mp.id })} className={`text-xs px-1 py-1.5 rounded border ${cfg.mapId === mp.id ? "border-hud-cyan text-hud-cyan bg-hud-cyan/10" : "border-hud-line text-hud-amber/70"}`}>{mp.name.split(" ")[0]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-hud-amber/60 mb-1">Bots: {cfg.botCount}</div>
                  <input type="range" min={0} max={15} value={cfg.botCount} onChange={(e) => lobby.setConfig({ botCount: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <div className="text-xs text-hud-amber/60 mb-1">Bot Skill</div>
                  <div className="grid grid-cols-4 gap-1">
                    {SKILLS.map((s) => (
                      <button key={s.v} onClick={() => lobby.setConfig({ botSkill: s.v })} className={`text-[10px] px-1 py-1.5 rounded border ${Math.abs(cfg.botSkill - s.v) < 0.06 ? "border-hud-cyan text-hud-cyan bg-hud-cyan/10" : "border-hud-line text-hud-amber/70"}`}>{s.n}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-hud-amber/60 mb-1">{cfg.mode === "koth" || cfg.mode === "oddball" ? "Points" : "Score"}: {cfg.scoreLimit}</div>
                    <input type="range" min={5} max={cfg.mode === "koth" || cfg.mode === "oddball" ? 300 : 75} step={5} value={cfg.scoreLimit} onChange={(e) => lobby.setConfig({ scoreLimit: parseInt(e.target.value) })} className="w-full" />
                  </div>
                  <div>
                    <div className="text-xs text-hud-amber/60 mb-1">Time: {Math.round(cfg.timeLimitSec / 60)}m</div>
                    <input type="range" min={120} max={900} step={60} value={cfg.timeLimitSec} onChange={(e) => lobby.setConfig({ timeLimitSec: parseInt(e.target.value) })} className="w-full" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-hud-amber/70">
                  <input type="checkbox" checked={cfg.friendlyFire} onChange={(e) => lobby.setConfig({ friendlyFire: e.target.checked })} />
                  Friendly fire
                </label>
                <button className="btn-primary w-full text-base !py-3" onClick={() => lobby.startMatch()}>
                  ▶ Start Match {!allReady && <span className="text-xs opacity-70">(some not ready)</span>}
                </button>
              </div>
            )}
            {!isHost && (
              <div className="panel p-4 text-center text-sm text-hud-amber/60">
                Waiting for host to start…
                <div className="mt-2 text-xs font-mono">{cfg.mode} · {MAP_LIST.find((m) => m.id === cfg.mapId)?.name} · {cfg.botCount} bots</div>
              </div>
            )}
          </div>
        </div>

        {/* chat */}
        <ChatBox lobby={lobby} />
      </div>
    </div>
  );
}

function TeamCol({ title, color, players, selfId, hostId, onJoin, canJoin }: { title: string; color: string; players: any[]; selfId: string; hostId: string; onJoin?: () => void; canJoin?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold uppercase tracking-widest" style={{ color }}>{title}</span>
        {onJoin && canJoin && <button onClick={onJoin} className="text-[10px] px-2 py-0.5 rounded border border-hud-line text-hud-amber/70 hover:text-hud-amber">join →</button>}
      </div>
      <div className="space-y-1 min-h-[60px]">
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 panel2 px-2 py-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: hexc(p.spartanColor) }} />
            <span className={`flex-1 truncate text-sm ${p.id === selfId ? "text-hud-amber font-bold" : "text-hud-amber/80"}`}>{p.name}</span>
            {p.id === hostId ? <span className="text-temu-gold text-xs">👑</span> : p.ready ? <span className="text-hud-green text-xs">✓</span> : <span className="text-hud-amber/30 text-xs">…</span>}
          </div>
        ))}
        {players.length === 0 && <div className="text-xs text-hud-amber/30 italic px-2 py-3">empty — bots will fill in</div>}
      </div>
    </div>
  );
}

function ChatBox({ lobby }: { lobby: LobbyClient }) {
  const [msgs, setMsgs] = useState<{ name: string; text: string }[]>([]);
  const [text, setText] = useState("");
  React.useEffect(() => {
    const handler = (m: any) => setMsgs((x) => [...x.slice(-20), { name: m.name, text: m.text }]);
    lobby.socket.on("chat", handler);
    return () => { lobby.socket.off("chat", handler); };
  }, [lobby]);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) { lobby.chat(text.trim()); setText(""); }
  };
  return (
    <div className="panel p-3 mt-6">
      <div className="h-24 overflow-auto text-sm space-y-0.5 mb-2 font-mono">
        {msgs.length === 0 && <div className="text-hud-amber/30 italic">say hi to your soon-to-be enemies…</div>}
        {msgs.map((m, i) => <div key={i}><span className="text-hud-cyan">{m.name}:</span> <span className="text-hud-amber/80">{m.text}</span></div>)}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={160} placeholder="message…" className="input flex-1 text-sm" />
        <button className="btn-ghost !px-3">Send</button>
      </form>
    </div>
  );
}
