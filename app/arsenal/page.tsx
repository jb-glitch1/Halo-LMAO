import Nav from "@/components/Nav";
import Link from "next/link";
import { WEAPONS, LOADOUTS } from "@/game/weapons";

export const metadata = { title: "Arsenal — LMAO" };

function hex(n: number) {
  return "#" + n.toString(16).padStart(6, "0");
}

function Stat({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 label shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-black/50 rounded overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const POWERUPS = [
  { n: "Off-brand Overshield", c: "#36e7ff", d: "Doubles your shield to a glorious 200. Decays, like all good things and warranties." },
  { n: "Definitely-Legal Speed Boost", c: "#ffcf4d", d: "Move 35% faster for 30s. Side effects may include overconfidence." },
  { n: "Damage Boost (questionable)", c: "#ff4d5e", d: "2× damage for 30s. The receipts will not survive." },
  { n: "Active Camo (mostly works)", c: "#b06bff", d: "Go nearly invisible. Bots get confused. So do you." },
];

export default function Arsenal() {
  const ids = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].vehicleOnly);
  return (
    <main className="min-h-screen grid-bg">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="t-h1 mb-1">The <span className="text-temu-orange">Arsenal</span></h1>
        <p className="text-hud-amber/50 font-mono text-sm mb-8">
          {ids.length} legally-distinct instruments of value-engineered violence.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {ids.map((id) => {
            const w = WEAPONS[id];
            const dps = w.type === "melee" ? w.damage : (w.damage * (w.pellets || 1) * (w.burst || 1) * w.rpm) / 60;
            return (
              <div key={id} className="panel p-5" style={{ borderColor: hex(w.color) + "55" }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-xl font-bold text-hud-amber leading-tight">{w.name}</h2>
                    <div className="flex gap-2 mt-1">
                      <span className="chip border" style={{ color: hex(w.color), borderColor: hex(w.color) + "66" }}>
                        {w.type}
                      </span>
                      {w.isPower && <span className="chip bg-temu-red/20 text-temu-red border border-temu-red/40">power weapon</span>}
                      <span className="chip bg-hud-panel2 text-hud-amber/60 border border-hud-line">{w.slot}</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-lg grid place-items-center text-2xl shrink-0" style={{ background: hex(w.color) + "22" }}>
                    {id === "sword" ? "🗡️" : id === "rocket" ? "🚀" : id === "sniper" ? "🎯" : id === "needler" ? "📍" : id === "shotgun" ? "💥" : id === "plasma" ? "🌀" : "🔫"}
                  </div>
                </div>
                <p className="text-sm text-hud-amber/60 italic mb-4">“{w.flavor}”</p>
                <div className="space-y-1.5">
                  <Stat label="Damage" value={w.damage * (w.pellets || 1)} max={210} color={hex(w.color)} />
                  <Stat label="Fire rate" value={w.rpm} max={650} color="#5dff9b" />
                  {w.type !== "melee" && <Stat label="Range" value={w.range} max={300} color="#3aa0ff" />}
                  {w.magSize > 1 && <Stat label="Magazine" value={w.magSize} max={42} color="#ffcf4d" />}
                  {w.headshotMult > 1.3 && <Stat label="Headshot" value={w.headshotMult} max={2.5} color="#ff4d5e" />}
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="text-2xl font-extrabold mb-3">Spawn <span className="text-temu-orange">Loadouts</span></h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
          {LOADOUTS.map((l) => (
            <div key={l.id} className="panel p-4">
              <h3 className="font-bold text-hud-amber">{l.name}</h3>
              <p className="text-xs text-hud-amber/55 mt-1 mb-3">{l.blurb}</p>
              <div className="flex flex-wrap gap-1">
                {l.weapons.map((wid) => (
                  <span key={wid} className="chip bg-hud-panel2 border border-hud-line text-hud-cyan">{WEAPONS[wid].name.split(" ")[0]}</span>
                ))}
                <span className="chip bg-hud-panel2 border border-hud-line text-hud-amber/70">{l.grenade} ×2</span>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-extrabold mb-3">Power-ups <span className="text-temu-orange">(while supplies last)</span></h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-12">
          {POWERUPS.map((p) => (
            <div key={p.n} className="panel p-4 flex gap-3 items-start">
              <span className="w-3 h-12 rounded-full shrink-0" style={{ background: p.c }} />
              <div>
                <h3 className="font-bold" style={{ color: p.c }}>{p.n}</h3>
                <p className="text-sm text-hud-amber/60">{p.d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link href="/play" className="btn-primary text-lg !px-10 !py-4">▶ Take it for a spin</Link>
        </div>
      </div>
    </main>
  );
}
