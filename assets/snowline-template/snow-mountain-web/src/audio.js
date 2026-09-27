// Studio-grade Web Audio ambient alpine soundtrack & dynamic wind engine (inspired by Cairn).
export class AlpineAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.75;
    this.started = false;
    this.flying = false;
    this.paused = false;
    this.altitude = 2000;
    this.chordIndex = 0;
    this.chordTimer = 0;
    this.noteTimer = 1.2;
    this.activePadOscs = [];
    // Lush alpine chord progression: Dm9 -> BbMaj7#11 -> FMaj9 -> Am11
    this.chords = [
      [73.42, 110.00, 164.81, 174.61, 220.00, 261.63],
      [58.27, 87.31, 146.83, 174.61, 220.00, 329.63],
      [87.31, 130.81, 196.00, 220.00, 261.63, 329.63],
      [55.00, 110.00, 146.83, 196.00, 246.94, 293.66]
    ];
    // D Dorian / Lydian melodic notes for felt-piano / harmonic bell plucks
    this.melodyNotes = [293.66, 329.63, 349.23, 392.00, 440.00, 523.25, 587.33, 659.25, 880.00];
  }

  _init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.001, ctx.currentTime);
    this.master.connect(ctx.destination);

    // 1. Lush 4.2s stereo valley reverb (procedural impulse response)
    this.reverb = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * 4.2);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, 2.8) * (1 - Math.exp(-i / (rate * 0.04)));
        const white = (Math.random() * 2 - 1);
        lp = lp * 0.86 + white * 0.14;
        data[i] = lp * env * 0.65;
      }
    }
    this.reverb.buffer = impulse;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.68;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    // 2. Stereo Ping-Pong Delay for delicate felt-piano notes
    this.delayL = ctx.createDelay(1.0);
    this.delayR = ctx.createDelay(1.0);
    this.delayL.delayTime.value = 0.42;
    this.delayR.delayTime.value = 0.56;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 1800;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.36;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.32;

    this.delayL.connect(this.delayR);
    this.delayR.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFb);
    this.delayFb.connect(this.delayL);
    this.delayL.connect(this.delayWet);
    this.delayR.connect(this.delayWet);
    this.delayWet.connect(this.reverb);
    this.delayWet.connect(this.master);

    // 3. Pad bus with warm low-pass filter
    this.padBus = ctx.createBiquadFilter();
    this.padBus.type = 'lowpass';
    this.padBus.frequency.value = 720;
    this.padBus.Q.value = 0.7;
    this.padBus.connect(this.reverb);
    const padDry = ctx.createGain();
    padDry.gain.value = 0.42;
    this.padBus.connect(padDry);
    padDry.connect(this.master);

    // 4. Continuous high-altitude alpine wind (sculpted pink noise)
    const windLen = rate * 5;
    const windBuf = ctx.createBuffer(1, windLen, rate);
    const wData = windBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < windLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      const fade = Math.sin((i / windLen) * Math.PI);
      wData[i] = (b0 + b1 + b2) * (0.65 + 0.35 * fade);
    }
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 340;
    this.windFilter.Q.value = 2.2;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.08;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.reverb);
    this.windGain.connect(this.master);
    windSrc.start();
  }

  async start() {
    this._init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { return false; }
    }
    if (!this.started) {
      this.started = true;
      this._triggerPadChord(this.chords[0], 9.5);
      this.chordTimer = 8.0;
    }
    this._syncGain();
    return this.ctx.state === 'running';
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      if (this.volume <= 0.01) this.volume = 0.75;
      this.start();
    } else {
      this._syncGain(0.18);
    }
    return this.enabled;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    if (this.volume <= 0.005) {
      this.enabled = false;
      this._syncGain(0.08);
    } else {
      this.enabled = true;
      if (!this.started) this.start();
      else this._syncGain(0.08);
    }
    return this.volume;
  }

  setFlightState(flying, paused = false) {
    const wasFlying = this.flying;
    this.flying = flying;
    this.paused = paused;
    if (flying && !this.started && this.enabled) this.start();
    if (this.ctx && this.started) {
      const now = this.ctx.currentTime;
      const targetFreq = flying && !paused ? 1180 : 680;
      this.padBus.frequency.setTargetAtTime(targetFreq, now, 1.2);
      if (flying && !wasFlying && this.enabled) {
        this._playFeltNote(587.33, 0.14); // Gentle D5 chime on launch
      }
    }
    this._syncGain();
  }

  _syncGain(tau = 0.35) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const base = this.flying && !this.paused ? 0.82 : 0.58;
    const target = (!this.enabled || this.volume <= 0.005) ? 0.0001 : Math.max(0.0001, base * this.volume);
    this.master.gain.setTargetAtTime(target, now, tau);
  }

  _triggerPadChord(freqs, duration = 9.0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();

      osc.type = i < 2 ? 'sine' : 'triangle';
      osc2.type = 'sawtooth';
      osc.frequency.value = f;
      osc2.frequency.value = f * 1.0035; // Warm analog chorus detune

      const subGain = ctx.createGain();
      subGain.gain.value = i < 2 ? 0.08 : 0.18;
      osc2.connect(subGain);

      const voiceAmp = (i === 0 ? 0.14 : 0.075) / Math.sqrt(freqs.length);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(voiceAmp, now + 3.2);
      gain.gain.setValueAtTime(voiceAmp, now + duration - 3.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 1.2);

      pan.pan.value = ((i % 2 === 0 ? -1 : 1) * (i * 0.14));
      osc.connect(gain);
      subGain.connect(gain);
      gain.connect(pan);
      pan.connect(this.padBus);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + duration + 1.4);
      osc2.stop(now + duration + 1.4);
    }
  }

  _playFeltNote(freq, amp = 0.11) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();

    osc.type = 'triangle';
    overtone.type = 'sine';
    osc.frequency.value = freq;
    overtone.frequency.value = freq * 2.0;

    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(0.22, now);
    overGain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3.2, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.15, now + 2.4);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

    pan.pan.value = (Math.random() - 0.5) * 0.7;

    osc.connect(filter);
    overtone.connect(overGain);
    overGain.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.reverb);
    pan.connect(this.delayL);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 4.3);
    overtone.stop(now + 4.3);
  }

  update(dt, altitude = 2000) {
    this.altitude = altitude;
    if (!this.ctx || !this.started || !this.enabled || this.ctx.state !== 'running') return;

    // Modulate alpine wind pitch and volume by altitude and flight state
    const altNorm = Math.max(0, Math.min(1, (altitude - 1100) / 2000));
    const now = this.ctx.currentTime;
    const windFreq = (this.flying && !this.paused ? 420 : 280) + altNorm * 280;
    const windAmp = (this.flying && !this.paused ? 0.12 : 0.055) + altNorm * 0.06;
    this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.25);
    this.windGain.gain.setTargetAtTime(windAmp, now, 0.25);

    // Advance chord progression
    this.chordTimer -= dt;
    if (this.chordTimer <= 0) {
      this.chordIndex = (this.chordIndex + 1) % this.chords.length;
      this._triggerPadChord(this.chords[this.chordIndex], 9.5);
      this.chordTimer = 7.8;
    }

    // Trigger sparse felt-piano / harmonic alpine notes
    this.noteTimer -= dt * (this.flying && !this.paused ? 1.35 : 0.85);
    if (this.noteTimer <= 0) {
      const idx = Math.floor(Math.random() * this.melodyNotes.length);
      this._playFeltNote(this.melodyNotes[idx], this.flying ? 0.11 : 0.08);
      this.noteTimer = 1.6 + Math.random() * 2.4;
    }
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
