# LMAO — Lethal Mayhem: Arena Online

**The Temu-tier Halo.** A fully in-browser, first-person multiplayer arena shooter built with
Next.js + React + Three.js + Socket.IO. Host a room, share a 4-letter code, and finish the
fight.<sup>(knockoff)</sup>

![modes](https://img.shields.io/badge/modes-7-orange) ![weapons](https://img.shields.io/badge/weapons-11-cyan) ![maps](https://img.shields.io/badge/maps-5%2B%E2%88%9E-green) ![tests](https://img.shields.io/badge/sim%20tests-passing-brightgreen)

---

## Quick start

```bash
cd lmao
npm install
npm run dev        # http://localhost:3000  (custom Next.js + Socket.IO server)
```

Production:

```bash
npm run build
npm start          # honors $PORT (default 3000) and $HOST
npm test           # headless unit tests for the framework-free game sim
```

> The app runs on a **custom Node server** (`server.js`) that serves the Next.js site *and*
> the Socket.IO multiplayer relay from the same process. Deploy it anywhere that runs a
> long-lived Node process (Render, Railway, Fly, a VPS, etc.). `npm start` is all you need.

---

## How to play

Click the arena to lock your mouse. **Esc** releases it.

| Action | Key |
| --- | --- |
| Move | `W A S D` |
| Look / aim | Mouse |
| Fire | Left mouse |
| Zoom / scope | Right mouse |
| Jump | `Space` |
| Sprint | `Shift` |
| Crouch | `Ctrl` / `C` |
| Reload | `R` |
| Melee | `V` / `F` |
| Grenade | `G` (swap type `X`) |
| Swap weapon | `Q` / scroll |
| Pick up weapon | `E` |
| Scoreboard | hold `Tab` |

**Shields regenerate** when you stop taking fire; health only returns once shields are full.
Precision weapons crush once a shield is popped (the blue flash) — go for the head.

### Modes
- **Slayer** (FFA) · **Team Slayer** (Red vs Blue) · **King of the Hill** · **Oddball**
- **Black Friday** (Infection — melee horde vs survivors) · **Capture the Banner** (CTF) · **Clearance Ladder** (Gun Game)

### Maps
- **Bargain Gulch** (Blood-Gulch-on-clearance) · **Clearance Warehouse** (CQB) · **Lattice of Disappointment** (vertical) · **Aisle Seven** (symmetric) · **Loading Dock**
- ...plus an infinite **Bargain Bin Generator** for fresh random arenas (solo).

### Toys
- 🛒 **The Wartrolley** — a driveable shopping-cart 'hog with a cannon (and splatters). Press `E` near one.
- 💣 **Trip mines** (cycle grenade with `X`), a scoped **DMR**, and hidden **Skulls** that toggle chaos modifiers.
- Selectable announcers, a synthesized choir, positional audio, a directional damage indicator, and a Loyalty Program that tracks your lifetime stats. Plays on **desktop and touch/mobile**.

---

## Multiplayer model

One player **hosts** — their browser runs the authoritative simulation (`game/engine.ts`).
Everyone else **joins** with a room code; clients stream inputs up and the host broadcasts
world snapshots back down ~20 Hz. The Node server is a dumb relay (rooms, lobby, message
shuttling) — it never runs the game. Empty slots fill with bots so a match is never empty.

- **Play vs Bots** runs a host session locally with no socket at all (pure offline).
- **Host a Room** / **Join a Room** use the Socket.IO relay.

---

## Architecture

```
server.js                 Custom Next.js server + Socket.IO room relay
app/                      Next.js App Router — portal, arsenal, how-to-play, about, /play
components/               Nav, Lobby, GameClient (loop), HUD
game/                     Framework-free game core (also unit-testable in Node):
  engine.ts               Authoritative sim: movement, weapons, modes, scoring, medals
  physics.ts movement.ts  Capsule-vs-world collision, raycasts, shared movement step
  bots.ts                 LoS bot AI (acquire, strafe, objective roam, skill-scaled aim)
  maps.ts weapons.ts      Content: 3 arenas, 10 weapons, loadouts, power-ups
  renderer.ts             Three.js scene, viewmodels, FX (client only)
  audio.ts                Synthesized Web Audio SFX + announcer (no audio files)
  input.ts                Pointer lock + client-side movement prediction
  net.ts                  HostSession / ClientSession / LobbyClient over Socket.IO
```

The simulation is **pure TypeScript with no DOM/Three dependency**, so it runs identically on
the host's browser and in headless Node tests. Three.js is code-split into the game chunk and
never blocks the marketing pages.

---

## Legal

LMAO is an affectionate **parody** and tech demo. Not affiliated with, endorsed by, or
connected to any existing game, franchise, "Master Chief," "Spartan," energy sword, or halo
ring. Every name is intentionally goofy and legally distinct.

Built with Next.js, React, Three.js & Socket.IO.

**Note:** the Google Fonts stylesheet (Oswald / JetBrains Mono) is the only external
runtime dependency — everything else is procedural and served from this process. If the
CDN is unreachable the UI falls back to system fonts.

**License:** no license file yet, which legally means **all rights reserved** by the
repository owner. If you want others to be able to use/modify this, add a LICENSE
(MIT is the common choice for projects like this) — that's an owner decision.
