// Original procedural lofi loop. No third-party stream or licensed recording.
const tempo = 76;
const stepSeconds = 60 / tempo / 4;
const progression = [
  [48, 51, 55, 58, 62], // Cm9
  [44, 48, 51, 55, 60], // Abmaj7
  [41, 45, 48, 53, 55], // Fm9
  [43, 47, 50, 53, 57], // G7
];

function frequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class LofiPlayer {
  private context: AudioContext | null = null;
  private volume: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;

  async start() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const context = new AudioContext();
    const volume = context.createGain();
    volume.gain.value = 0.24;
    volume.connect(context.destination);
    this.context = context;
    this.volume = volume;
    await context.resume();
    this.nextTime = context.currentTime + 0.08;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 120);
  }

  setVolume(value: number) {
    if (this.volume && this.context) {
      this.volume.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.3, this.context.currentTime, 0.04);
    }
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    this.volume = null;
    if (context) await context.close();
  }

  private tone(midi: number, time: number, duration: number, level: number, wave: OscillatorType = "sine") {
    const context = this.context;
    const output = this.volume;
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency(midi), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private beat(time: number, kind: "kick" | "snare" | "hat") {
    const context = this.context;
    const output = this.volume;
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    if (kind === "kick") {
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(105, time);
      oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.16);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.23);
    } else {
      oscillator.type = kind === "snare" ? "triangle" : "square";
      oscillator.frequency.value = kind === "snare" ? 175 : 6800;
      gain.gain.setValueAtTime(kind === "snare" ? 0.09 : 0.012, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + (kind === "snare" ? 0.11 : 0.035));
    }
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + 0.25);
  }

  private schedule() {
    const context = this.context;
    if (!context) return;
    while (this.nextTime < context.currentTime + 0.45) {
      const barStep = this.step % 16;
      const chord = progression[Math.floor(this.step / 16) % progression.length];
      const time = this.nextTime;
      if (barStep === 0) {
        chord.slice(1).forEach((note) => this.tone(note + 12, time, stepSeconds * 14, 0.018, "triangle"));
      }
      if (barStep % 4 === 0) this.tone(chord[0] - 12, time, stepSeconds * 3, 0.075);
      if ([0, 8].includes(barStep)) this.beat(time, "kick");
      if ([4, 12].includes(barStep)) this.beat(time, "snare");
      if (barStep % 2 === 0) this.beat(time, "hat");
      if ([2, 5, 10, 13].includes(barStep)) {
        const notes = [chord[2], chord[4], chord[3], chord[1]];
        this.tone(notes[[2, 5, 10, 13].indexOf(barStep)] + 12, time, stepSeconds * 2.6, 0.04);
      }
      this.step += 1;
      this.nextTime += stepSeconds;
    }
  }
}
