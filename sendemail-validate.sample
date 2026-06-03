import { io, Socket } from "socket.io-client";
import type {
  Snapshot,
  PlayerInput,
  MatchConfig,
  MapDef,
  Team,
  LobbyPlayer,
  RoomInfo,
} from "./types";
import { Engine } from "./engine";
import { createEngine } from "./createEngine";
import { getMap } from "./maps";
import { Predictor } from "./input";
import { SNAPSHOT_HZ, SPARTAN_COLORS } from "./constants";
import type { LocalRender } from "./renderer";
import { weaponDef } from "./weapons";

let _socket: Socket | null = null;
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io({ transports: ["websocket", "polling"], autoConnect: true });
  }
  return _socket;
}

const BOT_NAMES = [
  "ClearanceChief", "MisterChief", "Spar-Tin", "GenericGrunt", "OffBrandODST",
  "BargainBoi", "RefurbRecon", "KnockoffKilla", "NoNameNancy", "DiscountDan",
  "WishWarrior", "TemuTrooper", "AliExpressAce", "FauxFalcon", "BootlegBlaze",
  "404Soldier", "PlaceholderPete", "ValuePack", "FinalSale", "AsIsAndy",
];

export interface SessionLike {
  localId: string;
  localTeam: Team;
  isHost: boolean;
  map: MapDef;
  update(dtMs: number, now: number, input: PlayerInput): void;
  getSnapshot(): Snapshot | null;
  getLocalRender(): LocalRender;
  stop(): void;
}

// ---------------------------------------------------------------------------
// HOST (also used for solo play): owns the authoritative Engine.
// ---------------------------------------------------------------------------
export class HostSession implements SessionLike {
  engine: Engine;
  socket: Socket | null;
  roomCode: string;
  localId: string;
  localTeam: Team;
  isHost = true;
  map: MapDef;
  private lastSnap: Snapshot | null = null;
  private lastBroadcast = 0;
  private accum = 0;
  private readonly fixed = 1 / 60;
  private stopped = false;

  constructor(opts: {
    socket: Socket | null;
    roomCode: string;
    localId: string;
    config: MatchConfig;
    roster: LobbyPlayer[];
  }) {
    this.socket = opts.socket;
    this.roomCode = opts.roomCode;
    this.localId = opts.localId;
    this.map = getMap(opts.config.mapId);
    this.engine = createEngine(opts.config);

    const now = performance.now();
    // add humans
    for (const lp of opts.roster) {
      this.engine.addPlayer(lp.id, {
        name: lp.name,
        team: lp.team,
        isBot: false,
        loadout: lp.loadout,
        color: lp.spartanColor,
      });
    }
    this.localTeam = opts.roster.find((r) => r.id === this.localId)?.team || "ffa";
    // fill with bots
    this.addBots(opts.config, opts.roster);
    this.engine.start(now);

    if (this.socket) this.wireSocket();
  }

  private addBots(config: MatchConfig, roster: LobbyPlayer[]) {
    const isTeam = config.mode === "team" || config.mode === "koth" || config.mode === "oddball";
    const count = Math.max(0, Math.min(config.botCount, 15));
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let redH = roster.filter((r) => r.team === "red").length;
    let blueH = roster.filter((r) => r.team === "blue").length;
    for (let i = 0; i < count; i++) {
      let team: Team = "ffa";
      if (isTeam) {
        team = redH <= blueH ? "red" : "blue";
        if (team === "red") redH++;
        else blueH++;
      }
      const color = SPARTAN_COLORS[(i + 4) % SPARTAN_COLORS.length];
      this.engine.addPlayer("bot_" + i, {
        name: names[i % names.length],
        team,
        isBot: true,
        botSkill: config.botSkill,
        color,
      });
    }
  }

