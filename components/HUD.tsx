"use client";
import React from "react";

export interface RadarBlip { x: number; y: number; enemy: boolean; up: boolean; down: boolean; }
export interface KillRow { id: number; killer: string; victim: string; weapon: string; headshot: boolean; medal?: string; mine: boolean; killerColor: string; victimColor: string; }
export interface MedalPop { id: number; text: string; sub?: string; big?: boolean; }
export interface ScoreRow { name: string; score: number; kills: number; deaths: number; team: string; you: boolean; bot: boolean; accuracy?: number; bestStreak?: number; }

export interface HudModel {
  alive: boolean;
  health: number;
  shield: number;
  maxShield: number;
  overshield: boolean;
  weaponName: string;
  weaponId: string;
  weaponColor: string;
  mag: number;
  reserve: number;
  reserveInfinite: boolean;
  reloading: number; // 0..1
  grenades: { frag: number; plasma: number; mine: number };
  grenadeType: "frag" | "plasma" | "mine";
  spread: number;
  zoomed: boolean;
  hitmarker: { active: boolean; headshot: boolean; killed: boolean };
  radar: { blips: RadarBlip[]; range: number };
  mode: string;
  modeLabel: string;
  timeLeft: string;
  scoreLimit: number;
  useTeams: boolean;
  teamScore: { red: number; blue: number };
  topName: string;
  topScore: number;
  myScore: number;
  hill?: { controller: string | null; inside: boolean };
  oddball?: { carrier: string | null; mine: boolean };
  killfeed: KillRow[];
  medals: MedalPop[];
  death: { active: boolean; killer: string; respawnIn: number };
  damageFlash: number;
  lowShield: boolean;
  pickup?: { label: string };
  powerups: { id: string; secs: number; color: string }[];
  banner?: { text: string; sub?: string };
  streak: number;
  scoreboardOpen: boolean;
  roster: ScoreRow[];
  fps: number;
  connecting?: boolean;
  driving?: { seat: "driver" | "gunner" };
  infection?: { role: "survivor" | "infected"; survivorsLeft: number };
  ctf?: { yourHome: boolean; enemyHome: boolean; youCarry: boolean };
  gungame?: { level: number; total: number };
  juggernaut?: { you: boolean; name: string };
  damageDir?: number | null; // bearing to last attacker (rad, 0 = ahead), null = hide
  colorblind?: boolean; // shape-code radar blips instead of relying on color
}

const WEAPON_ICON: Record<string, string> = {
  ar: "🔫", br: "🔫", magnum: "🔫", dmr: "🔫", plasma: "🌀", shotgun: "💥",
  sniper: "🎯", rocket: "🚀", needler: "📍", sword: "🗡️", mine: "💣", splatter: "🛒", turret: "🛒",
};

function teamCss(t: string) {
  return t === "red" ? "#ff4d5e" : t === "blue" ? "#3aa0ff" : "#ffcf4d";
}

