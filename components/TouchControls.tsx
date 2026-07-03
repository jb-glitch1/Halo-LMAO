"use client";
import React, { useRef, useState } from "react";
import type { InputManager } from "@/game/input";

function TouchBtn({ im, name, label, cls }: { im: InputManager; name: string; label: string; cls: string }) {
  return (
    <button
      aria-label={name}
      className={`grid place-items-center rounded-full bg-black/40 border border-hud-cyan/40 text-hud-cyan font-bold leading-none active:bg-hud-cyan/30 ${cls}`}
      onPointerDown={(e) => { e.preventDefault(); im.setTouchBtn(name, true); }}
      onPointerUp={(e) => { e.preventDefault(); im.setTouchBtn(name, false); }}
      onPointerLeave={() => im.setTouchBtn(name, false)}
      onPointerCancel={() => im.setTouchBtn(name, false)}
    >
      {label}
    </button>
  );
}

// On-screen controls for touch devices: left thumbstick (move), right-side drag
// (look), and action buttons. Rendered only when the touch UI is enabled.
export default function TouchControls({ im, onPause, onScoreboard }: { im: InputManager; onPause: () => void; onScoreboard: (open: boolean) => void }) {
  const R = 56;
  const stick = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const stickDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
  };
  const stickMove = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    let dx = e.clientX - stick.current.ox;
    let dy = e.clientY - stick.current.oy;
    const len = Math.hypot(dx, dy) || 1;
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    setKnob({ x: dx, y: dy });
    im.setTouchMove(dx / R, -dy / R); // pushing up = forward
  };
  const stickUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    setKnob({ x: 0, y: 0 });
    im.setTouchMove(0, 0);
  };

  const lookDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    if (look.current?.id !== e.pointerId) return;
    im.touchLook(e.clientX - look.current.x, e.clientY - look.current.y);
    look.current.x = e.clientX;
    look.current.y = e.clientY;
  };
  const lookUp = (e: React.PointerEvent) => {
    if (look.current?.id === e.pointerId) look.current = null;
  };

  return (
    <div className="absolute inset-0 z-20" style={{ touchAction: "none" }}>
      {/* look layer — captures drags anywhere not covered by a control */}
      <div className="absolute inset-0" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />

      <button aria-label="pause" onClick={onPause} className="absolute top-2 right-2 bg-black/40 border border-hud-line rounded px-3 py-1 text-hud-amber text-sm">⏸</button>
      <button
        aria-label="scoreboard (hold)"
        className="absolute top-2 right-14 bg-black/40 border border-hud-line rounded px-3 py-1 text-hud-amber text-sm"
        onPointerDown={(e) => { e.preventDefault(); onScoreboard(true); }}
        onPointerUp={() => onScoreboard(false)}
        onPointerLeave={() => onScoreboard(false)}
        onPointerCancel={() => onScoreboard(false)}
      >
        ▤
      </button>

      {/* movement stick (bottom-left) */}
      <div
        className="absolute left-5 bottom-5 w-32 h-32 rounded-full bg-black/30 border border-hud-line"
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
      >
        <div className="absolute w-14 h-14 rounded-full bg-hud-cyan/30 border border-hud-cyan/60" style={{ left: 36, top: 36, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>

      {/* action buttons (bottom-right) */}
      <div className="absolute right-4 bottom-4 grid grid-cols-3 gap-2 w-52">
        <TouchBtn im={im} name="fire" label="🔫" cls="w-20 h-20 col-span-2 text-3xl" />
        <TouchBtn im={im} name="jump" label="⤒" cls="w-16 h-16 text-2xl" />
        <TouchBtn im={im} name="reload" label="⟳" cls="w-14 h-14 text-xl" />
        <TouchBtn im={im} name="zoom" label="🔭" cls="w-14 h-14 text-lg" />
        <TouchBtn im={im} name="grenade" label="💣" cls="w-14 h-14 text-lg" />
        <TouchBtn im={im} name="pickup" label="E" cls="w-14 h-14 text-lg" />
        <TouchBtn im={im} name="melee" label="🔪" cls="w-14 h-14 text-lg" />
        <TouchBtn im={im} name="crouch" label="⤓" cls="w-14 h-14 text-xl" />
        <TouchBtn im={im} name="swap" label="↔" cls="w-14 h-14 text-xl" />
      </div>
    </div>
  );
}