  private wireSocket() {
    const s = this.socket!;
    s.on("clientInput", (msg: { id: string; input: PlayerInput }) => {
      this.engine.setInput(msg.id, msg.input);
    });
    s.on("peerJoined", (lp: LobbyPlayer) => {
      if (this.engine.players.has(lp.id)) return;
      this.engine.addPlayer(lp.id, {
        name: lp.name,
        team: lp.team,
        isBot: false,
        loadout: lp.loadout,
        color: lp.spartanColor,
      });
    });
    s.on("peerLeft", (id: string) => this.engine.removePlayer(id));
  }

  update(dtMs: number, now: number, input: PlayerInput) {
    if (this.stopped) return;
    this.engine.setInput(this.localId, input);
    this.accum += Math.min(0.1, dtMs / 1000);
    let steps = 0;
    while (this.accum >= this.fixed && steps < 6) {
      this.engine.step(this.fixed, now - (this.accum - this.fixed) * 1000);
      this.accum -= this.fixed;
      steps++;
    }
    const snap = this.engine.snapshot();
    this.lastSnap = snap;
    if (this.socket && now - this.lastBroadcast >= 1000 / SNAPSHOT_HZ) {
      this.lastBroadcast = now;
      this.socket.emit("snapshot", { code: this.roomCode, snap });
      this.engine.drainEvents();
    } else if (!this.socket) {
      // solo: drain at snapshot cadence so renderer dedupe stays bounded
      if (now - this.lastBroadcast >= 1000 / SNAPSHOT_HZ) {
        this.lastBroadcast = now;
        this.engine.drainEvents();
      }
    }
  }

  getSnapshot() {
    return this.lastSnap;
  }

  getLocalRender(): LocalRender {
    const p = this.engine.players.get(this.localId);
    if (!p) {
      return {
        pos: { x: 0, y: 2, z: 0 }, yaw: 0, pitch: 0, weaponId: "ar", zoomed: false,
        vel: { x: 0, y: 0, z: 0 }, alive: false, firing: false, team: this.localTeam,
      };
    }
    return {
      pos: { ...p.pos }, yaw: p.yaw, pitch: p.pitch, weaponId: p.weaponId, zoomed: p.zoomed,
      vel: { ...p.vel }, alive: p.alive, firing: p.firing, team: p.team,
    };
  }

  stop() {
    this.stopped = true;
    if (this.socket) {
      this.socket.off("clientInput");
      this.socket.off("peerJoined");
      this.socket.off("peerLeft");
    }
  }
}

// ---------------------------------------------------------------------------
// CLIENT (joiner): predicts own movement, renders host snapshots.
// ---------------------------------------------------------------------------
export class ClientSession implements SessionLike {
  socket: Socket;
  roomCode: string;
  localId: string;
  localTeam: Team;
  isHost = false;
  map: MapDef;
  predictor = new Predictor();
  private snap: Snapshot | null = null;
  private lastInput: PlayerInput | null = null;
  private lastSent = 0;
  private spawned = false;
  private stopped = false;

  constructor(opts: { socket: Socket; roomCode: string; localId: string; mapId: string; team: Team }) {
    this.socket = opts.socket;
    this.roomCode = opts.roomCode;
    this.localId = opts.localId;
    this.localTeam = opts.team;
    this.map = getMap(opts.mapId);
    this.socket.on("snapshot", this.onSnapshot);
  }

  private onSnapshot = (msg: { snap: Snapshot }) => {
    this.snap = msg.snap;
    const self = msg.snap.players.find((p) => p.id === this.localId);
    if (self) {
      if (!this.spawned && self.alive) {
        this.predictor.reset(self.pos, self.yaw);
        this.spawned = true;
      }
      this.predictor.firing = self.firing;
      this.predictor.reconcile(self.pos, self.alive, self.weaponId);
      if (!self.alive) this.spawned = false;
    }
  };