export default function HUD({ m }: { m: HudModel }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none font-mono text-hud-amber" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
      {/* damage / low-shield vignette */}
      {m.damageFlash > 0.01 && (
        <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${120 * m.damageFlash}px rgba(255,40,60,${0.55 * m.damageFlash})` }} />
      )}
      {m.lowShield && m.alive && (
        <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 90px rgba(255,40,60,0.35)" }} />
      )}

      {/* ---- crosshair ---- */}
      {m.alive && !m.zoomed && (
        <Crosshair spread={m.spread} hit={m.hitmarker} />
      )}
      {m.alive && m.zoomed && <ScopeOverlay />}

      {/* ---- directional damage indicator (red wedge toward the attacker) ---- */}
      {m.alive && m.damageDir != null && (
        <div className="absolute top-1/2 left-1/2" style={{ width: 0, height: 0, transform: `translate(-50%,-50%) rotate(${m.damageDir}rad)` }}>
          <div
            className="pop"
            style={{ position: "absolute", left: -22, top: -98, width: 0, height: 0, borderLeft: "22px solid transparent", borderRight: "22px solid transparent", borderBottom: "26px solid rgba(255,55,65,0.72)", filter: "drop-shadow(0 0 6px rgba(255,40,50,0.85))" }}
          />
        </div>
      )}

      {/* ---- top center: score / timer ---- */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 hud-cluster">
        <div className="panel2 px-4 py-1.5 flex items-center gap-4 text-sm">
          {m.useTeams ? (
            <>
              <span className="font-bold text-lg" style={{ color: "#ff4d5e" }}>{m.teamScore.red}</span>
              <span className="text-[10px] uppercase tracking-widest text-hud-amber/60">{m.modeLabel}</span>
              <span className="font-bold text-lg" style={{ color: "#3aa0ff" }}>{m.teamScore.blue}</span>
            </>
          ) : (
            <>
              <span className="text-[10px] uppercase tracking-widest text-hud-amber/60">{m.modeLabel}</span>
              <span className="font-bold text-hud-cyan">{m.topName}: {m.topScore}</span>
            </>
          )}
          <span className="text-hud-amber/40">|</span>
          <span className="tabular-nums text-hud-amber">{m.timeLeft}</span>
          <span className="text-hud-amber/40 text-xs">to {m.scoreLimit}</span>
        </div>
        {(m.hill || m.oddball) && (
          <div className="panel2 px-3 py-0.5 text-xs">
            {m.hill && (m.hill.controller ? <span style={{ color: teamCss(m.hill.controller) }}>● {m.hill.controller.toUpperCase()} controls the hill</span> : <span className="text-hud-amber/60">hill is contested</span>)}
            {m.oddball && (m.oddball.carrier ? <span className={m.oddball.mine ? "text-hud-green" : "text-hud-amber/80"}>💀 {m.oddball.mine ? "You have the ball!" : m.oddball.carrier + " has the ball"}</span> : <span className="text-hud-amber/60">💀 ball is loose</span>)}
          </div>
        )}
        {m.infection && (
          <div className="panel2 px-3 py-0.5 text-xs">
            {m.infection.role === "infected" ? (
              <span className="text-hud-green">🧟 INFECTED — go acquire some value</span>
            ) : (
              <span className="text-hud-cyan">🛡️ SURVIVOR — {m.infection.survivorsLeft} left · don&apos;t get caught</span>
            )}
          </div>
        )}
        {m.ctf && (
          <div className="panel2 px-3 py-0.5 text-xs flex gap-3">
            <span className={m.ctf.yourHome ? "text-hud-cyan" : "text-temu-red animate-pulse"}>🏴 yours: {m.ctf.yourHome ? "home" : "STOLEN"}</span>
            <span className={m.ctf.youCarry ? "text-hud-green" : "text-hud-amber/70"}>🚩 theirs: {m.ctf.youCarry ? "you have it!" : m.ctf.enemyHome ? "home" : "loose"}</span>
          </div>
        )}
        {m.gungame && (
          <div className="panel2 px-3 py-0.5 text-xs">
            <span className="text-temu-gold">🔫 Rung {m.gungame.level + 1}/{m.gungame.total}</span>
          </div>
        )}
        {m.juggernaut && (
          <div className="panel2 px-3 py-0.5 text-xs">
            {m.juggernaut.you ? (
              <span className="text-temu-red">👑 YOU ARE THE JUGGERNAUT — survive and slay</span>
            ) : (
              <span className="text-temu-gold">👑 Hunt {m.juggernaut.name} — the bounty pays ×3</span>
            )}
          </div>
        )}
      </div>

      {/* ---- killfeed top right ---- */}
      <div className="absolute top-14 right-3 flex flex-col items-end gap-1 text-xs max-w-xs hud-cluster">
        {m.killfeed.map((k) => (
          <div key={k.id} className={`panel2 px-2 py-1 flex items-center gap-1.5 ${k.mine ? "border-temu-orange/60" : ""} pop`}>
            {k.medal && <span className="text-temu-gold mr-1">🏅</span>}
            <span style={{ color: k.killerColor }} className="font-semibold">{k.killer}</span>
            <span className="text-hud-amber/50">{WEAPON_ICON[k.weapon] || "✖"}</span>
            {k.headshot && <span className="text-temu-red">🎯</span>}
            <span style={{ color: k.victimColor }}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* ---- medals center ---- */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        {m.medals.map((md) => (
          <div key={md.id} className="pop text-center">
            <div className={`${md.big ? "text-3xl" : "text-xl"} font-extrabold title-shimmer`}>{md.text}</div>
            {md.sub && <div className="text-xs text-hud-amber/70 -mt-0.5">{md.sub}</div>}
          </div>
        ))}
      </div>

      {/* ---- big banner (FIGHT! / RED WINS) ---- */}
      {m.banner && (
        <div className="absolute top-[36%] left-1/2 -translate-x-1/2 text-center pop">
          <div className="text-5xl font-extrabold text-glow text-hud-amber">{m.banner.text}</div>
          {m.banner.sub && <div className="text-sm text-hud-amber/70 mt-1">{m.banner.sub}</div>}
        </div>
      )}

      {/* ---- streak indicator ---- */}
      {m.streak >= 3 && m.alive && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 text-temu-gold text-sm font-bold">
          🔥 {m.streak} streak
        </div>
      )}

      {/* ---- bottom-left: radar + shield/health ---- */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2 hud-cluster">
        <Radar radar={m.radar} alive={m.alive} colorblind={m.colorblind} />
        <div className="w-56">
          {/* shield */}
          <div className="h-3 bg-black/50 rounded-sm overflow-hidden border border-hud-line mb-1 relative">
            <div className="h-full" style={{ transition: "width var(--dur-1) var(--ease-out)", width: `${Math.min(100, (m.shield / 100) * 100)}%`, background: m.overshield ? "linear-gradient(90deg,#36e7ff,#b06bff)" : "linear-gradient(90deg,#36e7ff,#3aa0ff)" }} />
            {m.overshield && <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 8px #36e7ff" }} />}
          </div>
          {/* health segmented */}
          <div className="h-2.5 bg-black/50 rounded-sm overflow-hidden border border-hud-line flex">
            {Array.from({ length: 10 }).map((_, i) => {
              const seg = (m.health - i * 10) / 10;
              return <div key={i} className="flex-1 border-r border-black/40" style={{ background: seg > 0 ? `rgba(93,255,155,${0.35 + seg * 0.65})` : "transparent" }} />;
            })}
          </div>
        </div>
      </div>

      {/* ---- bottom-right: ammo + grenades ---- */}
      <div className="absolute bottom-3 right-3 text-right hud-cluster">
        {m.driving ? (
          <div className="panel2 px-3 py-2 inline-block text-left">
            <div className="text-[10px] uppercase tracking-widest text-temu-orange">🛒 Wartrolley</div>
            <div className="text-2xl font-extrabold text-hud-amber leading-tight">TROLLEY CANNON</div>
            <div className="text-xs text-hud-amber/60 mt-1">
              <kbd className="text-hud-cyan font-bold">E</kbd> dismount · fire to shoot · ram to splatter
            </div>
          </div>
        ) : (
        <div className="panel2 px-3 py-2 inline-block">
          <div className="text-[10px] uppercase tracking-widest text-hud-amber/60 truncate max-w-[200px]" style={{ color: m.weaponColor }}>
            {WEAPON_ICON[m.weaponId] || "🔫"} {m.weaponName}
          </div>
          <div className="flex items-baseline justify-end gap-1.5">
            {m.reloading > 0 ? (
              <span className="text-temu-orange text-2xl font-bold animate-pulse">RELOAD</span>
            ) : (
              <>
                <span className={`text-4xl font-extrabold tabular-nums ${m.mag === 0 ? "text-temu-red" : "text-hud-amber"}`}>{m.mag}</span>
                <span className="text-hud-amber/50 text-lg">/</span>
                <span className="text-hud-amber/70 text-lg tabular-nums">{m.reserveInfinite ? "∞" : m.reserve}</span>
              </>
            )}
          </div>
          {m.reloading > 0 && (
            <div className="h-1 bg-black/50 rounded mt-1 overflow-hidden"><div className="h-full bg-temu-orange" style={{ width: `${m.reloading * 100}%` }} /></div>
          )}
          <div className="flex items-center justify-end gap-2 mt-1 text-xs">
            <span className={m.grenadeType === "frag" ? "text-hud-green font-bold" : "text-hud-amber/50"}>🧨 {m.grenades.frag}</span>
            <span className={m.grenadeType === "plasma" ? "text-hud-cyan font-bold" : "text-hud-amber/50"}>🔵 {m.grenades.plasma}</span>
            <span className={m.grenadeType === "mine" ? "text-temu-orange font-bold" : "text-hud-amber/50"}>💣 {m.grenades.mine}</span>
          </div>
        </div>
        )}
        {/* powerups */}
        {m.powerups.length > 0 && (
          <div className="flex flex-col items-end gap-1 mt-2">
            {m.powerups.map((p) => (
              <div key={p.id} className="chip" style={{ background: p.color + "22", color: p.color, border: `1px solid ${p.color}66` }}>
                {p.id} {Math.ceil(p.secs)}s
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- pickup prompt ---- */}
      {m.pickup && m.alive && (
        <div className="absolute bottom-[28%] left-1/2 -translate-x-1/2 panel2 px-4 py-1.5 text-sm pop">
          <kbd className="text-hud-cyan font-bold">E</kbd> <span className="text-hud-amber/80">pick up {m.pickup.label}</span>
        </div>
      )}

      {/* ---- death overlay ---- */}
      {!m.alive && !m.scoreboardOpen && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div className="text-center">
            <div className="text-2xl font-bold text-temu-red mb-1">YOU WERE VALUE-ENGINEERED</div>
            {m.death.killer && <div className="text-hud-amber/70 mb-3">by <span className="text-hud-amber font-semibold">{m.death.killer}</span></div>}
            <div className="text-5xl font-extrabold text-hud-amber tabular-nums">{m.death.respawnIn > 0 ? Math.ceil(m.death.respawnIn) : "•"}</div>
            <div className="text-xs text-hud-amber/50 mt-1">respawning…</div>
          </div>
        </div>
      )}

      {/* ---- scoreboard (Tab) ---- */}
      {m.scoreboardOpen && <Scoreboard m={m} />}

      {/* fps */}
      <div className="absolute top-2 left-2 text-[10px] text-hud-amber/30">{m.fps} fps{m.connecting ? " · connecting…" : ""}</div>
    </div>
  );
}

function Crosshair({ spread, hit }: { spread: number; hit: HudModel["hitmarker"] }) {
  const gap = 5 + spread * 22;
  const col = "#36e7ff";
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12">
      <div className="crosshair-dot absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([x, y], i) => (
        <div key={i} className="absolute top-1/2 left-1/2" style={{ width: y ? 2 : 7, height: y ? 7 : 2, background: col, boxShadow: `0 0 4px ${col}`, transform: `translate(-50%,-50%) translate(${x * gap}px, ${y * gap}px)` }} />
      ))}
      {hit.active && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pop" style={{ color: hit.killed ? "#ff4d5e" : hit.headshot ? "#ffcf4d" : "#fff", fontSize: hit.killed ? 28 : 20, fontWeight: 900 }}>✕</div>
      )}
    </div>
  );
}

function ScopeOverlay() {
  return (
    <div className="absolute inset-0">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black" style={{ width: "70vh", height: "70vh", boxShadow: "0 0 0 100vmax rgba(0,0,0,0.55)" }} />
      <div className="absolute top-1/2 left-0 w-full h-px bg-hud-red/60" />
      <div className="absolute left-1/2 top-0 h-full w-px bg-hud-red/60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-hud-red rounded-full" />
    </div>
  );
}

function Radar({ radar, alive, colorblind }: { radar: HudModel["radar"]; alive: boolean; colorblind?: boolean }) {
  return (
    <div className="relative w-32 h-32 rounded-full panel2 overflow-hidden" style={{ opacity: alive ? 1 : 0.4 }}>
      <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgba(54,231,255,0.08), transparent 70%)" }} />
      <div className="absolute inset-0 rounded-full border border-hud-line" />
      <div className="absolute top-1/2 left-0 w-full h-px bg-hud-line/40" />
      <div className="absolute left-1/2 top-0 h-full w-px bg-hud-line/40" />
      {/* sweep */}
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: "4s", background: "conic-gradient(from 0deg, rgba(54,231,255,0.18), transparent 60deg)" }} />
      {/* self */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0" style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "8px solid #5dff9b" }} />
      {radar.blips.map((b, i) => {
        const diamond = colorblind && b.enemy; // shape-code enemies for colorblind play
        return (
          <div key={i} className={`absolute w-2 h-2 ${diamond ? "" : "rounded-full"}`} style={{
            left: `${50 + b.x * 48}%`, top: `${50 + b.y * 48}%`,
            transform: `translate(-50%,-50%)${diamond ? " rotate(45deg)" : ""}`,
            background: b.enemy ? "#ff4d5e" : "#3aa0ff", boxShadow: `0 0 5px ${b.enemy ? "#ff4d5e" : "#3aa0ff"}`,
            outline: b.up ? "2px solid rgba(255,255,255,0.5)" : "none",
          }} />
        );
      })}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-hud-amber/40 uppercase tracking-widest">motion</div>
    </div>
  );
}

function Scoreboard({ m }: { m: HudModel }) {
  const rows = [...m.roster].sort((a, b) => b.score - a.score || b.kills - a.kills);
  const red = rows.filter((r) => r.team === "red");
  const blue = rows.filter((r) => r.team === "blue");
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/70 pointer-events-none">
      <div className="panel p-5 w-[640px] max-w-[92vw]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-hud-amber">{m.modeLabel}</h2>
          {m.useTeams ? (
            <div className="flex gap-4 text-lg font-bold">
              <span className="text-hud-red">RED {m.teamScore.red}</span>
              <span className="text-hud-blue">BLUE {m.teamScore.blue}</span>
            </div>
          ) : (
            <span className="text-hud-amber/60 text-sm">First to {m.scoreLimit}</span>
          )}
        </div>
        {m.useTeams ? (
          <div className="grid grid-cols-2 gap-4">
            <ScoreColumn rows={red} title="RED" color="#ff4d5e" />
            <ScoreColumn rows={blue} title="BLUE" color="#3aa0ff" />
          </div>
        ) : (
          <ScoreColumn rows={rows} title="LEADERBOARD" color="#ffcf4d" />
        )}
      </div>
    </div>
  );
}

function ScoreColumn({ rows, title, color }: { rows: ScoreRow[]; title: string; color: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest mb-1 font-bold" style={{ color }}>{title}</div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[11px] text-hud-amber/50 mb-1 px-2">
        <span>Player</span><span>Score</span><span>K</span><span>D</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-2 py-1 rounded text-sm tabular-nums ${r.you ? "bg-hud-amber/10" : i % 2 ? "bg-black/20" : ""}`}>
          <span className="truncate">{r.bot && <span className="text-hud-amber/30 mr-1">🤖</span>}<span className={r.you ? "text-hud-amber font-bold" : "text-hud-amber/80"}>{r.name}</span></span>
          <span className="text-hud-cyan font-semibold">{r.score}</span>
          <span className="text-hud-green">{r.kills}</span>
          <span className="text-temu-red/80">{r.deaths}</span>
        </div>
      ))}
    </div>
  );
}
