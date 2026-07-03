import type { Box, Ramp, MapDef } from "./types";
import type { Vec3 } from "./vec";
import { STEP_HEIGHT } from "./constants";

const EPS = 1e-4;

export function circleRectOverlap(
  x: number,
  z: number,
  r: number,
  minx: number,
  minz: number,
  maxx: number,
  maxz: number,
): boolean {
  const cx = x < minx ? minx : x > maxx ? maxx : x;
  const cz = z < minz ? minz : z > maxz ? maxz : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function rampSurfaceAt(x: number, z: number, ramp: Ramp): number | null {
  if (x < ramp.min.x || x > ramp.max.x || z < ramp.min.z || z > ramp.max.z) return null;
  let t: number;
  if (ramp.axis === "x") t = (x - ramp.min.x) / Math.max(EPS, ramp.max.x - ramp.min.x);
  else t = (z - ramp.min.z) / Math.max(EPS, ramp.max.z - ramp.min.z);
  if (ramp.dir < 0) t = 1 - t;
  return ramp.baseY + (ramp.topY - ramp.baseY) * t;
}

// Highest walkable surface beneath the cylinder we can stand/step onto.
export function supportHeight(
  x: number,
  z: number,
  r: number,
  feetY: number,
  map: MapDef,
): number {
  let best = 0; // global ground plane
  const maxTop = feetY + STEP_HEIGHT + 0.06;
  for (const b of map.boxes) {
    if (b.max.y > maxTop) continue;
    if (!circleRectOverlap(x, z, r, b.min.x, b.min.z, b.max.x, b.max.z)) continue;
    if (b.max.y > best) best = b.max.y;
  }
  for (const ramp of map.ramps) {
    const sy = rampSurfaceAt(x, z, ramp);
    if (sy != null && sy <= maxTop && sy > best) best = sy;
  }
  return best;
}

function ceilingHeight(x: number, z: number, r: number, headY: number, map: MapDef): number {
  let best = Infinity;
  for (const b of map.boxes) {
    if (b.min.y < headY - 0.05) continue;
    if (!circleRectOverlap(x, z, r, b.min.x, b.min.z, b.max.x, b.max.z)) continue;
    if (b.min.y < best) best = b.min.y;
  }
  return best;
}

// Push the cylinder out of any box that overlaps the player's body above step height.
function resolveHorizontal(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  r: number,
  h: number,
  feetY: number,
  map: MapDef,
) {
  const bodyLow = feetY + STEP_HEIGHT + 0.02;
  const bodyHigh = feetY + h;
  for (let iter = 0; iter < 2; iter++) {
    for (const b of map.boxes) {
      if (b.max.y <= bodyLow) continue; // steppable -> handled as support
      if (b.min.y >= bodyHigh) continue; // above head
      const cx = pos.x < b.min.x ? b.min.x : pos.x > b.max.x ? b.max.x : pos.x;
      const cz = pos.z < b.min.z ? b.min.z : pos.z > b.max.z ? b.max.z : pos.z;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > EPS) {
        const d = Math.sqrt(d2);
        const push = r - d;
        const nx = dx / d;
        const nz = dz / d;
        pos.x += nx * push;
        pos.z += nz * push;
        // kill velocity into the wall
        const into = vel.x * nx + vel.z * nz;
        if (into < 0) {
          vel.x -= into * nx;
          vel.z -= into * nz;
        }
      } else {
        // center inside the rect: pop out along least-penetration axis
        const penLeft = pos.x - b.min.x + r;
        const penRight = b.max.x - pos.x + r;
        const penDown = pos.z - b.min.z + r;
        const penUp = b.max.z - pos.z + r;
        const m = Math.min(penLeft, penRight, penDown, penUp);
        if (m === penLeft) {
          pos.x = b.min.x - r;
          if (vel.x > 0) vel.x = 0;
        } else if (m === penRight) {
          pos.x = b.max.x + r;
          if (vel.x < 0) vel.x = 0;
        } else if (m === penDown) {
          pos.z = b.min.z - r;
          if (vel.z > 0) vel.z = 0;
        } else {
          pos.z = b.max.z + r;
          if (vel.z < 0) vel.z = 0;
        }
      }
    }
  }
}

export interface MoveResult {
  grounded: boolean;
  steppedUp: boolean;
}

// Integrate + collide a cylindrical actor for one substep. Mutates pos & vel.
export function moveAndCollide(
  pos: Vec3,
  vel: Vec3,
  r: number,
  h: number,
  dt: number,
  map: MapDef,
): MoveResult {
  const prevFeet = pos.y;
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  resolveHorizontal(pos, vel, r, h, prevFeet, map);

  // vertical
  pos.y += vel.y * dt;
  const ground = supportHeight(pos.x, pos.z, r, prevFeet, map);
  let grounded = false;
  let steppedUp = false;
  if (pos.y <= ground + 0.001) {
    if (ground - prevFeet > 0.001 && ground - prevFeet <= STEP_HEIGHT + 0.06) steppedUp = true;
    pos.y = ground;
    if (vel.y < 0) vel.y = 0;
    grounded = true;
  } else {
    const ceil = ceilingHeight(pos.x, pos.z, r, pos.y + h, map);
    if (pos.y + h > ceil) {
      pos.y = ceil - h;
      if (vel.y > 0) vel.y = 0;
    }
  }
  return { grounded, steppedUp };
}

