import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import type { MapDef, Snapshot, PlayerState, Team, FxEvent, VehicleState } from "./types";
import { weaponDef } from "./weapons";
import * as C from "./constants";
import { TEAM_COLOR } from "./constants";

// ---- graphics quality presets ----
export type GraphicsQuality = "low" | "med" | "high";
interface QualityPreset { post: boolean; pixelCap: number; bloom: number; shadows: boolean; stars: number; }
const QUALITY: Record<GraphicsQuality, QualityPreset> = {
  low: { post: false, pixelCap: 1, bloom: 0, shadows: false, stars: 0 },
  med: { post: true, pixelCap: 1.5, bloom: 0.5, shadows: true, stars: 700 },
  high: { post: true, pixelCap: 2, bloom: 0.62, shadows: true, stars: 1300 },
};

// Robustly create a WebGL renderer, degrading options if context creation fails.
function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const attempts: THREE.WebGLRendererParameters[] = [
    { canvas, antialias: false, powerPreference: "high-performance" },
    { canvas, antialias: false, powerPreference: "default" },
    { canvas },
  ];
  let lastErr: unknown;
  for (const opts of attempts) {
    try { return new THREE.WebGLRenderer(opts); } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("Could not create a WebGL context.");
}

// Per-map zenith color so the sky dome reads day / indoor / void.
function skyZenith(map: MapDef): number {
  if (map.id === "gulch") return 0x244a86; // daytime blue
  if (map.id === "warehouse") return 0x0a0f16; // dark indoor
  return 0x0a0618; // space void
}

// Final-pass "budget CRT" grade: film grain, faint scanlines, edge chromatic
// aberration, and a soft vignette. Cheap, and very on-brand for a knockoff.
const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAmount: { value: 0.05 },
    uScan: { value: 0.05 },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: [
    "uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; uniform float uScan;",
    "varying vec2 vUv;",
    "float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }",
    "void main(){",
    "  vec2 uv = vUv; vec2 d = uv - 0.5;",
    "  float ca = 0.0016 * dot(d,d) * 4.0;",
    "  vec3 col;",
    "  col.r = texture2D(tDiffuse, uv + d*ca).r;",
    "  col.g = texture2D(tDiffuse, uv).g;",
    "  col.b = texture2D(tDiffuse, uv - d*ca).b;",
    "  float g = rand(uv * vec2(1280.0,720.0) + fract(uTime)) - 0.5;",
    "  col += g * uAmount;",
    "  col *= 1.0 - uScan * (0.5 + 0.5*sin(uv.y * 1300.0));",
    "  col *= smoothstep(1.12, 0.42, length(d)*1.4);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}",
  ].join("\n"),
};

export interface LocalRender {
  pos: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  weaponId: string;
  zoomed: boolean;
  vel: { x: number; y: number; z: number };
  alive: boolean;
  firing: boolean;
  team: Team;
  inVehicle?: boolean;
}

interface PlayerVisual {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  visor: THREE.Mesh;
  ring: THREE.Mesh;
  tag: THREE.Sprite;
  weapon: THREE.Mesh;
  targetPos: THREE.Vector3;
  targetYaw: number;
  team: Team;
  seen: boolean;
  // role tints baked into the materials — visual is rebuilt when these change
  infected: boolean;
  jugg: boolean;
}

interface Fx {
  obj: THREE.Object3D;
  born: number;
  life: number;
  update: (k: number, dt: number) => void;
  light?: THREE.PointLight;
}

// In-world holographic marker palette — mirrors the 2D HUD color doctrine
// (cyan = system/tech, amber = neutral objective, purple = relic).
const MARKER = { lift: 0x36e7ff, hill: 0xffcf4d, oddball: 0xb06bff };
const VM_BASE = { x: 0.32, y: -0.4, z: -0.58 };

export class Renderer {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  worldGroup = new THREE.Group();
  map: MapDef | null = null;

  players = new Map<string, PlayerVisual>();
  vehicles = new Map<string, THREE.Group>();
  flagVisuals = new Map<string, THREE.Group>();
  projectiles = new Map<number, THREE.Object3D>();
  pickups = new Map<string, { mesh: THREE.Object3D; baseY: number }>();
  fx: Fx[] = [];
  hillMesh?: THREE.Mesh;
  oddballMesh?: THREE.Mesh;

  viewmodel = new THREE.Group();
  vmWeapon?: THREE.Mesh;
  vmFlash?: THREE.PointLight;
  vmCurrentWeapon = "";
  bobT = 0;

  baseFov = 78;
  curFov = 78;
  lastFxId = 0;
  localId = "";
  shakeUntil = 0;
  shakeMag = 0;
  damageDir = 0;
  reduceMotion = false;

  private geoCache = new Map<string, THREE.BufferGeometry>();
  private matCache = new Map<string, THREE.Material>();

