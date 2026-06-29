/**
 * Audio — Howler-style SFX (§2 stack: Howler.js).
 *
 * Rather than ship binary audio assets, we synthesize the key effects with the
 * WebAudio API (zero asset weight, instant). Howler is still listed as the
 * intended production stack; this gives us the same call surface (play(name))
 * with no asset pipeline. The per-clear stamp THWACK, the rising crowd swell,
 * and the sad-trombone on falling behind are the emotional beats from §8.
 */
import { Howl } from 'howler';

type SfxName = 'stamp' | 'clear' | 'escalate' | 'drown' | 'win' | 'tick' | 'coin';

let ctx: AudioContext | null = null;
let enabled = true;
let crowdOsc: OscillatorNode | null = null;
let crowdGain: GainNode | null = null;

export function initAudio() {
  // Howler is imported so the production path can swap in real clips; the
  // synth below is the working implementation.
  void Howl;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) stopCrowd();
}

export function resumeAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function now(): number {
  return ctx ? ctx.currentTime : 0;
}

/** Play a named effect. Silently no-ops when sound is off or context missing. */
export function play(name: SfxName) {
  if (!enabled || !ctx) return;
  switch (name) {
    case 'stamp':
      thunk();
      break;
    case 'clear':
      blip(880, 0.06);
      setTimeout(() => blip(1320, 0.05), 40);
      break;
    case 'escalate':
      blip(300, 0.12, 'square');
      break;
    case 'drown':
      sadTrombone();
      break;
    case 'win':
      fanfare();
      break;
    case 'tick':
      blip(660, 0.03, 'square', 0.05);
      break;
    case 'coin':
      blip(988, 0.04);
      setTimeout(() => blip(1319, 0.06), 50);
      break;
  }
}

function blip(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, now());
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(now() + dur);
}

/** The rubber-stamp THWACK — the signature Papers-Please beat. */
function thunk() {
  if (!ctx) return;
  // A short burst of filtered noise + a low thump.
  const dur = 0.18;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now());
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
  // low thump underneath
  blip(90, 0.16, 'sine', 0.18);
}

function sadTrombone() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(330, now());
  osc.frequency.exponentialRampToValueAtTime(140, now() + 0.6);
  gain.gain.setValueAtTime(0.14, now());
  gain.gain.exponentialRampToValueAtTime(0.0001, now() + 0.7);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(now() + 0.7);
}

function fanfare() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.15), i * 110));
}

// A 10-step ascending A-minor-pentatonic run, so the last ten seconds climb in
// pitch — a clock ticking up into a climax. (An original game-show-style tension
// motif, not any specific theme.)
const COUNTDOWN_NOTES = [220, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];

/**
 * One countdown beat for the final 10 seconds — call once per second with
 * secondsLeft 10..1. Each beat is a clock pulse (alternating pendulum tock) plus
 * a rising tension note that gets brighter and louder as it nears zero, with an
 * octave sparkle on the last three beats. The win fanfare takes over at 0.
 */
export function countdownBeat(secondsLeft: number) {
  if (!enabled || !ctx) return;
  const s = Math.max(1, Math.min(10, Math.round(secondsLeft)));
  const note = COUNTDOWN_NOTES[10 - s] ?? 440;
  const urgent = s <= 3;
  // clock pulse — alternating low pendulum tock (tick / tock)
  blip(s % 2 === 0 ? 96 : 72, 0.11, 'sine', urgent ? 0.2 : 0.16);
  // the rising tension note
  blip(note, urgent ? 0.24 : 0.16, urgent ? 'square' : 'triangle', urgent ? 0.15 : 0.1);
  // octave sparkle on the final three beats
  if (urgent) setTimeout(() => blip(note * 2, 0.13, 'triangle', 0.08), 35);
}

/** A continuous crowd hum whose volume tracks lane stress. */
export function setCrowdIntensity(stress01: number) {
  if (!enabled || !ctx) return;
  if (!crowdOsc) startCrowd();
  if (crowdGain) {
    const target = 0.02 + stress01 * 0.08;
    crowdGain.gain.setTargetAtTime(target, now(), 0.4);
  }
}

function startCrowd() {
  if (!ctx || crowdOsc) return;
  crowdOsc = ctx.createOscillator();
  crowdGain = ctx.createGain();
  crowdOsc.type = 'sawtooth';
  crowdOsc.frequency.value = 120;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 400;
  crowdGain.gain.setValueAtTime(0.0001, now());
  crowdOsc.connect(filter).connect(crowdGain).connect(ctx.destination);
  crowdOsc.start();
}

function stopCrowd() {
  if (crowdGain) crowdGain.gain.setTargetAtTime(0.0001, now(), 0.2);
}

/**
 * Stop every continuous sound immediately — the conveyor hum (crowd swell) and
 * anything sustained. Called when the race stops, ends, or the lobby returns, so
 * silence is immediate rather than waiting for the next render to ramp it down.
 * One-shots (stamp/clear/win) are short and left to finish on their own.
 */
export function stopAllAudio() {
  if (crowdGain && ctx) crowdGain.gain.setValueAtTime(0.0001, now());
}
