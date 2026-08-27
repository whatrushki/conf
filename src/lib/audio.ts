export class SoundSynthesizer {
  ctx: AudioContext | null = null;
  enabled: boolean = true;
  volume: number = 0.5;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.3) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) { }
  }

  join() {
    this.playTone(523.25, 0.12, 'sine', 0.25);
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.25), 90);
    setTimeout(() => this.playTone(783.99, 0.25, 'sine', 0.3), 180);
  }

  leave() {
    this.playTone(659.25, 0.12, 'sine', 0.2);
    setTimeout(() => this.playTone(440.0, 0.2, 'sine', 0.2), 100);
  }

  chat() {
    this.playTone(880, 0.08, 'triangle', 0.2);
    setTimeout(() => this.playTone(1174.66, 0.12, 'sine', 0.25), 50);
  }

  hand() {
    this.playTone(1046.5, 0.3, 'sine', 0.35);
  }

  reaction() {
    this.playTone(587.33, 0.1, 'sine', 0.15);
  }

  click() {
    this.playTone(400, 0.04, 'square', 0.05);
  }

  kick() {
    this.playTone(300, 0.2, 'sawtooth', 0.3);
    setTimeout(() => this.playTone(200, 0.3, 'sawtooth', 0.3), 130);
  }
}

export const soundFx = new SoundSynthesizer();

export class LocalVoiceDetector {
  ctx: AudioContext | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  analyser: AnalyserNode | null = null;
  animFrame: number | null = null;
  isSpeaking: boolean = false;
  silenceTimer: any = null;
  onSpeakingChange?: (isSpeaking: boolean) => void;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  start(stream: MediaStream, isMicOn: boolean) {
    this.stop();
    if (!stream || stream.getAudioTracks().length === 0) return;
    this.init();
    if (!this.ctx) return;

    try {
      this.source = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      this.source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.frequencyBinCount);

      const loop = () => {
        if (!isMicOn) {
          if (this.isSpeaking) this._setSpeaking(false);
          this.animFrame = requestAnimationFrame(loop);
          return;
        }

        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;

        if (avg > 14) {
          if (!this.isSpeaking) this._setSpeaking(true);
          if (this.silenceTimer) clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => this._setSpeaking(false), 350);
        }
        this.animFrame = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      console.warn('VAD Error', e);
    }
  }

  _setSpeaking(state: boolean) {
    this.isSpeaking = state;
    if (this.onSpeakingChange) this.onSpeakingChange(state);
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.source) {
      try { this.source.disconnect(); } catch (e) { }
      this.source = null;
    }
    this._setSpeaking(false);
  }
}

export const localVAD = new LocalVoiceDetector();

export function unlockAudioEngine() {
  soundFx.init();
  localVAD.init();
}
