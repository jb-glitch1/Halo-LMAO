import Nav from "@/components/Nav";
import Link from "next/link";

export const metadata = { title: "About — LMAO" };

export default function About() {
  return (
    <main className="min-h-screen grid-bg">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="t-h1 mb-1">About <span className="text-temu-orange">LMAO</span></h1>
        <p className="text-hud-amber/50 font-mono text-sm mb-8">Lethal Mayhem: Arena Online · est. whenever this finished building</p>

        <div className="panel p-6 mb-6">
          <h2 className="text-xl font-bold text-hud-amber mb-2">What is this?</h2>
          <p className="text-hud-amber/70 leading-relaxed">
            LMAO is a love letter to arena shooters — written on the back of a clearance receipt. It’s a fully
            in-browser, first-person multiplayer FPS with regenerating shields, a sandbox of suspiciously-familiar
            weapons, a drivable shopping cart, seven game modes, five arenas (plus a random-arena generator), bots,
            medals, and a robotic announcer who clearly has notes.
            Think “the big green-armored space-ranger game,” but value-engineered, legally distinct, and free.
          </p>
        </div>

        <div className="panel p-6 mb-6">
          <h2 className="text-xl font-bold text-hud-amber mb-2">How does the online play work?</h2>
          <p className="text-hud-amber/70 leading-relaxed">
            One player <span className="text-hud-cyan">hosts</span> the match — their browser runs the authoritative
            game simulation. Everyone else joins with a 4-letter room code and streams their inputs up while the host
            broadcasts the world back down, 20 times a second. A tiny relay server just shuttles the messages between
            peers; it doesn’t run the game. Empty slots are filled by bots so a match is never one-and-done.
          </p>
        </div>

        <div className="panel p-6 mb-6">
          <h2 className="text-xl font-bold text-hud-amber mb-2">Under the hood</h2>
          <ul className="text-hud-amber/70 space-y-1.5 text-sm">
            <li>▹ <span className="text-hud-cyan font-mono">Next.js + React</span> — site, portal &amp; deployment shell</li>
            <li>▹ <span className="text-hud-cyan font-mono">Three.js / WebGL</span> — the 3D renderer &amp; viewmodels</li>
            <li>▹ <span className="text-hud-cyan font-mono">Custom TS engine</span> — physics, weapons, AI, vehicles, and seven modes, all framework-free (and unit-tested)</li>
            <li>▹ <span className="text-hud-cyan font-mono">Socket.IO</span> — rooms, lobby, host↔client relay</li>
            <li>▹ <span className="text-hud-cyan font-mono">Web Audio API</span> — every sound is synthesized live (no audio files)</li>
          </ul>
        </div>

        <div className="panel p-6 mb-8 border-temu-red/30">
          <h2 className="text-xl font-bold text-temu-red mb-2">The Legal Bit™</h2>
          <p className="text-hud-amber/60 text-sm leading-relaxed">
            LMAO is an affectionate parody and a tech demo. It is not affiliated with, sponsored by, endorsed by, or
            in any way connected to any existing video game, franchise, “Master Chief,” “Spartan,” energy sword,
            warthog, halo ring, or the corporations that own them. Every name here is intentionally goofy and legally
            distinct. No actual products were knocked off in the making of this — only honored, cheaply.
          </p>
        </div>

        <div className="text-center">
          <Link href="/play" className="btn-primary text-lg !px-10 !py-4">▶ Enough reading, let’s fight</Link>
        </div>
      </div>
    </main>
  );
}