// ---- raycasting ----
export interface RayHit {
  t: number;
  point: Vec3;
  normal: Vec3;
}

function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: { min: Vec3; max: Vec3 },
): RayHit | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let nx = 0,
    ny = 0,
    nz = 0;
  // X slab
  {
    const inv = 1 / dx;
    let t1 = (b.min.x - ox) * inv;
    let t2 = (b.max.x - ox) * inv;
    let n = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      ny = 0;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  {
    const inv = 1 / dy;
    let t1 = (b.min.y - oy) * inv;
    let t2 = (b.max.y - oy) * inv;
    let n = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = n;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  {
    const inv = 1 / dz;
    let t1 = (b.min.z - oz) * inv;
    let t2 = (b.max.z - oz) * inv;
    let n = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = 0;
      nz = n;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const t = tmin >= 0 ? tmin : tmax >= 0 ? 0 : -1;
  if (t < 0) return null;
  return {
    t,
    point: { x: ox + dx * t, y: oy + dy * t, z: oz + dz * t },
    normal: { x: nx, y: ny, z: nz },
  };
}

// Cache ramp bounding boxes for occlusion (approximation).
function rampBox(r: Ramp): { min: Vec3; max: Vec3 } {
  return { min: { ...r.min, y: r.baseY }, max: { ...r.max, y: r.topY } };
}

// Precomputed collider (box + bounding sphere) for raycast broadphase.
interface Collider {
  min: Vec3;
  max: Vec3;
  cx: number;
  cy: number;
  cz: number;
  r: number;
}

// Build (once per map) the flattened collider list with bounding spheres so the
// hot raycast path skips far/off-axis colliders and never re-allocates ramp boxes.
const colliderCache = new WeakMap<MapDef, Collider[]>();
function colliders(map: MapDef): Collider[] {
  let list = colliderCache.get(map);
  if (list) return list;
  list = [];
  const add = (min: Vec3, max: Vec3) => {
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const r = Math.hypot(max.x - cx, max.y - cy, max.z - cz);
    list!.push({ min, max, cx, cy, cz, r });
  };
  for (const b of map.boxes) add(b.min, b.max);
  for (const rmp of map.ramps) {
    const rb = rampBox(rmp);
    add(rb.min, rb.max);
  }
  colliderCache.set(map, list);
  return list;
}

// Nearest world hit along a (unit-direction) ray. `exhaustive` disables the
// bounding-sphere broadphase — used only by tests to verify parity.
export function raycastWorld(
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  map: MapDef,
  exhaustive = false,
): RayHit | null {
  let best: RayHit | null = null;
  let bestT = maxDist;
  for (const c of colliders(map)) {
    if (!exhaustive) {
      // bounding-sphere reject (conservative; assumes |dir| ≈ 1)
      const ox = c.cx - origin.x;
      const oy = c.cy - origin.y;
      const oz = c.cz - origin.z;
      const tca = ox * dir.x + oy * dir.y + oz * dir.z;
      if (tca < -c.r) continue; // sphere entirely behind the origin
      if (tca - c.r > bestT) continue; // sphere beyond the current nearest hit
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > c.r * c.r) continue; // ray line misses the bounding sphere
    }
    const h = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c);
    if (h && h.t < bestT) {
      bestT = h.t;
      best = h;
    }
  }
  return best;
}

// Ray vs vertical capsule (approximated as a cylinder + check). Returns entry t or null.
export function rayCylinder(
  origin: Vec3,
  dir: Vec3,
  baseX: number,
  baseY: number,
  baseZ: number,
  radius: number,
  height: number,
  maxDist: number,
): { t: number; y: number } | null {
  // Solve in XZ for cylinder, then clamp Y to [baseY, baseY+height].
  const ox = origin.x - baseX;
  const oz = origin.z - baseZ;
  const dx = dir.x;
  const dz = dir.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) {
    // nearly vertical ray: check if within radius in XZ
    if (ox * ox + oz * oz <= radius * radius) {
      // entry where y enters the band
      const ty = dir.y > 0 ? (baseY - origin.y) / dir.y : (baseY + height - origin.y) / dir.y;
      if (ty >= 0 && ty <= maxDist) return { t: ty, y: origin.y + dir.y * ty };
    }
    return null;
  }
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  const y = origin.y + dir.y * t;
  if (y < baseY || y > baseY + height) {
    // try cap intersections
    const tTop = dir.y !== 0 ? (baseY + height - origin.y) / dir.y : -1;
    const tBot = dir.y !== 0 ? (baseY - origin.y) / dir.y : -1;
    for (const tc of [tBot, tTop]) {
      if (tc >= 0 && tc <= maxDist) {
        const px = origin.x + dir.x * tc - baseX;
        const pz = origin.z + dir.z * tc - baseZ;
        if (px * px + pz * pz <= radius * radius) return { t: tc, y: origin.y + dir.y * tc };
      }
    }
    return null;
  }
  return { t, y };
}
