# Pushing this to github.com/jb-glitch1/Halo-LMAO

This folder is the complete **LMAO — Lethal Mayhem: Arena Online** project at the repo root,
with git already initialized and one commit on `main`.

## 1. Push it (3 commands)

```bash
cd halo-lmao
git remote add origin https://github.com/jb-glitch1/Halo-LMAO.git
git push -u origin main
```

If GitHub rejects the push because the repo already has a commit (e.g. an auto-created
README), the repo was just made for this so it's safe to overwrite:

```bash
git push -u origin main --force
```

(If you use SSH instead of HTTPS, swap the remote URL for
`git@github.com:jb-glitch1/Halo-LMAO.git`.)

## 2. Run it locally

```bash
npm install
npm run dev      # → http://localhost:3000
```

Production: `npm run build && npm start` (honors `$PORT`). It runs on a custom Node server
(`server.js`) that serves the Next.js site **and** the Socket.IO multiplayer relay from one
process — deploy to any Node host (Render, Railway, Fly, a VPS…).

See `README.md` for controls, modes, and architecture.
