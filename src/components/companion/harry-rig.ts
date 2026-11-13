import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { HarryMood } from "./harry-moods";

/*
 * Harry in 3D, built from code (no model file): a chibi schoolboy matching
 * the mascot badge — messy brown hair, white short-sleeve shirt, teal
 * backpack. Shoulders, elbows, head, torso and legs are joints; each mood is
 * a target pose that the joints reach through damped springs, with a
 * procedural action layered on top (waving, jumping, page turning, dozing…).
 * Idle life: breathing, weight shift, blinking, looking at the pointer and
 * hair that lags behind head turns.
 */

type V3 = [number, number, number];
type EyeKind = "open" | "smile" | "sleepy" | "star";
type MouthKind = "open" | "grin" | "smile" | "o" | "small" | "wavy" | "none";
type PropName = "book" | "news" | "heart" | "star" | "flame" | "sweat" | "zzz" | "question" | "sparkles" | "hearts" | "alert";

type Pose = {
  armL: V3; armR: V3; elbowL: number; elbowR: number;
  head: V3; torso: V3;
  eyes: EyeKind; look: [number, number]; brows: number; browY: number;
  mouth: MouthKind; props: PropName[];
};

/* Arm angles (radians): z swings the arm out to the side (left arm −, right arm +). x swings a hanging arm
   forward when negative; once an arm is raised past the shoulder, positive x brings it in front of the head. */
const poses: Record<HarryMood, Pose> = {
  happy: { armL: [0, 0, -0.16], armR: [0, 0, 0.16], elbowL: -0.2, elbowR: -0.2, head: [0, 0, 0.04], torso: [0, 0, 0], eyes: "open", look: [0, 0], brows: 0, browY: 0, mouth: "open", props: [] },
  wave: { armL: [0, 0, -0.14], armR: [0.45, 0, 2.3], elbowL: -0.2, elbowR: -0.35, head: [0, 0, -0.1], torso: [0, 0, -0.03], eyes: "smile", look: [0, 0], brows: 0, browY: 0.02, mouth: "open", props: [] },
  cheer: { armL: [0.4, 0, -2.45], armR: [0.4, 0, 2.45], elbowL: -0.25, elbowR: -0.25, head: [-0.12, 0, 0], torso: [-0.05, 0, 0], eyes: "smile", look: [0, 0], brows: 0, browY: 0.04, mouth: "grin", props: ["sparkles"] },
  proud: { armL: [0, 0, -0.18], armR: [0.5, 0, 2.2], elbowL: -0.2, elbowR: -0.15, head: [-0.16, 0, -0.06], torso: [-0.08, 0, 0], eyes: "star", look: [0, 0], brows: 0, browY: 0.04, mouth: "grin", props: ["star", "sparkles"] },
  reading: { armL: [-1.05, 0, 0.38], armR: [-1.05, 0, -0.38], elbowL: -0.95, elbowR: -0.95, head: [0.3, 0, 0.06], torso: [0.06, 0, 0], eyes: "open", look: [0, -0.6], brows: 0, browY: 0, mouth: "smile", props: ["book"] },
  news: { armL: [-1.0, 0, 0.3], armR: [-1.0, 0, -0.3], elbowL: -0.9, elbowR: -0.9, head: [0.08, 0, -0.05], torso: [-0.03, 0, 0], eyes: "open", look: [0, -0.15], brows: -0.12, browY: 0.05, mouth: "o", props: ["news", "alert"] },
  thinking: { armL: [-0.75, 0, 0.55], armR: [-1.45, 0, -0.5], elbowL: -1.15, elbowR: -1.3, head: [-0.12, 0.12, 0.14], torso: [0, 0.06, 0], eyes: "open", look: [0.45, 0.65], brows: -0.12, browY: 0.03, mouth: "small", props: ["question"] },
  sleepy: { armL: [0.05, 0, -0.05], armR: [0.05, 0, 0.05], elbowL: -0.05, elbowR: -0.05, head: [0.32, 0, 0.16], torso: [0.08, 0, 0], eyes: "sleepy", look: [0, 0], brows: 0.1, browY: -0.02, mouth: "small", props: ["zzz"] },
  worried: { armL: [-0.95, 0, 0.62], armR: [-0.95, 0, -0.62], elbowL: -1.35, elbowR: -1.35, head: [0.06, 0, -0.06], torso: [0.03, 0, 0], eyes: "open", look: [0, 0], brows: 0.32, browY: 0.04, mouth: "wavy", props: ["sweat"] },
  fire: { armL: [0, 0, -0.22], armR: [0.5, 0, 2.2], elbowL: -0.3, elbowR: -0.55, head: [-0.06, 0, -0.06], torso: [-0.04, 0, 0], eyes: "open", look: [0.3, 0.3], brows: -0.3, browY: -0.01, mouth: "grin", props: ["flame"] },
  love: { armL: [-0.95, 0, 0.6], armR: [-0.95, 0, -0.6], elbowL: -1.4, elbowR: -1.4, head: [0.08, 0, 0.16], torso: [0, 0, 0], eyes: "smile", look: [0, 0], brows: 0.05, browY: 0.02, mouth: "smile", props: ["heart", "hearts"] },
};

const colors = {
  skin: 0xffcfae, skinShade: 0xf2a990, shirt: 0xf6f8fa, pants: 0x2f4a73, shoe: 0xff7466, sole: 0xfff4ea,
  teal: 0x16a5ae, tealDark: 0x0c7f88, hair: 0x4a2e20, hairLight: 0x5f3d2b, eye: 0x2a170e, iris: 0x8c5430,
  mouth: 0x9c2636, tongue: 0xff7f86, gold: 0xffc23d, heart: 0xff5f78, paper: 0xfffaf0,
};

export type HarryRigInfo = { source: "model" | "code"; clips: string[]; byMood: Partial<Record<HarryMood, string>>; error?: string };

export type HarryRig = {
  /** What drives Harry: the sculpted model (with its clip per mood) or the code-built rig. */
  info?: HarryRigInfo;
  setMood: (mood: HarryMood) => void;
  hop: () => void;
  setPointer: (x: number, y: number) => void;
  resize: (width: number, height: number) => void;
  setActive: (active: boolean) => void;
  /** Turn Harry around his vertical axis (radians), e.g. for a turntable preview. */
  setYaw: (yaw: number) => void;
  /** Run the simulation forward without waiting for frames (tests, screenshots). */
  advance: (seconds: number) => void;
  dispose: () => void;
};

/* ───────── Small helpers ───────── */

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A rounded teardrop along +y from 0 (round base) to 1 (soft tip): one lock of hair, a flame or a sweat drop. */
function teardrop(round = 0.5, tip = 0.04) {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const y = i / 18;
    const base = Math.sin(Math.min(1, y / 0.32) * Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(0.0001, (Math.pow(1 - y, 1.15) * base * round) + (y > 0.95 ? tip * (1 - y) * 20 : 0)), y));
  }
  return new THREE.LatheGeometry(points, 14);
}

function starShape(outer: number, inner: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

function heartShape(size: number) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.9 * s);
  shape.bezierCurveTo(-0.15 * s, -0.7 * s, -1 * s, -0.2 * s, -1 * s, 0.25 * s);
  shape.bezierCurveTo(-1 * s, 0.75 * s, -0.4 * s, 1 * s, 0, 0.55 * s);
  shape.bezierCurveTo(0.4 * s, 1 * s, 1 * s, 0.75 * s, 1 * s, 0.25 * s);
  shape.bezierCurveTo(1 * s, -0.2 * s, 0.15 * s, -0.7 * s, 0, -0.9 * s);
  return shape;
}

