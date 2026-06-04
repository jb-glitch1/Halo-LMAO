import type { PlayerInput, MapDef } from "./types";
import type { Vec3 } from "./vec";
import { v3, clamp } from "./vec";
import { applyMovementStep } from "./movement";
import { weaponDef } from "./weapons";

export class InputManager {
  el: HTMLElement;
  keys = new Set<string>();
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0023;
  fire = false;
  zoomHeld = false;
  locked = false;
  grenadeType: "frag" | "plasma" | "mine" = "frag";
  private pendingSwap = false;
  private seq = 0;
  private invertY = false;
  onLockChange?: (locked: boolean) => void;
  onPause?: () => void;

  // touch controls (mobile) — driven by the on-screen overlay
  touch = false;
  private t = { mx: 0, mz: 0, sprint: false, fire: false, jump: false, reload: false, grenade: false, swap: false, crouch: false, pickup: false, melee: false, zoom: false };

  setTouchActive(v: boolean) {
    this.touch = v;
    if (v) this.locked = true; // no pointer lock on touch; treat as active
  }
  setTouchMove(x: number, z: number) {
    this.t.mx = x;
    this.t.mz = z;
    this.t.sprint = z > 0.85;
  }
  setTouchBtn(name: string, v: boolean) {
    (this.t as Record<string, boolean | number>)[name] = v;
  }
  touchLook(dx: number, dy: number) {
    this.yaw -= dx * this.sensitivity * 1.4;
    this.pitch -= (this.invertY ? -1 : 1) * dy * this.sensitivity * 1.4;
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  constructor(el: HTMLElement) {
    this.el = el;
    this.bind();
  }

  bind() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    this.el.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.el.addEventListener("contextmenu", this.onContextMenu);
  }

  unbind() {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    this.el.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.el.removeEventListener("contextmenu", this.onContextMenu);
  }

  requestLock() {
    if (this.touch) return; // touch devices don't use pointer lock
    this.el.requestPointerLock?.();
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onPointerLockChange = () => {
    if (this.touch) return; // touch mode stays "active" without pointer lock
    this.locked = document.pointerLockElement === this.el;
    if (!this.locked) {
      this.fire = false;
      this.zoomHeld = false;
      this.keys.clear();
      this.onPause?.();
    }
    this.onLockChange?.(this.locked);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Tab") e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === "KeyX") this.grenadeType = this.grenadeType === "frag" ? "plasma" : this.grenadeType === "plasma" ? "mine" : "frag";
    if (e.code === "Escape") this.exitLock();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.fire = true;
    if (e.button === 2) this.zoomHeld = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fire = false;
    if (e.button === 2) this.zoomHeld = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= (this.invertY ? -1 : 1) * e.movementY * this.sensitivity;
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    // keep yaw in range
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  };
  private onWheel = () => {
    this.pendingSwap = true;
  };

  setSensitivity(s: number) {
    this.sensitivity = s;
  }
  setInvertY(v: boolean) {
    this.invertY = v;
  }

  poll(): PlayerInput {
    const k = this.keys;
    const t = this.t;
    const moveX = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) || t.mx;
    const moveZ = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0) || t.mz;
    const swap = k.has("KeyQ") || this.pendingSwap || t.swap;
    this.pendingSwap = false;
    const input: PlayerInput = {
      moveX,
      moveZ,
      yaw: this.yaw,
      pitch: this.pitch,
      jump: k.has("Space") || t.jump,
      crouch: k.has("ControlLeft") || k.has("KeyC") || t.crouch,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight") || t.sprint,
      fire: (this.fire && this.locked) || t.fire,
      altFire: k.has("KeyV") || k.has("KeyF") || t.melee,
      reload: k.has("KeyR") || t.reload,
      throwGrenade: k.has("KeyG") || t.grenade,
      grenadeType: this.grenadeType,
      switchWeapon: swap ? 2 : -1,
      zoom: (this.zoomHeld && this.locked) || t.zoom,
      pickup: k.has("KeyE") || t.pickup,
      seq: this.seq++,
    };
    return input;
  }

  // cycle grenade type from the touch UI (mirrors the X key)
  cycleGrenade() {
    this.grenadeType = this.grenadeType === "frag" ? "plasma" : this.grenadeType === "plasma" ? "mine" : "frag";
  }
}

// Client-side movement prediction for the local player.
export class Predictor {
  pos: Vec3 = v3();
  vel: Vec3 = v3();
  yaw = 0;
  grounded = false;
  alive = true;
  weaponId = "ar";
  zoomed = false;
  firing = false;
  private acc = 0;
  private readonly fixed = 1 / 60;

  reset(pos: Vec3, yaw: number) {
    this.pos = { ...pos };
    this.vel = v3();
    this.yaw = yaw;
    this.grounded = false;
  }

  // Integrate prediction with a fixed timestep matching the host.
  step(input: PlayerInput, dtMs: number, map: MapDef) {
    if (!this.alive) {
      this.acc = 0;
      return;
    }
    this.yaw = input.yaw;
    this.zoomed = !!weaponDef(this.weaponId).zoom && input.zoom;
    this.acc += dtMs / 1000;
    let steps = 0;
    while (this.acc >= this.fixed && steps < 6) {
      applyMovementStep(this, input, this.fixed, map, { zoomed: this.zoomed });
      this.acc -= this.fixed;
      steps++;
    }
  }

  // Softly correct prediction toward the authoritative position from snapshots.
  reconcile(authPos: Vec3, alive: boolean, weaponId: string) {
    this.alive = alive;
    this.weaponId = weaponId;
    if (!alive) {
      this.pos = { ...authPos };
      this.vel = v3();
      return;
    }
    const dx = authPos.x - this.pos.x;
    const dy = authPos.y - this.pos.y;
    const dz = authPos.z - this.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 9) {
      // large divergence — snap
      this.pos = { ...authPos };
      this.vel = v3();
    } else {
      // ease toward authoritative
      this.pos.x += dx * 0.2;
      this.pos.y += dy * 0.35;
      this.pos.z += dz * 0.2;
    }
  }
}
