class AudioSynthesizer {
  private static ctx: AudioContext | null = null;
  private static activeDialOscs: OscillatorNode[] = [];
  private static dialInterval: any = null;

  private static getContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.ctx = new AudioContextClass();
    }
    return this.ctx;
  }

  static playDialTone() {
    const ctx = this.getContext();
    if (!ctx) return;
    
    this.stopDialTone();
    
    let active = true;
    const playPulse = () => {
      if (!active) return;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.value = 350;
      osc2.frequency.value = 440;
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 1.0);
      osc2.stop(ctx.currentTime + 1.0);
      
      this.activeDialOscs = [osc1, osc2];
    };

    playPulse();
    this.dialInterval = setInterval(playPulse, 2000);
  }

  static stopDialTone() {
    if (this.dialInterval) {
      clearInterval(this.dialInterval);
      this.dialInterval = null;
    }
    this.activeDialOscs.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.activeDialOscs = [];
  }

  static playConnectionChime() {
    this.stopDialTone();
    const ctx = this.getContext();
    if (!ctx) return;

    const frequencies = [523.25, 659.25, 783.99, 1046.50];
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      
      const time = ctx.currentTime + idx * 0.08;
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + 0.35);
    });
  }

  static playHangupChime() {
    this.stopDialTone();
    const ctx = this.getContext();
    if (!ctx) return;

    const frequencies = [783.99, 659.25, 523.25];
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      
      const time = ctx.currentTime + idx * 0.1;
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(0.04, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + 0.4);
    });
  }
}

export default AudioSynthesizer;
