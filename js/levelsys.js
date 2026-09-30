/* ============ PRODUCTION PASS — scalable level / progression system ============
   Replaces the idea of "a small fixed list of levels" with data-driven,
   seeded, endlessly scaling levels inside each world:
     World 1: Level 1, 2, 3 … N   World 2: Level 1 … N   (6 worlds)
   A level definition is GENERATED from (world, level, seed):
     environment theme, staged enemy pool, spawn patterns, difficulty curve,
     wave count, boss milestone + rotation, rewards, music/VFX theme.
   Deterministic: the same seed reproduces the same level (recorded in
   diagnostics for debugging).

   Modes:
     WAVE FIGHT (mode 'survival' internally — structured waves, boss every
       5th, upgrade choice after each wave)
     SURVIVE (mode 'survive' — continuous escalating pressure, no wave
       breaks, timer-driven intensity, high-score focused)
   Content is STAGED: early levels field basic enemies only; new enemy
   families, super actors and elites appear gradually. */
(function () {
  const U = NR.util;
  const L = (NR.levelsys = {});

  /* ---------------- deterministic RNG ---------------- */
  L.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  L.seedFor = function (world, level) {
    const base = NR.evolution ? NR.evolution.seed : 1234;
    return (base ^ (world * 0x9e3779b9) ^ (level * 0x85ebca6b)) >>> 0;
  };
  L.seedInfo = () => `w${(NR.game?.chapter || 0) + 1}/l${L.currentLevel()}/${L.seedFor(NR.game?.chapter || 0, L.currentLevel()).toString(36)}`;
  L.currentLevel = () => (NR.evolution && NR.evolution.levels ? (NR.evolution.levels[NR.game?.chapter || 0] || 1) : 1);

  /* ---------------- staged enemy pools ---------------- */
  const STAGES = [
    { max: 3,   pool: ["crawler", "slime"], supers: 0, elite: 0 },
    { max: 8,   pool: ["crawler", "slime", "drone", "soldier"], supers: 0, elite: 0 },
    { max: 15,  pool: ["crawler", "slime", "drone", "soldier", "wraith", "gunner", "warlock"], supers: 1, elite: 0.02 },
    { max: 25,  pool: ["crawler", "drone", "soldier", "wraith", "gunner", "warlock", "rival", "striker", "sentry"], supers: 2, elite: 0.06 },
    { max: 40,  pool: ["drone", "soldier", "wraith", "gunner", "warlock", "rival", "striker", "blade", "sentinel", "brute"], supers: 3, elite: 0.12 },
    { max: 1e9, pool: ["soldier", "wraith", "gunner", "warlock", "rival", "striker", "blade", "sentinel", "brute", "apparition"], supers: 4, elite: 0.18 },
  ];
  L.stageFor = function (level) { return STAGES.find((s) => level <= s.max) || STAGES[STAGES.length - 1]; };
  L.stagedPool = function (world, level) {
    const st = L.stageFor(level);
    // world flavor: shift pool order deterministically so each world reads differently
    const r = L.rng(L.seedFor(world, level));
    const pool = st.pool.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return { pool, supers: st.supers, eliteChance: st.elite };
  };

  /* ---------------- level definition (generated) ---------------- */
  const THEMES = [
    { name: "VERDANT WILDS", vfx: "green", music: "wave", textures: ["Stone", "Wood"] },
    { name: "OVERGROWN GARDENS", vfx: "green", music: "wave", textures: ["Stone", "Wood"] },
    { name: "ZERO REACTOR", vfx: "orange", music: "wave", textures: ["Metal", "Tile"] },
    { name: "SUNKEN FOUNDRY", vfx: "purple", music: "wave", textures: ["Plaster", "Metal"] },
    { name: "SKYWARD DOCKS", vfx: "blue", music: "wave", textures: ["Metal", "Brick"] },
    { name: "THE SPIRE", vfx: "red", music: "wave", textures: ["Tile", "Stone"] },
  ];
  L.levelDef = function (world, level) {
    const seed = L.seedFor(world, level);
    const r = L.rng(seed);
    const theme = THEMES[(world + Math.floor(level / 7)) % THEMES.length];
    const staged = L.stagedPool(world, level);
    const waveCount = 4 + Math.min(6, Math.floor(level / 3)); // 4 → 10 waves per level
    return {
      world, level, seed,
      name: `${theme.name} · LEVEL ${level}`,
      theme, enemyPool: staged.pool, supers: staged.supers, eliteChance: staged.elite,
      waveCount,
      difficulty: 1 + (level - 1) * 0.09 + world * 0.18,   // gentle, monotonic
      spawnPattern: r() < 0.5 ? "flank" : r() < 0.75 ? "converge" : "staggered",
      bossMilestone: 5,                                     // boss every 5th wave
      hazards: level >= 4 && r() < 0.4,
      reward: { coins: 60 + level * 14, xp: 80 + level * 20 },
    };
  };

  /* ---------------- wave composition ---------------- */
  /* WAVE FIGHT: structured waves from the staged pool. */
  L.waveComp = function (waveNum, def) {
    if (waveNum % def.bossMilestone === 0)
      return { boss: true, crawlers: Math.min(2 + Math.floor(waveNum / 5), 4) };
    const r = L.rng(def.seed + waveNum * 7919);
    const pool = def.enemyPool;
    const budget = 4 + waveNum * 1.35 + def.level * 0.5;       // total enemy "weight"
    const comp = { boss: false };
    let spent = 0, guard = 0;
    while (spent < budget && guard++ < 40) {
      const type = pool[Math.floor(r() * pool.length)];
      comp[type] = (comp[type] || 0) + 1;
      spent += type === "brute" || type === "sentinel" ? 2 : 1;
    }
    return comp;
  };

  /* SURVIVE: continuous pressure curve — spawn this many per 10s window. */
  L.surviveBatch = function (elapsed, def) {
    const r = L.rng(def.seed + Math.floor(elapsed / 10) * 104729);
    const pool = def.enemyPool;
    const n = Math.min(14, 2 + Math.floor(elapsed / 22) + Math.floor(def.level / 4));
    const batch = [];
    for (let i = 0; i < n; i++) batch.push(pool[Math.floor(r() * pool.length)]);
    return batch;
  };
  L.surviveBossAt = function (elapsed) { return elapsed > 0 && Math.floor(elapsed / 180) !== Math.floor((elapsed - 16) / 180); };

  /* ---------------- progression ---------------- */
  L.advanceLevel = function (world) {
    if (!NR.evolution) return 1;
    const w = world !== undefined ? world : (NR.game?.chapter || 0);
    NR.evolution.levels[w] = (NR.evolution.levels[w] || 1) + 1;
    NR.evolution.save();
    NR.diag?.game(`advanced to world ${w + 1} level ${NR.evolution.levels[w]}`);
    return NR.evolution.levels[w];
  };

  /* Difficulty multipliers applied on top of the legacy wave curve. */
  L.enemyMuls = function (def, waveNum) {
    const d = def.difficulty * (1 + Math.max(0, waveNum - 1) * 0.06);
    return { hp: d, spd: 1 + Math.min(0.5, (d - 1) * 0.4), dmg: 1 + Math.max(0, d - 1) * 0.35 };
  };

  /* ---------------- level intro banner ---------------- */
  L.banner = function (def) {
    NR.game?.banner(`${def.name}`, `stage ${L.stageFor(def.level) === STAGES[0] ? "I" : L.stageFor(def.level) === STAGES[1] ? "II" : L.stageFor(def.level) === STAGES[2] ? "III" : L.stageFor(def.level) === STAGES[3] ? "IV" : L.stageFor(def.level) === STAGES[4] ? "V" : "VI"} · ${def.theme.vfx.toUpperCase()} DISTRICT`, "#8fb0e8");
  };
})();
