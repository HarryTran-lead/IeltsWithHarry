import type { HeaderEffectStrength } from './types';
import type { WeatherScene } from './weatherEffects';

/**
 * Canvas weather renderer for one continuous layer: it starts at the top of the header, runs a little
 * past the header's bottom edge and is faded out by a CSS mask, so weather never stops at a hard line.
 * The top `band` px sit over the illustrated header sky; below it the layer sits over the light page.
 *
 * Every system (rain, snow, clouds, fog, sun, lightning) keeps its own "mix" that eases toward the
 * live scene, so a new API reading turns drizzle into a downpour (or clears it) smoothly instead of
 * swapping layers. Rain is drawn as motion-blurred streaks in three depth layers that share a gusting
 * wind angle. Streaks are pale over the sky art and turn into darker, glinting drops over the page,
 * cross-faded by height so each drop keeps reading as it falls out of the header.
 */

const STRENGTH: Record<HeaderEffectStrength, { density: number; alpha: number }> = {
  light: { density: .45, alpha: .62 },
  medium: { density: .74, alpha: .84 },
  strong: { density: 1, alpha: 1 },
};

type RainLayer = { depth: number; speed: number; length: number; width: number; alpha: number; share: number };

const RAIN_LAYERS: RainLayer[] = [
  { depth: .35, speed: 460, length: 12, width: .8, alpha: .5, share: .52 },
  { depth: .65, speed: 700, length: 20, width: 1.05, alpha: .64, share: .31 },
  { depth: 1, speed: 980, length: 31, width: 1.35, alpha: .76, share: .17 },
];
/** Over the page the dark streaks are a little fainter than the pale ones over the sky art. */
const PAGE_RAIN_ALPHA = 1;

const SNOW_LAYERS = [
  { depth: .4, size: 1.8, speed: 26, sway: 7, alpha: .7, share: .5 },
  { depth: .7, size: 2.9, speed: 42, sway: 11, alpha: .85, share: .32 },
  { depth: 1, size: 4.4, speed: 64, sway: 17, alpha: 1, share: .18 },
];

/** Drops per CSS pixel² at full rain; drizzle multiplies this. */
const RAIN_DENSITY = 1.75e-3;
const DRIZZLE_FACTOR = 1.7;
const SNOW_DENSITY = .8e-3;

type Drop = { x: number; y: number; layer: number; speed: number; length: number; alpha: number; active: boolean };
type Flake = { x: number; y: number; layer: number; size: number; speed: number; phase: number; freq: number; active: boolean };
type Mote = { x: number; y: number; vx: number; vy: number; size: number; phase: number };
type Cloud = { x: number; y: number; sprite: number; scale: number; speed: number; alpha: number };
type Sprite = { canvas: HTMLCanvasElement; w: number; h: number };

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One storm clock for the whole page, so every mounted layer flashes together.
const stormClock = { next: 0, start: -100, seed: 1 };
function stormStrike(now: number) {
  if (stormClock.next === 0) stormClock.next = now + rand(2.5, 5);
  if (now >= stormClock.next) {
    stormClock.start = stormClock.next;
    stormClock.seed = (Math.random() * 1e9) | 0;
    stormClock.next = now + rand(7, 16);
  }
  return stormClock;
}

/** Double flicker, then a longer decaying glow — the shape of a real return stroke. */
function flashEnvelope(age: number) {
  if (age < 0) return 0;
  if (age < .06) return .75;
  if (age < .11) return .12;
  if (age < .2) return 1;
  if (age < .8) return (1 - (age - .2) / .6) ** 2;
  return 0;
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return { canvas, g: canvas.getContext('2d')! };
}

function streakSprite(length: number, width: number, dpr: number, body: string, highlight: boolean): Sprite {
  const pad = 1;
  const w = width + pad * 2;
  const { canvas, g } = canvas2d(w * dpr, length * dpr);
  g.scale(dpr, dpr);
  const tail = g.createLinearGradient(0, 0, 0, length);
  tail.addColorStop(0, `rgba(${body},0)`);
  tail.addColorStop(.5, `rgba(${body},.3)`);
  tail.addColorStop(.9, `rgba(${body},.95)`);
  tail.addColorStop(1, `rgba(${body},.75)`);
  g.fillStyle = tail;
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(pad, 0, width, length, width / 2);
  else g.rect(pad, 0, width, length);
  g.fill();
  if (highlight) {
    // A thin bright core on one side reads as light refracting through a falling drop.
    const shine = g.createLinearGradient(0, 0, 0, length);
    shine.addColorStop(0, 'rgba(255,255,255,0)');
    shine.addColorStop(.7, 'rgba(255,255,255,.55)');
    shine.addColorStop(1, 'rgba(255,255,255,.9)');
    g.fillStyle = shine;
    g.fillRect(pad + width * .12, length * .2, Math.max(.35, width * .38), length * .8);
  }
  return { canvas, w, h: length };
}

