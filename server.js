// Custom Next.js server with Socket.IO. Hosts the site AND the multiplayer relay.
// The relay is intentionally dumb: it shuttles lobby state, client inputs, and
// host snapshots between peers. The host's browser runs the authoritative game.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---- room state ----
/** @type {Map<string, any>} */
const rooms = new Map();

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

function defaultConfig(c = {}) {
  const modes = ["slayer", "team", "koth", "oddball"];
  const maps = ["gulch", "warehouse", "lattice"];
  return {
    mode: modes.includes(c.mode) ? c.mode : "team",
    mapId: maps.includes(c.mapId) ? c.mapId : "gulch",
    scoreLimit: Math.max(5, Math.min(500, parseInt(c.scoreLimit) || 25)),
    timeLimitSec: Math.max(60, Math.min(1800, parseInt(c.timeLimitSec) || 420)),
    botCount: Math.max(0, Math.min(15, parseInt(c.botCount ?? 6))),
    botSkill: Math.max(0, Math.min(1, typeof c.botSkill === "number" ? c.botSkill : 0.6)),
    friendlyFire: !!c.friendlyFire,
    startingLoadout: typeof c.startingLoadout === "string" ? c.startingLoadout : "recruit",
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

  const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  io.on("connection", (socket) => {
    socket.data.code = null;

    socket.on("createRoom", ({ profile, config }, cb) => {
      const code = makeCode();
      const player = {
        id: socket.id,
        name: sanitizeName(profile?.name),
        team: (config?.mode === "slayer" ? "ffa" : "red"),
        ready: false,
        isHost: true,
        loadout: profile?.loadout || "recruit",
        spartanColor: typeof profile?.color === "number" ? profile.color : 0x3aa0ff,
      };
      const room = {
        code,
        hostId: socket.id,
        config: defaultConfig(config),
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
      if (room.players.size >= 16) return cb && cb({ error: "Room is full (16 max)." });
      // balance team for new joiner
      let red = 0, blue = 0;
      for (const p of room.players.values()) {
        if (p.team === "red") red++;
        else if (p.team === "blue") blue++;
      }
      const team = room.config.mode === "slayer" ? "ffa" : red <= blue ? "red" : "blue";
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
      // if switching to/from slayer, fix team assignments
      if (room.config.mode === "slayer") {
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

    // ---- in-match relay ----
    socket.on("input", ({ code, input }) => {
      const room = rooms.get(code);
      if (!room) return;
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
      io.to(room.code).emit("chat", {
        from: socket.id,
        name: p ? p.name : "???",
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