  // post-processing + atmosphere
  quality: GraphicsQuality;
  usePost = false;
  composer?: EffectComposer;
  bloomPass?: UnrealBloomPass;
  fxaaPass?: ShaderPass;
  grainPass?: ShaderPass;
  skyMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  stars?: THREE.Points;
  dust?: THREE.Points;
  private blobTex?: THREE.Texture;

  constructor(canvas: HTMLCanvasElement, quality: GraphicsQuality = "high") {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(QUALITY[quality].pixelCap, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, 2000);
    this.scene.add(this.camera);
    this.camera.add(this.viewmodel);
    this.scene.add(this.worldGroup);
    this.buildPost();
    this.resize();
  }

  // Build (or rebuild) the post chain for the current quality. Bloom makes
  // emissive surfaces — visors, energy weapons, plasma, jump pads — glow.
  buildPost() {
    this.usePost = QUALITY[this.quality].post;
    if (this.composer) { this.composer.dispose(); this.composer = undefined; this.bloomPass = undefined; this.fxaaPass = undefined; }
    if (!this.usePost) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), QUALITY[this.quality].bloom, 0.4, 0.85);
    composer.addPass(bloom);
    const fxaa = new ShaderPass(FXAAShader); // composer disables MSAA, so AA in a pass
    composer.addPass(fxaa);
    composer.addPass(new OutputPass()); // tone-map + sRGB for the whole frame
    const grain = new ShaderPass(GrainShader); // budget-CRT grade on the final image
    composer.addPass(grain);
    this.composer = composer;
    this.bloomPass = bloom;
    this.fxaaPass = fxaa;
    this.grainPass = grain;
  }

  setQuality(q: GraphicsQuality) {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(QUALITY[q].pixelCap, window.devicePixelRatio || 1));
    this.buildPost();
    this.resize();
  }

  setFov(fov: number) {
    this.baseFov = fov;
  }

  setReduceMotion(v: boolean) {
    this.reduceMotion = v;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      this.bloomPass?.setSize(w, h);
      if (this.fxaaPass) this.fxaaPass.material.uniforms["resolution"].value.set(1 / (w * pr), 1 / (h * pr));
    }
  }

  // ---------- atmosphere ----------
  private makeSky(horizon: THREE.Color, zenith: THREE.Color): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: zenith }, bottom: { value: horizon }, offset: { value: 40 }, expo: { value: 0.55 } },
      vertexShader: "varying vec3 vP; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float expo; varying vec3 vP; void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y; float t = pow(max(h, 0.0), expo); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }",
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    sky.renderOrder = -2;
    return sky;
  }

  // The signature ring arcing across the sky (open maps only). Generic, logo-free.
  private makeRing(map: MapDef): THREE.Mesh {
    const col = map.id === "lattice" ? 0x9a7bff : 0xbfe4ff;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(560, 16, 8, 120),
      new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.position.set(40, 90, -360);
    ring.rotation.set(1.22, 0.35, 0.2);
    ring.renderOrder = -1;
    return ring;
  }

  private makeDust(map: MapDef): THREE.Points {
    const n = QUALITY[this.quality].post ? 300 : 130;
    const arr = new Float32Array(n * 3);
    const s = map.size;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() * 2 - 1) * s;
      arr[i * 3 + 1] = Math.random() * s * 0.5 + 0.5;
      arr[i * 3 + 2] = (Math.random() * 2 - 1) * s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff0d0,
      size: 0.07,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  private makeStars(count: number): THREE.Points {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random()); // bias to upper hemisphere
      const r = 820;
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph) + 30;
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
    pts.renderOrder = -2;
    return pts;
  }

  private blobMaterial(): THREE.Material {
    if (!this.blobTex) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const ctx = cv.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, "rgba(0,0,0,0.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      this.blobTex = new THREE.CanvasTexture(cv);
    }
    return new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false });
  }

  dispose() {
    this.composer?.dispose();
    this.blobTex?.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x?.dispose?.());
      else mat?.dispose?.();
    });
    for (const g of this.geoCache.values()) g.dispose();
    for (const m of this.matCache.values()) m.dispose();
  }

  // ---------- world ----------
  setMap(map: MapDef) {
    this.map = map;
    this.worldGroup.clear();
    this.players.clear();
    this.projectiles.clear();
    this.pickups.clear();
    for (const f of this.fx) this.scene.remove(f.obj);
    this.fx = [];

    // ----- atmosphere: gradient sky dome, signature ring, stars, fog -----
    const horizon = new THREE.Color(map.fog);
    const zenith = new THREE.Color(skyZenith(map));
    this.scene.background = horizon.clone();
    this.scene.fog = new THREE.Fog(map.fog, map.size * 0.85, map.size * 3.0);

    this.skyMesh = this.makeSky(horizon, zenith);
    this.worldGroup.add(this.skyMesh);

    if (map.id === "gulch" || map.id === "lattice") {
      this.ringMesh = this.makeRing(map);
      this.worldGroup.add(this.ringMesh);
    } else {
      this.ringMesh = undefined;
    }

    const lum = (map.fog & 0xff) + ((map.fog >> 8) & 0xff) + ((map.fog >> 16) & 0xff);
    const starCount = QUALITY[this.quality].stars;
    if (starCount && lum < 200) {
      this.stars = this.makeStars(starCount);
      this.worldGroup.add(this.stars);
    } else {
      this.stars = undefined;
    }

    // ambient dust motes for depth + atmosphere
    this.dust = this.makeDust(map);
    this.worldGroup.add(this.dust);

    // per-map color grade
    this.renderer.toneMappingExposure = map.id === "gulch" ? 1.22 : map.id === "warehouse" ? 1.06 : 1.12;
    if (this.bloomPass) this.bloomPass.strength = QUALITY[this.quality].bloom * (map.id === "lattice" ? 1.25 : 1);

    // ----- lighting: warm key sun + cool sky fill + cool rim -----
    const hemi = new THREE.HemisphereLight(0xeaf4ff, map.ambient, 0.95);
    this.worldGroup.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1da, 1.35);
    sun.position.set(map.size * 0.6, map.size * 1.25, map.size * 0.35);
    this.worldGroup.add(sun);
    const rim = new THREE.DirectionalLight(0x9fc6ff, 0.5);
    rim.position.set(-map.size * 0.5, map.size * 0.55, -map.size * 0.6);
    this.worldGroup.add(rim);
    const amb = new THREE.AmbientLight(map.ambient, 0.4);
    this.worldGroup.add(amb);

    // floor
    const floorGeo = new THREE.PlaneGeometry(map.size * 2.2, map.size * 2.2);
    const floorMat = new THREE.MeshStandardMaterial({ color: map.floorColor, metalness: 0.12, roughness: 0.92 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    this.worldGroup.add(floor);
    // grid overlay
    const grid = new THREE.GridHelper(map.size * 2.2, Math.round(map.size / 2), 0x000000, 0x000000);
    (grid.material as THREE.Material).opacity = 0.12;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02;
    this.worldGroup.add(grid);

    // boxes
    for (const b of map.boxes) {
      const w = b.max.x - b.min.x;
      const h = b.max.y - b.min.y;
      const d = b.max.z - b.min.z;
      const geo = new THREE.BoxGeometry(w, h, d);
      let color = b.color ?? 0x556070;
      if (b.team === "red") color = mix(color, 0xff4d5e, 0.5);
      if (b.team === "blue") color = mix(color, 0x3aa0ff, 0.5);
      const transparent = b.kind === "glass";
      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent,
        opacity: transparent ? 0.35 : 1,
        metalness: transparent ? 0.0 : 0.28,
        roughness: transparent ? 0.1 : 0.68,
        emissive: b.team ? new THREE.Color(color).multiplyScalar(0.16) : 0x000000,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      this.worldGroup.add(mesh);
      // subtle edge wire
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
      );
      mesh.add(edges);
    }

    // ramps as slanted boxes
    for (const r of map.ramps) {
      const w = r.max.x - r.min.x;
      const d = r.max.z - r.min.z;
      const len = r.axis === "x" ? w : d;
      const rise = r.topY - r.baseY;
      const thickness = 0.4;
      const surfLen = Math.hypot(len, rise);
      const geo = new THREE.BoxGeometry(r.axis === "x" ? surfLen : w, thickness, r.axis === "z" ? surfLen : d);
      let color = r.color ?? 0x5a6275;
      if (r.team === "red") color = mix(color, 0xff4d5e, 0.5);
      if (r.team === "blue") color = mix(color, 0x3aa0ff, 0.5);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.68 }));
      const cx = (r.min.x + r.max.x) / 2;
      const cz = (r.min.z + r.max.z) / 2;
      const cy = (r.baseY + r.topY) / 2;
      mesh.position.set(cx, cy, cz);
      const angle = Math.atan2(rise, len);
      if (r.axis === "z") mesh.rotation.x = r.dir > 0 ? -angle : angle;
      else mesh.rotation.z = r.dir > 0 ? angle : -angle;
      this.worldGroup.add(mesh);
    }

    // jump pads
    for (const pad of map.jumpPads) {
      const geo = new THREE.CylinderGeometry(pad.radius, pad.radius * 1.1, 0.25, 20);
      const mat = new THREE.MeshBasicMaterial({ color: MARKER.lift, transparent: true, opacity: 0.55 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pad.pos.x, pad.pos.y + 0.13, pad.pos.z);
      this.worldGroup.add(m);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.radius * 0.6, pad.radius * 0.6, 6, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: MARKER.lift, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
      );
      beam.position.set(pad.pos.x, pad.pos.y + 3, pad.pos.z);
      this.worldGroup.add(beam);
    }

    // hill marker
    if (map.hill) {
      this.hillMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(map.hill.radius, map.hill.radius, 0.1, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: MARKER.hill, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
      );
      this.worldGroup.add(this.hillMesh);
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(map.hill.radius, map.hill.radius, 3, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: MARKER.hill, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
      );
      wall.position.y = 1.5;
      this.hillMesh.add(wall);
    }
    if (map.oddballSpawn) {
      this.oddballMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({ color: 0x222222, emissive: MARKER.oddball, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 }),
      );
      this.worldGroup.add(this.oddballMesh);
    }

    this.buildViewmodel("ar");
  }

  // ---------- viewmodel ----------
  buildViewmodel(weaponId: string) {
    if (this.vmCurrentWeapon === weaponId) return;
    this.vmCurrentWeapon = weaponId;
    if (this.vmWeapon) this.viewmodel.remove(this.vmWeapon);
    const def = weaponDef(weaponId);
    const grp = new THREE.Group();
    const color = def.color;
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a525f, emissive: 0x12161c, emissiveIntensity: 0.6, metalness: 0.65, roughness: 0.45 });
    const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.5 });
    // generic shape varies by category
    let bodyLen = 0.7,
      bodyR = 0.06;
    if (def.id === "sniper") bodyLen = 1.2;
    if (def.id === "rocket") {
      bodyR = 0.11;
      bodyLen = 0.9;
    }
    if (def.id === "magnum" || def.id === "plasma") bodyLen = 0.4;
    if (def.id === "shotgun") bodyLen = 0.8;
    if (def.type === "melee") {
      // energy blade
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.7, 8),
        new THREE.MeshBasicMaterial({ color: 0x6bb7ff, transparent: true, opacity: 0.8 }),
      );
      blade.rotation.x = Math.PI / 2;
      blade.position.set(0, 0.02, -0.6);
      const blade2 = blade.clone();
      blade2.position.x = 0.08;
      const blade3 = blade.clone();
      blade3.position.x = -0.08;
      grp.add(blade, blade2, blade3);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), metal);
      hilt.rotation.x = Math.PI / 2;
      hilt.position.set(0, 0, -0.18);
      grp.add(hilt);
    } else {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, bodyLen), metal);
      barrel.position.set(0, 0, -bodyLen / 2);
      grp.add(barrel);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, bodyLen * 0.5), accent);
      top.position.set(0, 0.08, -bodyLen * 0.4);
      grp.add(top);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), metal);
      grip.position.set(0, -0.12, -0.02);
      grip.rotation.x = 0.3;
      grp.add(grip);
      if (def.id === "rocket" || def.id === "sniper" || def.id === "needler") {
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), accent);
        scope.rotation.z = Math.PI / 2;
        scope.position.set(0, 0.12, -0.3);
        grp.add(scope);
      }
    }
    grp.position.set(VM_BASE.x, VM_BASE.y, VM_BASE.z);
    grp.scale.setScalar(0.72);
    grp.rotation.y = 0.05;
    this.vmWeapon = grp as unknown as THREE.Mesh;
    this.viewmodel.add(grp);
    if (!this.vmFlash) {
      this.vmFlash = new THREE.PointLight(0xffd27f, 0, 6);
      this.vmFlash.position.set(0.22, -0.18, -1.0);
      this.viewmodel.add(this.vmFlash);
    }
  }

  // ---------- players ----------
  ensurePlayer(p: PlayerState): PlayerVisual {
    let v = this.players.get(p.id);
    if (v) return v;
    const group = new THREE.Group();
    const teamHex = p.infected ? 0x67e36a : p.isJuggernaut ? 0xff4d5e : TEAM_COLOR[p.team] ?? 0xcccccc;
    const armorMat = new THREE.MeshStandardMaterial({ color: teamHex, metalness: 0.5, roughness: 0.42 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamHex).multiplyScalar(0.45), metalness: 0.55, roughness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({ color: teamHex, emissive: teamHex, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 });
    // torso + chest plate
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.8, 4, 10), armorMat);
    body.position.y = 0.95;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.36), darkMat);
    chest.position.set(0, 1.16, 0.02);
    // glowing team trim across the chest — at-a-glance team read + silhouette accent
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.02), trimMat);
    trim.position.set(0, 1.22, -0.17);
    // pauldrons
    const pauldron = new THREE.BoxGeometry(0.24, 0.22, 0.34);
    const lPaul = new THREE.Mesh(pauldron, armorMat);
    lPaul.position.set(-0.44, 1.3, 0);
    const rPaul = new THREE.Mesh(pauldron, armorMat);
    rPaul.position.set(0.44, 1.3, 0);
    // helmet + brow + visor slit
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 14),
      new THREE.MeshStandardMaterial({ color: 0x363c44, metalness: 0.62, roughness: 0.34 }),
    );
    head.position.y = 1.63;
    head.scale.set(1, 1.05, 1.14);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.12), darkMat);
    brow.position.set(0, 1.72, -0.12);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.1, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xffc24d, emissive: 0xffa01e, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.2 }),
    );
    visor.position.set(0, 1.62, -0.18);
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.6, roughness: 0.4 }),
    );
    weapon.position.set(0.32, 1.2, -0.3);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: teamHex, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const tag = this.makeTag(p.name, teamHex);
    tag.position.y = 2.3;
    group.add(body, chest, trim, lPaul, rPaul, head, brow, visor, weapon, ring, tag);
    if (QUALITY[this.quality].shadows) {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), this.blobMaterial());
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.02;
      group.add(blob);
    }
    this.scene.add(group);
    v = { group, body, head, visor, ring, tag, weapon, targetPos: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), targetYaw: p.yaw, team: p.team, seen: true, infected: !!p.infected, jugg: !!p.isJuggernaut };
    this.players.set(p.id, v);
    return v;
  }

  makeTag(name: string, hex: number): THREE.Sprite {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 64;
    const ctx = cv.getContext("2d")!;
    ctx.font = "bold 30px Oswald, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(name, 128, 34);
    ctx.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(2.4, 0.6, 1);
    return spr;
  }

  applySnapshot(snap: Snapshot, localId: string, localTeam: Team) {
    this.localId = localId;
    // players
    for (const v of this.players.values()) v.seen = false;
    for (const p of snap.players) {
      if (p.id === localId) {
        const v = this.players.get(p.id);
        if (v) v.seen = true;
        continue; // local rendered first-person
      }
      // role changed (converted to horde / crowned juggernaut) -> rebuild tinted visual
      const prev = this.players.get(p.id);
      if (prev && (prev.infected !== !!p.infected || prev.jugg !== !!p.isJuggernaut)) {
        this.scene.remove(prev.group);
        this.players.delete(p.id);
      }
      const v = this.ensurePlayer(p);
      v.seen = true;
      v.targetPos.set(p.pos.x, p.pos.y, p.pos.z);
      v.targetYaw = p.yaw;
      const dead = !p.alive;
      v.group.visible = !dead;
      // camo: enemies with camo become translucent
      const camo = (p.powerups as any)?.camo && (p.powerups as any).camo > snap.t;
      const enemy = localTeam === "ffa" || p.team !== localTeam;
      const op = camo ? (enemy ? 0.12 : 0.4) : 1;
      (v.body.material as THREE.MeshStandardMaterial).transparent = op < 1;
      (v.body.material as THREE.MeshStandardMaterial).opacity = op;
      // weapon model swap hint via color
      (v.visor.material as THREE.MeshStandardMaterial).emissiveIntensity = p.firing ? 1.4 : 0.7;
    }
    for (const [id, v] of this.players) {
      if (!v.seen && id !== localId) {
        this.scene.remove(v.group);
        this.players.delete(id);
      }
    }

    // projectiles
    const liveProj = new Set<number>();
    for (const pr of snap.projectiles) {
      liveProj.add(pr.id);
      let m = this.projectiles.get(pr.id);
      if (!m) {
        m = this.makeProjectile(pr.weapon);
        this.scene.add(m);
        this.projectiles.set(pr.id, m);
      }
      m.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
      if (pr.vel) m.lookAt(pr.pos.x + pr.vel.x, pr.pos.y + pr.vel.y, pr.pos.z + pr.vel.z);
    }
    for (const [id, m] of this.projectiles) {
      if (!liveProj.has(id)) {
        this.scene.remove(m);
        this.projectiles.delete(id);
      }
    }

    // vehicles (Wartrolley)
    const liveVeh = new Set<string>();
    for (const vs of snap.vehicles ?? []) {
      liveVeh.add(vs.id);
      let g = this.vehicles.get(vs.id);
      if (!g) {
        g = this.makeVehicle();
        this.scene.add(g);
        this.vehicles.set(vs.id, g);
      }
      g.position.set(vs.pos.x, vs.pos.y, vs.pos.z);
      g.rotation.y = vs.yaw;
      const wheels = g.userData.wheels as THREE.Object3D[] | undefined;
      if (wheels) for (const w of wheels) w.rotation.x = vs.wheelSpin;
    }
    for (const [id, g] of this.vehicles) {
      if (!liveVeh.has(id)) {
        this.scene.remove(g);
        this.vehicles.delete(id);
      }
    }

    // CTF banners
    if (snap.flags) {
      for (const team of ["red", "blue"] as const) {
        const fi = snap.flags[team];
        let g = this.flagVisuals.get(team);
        if (!g) {
          g = this.makeFlag(team === "red" ? TEAM_COLOR.red : TEAM_COLOR.blue);
          this.scene.add(g);
          this.flagVisuals.set(team, g);
        }
        g.position.set(fi.pos.x, fi.pos.y, fi.pos.z);
      }
    }

    // pickups
    for (const pk of snap.pickups) {
      let entry = this.pickups.get(pk.id);
      if (!entry) {
        const mesh = this.makePickup(pk.kind, pk.what);
        this.scene.add(mesh);
        entry = { mesh, baseY: pk.pos.y + 1.1 };
        this.pickups.set(pk.id, entry);
        mesh.position.set(pk.pos.x, entry.baseY, pk.pos.z);
      }
      entry.mesh.visible = pk.available;
    }

    // hill / oddball
    if (snap.hill && this.hillMesh) {
      this.hillMesh.position.set(snap.hill.pos.x, snap.hill.pos.y + 0.06, snap.hill.pos.z);
      const c = snap.hill.controller;
      const col = c ? TEAM_COLOR[c] : MARKER.hill;
      ((this.hillMesh.material as THREE.MeshBasicMaterial).color as THREE.Color).setHex(col);
    }
    if (snap.oddball && this.oddballMesh) {
      this.oddballMesh.visible = !snap.oddball.carrier;
      this.oddballMesh.position.set(snap.oddball.pos.x, snap.oddball.pos.y, snap.oddball.pos.z);
    }

    // fx (dedupe by id)
    for (const f of snap.fx) {
      if (f.id <= this.lastFxId) continue;
      this.spawnFx(f, snap.t);
    }
    if (snap.fx.length) this.lastFxId = Math.max(this.lastFxId, snap.fx[snap.fx.length - 1].id);
  }

  makeProjectile(weapon: string): THREE.Object3D {
    if (weapon === "rocket") {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x888, metalness: 0.6, roughness: 0.4 }));
      body.rotation.x = Math.PI / 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = 0.4;
      g.add(body, flame);
      return g;
    }
    if (weapon === "needler") {
      return new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0xff66c4 }));
    }
    if (weapon === "g_frag" || weapon === "g_plasma") {
      const col = weapon === "g_plasma" ? 0x36e7ff : 0x2f6f3f;
      return new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: weapon === "g_plasma" ? 0.9 : 0.2 }));
    }
    if (weapon === "g_mine") {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.6, roughness: 0.4 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
      led.position.y = 0.08;
      g.add(body, led);
      return g;
    }
    return new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  }

  makePickup(kind: string, what: string): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === "weapon") {
      const def = weaponDef(what);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.8),
        new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.4 }),
      );
      g.add(m);
    } else {
      const colors: Record<string, number> = { overshield: 0x36e7ff, speed: 0xffcf4d, damage: 0xff4d5e, camo: 0xb06bff };
      const c = colors[what] ?? 0xffffff;
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 0),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
      );
      g.add(m);
    }
    return g;
  }

  // ---------- vehicle (Wartrolley) ----------
  makeVehicle(): THREE.Group {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.8, roughness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff6a00, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.4 });
    // wire basket (front is -Z)
    const basketGeo = new THREE.BoxGeometry(1.9, 1.0, 2.4);
    const basket = new THREE.Mesh(
      basketGeo,
      new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.32 }),
    );
    basket.position.set(0, 0.95, 0.1);
    basket.add(new THREE.LineSegments(new THREE.EdgesGeometry(basketGeo), new THREE.LineBasicMaterial({ color: 0xdfe8f0 })));
    g.add(basket);
    // chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 2.6), frame);
    chassis.position.set(0, 0.42, 0);
    g.add(chassis);
    // push handle (back, +Z)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 16, Math.PI), frame);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 1.5, 1.35);
    g.add(handle);
    // cannon (front, -Z)
    const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 1.1), frame);
    cannon.position.set(0, 1.2, -1.1);
    g.add(cannon);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 10), accent);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.2, -1.85);
    g.add(barrel);
    // wheels
    const wheels: THREE.Object3D[] = [];
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 14);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15191e, metalness: 0.3, roughness: 0.7 });
    for (const [sx, sz] of [[-0.85, -1.0], [0.85, -1.0], [-0.85, 1.0], [0.85, 1.0]] as [number, number][]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2; // axle along X
      w.position.set(sx, 0.36, sz);
      g.add(w);
      wheels.push(w);
    }
    g.userData.wheels = wheels;
    return g;
  }

  // ---------- CTF banner ----------
  makeFlag(color: number): THREE.Group {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.6, roughness: 0.4 }),
    );
    pole.position.y = 1;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.6 }),
    );
    banner.position.set(0.5, 1.7, 0);
    g.add(pole, banner);
    return g;
  }

  // ---------- fx ----------
  spawnFx(f: FxEvent, now: number) {
    const col = f.team ? TEAM_COLOR[f.team] : 0xffffff;
    switch (f.kind) {
      case "tracer": {
        if (!f.pos2) return;
        const a = new THREE.Vector3(f.pos.x, f.pos.y, f.pos.z);
        const b = new THREE.Vector3(f.pos2.x, f.pos2.y, f.pos2.z);
        const dir = b.clone().sub(a);
        const len = dir.length();
        const wcol = f.weapon ? weaponDef(f.weapon).color : 0xffffff;
        const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 5);
        const mat = new THREE.MeshBasicMaterial({ color: wcol, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(a.clone().add(b).multiplyScalar(0.5));
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 70, update: (k) => { mat.opacity = 0.9 * (1 - k); m.scale.x = m.scale.z = 1 + k * 2; } });
        break;
      }
      case "muzzle": {
        const wcol = f.weapon ? weaponDef(f.weapon).color : 0xffd27f;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: wcol, transparent: true, blending: THREE.AdditiveBlending }));
        m.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 60, update: (k) => { (m.material as THREE.Material).opacity = 1 - k; m.scale.setScalar(1 + k); } });
        break;
      }
      case "impact": {
        const wcol = f.weapon ? weaponDef(f.weapon).color : 0xffffff;
        const grp = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), new THREE.MeshBasicMaterial({ color: wcol, transparent: true, blending: THREE.AdditiveBlending }));
          const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.6, (Math.random() - 0.5)).multiplyScalar(3);
          (s as any).vel = v;
          grp.add(s);
        }
        grp.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(grp);
        this.fx.push({ obj: grp, born: now, life: 240, update: (k, dt) => { grp.children.forEach((c) => { const v = (c as any).vel as THREE.Vector3; c.position.addScaledVector(v, dt); (((c as THREE.Mesh).material) as THREE.Material).opacity = 1 - k; }); } });
        break;
      }
      case "explosion": {
        const scale = f.scale ?? 1;
        const wcol = f.weapon === "plasma" ? 0x36e7ff : f.weapon === "needler" ? 0xff66c4 : 0xff8a30;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: wcol, transparent: true, blending: THREE.AdditiveBlending }));
        ball.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(ball);
        const light = new THREE.PointLight(wcol, 6, 14 * scale);
        light.position.copy(ball.position);
        this.scene.add(light);
        const dist = this.camera.position.distanceTo(ball.position);
        if (dist < 16 * scale) this.addShake(now, (1 - dist / (16 * scale)) * 0.5 * scale);
        this.fx.push({ obj: ball, light, born: now, life: 420, update: (k) => { ball.scale.setScalar((0.4 + k * 5) * scale); (ball.material as THREE.Material).opacity = 1 - k; light.intensity = 6 * (1 - k); } });
        break;
      }
      case "shieldpop": {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), new THREE.MeshBasicMaterial({ color: 0x6fdcff, transparent: true, wireframe: true, blending: THREE.AdditiveBlending }));
        m.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 280, update: (k) => { m.scale.setScalar(1 + k * 1.2); (m.material as THREE.Material).opacity = 0.8 * (1 - k); } });
        break;
      }
      case "stick": {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff66c4, transparent: true, blending: THREE.AdditiveBlending }));
        m.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 200, update: (k) => { (m.material as THREE.Material).opacity = 1 - k; } });
        break;
      }
      case "spawn":
      case "pickup": {
        const c = f.kind === "spawn" ? (f.team ? TEAM_COLOR[f.team] : 0xffffff) : 0xffcf4d;
        const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(f.pos.x, f.pos.y + 0.1, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 400, update: (k) => { m.scale.setScalar(1 + k * 4); (m.material as THREE.Material).opacity = 1 - k; } });
        break;
      }
      case "death": {
        const grp = new THREE.Group();
        for (let i = 0; i < 8; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: col }));
          (s as any).vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 5, (Math.random() - 0.5) * 4);
          grp.add(s);
        }
        grp.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(grp);
        this.fx.push({ obj: grp, born: now, life: 800, update: (k, dt) => { grp.children.forEach((c) => { const v = (c as any).vel as THREE.Vector3; v.y -= 12 * dt; c.position.addScaledVector(v, dt); c.rotation.x += dt * 4; }); } });
        break;
      }
      case "melee": {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), new THREE.MeshBasicMaterial({ color: 0x6bb7ff, transparent: true, blending: THREE.AdditiveBlending }));
        m.position.set(f.pos.x, f.pos.y + 1, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 220, update: (k) => { m.scale.setScalar(0.5 + k); (m.material as THREE.Material).opacity = 1 - k; } });
        break;
      }
      case "lift": {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x36e7ff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        m.position.set(f.pos.x, f.pos.y + 1, f.pos.z);
        this.scene.add(m);
        this.fx.push({ obj: m, born: now, life: 300, update: (k) => { m.position.y = f.pos.y + 1 + k * 2; (m.material as THREE.Material).opacity = 0.6 * (1 - k); } });
        break;
      }
      case "splatter": {
        const grp = new THREE.Group();
        for (let i = 0; i < 12; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), new THREE.MeshBasicMaterial({ color: 0xc0202a, transparent: true }));
          (s as any).vel = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3.5, (Math.random() - 0.5) * 5);
          grp.add(s);
        }
        grp.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(grp);
        this.fx.push({ obj: grp, born: now, life: 520, update: (k, dt) => { grp.children.forEach((c) => { const v = (c as any).vel as THREE.Vector3; v.y -= 11 * dt; c.position.addScaledVector(v, dt); (((c as THREE.Mesh).material) as THREE.Material).opacity = 1 - k; }); } });
        break;
      }
      case "confetti": {
        const cols = [0xff5e5e, 0x5dff9b, 0x36e7ff, 0xffd23f, 0xb06bff];
        const grp = new THREE.Group();
        for (let i = 0; i < 18; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, side: THREE.DoubleSide }));
          (m as any).vel = new THREE.Vector3((Math.random() - 0.5) * 3.5, 2 + Math.random() * 3, (Math.random() - 0.5) * 3.5);
          (m as any).spin = new THREE.Vector3(Math.random() * 7, Math.random() * 7, Math.random() * 7);
          grp.add(m);
        }
        grp.position.set(f.pos.x, f.pos.y, f.pos.z);
        this.scene.add(grp);
        this.fx.push({ obj: grp, born: now, life: 1300, update: (k, dt) => { grp.children.forEach((c) => { const v = (c as any).vel as THREE.Vector3; v.y -= 6 * dt; c.position.addScaledVector(v, dt); const sp = (c as any).spin as THREE.Vector3; c.rotation.x += sp.x * dt; c.rotation.y += sp.y * dt; (((c as THREE.Mesh).material) as THREE.Material).opacity = 1 - k; }); } });
        break;
      }
    }
  }

  updateFx(now: number, dt: number) {
    const keep: Fx[] = [];
    for (const f of this.fx) {
      const k = (now - f.born) / f.life;
      if (k >= 1) {
        this.scene.remove(f.obj);
        if (f.light) this.scene.remove(f.light);
        f.obj.traverse?.((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose?.(); });
        continue;
      }
      f.update(k, dt);
      keep.push(f);
    }
    this.fx = keep;
  }

  addShake(now: number, mag: number) {
    this.shakeUntil = now + 350;
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  // ---------- frame ----------
  renderFrame(local: LocalRender, dt: number, now: number) {
    // interpolate remote players
    const lerp = 1 - Math.exp(-dt * 16);
    for (const [id, v] of this.players) {
      if (id === this.localId) continue;
      v.group.position.lerp(v.targetPos, lerp);
      const cur = v.group.rotation.y;
      let d = ((v.targetYaw - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      v.group.rotation.y = cur + d * lerp;
      v.tag.position.y = 2.25; // billboard auto-faces
    }

    // oddball spin
    if (this.oddballMesh) this.oddballMesh.rotation.y += dt * 2;
    for (const { mesh } of this.pickups.values()) {
      mesh.rotation.y += dt * 1.5;
      mesh.position.y += Math.sin(now / 400) * 0.002;
    }

    // camera at local eye
    const eyeY = local.pos.y + C.PLAYER_EYE;
    this.camera.position.set(local.pos.x, eyeY, local.pos.z);
    this.camera.rotation.set(0, 0, 0, "YXZ");
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = local.yaw;
    this.camera.rotation.x = local.pitch;

    // shake (suppressed when the player prefers reduced motion)
    if (now < this.shakeUntil && !this.reduceMotion) {
      const s = this.shakeMag * ((this.shakeUntil - now) / 350);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z = (Math.random() - 0.5) * s * 0.1;
    } else {
      this.shakeMag = 0;
    }

    // fov zoom
    const def = weaponDef(local.weaponId);
    const wantFov = local.zoomed && def.zoom ? this.baseFov * def.zoom : this.baseFov;
    this.curFov += (wantFov - this.curFov) * Math.min(1, dt * 14);
    if (Math.abs(this.curFov - this.camera.fov) > 0.01) {
      this.camera.fov = this.curFov;
      this.camera.updateProjectionMatrix();
    }

    // viewmodel
    this.buildViewmodel(local.weaponId);
    this.viewmodel.visible = !local.zoomed && local.alive && !local.inVehicle;
    this.bobT += dt * (Math.hypot(local.vel.x, local.vel.z) > 1 ? 9 : 2);
    if (this.vmWeapon) {
      const recoil = local.firing ? 0.03 : 0;
      const bob = this.reduceMotion ? 0.25 : 1;
      this.vmWeapon.position.y = VM_BASE.y + Math.sin(this.bobT) * 0.012 * bob;
      this.vmWeapon.position.x = VM_BASE.x + Math.cos(this.bobT * 0.5) * 0.008 * bob;
      this.vmWeapon.position.z = VM_BASE.z + recoil;
      this.vmWeapon.rotation.z = Math.sin(this.bobT * 0.5) * 0.01 * bob;
      this.vmWeapon.rotation.x = recoil * 0.6;
    }
    if (this.vmFlash) {
      this.vmFlash.intensity = local.firing ? 3 + Math.random() * 2 : this.vmFlash.intensity * 0.6;
    }

    this.updateFx(now, dt);
    if (this.ringMesh) this.ringMesh.rotation.z += dt * 0.004;
    if (this.dust) {
      this.dust.rotation.y += dt * 0.015;
      this.dust.position.y = Math.sin(now / 3500) * 0.4;
    }
    if (this.grainPass) this.grainPass.uniforms["uTime"].value = now / 1000;
    if (this.composer && this.usePost) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // raycast helper for client-side prediction hit feedback (not used for authority)
  screenToWorldDir(yaw: number, pitch: number): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }
}

function mix(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
