/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Budget "Temu" branding accents
        temu: {
          orange: "#ff6a00",
          red: "#ff3b30",
          gold: "#ffd23f",
        },
        // LMAO / Halo-ish HUD palette
        hud: {
          bg: "#05080a",
          panel: "#0b1116",
          panel2: "#10191f",
          line: "#1d3038",
          amber: "#ffcf4d",
          green: "#5dff9b",
          cyan: "#36e7ff",
          blue: "#3aa0ff",
          red: "#ff4d5e",
          purple: "#b06bff", // Covenant knockoff
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Oswald", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(255,106,0,0.35)",
        glowamber: "0 0 24px rgba(255,207,77,0.30)",
        glowcyan: "0 0 24px rgba(54,231,255,0.30)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        flicker: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        floaty: "floaty 4s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        scan: "scan 6s linear infinite",
        flicker: "flicker 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
