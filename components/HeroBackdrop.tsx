"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

// Deterministic PRNG so server and client render identical stars (no hydration mismatch).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cinematic Halo-ish hero backdrop: gradient dusk sky, a giant ring arcing across
 * the sky, a starfield, and a dark foreground ridge. Pure SVG/CSS + a subtle mouse
 * parallax. Renders nothing heavy — the game bundle is never pulled in here.
 */
export default function HeroBackdrop() {
  const [par, setPar] = useState({ x: 0, y: 0 });
  const reduce = useRef(false);

  const stars = useMemo(() => {
    const rnd = mulberry32(20240611);
    return Array.from({ length: 80 }, () => ({
      x: rnd() * 100,
      y: rnd() * 62, // keep them in the sky, above the ridge
      r: rnd() * 1.1 + 0.3,
      o: rnd() * 0.5 + 0.35,
      d: rnd() * 4,
    }));
  }, []);

  useEffect(() => {
    reduce.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce.current) return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setPar({ x, y });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* sky gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, #05070e 0%, #081320 42%, #0b2233 68%, #123047 85%, #173a55 100%)",
        }}
      />
      {/* warm horizon glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 116%, rgba(255,140,40,0.22) 0%, rgba(54,231,255,0.10) 38%, transparent 64%)",
        }}
      />

      {/* stars */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ transform: `translate(${par.x * 4}px, ${par.y * 4}px)` }}>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe0ff" opacity={s.o}
            className="hero-twinkle" style={{ animationDelay: `${s.d}s` }} />
        ))}
      </svg>

      {/* the ring arcing across the sky */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice"
        style={{ transform: `translate(${par.x * 12}px, ${par.y * 7}px)` }}>
        <defs>
          <filter id="ringglow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        {/* soft outer glow */}
        <ellipse cx="500" cy="760" rx="940" ry="540" fill="none" stroke="#7fd6ff" strokeWidth="46" opacity="0.16" filter="url(#ringglow)" />
        {/* main band */}
        <ellipse cx="500" cy="760" rx="940" ry="540" fill="none" stroke="#9fe0ff" strokeWidth="26" opacity="0.22" />
        {/* inner rim highlight */}
        <ellipse cx="500" cy="748" rx="922" ry="528" fill="none" stroke="#e6f7ff" strokeWidth="2.5" opacity="0.5" />
        <ellipse cx="500" cy="772" rx="956" ry="552" fill="none" stroke="#36e7ff" strokeWidth="1.5" opacity="0.4" />
      </svg>

      {/* foreground ridge silhouette */}
      <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 1000 220" preserveAspectRatio="none"
        style={{ height: "32%", transform: `translate(${par.x * -5}px, 0)` }}>
        <path d="M0,220 L0,150 L120,120 L240,158 L360,104 L500,150 L640,96 L780,150 L880,120 L1000,160 L1000,220 Z"
          fill="#05070c" />
        <path d="M0,150 L120,120 L240,158 L360,104 L500,150 L640,96 L780,150 L880,120 L1000,160"
          fill="none" stroke="#1c4a5e" strokeWidth="1.5" opacity="0.6" />
      </svg>

      {/* vignette to seat the content */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 -120px 160px rgba(0,0,0,0.55), inset 0 60px 120px rgba(0,0,0,0.45)" }} />
    </div>
  );
}
