@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-display: "Oswald", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

* {
  box-sizing: border-box;
}
html,
body {
  margin: 0;
  padding: 0;
  background: #05080a;
  color: #d8e2ea;
  font-family: var(--font-display);
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

@layer components {
  .panel {
    @apply bg-hud-panel/90 border border-hud-line rounded-xl backdrop-blur-sm;
  }
  .panel2 {
    @apply bg-hud-panel2/90 border border-hud-line rounded-lg;
  }
  .btn {
    @apply inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold tracking-wide uppercase text-sm transition-all duration-150 select-none cursor-pointer;
  }
  .btn-primary {
    @apply btn bg-gradient-to-b from-temu-orange to-temu-red text-black shadow-glow hover:brightness-110 active:scale-95;
  }
  .btn-ghost {
    @apply btn border border-hud-line text-hud-amber hover:bg-hud-panel2 hover:border-hud-amber/60;
  }
  .btn-cyan {
    @apply btn bg-gradient-to-b from-hud-cyan to-hud-blue text-black hover:brightness-110 active:scale-95;
  }
  .chip {
    @apply inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider;
  }
  .label {
    @apply text-xs uppercase tracking-[0.2em] text-hud-amber/70 font-mono;
  }
  .input {
    @apply bg-black/40 border border-hud-line rounded-lg px-3 py-2 text-hud-amber outline-none focus:border-hud-amber/70 font-mono;
  }
}

/* HUD scanline + vignette overlay */
.scanlines::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 2px,
    rgba(0, 0, 0, 0.06) 3px
  );
  mix-blend-mode: multiply;
}
.vignette::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 200px rgba(0, 0, 0, 0.7);
}

.grid-bg {
  background-image: linear-gradient(rgba(54, 231, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(54, 231, 255, 0.05) 1px, transparent 1px);
  background-size: 40px 40px;
}

.text-glow {
  text-shadow: 0 0 18px currentColor;
}

.title-shimmer {
  background: linear-gradient(90deg, #ff6a00, #ffd23f, #ff3b30, #ff6a00);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 4s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: 200% center;
  }
}

/* crosshair + hud helpers */
.no-select {
  user-select: none;
}
.crosshair-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #36e7ff;
  box-shadow: 0 0 6px #36e7ff;
}

::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-thumb {
  background: #1d3038;
  border-radius: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}

canvas {
  display: block;
  touch-action: none;
}

.fade-in {
  animation: fadein 0.4s ease both;
}
@keyframes fadein {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.pop {
  animation: pop 0.25s cubic-bezier(0.2, 1.4, 0.5, 1) both;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
