import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { HarryModelConfig } from "./harry-model";
import { harryMoods, type HarryMood } from "./harry-moods";
import type { HarryRig } from "./harry-rig";

/*
 * Harry from a sculpted, rigged .glb (see harry-model.ts). The model's own
 * animation clips carry the acting; on top of them this rig crossfades
 * between clips per mood, turns the head toward the pointer, blinks when the
 * model has a blink shape key, hops, and floats the same mood signs as the
 * code-built rig (Zzz, ?, !, sparkles, hearts).
 */

/** Words that identify a clip for each mood, best first. Unmatched moods play the idle clip. */
const clipHints: Record<HarryMood, string[]> = {
  happy: ["happy", "idle"],
  wave: ["wave", "waving", "hello", "greet"],
  cheer: ["cheer", "victory", "celebrat", "jump", "dance"],
  proud: ["proud", "thumb", "victory", "cheer"],
  reading: ["reading", "read", "book"],
  news: ["news", "phone", "reading", "read"],
  thinking: ["think", "ponder", "thought", "scratch"],
  sleepy: ["sleep", "yawn", "tired", "sit"],
  worried: ["worr", "nervous", "anxious", "sad", "defeat"],
  fire: ["fist", "pump", "excite", "cheer", "victory"],
  love: ["love", "heart", "kiss", "shy", "happy"],
};
/** Moods whose clip is a gesture: play it twice, then settle back to idle. */
const gestures = new Set<HarryMood>(["wave", "cheer", "proud", "fire"]);

type FloaterName = "zzz" | "question" | "alert" | "sparkles" | "hearts" | "sweat";
const moodFloaters: Partial<Record<HarryMood, FloaterName[]>> = {
  cheer: ["sparkles"], proud: ["sparkles"], fire: ["sparkles"], sleepy: ["zzz"], thinking: ["question"],
  news: ["alert"], love: ["hearts"], worried: ["sweat"],
};

const MODEL_HEIGHT = 3.2;

export type HarryClipMatch = { idle?: string; byMood: Partial<Record<HarryMood, string>> };

const cleanName = (name: string) => name.toLowerCase().replace(/^.*\|/, "").replace(/mixamo\.com/g, "").replace(/[_\-.:\s]+/g, " ").trim();

