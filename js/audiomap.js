/* ============ PRODUCTION PASS — audio replacement from assets/super ============
   Replaces the temporary/incorrect sound set with the correct existing
   repository assets. One semantic audio map:
     menu click · hover · purchase · equip · hero select · hero attacks (per
     hero) · hero abilities (per hero) · enemy attack/hit · boss intro/attack/
     defeat · level complete · wave complete · reward · coin · UI error ·
     SukunaSlice cue · loading · lobby · social notification · combat verbs
   Implementation: WebAudio AudioBuffers (decoded once, then free to play),
   pooled playback with per-key rate limiting and a global voice cap, volume
   categories routed through the existing mixers (master / music / sfx).
   Synthesized sounds remain only as a fallback when a browser cannot decode
   the samples. No simultaneous hundreds of identical sounds. */
(function () {
  const A = NR.audio;
  const M = (NR.audioMap = { bank: {}, ready: false, loaded: 0, total: 0 });

  /* semantic key -> file in assets/super (path, volume, rate window) */
  const FILES = {
    uiClick:      ["UI/pop_1.wav", 0.5],
    uiHover:      ["UI/sci_fi_hover.wav", 0.25],
    uiConfirm:    ["UI/sci_fi_confirm.wav", 0.45],
    uiError:      ["UI/sci_fi_error.wav", 0.5],
    uiToggleOn:   ["UI/toggle_on.wav", 0.4],
    uiWarning:    ["UI/synth_warning.wav", 0.45],
    loading:      ["UI/synth_process_complete.wav", 0.35],
    purchase:     ["Items/coins_gather_medium.wav", 0.6],
    coin:         ["Retro/coin.wav", 0.5],
    reward:       ["Items/gem_collect.wav", 0.55],
    equip:        ["Weapons/weapon_equip.wav", 0.55],
    unequip:      ["Weapons/weapon_unequip.wav", 0.45],
    heroSelect:   ["Musical Effects/8_bit_chime_positive.wav", 0.5],
    levelComplete:["Musical Effects/8_bit_level_complete.wav", 0.55],
    waveComplete: ["Musical Effects/brass_chime_quick.wav", 0.5],
    lobby:        ["Musical Effects/8_bit_inn.wav", 0.35],
    socialNotify: ["Musical Effects/brass_chime_quick.wav", 0.4],
    bossIntro:    ["Machines/industrial_door_close.wav", 0.7],
    bossAttack:   ["Machines/hydraulic_down.wav", 0.55],
    bossDefeat:   ["Retro/explosion_large.wav", 0.7],
    explosion:    ["Retro/explosion_medium.wav", 0.6],
    /* hero combat verbs */
    heroAttack:       ["Weapons/sword_light.wav", 0.5],       // Kaito
    heroAttackSamurai:["Weapons/sword_slice.wav", 0.55],      // Sen
    heroAttackHeavy:  ["Weapons/harsh_thud.wav", 0.6],        // Onyx / Grim
    heroAttackFire:   ["Environment/fire_lighting.wav", 0.5], // Vex
    heroAttackGhost:  ["Other/ghost_long.wav", 0.35],         // Sable
    heroAttackRanged: ["Retro/throw.wav", 0.5],               // Kestrel
    heroAbilityKaito:   ["Weapons/sword_clash.wav", 0.5],
    heroAbilitySamurai: ["Weapons/sword_slice.wav", 0.55],
    heroAbilityTank:    ["Combat and Gore/kick.wav", 0.6],
    heroAbilityFire:    ["Environment/fire_lighting.wav", 0.55],
    heroAbilityGhost:   ["Other/whoosh_1.wav", 0.5],
    heroAbilityRanged:  ["Retro/throw.wav", 0.55],
    heroAbilityBrute:   ["Combat and Gore/punch.wav", 0.6],
    heroAbilityStorm:   ["Environment/air_burst.wav", 0.55],      // Mira / Rune
    heroAbilityAssassin:["Combat and Gore/crunch_quick.wav", 0.55], // Miyu
    swordSwipe:  ["Combat and Gore/swipe.wav", 0.45],
    swordSlice:  ["Weapons/sword_slice.wav", 0.55],
    swordSheath: ["Weapons/sword_unsheath.wav", 0.6],
    swordClash:  ["Weapons/sword_clash.wav", 0.5],
    sukunaCue:   ["Weapons/sword_unsheath.wav", 0.75],  // distinctive blade cue
    /* combat verbs */
    enemyAttack: ["Combat and Gore/swipe.wav", 0.35],
    enemyHit:    ["Combat and Gore/punch.wav", 0.4],
    enemyDie:    ["Retro/lose.wav", 0.4],
    hurt:        ["Retro/hurt.wav", 0.55],
    jump:        ["Retro/jump.wav", 0.4],
    land:        ["Footsteps/digital/digital_footstep_gravel_1.wav", 0.3],
    footstep:    ["Footsteps/digital/digital_footstep_gravel_2.wav", 0.18],
    dash:        ["Other/whoosh_2.wav", 0.5],
    kunai:       ["Retro/throw.wav", 0.45],
    parry:       ["Weapons/sword_clash.wav", 0.6],
    powerUp:     ["Retro/power_up.wav", 0.5],
    deny:        ["UI/sci_fi_error.wav", 0.5],
    applause:    ["Other/applause.wav", 0.4],
    /* legacy synth-key aliases so every existing call site now plays the
       correct repository sample (synth remains only as decode fallback) */
    ui:        ["UI/pop_1.wav", 0.4],
    swing:     ["Combat and Gore/swipe.wav", 0.4],
    swing2:    ["Weapons/sword_light.wav", 0.45],
    swing3:    ["Weapons/harsh_thud.wav", 0.5],
    hit:       ["Combat and Gore/punch.wav", 0.4],
    kill:      ["Retro/lose.wav", 0.35],
    explode:   ["Retro/explosion_medium.wav", 0.6],
    warn:      ["UI/synth_warning.wav", 0.45],
    roar:      ["Retro/grow_big.wav", 0.55],
    slam:      ["Machines/hydraulic_down.wav", 0.55],
    shot:      ["Retro/throw.wav", 0.3],
    boltHit:   ["Combat and Gore/punch.wav", 0.3],
    pickup:    ["Retro/coin.wav", 0.45],
    orb:       ["Items/gem_collect.wav", 0.4],
    step:      ["Footsteps/digital/digital_footstep_gravel_2.wav", 0.14],
    guard:     ["Weapons/sword_clash.wav", 0.5],
    ring:      ["Musical Effects/8_bit_chime_quick.wav", 0.35],
    djump:     ["Retro/jump_square.wav", 0.35],
    thunder:   ["Environment/air_burst.wav", 0.3],
  };
  M.FILES = FILES;

  const PATH = (p) => "assets/super/" + p.split("/").map(encodeURIComponent).join("/");

  /* ---------- load + decode (safe in Node tests: no fetch → stays off) ---------- */
  M.load = async function (ctx) {
    if (M.ready || typeof fetch !== "function") return;
    const keys = Object.keys(FILES);
    M.total = keys.length;
    await Promise.all(keys.map(async (k) => {
      try {
        const res = await fetch(PATH(FILES[k][0]));
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = await res.arrayBuffer();
        if (ctx) {
          const decoded = await new Promise((resolve, reject) => {
            try { ctx.decodeAudioData(buf.slice(0), resolve, reject); }
            catch (e) { reject(e); }
          });
          M.bank[k] = { buf: decoded, vol: FILES[k][1] };
        } else {
          M.bank[k] = { raw: buf, vol: FILES[k][1] }; // decode later when a context exists
        }
      } catch (e) {
        NR.diag?.warn(`audio sample missing: ${FILES[k][0]} (${e.message})`);
      } finally { M.loaded++; }
    }));
    M.ready = Object.keys(M.bank).length > 0;
    if (M.ready) NR.diag?.info(`audio map ready: ${Object.keys(M.bank).length}/${M.total} samples`);
  };

  /* decode any raw buffers once a real AudioContext exists */
  M.decode = async function (ctx) {
    let decoded = 0;
    for (const k of Object.keys(M.bank)) {
      const b = M.bank[k];
      if (b.raw && !b.buf) {
        try { b.buf = await ctx.decodeAudioData(b.raw.slice(0)); decoded++; } catch (_) { delete M.bank[k]; }
      }
    }
    M.ready = Object.keys(M.bank).some((k) => M.bank[k].buf);
    if (decoded) NR.diag?.info(`decoded ${decoded} deferred audio samples`);
  };

  /* ---------- pooled playback ---------- */
  const lastPlay = Object.create(null);
  const MIN_GAP = { default: 70, coin: 60, enemyHit: 60, swordSwipe: 80 };
  let voices = 0;
  const MAX_VOICES = 10;

  M.play = function (key, ctx, dest) {
    if (!A || !A.ready || !A.sfxOn || A.muted) return false;
    const b = M.bank[key];
    if (!b || !b.buf || !ctx) return false;
    const now = performance.now();
    const gap = MIN_GAP[key] || MIN_GAP.default;
    if (now - (lastPlay[key] || 0) < gap) return false;
    if (voices >= MAX_VOICES) return false;
    lastPlay[key] = now;
    try {
      const src = ctx.createBufferSource();
      src.buffer = b.buf;
      const g = ctx.createGain();
      g.gain.value = b.vol * (NR.profile.sfxVolume ?? 0.7);
      src.connect(g); g.connect(dest || (A._sfxGain || ctx.destination));
      src.onended = () => { voices = Math.max(0, voices - 1); };
      voices++;
      src.start();
      return true;
    } catch (e) { return false; }
  };

  /* ---------- integrate with the synth engine ----------
     A.play(name) becomes: sample first, synth fallback. */
  const origPlay = A.play;
  A._sfxGain = null;
  A.play = function (name, opt) {
    if (!A.ready || !A.sfxOn || A.muted) return;
    if (A._ctx && M.play(name, A._ctx)) return;
    origPlay(name, opt);
  };
  /* rewire: capture the real context + gains when audio boots */
  const origInit = A.init;
  A.init = function () {
    const wasReady = A.ready;
    origInit.call(A);
    if (A.ready && !wasReady) {
      A._ctx = A._ctx || (NR.audioMapCtx ? NR.audioMapCtx() : null);
    }
  };
  /* audio.js keeps its context private — expose it via a tiny hook */
  M.attach = function (ctx, sfxGain) { A._ctx = ctx; A._sfxGain = sfxGain; };
})();
