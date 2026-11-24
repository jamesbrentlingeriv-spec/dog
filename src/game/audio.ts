import type { WeatherMode } from './types';

export class DogAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private rainGain: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private stepTimer = 0;

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
    if (speedRatio < 0.12) {
      this.stepTimer = 0;
      return;
    }
    const interval = Math.max(0.13, 0.34 - speedRatio * 0.19);
    this.stepTimer += dt;
    if (this.stepTimer < interval) return;
    this.stepTimer = 0;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = onPavement ? 'triangle' : 'sine';
    const startFreq = onPavement ? 280 + Math.random() * 80 : 120 + Math.random() * 40;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.045);

    const vol = (onPavement ? 0.032 : 0.024) * Math.min(1, speedRatio + 0.3);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
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
