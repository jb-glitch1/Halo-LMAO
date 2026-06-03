import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LMAO — Lethal Mayhem: Arena Online",
  description:
    "The Temu-tier Halo. A legally-distinct, suspiciously-affordable browser arena shooter. Host a room, grab your knockoff arsenal, finish the fight (knockoff).",
  keywords: ["browser shooter", "halo", "fps", "multiplayer", "webgl", "arena", "lmao"],
  authors: [{ name: "The Bargain Bin Studios" }],
  openGraph: {
    title: "LMAO — Lethal Mayhem: Arena Online",
    description: "Budget Halo in your browser. Host a room. Bring friends. No refunds.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05080a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Fonts load at runtime; gracefully falls back to system fonts if offline. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
