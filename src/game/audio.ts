import type { WeatherMode } from './types';

export class DogAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private stepTimer = 0;
  private stepParity = 0;
  private wasMoving = false;
  private noiseBuffer: AudioBuffer | null = null;

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.rainGain && this.ctx) {
      this.rainGain.gain.setTargetAtTime(muted ? 0 : this.targetRainVol, this.ctx.currentTime, 0.15);
    }
  }

  public isMuted() {
    return this.muted;
  }

  private targetRainVol = 0;

  public setWeatherAmbience(weather: WeatherMode) {
    this.targetRainVol = weather === 'rain' ? 0.055 : 0;
    if (!this.ctx || this.muted) return;
    if (weather === 'rain' && !this.rainSource) {
      this.startRainNoise();
    }
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.targetRainVol, this.ctx.currentTime, 0.4);
    }
  }

  private startRainNoise() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise for natural rainfall
      lastOut = (lastOut + 0.06 * white) / 1.06;
      data[i] = lastOut * 2.5;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();

    this.rainSource = source;
    this.rainGain = gain;
  }

  public playBark(pitchMult = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Two-syllable natural woof/arf
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'triangle';

    const baseFreq = 210 * pitchMult;
    osc.frequency.setValueAtTime(baseFreq * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.65, now + 0.045);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.19);

    osc2.frequency.setValueAtTime(baseFreq * 0.68, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.19);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(620 * pitchMult, now);
    filter.frequency.exponentialRampToValueAtTime(340 * pitchMult, now + 0.18);
    filter.Q.value = 2.4;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.23);
    osc2.stop(now + 0.23);
  }

  public playFootstep(speedRatio: number, onPavement: boolean, dt: number) {
    if (speedRatio < 0.06) {
      this.stepTimer = 0;
      this.wasMoving = false;
      return;
    }
    // Realistic quadruped cadence: crisp alternating pawfalls from slow walk to fast gallop
    const interval = Math.max(0.11, 0.29 - speedRatio * 0.16);
    if (!this.wasMoving) {
      this.wasMoving = true;
      this.stepTimer = interval; // Fire first pawstep immediately on movement start
    } else {
      this.stepTimer += dt;
    }
    if (this.stepTimer < interval) return;
    this.stepTimer -= interval;
    this.stepParity = (this.stepParity + 1) % 4;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const intensity = Math.min(1.0, 0.48 + speedRatio * 0.58);
    // Subtle per-paw tonal variation (front vs hind paws)
    const pawTone = this.stepParity < 2 ? 1.08 : 0.92;

    if (onPavement) {
      // Layer 1: Soft padded paw thump on stone/concrete
      const padOsc = ctx.createOscillator();
      const padGain = ctx.createGain();
      padOsc.type = 'triangle';
      padOsc.frequency.setValueAtTime((165 + Math.random() * 25) * pawTone, now);
      padOsc.frequency.exponentialRampToValueAtTime(52, now + 0.045);
      padGain.gain.setValueAtTime(0.001, now);
      padGain.gain.linearRampToValueAtTime(0.14 * intensity, now + 0.004);
      padGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);
      padOsc.connect(padGain);
      padGain.connect(ctx.destination);
      padOsc.start(now);
      padOsc.stop(now + 0.06);

      // Layer 2: Crisp dog-claw click on concrete/cobblestone
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.getNoiseBuffer(ctx);
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.setValueAtTime((2400 + Math.random() * 650) * pawTone, now);
      clickFilter.Q.value = 3.2;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.001, now);
      clickGain.gain.linearRampToValueAtTime(0.16 * intensity, now + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.024);
      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickSrc.start(now);
      clickSrc.stop(now + 0.028);
    } else {
      // Layer 1: Soft earthy paw thud on grass/soil
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime((115 + Math.random() * 20) * pawTone, now);
      thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.06);
      thudGain.gain.setValueAtTime(0.001, now);
      thudGain.gain.linearRampToValueAtTime(0.13 * intensity, now + 0.008);
      thudGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.068);
      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.072);

      // Layer 2: Soft grass-blade brush rustle
      const rustleSrc = ctx.createBufferSource();
      rustleSrc.buffer = this.getNoiseBuffer(ctx);
      const rustleFilter = ctx.createBiquadFilter();
      rustleFilter.type = 'bandpass';
      rustleFilter.frequency.setValueAtTime(1150 + Math.random() * 350, now);
      rustleFilter.Q.value = 1.1;
      const rustleGain = ctx.createGain();
      rustleGain.gain.setValueAtTime(0.001, now);
      rustleGain.gain.linearRampToValueAtTime(0.095 * intensity, now + 0.01);
      rustleGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
      rustleSrc.connect(rustleFilter);
      rustleFilter.connect(rustleGain);
      rustleGain.connect(ctx.destination);
      rustleSrc.start(now);
      rustleSrc.stop(now + 0.08);
    }
  }

  public playTreatChomp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 3 quick happy crunches + warm chime
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(240 + i * 55, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    }

    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(587.33, now + 0.12);
    chime.frequency.setValueAtTime(880, now + 0.22);
    cGain.gain.setValueAtTime(0.001, now + 0.12);
    cGain.gain.linearRampToValueAtTime(0.08, now + 0.14);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    chime.connect(cGain);
    cGain.connect(ctx.destination);
    chime.start(now + 0.12);
    chime.stop(now + 0.46);
  }

  public playBellyRub() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.065, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playRewardUnlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((freq, i) => {
      const t = now + i * 0.095;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.52);
    });
  }

  public playPee() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1750, now);
    filter.frequency.linearRampToValueAtTime(1250, now + 0.9);
    filter.Q.value = 3.0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.15);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.72);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  public playPoop() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.52);
    gain.gain.setValueAtTime(0.001, now + 0.35);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.38);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + 0.35);
    osc.stop(now + 0.58);
  }

  public playSniff() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.16;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.11), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.045, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
    }
  }

  public dispose() {
    try {
      this.rainSource?.stop();
      this.ctx?.close();
    } catch {
      // Ignore audio teardown errors
    }
    this.ctx = null;
    this.rainSource = null;
    this.rainGain = null;
  }
}