  update(dtMs: number, now: number, input: PlayerInput) {
    if (this.stopped) return;
    this.lastInput = input;
    this.predictor.step(input, dtMs, this.map);
    if (now - this.lastSent >= 1000 / 33) {
      this.lastSent = now;
      this.socket.emit("input", { code: this.roomCode, input });
    }
  }

  getSnapshot() {
    return this.snap;
  }

  getLocalRender(): LocalRender {
    const self = this.snap?.players.find((p) => p.id === this.localId);
    const input = this.lastInput;
    const weaponId = self?.weaponId || "ar";
    const zoomed = !!weaponDef(weaponId).zoom && !!input?.zoom;
    return {
      pos: { ...this.predictor.pos },
      yaw: input?.yaw ?? 0,
      pitch: input?.pitch ?? 0,
      weaponId,
      zoomed,
      vel: { ...this.predictor.vel },
      alive: self?.alive ?? false,
      firing: !!input?.fire && (self?.alive ?? false),
      team: this.localTeam,
    };
  }

  stop() {
    this.stopped = true;
    this.socket.off("snapshot", this.onSnapshot);
  }
}

// ---------------------------------------------------------------------------
// LOBBY: thin wrapper over the room protocol for the React lobby UI.
// ---------------------------------------------------------------------------
export interface LobbyCallbacks {
  onLobby?: (room: RoomInfo) => void;
  onStart?: (payload: { config: MatchConfig; roster: LobbyPlayer[]; hostId: string }) => void;
  onError?: (msg: string) => void;
  onChat?: (msg: { from: string; name: string; text: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class LobbyClient {
  socket: Socket;
  cb: LobbyCallbacks;
  code = "";
  selfId = "";

  constructor(cb: LobbyCallbacks) {
    this.cb = cb;
    this.socket = getSocket();
    this.socket.on("connect", () => {
      this.selfId = this.socket.id || "";
      cb.onConnect?.();
    });
    this.socket.on("disconnect", () => cb.onDisconnect?.());
    this.socket.on("lobby", (room: RoomInfo) => {
      this.code = room.code;
      cb.onLobby?.(room);
    });
    this.socket.on("startMatch", (p: any) => cb.onStart?.(p));
    this.socket.on("errorMsg", (m: string) => cb.onError?.(m));
    this.socket.on("chat", (m: any) => cb.onChat?.(m));
    if (this.socket.connected) this.selfId = this.socket.id || "";
  }

  createRoom(profile: { name: string; color: number }, config: MatchConfig) {
    this.socket.emit("createRoom", { profile, config }, (res: { code?: string; error?: string }) => {
      if (res.error) this.cb.onError?.(res.error);
      else if (res.code) this.code = res.code;
    });
  }
  joinRoom(code: string, profile: { name: string; color: number }) {
    this.socket.emit("joinRoom", { code: code.toUpperCase().trim(), profile }, (res: { ok?: boolean; error?: string }) => {
      if (res.error) this.cb.onError?.(res.error);
    });
  }
  setTeam(team: Team) {
    this.socket.emit("updateSelf", { code: this.code, patch: { team } });
  }
  setReady(ready: boolean) {
    this.socket.emit("updateSelf", { code: this.code, patch: { ready } });
  }
  setLoadout(loadout: string) {
    this.socket.emit("updateSelf", { code: this.code, patch: { loadout } });
  }
  setColor(color: number) {
    this.socket.emit("updateSelf", { code: this.code, patch: { spartanColor: color } });
  }
  setConfig(patch: Partial<MatchConfig>) {
    this.socket.emit("updateConfig", { code: this.code, patch });
  }
  startMatch() {
    this.socket.emit("startMatch", { code: this.code });
  }
  chat(text: string) {
    this.socket.emit("chat", { code: this.code, text });
  }
  leave() {
    this.socket.emit("leaveRoom", { code: this.code });
  }
  dispose() {
    this.socket.off("lobby");
    this.socket.off("startMatch");
    this.socket.off("errorMsg");
    this.socket.off("chat");
  }
}

export { Engine };
