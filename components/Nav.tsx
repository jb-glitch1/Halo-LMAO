"use client";
import Link from "next/link";
import { useState } from "react";

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

const LINKS = [
  { href: "/arsenal", label: "Arsenal" },
  { href: "/forge", label: "Forge" },
  { href: "/how-to-play", label: "How to Play" },
  { href: "/about", label: "About" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-hud-line">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden sm:flex items-center gap-1 text-sm font-mono uppercase tracking-wider">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 rounded text-hud-amber/70 hover:text-hud-amber hover:bg-hud-panel2 transition">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/play" className="btn-primary !py-2 !px-4">
            ▶ Play Free*
          </Link>
          <button
            aria-label="menu"
            aria-expanded={open}
            className="sm:hidden px-3 py-2 rounded border border-hud-line text-hud-amber"
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <div className="sm:hidden border-t border-hud-line bg-black/80 backdrop-blur-md px-4 py-2 flex flex-col text-sm font-mono uppercase tracking-wider">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-3 py-3 rounded text-hud-amber/80 hover:text-hud-amber hover:bg-hud-panel2 transition">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
