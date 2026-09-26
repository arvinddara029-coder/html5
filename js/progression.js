/* All records, achievements and checkpoints stay on this device. */
(function () {
  const read = (key, fallback) => {
    try {
      return JSON.parse(NR.store.getItem(key)) || fallback;
    } catch (_) {
      return fallback;
    }
  };
  const finite = (v, max = 1e8) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  const records = read("nr_records_v3", []);
  NR.records = Array.isArray(records)
    ? records
        .filter(
          (r) =>
            r &&
            finite(r.score) &&
            finite(r.duration, 1e6) &&
            finite(r.wave, 10000) &&
            finite(r.chapter, 12) &&
            ["adventure", "survival"].includes(r.mode) &&
            ["casual", "normal", "hard"].includes(r.difficulty) &&
            typeof r.name === "string" &&
            r.name.length <= 16,
        )
        .slice(0, 20)
    : [];
  NR.achievements = [
    {
      id: "parry",
      name: "Perfect timing",
      desc: "Parry an incoming attack.",
      icon: "shield",
    },
    {
      id: "kunai",
      name: "Deadeye",
      desc: "Land 10 ranged hits in one run.",
      icon: "target",
    },
    {
      id: "salvage",
      name: "Leave no scrap",
      desc: "Break all 6 loot crates in a chapter.",
      icon: "grid",
    },
    {
      id: "first",
      name: "First blood",
      desc: "Defeat your first enemy.",
      icon: "blade",
    },
    {
      id: "relay",
      name: "Signal restored",
      desc: "Activate an adventure relay.",
      icon: "bolt",
    },
    {
      id: "combo",
      name: "Untouchable",
      desc: "Reach a 10-kill combo.",
      icon: "wind",
    },
    {
      id: "hunter",
      name: "City hunter",
      desc: "Defeat 50 enemies across all runs.",
      icon: "target",
    },
    {
      id: "storm",
      name: "Eye of the storm",
      desc: "Cast Blade Storm 3 times in one run.",
      icon: "bolt",
    },
    {
      id: "wave",
      name: "Hold the line",
      desc: "Clear survival wave 5.",
      icon: "shield",
    },
    {
      id: "cache",
      name: "Scavenger",
      desc: "Open all 4 caches in one chapter.",
      icon: "grid",
    },
    {
      id: "escape",
      name: "Beyond the wall",
      desc: "Complete an adventure chapter.",
      icon: "arrow",
    },
    {
      id: "zero",
      name: "Protocol broken",
      desc: "Complete the final chapter.",
      icon: "cup",
    },
  ];
  const unlocked = read("nr_achievements_v3", []);
  NR.unlockedAchievements = new Set(
    Array.isArray(unlocked)
      ? unlocked.filter((id) => NR.achievements.some((a) => a.id === id))
      : [],
  );
  NR.progress = {
    award(id) {
      if (NR.unlockedAchievements.has(id)) return;
      const a = NR.achievements.find((a) => a.id === id);
      if (!a) return;
      NR.unlockedAchievements.add(id);
      NR.store.setItem(
        "nr_achievements_v3",
        JSON.stringify([...NR.unlockedAchievements]),
      );
      NR.hub?.notify("ACHIEVEMENT · " + a.name);
      NR.audio?.sample("achievement");
    },
    check(G) {
      if (G.stats.kills > 0) this.award("first");
      if (G.stats.maxCombo >= 10) this.award("combo");
      if (NR.profile.totalKills >= 50) this.award("hunter");
      if (G.stats.storms >= 3) this.award("storm");
    },
    record(G, victory) {
      const record = {
        name: G.runName,
        score: Math.round(G.score),
        wave: G.wave,
        chapter: G.chapter + 1,
        mode: G.mode,
        difficulty: G.difficulty,
        character: G.character,
        kills: G.stats.kills,
        duration: Math.round(G.time),
        victory: !!victory,
        date: Date.now(),
      };
      NR.records.unshift(record);
      NR.records.sort((a, b) => b.score - a.score);
      NR.records = NR.records.slice(0, 20);
      NR.store.setItem("nr_records_v3", JSON.stringify(NR.records));
    },
  };
  const playerFields = [
    "maxHp",
    "hp",
    "energy",
    "dmgMul",
    "speedMul",
    "jumpMax",
    "dashMax",
    "dashCdMul",
    "energyMul",
    "lifesteal",
    "critCh",
    "stormMul",
    "guardMul",
    "furyBonus",
  ];
  NR.checkpoint = {
    get() {
      return this.validate(read("nr_checkpoint_v3", null), NR.profile);
    },
    validate(c, profile = NR.profile) {
      if (
        !c ||
        c.version !== 1 ||
        !Number.isInteger(c.chapter) ||
        c.chapter < 0 ||
        c.chapter > Math.max(2, ((NR.adventure && NR.adventure.chapters.length) || 3) - 1) ||
        c.chapter > profile.unlocked ||
        !finite(c.x, 6800) ||
        c.x < 0 ||
        !["ronin", "kestrel", "titan"].includes(c.character) ||
        !["casual", "normal", "hard"].includes(c.difficulty) ||
        !NR.powers.some((p) => p.id === c.tactical)
      )
        return null;
      if (
        !c.player ||
        !playerFields.every((k) => finite(c.player[k], 10000)) ||
        c.player.hp <= 0 ||
        c.player.maxHp < 1 ||
        c.player.dashCdMul < 0.05 ||
        c.player.speedMul < 0.1
      )
        return null;
      if (
        c.player.dashMax > 3 ||
        c.player.jumpMax > 4 ||
        c.player.dashMax < 1 ||
        c.player.jumpMax < 1 ||
        c.player.hp > c.player.maxHp
      )
        return null;
      if (
        !finite(c.score) ||
        !finite(c.time, 1e6) ||
        !c.stats ||
        !["kills", "maxCombo", "storms"].every((k) => finite(c.stats[k], 1e6))
      )
        return null;
      if (
        !["relays", "zones", "caches", "shards"].every(
          (k) =>
            Array.isArray(c[k]) &&
            c[k].length <= 100 &&
            c[k].every((v) => Number.isInteger(v) && v >= 0 && v < 100),
        )
      )
        return null;
      const limits = { relays: 3, zones: 4, caches: 4, shards: 16, props: 6 };
      for (const [key, limit] of Object.entries(limits)) {
        const list = c[key] ?? (key === "props" ? [] : null);
        if (
          !Array.isArray(list) ||
          list.length > limit ||
          new Set(list).size !== list.length ||
          list.some((v) => !Number.isInteger(v) || v < 0 || v >= limit)
        )
          return null;
      }
      for (const key of ["parries", "kunaiHits", "salvaged"])
        if (c.stats[key] !== undefined && !finite(c.stats[key], 1e6))
          return null;
      if (
        !Number.isInteger(c.player.jumpMax) ||
        !Number.isInteger(c.player.dashMax) ||
        c.player.energy > 100 ||
        c.player.critCh > 1 ||
        c.player.lifesteal > 1
      )
        return null;
      return c;
    },
    save(G, A) {
      const player = Object.fromEntries(
        playerFields.map((k) => [k, G.player[k]]),
      );
      const c = {
        version: 1,
        chapter: G.chapter,
        character: G.character,
        difficulty: G.difficulty,
        tactical: G.tactical,
        x: G.player.x,
        player,
        score: G.score,
        time: G.time,
        stats: { ...G.stats },
        relays: A.relays.filter((o) => o.active).map((o) => o.id),
        zones: A.zones.filter((o) => o.cleared).map((o) => o.id),
        caches: A.caches.filter((o) => o.open).map((o) => o.id),
        props: A.props.filter((o) => o.broken).map((o) => o.id),
        shards: A.shards.filter((o) => o.collected).map((o) => o.id),
      };
      NR.store.setItem("nr_checkpoint_v3", JSON.stringify(c));
    },
    clear() {
      NR.store.setItem("nr_checkpoint_v3", "null");
    },
    restorePlayer(p, c) {
      playerFields.forEach((k) => {
        p[k] = c.player[k];
      });
      p.x = c.x;
      p.y = NR.world.groundY;
      p.prevBottom = p.y;
      p.ghostHp = p.hp;
      p.dashCharges = p.dashMax;
      p.iframes = 2;
      p.computePose();
    },
  };
})();
