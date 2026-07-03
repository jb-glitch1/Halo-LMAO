"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { BRUSHES, FORGE_GRID, type ForgeCell, type ForgeData, encodeForge, decodeForge } from "@/game/forge";
import { hexc } from "@/game/constants";

const N = FORGE_GRID * 2 + 1; // cells per axis
const PX = 16; // canvas pixels per cell
const SIZE = N * PX;

export default function ForgePage() {
  const [cells, setCells] = useState<Map<string, number>>(new Map());
  const [brush, setBrush] = useState<number>(1); // 0 = eraser
  const [mirror, setMirror] = useState(true);
  const [name, setName] = useState("My Bargain Arena");
  const [importCode, setImportCode] = useState("");
  const [msg, setMsg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  const data: ForgeData = useMemo(
    () => ({
      v: 1,
      n: name,
      c: [...cells.entries()].map(([k, b]) => {
        const [x, z] = k.split(",").map(Number);
        return [x, z, b] as ForgeCell;
      }),
    }),
    [cells, name],
  );
  const code = useMemo(() => encodeForge(data), [data]);

  // top-down painter
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1116";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "rgba(54,231,255,0.10)";
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(i * PX + 0.5, 0); ctx.lineTo(i * PX + 0.5, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * PX + 0.5); ctx.lineTo(SIZE, i * PX + 0.5); ctx.stroke();
    }
    for (const [k, b] of cells) {
      const [x, z] = k.split(",").map(Number);
      const br = BRUSHES.find((q) => q.id === b);
      if (!br) continue;
      ctx.fillStyle = hexc(br.color);
      ctx.fillRect((x + FORGE_GRID) * PX + 1, (z + FORGE_GRID) * PX + 1, PX - 2, PX - 2);
    }
    // spawn rows + center hint
    ctx.fillStyle = "rgba(255,77,94,0.55)";
    ctx.fillRect(0, 0, SIZE, 3); // red spawns (top / -z)
    ctx.fillStyle = "rgba(58,160,255,0.55)";
    ctx.fillRect(0, SIZE - 3, SIZE, 3); // blue spawns (bottom / +z)
    ctx.fillStyle = "rgba(255,207,77,0.9)";
    ctx.fillRect(FORGE_GRID * PX + PX / 2 - 2, FORGE_GRID * PX + PX / 2 - 2, 4, 4); // hill/sniper
  }, [cells]);

  const paint = (e: React.PointerEvent) => {
    if (e.type === "pointermove" && !(e.buttons & 1)) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * N) - FORGE_GRID;
    const gz = Math.floor(((e.clientY - rect.top) / rect.height) * N) - FORGE_GRID;
    if (Math.abs(gx) > FORGE_GRID || Math.abs(gz) > FORGE_GRID) return;
    setCells((prev) => {
      const nx = new Map(prev);
      const apply = (x: number, z: number) => {
        const k = x + "," + z;
        if (brush === 0) nx.delete(k);
        else nx.set(k, brush);
      };
      apply(gx, gz);
      if (mirror && (gx !== 0 || gz !== 0)) apply(-gx, -gz); // 180° rotational symmetry
      return nx;
    });
  };

  const play = () => {
    try {
      localStorage.setItem("lmao_forge_pending", code);
      router.push("/play?forge=1");
    } catch {
      setMsg("Storage unavailable — copy the code instead.");
    }
  };
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => setMsg("Share code copied ✓"), () => setMsg("Copy failed — select it manually."));
  };
  const doImport = () => {
    const d = decodeForge(importCode);
    if (!d) return setMsg("That share code didn't validate.");
    setName(d.n);
    setCells(new Map(d.c.map(([x, z, b]) => [x + "," + z, b])));
    setMsg(`Imported "${d.n}" ✓`);
  };

  return (
    <main className="min-h-screen grid-bg">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="t-h1 mb-1">DIY <span className="text-temu-orange">Display Assembly</span></h1>
        <p className="text-hud-amber/50 font-mono text-sm mb-6">
          Forge-lite. Paint blocks top-down, share the code, fight your friends&apos; furniture. Solo &amp; vs-bots for now.
        </p>

        <div className="grid lg:grid-cols-[auto_1fr] gap-6">
          <div className="panel p-4">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              className="rounded border border-hud-line max-w-full"
              style={{ touchAction: "none", imageRendering: "pixelated", cursor: "crosshair" }}
              onPointerDown={paint}
              onPointerMove={paint}
            />
            <p className="text-[10px] text-hud-amber/40 font-mono mt-2">
              red row = red spawns · blue row = blue spawns · gold dot = hill + sniper
            </p>
          </div>

          <div className="space-y-4">
            <div className="panel p-4">
              <div className="label mb-2">Brush</div>
              <div className="flex flex-wrap gap-2">
                {BRUSHES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBrush(b.id)}
                    className={`px-3 py-2 rounded border text-sm flex items-center gap-2 ${brush === b.id ? "border-hud-cyan text-hud-cyan bg-hud-cyan/10" : "border-hud-line text-hud-amber/70 hover:text-hud-amber"}`}
                  >
                    <span className="w-3 h-3 rounded-sm" style={{ background: hexc(b.color) }} />
                    {b.name} <span className="text-hud-amber/40 font-mono text-xs">h{b.h}</span>
                  </button>
                ))}
                <button
                  onClick={() => setBrush(0)}
                  className={`px-3 py-2 rounded border text-sm ${brush === 0 ? "border-temu-red text-temu-red bg-temu-red/10" : "border-hud-line text-hud-amber/70 hover:text-hud-amber"}`}
                >
                  ⌫ Eraser
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-hud-amber/70 mt-3">
                <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
                Mirror placements (180° symmetry — keeps it fair)
              </label>
            </div>

            <div className="panel p-4 space-y-3">
              <div>
                <div className="label mb-1">Arena name</div>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="input w-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={play} className="btn-primary">▶ Play vs Bots on this map</button>
                <button onClick={copy} className="btn-ghost">📋 Copy share code</button>
                <button onClick={() => { setCells(new Map()); setMsg("Cleared."); }} className="btn-ghost !text-temu-red !border-temu-red/40">Clear</button>
              </div>
              <div className="text-xs text-hud-amber/50 font-mono">{cells.size} block{cells.size === 1 ? "" : "s"} placed{msg && <span className="text-hud-cyan"> · {msg}</span>}</div>
            </div>

            <div className="panel p-4 space-y-2">
              <div className="label">Import a share code</div>
              <textarea
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                placeholder="paste a friend's code…"
                className="input w-full h-20 text-xs break-all"
              />
              <button onClick={doImport} className="btn-cyan">Import</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
