/* ============ AUDIO MAP — sampled SFX from assets/super (v2, stutter fix) ============
   Every gameplay/UI sound is a real WAV from assets/super, decoded ONCE into
   an AudioBuffer and played through the shared WebAudio mixer.

   What was wrong before (the "sound atakta hai" bug):
     1. The WAVs were fetched at boot but only decoded if the fetch finished
        BEFORE the first click. Anything that arrived later stayed undecoded
        forever, so the game silently fell back to the synth for those keys —
        a random mix of samples and beeps.
     2. A throttled / voice-capped sample ALSO fell back to the synth, so rapid
        hits played a burst of oscillators on top of the samples (crackle,
        clipping, stalls on mobile).
     3. The same file was fetched once per alias (dozens of duplicate
        requests); decoding ran sequentially on the main thread.
     4. The legacy HTMLAudio "sample" path (assets/kenney/*.ogg) restarted
        <audio> elements with currentTime=0, which hitches on many browsers.

   Now: unique files are fetched once, decoded in parallel as soon as a
   context exists (no matter when the fetch lands), variants + tiny pitch
   jitter avoid machine-gun repetition, and the synth is used ONLY when a
   sample genuinely cannot be decoded. */
(function () {
  const A = NR.audio;
  const M = (NR.audioMap = { bank: {}, ready: false, loaded: 0, total: 0, failed: [] });

  /* key -> [files (variants), volume, minGapMs, pitchJitter] */
  const FILES = {
    /* ---------- UI ---------- */
    uiClick:      [["UI/select_1.wav"], 0.45],
    uiHover:      [["UI/sci_fi_hover.wav"], 0.22, 60],
    uiConfirm:    [["UI/sci_fi_confirm.wav"], 0.45],
    uiError:      [["UI/sci_fi_error.wav"], 0.5],
    uiToggleOn:   [["UI/toggle_on.wav"], 0.4],
    uiToggleOff:  [["UI/toggle_off.wav"], 0.4],
    uiCancel:     [["UI/sci_fi_cancel.wav"], 0.4],
    uiWarning:    [["UI/synth_warning.wav"], 0.45],
    loading:      [["UI/synth_process_complete.wav"], 0.35],
    ui:           [["UI/select_1.wav", "UI/select_2.wav"], 0.38, 50],
    deny:         [["UI/sci_fi_disallow.wav"], 0.5],
    /* ---------- economy / rewards ---------- */
    purchase:     [["Items/coins_gather_medium.wav"], 0.55],
    coin:         [["Retro/coin.wav", "Retro/coin_2.wav", "Retro/coin_3.wav"], 0.42, 55, 0.04],
    reward:       [["Items/gem_collect.wav"], 0.5],
    equip:        [["Weapons/weapon_equip.wav"], 0.5],
    unequip:      [["Weapons/weapon_unequip.wav"], 0.45],
    heroSelect:   [["Musical Effects/8_bit_chime_positive.wav"], 0.45],
    levelComplete:[["Musical Effects/8_bit_level_complete.wav"], 0.5],
    waveComplete: [["Musical Effects/brass_chime_quick.wav"], 0.45],
    lobby:        [["Musical Effects/8_bit_inn.wav"], 0.32],
    socialNotify: [["Musical Effects/vibraphone_chime_quick.wav"], 0.4],
    applause:     [["Other/applause.wav"], 0.35],
    powerUp:      [["Retro/power_up.wav"], 0.45],
    upgrade:      [["Weapons/weapon_upgrade.wav"], 0.5],
    pickup:       [["Items/heart_collect.wav"], 0.42, 60],
    orb:          [["Items/coin_collect.wav"], 0.3, 45, 0.06],
    ring:         [["Musical Effects/8_bit_chime_quick.wav"], 0.32],
    /* ---------- bosses ---------- */
    bossIntro:    [["Machines/industrial_door_close.wav"], 0.65],
    bossAttack:   [["Machines/hydraulic_down.wav"], 0.5],
    bossDefeat:   [["Retro/explosion_large.wav"], 0.65],
    roar:         [["Retro/grow_big.wav"], 0.5],
    slam:         [["Machines/hydraulic_down.wav"], 0.5],
    /* ---------- hero combat verbs ---------- */
    heroAttack:       [["Weapons/sword_light.wav"], 0.45, 70, 0.05],
    heroAttackSamurai:[["Weapons/sword_slice.wav"], 0.5, 70, 0.05],
    heroAttackHeavy:  [["Weapons/harsh_thud.wav"], 0.55, 70, 0.04],
    heroAttackFire:   [["Environment/fire_lighting.wav"], 0.45],
    heroAttackGhost:  [["Other/whoosh_1.wav"], 0.4],
    heroAttackRanged: [["Retro/throw.wav"], 0.45, 70, 0.05],
    heroAbilityKaito:   [["Weapons/sword_clash.wav"], 0.5],
    heroAbilitySamurai: [["Weapons/sword_unsheath.wav"], 0.55],
    heroAbilityTank:    [["Combat and Gore/kick.wav"], 0.55],
    heroAbilityFire:    [["Environment/fire_lighting.wav"], 0.5],
    heroAbilityGhost:   [["Other/ghost_long.wav"], 0.35],
    heroAbilityRanged:  [["Retro/throw.wav"], 0.5],
    heroAbilityBrute:   [["Combat and Gore/punch_3.wav"], 0.55],
    heroAbilityStorm:   [["Environment/air_burst.wav"], 0.5],
    heroAbilityAssassin:[["Combat and Gore/crunch_quick.wav"], 0.5],
    swordSwipe:  [["Combat and Gore/swipe.wav"], 0.42, 70, 0.06],
    swordSlice:  [["Weapons/sword_slice.wav"], 0.5, 70, 0.05],
    swordSheath: [["Weapons/sword_unsheath.wav"], 0.55],
    swordClash:  [["Weapons/sword_clash.wav", "Weapons/sword_clash_2.wav"], 0.5],
    sukunaCue:   [["Weapons/sword_unsheath.wav"], 0.7],
    swing:     [["Combat and Gore/swipe.wav"], 0.38, 60, 0.07],
    swing2:    [["Weapons/sword_light.wav"], 0.42, 60, 0.07],
    swing3:    [["Weapons/sword_slice.wav"], 0.48, 60, 0.05],
    parry:     [["Weapons/sword_clash.wav", "Weapons/sword_clash_2.wav"], 0.55],
    guard:     [["Weapons/sword_clash_2.wav"], 0.4],
    kunai:     [["Retro/throw.wav"], 0.42, 60, 0.06],
    dash:      [["Other/whoosh_1.wav", "Other/whoosh_2.wav"], 0.45],
    jump:      [["Retro/jump_short.wav"], 0.3, 80, 0.04],
    djump:     [["Retro/jump.wav"], 0.3, 80, 0.04],
    land:      [["Footsteps/foley_footstep_gravel_1.wav", "Footsteps/foley_footstep_gravel_2.wav"], 0.3, 120],
    step:      [["Footsteps/foley_footstep_concrete_1.wav", "Footsteps/foley_footstep_concrete_2.wav",
                 "Footsteps/foley_footstep_concrete_3.wav", "Footsteps/foley_footstep_concrete_4.wav"], 0.16, 150, 0.05],
    footstep:  [["Footsteps/foley_footstep_concrete_1.wav", "Footsteps/foley_footstep_concrete_3.wav"], 0.16, 150, 0.05],
    storm:     [["Retro/explosion_quick.wav"], 0.55],
    /* ---------- enemies / impacts ---------- */
    enemyAttack: [["Combat and Gore/swipe.wav"], 0.3, 90, 0.08],
    enemyHit:    [["Combat and Gore/punch.wav", "Combat and Gore/punch_2.wav", "Combat and Gore/punch_3.wav"], 0.38, 45, 0.06],
    hit:         [["Combat and Gore/punch.wav", "Combat and Gore/punch_2.wav", "Combat and Gore/punch_3.wav"], 0.38, 45, 0.06],
    hitCrit:     [["Combat and Gore/crunch_quick.wav"], 0.45, 60, 0.04],
    enemyDie:    [["Combat and Gore/crunch_splat.wav", "Combat and Gore/splat_quick.wav"], 0.34, 60, 0.06],
    kill:        [["Combat and Gore/crunch_splat.wav", "Combat and Gore/splat_quick.wav"], 0.34, 60, 0.06],
    hurt:        [["Retro/hurt.wav"], 0.5, 120],
    pdie:        [["Musical Effects/8_bit_defeated.wav"], 0.55],
    explode:     [["Retro/explosion_medium.wav"], 0.55],
    explosion:   [["Retro/explosion_medium.wav"], 0.55],
    shot:        [["Weapons/shot_muffled.wav"], 0.3, 80, 0.06],
    boltHit:     [["Materials/metal_blunt_tap.wav"], 0.3, 60, 0.08],
    warn:        [["UI/synth_warning.wav"], 0.42],
    thunder:     [["Environment/air_burst.wav"], 0.25],
    wave:        [["Musical Effects/synth_bass_level_start.wav"], 0.45],
    /* ---------- legacy "sample" names (were HTMLAudio kenney .ogg) ---------- */
    checkpoint:  [["Retro/power_up_2.wav"], 0.5],
    cache:       [["Items/coins_gather_quick.wav"], 0.5],
    shard:       [["Items/gem_collect.wav"], 0.45, 60],
    sentry:      [["Weapons/shot_muffled.wav"], 0.32, 90],
    gate:        [["Machines/industrial_door_open.wav"], 0.5],
    clear:       [["Materials/cardboard_tear.wav"], 0.45],
    victory:     [["Musical Effects/brass_level_complete.wav"], 0.55],
    achievement: [["Musical Effects/brass_chime_positive.wav"], 0.5],
    /* ---------- WAVE CLIMB / SURVIVAL RUN / online ---------- */
    gateOpen:    [["Machines/industrial_door_open.wav"], 0.55],
    floorUp:     [["Musical Effects/brass_level_start.wav"], 0.5],
    checkpointReach: [["Retro/power_up_2.wav"], 0.5],
    pitFall:     [["Retro/fall_quick.wav"], 0.5],
    countdown:   [["Environment/clock_tick_only.wav"], 0.45],
    matchFound:  [["UI/synth_confirmation.wav"], 0.55],
    searching:   [["UI/sci_fi_hover_high.wav"], 0.3, 400],
    netError:    [["UI/synth_error.wav"], 0.5],
    pvpKill:     [["Musical Effects/8_bit_chime_positive.wav"], 0.5],
    pvpWin:      [["Musical Effects/8_bit_positive_long.wav"], 0.55],
    pvpLose:     [["Musical Effects/8_bit_negative_long.wav"], 0.5],
    revive:      [["Musical Effects/harpsichord_chime_positive.wav"], 0.5],
    chestOpen:   [["Environment/creaky_door_short.wav"], 0.45],
  };
  M.FILES = FILES;

  const PATH = (p) => "assets/super/" + p.split("/").map(encodeURIComponent).join("/");
  const buffers = Object.create(null);   // path -> AudioBuffer
  const raws = Object.create(null);      // path -> ArrayBuffer (not yet decoded)
  let ctxRef = null, decoding = null;

  function uniquePaths() {
    const s = new Set();
    for (const k of Object.keys(FILES)) for (const f of FILES[k][0]) s.add(f);
    return [...s];
  }
  M.paths = uniquePaths;

  function decodeOne(ctx, path) {
    const raw = raws[path];
    if (!raw || buffers[path]) return Promise.resolve();
    delete raws[path];
    return new Promise((resolve) => {
      const ok = (b) => { buffers[path] = b; resolve(); };
      const bad = () => { M.failed.push(path); resolve(); };
      try {
        const pr = ctx.decodeAudioData(raw, ok, bad);
        if (pr && typeof pr.then === "function") pr.then(ok, bad);
      } catch (_) { bad(); }
    });
  }
  function rebuildBank() {
    M.bank = {};
    for (const k of Object.keys(FILES)) {
      const variants = FILES[k][0].map((f) => buffers[f]).filter(Boolean);
      if (variants.length) M.bank[k] = { bufs: variants, buf: variants[0], vol: FILES[k][1] };
    }
    M.ready = Object.keys(M.bank).length > 0;
  }

  /* fetch every unique file once (safe in Node tests: no fetch → stays off) */
  M.load = async function (ctx) {
    if (ctx) ctxRef = ctx;
    if (M._loading) return M._loading;
    if (typeof fetch !== "function") return;
    const paths = uniquePaths();
    M.total = paths.length;
    M._loading = Promise.all(paths.map(async (p) => {
      try {
        const res = await fetch(PATH(p));
        if (!res.ok) throw new Error("HTTP " + res.status);
        raws[p] = await res.arrayBuffer();
      } catch (e) {
        M.failed.push(p);
        NR.diag?.warn(`audio sample missing: ${p} (${e.message})`);
      } finally { M.loaded++; }
    })).then(() => {
      // FIX: decode whatever arrived, even if the context was created first
      const c = ctxRef || A._ctx;
      if (c) return M.decode(c);
    });
    return M._loading;
  };

  /* decode all pending raw buffers (parallel, idempotent) */
  M.decode = async function (ctx) {
    if (!ctx) return;
    ctxRef = ctx;
    const pending = Object.keys(raws);
    if (!pending.length) { rebuildBank(); return; }
    const run = Promise.all(pending.map((p) => decodeOne(ctx, p))).then(rebuildBank);
    decoding = run;
    await run;
    if (M.ready) NR.diag?.info(`audio map ready: ${Object.keys(M.bank).length}/${Object.keys(FILES).length} keys, ${Object.keys(buffers).length} buffers`);
  };

  /* ---------- pooled playback ---------- */
  const lastPlay = Object.create(null);
  const lastVariant = Object.create(null);
  const active = [];           // {src, key, t}
  const MAX_VOICES = 16, PER_KEY = 3;
  const LOW_PRIORITY = { step: 1, footstep: 1, orb: 1, uiHover: 1, boltHit: 1, land: 1 };

  function release(v) { const i = active.indexOf(v); if (i >= 0) active.splice(i, 1); }
  function stopVoice(v) { try { v.src.stop(); } catch (_) {} release(v); }

  /* returns "ok" | "busy" (throttled — stay silent) | "missing" (use fallback) */
  M.play = function (key, ctx, dest, opt) {
    if (!A || !A.ready || !A.sfxOn || A.muted) return "busy";
    const b = M.bank[key];
    ctx = ctx || A._ctx;
    if (!b || !ctx) return "missing";
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (_) {} }
    const def = FILES[key];
    const now = performance.now();
    const gap = def[2] || 70;
    if (now - (lastPlay[key] || 0) < gap) return "busy";
    if (LOW_PRIORITY[key] && active.length >= MAX_VOICES - 6) return "busy";
    // per-key polyphony: steal the oldest voice of the same sound
    const same = active.filter((v) => v.key === key);
    if (same.length >= PER_KEY) stopVoice(same[0]);
    // global cap: steal the oldest low-priority, else the oldest voice
    if (active.length >= MAX_VOICES) {
      const victim = active.find((v) => LOW_PRIORITY[v.key]) || active[0];
      if (victim) stopVoice(victim);
    }
    lastPlay[key] = now;
    try {
      let idx = 0;
      if (b.bufs.length > 1) {
        idx = (Math.random() * b.bufs.length) | 0;
        if (idx === lastVariant[key]) idx = (idx + 1) % b.bufs.length;
        lastVariant[key] = idx;
      }
      const src = ctx.createBufferSource();
      src.buffer = b.bufs[idx];
      const jitter = def[3] || 0;
      if (jitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
      const g = ctx.createGain();
      g.gain.value = b.vol * ((opt && opt.vol) || 1);
      src.connect(g); g.connect(dest || A._sfxGain || ctx.destination);
      const v = { src, key, t: now };
      src.onended = () => { release(v); try { g.disconnect(); } catch (_) {} };
      active.push(v);
      src.start(ctx.currentTime + ((opt && opt.delay) || 0));
      return "ok";
    } catch (e) { return "missing"; }
  };
  M.voices = () => active.length;
  M.has = (key) => !!M.bank[key];

  /* ---------- integrate with the synth engine ----------
     A.play(name): sample first; synth ONLY if the sample is unavailable. */
  const origPlay = A.play;
  A.play = function (name, opt) {
    if (!A.ready || !A.sfxOn || A.muted) return;
    const r = M.play(name, A._ctx, null, opt);
    if (r === "missing") origPlay(name, opt);
  };
  /* legacy A.sample(name) now uses the same decoded buffers (no HTMLAudio) */
  A.sample = function (name) { A.play(name); };

  /* the context is created on the first gesture — decode right away */
  const origInit = A.init;
  A.init = function () {
    const wasReady = A.ready;
    origInit.call(A);
    if (A.ready && !wasReady && A._ctx) {
      ctxRef = A._ctx;
      if (!M._loading) M.load(A._ctx); else M.decode(A._ctx);
    }
  };
  M.attach = function (ctx, sfxGain) { A._ctx = ctx; A._sfxGain = sfxGain; M.decode(ctx); };
})();
