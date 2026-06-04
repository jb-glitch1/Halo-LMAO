import Link from "next/link";
import Nav from "@/components/Nav";
import HeroBackdrop from "@/components/HeroBackdrop";
import { WEAPONS } from "@/game/weapons";
import { MAP_LIST } from "@/game/maps";

const MODES = [
  { name: "Slayer", tag: "Free-for-all", blurb: "Every Spartan for themselves. Trust no one, especially the bots.", icon: "💀" },
  { name: "Team Slayer", tag: "Red vs Blue", blurb: "The eternal struggle. Two colors. One slightly-cheaper canyon.", icon: "🚩" },
  { name: "King of the Hill", tag: "Zone control", blurb: "Stand in the glowing discount circle. It moves. Chase the savings.", icon: "👑" },
  { name: "Oddball", tag: "Hold the ball", blurb: "Carry the cursed skull. Everyone wants it. It is not worth it.", icon: "💀" },
];

const REVIEWS = [
  { n: "xX_RefundPls_Xx", s: 5, t: "Bought the real game by accident, returned it, came here. No notes." },
  { n: "Mom’sBasement2009", s: 5, t: "The announcer said 'Double Kill, buy one get one free' and I felt that." },
  { n: "DefinitelyNotABot", s: 4, t: "As a human person, the bots are very challenging. 4 stars. Beep." },
  { n: "CanyonEnjoyer", s: 5, t: "It's just Blood Gulch but I'm legally not allowed to say that. Perfect." },
  { n: "ShieldRegenFan", s: 5, t: "Got stuck with a plasma grenade and laughed. 10/10 would stick again." },
  { n: "TheManagement", s: 1, t: "Please stop calling our products 'knockoffs.' They are 'value-engineered.'" },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="text-temu-gold">
      {"★".repeat(n)}
      <span className="text-hud-line">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default function Home() {
  const featuredWeapons = ["sniper", "rocket", "sword", "needler", "shotgun", "magnum"];
  return (
    <main className="min-h-screen grid-bg">
      <Nav />

      {/* HERO */}
      <section className="relative overflow-hidden scanlines vignette">
        <HeroBackdrop />

        {/* visor HUD frame */}
        <div className="pointer-events-none absolute inset-3 sm:inset-6 z-10">
          <span className="absolute top-0 left-0 w-10 h-10 border-l-2 border-t-2 border-hud-cyan/40" />
          <span className="absolute top-0 right-0 w-10 h-10 border-r-2 border-t-2 border-hud-cyan/40" />
          <span className="absolute bottom-0 left-0 w-10 h-10 border-l-2 border-b-2 border-hud-cyan/40" />
          <span className="absolute bottom-0 right-0 w-10 h-10 border-r-2 border-b-2 border-hud-cyan/40" />
        </div>

        <div className="max-w-6xl mx-auto px-4 pt-24 pb-28 text-center relative z-10">
          <div className="inline-flex items-center gap-2 chip bg-black/40 border border-hud-cyan/30 text-hud-cyan mb-6 fade-in backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-hud-green animate-pulse" /> 100% in-browser · no download · no dignity
          </div>
          <h1 className="text-7xl sm:text-9xl font-extrabold leading-none mb-4 hero-title hero-title-flicker">
            LMAO
          </h1>
          <p className="text-xl sm:text-2xl font-light text-hud-cyan/90 mb-3 tracking-[0.25em] uppercase">
            Lethal Mayhem: <span className="font-semibold text-white">Arena Online</span>
          </p>
          <p className="max-w-2xl mx-auto text-hud-amber/70 mb-8 text-lg">
            The <span className="text-temu-orange font-semibold">Temu-tier Halo</span>. A legally-distinct,
            suspiciously-affordable first-person arena shooter you can host and play with friends in one click.
            Finish the fight.<span className="text-xs align-super">(knockoff)</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <Link href="/play" className="btn btn-holo text-base !px-8 !py-3.5">
              ▶ Enter the Arena — It’s Free*
            </Link>
            <Link href="/play?host=1" className="btn-cyan text-base !px-6 !py-3.5">
              🎮 Host a Room
            </Link>
            <Link href="/arsenal" className="btn-ghost text-base !px-6 !py-3.5">
              See the Arsenal
            </Link>
          </div>
          <p className="text-xs text-hud-amber/40 font-mono">
            * Free as in "we couldn't figure out how to charge you." Bots included at no extra charge.
          </p>

          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {[
              ["10", "Knockoff weapons"],
              ["3", "Off-brand arenas"],
              ["4", "Game modes"],
              ["16", "Players / room"],
            ].map(([n, l]) => (
              <div key={l} className="panel py-4 px-3 bg-black/30">
                <div className="text-3xl font-extrabold text-hud-cyan text-glow">{n}</div>
                <div className="label mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: "🛰️", h: "Real Online Play", p: "Host a room, share a 4-letter code, and your friends drop in. No accounts. No launchers. No 90GB update." },
            { icon: "🤖", h: "Bots That Try Their Best", p: "Fill any match with AI Spartans across four difficulty tiers, from 'Recruit' to 'Why Is It Like This.'" },
            { icon: "🔫", h: "A Whole Sandbox", p: "Regenerating shields, sticky plasma, rockets, an Energy Butterknife, and the medals to prove it." },
            { icon: "🗺️", h: "Symmetrical-ish Maps", p: "Bargain Gulch, Clearance Warehouse, and the vertical Lattice of Disappointment. Grav-lifts included." },
            { icon: "🏅", h: "Medals & a Cheap Announcer", p: "Double Kills, Killing Sprees, and a robotic voice that is contractually 'inspired by' a better one." },
            { icon: "⚡", h: "Runs in a Tab", p: "WebGL + Web Audio, no plugins. Your laptop fan will be fine. Probably." },
          ].map((f) => (
            <div key={f.h} className="panel p-5 hover:border-hud-amber/40 transition group">
              <div className="text-3xl mb-3 group-hover:scale-110 transition">{f.icon}</div>
              <h3 className="font-bold text-lg text-hud-amber mb-1">{f.h}</h3>
              <p className="text-sm text-hud-amber/60 leading-relaxed">{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MODES */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-extrabold mb-1 text-center">
          Four <span className="text-temu-orange">Modes</span>, Zero Refunds
        </h2>
        <p className="text-center text-hud-amber/50 mb-8 font-mono text-sm">pick your flavor of mayhem</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODES.map((m) => (
            <div key={m.name} className="panel p-5 text-center hover:-translate-y-1 transition">
              <div className="text-4xl mb-2">{m.icon}</div>
              <div className="chip bg-hud-panel2 text-hud-cyan border border-hud-line mb-2">{m.tag}</div>
              <h3 className="font-bold text-lg text-hud-amber">{m.name}</h3>
              <p className="text-sm text-hud-amber/55 mt-1">{m.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WEAPONS TEASER */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-3xl font-extrabold">The <span className="text-temu-orange">Arsenal</span></h2>
            <p className="text-hud-amber/50 font-mono text-sm">batteries famously not included</p>
          </div>
          <Link href="/arsenal" className="btn-ghost hidden sm:inline-flex">Full Catalog →</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredWeapons.map((id) => {
            const w = WEAPONS[id];
            return (
              <div key={id} className="panel p-4 flex gap-4 items-start">
                <div
                  className="w-12 h-12 rounded-lg shrink-0 grid place-items-center text-2xl"
                  style={{ background: `#${w.color.toString(16).padStart(6, "0")}22`, border: `1px solid #${w.color.toString(16).padStart(6, "0")}66` }}
                >
                  {id === "sword" ? "🗡️" : id === "rocket" ? "🚀" : id === "sniper" ? "🎯" : id === "needler" ? "📍" : id === "shotgun" ? "💥" : "🔫"}
                </div>
                <div>
                  <h3 className="font-bold text-hud-amber leading-tight">{w.name}</h3>
                  <p className="text-xs text-hud-amber/55 mt-1">{w.flavor}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MAPS */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-extrabold mb-6 text-center">Three <span className="text-temu-orange">Arenas</span></h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {MAP_LIST.map((m, i) => (
            <div key={m.id} className="panel overflow-hidden group">
              <div
                className="h-32 relative"
                style={{
                  background: `radial-gradient(circle at 50% 40%, #${m.ambient.toString(16).padStart(6, "0")}, #${m.fog.toString(16).padStart(6, "0")})`,
                }}
              >
                <div className="absolute inset-0 grid-bg opacity-40" />
                <div className="absolute bottom-2 left-3 text-5xl font-extrabold text-black/30">0{i + 1}</div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg text-hud-amber">{m.name}</h3>
                <p className="text-sm text-hud-amber/55 mt-1">{m.blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* REVIEWS */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-extrabold mb-1 text-center">
          ⭐ 4.6 / 5 from <span className="text-temu-orange">definitely-real</span> reviewers
        </h2>
        <p className="text-center text-hud-amber/50 mb-8 font-mono text-sm">verified purchase: unverifiable</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REVIEWS.map((r) => (
            <div key={r.n} className="panel p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-hud-cyan">{r.n}</span>
                <Stars n={r.s} />
              </div>
              <p className="text-sm text-hud-amber/70">{r.t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="panel p-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-temu-orange/15 to-hud-cyan/10" />
          <div className="relative">
            <h2 className="text-4xl font-extrabold mb-3">Ready to embarrass some bots?</h2>
            <p className="text-hud-amber/70 mb-6">No install. No login. Just pointer-lock and regret.</p>
            <Link href="/play" className="btn-primary text-lg !px-10 !py-4">▶ Enter the Arena</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-hud-line mt-8">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-hud-amber/40 font-mono">
          <p className="mb-2">
            <span className="text-hud-amber/70 font-bold">LMAO™</span> is a parody. Not affiliated with, endorsed by,
            or even slightly approved of by any "Master Chief," "Spartan," ring-shaped megastructure, or the companies
            that own them. All similarities are lovingly intentional and legally distinct.
          </p>
          <p>Built with Next.js, React, Three.js & Socket.IO · © {new Date().getFullYear()} The Bargain Bin Studios · No Spartans were refunded.</p>
        </div>
      </footer>
    </main>
  );
}