export function matchHarryClips(names: string[], pinned: Partial<Record<HarryMood, string>> = {}): HarryClipMatch {
  const cleaned = names.map(cleanName);
  const find = (hints: string[]) => {
    for (const hint of hints) {
      const index = cleaned.findIndex((name) => name.includes(hint));
      if (index >= 0) return names[index];
    }
    return undefined;
  };
  const idle = find(["idle", "breath", "stand"]) ?? names[0];
  const byMood: Partial<Record<HarryMood, string>> = {};
  for (const mood of harryMoods) {
    const exact = pinned[mood];
    byMood[mood] = (exact && names.includes(exact) ? exact : find(clipHints[mood])) ?? idle;
  }
  return { idle, byMood };
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function damp(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}

export async function createHarryModelRig(
  canvas: HTMLCanvasElement,
  { url, clips: pinned, yawOffset = 0, reducedMotion = false }: HarryModelConfig & { reducedMotion?: boolean },
): Promise<HarryRig> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe3ebf2, 1.1));
  const key = new THREE.DirectionalLight(0xfff4ea, 1.7);
  key.position.set(3, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9f3ff, 1.1);
  rim.position.set(-4, 4, -5);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(24, 1 / 1.2, 0.1, 60);
  const fitHeight = MODEL_HEIGHT * 1.28;
  camera.position.set(0, MODEL_HEIGHT * 0.55, fitHeight / 2 / Math.tan(THREE.MathUtils.degToRad(12)));
  camera.lookAt(0, MODEL_HEIGHT * 0.5, 0);

  // Stand the model on the floor, facing the camera, MODEL_HEIGHT tall.
  const root = new THREE.Group();
  scene.add(root);
  const model = gltf.scene;
  model.rotation.y += yawOffset;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fit = MODEL_HEIGHT / (size.y || 1);
  model.scale.multiplyScalar(fit);
  model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
  root.add(model);

  const blinkMeshes: { mesh: THREE.Mesh; index: number }[] = [];
  let head: THREE.Object3D | undefined;
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.frustumCulled = false; // skinned bounds come from the bind pose
      const dictionary = mesh.morphTargetDictionary;
      if (dictionary) for (const [name, index] of Object.entries(dictionary)) if (/blink/i.test(name)) blinkMeshes.push({ mesh, index });
    }
    const letters = object.name.toLowerCase().replace(/[^a-z]/g, "");
    if (letters.endsWith("head") && (!head || ((object as THREE.Bone).isBone && !(head as THREE.Bone).isBone))) head = object;
  });

  // Soft contact shadow.
  const shadowTexture = canvasTexture(128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(16,35,63,0.32)");
    gradient.addColorStop(1, "rgba(16,35,63,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.0), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  scene.add(contact);

  // Mood signs.
  const textures: THREE.Texture[] = [shadowTexture];
  const spriteMaterials: THREE.SpriteMaterial[] = [];
  const signMaterial = (draw: (ctx: CanvasRenderingContext2D) => void, color?: number) => {
    const texture = canvasTexture(128, draw);
    textures.push(texture);
    const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false, color: color ?? 0xffffff });
    spriteMaterials.push(material);
    return material;
  };
  const glyph = (text: string, color: string, font = "bold 96px 'Patrick Hand', 'Comic Sans MS', cursive") => signMaterial((ctx) => {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 14;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(text, 64, 70);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 70);
  });
  const sparkleDraw = (ctx: CanvasRenderingContext2D) => {
    ctx.translate(64, 64);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 14 : 60; const a = (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
  };
  const dropDraw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#8fd3ff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(64, 12);
    ctx.bezierCurveTo(30, 60, 28, 112, 64, 114);
    ctx.bezierCurveTo(100, 112, 98, 60, 64, 12);
    ctx.stroke();
    ctx.fill();
  };
  const floaters = {} as Record<FloaterName, THREE.Group>;
  const addFloaters = (name: FloaterName, items: { material: THREE.SpriteMaterial; at: [number, number]; size: number }[]) => {
    const group = new THREE.Group();
    for (const item of items) {
      const sprite = new THREE.Sprite(item.material);
      sprite.position.set(item.at[0], item.at[1], 0.4);
      sprite.scale.setScalar(item.size);
      sprite.userData.base = item.at;
      sprite.userData.size = item.size;
      group.add(sprite);
    }
    group.visible = false;
    group.userData.show = 0;
    root.add(group);
    floaters[name] = group;
  };
  const zzz = glyph("z", "#7c8db0");
  addFloaters("zzz", [{ material: zzz, at: [0.9, 2.75], size: 0.32 }, { material: zzz, at: [1.15, 3.0], size: 0.42 }, { material: glyph("Z", "#7c8db0"), at: [1.4, 3.3], size: 0.55 }]);
  addFloaters("question", [{ material: glyph("?", "#7c66dc"), at: [1.1, 3.05], size: 0.75 }]);
  addFloaters("alert", [{ material: glyph("!", "#ff5a4f"), at: [1.05, 3.05], size: 0.7 }]);
  addFloaters("sparkles", [
    { material: signMaterial(sparkleDraw, 0xffc94a), at: [-1.15, 2.65], size: 0.42 },
    { material: signMaterial(sparkleDraw, 0x7fd3da), at: [1.2, 2.85], size: 0.36 },
    { material: signMaterial(sparkleDraw, 0xff9aa8), at: [-0.95, 3.25], size: 0.26 },
    { material: signMaterial(sparkleDraw, 0xb7a6ff), at: [1.0, 3.35], size: 0.28 },
  ]);
  addFloaters("hearts", [{ material: glyph("♥", "#ff7a8a", "bold 100px sans-serif"), at: [-1.05, 2.75], size: 0.4 }, { material: glyph("♥", "#ff9aa8", "bold 100px sans-serif"), at: [1.1, 3.0], size: 0.32 }]);
  addFloaters("sweat", [{ material: signMaterial(dropDraw), at: [-0.8, 2.7], size: 0.3 }]);

  // Animation clips.
  const mixer = new THREE.AnimationMixer(model);
  mixer.timeScale = reducedMotion ? 0.6 : 1;
  const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)] as const));
  const match = matchHarryClips(gltf.animations.map((clip) => clip.name), pinned);
  let current: THREE.AnimationAction | null = null;
  const play = (name: string | undefined, gesture: boolean) => {
    const next = name ? actions.get(name) : undefined;
    if (!next || next === current) return;
    next.reset();
    next.setLoop(THREE.LoopRepeat, gesture && name !== match.idle ? 2 : Infinity);
    next.play();
    if (current) next.crossFadeFrom(current, 0.35, false);
    else next.fadeIn(0.2);
    current = next;
  };
  mixer.addEventListener("finished", (event) => {
    if (event.action === current) play(match.idle, false);
  });

  /* State. */
  let mood: HarryMood = "happy";
  let yaw = 0;
  let elapsed = 0;
  let hopAt = -10;
  let pointerAt = -10;
  let glanceAt = 0;
  let nextBlink = 2;
  const pointer = new THREE.Vector2();
  const glance = new THREE.Vector2();
  const look = new THREE.Vector2();
  const motion = reducedMotion ? 0.35 : 1;
  const preLook = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const rootQ = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const turn = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  if (head) preLook.copy(head.quaternion);

  const applyMood = (next: HarryMood) => {
    mood = next;
    play(match.byMood[next], gestures.has(next));
    const shown = moodFloaters[next] ?? [];
    for (const [name, group] of Object.entries(floaters)) group.userData.target = shown.includes(name as FloaterName) ? 1 : 0;
  };
  applyMood("happy");

  function update(dt: number) {
    elapsed += dt;
    const t = elapsed;

    if (head) head.quaternion.copy(preLook); // undo last frame's look so it never accumulates
    mixer.update(dt);
    if (head) preLook.copy(head.quaternion);

    // Look toward the pointer, or glance around when it has been still.
    if (t - pointerAt > 4 && t > glanceAt) {
      glance.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.3) * 0.5);
      glanceAt = t + 2 + Math.random() * 2.5;
    }
    const target = t - pointerAt > 4 ? glance : pointer;
    look.x = damp(look.x, target.x, 5, dt);
    look.y = damp(look.y, target.y, 5, dt);
    if (head?.parent && mood !== "sleepy") {
      root.updateMatrixWorld(true);
      head.parent.getWorldQuaternion(parentQ);
      root.getWorldQuaternion(rootQ);
      delta.setFromEuler(euler.set(-look.y * 0.28 * motion, look.x * 0.42 * motion, 0));
      // Rotation in the character's own frame, expressed in the head's parent space.
      turn.copy(rootQ).multiply(delta).multiply(rootQ.invert());
      head.quaternion.premultiply(local.copy(parentQ).invert().multiply(turn).multiply(parentQ));
    }

    // Blink.
    if (blinkMeshes.length) {
      const since = t - nextBlink;
      const amount = since > 0 && since < 0.16 ? Math.sin((since / 0.16) * Math.PI) : 0;
      if (since >= 0.16) nextBlink = t + 2.2 + Math.random() * 3;
      for (const { mesh, index } of blinkMeshes) if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = mood === "sleepy" ? 0.7 : amount;
    }

    // Hop with a little squash; gentle breathing when the model has no clips.
    const hp = (t - hopAt) / 0.55;
    const lift = hp >= 0 && hp < 1 ? Math.sin(hp * Math.PI) * 0.35 * motion : 0;
    const squash = hp >= 0 && hp < 1 ? Math.sin(hp * Math.PI * 2) * 0.05 * motion : 0;
    const breathe = actions.size ? 0 : Math.sin(t * 2.2) * 0.012 * motion;
    root.position.y = lift;
    root.scale.set(1 - squash * 0.5, 1 + squash + breathe, 1 - squash * 0.5);
    root.rotation.y = yaw;
    const ground = 1 - Math.min(0.45, lift * 0.9);
    contact.scale.set(ground, ground, 1);
    (contact.material as THREE.MeshBasicMaterial).opacity = ground;

    // Mood signs pop in and drift.
    for (const [name, group] of Object.entries(floaters)) {
      const show = damp(group.userData.show as number, (group.userData.target as number) ?? 0, 9, dt);
      group.userData.show = show;
      group.visible = show > 0.02;
      if (!group.visible) continue;
      group.children.forEach((child, i) => {
        const [x, y] = child.userData.base as [number, number];
        const phase = t * (name === "sparkles" ? 3 : 1.4) + i * 1.3;
        let scale = (child.userData.size as number) * show;
        if (name === "zzz") child.position.set(x + Math.sin(phase) * 0.08, y + ((t * 0.35 + i * 0.33) % 1) * 0.35 * motion, 0.4);
        else if (name === "sweat") child.position.set(x, y - ((t % 1.8) / 1.8) * 0.25 * motion, 0.4);
        else if (name === "sparkles") { scale *= 0.7 + Math.abs(Math.sin(phase)) * 0.5 * motion; (child as THREE.Sprite).material.rotation = phase * 0.4 * motion; }
        else child.position.set(x, y + Math.sin(phase) * 0.08 * motion, 0.4);
        child.scale.setScalar(scale);
      });
    }
  }

  /* Frame loop: paused off screen and in background tabs. */
  const timer = new THREE.Timer();
  let frame = 0;
  let active = true;
  function loop() {
    frame = requestAnimationFrame(loop);
    timer.update();
    update(Math.min(0.05, timer.getDelta()));
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
    info: { source: "model", clips: [...actions.keys()], byMood: match.byMood },
    setMood(next) {
      if (next !== mood) applyMood(next);
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
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach(disposeMaterial);
        else disposeMaterial(material);
      });
      spriteMaterials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      envTexture.dispose();
      pmrem.dispose();
      room.dispose();
      renderer.dispose();
    },
  };
}
