/**
 * Programmatic Web Audio engine. No sound files are loaded.
 *
 * Layers:
 *   1. Ambient pad — three sine/triangle oscillators tuned to a mode that
 *      shifts with season + time-of-day. Always playing, cross-fading.
 *   2. Event SFX — short procedural blips on courier arrivals, forge hits,
 *      research entries, fireworks, storms.
 *
 * Total runtime cost is trivial (a handful of oscillators + a low-pass).
 * No audio context is created until the user first interacts with the page —
 * browsers block autoplay otherwise.
 */

import type { World } from "../sim/World";
import type { ExternalEvent } from "../sim/events/EventSchema";

const SEASON_SCALES: Record<string, number[]> = {
  // Semitones above the root (440 Hz = A4)
  spring: [0, 4, 7, 11, 14], // major-ish, hopeful
  summer: [0, 2, 7, 9, 12],  // mixolydian
  autumn: [0, 3, 7, 10, 14], // dorian
  winter: [0, 3, 7, 10, 13], // minor-ish, cold
};

function semitonesToFreq(root: number, semitones: number): number {
  return root * Math.pow(2, semitones / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padOscs: OscillatorNode[] = [];
  private filter: BiquadFilterNode | null = null;
  private muted = true;
  private currentVolume = 0.4;
  private currentSeason: string | null = null;
  private currentBand: string | null = null;
  private offEvent: (() => void) | null = null;
  /** Melody layer — sparse phrases scheduled every 15-40s. */
  private melodyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Disabled separately from the pad so a player who likes the drone but
   *  not the melody can keep just the drone. Hooked up via setMelodyEnabled. */
  private melodyEnabled = true;

  attach(world: World) {
    // Subscribe early so we don't miss events even before unmute.
    this.offEvent = world.bus.subscribe((ev) => {
      if (this.muted || !this.ctx) return;
      this.playEventSfx(ev);
    });

    // First click/keydown unlocks audio (browser autoplay policy).
    const unlock = () => {
      this.unlock(world);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  detach() {
    this.offEvent?.();
    this.offEvent = null;
    if (this.melodyTimer) {
      clearTimeout(this.melodyTimer);
      this.melodyTimer = null;
    }
    this.stopPad();
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    this.filter = null;
  }

  setVolume(v: number) {
    this.currentVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    } else if (!muted && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.1);
    }
  }

  /** Called every ~1s from the App effect to refresh pad voicing if season/band changed. */
  updateContext(season: string, band: string) {
    if (!this.ctx || this.muted) return;
    if (season === this.currentSeason && band === this.currentBand) return;
    this.currentSeason = season;
    this.currentBand = band;
    this.retunePad(season, band);
  }

  private unlock(world: World) {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch (err) {
      console.warn("[Audio] AudioContext unavailable", err);
      return;
    }
    this.muted = false;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.currentVolume;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 0.4;
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.35;
    this.padGain.connect(this.filter);
    this.filter.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.startPad();
    this.updateContext(world.state.season, world.dayNight.bandAt(world.state.time));
    this.scheduleNextMelody();
  }

  /** Toggle the sparse melody layer (independent of the drone pad). */
  setMelodyEnabled(on: boolean) {
    this.melodyEnabled = on;
    if (!on && this.melodyTimer) {
      clearTimeout(this.melodyTimer);
      this.melodyTimer = null;
    } else if (on && this.ctx && !this.melodyTimer) {
      this.scheduleNextMelody();
    }
  }

  // ── Ambient pad ─────────────────────────────────────────────────────────

  private startPad() {
    if (!this.ctx || !this.padGain) return;
    // 3-voice drone with slight detune for movement
    const root = 110; // A2
    const offsets = [0, 7, 12];
    for (const off of offsets) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = semitonesToFreq(root, off);
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      // very slow tremolo for organic movement
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08 + Math.random() * 0.05;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.18;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(this.padGain);
      osc.start();
      lfo.start();
      this.padOscs.push(osc);
      this.padOscs.push(lfo);
    }
  }

  private retunePad(season: string, band: string) {
    if (!this.ctx) return;
    const scale = SEASON_SCALES[season] ?? SEASON_SCALES.spring;
    // dawn/night are lower; day/dusk are higher
    const rootByBand: Record<string, number> = {
      dawn: 98,    // G2
      day: 130.8,  // C3
      dusk: 116.5, // A#2
      night: 87.3, // F2
    };
    const root = rootByBand[band] ?? 110;
    const padOscNodes = this.padOscs.filter((o) => o.type !== "sine"); // skip LFOs
    // Re-target frequencies smoothly
    let voice = 0;
    for (const osc of padOscNodes) {
      const offset = scale[voice % scale.length];
      try {
        osc.frequency.setTargetAtTime(
          semitonesToFreq(root, offset),
          this.ctx.currentTime,
          0.8,
        );
      } catch {
        /* osc may already be detuning */
      }
      voice++;
    }
    if (this.filter) {
      // brighter during day, mellower at night
      const target = band === "day" ? 1800 : band === "dawn" || band === "dusk" ? 1300 : 900;
      this.filter.frequency.setTargetAtTime(target, this.ctx.currentTime, 1.2);
    }
  }

  private stopPad() {
    for (const node of this.padOscs) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.padOscs = [];
  }

  // ── Event SFX ───────────────────────────────────────────────────────────

  private playEventSfx(ev: ExternalEvent) {
    // ±5% pitch variation makes repeated SFX feel less mechanical
    const v = (cents: number) => 1 + (Math.random() - 0.5) * 0.1 * (cents / 100);
    switch (ev.kind) {
      case "courier":
        this.pluck(880 * v(50), 0.06, "triangle", 0.18);
        break;
      case "forge":
        this.clang();
        break;
      case "research":
        this.pluck(1320 * v(50), 0.04, "sine", 0.12);
        break;
      case "celebration":
        this.fanfare();
        break;
      case "festival":
        this.fanfare();
        // Festival is bigger — add a second cascade 200ms later
        setTimeout(() => this.fanfare(), 220);
        break;
      case "storm":
        this.rumble();
        break;
      case "airship":
        this.pluck(330 * v(30), 0.18, "sawtooth", 0.06);
        break;
      case "mining":
        this.pluck(220 * v(30), 0.12, "square", 0.08);
        break;
      case "monster":
        this.pluck(110 * v(20), 0.4, "sawtooth", 0.05);
        break;
      // Twitch-specific tones — distinct from generic events
      case "twitch_follow":
        this.pluck(1500, 0.08, "sine", 0.14);
        break;
      case "twitch_sub":
        this.chime();
        break;
      case "twitch_bits":
        // Coin shower
        for (let i = 0; i < 4; i++) {
          setTimeout(() => this.pluck(2000 + Math.random() * 800, 0.05, "triangle", 0.1), i * 50);
        }
        break;
      case "twitch_raid":
        this.fanfare();
        setTimeout(() => this.fanfare(), 250);
        break;
    }
  }

  /** Public helper for achievement unlocks etc. — distinctive 3-note chime. */
  chime() {
    if (!this.ctx) return;
    const notes = [880, 1109, 1319]; // A5, C#6, E6 — major triad
    let delay = 0;
    for (const n of notes) {
      setTimeout(() => this.pluck(n, 0.25, "triangle", 0.12), delay);
      delay += 60;
    }
  }

  /**
   * Category-aware chime. Different achievement themes get distinct musical
   * fingerprints. Falls back to the generic chime() if the category is
   * unknown. Used by App.tsx when an achievement unlocks.
   */
  chimeFor(category: "life" | "time" | "construction" | "vault" | "mystery" | "default") {
    if (!this.ctx) return;
    switch (category) {
      case "life":
        // Warm major chord, gentle bloom — births, marriages, deaths
        this.softChord([523, 659, 784], "sine", 0.55, 0.10);
        break;
      case "time":
        // Bell-like cascade for anniversaries / day milestones
        this.softChord([784, 988, 1175, 1568], "triangle", 0.45, 0.09);
        break;
      case "construction":
        // Sturdy two-tone "hammer ring" suggesting completion
        this.pluck(440, 0.18, "triangle", 0.13);
        setTimeout(() => this.pluck(659, 0.30, "triangle", 0.13), 90);
        break;
      case "vault":
        // Bright twinkle — three notes ascending in quick succession
        {
          const notes = [1175, 1568, 2349]; // D6, G6, D7
          let delay = 0;
          for (const n of notes) {
            setTimeout(() => this.pluck(n, 0.18, "triangle", 0.10), delay);
            delay += 45;
          }
        }
        break;
      case "mystery":
        // Strange 4-note minor descent for hidden achievements
        {
          const notes = [659, 622, 587, 554]; // E5, D#5, D5, C#5
          let delay = 0;
          for (const n of notes) {
            setTimeout(() => this.pluck(n, 0.28, "sine", 0.09), delay);
            delay += 90;
          }
        }
        break;
      default:
        this.chime();
    }
  }

  /** Internal: a sustained chord at low volume — sums multiple oscillators. */
  private softChord(
    freqs: number[],
    type: OscillatorType,
    duration: number,
    amp: number,
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      // Slow bloom so the chord feels intentional, not a click
      g.gain.linearRampToValueAtTime(amp / freqs.length, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  private pluck(freq: number, duration: number, type: OscillatorType, amp: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private clang() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    for (const f of [600, 870, 1230]) {
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  private fanfare() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    let delay = 0;
    for (const n of notes) {
      setTimeout(() => this.pluck(n, 0.18, "triangle", 0.14), delay);
      delay += 90;
    }
  }

  private rumble() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    // noise burst via OscillatorNode detuning + buffer is overkill — use
    // a quick downward sweep through a saw to fake distant thunder.
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 1.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 200;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.4);
  }

  // ── Melody layer ────────────────────────────────────────────────────────
  // A sparse 3-5 note phrase plays every 15-40s on top of the drone pad.
  // Notes come from the current season's scale; tempo + register vary by
  // time-of-day band. The result is "ambient music" rather than "ambient
  // drone" — quiet enough to ignore, recognizable enough to enjoy.

  private scheduleNextMelody() {
    if (!this.melodyEnabled || !this.ctx || this.muted) {
      this.melodyTimer = null;
      return;
    }
    // Day phrases are more frequent; night phrases sparser.
    const baseMs = this.currentBand === "night" ? 30_000 : 18_000;
    const jitterMs = 12_000;
    const delay = baseMs + Math.random() * jitterMs;
    this.melodyTimer = setTimeout(() => {
      this.playMelodyPhrase();
      this.scheduleNextMelody();
    }, delay);
  }

  private playMelodyPhrase() {
    if (!this.ctx || !this.master || this.muted) return;
    const season = this.currentSeason ?? "spring";
    const band = this.currentBand ?? "day";
    const scale = SEASON_SCALES[season] ?? SEASON_SCALES.spring;
    // Register: melody sits an octave above the pad's root.
    const rootByBand: Record<string, number> = {
      dawn: 392,    // G4
      day: 523,     // C5
      dusk: 466,    // A#4
      night: 349,   // F4
    };
    const root = rootByBand[band] ?? 440;
    // Phrase length 3-5 notes, gentler in night/dawn.
    const len = band === "night" ? 3 : 3 + Math.floor(Math.random() * 3);
    // Note-to-note timing: longer at night.
    const stepMs = band === "night" ? 700 : 420;
    // Phrase amplitude: very soft so it doesn't compete with the pad/SFX.
    const amp = band === "night" ? 0.05 : 0.075;
    // Build a phrase: start from any scale degree, walk by ±1 step mostly.
    let degree = Math.floor(Math.random() * scale.length);
    for (let i = 0; i < len; i++) {
      const semi = scale[Math.max(0, Math.min(scale.length - 1, degree))];
      const freq = semitonesToFreq(root, semi);
      setTimeout(() => this.melodyNote(freq, amp), i * stepMs);
      // Step ±1 most of the time; occasionally hold or skip.
      const r = Math.random();
      if (r < 0.5) degree -= 1;
      else if (r < 0.9) degree += 1;
      // else hold
    }
  }

  private melodyNote(freq: number, amp: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // Slow attack so the note "blooms" rather than plucks.
    g.gain.linearRampToValueAtTime(amp, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.3);
  }
}
