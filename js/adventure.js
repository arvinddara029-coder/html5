/* Three authored, side-scrolling expeditions with encounters, relays and extraction. */
(function () {
  const U = NR.util,
    W = NR.world,
    F = NR.fx;
  const A = (NR.adventure = {
    active: false,
    relays: [],
    zones: [],
    caches: [],
    hazards: [],
    shards: [],
    props: [],
    prompt: null,
    t: 0,
  });
  A.chapters = [
    {
      id: 0,
      name: "THE VERDANT OUTSKIRTS",
      short: "Outskirts",
      district: "SECTOR 09",
      biome: "garden",
      color: "#8af5e1",
      description:
        "The old transit line is buried in green. Cross the wilds, restore three relays and find the way forward.",
      objective: "Restore the transit relays",
      length: 6800,
      boss: "ronin",
      bossName: "KUROGANE THE RIVAL",
    },
    {
      id: 1,
      name: "THE OVERGROWN LINE",
      short: "Overgrowth",
      district: "SECTOR 12",
      biome: "garden",
      color: "#b4e784",
      description:
        "Nature has reclaimed the skyway. Cross the broken gardens and bring the old freight lift back online.",
      objective: "Reconnect the garden grid",
      length: 6800,
      boss: "brute",
      bossName: "THORN, THE GARDEN WARDEN",
    },
    {
      id: 2,
      name: "THE ZERO REACTOR",
      short: "Zero Reactor",
      district: "THE CORE",
      biome: "reactor",
      color: "#ffbd7f",
      description:
        "The signal ends here. Break the reactor locks, confront SHOGUN-9 and shut down Protocol Zero.",
      objective: "Override the reactor locks",
      length: 6800,
      boss: "mech",
      bossName: "SHOGUN-9",
    },
    {
      id: 3,
      name: "THE SUNKEN FOUNDRY",
      short: "Foundry",
      district: "SECTOR 21",
      biome: "reactor",
      color: "#c08bff",
      description:
        "Below the reactor, the old foundry still burns. Something down here has learned the warlock rites.",
      objective: "Silence the foundry choir",
      length: 7400,
      boss: "warlock",
      bossName: "ARCH-WARLOCK VEXIS",
    },
    {
      id: 4,
      name: "THE SKYWARD DOCKS",
      short: "Sky Docks",
      district: "SECTOR 34",
      biome: "garden",
      color: "#ff9a7f",
      description:
        "Freight lifts and rotted gantries above the canopy. Goro the Breaker collects tolls in bones.",
      objective: "Break the dock blockade",
      length: 7400,
      boss: "brute",
      bossName: "GORO THE BREAKER",
    },
    {
      id: 5,
      name: "PROTOCOL PRIME",
      short: "Prime Spire",
      district: "THE SPIRE",
      biome: "city",
      color: "#ff5f8f",
      description:
        "The last climb. Every hunter the protocol owns is on this roof, and SHOGUN-9 PRIME is waiting.",
      objective: "End Protocol Prime",
      length: 8200,
      boss: "mech",
      bossName: "SHOGUN-9 PRIME",
      finale: true,
    },
  ];
  A.bossSkin = () => (A.chapter && A.chapter.boss) || "mech";
  const basePlatforms = W.platforms.map((p) => ({ ...p }));
  /* Route layouts are authored as fractions of the chapter length, so every
     chapter — including the longer late-campaign ones — gets the same rhythm of
     platforms, relays, patrols, caches, hazards and shards. */
  const PATTERNS = [
    [
      [0, 690, 290],
      [310, 535, 260],
      [620, 660, 220, 110, 35],
    ],
    [
      [-60, 730, 260],
      [230, 600, 230],
      [500, 465, 240],
      [800, 610, 220, 55, 100],
    ],
    [
      [-90, 715, 240],
      [185, 565, 245],
      [480, 695, 250, 150, 0],
      [840, 510, 240],
    ],
    // foundry: tight gantries with long horizontal shuttles
    [
      [-40, 700, 250, 140, 0],
      [300, 545, 230],
      [560, 690, 210],
      [830, 470, 240, 60, 90],
    ],
    // sky docks: stacked freight lifts, mostly vertical travel
    [
      [-70, 720, 240],
      [210, 585, 220, 45, 120],
      [470, 640, 250],
      [740, 445, 230, 120, 30],
      [980, 610, 200],
    ],
    // prime spire: sparse, punishing gaps with fast moving platforms
    [
      [-30, 705, 230, 160, 0],
      [330, 520, 220],
      [600, 665, 210, 90, 60],
      [880, 430, 240],
    ],
  ];
  const HAZARDS = [
    [[0.174, "spikes", 100], [0.422, "laser", 85], [0.647, "saw", 100], [0.859, "laser", 85]],
    [[0.162, "spikes", 100], [0.4, "saw", 100], [0.625, "spikes", 100], [0.862, "saw", 100]],
    [[0.144, "laser", 85], [0.371, "laser", 85], [0.621, "saw", 100], [0.871, "laser", 85]],
    // foundry: molten saws and vent lasers, one extra trap
    [[0.13, "saw", 100], [0.3, "laser", 85], [0.47, "saw", 100], [0.66, "laser", 85], [0.84, "spikes", 110]],
    // sky docks: mostly spikes on the gantries
    [[0.12, "spikes", 110], [0.29, "spikes", 100], [0.52, "laser", 85], [0.7, "saw", 100], [0.88, "spikes", 110]],
    // prime spire: everything, tighter spacing
    [[0.11, "laser", 85], [0.26, "saw", 100], [0.41, "laser", 85], [0.58, "spikes", 110], [0.73, "saw", 100], [0.89, "laser", 85]],
  ];
  const RELAY_F = [0.257, 0.5, 0.743];
  const ZONE_F = [0.11, 0.345, 0.588, 0.82];
  const CACHE_F = [0.073, 0.319, 0.567, 0.806];
  const PROP_F = [0.091, 0.162, 0.324, 0.456, 0.574, 0.797];

  A.configure = function (mode, chapter) {
    A.active = mode === "adventure";
    A.chapter = A.chapters[chapter] || A.chapters[0];
    A.prompt = null;
    A.t = 0;
    A.pendingCheckpoint = false;
    A.finishing = 0; // counts down the extraction cinematic once triggered
    A.exitWarnT = 0;
    if (!A.active) {
      W.W = 2560;
      W.platforms = basePlatforms.map((p) => ({ ...p }));
      return;
    }
    const L = A.chapter.length;
    const px = (f) => Math.round(f * L);
    W.W = L;
    W.platforms = [];
    // Each district has a different traversal rhythm. Ground is always walkable;
    // elevated routes reward double jumps without blocking relay accessibility.
    const pattern = PATTERNS[A.chapter.id % PATTERNS.length];
    const groups = Math.max(4, Math.round(L / 1700));
    const step = (L - 1400) / groups;
    for (let i = 0; i < groups; i++)
      for (const [dx, y, w, ampX, ampY] of pattern) {
        const x = 650 + i * step + dx;
        if (x > L - 420) continue; // keep the extraction approach clear
        W.platforms.push({
          x,
          y,
          w,
          h: 24,
          ...(ampX !== undefined
            ? { baseX: x, baseY: y, moving: true, phase: i, ampX, ampY }
            : {}),
        });
      }
    A.relays = RELAY_F.map((f, id) => ({ id, x: px(f), active: false }));
    A.zones = ZONE_F.map((f, id) => {
      const x = px(f);
      return { id, x, started: false, cleared: false, gate: x + 620 };
    });
    A.caches = CACHE_F.map((f, id) => ({ id, x: px(f), open: false }));
    A.hazards = HAZARDS[A.chapter.id % HAZARDS.length].map(([f, type, w], id) => ({
      x: px(f),
      type,
      w,
      id,
      phase: id * 0.9,
    }));
    A.shards = [];
    for (let i = 0; i < groups; i++)
      for (let j = 0; j < 4; j++) {
        const platform =
          W.platforms[i * pattern.length + Math.min(j, pattern.length - 1)];
        if (!platform) continue;
        A.shards.push({
          id: A.shards.length,
          x: platform.x + platform.w * (j === 3 && A.chapter.id === 0 ? 0.75 : 0.4),
          y: platform.y - 45,
          collected: false,
        });
      }
    A.props = PROP_F.map((f, id) => ({
      id,
      x: px(f) + A.chapter.id * 25,
      y: W.groundY,
      hp: 28,
      broken: false,
    }));
  };
  const configure = A.configure;
  A.configure = function (...args) { configure(...args); NR.evolution?.generate(); };
  A.hurtProp = function (o, damage, G) {
    if (!A.active || o.broken) return false;
    o.hp -= damage;
    F.sparks(o.x, o.y - 25, 6, "yellow");
    if (o.hp <= 0) {
      o.broken = true;
      G.stats.salvaged = (G.stats.salvaged || 0) + 1;
      G.addScore(50, o.x, o.y - 75, false);
      G.pickups.push(
        new NR.Pickup(o.x, o.y - 50, o.id % 2 === 0 ? "energy" : "heart"),
      );
      F.burst(o.x, o.y - 25, { n: 18, col: "orange", spd: 260, life: 0.6 });
      NR.audio.sample("clear");
      if (A.props.every((p) => p.broken)) NR.progress.award("salvage");
    }
    return true;
  };
  A.strikeProps = function (p, attack, G) {
    if (!A.active) return;
    for (const o of A.props)
      if (
        !o.broken &&
        (o.x - p.x) * p.facing >= -10 &&
        Math.abs(o.x - p.x) <= attack.rng &&
        Math.abs(o.y - 26 - (p.y - 45)) < 110
      )
        A.hurtProp(o, attack.dmg * p.dmgMul * (p.overdriveT > 0 ? 2 : 1), G);
  };

  A.start = function (G, checkpoint) {
    if (!A.active) return;
    G.player.x = 200;
    G.player.y = W.groundY;
    G.player.prevBottom = G.player.y;
    G.player.computePose();
    G.enemyHpMul =
      (1 + G.chapter * 0.2) *
      (G.difficulty === "casual" ? 0.75 : G.difficulty === "hard" ? 1.35 : 1);
    G.enemySpdMul =
      G.difficulty === "casual" ? 0.85 : G.difficulty === "hard" ? 1.15 : 1;
    G.enemyDmgMul = 1 + G.chapter * 0.1;
    G.startT = 0;
    const level = NR.evolution?.levels[G.chapter] || 1;
    G.enemyHpMul *= 1 + (level-1)*.08;
    G.enemyDmgMul *= 1 + (level-1)*.04;
    if (checkpoint) {
      for (const key of ["relays", "zones", "caches", "shards", "props"]) {
        const field = {
          relays: "active",
          zones: "cleared",
          caches: "open",
          shards: "collected",
          props: "broken",
        }[key];
        A[key].forEach((o) => {
          o[field] = (checkpoint[key] || []).includes(o.id);
          if (key === "zones") o.started = o.cleared;
        });
      }
      NR.checkpoint.restorePlayer(G.player, checkpoint);
      NR.evolution?.onLevelUp(G.player.evoLevel,NR.profile.level);
      G.score = checkpoint.score;
      G.time = checkpoint.time;
      G.stats = { ...G.stats, ...checkpoint.stats };
      G.liveXp=checkpoint.liveXp||0;
      G.banner("CHECKPOINT RESTORED", "Your journey continues.", "#d5fa5b");
    } else
      G.banner(
        A.chapter.short.toUpperCase(),
        "Move right · restore 3 relays · reach extraction",
        A.chapter.color,
      );
    A.tutorial = checkpoint ? 0 : 7;
  };
  function spawnZone(zone, G) {
    zone.started = true;
    const x = zone.x + 260,
      y = W.groundY,
      m = G.enemyHpMul;
    const add = (e) => {
      e.spawnT = 0.45;
      G.enemies.push(e);
      F.teleport(e.x, e.y - e.h / 2, "orange");
    };
    const finale = zone.id === A.zones.length - 1 && !!A.chapter.boss;
    if (finale) {
      const guardian=NR.superRuntime?.guardian(x-200,y);if(guardian)add(guardian);
      // every chapter ends on a real boss fight; later chapters field the
      // warlock / brute bodies and a tougher SHOGUN frame
      const bossNum = 1 + Math.floor(G.chapter / 2);
      // bosses scale with the campaign so chapter 1 is a duel, not a wall
      const boss = new NR.Boss(x + 120, y, m, bossNum, A.bossSkin(), 0.6 + G.chapter * 0.12);
      G.bossActive = true;
      G.bossRef = boss;
      add(boss);
      if (G.chapter >= 3) add(new NR.Sentinel(x - 180, y, m)); // honour guard
      G.banner(
        A.chapter.bossName || "SHOGUN-9",
        A.chapter.finale
          ? "The last lock wears your face."
          : "The final lock is holding something enormous.",
        "#ff826b",
      );
    } else {
      const ch = G.chapter;
      if(NR.superRuntime) add(NR.superRuntime.spawn(x+200,y,zone.id));
      if (NR.evolution) {
        const evo=NR.evolution,level=evo.levels[ch],h=evo.hash(`${evo.seed}:${ch}:${level}:${zone.id}`);
        const types=[NR.Slime,NR.Soldier,NR.Rival,NR.Gunner];
        for(let i=0;i<Math.min(3,1+Math.floor(level/4));i++) add(new types[(h+i)%types.length](x-160+i*140,y,m));
      }
      add(new NR.Crawler(x - 100, y, m));
      add(new NR.Crawler(x + 150, y, m));
      if (ch >= 1 || zone.id >= 1) add(new NR.Slime(x + 40, y, m));
      if (zone.id > 0 || ch > 0) add(new NR.Sentry(x + 260, y, m));
      if (zone.id > 1 || ch > 0) add(new NR.Soldier(x - 40, y, m));
      if (ch >= 1 && zone.id >= 1) add(new NR.Rival(x + 120, y, m));
      if (ch >= 2) add(new NR.Warlock(x + 300, y - 50, m));
      if (ch >= 1 && zone.id >= 2) add(new NR.Gunner(x - 220, y, m));           // Diego covers the approach
      if (ch >= 2 && zone.id >= 1) add(new NR.Striker(x + 200, y, m));         // Holly hunts the reactor
      if (ch >= 2 && zone.id >= 1) add(new NR.Blade(x - 320, y, m));           // Gordon guards the core
      if (zone.id === 3 || ch >= 2) add(new NR.Sentinel(x + 60, y, m));
      if (ch > 0 && zone.id === 2) add(new NR.Wraith(x + 200, y - 100, m));
      // late campaign: the armoured heavy and the diving phantom join the patrols
      if (ch >= 3 && zone.id >= 1) add(new NR.Brute(x + 340, y, m));
      if (ch >= 3 && zone.id >= 2) add(new NR.Apparition(x - 260, y - 220, m));
      if (ch >= 4) add(new NR.Drone(x + 420, y - 300, m));
      if (ch >= 5) add(new NR.Apparition(x + 180, y - 260, m));
      G.banner(
        "CONTACT AHEAD",
        zone.id === 0
          ? "Clear the patrol to release the barrier."
          : "Eliminate the defenders.",
        A.chapter.color,
      );
    }
    NR.audio.sample("gate");
  }
  A.update = function (dt, G) {
    if (!A.active || G.player.dead) return;
    A.t += dt;
    A.tutorial = Math.max(0, A.tutorial - dt);
    const p = G.player;
    // Carry the player with their moving support before integrating their own motion.
    for (const platform of W.platforms) {
      if (!platform.moving) continue;
      const oldX = platform.x,
        oldY = platform.y;
      platform.x =
        platform.baseX +
        Math.sin(A.t * 0.8 + platform.phase) * (platform.ampX ?? 110);
      platform.y =
        platform.baseY +
        Math.sin(A.t * 0.65 + platform.phase) * (platform.ampY ?? 35);
      if (p.support === platform && p.onGround) {
        p.x += platform.x - oldX;
        p.y += platform.y - oldY;
        p.prevBottom = p.y;
      }
    }
    for (const zone of A.zones) {
      if (!zone.started && p.x >= zone.x - 180) spawnZone(zone, G);
      if (zone.started && !zone.cleared) {
        if (!G.enemies.some((e) => !e.dead) && !G.bossActive) {
          zone.cleared = true;
          G.addScore(300, p.x, p.y - 130, true);
          NR.audio.sample("clear");
          F.text(zone.gate, W.groundY - 160, "BARRIER RELEASED", {
            col: A.chapter.color,
            size: 22,
          });
        } else {
          p.x = Math.min(p.x, zone.gate - 32);
          if (p.x >= zone.gate - 34 && p.vx > 0) p.vx = 0;
        }
        break; // one encounter at a time, even with a very fast dash
      }
    }
    for (const h of A.hazards) {
      const cycle = (A.t + h.phase) % 3.6;
      h.active = h.type !== "laser" || cycle > 2.15;
      h.warning = h.type === "laser" && cycle > 1.5 && cycle <= 2.15;
      const cx =
        h.x + (h.type === "saw" ? Math.sin(A.t * 1.6 + h.phase) * 60 : 0);
      const tall = h.type === "laser" ? 145 : h.type === "saw" ? 64 : 26;
      if (
        h.active &&
        p.x + p.w / 2 > cx &&
        p.x - p.w / 2 < cx + h.w &&
        p.y > W.groundY - tall &&
        p.y - p.h < W.groundY
      )
        G.hurtPlayer(h.type === "laser" ? 18 : 14, p.x < cx ? -1 : 1, "hazard");
    }
    for (const s of A.shards) {
      if (!s.collected && U.dist(p.x, p.y - 40, s.x, s.y) < 52) {
        s.collected = true;
        G.addScore(75, s.x, s.y - 20, false);
        p.addEnergy(5);
        F.burst(s.x, s.y, { n: 9, col: "yellow", spd: 140, life: 0.4 });
        NR.audio.sample("shard");
      }
    }
    A.prompt = null;
    const cache = A.caches.find(
      (c) => !c.open && Math.abs(p.x - c.x) < 95 && p.y > W.groundY - 80,
    );
    if (cache)
      A.prompt = { label: "OPEN SUPPLY CACHE", kind: "cache", object: cache };
    const relay = A.relays.find(
      (r) =>
        !r.active &&
        Math.abs(p.x - r.x) < 110 &&
        p.y > W.groundY - 90 &&
        A.zones.slice(0, r.id + 1).every((z) => z.cleared),
    );
    if (relay)
      A.prompt = {
        label: "ACTIVATE RELAY / SAVE",
        kind: "relay",
        object: relay,
      };
    const exitReady =
      A.relays.every((r) => r.active) && A.zones.every((z) => z.cleared);
    A.exitWarnT = Math.max(0, (A.exitWarnT || 0) - dt);
    const remaining = () => {
      const r = A.relays.filter((x) => x.active).length;
      const z = A.zones.filter((x) => x.cleared).length;
      return `GATE LOCKED · RELAYS ${r}/3 · PATROLS ${z}/4 — track the ◆ markers`;
    };
    if (p.x > W.W - 340) {
      A.prompt = {
        label: exitReady ? "EXTRACTION GATE — WALK THROUGH" : remaining(),
        kind: exitReady ? "exit" : "locked",
      };
      // THE FIX: reaching the end with everything cleared FINISHES the level —
      // no hidden button press required, just a short victory cinematic.
      if (exitReady && !A.finishing) {
        A.finishing = 1.15;
        G.banner("CHAPTER COMPLETE", "The gate opens — well fought, ronin.", "#d5fa5b");
        NR.audio.sample("victory");
        G.slowmo(0.35, 1.0);
        F.ring(p.x, p.y - 60, { col: "yellow", r1: 520, life: 0.9, lw: 12 });
      } else if (!exitReady && A.exitWarnT <= 0) {
        A.exitWarnT = 4;
        NR.hub.notify(remaining());
      }
    }
    if (A.finishing) {
      A.finishing -= dt;
      p.vx = U.damp(p.vx, 60, 4, dt);
      if (U.chance(dt * 18)) F.burst(W.W - 230 + U.rand(-40, 40), W.groundY - U.rand(0, 180), { n: 2, col: "yellow", spd: 90, life: 0.6, grav: -50 });
      if (A.finishing <= 0) { A.finishing = 0; completeChapter(G); return; }
    }
    if (A.prompt && NR.input.justPressed("interact")) {
      const { kind, object: o } = A.prompt;
      if (kind === "cache") {
        o.open = true;
        p.heal(25);
        p.addEnergy(20);
        G.addScore(200, o.x, W.groundY - 100, true);
        NR.audio.sample("cache");
        F.burst(o.x, W.groundY - 45, {
          n: 20,
          col: "yellow",
          spd: 180,
          life: 0.7,
        });
        NR.hub.notify("SUPPLIES · +25 HP · +20 ENERGY · +200 BASE SCORE");
        if (A.caches.every((c) => c.open)) NR.progress.award("cache");
      } else if (kind === "relay") {
        o.active = true;
        NR.economy.applyXp(30,"Relay restored");
        p.heal(20);
        p.dashCharges = p.dashMax;
        p.tacticalCd = 0;
        p.kunaiCharges = 3;
        p.kunaiChargeT = 0;
        G.addScore(500, o.x, W.groundY - 145, true);
        NR.audio.sample("checkpoint");
        NR.progress.award("relay");
        A.pendingCheckpoint = true;
        NR.checkpoint.save(G, A);
        G.state = "upgrade";
        NR.ui.openUpgrades(NR.upgrades.roll(p), G);
        document.getElementById("up-title").textContent =
          "RELAY RESTORED — CHOOSE AN UPGRADE";
        return;
      } else if (kind === "exit") {
        A.finishing = 0;
        completeChapter(G);
        return;
      } else
        NR.hub.notify(
          "Activate every relay before extracting. Follow the map markers.",
        );
      A.prompt = null;
    }
  };
  /* shared chapter-completion: score, awards, unlock, checkpoint clear, victory */
  function completeChapter(G) {
    const last = A.chapters.length - 1;
    G.score += 1500 + G.chapter * 500; // deeper chapters pay more
    NR.progress.award("escape");
    if (G.chapter >= last) NR.progress.award("zero");
    NR.profile.unlocked = Math.max(
      NR.profile.unlocked,
      Math.min(last, G.chapter + 1),
    );
    NR.saveProfile();
    if (NR.evolution) { NR.evolution.levels[G.chapter]=Math.min(100000,NR.evolution.levels[G.chapter]+1); NR.evolution.save(); }
    NR.checkpoint.clear();
    NR.audio.sample("victory");
    G.finishRun(true);
  }
  A.completeForTest = completeChapter;
  A.checkpointAfterUpgrade = function (G) {
    if (A.pendingCheckpoint) {
      A.pendingCheckpoint = false;
      NR.checkpoint.save(G, A);
      NR.hub.notify(
        NR.store.persistent
          ? "CHECKPOINT SAVED · Your upgrade is secured on this device."
          : "STORAGE BLOCKED · Checkpoint lasts only while this tab stays open.",
      );
    }
  };
  A.objective = function () {
    const active = A.zones.find((z) => z.started && !z.cleared);
    if (active) return "CLEAR THE PATROL TO RELEASE THE BARRIER";
    const relay = A.relays.find((r) => !r.active);
    return relay
      ? "RESTORE RELAY " + (relay.id + 1) + " / 3  →"
      : "REACH THE EXTRACTION GATE  →";
  };
  A.drawScenery = function (ctx, cam, view) {
    if (!A.active) return;
    const biome = A.chapter.biome;
    ctx.save();
    if (biome === "garden") {
      const start = Math.floor(cam.x / 260) * 260;
      for (let x = start - 260; x < cam.x + view.w + 260; x += 260) {
        const height = 170 + Math.sin(x) * 65;
        ctx.fillStyle = "#173d32aa";
        ctx.fillRect(x, W.groundY - height, 14, height);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(
            x + 7 + Math.sin(i + x) * 40,
            W.groundY - height + i * 26,
            80 - i * 9,
            37,
            Math.sin(i) * 0.3,
            0,
            U.TAU,
          );
          ctx.fill();
        }
      }
      for (const p of W.platforms) {
        ctx.strokeStyle = "#55a87888";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x + 30, p.y + 20);
        ctx.bezierCurveTo(
          p.x + 15,
          p.y + 60,
          p.x + 55,
          p.y + 80,
          p.x + 25,
          p.y + 112,
        );
        ctx.stroke();
      }
    } else if (biome === "reactor") {
      for (
        let x = Math.floor(cam.x / 600) * 600 - 600;
        x < cam.x + view.w + 600;
        x += 600
      ) {
        ctx.fillStyle = "#241e28";
        ctx.fillRect(x + 12, 180, 36, W.groundY - 180);
        ctx.strokeStyle = "#b16d3633";
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.arc(x + 270, 430, 140, 0, U.TAU);
        ctx.stroke();
        ctx.save();
        ctx.translate(x + 270, 430);
        ctx.rotate(A.t * 0.25);
        ctx.strokeStyle = "#d38c4433";
        ctx.lineWidth = 24;
        for (let i = 0; i < 6; i++) {
          ctx.rotate(U.TAU / 6);
          ctx.beginPath();
          ctx.moveTo(22, 0);
          ctx.lineTo(119, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  };
  A.draw = function (ctx, cam, view) {
    if (!A.active) return;
    const gy = W.groundY;
    const visible = (x) => x > cam.x - 200 && x < cam.x + view.w + 200;
    ctx.save();
    // Original salvage crates: visually distinct from interactable supply caches.
    for (const o of A.props) {
      if (!visible(o.x)) continue;
      if (o.broken) {
        ctx.fillStyle = "#736341";
        ctx.fillRect(o.x - 23, gy - 7, 17, 7);
        ctx.fillRect(o.x + 6, gy - 5, 20, 5);
        continue;
      }
      ctx.fillStyle = "#544c35";
      ctx.fillRect(o.x - 25, gy - 52, 50, 52);
      ctx.strokeStyle = "#c8a765";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x - 23, gy - 50, 46, 48);
      ctx.beginPath();
      ctx.moveTo(o.x - 20, gy - 47);
      ctx.lineTo(o.x + 20, gy - 6);
      ctx.moveTo(o.x + 20, gy - 47);
      ctx.lineTo(o.x - 20, gy - 6);
      ctx.stroke();
      ctx.fillStyle = "#121e24";
      ctx.fillRect(o.x - 18, gy - 39, 36, 22);
      ctx.fillStyle = "#ffe0a1";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("LOOT", o.x, gy - 24);
      if (o.hp < 28) {
        ctx.fillStyle = "#f4ca7b";
        ctx.fillRect(o.x - 23, gy - 58, (46 * o.hp) / 28, 3);
      }
    }
    // Industrial kit props, styled with our palette and animated lights.
    for (const c of A.caches) {
      if (!visible(c.x)) continue;
      NR.atlas.draw(ctx, c.open ? 43 : 57, c.x - 29, gy - 58, 58, 58);
      if (!c.open) {
        ctx.fillStyle = "#d5fa5b";
        ctx.fillRect(c.x - 13, gy - 36, 26, 4);
      }
    }
    for (const r of A.relays) {
      if (!visible(r.x)) continue;
      NR.atlas.draw(ctx, 73, r.x - 38, gy - 98, 76, 78);
      NR.atlas.draw(ctx, r.active ? 53 : 39, r.x - 16, gy - 131, 32, 30);
      ctx.fillStyle = r.active ? "#bafa72" : "#6adaff";
      ctx.fillRect(r.x - 24, gy - 82, 48, 26);
      ctx.fillStyle = "#12251d";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.fillText(r.active ? "ONLINE" : "0" + (r.id + 1), r.x, gy - 63);
      ctx.strokeStyle = r.active ? "#a3ed7733" : "#7adaff55";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.x, gy - 106, 31 + Math.sin(A.t * 3) * 5, 0, U.TAU);
      ctx.stroke();
    }
    for (const zone of A.zones) {
      if (!visible(zone.gate)) continue;
      NR.atlas.draw(ctx, 106, zone.gate - 20, gy - 48, 40, 48);
      if (!zone.cleared) {
        ctx.fillStyle = zone.started ? "#ff6a7566" : "#8dd8e822";
        ctx.fillRect(zone.gate - 3, gy - 235, 6, 235);
        ctx.fillStyle = "#2b3c49";
        ctx.fillRect(zone.gate - 15, gy - 243, 30, 12);
      }
    }
    for (const h of A.hazards) {
      if (!visible(h.x)) continue;
      if (h.type === "spikes") {
        NR.atlas.draw(ctx, 52, h.x, gy - 27, 50, 27);
        NR.atlas.draw(ctx, 52, h.x + 50, gy - 27, 50, 27);
      } else if (h.type === "saw") {
        ctx.save();
        ctx.translate(h.x + 50 + Math.sin(A.t * 1.6 + h.phase) * 60, gy - 32);
        ctx.rotate(A.t * 3);
        NR.atlas.draw(ctx, 67, -32, -32, 64, 64);
        ctx.restore();
      } else {
        NR.atlas.draw(ctx, 65, h.x, gy - 12, h.w, 12);
        ctx.fillStyle = h.active
          ? "#ff774788"
          : h.warning
            ? "#ffc97166"
            : "#ff8e4511";
        ctx.fillRect(h.x + 8, gy - 145, h.w - 16, 133);
        if (h.active) {
          ctx.strokeStyle = "#ffd4a1";
          ctx.lineWidth = 2;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(h.x + 16 + i * 17, gy - 15);
            ctx.lineTo(
              h.x + 16 + i * 17 + Math.sin(A.t * 30 + i) * 5,
              gy - 139,
            );
            ctx.stroke();
          }
        }
      }
    }
    for (const s of A.shards) {
      if (s.collected || !visible(s.x)) continue;
      ctx.save();
      ctx.translate(s.x, s.y + Math.sin(A.t * 3 + s.id) * 5);
      ctx.rotate(A.t * 0.8);
      ctx.fillStyle = "#d5fa5b";
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const ex = W.W - 230;
    if (visible(ex)) {
      const ready =
        A.relays.every((r) => r.active) && A.zones.every((z) => z.cleared);
      // beacon: a column of light you can see from across the map
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const beam = ctx.createLinearGradient(0, gy - 700, 0, gy);
      const beamCol = ready ? "213,250,91" : "90,110,124";
      beam.addColorStop(0, `rgba(${beamCol},0)`);
      beam.addColorStop(1, `rgba(${beamCol},${ready ? 0.34 : 0.12})`);
      ctx.fillStyle = beam;
      ctx.fillRect(ex - 60, gy - 700, 120, 700);
      if (ready) {
        const pulse = 0.5 + Math.sin(A.t * 4) * 0.25;
        NR.sprites.drawGlow(ctx, "yellow", ex, gy - 96, 70 * pulse, 0.5);
      }
      ctx.restore();
      ctx.fillStyle = "#172c38";
      ctx.fillRect(ex - 50, gy - 190, 100, 190);
      ctx.strokeStyle = ready ? "#d5fa5b" : "#688292";
      ctx.lineWidth = 4;
      ctx.strokeRect(ex - 44, gy - 184, 88, 179);
      NR.atlas.draw(ctx, 70, ex - 24, gy - 125, 48, 48);
      ctx.fillStyle = ready ? "#d5fa5b22" : "#0a111d";
      ctx.fillRect(ex - 38, gy - 175, 76, 165);
      // marching arrows into the gate when it's open
      if (ready) {
        ctx.fillStyle = `rgba(213,250,91,${0.5 + Math.sin(A.t * 6) * 0.3})`;
        for (let i = 0; i < 3; i++) {
          const ay = gy - 60 - i * 46 - ((A.t * 40) % 46);
          ctx.beginPath();
          ctx.moveTo(ex - 14, ay);
          ctx.lineTo(ex, ay - 16);
          ctx.lineTo(ex + 14, ay);
          ctx.lineTo(ex, ay - 7);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.font = "bold 20px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = ready ? "#d5fa5b" : "#9eaebb";
      ctx.fillText(ready ? "LEVEL EXIT — ENTER" : "EXTRACTION (LOCKED)", ex, gy - 207);
      if (!ready) {
        const r = A.relays.filter((x) => x.active).length;
        const z = A.zones.filter((x) => x.cleared).length;
        ctx.font = "bold 13px monospace";
        ctx.fillText(`RELAYS ${r}/3 · PATROLS ${z}/4`, ex, gy - 226);
      }
    }
    ctx.restore();
  };
})();