function dotSprite(radius: number, inner: string, outer: string, dpr: number): Sprite {
  const size = radius * 2;
  const { canvas, g } = canvas2d(size * dpr, size * dpr);
  g.scale(dpr, dpr);
  const gradient = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(.45, inner);
  gradient.addColorStop(.72, outer);
  gradient.addColorStop(1, outer.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return { canvas, w: size, h: size };
}

/** A soft cumulus: overlapping radial puffs in a dome, shaded darker underneath and flattened at the base. */
function cloudSprite(tone: 'fair' | 'rain', seed: number): Sprite {
  const random = mulberry32(seed);
  const r = (min: number, max: number) => min + random() * (max - min);
  const w = 520;
  const h = 230;
  const { canvas, g } = canvas2d(w, h);
  const puff = (x: number, y: number, radius: number, alpha: number) => {
    const gradient = g.createRadialGradient(x - radius * .25, y - radius * .35, radius * .05, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(.55, `rgba(255,255,255,${alpha * .82})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
  };
  const lobes = Math.round(r(3, 5));
  for (let i = 0; i < 34; i += 1) {
    const t = r(0, 1);
    const dome = Math.sin(Math.PI * t);
    const lobe = Math.abs(Math.sin(t * Math.PI * lobes + seed));
    const radius = h * (.12 + .2 * dome * (.65 + .45 * lobe));
    puff(w * (.1 + .8 * t), h * (.74 - .32 * dome * r(.75, 1.1)), radius, r(.55, .85));
  }
  for (let i = 0; i < 12; i += 1) puff(w * r(.14, .86), h * r(.66, .76), h * r(.1, .16), .7);

  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, h * .1, 0, h);
  if (tone === 'rain') {
    shade.addColorStop(0, 'rgba(170,182,198,.55)');
    shade.addColorStop(.5, 'rgba(112,126,146,.8)');
    shade.addColorStop(1, 'rgba(72,86,106,.95)');
  } else {
    shade.addColorStop(0, 'rgba(255,253,248,.0)');
    shade.addColorStop(.55, 'rgba(214,224,236,.38)');
    shade.addColorStop(1, 'rgba(160,176,198,.72)');
  }
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);

  g.globalCompositeOperation = 'destination-out';
  const base = g.createLinearGradient(0, h * .72, 0, h);
  base.addColorStop(0, 'rgba(0,0,0,0)');
  base.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = base;
  g.fillRect(0, h * .72, w, h * .28);
  g.globalCompositeOperation = 'source-over';
  return { canvas, w, h };
}

/** A horizontally tileable band of mist made from many flattened, faint ellipses. */
function mistSprite(color: string, seed: number): Sprite {
  const random = mulberry32(seed);
  const w = 1024;
  const h = 260;
  const { canvas, g } = canvas2d(w, h);
  for (let i = 0; i < 70; i += 1) {
    const x = random() * w;
    const y = h * (.32 + random() * .36);
    const rx = 90 + random() * 200;
    const ry = rx * (.16 + random() * .14);
    for (const offset of [-w, 0, w]) {
      g.save();
      g.translate(x + offset, y);
      g.scale(1, ry / rx);
      const gradient = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gradient.addColorStop(0, `rgba(${color},${.16 + random() * .1})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gradient;
      g.beginPath();
      g.arc(0, 0, rx, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  return { canvas, w, h };
}

type Mixes = { rain: number; snow: number; fair: number; dark: number; fog: number; sun: number; storm: number };
const ZERO_MIX: Mixes = { rain: 0, snow: 0, fair: 0, dark: 0, fog: 0, sun: 0, storm: 0 };

function targetMixes(scene: WeatherScene): Mixes {
  const wet = scene.effect === 'rain' || scene.effect === 'snow';
  return {
    rain: scene.effect === 'rain' ? scene.amount : 0,
    snow: scene.effect === 'snow' ? scene.amount : 0,
    fair: scene.effect === 'cloud' ? scene.amount : 0,
    dark: wet ? clamp(.55 + scene.amount * .45) : 0,
    fog: scene.effect === 'fog' ? scene.amount : 0,
    sun: scene.effect === 'sun' ? scene.amount : 0,
    storm: scene.storm ? 1 : 0,
  };
}

export class WeatherRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  /** Height of the header sky inside the canvas; the rest of the canvas hangs over the page. */
  private band = 0;
  private dpr = 1;
  private frame = 0;
  private last = 0;
  private time = 0;
  private running = false;

  private scene: WeatherScene | null = null;
  private strength = STRENGTH.light;
  private target: Mixes = { ...ZERO_MIX };
  private mix: Mixes = { ...ZERO_MIX };
  private wind = 0;
  private drizzle = 0;

  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private motes: Mote[] = [];
  private clouds: Cloud[] = [];
  private skyStreaks: Sprite[] = [];
  private pageStreaks: Sprite[] = [];
  private skyFlake: Sprite | null = null;
  private pageFlake: Sprite | null = null;
  private moteSprite: Sprite | null = null;
  private fairClouds: Sprite[] = [];
  private rainClouds: Sprite[] = [];
  private mist: Sprite | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
  }

  setScene(scene: WeatherScene, strength: HeaderEffectStrength) {
    const first = this.scene === null;
    this.scene = scene;
    this.strength = STRENGTH[strength];
    this.target = targetMixes(scene);
    if (first) this.wind = scene.wind;
    if (!this.running) this.drawStatic();
  }

  /** `band`: how many px from the top are header sky (defaults to the canvas's parent height). */
  resize(band?: number) {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const sky = Math.round(clamp(band ?? this.canvas.parentElement?.clientHeight ?? height, 1, Math.max(1, height)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (width === this.width && height === this.height && sky === this.band && dpr === this.dpr) return;
    const firstLayout = this.width === 0;
    this.width = width;
    this.height = height;
    this.band = sky;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.buildSprites(firstLayout);
    this.populate();
    if (!this.running) this.drawStatic();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = this.last ? Math.min(.05, (now - this.last) / 1000) : 0;
      this.last = now;
      this.time = now / 1000;
      this.step(dt);
      this.draw();
      this.frame = window.requestAnimationFrame(tick);
    };
    this.frame = window.requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    window.cancelAnimationFrame(this.frame);
  }

  /** Reduced motion / hidden tab: one settled frame, no animation. */
  drawStatic() {
    if (!this.width) return;
    this.mix = { ...this.target };
    this.updateActive();
    this.time = performance.now() / 1000;
    this.draw();
  }

  destroy() {
    this.stop();
    this.drops = [];
    this.flakes = [];
  }

  private buildSprites(firstLayout: boolean) {
    this.skyStreaks = RAIN_LAYERS.map((layer) => streakSprite(layer.length, layer.width, this.dpr, '228,240,250', false));
    this.pageStreaks = RAIN_LAYERS.map((layer) => streakSprite(layer.length, layer.width, this.dpr, '74,108,138', true));
    this.skyFlake = dotSprite(4, 'rgba(255,255,255,1)', 'rgba(255,255,255,.5)', this.dpr);
    this.pageFlake = dotSprite(4, 'rgba(226,236,246,1)', 'rgba(170,192,214,.55)', this.dpr);
    this.moteSprite = dotSprite(4, 'rgba(255,236,170,1)', 'rgba(255,196,84,.5)', this.dpr);
    if (firstLayout) {
      this.fairClouds = [11, 23, 37, 41, 59].map((seed) => cloudSprite('fair', seed));
      this.rainClouds = [7, 19, 29, 43].map((seed) => cloudSprite('rain', seed));
      this.mist = mistSprite('236,242,245', 5);
    }
  }

  /** 0 over the header sky, 1 over the page: decides which sprite a particle at `y` uses. */
  private pageShare(y: number) {
    // The header art already fades to the page colour near its bottom edge, so switch a little before it.
    const start = this.band * .6;
    return clamp((y - start) / (this.band * .4 + 8));
  }

  private populate() {
    const { width: w, height: h } = this;
    const layers = RAIN_LAYERS;
    const maxDrops = Math.round(w * h * RAIN_DENSITY * DRIZZLE_FACTOR);
    this.drops = [];
    // Interleave layers so any prefix of the pool keeps the same depth mix.
    for (let i = 0; i < maxDrops; i += 1) {
      const pick = Math.random();
      let layer = 0;
      let acc = 0;
      for (let l = 0; l < layers.length; l += 1) { acc += layers[l].share; if (pick <= acc) { layer = l; break; } layer = l; }
      const drop: Drop = { x: 0, y: 0, layer, speed: 1, length: 1, alpha: 1, active: false };
      this.respawnDrop(drop, true);
      this.drops.push(drop);
    }

    const maxFlakes = Math.round(w * h * SNOW_DENSITY);
    this.flakes = [];
    for (let i = 0; i < maxFlakes; i += 1) {
      const pick = Math.random();
      const layer = pick < SNOW_LAYERS[0].share ? 0 : pick < SNOW_LAYERS[0].share + SNOW_LAYERS[1].share ? 1 : 2;
      const config = SNOW_LAYERS[layer];
      this.flakes.push({
        x: rand(0, w), y: rand(-10, h), layer, size: config.size * rand(.7, 1.3), speed: config.speed * rand(.8, 1.2),
        phase: rand(0, Math.PI * 2), freq: rand(.35, 1.1), active: false,
      });
    }

    this.motes = Array.from({ length: Math.round(clamp(w / 1400, .3, 1.2) * 34) }, () => this.newMote(true));

    // Clouds live in the header sky band, so size and place them by the band, not the whole canvas.
    const band = this.band || h;
    const cloudCount = Math.max(4, Math.round(w / 220));
    this.clouds = Array.from({ length: cloudCount }, (_, index) => {
      // Small enough that a cloud's base stays inside the header instead of hanging over the page.
      const scale = clamp(band / 180, .3, .9) * rand(.75, 1.15);
      return {
        x: (index / cloudCount) * (w + 520 * scale) - 520 * scale + rand(-60, 60),
        y: rand(-.85, -.4) * band,
        sprite: index,
        scale,
        speed: rand(.6, 1.3),
        alpha: rand(.7, 1),
      };
    });
    this.updateActive();
  }

  private respawnDrop(drop: Drop, anywhere = false) {
    const { width: w, height: h } = this;
    const layer = RAIN_LAYERS[drop.layer];
    const slant = Math.abs(this.windTan()) * h;
    drop.speed = rand(.86, 1.14);
    drop.length = rand(.75, 1.25);
    drop.alpha = rand(.6, 1);
    drop.x = this.windTan() >= 0 ? rand(-slant - 20, w + 10) : rand(-10, w + slant + 20);
    drop.y = anywhere ? rand(-layer.length, h) : -layer.length * drop.length - rand(0, h * .3);
  }

  private newMote(anywhere: boolean): Mote {
    const { width: w, height: h } = this;
    return {
      x: rand(w * .25, w * .98), y: anywhere ? rand(0, h) : h + rand(0, 20),
      vx: rand(-4, 4), vy: -rand(3, 11), size: rand(.6, 1.7), phase: rand(0, Math.PI * 2),
    };
  }

  private windTan() {
    const t = this.time;
    const storm = this.mix.storm;
    const gust = (Math.sin(t * .53) * .6 + Math.sin(t * 1.37 + 2) * .3 + Math.sin(t * 3.1 + .7) * .1)
      * (.05 + .1 * Math.abs(this.wind) + .1 * storm);
    return clamp(this.wind * .42 + gust, -.62, .62) * (1 + this.drizzle * .45);
  }

  private updateActive() {
    const density = this.strength.density;
    const rainShare = this.mix.rain * density * (1 + (DRIZZLE_FACTOR - 1) * this.drizzle) / DRIZZLE_FACTOR;
    const activeDrops = Math.round(this.drops.length * rainShare);
    for (let i = 0; i < this.drops.length; i += 1) {
      const drop = this.drops[i];
      if (i < activeDrops && !drop.active) drop.active = true;
      else if (i >= activeDrops && drop.active && !this.running) drop.active = false;
    }
    const activeFlakes = Math.round(this.flakes.length * this.mix.snow * density);
    for (let i = 0; i < this.flakes.length; i += 1) this.flakes[i].active = i < activeFlakes;
  }

  private step(dt: number) {
    if (!this.scene || dt <= 0) return;
    const ease = 1 - Math.exp(-dt * .9);
    for (const key of Object.keys(this.mix) as (keyof Mixes)[]) this.mix[key] += (this.target[key] - this.mix[key]) * ease;
    this.wind += (this.scene.wind - this.wind) * (1 - Math.exp(-dt * .4));
    this.drizzle += ((this.scene.drizzle ? 1 : 0) - this.drizzle) * ease;

    const { width: w, height: h } = this;
    const layers = RAIN_LAYERS;
    const tan = this.windTan();
    const speedScale = 1 - this.drizzle * .5;
    const activeDrops = Math.round(this.drops.length * this.mix.rain * this.strength.density
      * (1 + (DRIZZLE_FACTOR - 1) * this.drizzle) / DRIZZLE_FACTOR);

    for (let i = 0; i < this.drops.length; i += 1) {
      const drop = this.drops[i];
      if (!drop.active) {
        if (i < activeDrops) { drop.active = true; this.respawnDrop(drop); }
        continue;
      }
      const layer = layers[drop.layer];
      const vy = layer.speed * drop.speed * speedScale;
      drop.y += vy * dt;
      drop.x += vy * tan * dt;
      const length = layer.length * drop.length * (1 - this.drizzle * .45);
      if (drop.y - length > h || drop.x < -w * .5 || drop.x > w * 1.5) {
        if (i >= activeDrops) drop.active = false;
        else this.respawnDrop(drop);
      }
    }

    const activeFlakes = Math.round(this.flakes.length * this.mix.snow * this.strength.density);
    for (let i = 0; i < this.flakes.length; i += 1) {
      const flake = this.flakes[i];
      if (!flake.active) {
        if (i < activeFlakes) { flake.active = true; flake.y = -rand(4, 40); flake.x = rand(0, w); }
        continue;
      }
      const config = SNOW_LAYERS[flake.layer];
      flake.y += flake.speed * dt;
      flake.x += (this.wind * 40 * config.depth + Math.cos(this.time * flake.freq + flake.phase) * config.sway * flake.freq) * dt;
      if (flake.y > h + 6 || flake.x < -30 || flake.x > w + 30) {
        if (i >= activeFlakes) flake.active = false;
        else { flake.y = -rand(4, 30); flake.x = rand(-20, w + 20); }
      }
    }

    if (this.mix.sun > .01) {
      for (let i = 0; i < this.motes.length; i += 1) {
        const mote = this.motes[i];
        mote.x += (mote.vx + this.wind * 5 + Math.sin(this.time * .7 + mote.phase) * 3) * dt;
        mote.y += mote.vy * dt;
        if (mote.y < -10 || mote.x < -10 || mote.x > w + 10) this.motes[i] = this.newMote(false);
      }
    }

    const cloudShift = (4 + Math.abs(this.wind) * 16) * Math.sign(this.wind || 1);
    for (const cloud of this.clouds) {
      cloud.x += cloudShift * cloud.speed * dt;
      const span = 520 * cloud.scale;
      if (cloud.x > w + 40) cloud.x = -span - rand(0, 80);
      else if (cloud.x < -span - 120) cloud.x = w + rand(0, 40);
    }
  }

  private draw() {
    const { ctx, width: w, height: h, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.scene || !w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const alpha = this.strength.alpha;
    const band = this.band || h;
    const strike = this.mix.storm > .05 ? stormStrike(this.time) : null;
    const flash = strike ? flashEnvelope(this.time - strike.start) * this.mix.storm : 0;

    // Overcast light: the sky dims before the rain, and lightning briefly lifts it.
    const overcast = Math.max(this.mix.dark * .7, this.mix.fog * .5);
    if (overcast > .01) {
      // Darkest across the header sky, thinning out over the page so text below stays readable.
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      const tone = this.mix.fog > this.mix.dark ? '206,216,220' : '46,68,92';
      const top = .4 * overcast * alpha * (1 - flash * .8);
      gradient.addColorStop(0, `rgba(${tone},${top})`);
      gradient.addColorStop(clamp(band / h), `rgba(${tone},${top * .55})`);
      gradient.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.mix.fog > .01) this.drawMist(0, alpha);
    this.drawClouds(alpha);
    if (this.mix.sun > .01) this.drawSun(alpha);
    if (this.mix.rain > .005) this.drawRain(alpha);
    if (this.mix.snow > .005) this.drawSnow(alpha);
    if (this.mix.fog > .01) this.drawMist(1, alpha);

    if (flash > .01 && strike) {
      ctx.globalAlpha = 1;
      const light = ctx.createLinearGradient(0, 0, 0, h);
      light.addColorStop(0, `rgba(236,242,255,${.42 * flash * alpha})`);
      light.addColorStop(1, `rgba(236,242,255,${.16 * flash * alpha})`);
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, w, h);
      this.drawBolt(strike.seed, flash * alpha);
    }
    ctx.globalAlpha = 1;
  }

  private drawRain(alpha: number) {
    const { ctx, dpr } = this;
    const layers = RAIN_LAYERS;
    const tan = this.windTan();
    // Streaks align with the velocity vector, tail pointing back up-wind.
    const angle = Math.atan2(-tan, 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const stretch = 1 - this.drizzle * .45;
    const thin = 1 - this.drizzle * .35;
    const mix = clamp(this.mix.rain * 1.6);
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l];
      const sky = this.skyStreaks[l];
      const page = this.pageStreaks[l];
      for (const drop of this.drops) {
        if (!drop.active || drop.layer !== l) continue;
        const length = sky.h * drop.length * stretch / Math.max(.6, cos);
        const base = layer.alpha * drop.alpha * mix * alpha * (1 - this.drizzle * .3);
        // Judge the drop by the middle of its streak, so it changes colour as it crosses the header edge.
        const onPage = this.pageShare(drop.y - length * .5);
        ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * drop.x, dpr * drop.y);
        if (onPage < .99) {
          ctx.globalAlpha = base * (1 - onPage);
          ctx.drawImage(sky.canvas, -sky.w * thin / 2, -length, sky.w * thin, length);
        }
        if (onPage > .01) {
          ctx.globalAlpha = base * onPage * PAGE_RAIN_ALPHA;
          ctx.drawImage(page.canvas, -page.w * thin / 2, -length, page.w * thin, length);
        }
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawSnow(alpha: number) {
    const sky = this.skyFlake;
    const page = this.pageFlake;
    if (!sky || !page) return;
    const mix = clamp(this.mix.snow * 1.6);
    for (const flake of this.flakes) {
      if (!flake.active) continue;
      const size = flake.size * 2;
      const base = SNOW_LAYERS[flake.layer].alpha * mix * alpha;
      const onPage = this.pageShare(flake.y);
      if (onPage < .99) {
        this.ctx.globalAlpha = base * (1 - onPage);
        this.ctx.drawImage(sky.canvas, flake.x - size / 2, flake.y - size / 2, size, size);
      }
      if (onPage > .01) {
        this.ctx.globalAlpha = base * onPage;
        this.ctx.drawImage(page.canvas, flake.x - size / 2, flake.y - size / 2, size, size);
      }
    }
  }

  private drawClouds(alpha: number) {
    const { ctx } = this;
    const fair = this.mix.fair * .95;
    const dark = this.mix.dark * .78;
    if (fair < .01 && dark < .01) return;
    const night = this.scene && !this.scene.isDay ? .75 : 1;
    for (let i = 0; i < this.clouds.length; i += 1) {
      const cloud = this.clouds[i];
      // Thin cover shows only some of the clouds rather than every cloud faintly.
      const presence = (i + 1) / this.clouds.length;
      for (const [sprites, weight] of [[this.fairClouds, fair], [this.rainClouds, dark]] as const) {
        if (weight < .01) continue;
        const cover = clamp((weight * 1.35 - presence * .7) * 1.6);
        if (cover < .01) continue;
        const sprite = sprites[cloud.sprite % sprites.length];
        const sw = sprite.w * cloud.scale;
        const sh = sprite.h * cloud.scale;
        ctx.globalAlpha = cover * cloud.alpha * alpha * night;
        ctx.drawImage(sprite.canvas, cloud.x, cloud.y, sw, sh);
      }
    }
  }

  private drawMist(layerIndex: 0 | 1, alpha: number) {
    const sprite = this.mist;
    if (!sprite) return;
    const { ctx, width: w, height: h } = this;
    const bands = layerIndex === 0
      ? [{ y: -.1, speed: 7, a: .9, scale: 1.1 }, { y: .22, speed: 12, a: .7, scale: .9 }]
      : [{ y: .45, speed: 19, a: .55, scale: .8 }];
    // Keep page text readable under the faded tail of the layer.
    const veil = .85;
    for (const band of bands) {
      const bandHeight = h * .7 * band.scale;
      const tileWidth = Math.max(w * .9, sprite.w * (bandHeight / sprite.h));
      const offset = ((this.time * band.speed * (1 + Math.abs(this.wind)) * Math.sign(this.wind || 1)) % tileWidth + tileWidth) % tileWidth;
      const y = h * band.y + Math.sin(this.time * .12 + band.y * 9) * h * .03;
      ctx.globalAlpha = band.a * veil * clamp(this.mix.fog * 1.3) * alpha;
      for (let x = offset - tileWidth; x < w; x += tileWidth) ctx.drawImage(sprite.canvas, x, y, tileWidth, bandHeight);
    }
  }

  private drawSun(alpha: number) {
    const { ctx, width: w, height: h } = this;
    const mix = clamp(this.mix.sun * 1.4) * alpha;
    const sx = w * .64;
    const sy = -h * .16;
    const breathe = .88 + Math.sin(this.time * .55) * .12;

    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 1.25);
    glow.addColorStop(0, 'rgba(255,248,222,.72)');
    glow.addColorStop(.22, 'rgba(255,226,150,.42)');
    glow.addColorStop(.55, 'rgba(255,206,112,.12)');
    glow.addColorStop(1, 'rgba(255,206,112,0)');
    ctx.globalAlpha = mix * breathe;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Crepuscular rays: soft wedges that slowly sway and shimmer, each drawn three times wider and fainter.
    const rayLength = Math.hypot(w, h) * .9;
    const rayFill = ctx.createRadialGradient(sx, sy, 0, sx, sy, rayLength);
    rayFill.addColorStop(0, 'rgba(255,238,178,1)');
    rayFill.addColorStop(.45, 'rgba(255,224,150,.45)');
    rayFill.addColorStop(1, 'rgba(255,224,150,0)');
    ctx.fillStyle = rayFill;
    const rays = 9;
    for (let i = 0; i < rays; i += 1) {
      const base = (.2 + (i / (rays - 1)) * .62) * Math.PI;
      const angle = base + Math.sin(this.time * .09 + i * 1.7) * .035;
      const shimmer = .55 + .45 * Math.sin(this.time * (.25 + (i % 3) * .11) + i * 2.3);
      const spread = (.012 + (i % 4) * .006);
      for (let pass = 0; pass < 3; pass += 1) {
        const half = spread * (1 + pass * .9);
        ctx.globalAlpha = mix * shimmer * (.11 - pass * .03);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(angle - half) * rayLength, sy + Math.sin(angle - half) * rayLength);
        ctx.lineTo(sx + Math.cos(angle + half) * rayLength, sy + Math.sin(angle + half) * rayLength);
        ctx.closePath();
        ctx.fill();
      }
    }

    const sprite = this.moteSprite;
    if (!sprite) return;
    for (const mote of this.motes) {
      const dx = mote.x - sx;
      const dy = mote.y - sy;
      const inBeam = clamp(1 - Math.hypot(dx, dy) / (h * 1.5));
      const twinkle = .4 + .6 * Math.max(0, Math.sin(this.time * 1.3 + mote.phase));
      const size = mote.size * 3;
      ctx.globalAlpha = mix * inBeam * twinkle * .85;
      ctx.drawImage(sprite.canvas, mote.x - size / 2, mote.y - size / 2, size, size);
    }
  }

  private drawBolt(seed: number, strength: number) {
    const { ctx, width: w, height: h } = this;
    const random = mulberry32(seed);
    const startX = w * (.12 + random() * .76);
    const points: [number, number][] = [[startX, -4]];
    let x = startX;
    // The bolt stays in the header sky; only its glow spills over the page.
    const end = (this.band || h) * (.8 + random() * .3);
    for (let y = 0; y < end;) {
      y += 5 + random() * 11;
      x += (random() - .5) * 18;
      points.push([x, y]);
    }
    const branchFrom = Math.floor(points.length * (.3 + random() * .3));
    ctx.save();
    ctx.globalAlpha = clamp(strength * 1.2);
    ctx.strokeStyle = 'rgba(244,248,255,.95)';
    ctx.shadowColor = 'rgba(190,212,255,.95)';
    ctx.shadowBlur = 10;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    points.forEach(([px, py], index) => (index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.lineWidth = .9;
    ctx.beginPath();
    let [bx, by] = points[branchFrom] || points[0];
    ctx.moveTo(bx, by);
    const direction = random() > .5 ? 1 : -1;
    for (let i = 0; i < 6; i += 1) {
      bx += direction * (4 + random() * 9);
      by += 4 + random() * 8;
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    ctx.restore();
  }
}
