// Imported CC0 engine loop by domasx2; Web Audio layers add speed-responsive feedback.
export class AudioEngine {
  constructor() {
    this.muted = false;
    this.volume = 0.55;
    this.ready = false;
    this.running = false;
  }
  async init() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.context.destination);
    try {
      const response = await fetch("/audio/engine.wav");
      if (!response.ok) throw new Error("Engine audio unavailable");
      this.engineBuffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      const source = this.context.createBufferSource();
      source.buffer = this.engineBuffer;
      source.loop = true;
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      source.connect(this.engineGain).connect(this.master);
      source.start();
      this.engine = source;
      this.ready = true;
    } catch (error) {
      console.warn(error);
    }
    const noise = this.context.createBuffer(
        1,
        this.context.sampleRate * 2,
        this.context.sampleRate,
      ),
      data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.effects = {};
    await Promise.all(
      ["impact", "nitro"].map(async (name) => {
        try {
          const r = await fetch("/audio/" + name + ".ogg");
          this.effects[name] = await this.context.decodeAudioData(
            await r.arrayBuffer(),
          );
        } catch (e) {
          console.warn("Optional audio unavailable:", name);
        }
      }),
    );
    this.noise = noise;
    const wind = this.context.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 450;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0;
    wind.connect(filter).connect(this.windGain).connect(this.master);
    wind.start();
  }
  setMuted(value) {
    this.muted = value;
    if (this.master)
      this.master.gain.setTargetAtTime(
        value ? 0 : this.volume,
        this.context.currentTime,
        0.05,
      );
  }
  setVolume(value) {
    this.volume = value;
    this.setMuted(this.muted);
  }
  update(speed, boost, running) {
    if (!this.ready) return;
    const time = this.context.currentTime;
    this.engine.playbackRate.setTargetAtTime(
      0.65 + (speed % 53) / 65 + speed / 300 + (boost ? 0.28 : 0),
      time,
      0.15,
    );
    this.engineGain.gain.setTargetAtTime(
      running ? 0.65 + speed / 200 : 0,
      time,
      0.2,
    );
    this.windGain?.gain.setTargetAtTime(
      running ? speed / 3400 + (boost ? 0.055 : 0) : 0,
      time,
      0.2,
    );
  }
  tone(freq = 600, duration = 0.1, type = "sine", volume = 0.13) {
    if (!this.context || this.muted) return;
    const time = this.context.currentTime;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.75, time + duration);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(time + duration);
  }
  effect(name, volume = 1) {
    if (!this.context || !this.effects?.[name] || this.muted) return;
    const s = this.context.createBufferSource();
    s.buffer = this.effects[name];
    const g = this.context.createGain();
    g.gain.value = volume;
    s.connect(g).connect(this.master);
    s.start();
  }
  crash() {
    this.effect("impact", 1);
    if (!this.context || !this.noise) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.7, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + 0.5,
    );
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(this.context.currentTime + 0.5);
    this.tone(85, 0.35, "sawtooth", 0.3);
  }
  nearMiss() {
    this.tone(830, 0.12, "sine", 0.1);
    setTimeout(() => this.tone(1250, 0.13, "sine", 0.1), 80);
  }
}
