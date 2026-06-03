import type { PlayerInput, MapDef } from "./types";
import type { Vec3 } from "./vec";
import { flatForward, flatRight, clamp } from "./vec";
import { moveAndCollide } from "./physics";
import * as C from "./constants";

export interface MoveEntity {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  grounded: boolean;
}

export interface MoveOpts {
  speedMult?: number;
  zoomed?: boolean;
  crouchHeld?: boolean;
}

export interface MoveResultEx {
  grounded: boolean;
  moving: boolean;
  jumped: boolean;
  lifts: Vec3[]; // jump-pad activations this step (for fx)
}

// The single source of truth for actor movement. Used by the authoritative
// engine AND by the client-side predictor so they never disagree.
export function applyMovementStep(
  p: MoveEntity,
  input: PlayerInput,
  dt: number,
  map: MapDef,
  opts: MoveOpts = {},
): MoveResultEx {
  const speedMult = opts.speedMult ?? 1;
  let speed = C.MOVE_SPEED * speedMult;
  if (input.sprint && input.moveZ > 0.3) speed *= C.SPRINT_MULT;
  if (input.crouch) speed *= C.CROUCH_MULT;
  if (opts.zoomed) speed *= C.ZOOM_MOVE_MULT;

  const fwd = flatForward(p.yaw);
  const right = flatRight(p.yaw);
  let wishX = right.x * input.moveX + fwd.x * input.moveZ;
  let wishZ = right.z * input.moveX + fwd.z * input.moveZ;
  const wl = Math.hypot(wishX, wishZ);
  if (wl > 1) {
    wishX /= wl;
    wishZ /= wl;
  }
  const wishVX = wishX * speed;
  const wishVZ = wishZ * speed;

  const grounded = p.grounded;
  const accel = grounded ? C.ACCEL_GROUND : C.ACCEL_AIR;
  if (grounded) {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0) {
      const drop = sp * C.FRICTION * dt;
      const ns = Math.max(0, sp - drop);
      const f = ns / sp;
      p.vel.x *= f;
      p.vel.z *= f;
    }
  }
  const t = clamp(accel * dt * (grounded ? 0.16 : C.AIR_CONTROL * 0.16), 0, 1);
  p.vel.x = p.vel.x + (wishVX - p.vel.x) * t;
  p.vel.z = p.vel.z + (wishVZ - p.vel.z) * t;

  p.vel.y -= C.GRAVITY * dt;
  let jumped = false;
  if (input.jump && grounded) {
    p.vel.y = C.JUMP_VELOCITY;
    p.grounded = false;
    jumped = true;
  }

  const lifts: Vec3[] = [];
  for (const pad of map.jumpPads) {
    const dx = p.pos.x - pad.pos.x;
    const dz = p.pos.z - pad.pos.z;
    const dy = p.pos.y - pad.pos.y;
    if (dx * dx + dz * dz < pad.radius * pad.radius && dy > -0.6 && dy < 1.6) {
      p.vel.y = pad.power;
      if (pad.dir) {
        p.vel.x += pad.dir.x * pad.power * 0.5;
        p.vel.z += pad.dir.z * pad.power * 0.5;
      }
      lifts.push({ x: pad.pos.x, y: pad.pos.y, z: pad.pos.z });
    }
  }

  const height = input.crouch ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
  const res = moveAndCollide(p.pos, p.vel, C.PLAYER_RADIUS, height, dt, map);
  p.grounded = res.grounded;

  const lim = map.size - 0.8;
  p.pos.x = clamp(p.pos.x, -lim, lim);
  p.pos.z = clamp(p.pos.z, -lim, lim);

  return {
    grounded: res.grounded,
    moving: Math.hypot(p.vel.x, p.vel.z) > 0.6,
    jumped,
    lifts,
  };
}
