/* ============ GAME MODES — WAVE CLIMB · SURVIVAL RUN (single-player) ============
   WAVE CLIMB (mode "climb") — waves + climb-up merged, endless:
     · every floor is an arena with a laser gate on the right
     · clear the wave → pick an upgrade → the gate opens
     · run forward (Mario-style), then climb the route (stairs / zigzag /
       lift / bridge) to the portal checkpoint on the next floor
     · touching the portal locks the new floor in: it becomes the ground,
       you can never fall back below it
     · each early wave is ONE enemy family (easy → hard); later waves mix
       2–3 families that get stronger — NOT more numerous (max 8 alive)
     · a boss every 5th floor
   SURVIVAL RUN (mode "run") — endless forward side-scroller:
     · chunks with pits, platforms, moving lifts and enemy squads ahead
     · campfire checkpoints every 4 chunks (respawn point + upgrade)
     · a boss arena every 5th checkpoint

   Coordinates stay bounded forever: at every checkpoint the world is
   re-based (everything shifts by the same offset, camera included), so
   endless play never reaches huge numbers.

   The previous online co-op / PvP synchronization was removed — this file
   is now pure single-player gameplay. */
(function () {
  const U = NR.util, W = NR.world;
  const MD = (NR.modes = { active: false, kind: null, floor: 0, originX: 0, originY: 0 });
  const GY = 880, FH = 520;
  MD.FH = FH;
  const PORTAL = "super/GandalfHardcore FREE Platformer Assets/Animated Sprites/GandalfHardcore Portal sheet.png";
  const CAMPFIRE = "super/GandalfHardcore FREE Platformer Assets/Animated Sprites/Campfire sheet.png";
  const MAX_ALIVE = 8;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  MD.rng = rng;

  /* ================= wave roster ================= */
  const ROSTER = ["crawler", "slime", "soldier", "drone", "BOSS",
                  "gunner", "wraith", "warlock", "rival", "BOSS",
                  "striker", "blade", "brute", "apparition", "BOSS"];
  const POOL_A = ["soldier", "drone", "gunner", "wraith", "warlock", "rival"];
  const POOL_B = ["gunner", "warlock", "rival", "striker", "blade", "brute", "apparition", "sentinel"];
  MD.ROSTER = ROSTER;
  MD.waveComp = function (n, players, seed) {
    players = Math.max(1, players || 1);
    const boss = n % 5 === 0;
    const r = rng((seed || 1) * 31 + n * 977);
    let types;
    if (boss) types = [n <= 5 ? "crawler" : n <= 10 ? "gunner" : n <= 15 ? "blade" : POOL_B[(r() * POOL_B.length) | 0]];
    else if (n <= ROSTER.length) types = [ROSTER[n - 1]];
    else {
      const k = n < 26 ? 2 : 3, pool = n < 26 ? POOL_A.concat(POOL_B) : POOL_B;
      types = [];
      while (types.length < k) { const t = pool[(r() * pool.length) | 0]; if (!types.includes(t)) types.push(t); }
    }
    // stronger, not more: the count grows slowly and is hard-capped
    const count = boss ? Math.min(1 + Math.floor(n / 10), 3) : Math.min(4 + Math.floor(n / 8) + (players - 1), MAX_ALIVE);
    return { boss, types, count };
  };
  MD.statMul = function (n, players, difficulty) {
    const d = difficulty === "casual" ? 0.75 : difficulty === "hard" ? 1.35 : 1;
    return {
      hp: (1 + 0.14 * (n - 1)) * d,
      spd: (1 + Math.min(0.45, 0.025 * (n - 1))) * (difficulty === "casual" ? 0.85 : difficulty === "hard" ? 1.15 : 1),
      dmg: 1 + 0.06 * (n - 1),
      elite: n > 10 ? Math.min(0.35, (n - 10) * 0.03) : 0,
    };
  };

  /* ================= WAVE CLIMB floor generator ================= */
  MD.buildFloor = function (f, seed) {
    const r = rng((seed || 1) + f * 7919);
    const AW = 1800 + Math.round(r() * 3) * 200;               // arena width varies per floor
    const plats = [];
    const np = 2 + ((r() * 2) | 0);
    for (let i = 0; i < np; i++) {
      const w = 260 + r() * 140;
      const x = 180 + ((AW - 520) * (i + 0.5)) / np - w / 2 + (r() - 0.5) * 100;
      plats.push({ x: Math.round(x), y: Math.round(700 - (i % 2) * 150 - r() * 30), w: Math.round(w), h: 22 });
    }
    const run = 380 + Math.round(r() * 620);                    // forward stretch first…
    const styles = ["stairs", "zigzag", "lift", "bridge"];
    const style = f === 0 ? "stairs" : styles[(r() * styles.length) | 0];
    const X0 = AW + run;
    const route = [];
    let LX;
    if (style === "stairs") {
      let x = X0, y = GY;
      for (let s = 0; s < 3; s++) { y -= 130; route.push({ x: Math.round(x), y, w: 230, h: 22 }); x += 250 + r() * 70; }
      LX = Math.round(x);
    } else if (style === "zigzag") {
      for (let s = 0; s < 3; s++) route.push({ x: X0 + (s % 2 ? 330 : 0), y: GY - 130 * (s + 1), w: 220, h: 22 });
      LX = X0 + 640;
    } else if (style === "lift") {
      route.push({ x: X0, y: GY - 130, w: 200, h: 22 });
      route.push({ x: X0 + 280, y: GY - 300, baseX: X0 + 280, baseY: GY - 300, w: 220, h: 22, moving: true, ampX: 0, ampY: 150, phase: 0 });
      LX = X0 + 560;
    } else {
      route.push({ x: X0, y: GY - 130, w: 220, h: 22 });
      route.push({ x: X0 + 280, y: GY - 260, w: 200, h: 22 });
      for (let s = 0; s < 3; s++) route.push({ x: X0 + 560 + s * 230, y: GY - 390, w: 150, h: 22 });
      LX = X0 + 560 + 3 * 230 + 20;
    }
    const landing = { x: LX, y: GY - FH, w: 2800, h: 26, landing: true };
    return { f, AW, plats, route, landing, LX, flagX: LX + 200, style };
  };

  /* ================= SURVIVAL RUN chunk generator ================= */
  const CHUNK = 1400;
  MD.buildChunk = function (k, seed) {
    const r = rng((seed || 1) * 13 + k * 104729);
    const c = { k, len: CHUNK, plats: [], pit: null, squad: null, cp: (k > 0 && k % 4 === 0), spawned: false };
    if (k >= 1 && !c.cp && r() < 0.65) {
      const w = 150 + Math.round(r() * 110);
      c.pit = { x: 500 + Math.round(r() * 500), w };
      c.plats.push({ x: c.pit.x - 40, y: GY - 150 - Math.round(r() * 60), w: c.pit.w + 80, h: 22 }); // safety bridge
    }
    const np = 1 + ((r() * 2) | 0);
    for (let i = 0; i < np; i++) {
      const moving = k > 2 && r() < 0.3;
      const x = 150 + Math.round(r() * 1000), y = GY - 200 - Math.round(r() * 200);
      c.plats.push(Object.assign({ x, y, w: 200 + Math.round(r() * 120), h: 22 },
        moving ? { moving: true, baseX: x, baseY: y, ampX: 80 + r() * 60, ampY: 20, phase: r() * 6 } : {}));
    }
    const tier = Math.floor(k / 4) + 1;                // one "wave number" per checkpoint section
    if (k >= 1 && !c.cp) {
      const comp = MD.waveComp(tier % 5 === 0 ? tier + 1 : tier, 1, seed + k);
      c.squad = { tier, types: comp.types, count: Math.min(2 + Math.floor(tier / 4), 5) };
    }
    c.boss = c.cp && (k / 4) % 5 === 0;               // every 5th checkpoint
    return c;
  };

  /* ================= start / reset ================= */
  MD.seedFor = function () { return ((Math.random() * 4294967296) >>> 0) >>> 0; };

  MD.start = function (G) {
    MD.kind = G.mode;
    MD.active = G.mode === "climb" || G.mode === "run";
    W.originX = W.originY = 0; MD.originX = MD.originY = 0;
    W.pits = [];
    if (!MD.active) return;
    MD.seed = MD.seedFor(G);
    MD.t = 0; MD.floor = 0; MD.state = "countdown"; MD.stateT = 1.4;
    MD.reviveT = 0;
    MD.cpIndex = 0; MD.chunks = []; MD.cpX = 200; MD.bossLock = null;
    G.maxAlive = MAX_ALIVE;
    NR.assets?.preload?.([PORTAL, CAMPFIRE]);
    const p = G.player;
    if (MD.kind === "climb") {
      MD.fl = MD.buildFloor(0, MD.seed);
      applyFloor(G);
      p.x = 200;
      G.banner("WAVE CLIMB", "clear the wave · open the gate · climb higher", "#7dfff3");
    } else if (MD.kind === "run") {
      MD.runBase = 0;                     // absolute x where chunk 0 starts
      for (let k = 0; k < 4; k++) addChunk();
      rebuildRun();
      p.x = 200;
      G.banner("SURVIVAL RUN", "keep moving forward · campfires save you", "#ffd36e");
      MD.state = "run";
    }
    p.y = GY; p.prevBottom = GY; p.computePose?.();
    MD.cpX = p.x;
  };

  /* ---------- climb helpers ---------- */
  function applyFloor(G) {
    const fl = MD.fl;
    W.platforms = fl.plats.map((q) => ({ ...q })).concat(fl.route.map((q) => ({ ...q })), [{ ...fl.landing }]);
    W.W = fl.AW;                           // gate locked
    MD.gateOpen = false;
    MD.state = "countdown"; MD.stateT = 1.4;
  }

  /* ---------- run helpers ---------- */
  function addChunk() {
    const k = MD.chunks.length ? MD.chunks[MD.chunks.length - 1].k + 1 : 0;
    const c = MD.buildChunk(k, MD.seed);
    c.x = MD.chunks.length ? MD.chunks[MD.chunks.length - 1].x + CHUNK : 0; // local x
    MD.chunks.push(c);
  }
  function rebuildRun() {
    W.platforms = [];
    W.pits = [];
    for (const c of MD.chunks) {
      for (const q of c.plats) {
        const pl = { ...q, x: q.x + c.x };
        if (pl.moving) pl.baseX = q.baseX + c.x;
        W.platforms.push(pl);
      }
      if (c.pit) W.pits.push({ x: c.pit.x + c.x, w: c.pit.w });
    }
    const last = MD.chunks[MD.chunks.length - 1];
    W.W = MD.bossLock != null ? MD.bossLock : last.x + CHUNK;
  }

  /* ================= world re-base ================= */
  const SHIFT_KEYS = /^(home|base|target|anchor|start|patrol|origin|dest|spawn|guard)[XY]$|^(tx|ty|hx|hy)$/;
  function shiftObj(o, sx, sy) {
    if (!o) return;
    if (typeof o.x === "number") o.x += sx;
    if (typeof o.y === "number") o.y += sy;
    for (const k of Object.keys(o)) {
      if (!SHIFT_KEYS.test(k) || typeof o[k] !== "number") continue;
      o[k] += /Y$|y$/.test(k) ? sy : sx;
    }
  }
  MD.shiftWorld = function (G, sx, sy) {
    const p = G.player;
    shiftObj(p, sx, sy); p.prevBottom = p.y;
    if (typeof p.petX === "number") { p.petX += sx; p.petY += sy; }
    for (const arr of [G.enemies, G.pickups, G.bolts, G.shots, G.shockwaves, G.corpses || []]) for (const e of arr) shiftObj(e, sx, sy);
    for (const arr of [NR.fx.parts, NR.fx.texts, NR.fx.slashes]) for (const e of arr) shiftObj(e, sx, sy);
    for (const g of NR.fx.ghosts || []) shiftObj(g.pose, sx, sy);
    G.cam.x += sx; G.cam.y += sy;
    W.originX -= sx; W.originY -= sy;
    MD.originX = W.originX; MD.originY = W.originY;
    MD.cpX += sx;
  };
  MD.toAbs = (x, y) => [Math.round(x + (W.originX || 0)), Math.round(y + (W.originY || 0))];
  MD.toLocal = (x, y) => [x - (W.originX || 0), y - (W.originY || 0)];

  /* ================= waves (climb) ================= */
  function beginWave(G, n) {
    G.wave = n; G.netWave = n; G.waveDamageTaken = false;
    const m = MD.statMul(n, 1, G.difficulty);
    G.enemyHpMul = m.hp; G.enemySpdMul = m.spd; G.enemyDmgMul = m.dmg; MD.eliteChance = m.elite;
    const comp = MD.waveComp(n, 1, MD.seed);
    const queue = []; let d = 0.5;
    for (let i = 0; i < comp.count; i++) queue.push({ type: comp.types[i % comp.types.length], t: (d += U.rand(0.45, 0.9)), netId: "e" + (++G.netSeq) });
    for (const s of queue) G.spawnQueue.push({ type: s.type, t: s.t, netId: s.netId });
    if (comp.boss) spawnBoss(G, n, W.W * 0.7);
    else G.banner("FLOOR " + (MD.floor + 1) + " · WAVE " + n, comp.types.map((t) => t.toUpperCase()).join(" + "), "#00fff4");
    NR.audio.play("wave");
    MD.state = "fight";
  }
  function spawnBoss(G, n, x) {
    const m = Math.ceil(n / 5);
    const def = NR.bossDefs ? NR.bossDefs.forMilestone(G.chapter || 0, NR.levelsys ? NR.levelsys.currentLevel() : 1, m) : { skin: "mech", name: "SHOGUN-9" };
    const boss = NR.bossDefs ? NR.bossDefs.spawn(def, x, G.enemyHpMul, m) : new NR.Boss(x, W.groundY, G.enemyHpMul, m, "mech");
    boss.spawnT = 0; boss.netId = "boss" + n;
    G.enemies.push(boss); G.bossRef = boss; G.bossActive = true;
    G.banner("⚠ " + (boss.bossName || "BOSS") + " ⚠", "FLOOR " + (MD.floor + 1) + " guardian", "#ff2d95");
    NR.audio.play("bossIntro"); G.shake(0.5);
  }
  function openGate(G) {
    if (MD.gateOpen) return;
    MD.gateOpen = true; MD.state = "climb";
    W.W = MD.fl.LX + MD.fl.landing.w;
    NR.audio.play("gateOpen");
    G.banner("GATE OPEN", "go forward and climb to the portal ↑", "#b4e784");
  }
  function nextFloor(G) {
    const fl = MD.fl;
    // the whole world is brought up: nobody can fall back below a reached floor
    MD.shiftWorld(G, -fl.LX, FH);
    MD.floor++;
    MD.fl = MD.buildFloor(MD.floor, MD.seed);
    applyFloor(G);
    const p = G.player;
    // a player who lagged behind (still below) is lifted onto the new floor
    if (p.y > GY + 10 || p.x > MD.fl.AW - 40) { p.x = 160 + Math.random() * 80; p.y = GY; p.vy = 0; p.prevBottom = GY; }
    MD.cpX = 200;
    NR.audio.play("floorUp");
    G.banner("FLOOR " + (MD.floor + 1), "checkpoint locked — you can't fall below", "#ffe14d");
    G.addScore(300 + MD.floor * 50, p.x, p.y - 120, true);
    // floor clear is a natural break — a spaced interstitial may play here
    NR.crazy?.showMidgame?.("floor-checkpoint");
  }

  /* ================= run checkpoint ================= */
  function reachCampfire(G, c) {
    if (c.reached) return;
    c.reached = true;
    MD.cpIndex = c.k / 4;
    const cpLocal = c.x + 700;
    NR.audio.play("checkpointReach");
    G.banner("CHECKPOINT " + MD.cpIndex, c.boss ? "a guardian blocks the road!" : "respawn point saved", "#ffd36e");
    G.player.heal?.(20);
    // re-base: the campfire becomes x≈300
    const sx = -(cpLocal - 300);
    MD.shiftWorld(G, sx, 0);
    for (const ch of MD.chunks) ch.x += sx;
    MD.chunks = MD.chunks.filter((ch) => ch.x + CHUNK > -1600);
    for (const e of G.enemies) if (!e.boss && e.x < -400) e.dead = true;
    MD.cpX = 300;
    const p = G.player;
    if (p.x < 200) { p.x = 300; p.y = GY; p.vy = 0; p.prevBottom = GY; }
    if (c.boss) {
      const n = MD.cpIndex;                 // boss number grows
      const m = MD.statMul(n * 2, 1, G.difficulty);
      G.enemyHpMul = m.hp; G.enemyDmgMul = m.dmg;
      MD.bossLock = 300 + 1500;             // arena lock until the boss falls
      spawnBoss(G, n * 5, 1300);
    }
    rebuildRun();
    if (!c.boss) { G.upgradeT = Math.max(G.upgradeT || 0, 0.6); }
  }

  /* ================= per-frame update ================= */
  MD.update = function (dt, G) {
    if (!MD.active) return;
    MD.t += dt;
    const p = G.player;
    // moving platforms (carry the player)
    for (const pl of W.platforms) {
      if (!pl.moving) continue;
      const ox = pl.x, oy = pl.y;
      pl.x = pl.baseX + Math.sin(MD.t * 0.8 + pl.phase) * (pl.ampX ?? 0);
      pl.y = pl.baseY + Math.sin(MD.t * 0.9 + pl.phase) * (pl.ampY ?? 0);
      if (p.support === pl && p.onGround) { p.x += pl.x - ox; p.y += pl.y - oy; p.prevBottom = p.y; }
    }
    // pits (run): falling costs HP and respawns you at the checkpoint
    if (!p.dead && p.y > GY + 260) pitFall(G);
    for (const e of G.enemies) if (!e.dead && e.y > GY + 400) { e.hp = 0; e.dead = true; }

    if (MD.kind === "climb") updateClimb(dt, G);
    else if (MD.kind === "run") updateRun(dt, G);
  };

  function updateClimb(dt, G) {
    const p = G.player, fl = MD.fl;
    if (MD.state === "countdown") {
      MD.stateT -= dt;
      if (MD.stateT <= 0) beginWave(G, MD.floor + 1);
    } else if (MD.state === "fight") {
      if (!G.bossActive && G.enemies.length === 0 && G.spawnQueue.length === 0 && !p.dead) {
        MD.clearT = (MD.clearT || 0) + dt;
        if (MD.clearT > 0.6) {
          MD.clearT = 0; MD.state = "cleared";
          G.waveCleared?.();                 // perfect bonus, heal, upgrade pick
          openGate(G);
        }
      } else MD.clearT = 0;
    } else if (MD.state === "climb") {
      if (!p.dead && touchingPortal(p)) nextFloor(G);
    }
  }
  function touchingPortal(p) {
    const fl = MD.fl;
    return Math.abs(p.x - fl.flagX) < 70 && Math.abs(p.y - fl.landing.y) < 30;
  }

  function updateRun(dt, G) {
    const p = G.player;
    // stream chunks ahead (bounded: old chunks are dropped at checkpoints)
    while (MD.chunks.length && MD.chunks[MD.chunks.length - 1].x < p.x + 3200) { addChunk(); rebuildRun(); }
    if (MD.bossLock != null && !G.bossActive) { MD.bossLock = null; rebuildRun(); G.upgradeT = Math.max(G.upgradeT || 0, 0.8); }
    for (const c of MD.chunks) {
      if (c.squad && !c.spawned && p.x > c.x - 700) {
        c.spawned = true;
        const m = MD.statMul(c.squad.tier, 1, G.difficulty);
        G.enemyHpMul = m.hp; G.enemySpdMul = m.spd; G.enemyDmgMul = m.dmg; MD.eliteChance = m.elite;
        let d = 0.1;
        for (let i = 0; i < c.squad.count; i++) {
          const lx = c.x + 250 + i * (900 / c.squad.count);
          G.spawnQueue.push({ type: c.squad.types[i % c.squad.types.length], t: (d += 0.25), netId: "e" + (++G.netSeq), x: lx });
        }
      }
      if (c.cp && !c.reached && p.x > c.x + 700 && !p.dead) reachCampfire(G, c);
    }
    G.wave = Math.max(G.wave, MD.cpIndex + 1);
    G.runDist = Math.max(G.runDist || 0, Math.round((p.x + W.originX) / 100));
  }

  function pitFall(G) {
    const p = G.player;
    NR.audio.play("pitFall");
    p.x = Math.max(80, MD.cpX); p.y = GY - 10; p.vx = p.vy = 0; p.prevBottom = p.y;
    if (MD.kind === "climb") return;       // climb has solid floors; safety only
    const dmg = Math.round(p.maxHp * 0.25);
    p.hp -= dmg; p.iframes = 1.5;
    NR.vfx?.text?.(p.x, p.y - 110, "-" + dmg, { col: "#ff5f7a", size: 24, crit: true });
    if (p.hp <= 0) { p.hp = 0; p.dead = true; G.deathT = 1.2; NR.audio.play("pdie"); }
  }

  /* ================= death / respawn hooks ================= */
  /* returns true when the mode handled the death (no game-over screen) */
  MD.onDeath = function () { return false; };
  MD.tickRevive = function (dt, G) {
    if (!MD.reviveT) return;
    MD.reviveT -= dt;
    if (MD.reviveT <= 0) {
      MD.reviveT = 0;
      const p = G.player;
      p.dead = false; p.hp = Math.round(p.maxHp * 0.6); p.iframes = 2.5;
      MD.respawnPoint(p);
      G.overShown = false; G.deathT = 0;
      NR.audio.play("revive");
      G.banner("BACK IN", "respawned at the checkpoint", "#b4e784");
    }
  };
  MD.respawnPoint = function (p) {
    if (MD.kind === "run") { p.x = Math.max(80, MD.cpX); }
    else if (MD.kind === "climb") { p.x = Math.min(Math.max(120, p.x), (MD.fl ? MD.fl.AW : 1800) - 120); if (MD.gateOpen) p.x = 200; }
    p.y = GY; p.vx = p.vy = 0; p.prevBottom = GY;
  };

  /* solo play: enemies always chase the local player */
  MD.targetFor = function () { return null; };

  /* ================= drawing ================= */
  function drawSheet(ctx, path, frame, cols, fw, fh, row, x, y, w, h) {
    const img = NR.assets?.get?.(path);
    if (!img) return false;
    ctx.drawImage(img, (frame % cols) * fw, (row || 0) * fh, fw, fh, x, y, w, h);
    return true;
  }
  MD.draw = function (ctx, cam, view) {
    if (!MD.active) return;
    const t = MD.t || 0;
    ctx.save();
    // pits (run): paint the abyss over the ground
    for (const pit of W.pits || []) {
      if (pit.x + pit.w < cam.x - 20 || pit.x > cam.x + view.w + 20) continue;
      const g = ctx.createLinearGradient(0, GY, 0, GY + 300);
      g.addColorStop(0, "#02030a"); g.addColorStop(1, "#000");
      ctx.fillStyle = g;
      ctx.fillRect(pit.x, GY - 2, pit.w, Math.max(400, cam.y + view.h - GY + 40));
      ctx.fillStyle = "#ffcc33";
      for (let x = pit.x; x < pit.x + pit.w; x += 28) ctx.fillRect(x, GY - 4, 14, 4);
    }
    if (MD.kind === "climb" && MD.fl) {
      const fl = MD.fl;
      // gate (laser curtain) while the wave is alive
      if (!MD.gateOpen) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = `rgba(255,45,149,${0.25 + 0.2 * Math.sin(t * 8 + i)})`;
          ctx.fillRect(fl.AW - 14 + i * 6, 0, 3, GY);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#1a1030"; ctx.fillRect(fl.AW - 22, GY - 40, 40, 40); ctx.fillRect(fl.AW - 22, 0, 40, 30);
      }
      // up arrows on the route once open
      if (MD.gateOpen) {
        ctx.fillStyle = `rgba(180,231,132,${0.5 + 0.4 * Math.sin(t * 5)})`;
        ctx.font = "900 34px Rajdhani"; ctx.textAlign = "center";
        for (const r of fl.route) ctx.fillText("↑", r.x + r.w / 2, r.y - 16);
      }
      // portal checkpoint
      const px = fl.flagX, py = fl.landing.y;
      ctx.globalCompositeOperation = "lighter";
      NR.sprites?.drawGlow?.(ctx, MD.gateOpen ? "cyan" : "purple", px, py - 60, 90, 0.35);
      ctx.globalCompositeOperation = "source-over";
      if (!drawSheet(ctx, PORTAL, Math.floor(t * 10), 10, 64, 64, 0, px - 64, py - 128, 128, 128)) {
        ctx.fillStyle = "#6b3cff"; ctx.beginPath(); ctx.ellipse(px, py - 60, 34, 58, 0, 0, U.TAU); ctx.fill();
      }
      ctx.fillStyle = "#e9f7ff"; ctx.font = "700 14px Rajdhani"; ctx.textAlign = "center";
      ctx.fillText("CHECKPOINT · FLOOR " + (MD.floor + 2), px, py - 138);
    }
    if (MD.kind === "run") {
      for (const c of MD.chunks) {
        if (!c.cp) continue;
        const x = c.x + 700;
        if (x < cam.x - 100 || x > cam.x + view.w + 100) continue;
        if (!drawSheet(ctx, CAMPFIRE, Math.floor(t * 10), 5, 32, 32, 0, x - 40, GY - 76, 80, 80)) {
          ctx.fillStyle = "#ff9d2e"; ctx.fillRect(x - 12, GY - 30, 24, 30);
        }
        ctx.fillStyle = c.reached ? "#b4e784" : "#ffd36e"; ctx.font = "700 14px Rajdhani"; ctx.textAlign = "center";
        ctx.fillText(c.reached ? "SAVED" : c.boss ? "⚠ GUARDIAN CAMP" : "CHECKPOINT", x, GY - 92);
      }
      if (MD.bossLock != null) {
        ctx.fillStyle = `rgba(255,45,149,${0.3 + 0.2 * Math.sin(t * 8)})`;
        ctx.fillRect(MD.bossLock - 6, 0, 6, GY);
      }
    }
    ctx.restore();
  };

  MD.drawHud = function (ctx, G, w, h) {
    if (!MD.active || !G.player) return;
    ctx.save();
    ctx.font = "800 18px Rajdhani"; ctx.textAlign = "center";
    let line = "";
    if (MD.kind === "climb") line = `FLOOR ${MD.floor + 1} · WAVE ${G.wave || MD.floor + 1}` + (MD.gateOpen ? "  ·  CLIMB TO THE PORTAL ↑" : G.bossActive ? "  ·  BOSS" : `  ·  ENEMIES ${G.enemies.length + G.spawnQueue.length}`);
    else if (MD.kind === "run") line = `DISTANCE ${G.runDist || 0}m · CHECKPOINT ${MD.cpIndex}` + (G.bossActive ? "  ·  GUARDIAN" : "");
    const tw = ctx.measureText(line).width + 28;
    ctx.fillStyle = "rgba(4,8,20,0.62)";
    ctx.fillRect(w / 2 - tw / 2, 58, tw, 28);
    ctx.fillStyle = "#dff6ff"; ctx.fillText(line, w / 2, 78);
    if (MD.reviveT > 0) { ctx.font = "900 30px Rajdhani"; ctx.fillStyle = "#ffb37a"; ctx.fillText("RESPAWN IN " + Math.ceil(MD.reviveT), w / 2, h / 2); }
    ctx.restore();
  };
})();
