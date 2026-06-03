import Link from "next/link";

export function Logo({ size = "text-2xl" }: { size?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2 group">
      <span className="inline-block w-8 h-8 rounded-md bg-gradient-to-br from-temu-orange to-temu-red shadow-glow grid place-items-center text-black font-extrabold">
        L
      </span>
      <span className={`font-extrabold tracking-tight ${size}`}>
        <span className="title-shimmer">LMAO</span>
        <span className="text-hud-amber/50 text-xs font-mono align-top ml-1">™</span>
      </span>
    </Link>
  );
}

export default function Nav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-hud-line">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden sm:flex items-center gap-1 text-sm font-mono uppercase tracking-wider">
          <Link href="/arsenal" className="px-3 py-2 rounded text-hud-amber/70 hover:text-hud-amber hover:bg-hud-panel2 transition">
            Arsenal
          </Link>
          <Link href="/how-to-play" className="px-3 py-2 rounded text-hud-amber/70 hover:text-hud-amber hover:bg-hud-panel2 transition">
            How to Play
          </Link>
          <Link href="/about" className="px-3 py-2 rounded text-hud-amber/70 hover:text-hud-amber hover:bg-hud-panel2 transition">
            About
          </Link>
        </div>
        <Link href="/play" className="btn-primary !py-2 !px-4">
          ▶ Play Free*
        </Link>
      </div>
    </nav>
  );
}
