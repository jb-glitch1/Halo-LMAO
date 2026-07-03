// Custom Next.js server with Socket.IO. Hosts the site AND the multiplayer relay.
// The relay is intentionally dumb: it shuttles lobby state, client inputs, and
// host snapshots between peers. The host's browser runs the authoritative game.

// Resolve run mode before requiring Next (it reads NODE_ENV at require time).
// `npm start` passes --prod so the script works on Windows shells too.
const prod = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
if (!process.env.NODE_ENV) process.env.NODE_ENV = prod ? "production" : "development";

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const REG = require("./shared/registry");

const dev = !prod;
const hostname = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT "${process.env.PORT}" — expected an integer 1-65535.`);
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---- room state ----
/** @type {Map<string, any>} */
const rooms = new Map();
const MAX_ROOMS = 200; // soft cap so createRoom spam can't grow memory unbounded

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function sanitizeName(n) {
  return String(n || "Spartan").slice(0, 16).replace(/[^\w \-]/g, "") || "Spartan";
}

const isFfaMode = (m) => REG.FFA_MODES.includes(m);

function defaultConfig(c = {}) {
  return {
    mode: REG.MODE_IDS.includes(c.mode) ? c.mode : "team",
    mapId: REG.MAP_IDS.includes(c.mapId) ? c.mapId : "gulch",
    scoreLimit: Math.max(3, Math.min(500, parseInt(c.scoreLimit) || 25)),
    timeLimitSec: Math.max(60, Math.min(1800, parseInt(c.timeLimitSec) || 420)),
    botCount: Math.max(0, Math.min(REG.MAX_BOTS, parseInt(c.botCount ?? 6))),
    botSkill: Math.max(0, Math.min(1, typeof c.botSkill === "number" ? c.botSkill : 0.6)),
    friendlyFire: !!c.friendlyFire,
    startingLoadout: typeof c.startingLoadout === "string" ? c.startingLoadout : "recruit",
    skulls: Array.isArray(c.skulls) ? c.skulls.filter((s) => REG.SKULL_IDS.includes(s)).slice(0, REG.SKULL_IDS.length) : undefined,
  };
}

function roomInfo(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    config: room.config,
    state: room.state,
    players: [...room.players.values()],
  };
}

function broadcastLobby(io, room) {
  io.to(room.code).emit("lobby", roomInfo(room));
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      handle(req, res, parse(req.url, true));
    } catch (e) {
      res.statusCode = 500;
      res.end("internal error");
    }
  });

  // No CORS config: same-origin only. The site and relay share one origin, so
  // cross-origin browsers (i.e. other websites) can't drive the relay.
  const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  io.on("connection", (socket) => {
    socket.data.code = null;

    socket.on("createRoom", ({ profile, config }, cb) => {
      if (socket.data.code) leaveRoom(socket, socket.data.code); // one room per socket
      if (rooms.size >= MAX_ROOMS) {
        return typeof cb === "function" && cb({ error: "Server is at room capacity. Try again soon." });
      }
      const code = makeCode();
      const cfg = defaultConfig(config);
      const player = {
        id: socket.id,
        name: sanitizeName(profile?.name),
        team: isFfaMode(cfg.mode) ? "ffa" : "red",
        ready: false,
        isHost: true,
        loadout: profile?.loadout || "recruit",
        spartanColor: typeof profile?.color === "number" ? profile.color : 0x3aa0ff,
      };
      const room = {
        code,
        hostId: socket.id,
        config: cfg,
        state: "lobby",
        players: new Map([[socket.id, player]]),
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.code = code;
      if (typeof cb === "function") cb({ code });
      broadcastLobby(io, room);
    });

    socket.on("joinRoom", ({ code, profile }, cb) => {
      const room = rooms.get(String(code || "").toUpperCase());
      if (!room) return cb && cb({ error: "Room not found. Check the code." });
      if (room.state !== "lobby") return cb && cb({ error: "That match already started." });
      if (room.players.size >= REG.MAX_PLAYERS) return cb && cb({ error: `Room is full (${REG.MAX_PLAYERS} max).` });
      if (socket.data.code && socket.data.code !== room.code) leaveRoom(socket, socket.data.code);
      // balance team for new joiner
      let red = 0, blue = 0;
      for (const p of room.players.values()) {
        if (p.team === "red") red++;
        else if (p.team === "blue") blue++;
      }
      const team = isFfaMode(room.config.mode) ? "ffa" : red <= blue ? "red" : "blue";
      const player = {
        id: socket.id,
        name: sanitizeName(profile?.name),
        team,
        ready: false,
        isHost: false,
        loadout: profile?.loadout || "recruit",
        spartanColor: typeof profile?.color === "number" ? profile.color : 0xff4d5e,
      };
      room.players.set(socket.id, player);
      socket.join(room.code);
      socket.data.code = room.code;
      if (typeof cb === "function") cb({ ok: true });
      broadcastLobby(io, room);
    });

    socket.on("updateSelf", ({ code, patch }) => {
      const room = rooms.get(code);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p) return;
      if (patch.team === "red" || patch.team === "blue" || patch.team === "ffa") p.team = patch.team;
      if (typeof patch.ready === "boolean") p.ready = patch.ready;
      if (typeof patch.loadout === "string") p.loadout = patch.loadout;
      if (typeof patch.spartanColor === "number") p.spartanColor = patch.spartanColor;
      broadcastLobby(io, room);
    });

    socket.on("updateConfig", ({ code, patch }) => {
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      room.config = defaultConfig({ ...room.config, ...patch });
      // fix team assignments when switching between team-pool and ffa-pool modes
      if (isFfaMode(room.config.mode)) {
        for (const p of room.players.values()) p.team = "ffa";
      } else {
        let red = 0, blue = 0;
        for (const p of room.players.values()) {
          if (p.team === "ffa") {
            p.team = red <= blue ? "red" : "blue";
          }
          if (p.team === "red") red++;
          else blue++;
        }
      }
      broadcastLobby(io, room);
    });

    socket.on("startMatch", ({ code }) => {
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      room.state = "in-game";
      io.to(room.code).emit("startMatch", {
        config: room.config,
        roster: [...room.players.values()],
        hostId: room.hostId,
      });
      broadcastLobby(io, room);
    });

    socket.on("returnLobby", ({ code }) => {
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      room.state = "lobby";
      for (const p of room.players.values()) p.ready = false;
      io.to(room.code).emit("returnLobby");
      broadcastLobby(io, room);
    });

    // ---- in-match relay (members only) ----
    socket.on("input", ({ code, input }) => {
      const room = rooms.get(code);
      if (!room || !room.players.has(socket.id)) return;
      io.to(room.hostId).emit("clientInput", { id: socket.id, input });
    });

    socket.on("snapshot", ({ code, snap }) => {
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      socket.to(room.code).emit("snapshot", { snap });
    });

    socket.on("chat", ({ code, text }) => {
      const room = rooms.get(code);
      if (!room) return;
      const p = room.players.get(socket.id);
      if (!p) return;
      io.to(room.code).emit("chat", {
        from: socket.id,
        name: p.name,
        text: String(text || "").slice(0, 160),
      });
    });

    socket.on("leaveRoom", ({ code }) => leaveRoom(socket, code));

    socket.on("disconnect", () => {
      if (socket.data.code) leaveRoom(socket, socket.data.code);
    });

    function leaveRoom(sock, code) {
      const room = rooms.get(code);
      if (!room) return;
      const wasHost = room.hostId === sock.id;
      room.players.delete(sock.id);
      sock.leave(code);
      sock.data.code = null;
      if (room.players.size === 0) {
        rooms.delete(code);
        return;
      }
      if (wasHost) {
        if (room.state === "lobby") {
          // migrate host to the next player
          const next = room.players.keys().next().value;
          room.hostId = next;
          const np = room.players.get(next);
          if (np) np.isHost = true;
          broadcastLobby(io, room);
        } else {
          // host left mid-match: end it for everyone
          io.to(room.code).emit("hostLeft");
          rooms.delete(code);
        }
      } else {
        // tell the host's engine to drop this player
        io.to(room.hostId).emit("peerLeft", sock.id);
        broadcastLobby(io, room);
      }
    }
  });

  server.listen(port, hostname, () => {
    console.log(`\n  LMAO — Lethal Mayhem: Arena Online`);
    console.log(`  ▶ http://localhost:${port}  (env: ${dev ? "dev" : "prod"})\n`);
  });
});
