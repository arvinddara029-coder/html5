/* ============ NEON RONIN — synthesized audio: SFX + synthwave music ============ */
(function () {
  const A = (NR.audio = { ready: false, muted: false, musicOn: true, sfxOn: true });
  let ctx = null, master, sfxG, musG, delay, noiseBuf;

  /* ---------- boot (must be called from a user gesture) ---------- */
  A.init = function () {
    if (A.ready) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 9; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.gain.value = A.sfxOn ? 1.2 * NR.profile.sfxVolume : 0; sfxG.connect(master);
    musG = ctx.createGain(); musG.gain.value = A.musicOn ? 0.84 * NR.profile.musicVolume : 0; musG.connect(master);
    // shared echo for arps / UI shimmer
    delay = ctx.createDelay(1); delay.delayTime.value = 0.286;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dOut = ctx.createGain(); dOut.gain.value = 0.5;
    delay.connect(fb); fb.connect(delay); delay.connect(dOut); dOut.connect(musG);
    // white-noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.ready = true;
    // expose the graph for the sampled audio map (assets/super bank)
    A._ctx = ctx; A._sfxGain = sfxG; A._musGain = musG; A._masterGain = master;
    if (NR.audioMap) NR.audioMap.decode(ctx).catch(() => {});
    A.setVolumes();
    startMusic();
  };

  /* Platform requirement: silence the game completely while a video ad plays,
     then restore the previous mix. */
  A.muteAll = function (mute, restoreAudible) {
    if (!ctx || !master) return;
    try {
      if (mute) {
        A._preMute = master.gain.value;
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      } else {
        master.gain.setTargetAtTime(A._preMute !== undefined ? A._preMute : 0.9, ctx.currentTime, 0.05);
        A._preMute = undefined;
      }
    } catch (_) {}
  };

  A.toggleMusic = function (v) { A.musicOn = v; if (musG) musG.gain.setTargetAtTime(v ? 0.84 * NR.profile.musicVolume : 0, ctx.currentTime, 0.05); };
  A.toggleSfx = function (v) { A.sfxOn = v; if (sfxG) sfxG.gain.setTargetAtTime(v ? 1.2 * NR.profile.sfxVolume : 0, ctx.currentTime, 0.03); };
  A.duck = function (amt = 0.25, rel = 0.6) { // duck music briefly (big moments)
    if (!A.ready) return;
    musG.gain.cancelScheduledValues(ctx.currentTime);
    musG.gain.setValueAtTime(A.musicOn ? amt : 0, ctx.currentTime);
    musG.gain.linearRampToValueAtTime(A.musicOn ? 0.84 * NR.profile.musicVolume : 0, ctx.currentTime + rel);
  };

  const sampleFiles = {checkpoint:'powerUp1',cache:'powerUp4',shard:'highUp',sentry:'laser3',gate:'lowDown',clear:'zap1',victory:'phaseJump1',achievement:'zap2'};
  const samplePools = {}, sampleLast = {};
  A.sample = function(name) {
    if(!A.ready || !A.sfxOn || A.muted || !sampleFiles[name])return;
    const now=performance.now();
    if(now-(sampleLast[name]||0)<90)return; sampleLast[name]=now;
    const pool=samplePools[name]||(samplePools[name]=Array.from({length:3},()=>new Audio('assets/kenney/'+sampleFiles[name]+'.ogg')));
    const clip=pool.find(a=>a.paused||a.ended);if(!clip)return;
    clip.volume=NR.profile.sfxVolume*.55;clip.currentTime=0;
    clip.play().catch(()=>A.play('pickup'));
  };
  A.setVolumes = function(){
    if(musG)musG.gain.setTargetAtTime(A.musicOn ? 0.84*NR.profile.musicVolume : 0,ctx.currentTime,.05);
    if(sfxG)sfxG.gain.setTargetAtTime(A.sfxOn?1.2*NR.profile.sfxVolume:0,ctx.currentTime,.05);
    Object.values(samplePools).flat().forEach(a=>{a.volume=A.sfxOn?NR.profile.sfxVolume*.55:0;});
  };
  // Samples and synth buses share the same mute controls.
  const toggleSfx=A.toggleSfx;
  A.toggleSfx=function(v){toggleSfx(v);A.setVolumes();};

  /* ---------- tiny synth helpers ---------- */
  function env(g, t, a, peak, dec, sus = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
  }
  function tone(o) { // {type,f0,f1,t,dur,vol,filter?,fType,fF0,fF1,dest,bendT}
    const t = o.t, dur = o.dur || 0.3;
    const osc = ctx.createOscillator(); osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t + (o.bendT || dur));
    const g = ctx.createGain(); env(g, t, o.a || 0.004, o.vol || 0.2, dur);
    let node = osc;
    if (o.ff) { const f = ctx.createBiquadFilter(); f.type = o.ft || "lowpass"; f.frequency.setValueAtTime(o.ff, t); if (o.ff1) f.frequency.exponentialRampToValueAtTime(Math.max(o.ff1, 10), t + dur); f.Q.value = o.q || 1; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || sfxG);
    if (o.echo && delay) { const s = ctx.createGain(); s.gain.value = o.echo; g.connect(s); s.connect(delay); }
    osc.start(t); osc.stop(t + dur + 0.1);
  }
  function noise(o) { // {t,dur,vol,ft,ff,ff1,q,dest}
    const t = o.t, dur = o.dur || 0.3;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter(); f.type = o.ft || "lowpass";
    f.frequency.setValueAtTime(o.ff || 2000, t);
    if (o.ff1) f.frequency.exponentialRampToValueAtTime(Math.max(o.ff1, 10), t + dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain(); env(g, t, o.a || 0.003, o.vol || 0.2, dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxG);
    src.start(t); src.stop(t + dur + 0.1);
  }

  /* ---------- SFX bank ---------- */
  const SFX = {
    guard(t){tone({t,type:"triangle",f0:650,f1:1100,dur:.08,vol:.09});},
    parry(t){[1300,1900,2600].forEach(f=>tone({t,type:"sine",f0:f,f1:f*.7,dur:.25,vol:.1}));noise({t,dur:.07,vol:.2,ff:4500});},
    kunai(t){noise({t,dur:.12,vol:.16,ff:3200,ff1:900});tone({t,type:"triangle",f0:950,f1:280,dur:.1,vol:.07});},
    step(t) { noise({t,dur:.045,vol:.04,ff:240,ff1:65}); },
    land(t) { noise({t,dur:.11,vol:.085,ff:400,ff1:90}); },
    swing(t) { noise({ t, dur: 0.16, vol: 0.22, ft: "bandpass", ff: 480, ff1: 3400, q: 1.6 }); },
    swing2(t) { noise({ t, dur: 0.18, vol: 0.24, ft: "bandpass", ff: 3200, ff1: 420, q: 1.6 }); },
    swing3(t) { noise({ t, dur: 0.3, vol: 0.3, ft: "bandpass", ff: 300, ff1: 4200, q: 1.2 }); tone({ t, type: "sawtooth", f0: 160, f1: 60, dur: 0.22, vol: 0.12 }); },
    hit(t) { noise({ t, dur: 0.12, vol: 0.32, ff: 2400, ff1: 200 }); tone({ t, type: "square", f0: 180, f1: 60, dur: 0.12, vol: 0.22 }); },
    hitCrit(t) { noise({ t, dur: 0.16, vol: 0.34, ff: 4200, ff1: 300 }); tone({ t, type: "square", f0: 1300, f1: 500, dur: 0.14, vol: 0.16 }); tone({ t, type: "square", f0: 190, f1: 55, dur: 0.16, vol: 0.24 }); },
    kill(t) { noise({ t, dur: 0.5, vol: 0.38, ff: 1400, ff1: 60 }); tone({ t, type: "sine", f0: 110, f1: 30, dur: 0.45, vol: 0.4 }); },
    explode(t) { noise({ t, dur: 0.8, vol: 0.5, ff: 2200, ff1: 50 }); tone({ t, type: "sine", f0: 90, f1: 24, dur: 0.7, vol: 0.5 }); },
    jump(t) { tone({ t, type: "square", f0: 280, f1: 640, dur: 0.13, vol: 0.12 }); },
    djump(t) { tone({ t, type: "square", f0: 420, f1: 980, dur: 0.15, vol: 0.12 }); tone({ t: t + 0.04, type: "sine", f0: 1400, dur: 0.08, vol: 0.06 }); },
    dash(t) { noise({ t, dur: 0.24, vol: 0.26, ft: "highpass", ff: 900, ff1: 3800 }); },
    hurt(t) { tone({ t, type: "sawtooth", f0: 240, f1: 70, dur: 0.26, vol: 0.3 }); noise({ t, dur: 0.2, vol: 0.24, ff: 1800, ff1: 200 }); },
    pdie(t) { tone({ t, type: "sawtooth", f0: 300, f1: 40, dur: 1.1, vol: 0.34 }); noise({ t, dur: 1.2, vol: 0.4, ff: 2600, ff1: 60 }); },
    shot(t) { tone({ t, type: "sawtooth", f0: 980, f1: 210, dur: 0.13, vol: 0.14 }); },
    boltHit(t) { noise({ t, dur: 0.09, vol: 0.18, ff: 3200, ff1: 400 }); },
    pickup(t) { tone({ t, type: "sine", f0: 660, dur: 0.1, vol: 0.16 }); tone({ t: t + 0.07, type: "sine", f0: 990, dur: 0.14, vol: 0.16 }); },
    orb(t) { tone({ t, type: "triangle", f0: 520, f1: 760, dur: 0.09, vol: 0.12 }); },
    ui(t) { tone({ t, type: "square", f0: 800, dur: 0.05, vol: 0.08 }); },
    upgrade(t) { [523, 659, 784, 1046].forEach((f, i) => tone({ t: t + i * 0.07, type: "triangle", f0: f, dur: 0.22, vol: 0.14, echo: 0.5 })); },
    wave(t) { tone({ t, type: "sawtooth", f0: 110, f1: 220, dur: 0.5, vol: 0.16, ff: 900, echo: 0.4 }); tone({ t: t + 0.02, type: "sawtooth", f0: 165, f1: 330, dur: 0.5, vol: 0.1, ff: 900 }); },
    roar(t) { [58, 61, 64].forEach((f) => tone({ t, type: "sawtooth", f0: f, f1: f * 0.7, dur: 1.3, vol: 0.2, ff: 500 })); noise({ t, dur: 1.3, vol: 0.3, ff: 700, ff1: 90, q: 2 }); },
    slam(t) { tone({ t, type: "sine", f0: 70, f1: 22, dur: 0.6, vol: 0.55 }); noise({ t, dur: 0.5, vol: 0.4, ff: 900, ff1: 60 }); },
    thunder(t) { noise({ t, dur: 1.6, vol: 0.075, ff: 400, ff1: 60, a: 0.05 }); noise({ t: t + 0.15, dur: 0.9, vol: 0.04, ff: 900, ff1: 120 }); },
    storm(t) { noise({ t, dur: 0.5, vol: 0.3, ft: "highpass", ff: 400, ff1: 5000, a: 0.3 }); tone({ t: t + 0.42, type: "sawtooth", f0: 60, f1: 240, dur: 0.5, vol: 0.3 }); noise({ t: t + 0.42, dur: 0.7, vol: 0.4, ff: 3000, ff1: 80 }); },
    ring(t) { tone({ t, type: "sine", f0: 1200, f1: 300, dur: 0.18, vol: 0.1, echo: 0.4 }); },
    warn(t) { tone({ t, type: "square", f0: 520, dur: 0.09, vol: 0.1 }); tone({ t: t + 0.14, type: "square", f0: 520, dur: 0.09, vol: 0.1 }); },
  };
  A.play = function (name, opt) {
    if (!A.ready || !A.sfxOn || A.muted) return;
    const fn = SFX[name]; if (!fn) return;
    try { fn(ctx.currentTime + ((opt && opt.delay) || 0)); } catch (e) { /* ignore */ }
  };

  /* ---------- MUSIC: 4-bar synthwave loop, 16th-note sequencer ---------- */
  const BPM = 118, STEP = 60 / BPM / 4, midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  //        Am            F             C             G
  const PROG = [
    { root: 33, tri: [57, 60, 64] },
    { root: 29, tri: [53, 57, 60] },
    { root: 36, tri: [55, 60, 64] },
    { root: 31, tri: [55, 59, 62] },
  ];
  const BASS = [0, -1, 0, -1, 12, -1, 0, 0, -1, 0, 10, -1, 12, -1, 7, -1]; // semitone offsets (-1 = rest)

  /* ---- TWO music modes ----
     "menu": the original airy synthwave (pads + arp, no drums)
     "battle": a darker, driving combat loop — different progression,
     4-on-the-floor kick, offbeat bass stabs and a rhythmic lead riff.
     The player asked for a different track during gameplay; both remain
     fully synthesized (zero asset load) and share the mixer. */
  const BATTLE_PROG = [
    { root: 28, tri: [52, 55, 59] },  // Em
    { root: 31, tri: [55, 58, 62] },  // Gm
    { root: 26, tri: [50, 53, 57] },  // Dm
    { root: 33, tri: [52, 56, 59] },  // F#dim-flavoured stab
  ];
  const BATTLE_BASS = [0, -1, 0, 0, -1, 12, -1, 0, 0, -1, 0, 0, -1, 7, -1, 10];
  const BATTLE_LEAD = [12, -1, 15, -1, 19, -1, 15, -1, 12, -1, 10, -1, 12, -1, -1, -1];
  let musicMode = "menu";
  let step = 0, nextT = 0, musicTimer = null;
  A.setMusicMode = function (m) {
    if (musicMode === m) return;
    musicMode = m;
    step = 0; // restart the pattern so the change is audible immediately
    if (A.ready) A.duck(0.12, 0.5);
  };
  A.musicMode = () => musicMode;

  function kick(t) { tone({ t, type: "sine", f0: 150, f1: 38, dur: 0.24, vol: 0.75, dest: musG, a: 0.002 }); }
  function snare(t) { noise({ t, dur: 0.14, vol: 0.3, ft: "bandpass", ff: 1900, q: 1.1, dest: musG }); tone({ t, type: "triangle", f0: 190, f1: 120, dur: 0.09, vol: 0.14, dest: musG }); }
  function hat(t, v) { noise({ t, dur: 0.035, vol: v, ft: "highpass", ff: 6800, dest: musG }); }
  function bass(t, f) { tone({ t, type: "sawtooth", f0: f, dur: 0.2, vol: 0.24, ff: 480, ff1: 140, dest: musG }); tone({ t, type: "sine", f0: f / 2, dur: 0.22, vol: 0.22, dest: musG }); }
  function pad(t, tri) {
    tri.forEach((m) => {
      tone({ t, type: "sawtooth", f0: midi(m), dur: STEP * 16, vol: 0.035, a: 0.5, ff: 850, dest: musG });
      tone({ t, type: "sawtooth", f0: midi(m + 12) * 1.004, dur: STEP * 16, vol: 0.02, a: 0.6, ff: 700, dest: musG });
    });
  }
  function arp(t, m) { tone({ t, type: "triangle", f0: midi(m), dur: 0.14, vol: 0.09, dest: musG, echo: 0.6, ff: 3200 }); }

  function schedStep(s, t) {
    const bar = ((s / 16) | 0) % 4, st = s % 16;
    if (musicMode === "battle") {
      /* driving combat loop: four-on-the-floor, offbeat bass, stab lead */
      const ch = BATTLE_PROG[bar];
      if (st % 4 === 0) kick(t);
      if (st === 4 || st === 12) snare(t);
      if (st % 2 === 1) hat(t, st % 4 === 3 ? 0.1 : 0.06);
      if (st === 14) hat(t, 0.12);
      if (BATTLE_BASS[st] >= 0) bass(t, midi(ch.root + BATTLE_BASS[st]));
      if (st === 0) pad(t, ch.tri);           // darker pad bed
      if (BATTLE_LEAD[st] >= 0) arp(t, midi(ch.root + BATTLE_LEAD[st])); // riff stab
      return;
    }
    const ch = PROG[bar];
    if (st % 4 === 0) kick(t);
    if (st === 4 || st === 12) snare(t);
    if (st % 2 === 1) hat(t, st % 4 === 3 ? 0.12 : 0.07);
    if (st === 14) hat(t, 0.13);
    if (BASS[st] >= 0) bass(t, midi(ch.root + BASS[st]));
    if (st === 0) pad(t, ch.tri);
    // arp: bars 1-3 denser, bar 0 sparse
    if (bar > 0 ? st % 2 === 0 : st === 0 || st === 8) {
      const notes = ch.tri.concat(ch.tri[0] + 12);
      arp(t, notes[(s / 2 | 0) % notes.length] + 12);
    }
  }
  function startMusic() {
    if (musicTimer || !ctx) return;
    step = 0; nextT = ctx.currentTime + 0.06;
    musicTimer = setInterval(() => {
      if (!A.ready) return;
      while (nextT < ctx.currentTime + 0.14) {
        schedStep(step, nextT);
        step = (step + 1) % 64;
        nextT += STEP;
      }
    }, 30);
  }
})();
