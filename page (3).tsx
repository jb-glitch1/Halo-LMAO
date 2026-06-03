import Nav from "@/components/Nav";
import Link from "next/link";

export const metadata = { title: "How to Play — LMAO" };

const CONTROLS = [
  ["Move", "W A S D"],
  ["Look / Aim", "Mouse"],
  ["Fire", "Left Mouse"],
  ["Zoom / Scope", "Right Mouse"],
  ["Jump", "Space"],
  ["Sprint", "Left Shift"],
  ["Crouch", "Ctrl / C"],
  ["Reload", "R"],
  ["Melee", "V or F"],
  ["Throw Grenade", "G"],
  ["Swap Grenade", "X"],
  ["Swap Weapon", "Q / Scroll"],
  ["Pick Up Weapon", "E"],
  ["Scoreboard", "Tab (hold)"],
  ["Pause / Unlock", "Esc"],
];

const MEDALS = [
  ["Double Kill → Killionaire", "Two-or-more kills in a 4.5s window. The announcer escalates. So does HR."],
  ["Killing Spree → Invincible", "5, 10, 15+ kills without dying. The bots have noticed you."],
  ["Headshot / Sharpshooter", "Pop a head with a precision weapon (works best once shields are down)."],
  ["Buttered", "An Energy Butterknife kill. Smooth."],
  ["Backstab Boutique", "Assassinate from behind with a melee. Rude. Effective."],
  ["Hug Specialist", "A point-blank Boomstick kill."],
  ["Sticky Situation", "Stick someone with a plasma grenade. They will remember this."],
  ["Pink Mist (off-brand)", "Land 7 needles for the supercombine. Sparkly."],
  ["First Blood / Revenge", "Opening kill of the match, or getting back at whoever last got you."],
];

export default function HowToPlay() {
  return (
    <main className="min-h-screen grid-bg">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-4xl font-extrabold mb-1">How to <span className="text-temu-orange">Play</span></h1>
        <p className="text-hud-amber/50 font-mono text-sm mb-8">
          Click the arena to lock your mouse. Press Esc to escape (your mouse, not the regret).
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <div className="panel p-5">
            <h2 className="text-xl font-bold text-hud-amber mb-3">⌨️ Controls</h2>
            <div className="space-y-1.5">
              {CONTROLS.map(([a, k]) => (
                <div key={a} className="flex items-center justify-between text-sm border-b border-hud-line/50 pb-1.5">
                  <span className="text-hud-amber/70">{a}</span>
                  <kbd className="font-mono text-hud-cyan bg-black/40 border border-hud-line rounded px-2 py-0.5 text-xs">{k}</kbd>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel p-5">
              <h2 className="text-xl font-bold text-hud-amber mb-3">🛡️ The Golden Rule: Shields</h2>
              <p className="text-sm text-hud-amber/70 leading-relaxed">
                You have a <span className="text-hud-cyan font-semibold">rechargeable shield</span> on top of your health.
                Stop taking fire for a few seconds and it regenerates. Health only comes back once your shield is full.
                Precision weapons hit way harder once that shield is popped — that blue flash is your cue to go for the head.
              </p>
            </div>
            <div className="panel p-5">
              <h2 className="text-xl font-bold text-hud-amber mb-3">🔫 Two Weapons + Power Weapons</h2>
              <p className="text-sm text-hud-amber/70 leading-relaxed">
                You carry two weapons (swap with <kbd className="font-mono text-hud-cyan">Q</kbd>). Snipers, rockets, and
                the Energy Butterknife spawn on the map on a timer — grab them with <kbd className="font-mono text-hud-cyan">E</kbd>.
                Controlling power weapons wins matches. So does grabbing the Overshield before the other team does.
              </p>
            </div>
          </div>
        </div>

        <div className="panel p-5 mb-10">
          <h2 className="text-xl font-bold text-hud-amber mb-4">🏅 Medals worth chasing</h2>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {MEDALS.map(([m, d]) => (
              <div key={m} className="border-l-2 border-temu-orange/60 pl-3">
                <div className="font-semibold text-temu-gold text-sm">{m}</div>
                <div className="text-xs text-hud-amber/60">{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5 mb-10">
          <h2 className="text-xl font-bold text-hud-amber mb-3">🎮 Playing with friends</h2>
          <ol className="text-sm text-hud-amber/70 space-y-2 list-decimal list-inside">
            <li>Hit <span className="text-hud-cyan">Play</span>, set your name &amp; color.</li>
            <li>Choose <span className="text-hud-cyan">Host a Room</span> — you’ll get a 4-letter code.</li>
            <li>Friends pick <span className="text-hud-cyan">Join a Room</span> and type the code.</li>
            <li>The host sets mode, map, bots &amp; score limit. Everyone hits <span className="text-hud-green">Ready</span>.</li>
            <li>Host smashes <span className="text-temu-orange">Start</span>. Empty slots fill with bots. Mayhem ensues.</li>
          </ol>
          <p className="text-xs text-hud-amber/40 mt-3 font-mono">
            Tip: no friends online? <Link href="/play" className="text-hud-cyan underline">Play vs Bots</Link> instantly. The bots are always free and emotionally available.
          </p>
        </div>

        <div className="text-center">
          <Link href="/play" className="btn-primary text-lg !px-10 !py-4">▶ Got it, let me in</Link>
        </div>
      </div>
    </main>
  );
}
