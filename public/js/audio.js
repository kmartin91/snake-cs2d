const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = store.get('scs-muted', false);
    this.voiceOn = store.get('scs-voice', true);
    this.ringing = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    store.set('scs-muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    if (this.muted && window.speechSynthesis) window.speechSynthesis.cancel();
    return this.muted;
  }

  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    store.set('scs-voice', this.voiceOn);
    return this.voiceOn;
  }

  ready() {
    return this.ctx && !this.muted && !document.hidden;
  }

  tone({ type = 'sine', from, to = from, dur = 0.1, vol = 0.3, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  burst({ dur = 0.2, vol = 0.3, filter = 'lowpass', freq = 1000, toFreq = freq, q = 1, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, vol = 1) {
    if (!this.ready()) return;
    const v = Math.max(0, Math.min(1, vol));
    switch (name) {
      case 'shot':
        this.burst({ dur: 0.09, vol: 0.5 * v, filter: 'bandpass', freq: 2200, toFreq: 700, q: 0.8 });
        this.tone({ type: 'square', from: 180, to: 60, dur: 0.07, vol: 0.18 * v });
        break;
      case 'impact':
        this.burst({ dur: 0.05, vol: 0.15 * v, filter: 'highpass', freq: 3000 });
        break;
      case 'cut':
        this.tone({ type: 'sawtooth', from: 520, to: 140, dur: 0.12, vol: 0.18 * v });
        this.burst({ dur: 0.1, vol: 0.2 * v, freq: 1400, toFreq: 300 });
        break;
      case 'headshot':
        this.tone({ from: 1900, dur: 0.35, vol: 0.28 * v });
        this.tone({ from: 2850, dur: 0.25, vol: 0.12 * v });
        this.burst({ dur: 0.12, vol: 0.35 * v, filter: 'highpass', freq: 1500 });
        break;
      case 'kill':
        this.tone({ from: 140, to: 40, dur: 0.35, vol: 0.4 * v });
        this.burst({ dur: 0.3, vol: 0.3 * v, freq: 900, toFreq: 100 });
        break;
      case 'armor':
        this.tone({ type: 'triangle', from: 1200, to: 900, dur: 0.18, vol: 0.25 * v });
        this.tone({ type: 'square', from: 2400, to: 2000, dur: 0.06, vol: 0.08 * v });
        break;
      case 'pickup':
        this.tone({ from: 660, to: 1050, dur: 0.07, vol: 0.12 * v });
        break;
      case 'crate':
        this.tone({ type: 'triangle', from: 440, to: 880, dur: 0.1, vol: 0.2 * v });
        this.tone({ type: 'triangle', from: 880, to: 1320, dur: 0.1, vol: 0.15 * v, delay: 0.07 });
        break;
      case 'beep':
        this.tone({ type: 'square', from: 2100, dur: 0.07, vol: 0.12 * v });
        break;
      case 'plant':
        for (let i = 0; i < 3; i += 1) this.tone({ type: 'square', from: 2100, dur: 0.06, vol: 0.12, delay: i * 0.12 });
        break;
      case 'defusing':
        this.tone({ type: 'square', from: 900, dur: 0.03, vol: 0.06 * v });
        break;
      case 'explosion':
        this.burst({ dur: 2.2, vol: 0.9 * v, freq: 1200, toFreq: 60 });
        this.tone({ from: 70, to: 25, dur: 1.4, vol: 0.7 * v });
        break;
      case 'he':
        this.burst({ dur: 0.9, vol: 0.7 * v, freq: 1600, toFreq: 80 });
        this.tone({ from: 110, to: 35, dur: 0.6, vol: 0.5 * v });
        break;
      case 'flashbang':
        this.burst({ dur: 0.25, vol: 0.5 * v, filter: 'highpass', freq: 2500 });
        break;
      case 'smoke':
        this.burst({ dur: 1.6, vol: 0.22 * v, filter: 'bandpass', freq: 3500, toFreq: 1500, q: 0.5 });
        break;
      case 'throw':
        this.burst({ dur: 0.12, vol: 0.12 * v, filter: 'bandpass', freq: 900, toFreq: 2000 });
        break;
      case 'buy':
        this.tone({ type: 'triangle', from: 1320, dur: 0.06, vol: 0.18 });
        this.tone({ type: 'triangle', from: 1760, dur: 0.12, vol: 0.18, delay: 0.06 });
        break;
      case 'deny':
        this.tone({ type: 'square', from: 160, to: 120, dur: 0.18, vol: 0.12 });
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.2, delay: i * 0.1 }));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone({ type: 'triangle', from: f, dur: 0.28, vol: 0.18, delay: i * 0.13 }));
        break;
      case 'go':
        this.tone({ type: 'sawtooth', from: 220, to: 440, dur: 0.25, vol: 0.12 });
        break;
      case 'tick':
        this.tone({ type: 'square', from: 1000, dur: 0.03, vol: 0.05 });
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ type: 'square', from: f, dur: 0.16, vol: 0.12, delay: i * 0.08 }));
        this.tone({ type: 'triangle', from: 1568, dur: 0.6, vol: 0.18, delay: 0.42 });
        break;
      case 'xp':
        this.tone({ type: 'triangle', from: 1200, to: 1600, dur: 0.06, vol: 0.06 });
        break;
      case 'chat':
        this.tone({ from: 880, dur: 0.05, vol: 0.06 });
        break;
      default:
    }
  }

  ring(seconds) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = 3600;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + seconds);
  }

  say(text) {
    if (!this.voiceOn || this.muted || document.hidden || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.05;
    u.pitch = 0.75;
    u.volume = 0.9;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}

export { store };
