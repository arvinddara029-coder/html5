/* ============ PRODUCTION PASS — VFX budget & quality manager ============
   ROOT-CAUSE FIX for the "huge fireball / fire / ice-ball appearing again
   and again" problem:
   - Every spell cast, item proc and super-enemy attack used to play a random
     animated Legacy-Collection effect clip at up to 290px. Hash-picked keys
     meant the SAME giant explosion/fire-ball clip replayed every few seconds
     forever (weapon procs auto-fire on cooldown).
   - This manager wraps NR.superRuntime.effect with:
       * a global concurrent animated-clip budget (6),
       * a per-source rate limit (min 1.6s between clips from one source),
       * a hard size clamp by event class (proc ≤ 64, cast ≤ 96, boss ≤ 150),
       * semantic clip selection (slashes/sparks/hits, not giant explosions,
         unless the caller explicitly asks for a big finisher),
       * VFX quality/intensity scaling from Settings.
   Procedural FX (rings/sparks) stay cheap and are scaled by intensity. */
(function () {
  const V = (NR.vfx = {
    active: 0,
    intensity: 1,        // profile.vfxIntensity (0.4 .. 1.3)
    maxClips: 6,          // concurrent animated effect clips
    minGap: 1.6,          // seconds between clips from the same source key
    lastPlay: Object.create(null),
  });

  /* event classes → size clamp + preferred clip keywords */
  const CLASSES = {
    proc:   { max: 64,  prefer: ["slash", "spark", "hit", "waveform", "energy-smack", "Bolt"], avoid: ["explosion", "fire-ball", "Ground", "EnemyDeath"] },
    cast:   { max: 96,  prefer: ["slash", "energy", "Pulse", "charged", "Bolt", "waveform"], avoid: ["EnemyDeath", "Ground Explosion"] },
    hit:    { max: 56,  prefer: ["hit", "spark", "energy-smack"], avoid: ["explosion", "fire-ball"] },
    death:  { max: 92,  prefer: ["enemy-death", "EnemyDeath", "energy-field"], avoid: [] },
    boss:   { max: 150, prefer: ["explosion", "energy-field", "charged"], avoid: [] },
  };

  V.setQuality = function (profile) {
    const q = profile && profile.quality === "low" ? "low" : profile && profile.quality === "high" ? "high" : "medium";
    V.maxClips = q === "low" ? 3 : q === "high" ? 8 : 6;
    V.intensity = Math.max(0.3, Math.min(1.5, (profile && profile.vfxIntensity) || 1));
    if (NR.fx) NR.fx.max = Math.floor((q === "low" ? 420 : q === "high" ? 1100 : 800) * V.intensity);
    V.minGap = q === "low" ? 2.4 : 1.6;
  };

  /* pick a semantically sane clip from the measured library */
  function pickClip(keywords, avoid, seed) {
    const C = NR.superContent;
    if (!C || !C.effects.length) return null;
    const ok = C.effects.filter((c) =>
      keywords.some((k) => c.name.toLowerCase().includes(k.toLowerCase())) &&
      !avoid.some((k) => c.name.toLowerCase().includes(k.toLowerCase())));
    const pool2 = ok.length ? ok : C.effects.filter((c) => !avoid.some((k) => c.name.toLowerCase().includes(k.toLowerCase())));
    const list = pool2.length ? pool2 : C.effects;
    return list[Math.abs(seed) % list.length];
  }

  /* Budgeted replacement for NR.superRuntime.effect */
  V.effect = function (x, y, key, size, eventClass) {
    const S = NR.superRuntime;
    if (!S || !NR.superContent || !NR.superContent.effects.length) return;
    const cls = CLASSES[eventClass] || CLASSES.proc;
    if (V.active >= V.maxClips) return;                 // global budget exhausted
    const now = NR.game ? NR.game.time : performance.now() / 1000;
    const k = String(key);
    if (V.lastPlay[k] !== undefined && now - V.lastPlay[k] < V.minGap) return; // per-source rate limit
    V.lastPlay[k] = now;
    const seed = NR.evolution ? NR.evolution.hash(k) : (k.length * 2654435761);
    const clip = pickClip(cls.prefer, cls.avoid, seed);
    if (!clip) return;
    const s = Math.min(cls.max, Math.round((size || 64) * Math.min(1, V.intensity)));
    S.effects.push({ clip, x, y, size: s, t: 0 });
    V.active = S.effects.length;
  };

  /* install the wrapper once super-runtime exists */
  V.install = function () {
    const S = NR.superRuntime;
    if (!S || S._vfxWrapped) return;
    S._vfxWrapped = true;
    S.effect = function (x, y, key, size, eventClass) { V.effect(x, y, key, size, eventClass); };
    // keep the active count in sync as clips expire
    const origUpdate = NR.fx.update;
    NR.fx.update = function (dt) {
      origUpdate(dt);
      V.active = S.effects.length;
    };
  };

  /* scaled procedural FX helpers (respect intensity + toggles) */
  V.burst = function (x, y, o) {
    if (!NR.fx || V.intensity <= 0.05) return;
    const n = Math.max(1, Math.round((o && o.n) || 10) * (0.5 + V.intensity * 0.5));
    NR.fx.burst(x, y, Object.assign({}, o, { n }));
  };
  V.ring = function (x, y, o) {
    if (!NR.fx) return;
    NR.fx.ring(x, y, o);
  };

  /* floating damage numbers respect the profile toggle */
  V.text = function (x, y, str, o) {
    const P = NR.profile;
    if (P && P.damageText === false) return;
    if (P && P.floatingNumbers === false && o && o.kind === "float") return;
    NR.fx.text(x, y, str, o);
  };
})();
