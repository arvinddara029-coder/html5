/* Device-local preferences. No backend, requests, accounts or telemetry. */
(function () {
  const memory = {};
  NR.store = {
    persistent: true,
    getItem(key) {
      if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
      try {
        return localStorage.getItem(key);
      } catch (_) {
        this.persistent = false;
        return null;
      }
    },
    setItem(key, value) {
      memory[key] = String(value);
      try {
        localStorage.setItem(key, String(value));
        return true;
      } catch (_) {
        this.persistent = false;
        return false;
      }
    },
  };
  let saved;
  try {
    saved = JSON.parse(NR.store.getItem("nr_profile") || "{}");
  } catch (_) {
    saved = {};
  }
  NR.SAVE_VERSION = 2;
  /* versioned migration: fill defaults field-by-field, never wipe progress */
  if (saved && typeof saved === "object" && !saved.saveVersion) {
    saved.saveVersion = 1; // v1 saves load with defaults for every new field
  }
  NR.profile = Object.assign(
    {
      name: "RONIN_01",
      tactical: "shield",
      world: "day",
      difficulty: "normal",
      shake: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      controls: true,
      bestWave: 0,
      runs: 0,
      mode: "adventure",
      character: "ronin",
      chapter: 0,
      unlocked: 0,
      totalKills: 0,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      /* ---- Skyward progression & appearance ---- */
      level: 1,
      xp: 0,
      coins: 500,
      gems: 10,
      pet: "",
      owned: {},
      appearance: {
        skin: "Male Skin1", monster: "", hair: "Male Hair10", ears: "",
        top: "mShirt", bottom: "mPants", underwear: "mUnderwear", shoes: "mBoots",
        gloves: "mGloves", hat: "", mask: "", back: "", weapon: "mWooden Sword", aura: "",
      },
      /* ---- production pass fields (saveVersion 2) ---- */
      saveVersion: NR.SAVE_VERSION,
      savedAt: 0,
      cosmeticOverride: {},        // which slots the player explicitly customized (Vault fix)
      settings: {},                // fps/quality/vfx/shadows/hud-scale/damage-text...
      onlineBest: {},              // best validated online results per mode
    },
    saved && typeof saved === "object" ? saved : {},
  );
  const P = NR.profile;
  if (!P.settings || typeof P.settings !== "object") P.settings = {};
  if (!P.cosmeticOverride || typeof P.cosmeticOverride !== "object") P.cosmeticOverride = {};
  if (!P.onlineBest || typeof P.onlineBest !== "object") P.onlineBest = {};
  /* legacy character id → new hero key */
  const HERO_MIGRATION = { ronin: "kaito", titan: "onyx" };
  if (HERO_MIGRATION[P.character]) P.character = HERO_MIGRATION[P.character];
  /* sanitize appearance: every key must reference a real catalog entry */
  const DEFAULT_LOOK = {
    skin: "Male Skin1", monster: "", hair: "Male Hair10", ears: "",
    top: "mShirt", bottom: "mPants", underwear: "mUnderwear", shoes: "mBoots",
    gloves: "mGloves", hat: "", mask: "", back: "", weapon: "mWooden Sword", aura: "",
  };
  if (!P.appearance || typeof P.appearance !== "object") P.appearance = { ...DEFAULT_LOOK };
  for (const key of Object.keys(DEFAULT_LOOK)) {
    const v = P.appearance[key];
    const valid = !v || (NR.catalog && NR.catalog[key] && NR.catalog[key].some((o) => o.id === v));
    if (!valid) P.appearance[key] = DEFAULT_LOOK[key];
  }
  const DEFAULTS = { level: 1, xp: 0, coins: 500, gems: 10 };
  for (const key of Object.keys(DEFAULTS)) {
    const n = P[key];
    P[key] = typeof n === "number" && Number.isFinite(n)
      ? Math.max(0, Math.min(key === "level" ? 99 : 99999999, Math.floor(n)))
      : DEFAULTS[key];
  }
  if (P.level < 1) P.level = 1;
  if (!P.owned || typeof P.owned !== "object") P.owned = {};
  if (typeof P.pet !== "string") P.pet = "";
  for (const key of ["shake", "controls"])
    if (typeof P[key] !== "boolean") P[key] = true;
  if (
    !["shield", "pulse", "heal", "overdrive", "chrono", "drone"].includes(
      P.tactical,
    )
  )
    P.tactical = "shield";
  if (!["day", "night"].includes(P.world)) P.world = "day";
  if (!["casual", "normal", "hard"].includes(P.difficulty))
    P.difficulty = "normal";
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(P.name)) P.name = "RONIN_01";
  /* modes: adventure (campaign) · survival (WAVE FIGHT) · survive (SURVIVE) */
  if (P.mode === "wavefight") P.mode = "survival";
  if (!["adventure", "survival", "survive"].includes(P.mode)) P.mode = "adventure";
  const ROSTER = (NR.characters || []).map((c) => c.id);
  if (!ROSTER.length || !ROSTER.includes(P.character)) P.character = ROSTER[0] || "ronin";
  const LAST_CHAPTER = Math.max(0, ((NR.adventure && NR.adventure.chapters.length) || NR.campaignChapterCount || 3) - 1);
  for (const key of ["chapter", "unlocked"])
    P[key] = Math.max(0, Math.min(LAST_CHAPTER, Math.floor(Number(P[key]) || 0)));
  P.chapter = Math.min(P.chapter, P.unlocked);
  for (const key of ["totalKills", "bestWave", "runs"])
    P[key] = Math.max(0, Math.min(10000000, Math.floor(Number(P[key]) || 0)));
  for (const key of ["musicVolume", "sfxVolume"])
    P[key] = Math.max(0, Math.min(1, Number(P[key]) || 0));
  NR.saveProfile = () => NR.store.setItem("nr_profile", JSON.stringify(P));
  NR.powers = [
    {
      id: "shield",
      icon: "shield",
      name: "Aegis Shield",
      short: "AEGIS",
      color: "#baafff",
      type: "DEFENSE",
      cooldown: 16,
      summary: "Become untouchable. Hold your ground.",
      description:
        "A 3-second energy shield blocks all incoming damage. 16s cooldown.",
    },
    {
      id: "pulse",
      icon: "target",
      name: "Shock Pulse",
      short: "PULSE",
      color: "#f4bc7b",
      type: "AREA DAMAGE",
      cooldown: 12,
      summary: "One pulse. Send the whole horde flying.",
      description:
        "Deal 45 damage and knock back every enemy within 380 units. 12s cooldown.",
    },
    {
      id: "heal",
      icon: "heart",
      name: "Nano Repair",
      short: "REPAIR",
      color: "#9adea9",
      type: "RECOVERY",
      cooldown: 24,
      summary: "A second chance, built into your armor.",
      description:
        "Restore 35 health instantly. Cannot be wasted at full health. 24s cooldown.",
    },
    {
      id: "overdrive",
      icon: "bolt",
      name: "Overdrive",
      short: "DRIVE",
      color: "#87c9ef",
      type: "DAMAGE BOOST",
      cooldown: 20,
      summary: "Push your blade beyond its limits.",
      description: "Double your katana damage for 5 seconds. 20s cooldown.",
    },
    {
      id: "chrono",
      icon: "sun",
      name: "Chrono Field",
      short: "CHRONO",
      color: "#eec887",
      type: "TIME CONTROL",
      cooldown: 22,
      summary: "Slow enemies. Take back the initiative.",
      description:
        "Slow enemy actions and bolts to 35% speed for 5 seconds. 22s cooldown.",
    },
    {
      id: "drone",
      icon: "grid",
      name: "Arc Companion",
      short: "DRONE",
      color: "#83d7ec",
      type: "SUPPORT",
      cooldown: 24,
      summary: "An airborne ally that never misses.",
      description:
        "Summon an 8-second companion. Fires 13-damage pulses at nearby enemies every 0.5s. 24s cooldown.",
    },
  ];
})();
