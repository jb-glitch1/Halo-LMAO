// All-synth audio. No asset files — every sound is generated with the Web Audio API.
// The announcer uses SpeechSynthesis when available (budget Halo announcer energy).

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  muted = false;
  volume = 0.7;
  announcerOn = true;
  announcerStyle: "cashier" | "infomercial" | "manager" = "cashier";
  private lastAnnounce = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private choir: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  ensure() {
    if (this.ctx) return;
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.pickVoice();
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }
  setAnnouncerStyle(s: "cashier" | "infomercial" | "manager") {
    this.announcerStyle = s;
  }

  // A legally-distinct choir pad — the one sound everyone associates with that
  // ring game, built from detuned sines so it ships with zero audio files.
  ambience(on: boolean) {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (on) {
      if (this.choir) return;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.06, ctx.currentTime, 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 950;
      g.connect(lp);
      lp.connect(this.master);
      const chord = [130.81, 196.0, 261.63, 329.63]; // Cmin-ish "ooooh"
      const osc: OscillatorNode[] = [];
      for (const f of chord) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const od = ctx.createOscillator();
        od.type = "sine";
        od.frequency.value = f * 1.006; // detuned twin
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og);
        od.connect(og);
        og.connect(g);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.13 + Math.random() * 0.1;
        const lfog = ctx.createGain();
        lfog.gain.value = f * 0.004;
        lfo.connect(lfog);
        lfog.connect(o.frequency);
        o.start();
        od.start();
        lfo.start();
        osc.push(o, od, lfo);
      }
      this.choir = { osc, gain: g };
    } else {
      if (!this.choir) return;
      const { osc, gain } = this.choir;
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
      const stopAt = ctx.currentTime + 1.4;
      for (const o of osc) {
        try {
          o.stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
      this.choir = null;
    }
  }

  private pickVoice() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      this.voice =
        vs.find((v) => /Daniel|Google UK English Male|Microsoft David|Fred/i.test(v.name)) ||
        vs.find((v) => /en-?US|en-?GB/i.test(v.lang)) ||
        vs[0] ||
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }

  private env(node: AudioNode, gain: GainNode, t0: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private noiseBuffer(dur: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Route a per-sound bus through a stereo panner (-1 left … +1 right).
  private connectPanned(node: AudioNode, pan: number) {
    if (!this.sfxGain) return;
    if (pan && this.ctx?.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(this.sfxGain);
    } else {
      node.connect(this.sfxGain);
    }
  }

  // ---------- weapon sounds ----------
  weapon(weaponId: string, dist = 0, pan = 0) {
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const atten = Math.max(0.12, 1 - dist / 70);
    const out = ctx.createGain();
    out.gain.value = atten;
    this.connectPanned(out, pan);

    const tone = (freq: number, type: OscillatorType, peak: number, dur: number, slideTo?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      this.env(o, g, t0, peak, 0.002, dur);
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    };
    const burst = (dur: number, peak: number, lp: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(dur);
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      this.env(src, g, t0, peak, 0.001, dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t0);
    };

    switch (weaponId) {
      case "ar":
        burst(0.07, 0.5, 2600);
        tone(180, "square", 0.25, 0.06, 90);
        break;
      case "br":
        burst(0.05, 0.4, 3000);
        tone(260, "square", 0.22, 0.05, 140);
        break;
      case "magnum":
        burst(0.09, 0.6, 2200);
        tone(150, "sawtooth", 0.3, 0.12, 70);
        break;
      case "sniper":
        burst(0.18, 0.8, 1500);
        tone(90, "sawtooth", 0.5, 0.3, 50);
        break;
      case "shotgun":
        burst(0.16, 0.8, 1800);
        tone(110, "square", 0.4, 0.18, 60);
        break;
      case "rocket":
        burst(0.25, 0.7, 1000);
        tone(70, "sawtooth", 0.5, 0.35, 40);
        break;
      case "plasma":
        tone(700, "sawtooth", 0.35, 0.12, 200);
        tone(1200, "sine", 0.2, 0.1, 400);
        break;
      case "needler":
        tone(1400, "triangle", 0.25, 0.08, 2000);
        break;
      case "sword":
        tone(500, "sine", 0.3, 0.25, 1400);
        tone(900, "triangle", 0.2, 0.2, 200);
        break;
      case "turret":
        burst(0.05, 0.45, 3200);
        tone(220, "square", 0.22, 0.05, 120);
        break;
      default:
        burst(0.06, 0.4, 2500);
    }
  }

  // ---------- generic sfx ----------
  sfx(name: string, dist = 0, pan = 0) {
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = Math.max(0.1, 1 - dist / 60);
    this.connectPanned(out, pan);
    const tone = (freq: number, type: OscillatorType, peak: number, dur: number, slideTo?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      this.env(o, g, t0, peak, 0.003, dur);
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    };
    const noise = (dur: number, peak: number, lp: number, hp = 0) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(dur);
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      this.env(src, g, t0, peak, 0.002, dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t0);
    };
    switch (name) {
      case "explosion":
        noise(0.5, 0.9, 900);
        tone(60, "sawtooth", 0.6, 0.5, 30);
        break;
      case "hit": // hitmarker
        tone(1200, "square", 0.18, 0.04, 900);
        break;
      case "kill":
        tone(880, "square", 0.22, 0.08, 1320);
        break;
      case "shieldbreak":
        tone(300, "sawtooth", 0.3, 0.25, 80);
        noise(0.2, 0.2, 4000);
        break;
      case "shielddown":
        tone(200, "sine", 0.25, 0.3, 90);
        break;
      case "reload":
        tone(400, "square", 0.12, 0.05, 250);
        setTimeout(() => tone(500, "square", 0.12, 0.05, 300), 120);
        break;
      case "jump":
        tone(300, "sine", 0.15, 0.12, 600);
        break;
      case "lift":
        tone(200, "sine", 0.3, 0.4, 900);
        break;
      case "pickup":
        tone(600, "triangle", 0.2, 0.1, 1000);
        tone(900, "triangle", 0.15, 0.15, 1400);
        break;
      case "spawn":
        tone(400, "sine", 0.18, 0.25, 800);
        break;
      case "damage": // taking damage
        tone(160, "sawtooth", 0.25, 0.12, 80);
        break;
      case "death":
        tone(220, "sawtooth", 0.3, 0.5, 60);
        break;
      case "ui":
        tone(660, "square", 0.12, 0.05, 880);
        break;
      case "ui2":
        tone(440, "square", 0.1, 0.05, 330);
        break;
      case "countdown":
        tone(440, "square", 0.2, 0.15);
        break;
      case "go":
        tone(660, "square", 0.25, 0.3, 990);
        break;
      case "splatter":
        noise(0.22, 0.7, 1400);
        tone(90, "sawtooth", 0.4, 0.22, 45);
        break;
      case "honk":
        tone(420, "square", 0.3, 0.18, 400);
        setTimeout(() => tone(330, "square", 0.3, 0.22, 320), 90);
        break;
      case "skull":
        tone(110, "sawtooth", 0.4, 0.6, 55);
        tone(220, "sine", 0.2, 0.5, 110);
        break;
      case "confetti":
        tone(880, "triangle", 0.18, 0.1, 1600);
        setTimeout(() => tone(1320, "triangle", 0.15, 0.1, 1980), 70);
        setTimeout(() => tone(1760, "triangle", 0.12, 0.1, 2200), 140);
        break;
    }
  }

  announce(text: string) {
    if (!this.announcerOn || this.muted) return;
    const now = performance.now();
    if (now - this.lastAnnounce < 350) return;
    this.lastAnnounce = now;
    this.sfx("kill");
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      const style = this.announcerStyle;
      u.rate = style === "infomercial" ? 1.3 : style === "manager" ? 0.92 : 1.02;
      u.pitch = style === "infomercial" ? 1.3 : style === "manager" ? 0.5 : 0.7;
      u.volume = this.muted ? 0 : Math.min(1, this.volume + 0.2);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }
}

let _audio: AudioEngine | null = null;
export function getAudio(): AudioEngine {
  if (!_audio) _audio = new AudioEngine();
  return _audio;
}