const zAxis = new THREE.Vector3(0, 0, 1);

function damp(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/* ───────── The rig ───────── */

export function createHarryRig(canvas: HTMLCanvasElement, { reducedMotion = false }: { reducedMotion?: boolean } = {}): HarryRig {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(24, 1 / 1.2, 0.1, 50);
  camera.position.set(0, 1.85, 10);
  camera.lookAt(0, 1.72, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8f0, 1.25));
  const key = new THREE.DirectionalLight(0xfff4ea, 1.7);
  key.position.set(3.2, 6, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.4;
  key.shadow.camera.right = 2.4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -1;
  key.shadow.radius = 3;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8f4ff, 0.9);
  rim.position.set(-3.5, 3.5, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe2d6, 0);
  fill.position.set(-4, 1.5, 4);
  scene.add(fill);

  // Cel shading like the sticker: three flat tones per material plus ink outlines (below).
  const toonRamp = new THREE.DataTexture(new Uint8Array([175, 175, 175, 255, 225, 225, 225, 255, 255, 255, 255, 255]), 3, 1);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  const toon = (color: number, extra: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp, ...extra });
  const flat = (color: number, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
  const materials = {
    skin: toon(colors.skin),
    skinShade: flat(colors.skinShade),
    shirt: toon(colors.shirt),
    pants: toon(colors.pants),
    shoe: toon(colors.shoe),
    sole: toon(colors.sole),
    teal: toon(colors.teal),
    tealDark: toon(colors.tealDark),
    hair: toon(colors.hair),
    eye: flat(colors.eye),
    iris: flat(colors.iris),
    shine: flat(0xffffff),
    line: flat(0x2a1810),
    brow: flat(0x3b2216),
    mouth: flat(0x8f2232, { side: THREE.DoubleSide }),
    tongue: flat(0xff8a8f, { side: THREE.DoubleSide }),
    teeth: flat(0xffffff, { side: THREE.DoubleSide }),
    gold: toon(colors.gold, { emissive: new THREE.Color(0x5a3a00), emissiveIntensity: 0.3 }),
    heart: toon(colors.heart),
    paper: toon(colors.paper, { side: THREE.DoubleSide }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x9fdcff, roughness: 0.05, transmission: 0.6, thickness: 0.2, clearcoat: 1, transparent: true, opacity: 0.9 }),
    flameOuter: new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.95 }),
    flameInner: new THREE.MeshBasicMaterial({ color: 0xffd84a }),
  };

  const textures: THREE.Texture[] = [];
  const disposables: { dispose: () => void }[] = [];
  const geo = <T extends THREE.BufferGeometry>(geometry: T) => { disposables.push(geometry); return geometry; };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  };

  /* Ground contact shadow. */
  const shadowTexture = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(16,35,63,0.42)");
    g.addColorStop(0.55, "rgba(16,35,63,0.16)");
    g.addColorStop(1, "rgba(16,35,63,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  textures.push(shadowTexture);
  const contact = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.3, 1.1)), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  scene.add(contact);

  /* Skeleton. */
  const root = new THREE.Group();
  scene.add(root);
  const hips = new THREE.Group();
  hips.position.y = 0.72;
  root.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);

  // Legs and shoes hang from the hips.
  const legGeometry = geo(new THREE.CapsuleGeometry(0.15, 0.24, 6, 14));
  const shoeGeometry = geo(new THREE.SphereGeometry(0.19, 24, 16));
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.19, -0.1, 0);
    const limb = mesh(legGeometry, materials.pants);
    limb.position.y = -0.26;
    leg.add(limb);
    const shoe = mesh(shoeGeometry, materials.shoe);
    shoe.scale.set(0.95, 0.6, 1.35);
    shoe.position.set(side * 0.02, -0.5, 0.07);
    leg.add(shoe);
    const sole = mesh(shoeGeometry, materials.sole);
    sole.scale.set(0.97, 0.18, 1.38);
    sole.position.set(side * 0.02, -0.58, 0.07);
    leg.add(sole);
    hips.add(leg);
    legs.push(leg);
  }

  // Shirt and shorts are lathed profiles, slightly flattened front to back.
  const shirt = mesh(geo(new THREE.LatheGeometry([
    [0.0, -0.06], [0.33, -0.05], [0.41, 0.04], [0.44, 0.22], [0.43, 0.42], [0.39, 0.56], [0.28, 0.67], [0.14, 0.73], [0.0, 0.74],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 40)), materials.shirt);
  shirt.scale.z = 0.8;
  torso.add(shirt);
  const shorts = mesh(geo(new THREE.LatheGeometry([
    [0.0, -0.2], [0.35, -0.19], [0.42, -0.1], [0.435, 0.02], [0.0, 0.03],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 40)), materials.pants);
  shorts.scale.z = 0.8;
  hips.add(shorts);

  // Collar, buttons, neck.
  const collarGeometry = geo(new RoundedBoxGeometry(0.2, 0.05, 0.13, 3, 0.02));
  for (const side of [-1, 1]) {
    const collar = mesh(collarGeometry, materials.shirt);
    collar.position.set(side * 0.1, 0.66, 0.2);
    collar.rotation.set(-0.7, side * 0.25, side * -0.55);
    torso.add(collar);
  }
  const buttonGeometry = geo(new THREE.SphereGeometry(0.024, 10, 8));
  for (const y of [0.45, 0.3, 0.15]) {
    const button = mesh(buttonGeometry, materials.sole, false);
    button.position.set(0, y, 0.345);
    torso.add(button);
  }
  const neck = mesh(geo(new THREE.CylinderGeometry(0.12, 0.13, 0.18, 16)), materials.skin);
  neck.position.y = 0.76;
  torso.add(neck);

  // Backpack and straps.
  const pack = mesh(geo(new RoundedBoxGeometry(0.74, 0.8, 0.34, 4, 0.14)), materials.teal);
  pack.position.set(0, 0.34, -0.43);
  torso.add(pack);
  const pocket = mesh(geo(new RoundedBoxGeometry(0.5, 0.3, 0.12, 3, 0.05)), materials.tealDark);
  pocket.position.set(0, 0.16, -0.6);
  torso.add(pocket);
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, 0.62, -0.28), new THREE.Vector3(side * 0.25, 0.73, -0.02), new THREE.Vector3(side * 0.26, 0.6, 0.29),
      new THREE.Vector3(side * 0.27, 0.3, 0.355), new THREE.Vector3(side * 0.26, 0.04, 0.34),
    ]);
    torso.add(mesh(geo(new THREE.TubeGeometry(curve, 24, 0.042, 8, false)), materials.tealDark));
  }

  // Arms: shoulder → elbow → hand.
  const sleeveGeometry = geo(new THREE.CapsuleGeometry(0.145, 0.1, 6, 14));
  const upperGeometry = geo(new THREE.CapsuleGeometry(0.095, 0.22, 6, 12));
  const foreGeometry = geo(new THREE.CapsuleGeometry(0.088, 0.2, 6, 12));
  const palmGeometry = geo(new THREE.SphereGeometry(0.12, 20, 14));
  const thumbGeometry = geo(new THREE.SphereGeometry(0.052, 12, 10));
  type Arm = { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group };
  const makeArm = (side: -1 | 1): Arm => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.4, 0.58, 0);
    const sleeve = mesh(sleeveGeometry, materials.shirt);
    sleeve.position.y = -0.1;
    shoulder.add(sleeve);
    const upper = mesh(upperGeometry, materials.skin);
    upper.position.y = -0.27;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.42;
    shoulder.add(elbow);
    const fore = mesh(foreGeometry, materials.skin);
    fore.position.y = -0.15;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.33;
    elbow.add(hand);
    const palm = mesh(palmGeometry, materials.skin);
    palm.scale.set(0.92, 1.05, 0.82);
    hand.add(palm);
    const thumb = mesh(thumbGeometry, materials.skin);
    thumb.position.set(-side * 0.085, 0.03, 0.05);
    hand.add(thumb);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  /* Head. A sphere reshaped into an anime face: fuller cheeks, tapered chin.
     `onHead` returns a point and outward normal for angles θ (around) and φ (up). */
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  const headCenter = new THREE.Vector3(0, 0.8, 0);
  const headScale = new THREE.Vector3(1.0, 0.93, 0.9);
  const direction = (theta: number, phi: number) => new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(phi), Math.cos(theta) * Math.cos(phi));
  const shapeHead = (d: THREE.Vector3) => {
    const p = d.clone();
    if (p.y < 0) {
      const k = Math.pow(-p.y, 1.3);
      p.x *= 1 - 0.24 * k;
      p.z *= 1 - 0.06 * k;
      p.y *= 0.9;
      p.z += 0.06 * k * Math.max(0, d.z);
    }
    const cheek = Math.exp(-Math.pow((p.y + 0.25) / 0.22, 2)) * Math.max(0, d.z);
    p.x *= 1 + 0.05 * cheek;
    return p.multiply(headScale);
  };
  const skullGeometry = geo(new THREE.SphereGeometry(1, 72, 54));
  const skullPositions = skullGeometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < skullPositions.count; i++) {
    vertex.fromBufferAttribute(skullPositions, i).normalize();
    const shaped = shapeHead(vertex);
    skullPositions.setXYZ(i, shaped.x, shaped.y, shaped.z);
  }
  skullGeometry.computeVertexNormals();
  const skull = mesh(skullGeometry, materials.skin);
  skull.position.copy(headCenter);
  head.add(skull);

  const onHead = (theta: number, phi: number, out = 0) => {
    const d = direction(theta, phi);
    const point = shapeHead(d);
    const along = shapeHead(direction(theta + 0.01, phi)).sub(point);
    const up = shapeHead(direction(theta, phi + 0.01)).sub(point);
    const normal = along.cross(up).normalize();
    if (normal.dot(d) < 0) normal.negate();
    return { position: point.addScaledVector(normal, out).add(headCenter), normal };
  };
  const place = (object: THREE.Object3D, theta: number, phi: number, out = 0) => {
    const { position, normal } = onHead(theta, phi, out);
    object.position.copy(position);
    object.quaternion.setFromUnitVectors(zAxis, normal);
    head.add(object);
    return object;
  };

  // Ears with a darker inner bowl.
  const earGeometry = geo(new THREE.SphereGeometry(0.27, 24, 16));
  for (const side of [-1, 1]) {
    const ear = place(new THREE.Group(), side * 1.3, -0.12, -0.02);
    const outerEar = mesh(earGeometry, materials.skin);
    outerEar.scale.set(0.74, 1, 0.5);
    ear.add(outerEar);
    const innerEar = mesh(earGeometry, materials.skinShade, false);
    innerEar.scale.set(0.38, 0.6, 0.2);
    innerEar.position.z = 0.06;
    ear.add(innerEar);
  }

  // Eyes, anime style: white, a painted iris, a thick upper lash line,
  // highlights and a clear glossy dome. One group per eye holds every shape.
  const eyeOpen: THREE.Group[] = [];
  const irises: THREE.Group[] = [];
  const eyeSmile: THREE.Object3D[] = [];
  const eyeSleepy: THREE.Object3D[] = [];
  const eyeStar: THREE.Object3D[] = [];
  const irisTexture = canvasTexture(256, 256, (ctx) => {
    const ring = ctx.createRadialGradient(128, 140, 10, 128, 128, 126);
    ring.addColorStop(0, "#1a0c06");
    ring.addColorStop(0.3, "#2a1409");
    ring.addColorStop(0.36, "#6e3b1b");
    ring.addColorStop(0.72, "#b06d33");
    ring.addColorStop(0.9, "#5b2f14");
    ring.addColorStop(1, "#24120a");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(128, 128, 127, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createLinearGradient(0, 70, 0, 256);
    glow.addColorStop(0, "rgba(255,196,128,0)");
    glow.addColorStop(1, "rgba(255,196,128,0.55)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,25,8,0.35)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 52, 132 + Math.sin(a) * 58);
      ctx.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 112);
      ctx.stroke();
    }
    ctx.fillStyle = "#120703";
    ctx.beginPath();
    ctx.ellipse(128, 134, 40, 48, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  textures.push(irisTexture);
  const scleraMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const irisMaterial = new THREE.MeshBasicMaterial({ map: irisTexture });
  const glossMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.1, depthWrite: false });
  const lashMaterial = new THREE.MeshBasicMaterial({ color: 0x1f120b });
  const disposableMaterials = [scleraMaterial, irisMaterial, glossMaterial, lashMaterial];
  const scleraGeometry = geo(new THREE.CircleGeometry(0.2, 48));
  const irisGeometry = geo(new THREE.CircleGeometry(0.172, 48));
  const shineGeometry = geo(new THREE.CircleGeometry(0.05, 20));
  const glossGeometry = geo(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, 0.9));
  const arcGeometry = geo(new THREE.TorusGeometry(0.14, 0.03, 10, 28, Math.PI));
  const eyeStarGeometry = geo(new THREE.ExtrudeGeometry(starShape(0.19, 0.085), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3 }));
  for (const side of [-1, 1]) {
    const socket = place(new THREE.Group(), side * 0.36, -0.1, 0.012);
    socket.scale.setScalar(1.18);
    const open = new THREE.Group();
    socket.add(open);
    const sclera = new THREE.Mesh(scleraGeometry, scleraMaterial);
    sclera.scale.set(0.84, 1.04, 1);
    open.add(sclera);
    const iris = new THREE.Group();
    iris.position.set(0, -0.012, 0.004);
    open.add(iris);
    const irisMesh = new THREE.Mesh(irisGeometry, irisMaterial);
    irisMesh.scale.set(0.88, 1.02, 1);
    iris.add(irisMesh);
    const shine = new THREE.Mesh(shineGeometry, materials.shine);
    shine.position.set(-0.05, 0.06, 0.012);
    open.add(shine);
    const shine2 = new THREE.Mesh(shineGeometry, materials.shine);
    shine2.scale.setScalar(0.45);
    shine2.position.set(0.05, -0.07, 0.012);
    open.add(shine2);
    const gloss = new THREE.Mesh(glossGeometry, glossMaterial);
    gloss.rotation.x = Math.PI / 2;
    gloss.scale.set(0.8, 0.35, 1);
    open.add(gloss);
    // Upper lash line, thicker toward the outer corner with a small flick.
    const lash = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.17, 0.02, 0.016), new THREE.Vector3(-side * 0.1, 0.17, 0.018), new THREE.Vector3(side * 0.04, 0.21, 0.018),
      new THREE.Vector3(side * 0.15, 0.15, 0.018), new THREE.Vector3(side * 0.22, 0.09, 0.016),
    ]);
    open.add(new THREE.Mesh(geo(new THREE.TubeGeometry(lash, 32, 0.03, 8, false)), lashMaterial));
    const lower = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 0.04, -0.205, 0.014), new THREE.Vector3(side * 0.12, -0.17, 0.014), new THREE.Vector3(side * 0.16, -0.12, 0.014)]);
    open.add(new THREE.Mesh(geo(new THREE.TubeGeometry(lower, 12, 0.012, 6, false)), materials.skinShade));
    eyeOpen.push(open);
    irises.push(iris);

    const smile = mesh(arcGeometry, lashMaterial, false);
    smile.position.y = -0.04;
    socket.add(smile);
    eyeSmile.push(smile);
    const sleepy = mesh(arcGeometry, lashMaterial, false);
    sleepy.rotation.z = Math.PI;
    sleepy.scale.set(1, 0.5, 1);
    sleepy.position.y = 0.02;
    socket.add(sleepy);
    eyeSleepy.push(sleepy);
    const star = mesh(eyeStarGeometry, materials.gold, false);
    star.position.z = -0.02;
    socket.add(star);
    eyeStar.push(star);
  }

  // Brows: thick, slightly lifted at the outer ends.
  const browGeometry = geo(new THREE.CapsuleGeometry(0.036, 0.2, 4, 10));
  const brows: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const holder = place(new THREE.Group(), side * 0.36, 0.2, 0.03);
    const brow = mesh(browGeometry, materials.brow, false);
    brow.rotation.z = Math.PI / 2;
    brow.scale.set(1, 1, 0.6);
    brow.userData.side = side;
    holder.add(brow);
    brows.push(brow);
  }

  // Nose and cheeks.
  const nose = mesh(geo(new THREE.SphereGeometry(0.05, 14, 10)), flat(0xf59585), false);
  nose.scale.set(0.7, 0.75, 0.7);
  place(nose, 0, -0.24, 0.0);
  const blushTexture = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, "rgba(255,120,140,0.7)");
    g.addColorStop(1, "rgba(255,120,140,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  textures.push(blushTexture);
  const blushMaterial = new THREE.MeshBasicMaterial({ map: blushTexture, transparent: true, depthWrite: false, opacity: 0.5 });
  const blushGeometry = geo(new THREE.CircleGeometry(0.15, 24));
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(blushGeometry, blushMaterial);
    cheek.scale.set(1.3, 0.75, 1);
    place(cheek, side * 0.56, -0.26, 0.012);
  }

  // Mouth shapes share one holder.
  const mouth = place(new THREE.Group(), 0, -0.44, 0.02);
  const mouths: Record<Exclude<MouthKind, "none">, THREE.Object3D> = {
    open: new THREE.Group(), grin: new THREE.Group(), smile: new THREE.Group(), o: new THREE.Group(), small: new THREE.Group(), wavy: new THREE.Group(),
  };
  const openShape = new THREE.Mesh(geo(new THREE.CircleGeometry(0.17, 32, Math.PI, Math.PI)), materials.mouth);
  openShape.scale.y = 0.85;
  mouths.open.add(openShape);
  const upperTeeth = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.25, 0.04)), materials.teeth);
  upperTeeth.position.set(0, -0.022, 0.003);
  mouths.open.add(upperTeeth);
  const tongue = new THREE.Mesh(geo(new THREE.CircleGeometry(0.09, 24, Math.PI, Math.PI)), materials.tongue);
  tongue.position.set(0, -0.075, 0.004);
  tongue.scale.y = 0.55;
  mouths.open.add(tongue);
  mouths.grin.add(new THREE.Mesh(geo(new THREE.CircleGeometry(0.19, 32, Math.PI, Math.PI)), materials.mouth));
  const teeth = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.32, 0.045)), materials.teeth);
  teeth.position.set(0, -0.02, 0.003);
  mouths.grin.add(teeth);
  const grinTongue = tongue.clone();
  grinTongue.position.y = -0.11;
  mouths.grin.add(grinTongue);
  const smileArc = new THREE.Mesh(geo(new THREE.TorusGeometry(0.09, 0.02, 8, 20, Math.PI)), materials.line);
  smileArc.rotation.z = Math.PI;
  smileArc.position.y = 0.04;
  mouths.smile.add(smileArc);
  const oMouth = new THREE.Mesh(geo(new THREE.CircleGeometry(0.055, 24)), materials.mouth);
  oMouth.scale.y = 1.25;
  mouths.o.add(oMouth);
  const smallMouth = new THREE.Mesh(geo(new THREE.CircleGeometry(0.035, 18)), materials.mouth);
  smallMouth.scale.y = 0.8;
  mouths.small.add(smallMouth);
  const wave = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(-0.11 + i * 0.0275, Math.sin(i * Math.PI / 2) * 0.016, 0)));
  mouths.wavy.add(new THREE.Mesh(geo(new THREE.TubeGeometry(wave, 30, 0.015, 6, false)), materials.line));
  for (const shape of Object.values(mouths)) mouth.add(shape);

  /* Hair: a base cap plus curved, tapered locks (flat ribbons lying on the
     head): a side-swept fringe, temple locks, back locks flaring out and
     messy crown spikes, like the mascot sticker. */
  const hair = new THREE.Group();
  hair.position.copy(headCenter);
  head.add(hair);
  const hairLight = materials.hair.clone();
  hairLight.color.set(colors.hairLight);
  const cap = mesh(geo(new THREE.SphereGeometry(1, 56, 36, 0, Math.PI * 2, 0, 1.5)), materials.hair);
  cap.scale.copy(headScale).multiplyScalar(1.1);
  cap.scale.y *= 1.08;
  cap.rotation.x = -0.3;
  hair.add(cap);
  const hairPoint = (theta: number, phi: number, r: number) => shapeHead(direction(theta, phi)).multiplyScalar(r);
  const lockSegments = 30;
  const lockRadial = 12;
  const strand = (points: readonly (readonly [number, number, number])[], width: number, thickness: number, material: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([theta, phi, r]) => hairPoint(theta, phi, r)));
    const positionsList: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= lockSegments; i++) {
      const u = i / lockSegments;
      const point = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      const outward = point.clone().normalize();
      const normal = outward.sub(tangent.clone().multiplyScalar(outward.dot(tangent))).normalize();
      const binormal = tangent.clone().cross(normal).normalize();
      const taper = u < 0.15 ? 0.75 + 0.25 * (u / 0.15) : Math.pow(1 - (u - 0.15) / 0.85, 0.8);
      const w = width * taper + 0.004;
      const th = thickness * taper + 0.004;
      for (let j = 0; j < lockRadial; j++) {
        const a = (j / lockRadial) * Math.PI * 2;
        positionsList.push(
          point.x + binormal.x * Math.cos(a) * w + normal.x * Math.sin(a) * th,
          point.y + binormal.y * Math.cos(a) * w + normal.y * Math.sin(a) * th,
          point.z + binormal.z * Math.cos(a) * w + normal.z * Math.sin(a) * th,
        );
      }
    }
    for (let i = 0; i < lockSegments; i++) {
      for (let j = 0; j < lockRadial; j++) {
        const a = i * lockRadial + j;
        const b = i * lockRadial + ((j + 1) % lockRadial);
        indices.push(a, a + lockRadial, b, b, a + lockRadial, b + lockRadial);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positionsList, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    hair.add(mesh(geo(geometry), material));
  };
  const shades = [materials.hair, hairLight];
  const highlight = toon(0x9a7155);
  type Lock = readonly (readonly [number, number, number])[];
  // A thin lighter streak riding on top of a lock, like the sticker's hair shine.
  const shine = (points: Lock, lift = 0.15) => strand(points.slice(1, 3).map(([theta, phi, r]) => [theta, phi, r + lift] as const), 0.07, 0.025, highlight);
  // Fringe: thick chunks falling to the brows; the left one flicks outward.
  const fringe: Lock[] = [
    [[0.95, 0.95, 1.1], [0.95, 0.65, 1.24], [0.86, 0.4, 1.18], [0.78, 0.22, 1.07]],
    [[0.62, 1.1, 1.1], [0.58, 0.78, 1.26], [0.46, 0.48, 1.2], [0.36, 0.25, 1.08]],
    [[0.28, 1.2, 1.1], [0.22, 0.86, 1.27], [0.1, 0.52, 1.21], [0.0, 0.26, 1.08]],
    [[-0.06, 1.2, 1.1], [-0.14, 0.86, 1.27], [-0.28, 0.52, 1.21], [-0.38, 0.26, 1.08]],
    [[-0.4, 1.12, 1.1], [-0.5, 0.8, 1.26], [-0.66, 0.5, 1.2], [-0.78, 0.28, 1.08]],
    [[-0.75, 1.0, 1.1], [-0.9, 0.72, 1.25], [-1.08, 0.5, 1.22], [-1.26, 0.42, 1.17]],
  ];
  fringe.forEach((points, i) => strand(points, 0.46, 0.16, shades[i % 2]));
  [fringe[1], fringe[2], fringe[4]].forEach((points) => shine(points));
  // Temples stop above the ears so the ears show, like the sticker.
  for (const side of [-1, 1]) {
    strand([[side * 1.05, 1.0, 1.1], [side * 1.2, 0.7, 1.22], [side * 1.3, 0.42, 1.14], [side * 1.36, 0.22, 1.06]], 0.4, 0.15, materials.hair);
    strand([[side * 1.7, 0.95, 1.1], [side * 1.85, 0.55, 1.22], [side * 1.95, 0.15, 1.15], [side * 1.95, -0.12, 1.08]], 0.42, 0.15, hairLight);
  }
  // Back locks flaring out at the nape.
  [2.25, 2.7, Math.PI, -2.7, -2.25].forEach((theta, i) => {
    const side = Math.sign(theta) || 1;
    strand([[theta, 1.1, 1.1], [theta, 0.6, 1.24], [theta, 0.05, 1.18], [theta + side * 0.14, -0.3, 1.22]], 0.48, 0.16, shades[i % 2]);
  });
  // Big messy crown: a swoop up to the right, flicks on both sides and at the back.
  const crown: Lock[] = [
    [[0.2, 1.3, 1.0], [0.5, 1.32, 1.34], [1.0, 1.1, 1.52]],
    [[0.9, 1.2, 1.0], [1.15, 1.1, 1.3], [1.45, 0.85, 1.48]],
    [[-0.3, 1.3, 1.0], [-0.6, 1.25, 1.34], [-1.05, 1.0, 1.48]],
    [[-1.3, 1.15, 1.0], [-1.55, 0.95, 1.28], [-1.85, 0.7, 1.42]],
    [[2.4, 1.2, 1.0], [2.5, 1.05, 1.3], [2.65, 0.8, 1.46]],
    [[-2.4, 1.2, 1.0], [-2.5, 1.05, 1.3], [-2.65, 0.8, 1.46]],
    [[3.1, 1.1, 1.0], [3.12, 0.9, 1.3], [3.14, 0.55, 1.44]],
  ];
  crown.forEach((points, i) => strand(points, 0.42, 0.16, shades[(i + 1) % 2]));
  [crown[0], crown[2]].forEach((points) => shine(points, 0.12));
  // Ahoge: the single curly strand on top.
  strand([[0.25, 1.45, 1.05], [0.35, 1.52, 1.4], [0.75, 1.42, 1.6], [1.0, 1.25, 1.54]], 0.09, 0.06, materials.hair);

  /* Props. */
  const props: Record<PropName, THREE.Object3D> = {} as Record<PropName, THREE.Object3D>;
  const propScale: Record<string, number> = {};

  // Open book held in front of the chest, pages facing out.
  const book = new THREE.Group();
  const pageTexture = canvasTexture(128, 160, (ctx) => {
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = "#9cc9cf";
    for (let y = 28; y < 150; y += 16) ctx.fillRect(16, y, 96 - (y % 32 ? 20 : 0), 5);
    ctx.fillStyle = "#16a5ae";
    ctx.fillRect(16, 10, 50, 8);
  });
  textures.push(pageTexture);
  const pageMaterial = new THREE.MeshBasicMaterial({ map: pageTexture });
  const pageGeometry = geo(new RoundedBoxGeometry(0.4, 0.52, 0.03, 2, 0.012));
  const coverGeometry = geo(new RoundedBoxGeometry(0.43, 0.56, 0.025, 2, 0.012));
  const printGeometry = geo(new THREE.PlaneGeometry(0.37, 0.48));
  const flip = new THREE.Group();
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.rotation.y = side * -0.32;
    const page = mesh(pageGeometry, materials.paper);
    page.position.x = side * 0.21;
    leaf.add(page);
    const print = new THREE.Mesh(printGeometry, pageMaterial);
    print.position.set(side * 0.21, 0, 0.017);
    leaf.add(print);
    const cover = mesh(coverGeometry, materials.teal);
    cover.position.set(side * 0.215, 0, -0.03);
    leaf.add(cover);
    book.add(leaf);
  }
  const flipPage = mesh(geo(new THREE.PlaneGeometry(0.38, 0.5)), materials.paper);
  flipPage.position.x = 0.2;
  flip.add(flipPage);
  flip.position.z = 0.03;
  book.add(flip);
  book.position.set(0, 0.32, 0.62);
  book.rotation.x = -0.25;
  torso.add(book);
  props.book = book;

  // Newspaper with a printed front page, gently bent.
  const newsTexture = canvasTexture(256, 180, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 180);
    ctx.fillStyle = "#10233f";
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText("DAILY NEWS", 22, 38);
    ctx.fillRect(18, 48, 220, 3);
    ctx.fillStyle = "#ffc94a";
    ctx.fillRect(18, 62, 86, 70);
    ctx.fillStyle = "#b5c3d1";
    for (let y = 64; y < 168; y += 13) ctx.fillRect(116, y, y > 140 ? 90 : 122, 6);
    for (let y = 142; y < 170; y += 13) ctx.fillRect(18, y, 86, 6);
  });
  textures.push(newsTexture);
  const newsGeometry = geo(new THREE.PlaneGeometry(0.95, 0.67, 12, 1));
  const positions = newsGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, -0.12 * Math.pow(positions.getX(i) / 0.475, 2));
  newsGeometry.computeVertexNormals();
  const paper = mesh(newsGeometry, new THREE.MeshBasicMaterial({ map: newsTexture, side: THREE.DoubleSide }));
  const news = new THREE.Group();
  news.add(paper);
  news.position.set(0, 0.36, 0.66);
  news.rotation.set(-0.12, 0, -0.04);
  torso.add(news);
  props.news = news;

  // Heart hugged at the chest.
  const heartGeometry = geo(new THREE.ExtrudeGeometry(heartShape(0.24), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 5, curveSegments: 24 }));
  heartGeometry.center();
  const heart = mesh(heartGeometry, materials.heart);
  heart.position.set(0, 0.3, 0.55);
  torso.add(heart);
  props.heart = heart;

  // Gold star held up in the right hand.
  const starGeometry = geo(new THREE.ExtrudeGeometry(starShape(0.3, 0.13), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4 }));
  starGeometry.center();
  const star = mesh(starGeometry, materials.gold);
  star.position.set(0, -0.42, 0.04);
  armR.hand.add(star);
  props.star = star;

  // Flame in the raised fist (always faces up, see update).
  const flame = new THREE.Group();
  const flameGeometry = geo(teardrop(0.55, 0));
  const outer = new THREE.Mesh(flameGeometry, materials.flameOuter);
  outer.scale.set(0.42, 0.7, 0.42);
  const inner = new THREE.Mesh(flameGeometry, materials.flameInner);
  inner.scale.set(0.24, 0.42, 0.24);
  inner.position.set(0, 0.02, 0.06);
  flame.add(outer, inner);
  const flameLight = new THREE.PointLight(0xff9a3c, 0.9, 2.2);
  flameLight.position.y = 0.3;
  flame.add(flameLight);
  scene.add(flame);
  props.flame = flame;

  // Sweat drop at the temple.
  const sweat = mesh(geo(teardrop(0.5, 0)), materials.water, false);
  sweat.scale.set(0.2, 0.26, 0.2);
  sweat.rotation.z = Math.PI;
  const sweatHolder = new THREE.Group();
  sweatHolder.add(sweat);
  sweatHolder.position.set(0.95, 1.15, 0.35);
  head.add(sweatHolder);
  props.sweat = sweatHolder;

  // Floating billboards: Zzz, ?, !, sparkles and little hearts.
  const spriteMaterial = (text: string, color: string, font = "bold 96px 'Patrick Hand', 'Comic Sans MS', cursive") => {
    const texture = canvasTexture(128, 128, (ctx) => {
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 14;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(text, 64, 70);
      ctx.fillStyle = color;
      ctx.fillText(text, 64, 70);
    });
    textures.push(texture);
    return new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  };
  const sparkleTexture = canvasTexture(128, 128, (ctx) => {
    ctx.translate(64, 64);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 14 : 60; const a = (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
  });
  textures.push(sparkleTexture);
  const makeFloaters = (items: { material: THREE.SpriteMaterial; position: V3; size: number }[]) => {
    const group = new THREE.Group();
    for (const item of items) {
      const sprite = new THREE.Sprite(item.material);
      sprite.position.set(...item.position);
      sprite.scale.setScalar(item.size);
      sprite.userData.base = item.position;
      group.add(sprite);
    }
    root.add(group);
    return group;
  };
  props.zzz = makeFloaters([
    { material: spriteMaterial("z", "#7c8db0"), position: [0.95, 2.95, 0.4], size: 0.32 },
    { material: spriteMaterial("z", "#7c8db0"), position: [1.2, 3.25, 0.4], size: 0.42 },
    { material: spriteMaterial("Z", "#7c8db0"), position: [1.5, 3.6, 0.4], size: 0.55 },
  ]);
  props.question = makeFloaters([{ material: spriteMaterial("?", "#7c66dc"), position: [1.15, 3.35, 0.3], size: 0.75 }]);
  props.alert = makeFloaters([{ material: spriteMaterial("!", "#ff5a4f"), position: [1.1, 3.3, 0.3], size: 0.7 }]);
  const sparkle = (color: number) => new THREE.SpriteMaterial({ map: sparkleTexture, color, depthWrite: false });
  props.sparkles = makeFloaters([
    { material: sparkle(0xffc94a), position: [-1.25, 2.9, 0.3], size: 0.42 },
    { material: sparkle(0x7fd3da), position: [1.3, 3.1, 0.3], size: 0.36 },
    { material: sparkle(0xff9aa8), position: [-1.0, 3.6, 0], size: 0.26 },
    { material: sparkle(0xb7a6ff), position: [1.05, 3.75, 0], size: 0.28 },
  ]);
  props.hearts = makeFloaters([
    { material: spriteMaterial("♥", "#ff7a8a", "bold 100px sans-serif"), position: [-1.15, 3.0, 0.3], size: 0.4 },
    { material: spriteMaterial("♥", "#ff9aa8", "bold 100px sans-serif"), position: [1.2, 3.3, 0.3], size: 0.32 },
  ]);
  // Props start hidden; remember each one's full size so it can pop in.
  const baseScales = new Map<THREE.Object3D, THREE.Vector3>();
  for (const [name, object] of Object.entries(props)) {
    baseScales.set(object, object.scale.clone());
    object.visible = false;
    propScale[name] = 0;
  }

  // Ink outlines: an inverted hull pushed out along the normals, drawn black on the back faces.
  const outlineMaterials = new Map<number, THREE.MeshBasicMaterial>();
  const outlineFor = (width: number) => {
    const key = Math.round(width * 1000);
    let material = outlineMaterials.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: 0x24160f, side: THREE.BackSide });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n  transformed += normalize(normal) * ${(key / 1000).toFixed(3)};`);
      };
      material.customProgramCacheKey = () => `harry-outline-${key}`;
      outlineMaterials.set(key, material);
    }
    return material;
  };
  const inked = new Set<THREE.Material>([materials.skin, materials.shirt, materials.pants, materials.shoe, materials.sole, materials.teal, materials.tealDark, materials.hair, hairLight, materials.gold, materials.heart]);
  const toOutline: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const target = object as THREE.Mesh;
    if (!target.isMesh) return;
    // Hair locks cast blotchy shadows on the face; the sticker has clean skin.
    if (target.material === materials.skin) target.receiveShadow = false;
    if (inked.has(target.material as THREE.Material)) toOutline.push(target);
  });
  for (const target of toOutline) {
    const scale = Math.max(target.scale.x, target.scale.y, target.scale.z) || 1;
    const hull = new THREE.Mesh(target.geometry, outlineFor(0.02 / scale));
    hull.castShadow = false;
    hull.receiveShadow = false;
    target.add(hull);
  }

  /* ───────── Animation state ───────── */
  let mood: HarryMood = "happy";
  let yaw = 0;
  let moodTime = 0;
  const cur = {
    armL: new THREE.Vector3(...poses.happy.armL), armR: new THREE.Vector3(...poses.happy.armR),
    elbowL: poses.happy.elbowL, elbowR: poses.happy.elbowR,
    head: new THREE.Vector3(...poses.happy.head), torso: new THREE.Vector3(),
    look: new THREE.Vector2(), brows: 0, browY: 0,
  };
  const pointer = new THREE.Vector2();
  let pointerAt = -10;
  const glance = new THREE.Vector2();
  let nextGlance = 2;
  let blinkAt = 2 + Math.random() * 2;
  let hopAt = -10;
  const motion = reducedMotion ? 0.25 : 1;
  const hairLag = new THREE.Vector2();
  const hairVel = new THREE.Vector2();
  const prevHead = new THREE.Vector2();
  const mouthScale: Record<string, number> = { open: 1 };

  const target = new THREE.Vector3();
  const timer = new THREE.Timer();
  let frame = 0;
  let active = true;
  let elapsed = 0;

  function update(dt: number) {
    elapsed += dt;
    moodTime += dt;
    const t = elapsed;
    const pose = poses[mood];
    const k = 9;

    // 1. Spring every joint toward the mood's pose.
    cur.armL.set(damp(cur.armL.x, pose.armL[0], k, dt), damp(cur.armL.y, pose.armL[1], k, dt), damp(cur.armL.z, pose.armL[2], k, dt));
    cur.armR.set(damp(cur.armR.x, pose.armR[0], k, dt), damp(cur.armR.y, pose.armR[1], k, dt), damp(cur.armR.z, pose.armR[2], k, dt));
    cur.elbowL = damp(cur.elbowL, pose.elbowL, k, dt);
    cur.elbowR = damp(cur.elbowR, pose.elbowR, k, dt);
    cur.torso.set(damp(cur.torso.x, pose.torso[0], 6, dt), damp(cur.torso.y, pose.torso[1], 6, dt), damp(cur.torso.z, pose.torso[2], 6, dt));
    cur.brows = damp(cur.brows, pose.brows, 12, dt);
    cur.browY = damp(cur.browY, pose.browY, 12, dt);

    // 2. Looking: at the pointer for a few seconds after it moves, otherwise small glances.
    if (t > nextGlance) { glance.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.4) * 0.5); nextGlance = t + 1.5 + Math.random() * 3; }
    const followPointer = t - pointerAt < 4 && mood !== "sleepy" && mood !== "reading";
    const gaze = followPointer ? pointer : glance;
    const lookX = pose.look[0] || gaze.x * 0.8;
    const lookY = pose.look[1] || gaze.y * 0.8;
    cur.look.set(damp(cur.look.x, lookX, 14, dt), damp(cur.look.y, lookY, 14, dt));
    target.set(pose.head[0] - (followPointer ? pointer.y * 0.16 : 0), pose.head[1] + (followPointer ? pointer.x * 0.32 : glance.x * 0.12), pose.head[2]);

    // 3. Per-mood actions on top of the pose.
    const a = motion;
    const offsets = { armL: new THREE.Vector3(), armR: new THREE.Vector3(), elbowL: 0, elbowR: 0, head: new THREE.Vector3(), lift: 0, squash: 0, sway: 0 };
    switch (mood) {
      case "wave": {
        const w = Math.sin(t * 9);
        offsets.armR.z = w * 0.28 * a;
        offsets.elbowR = (w * 0.35 - 0.1) * a;
        offsets.head.z = Math.sin(t * 4.5) * 0.05 * a;
        break;
      }
      case "cheer": {
        const cycle = (t * 1.25) % 1;
        const air = cycle < 0.55 ? Math.sin((cycle / 0.55) * Math.PI) : 0;
        offsets.lift = air * 0.42 * a;
        offsets.squash = cycle > 0.55 && cycle < 0.75 ? Math.sin(((cycle - 0.55) / 0.2) * Math.PI) * 0.12 * a : -air * 0.05 * a;
        offsets.armL.z = -Math.sin(t * 7.85) * 0.2 * a;
        offsets.armR.z = Math.sin(t * 7.85) * 0.2 * a;
        offsets.head.x = -air * 0.1;
        break;
      }
      case "proud": {
        offsets.armR.z = Math.sin(t * 2.4) * 0.08 * a;
        offsets.head.z = Math.sin(t * 1.6) * 0.06 * a;
        offsets.lift = Math.max(0, Math.sin(t * 2.4)) * 0.04 * a;
        break;
      }
      case "reading": {
        offsets.head.x = Math.sin(t * 1.3) * 0.04 * a;
        offsets.head.y = Math.sin(t * 0.55) * 0.18 * a;
        offsets.sway = Math.sin(t * 0.8) * 0.02 * a;
        break;
      }
      case "news": {
        const surprise = Math.max(0, Math.sin(t * 0.9)) ** 8;
        offsets.head.x = -surprise * 0.12 * a;
        offsets.lift = surprise * 0.06 * a;
        offsets.head.y = Math.sin(t * 0.7) * 0.15 * a;
        break;
      }
      case "thinking": {
        offsets.elbowR = Math.max(0, Math.sin(t * 6)) * 0.12 * a;
        offsets.head.z = Math.sin(t * 0.9) * 0.06 * a;
        offsets.sway = Math.sin(t * 0.9) * 0.025 * a;
        break;
      }
      case "sleepy": {
        // Head sinks slowly, then jerks back up.
        const cycle = (t % 4.2) / 4.2;
        const sink = cycle < 0.88 ? cycle / 0.88 : 1 - (cycle - 0.88) / 0.12;
        offsets.head.x = (sink * 0.35 - 0.12) * a;
        offsets.sway = Math.sin(t * 0.7) * 0.03 * a;
        break;
      }
      case "worried": {
        offsets.head.y = Math.sin(t * 2.2) * 0.22 * a;
        offsets.elbowL = Math.sin(t * 7) * 0.08 * a;
        offsets.elbowR = -Math.sin(t * 7) * 0.08 * a;
        offsets.sway = Math.sin(t * 3.3) * 0.02 * a;
        break;
      }
      case "fire": {
        const pump = Math.max(0, Math.sin(t * 5));
        offsets.armR.x = pump * 0.3 * a;
        offsets.elbowR = -pump * 0.5 * a;
        offsets.lift = pump * 0.08 * a;
        offsets.squash = -pump * 0.03 * a;
        break;
      }
      case "love": {
        offsets.sway = Math.sin(t * 1.8) * 0.06 * a;
        offsets.head.z = Math.sin(t * 1.8) * 0.1 * a;
        offsets.lift = Math.abs(Math.sin(t * 1.8)) * 0.03 * a;
        break;
      }
      default: {
        offsets.armL.z = -Math.sin(t * 1.1) * 0.03 * a;
        offsets.armR.z = Math.sin(t * 1.1 + 0.6) * 0.03 * a;
        offsets.head.z = Math.sin(t * 0.8) * 0.04 * a;
      }
    }
    cur.head.set(damp(cur.head.x, target.x, 7, dt), damp(cur.head.y, target.y, 7, dt), damp(cur.head.z, target.z, 7, dt));

    // 4. Idle life: breathing and weight shift.
    const breathe = Math.sin(t * 1.9) * 0.5 + 0.5;
    const shift = Math.sin(t * 0.65) * a;

    // 5. Hop when Harry starts talking.
    const sinceHop = t - hopAt;
    let hopLift = 0;
    let hopSquash = 0;
    if (sinceHop < 0.7) {
      const p = sinceHop / 0.7;
      if (p < 0.15) hopSquash = Math.sin((p / 0.15) * Math.PI) * 0.12;
      else if (p < 0.75) hopLift = Math.sin(((p - 0.15) / 0.6) * Math.PI) * 0.45 * (reducedMotion ? 0.3 : 1);
      else hopSquash = Math.sin(((p - 0.75) / 0.25) * Math.PI) * 0.08;
    }

    // Apply to the skeleton.
    const lift = offsets.lift + hopLift;
    const squash = offsets.squash + hopSquash;
    root.position.y = lift;
    root.position.x = shift * 0.025;
    root.rotation.z = shift * 0.02 + offsets.sway;
    root.rotation.y = yaw;
    hips.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    torso.rotation.set(cur.torso.x, cur.torso.y, cur.torso.z);
    torso.scale.set(1 + breathe * 0.008, 1 + breathe * 0.014, 1 + breathe * 0.012);
    legs[0].rotation.x = lift > 0.05 ? -0.25 * Math.min(1, lift * 3) : 0;
    legs[1].rotation.x = lift > 0.05 ? 0.15 * Math.min(1, lift * 3) : 0;
    armL.shoulder.rotation.set(cur.armL.x + offsets.armL.x, cur.armL.y + offsets.armL.y, cur.armL.z + offsets.armL.z - breathe * 0.02);
    armR.shoulder.rotation.set(cur.armR.x + offsets.armR.x, cur.armR.y + offsets.armR.y, cur.armR.z + offsets.armR.z + breathe * 0.02);
    armL.elbow.rotation.x = cur.elbowL + offsets.elbowL;
    armR.elbow.rotation.x = cur.elbowR + offsets.elbowR;
    head.rotation.set(cur.head.x + offsets.head.x, cur.head.y + offsets.head.y, cur.head.z + offsets.head.z);

    // Hair lags behind head turns like a soft spring.
    const headVel = new THREE.Vector2((head.rotation.x - prevHead.x) / Math.max(dt, 0.001), (head.rotation.z - prevHead.y) / Math.max(dt, 0.001));
    prevHead.set(head.rotation.x, head.rotation.z);
    hairVel.x += (-headVel.x * 0.02 - hairLag.x * 60 - hairVel.x * 9) * dt;
    hairVel.y += (-headVel.y * 0.02 - hairLag.y * 60 - hairVel.y * 9) * dt + (hopLift > 0 ? -0.05 : 0);
    hairLag.addScaledVector(hairVel, dt);
    hairLag.clampScalar(-0.12, 0.12);
    hair.rotation.set(hairLag.x, 0, hairLag.y);

    // Face: eyes, blinking, brows, mouth.
    const eyes = pose.eyes;
    let blink = 1;
    if (t > blinkAt) {
      const p = (t - blinkAt) / 0.16;
      blink = p < 1 ? Math.abs(Math.cos(p * Math.PI)) * 0.92 + 0.08 : 1;
      if (p >= 1) blinkAt = t + 2 + Math.random() * 3.5 - (Math.random() < 0.2 ? 1.8 : 0);
    }
    eyeOpen.forEach((group) => { group.visible = eyes === "open"; group.scale.y = blink; });
    irises.forEach((iris) => { iris.position.x = cur.look.x * 0.05; iris.position.y = cur.look.y * 0.06; });
    eyeSmile.forEach((object) => { object.visible = eyes === "smile"; });
    eyeSleepy.forEach((object) => { object.visible = eyes === "sleepy"; });
    eyeStar.forEach((object, i) => { object.visible = eyes === "star"; object.rotation.z = Math.sin(t * 3 + i) * 0.2; const s = 1 + Math.sin(t * 6) * 0.08; object.scale.set(s, s, 1); });
    brows.forEach((brow) => {
      brow.rotation.z = Math.PI / 2 + (brow.userData.side as number) * (0.1 - cur.brows);
      brow.position.y = cur.browY + (mood === "news" || mood === "cheer" ? Math.max(0, Math.sin(t * 2)) * 0.02 : 0);
    });
    for (const [kind, shape] of Object.entries(mouths)) {
      const want = pose.mouth === kind ? 1 : 0;
      mouthScale[kind] = damp(mouthScale[kind] ?? 0, want, 16, dt);
      shape.visible = mouthScale[kind] > 0.02;
      const talk = kind === "open" || kind === "grin" ? 1 + Math.sin(t * 13) * 0.08 * (t - hopAt < 2.5 ? 1 : 0) : 1;
      shape.scale.set(mouthScale[kind], mouthScale[kind] * talk, 1);
    }

    // Props pop in and out.
    for (const [name, object] of Object.entries(props) as [PropName, THREE.Object3D][]) {
      const want = pose.props.includes(name) ? 1 : 0;
      propScale[name] = damp(propScale[name], want, want ? 10 : 16, dt);
      const s = propScale[name];
      object.visible = s > 0.02;
      const base = baseScales.get(object)!;
      object.scale.copy(base).multiplyScalar(Math.max(0.0001, s));
    }
    if (props.flame.visible) {
      armR.hand.getWorldPosition(props.flame.position);
      props.flame.position.y += 0.12;
      const flicker = 1 + Math.sin(t * 23) * 0.06 + Math.sin(t * 37) * 0.04;
      (props.flame.children[0] as THREE.Mesh).scale.set(0.42 * flicker, 0.7 / flicker + 0.05, 0.42 * flicker);
      props.flame.rotation.z = Math.sin(t * 5) * 0.08;
      flameLight.intensity = 0.8 * flicker;
    }
    if (props.book.visible) flip.rotation.y = -(Math.max(0, Math.sin(((moodTime % 3.4) / 3.4) * Math.PI * 2 - 1.2)) ** 3) * Math.PI * 0.95;
    if (props.star.visible) star.rotation.y = Math.sin(t * 2.2) * 0.5;
    if (props.heart.visible) { const beat = 1 + Math.max(0, Math.sin(t * 6.5)) ** 6 * 0.12; heart.scale.multiplyScalar(beat); }
    if (props.sweat.visible) { const p = (t % 1.8) / 1.8; sweat.position.y = -p * 0.25; (sweat.material as THREE.Material).opacity = 0.9 * (1 - p * 0.8); }
    for (const name of ["zzz", "question", "alert", "sparkles", "hearts"] as PropName[]) {
      const group = props[name];
      if (!group.visible) continue;
      group.children.forEach((child, i) => {
        const base = child.userData.base as V3;
        const phase = t * (name === "sparkles" ? 3 : 1.4) + i * 1.3;
        if (name === "zzz") child.position.set(base[0] + Math.sin(phase) * 0.08, base[1] + ((t * 0.35 + i * 0.33) % 1) * 0.35, base[2]);
        else if (name === "sparkles") { child.scale.setScalar((0.6 + Math.abs(Math.sin(phase)) * 0.5) * (0.26 + i * 0.04)); (child as THREE.Sprite).material.rotation = phase * 0.4; }
        else child.position.set(base[0], base[1] + Math.sin(phase) * 0.08, base[2]);
      });
    }

    // Ground shadow shrinks while airborne.
    const ground = 1 - Math.min(0.45, lift * 0.9);
    contact.scale.set(ground, ground, 1);
    (contact.material as THREE.MeshBasicMaterial).opacity = ground;
  }

  function loop() {
    frame = requestAnimationFrame(loop);
    timer.update();
    const dt = Math.min(0.05, timer.getDelta());
    update(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (frame || !active || document.hidden) return;
    timer.reset();
    frame = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVisibility);
  timer.connect(document);
  update(0.016);
  renderer.render(scene, camera);
  start();

  return {
    setMood(next) {
      if (next === mood) return;
      mood = next;
      moodTime = 0;
    },
    hop() {
      hopAt = elapsed;
    },
    setPointer(x, y) {
      pointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
      pointerAt = elapsed;
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    setYaw(next) {
      yaw = next;
    },
    advance(seconds) {
      for (let left = seconds; left > 0; left -= 1 / 30) update(Math.min(1 / 30, left));
      renderer.render(scene, camera);
    },
    setActive(next) {
      active = next;
      if (next) start();
      else stop();
    },
    dispose() {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      timer.dispose();
      for (const item of disposables) item.dispose();
      for (const texture of textures) texture.dispose();
      for (const material of Object.values(materials)) material.dispose();
      hairLight.dispose();
      highlight.dispose();
      outlineMaterials.forEach((material) => material.dispose());
      toonRamp.dispose();
      disposableMaterials.forEach((material) => material.dispose());
      blushMaterial.dispose();
      scene.traverse((object) => {
        const material = (object as THREE.Mesh | THREE.Sprite).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      envTexture.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
    },
  };
}
