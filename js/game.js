/* ============ NEON RONIN — game core: states, waves, combat resolution ============ */
(function () {
  const U = NR.util, W = NR.world, F = NR.fx, I = NR.input, hud = NR.hud;

  const G = (NR.game = {
    state: "loading", // loading | menu | playing | upgrade | pause | over
    score: 0, high: Math.max(0, Math.min(1e8, Number(NR.store.getItem("nr_high")) || 0)),
    wave: 0, combo: 0, comboT: 0, time: 0,
    enemies: [], bolts: [], shots: [], shockwaves: [], pickups: [], spawnQueue: [],
    bossActive: false, bossRef: null,
    pvp: false, online: false, levelDef: null, sukunaUsed: false,
    surviveT: 0, surviveBatchT: 0, surviveBossN: 0, netSeq: 0, netWave: 0,
    enemyHpMul: 1, enemySpdMul: 1, enemyDmgMul: 1,
    stats: { kills: 0, maxCombo: 0, storms: 0, parries: 0, kunaiHits: 0, salvaged: 0 },
    timeScale: 1, slowT: 0, hitStopT: 0,
    cam: { x: 0, y: 0, sx: 0, sy: 0, trauma: 0 },
    waveDamageTaken: false, clearT: 0, startT: 0, deathT: 0, overShown: false,
    corpses: [],
  });

  G.comboWindow = () => 4.2 + (G.player.furyBonus || 0);
  G.mult = () => Math.min(1 + G.combo * 0.12, 6);

  /* ================= lifecycle ================= */
  G.toMenu = function () {
    NR.audio?.setMusicMode && NR.audio.setMusicMode("menu"); // back to the menu track
    G.state = "menu";
    G.online = false; G.pvp = false;
    NR.crazy?.gameplayStop();
    I.reset();
    G.enemies.length = 0; G.bolts.length = 0; G.shots.length = 0; G.shockwaves.length = 0;
    G.pickups.length = 0; G.spawnQueue.length = 0; G.corpses.length = 0;
    F.reset();
    NR.ui.show("menu");
    NR.ui.refreshHigh();
    NR.expeditionUI?.refresh();
  };

  G.start = function (options = {}) {
    const cp = options.resume ? NR.checkpoint.get() : null;
    if(options.resume && !cp){NR.hub.notify('No valid checkpoint saved on this device.');return;}
    G.mode=cp?'adventure':NR.profile.mode;
    G.chapter=cp?cp.chapter:(Number.isInteger(options.chapter)?options.chapter:NR.profile.chapter);
    G.chapter=U.clamp(G.chapter,0,NR.profile.unlocked);
    G.character=cp?cp.character:NR.profile.character;
    if(cp?.route && NR.evolution) { NR.evolution.seed=cp.route.seed; NR.evolution.levels[G.chapter]=cp.route.level; NR.evolution.save(); }
    NR.adventure.configure(G.mode,G.chapter); NR.resize?.();
    // never let the hero go invisible: (re)queue every art dependency of the
    // current look + pet + enemy sheets; the renderer rebuilds when they land
    if (NR.assets && NR.assets.preload) {
      NR.assets.preload(NR.assets.layerPaths(NR.profile.appearance));
      if (NR.profile.pet) {
        const po = (NR.catalog.pet || []).find((o) => o.id === NR.profile.pet);
        if (po) NR.assets.preload([po.path]);
      }
      const SHEET_KEYS = ["orc", "soldier", "slime", "slimeGreen", "slimeRed", "wizard", "samurai", "diego", "holly", "gordon"];
      const sheetPaths = [];
      for (const sk of SHEET_KEYS)
        for (const a of Object.keys(NR.sheets[sk].anims)) sheetPaths.push(NR.sheets[sk].anims[a].path);
      NR.assets.preload(sheetPaths);
      // the full rotating texture library (ground/plat/edge/veins per biome)
      const texAll = [];
      for (const k of Object.keys(NR.textures)) texAll.push(...NR.textures[k]);
      NR.assets.preload(texAll);
    }
    NR.audio.init();
    if (!G.player) G.player = new NR.Player();
    G.player.reset();
    NR.applyCharacter(G.player,G.character);
    NR.evolution?.apply(G.player);
    G.rewardLedger = { score: 0, kills: 0, wave: 0, gems: 0, liveXp:0 };
    G.liveXp=0;G.replayKills=0;G.runId=Date.now().toString(36)+Math.random().toString(36).slice(2,10);
    I.reset(); hud.banners.length = 0; hud.hurtVign = 0; hud.flashA = 0;
    G.difficulty = cp ? cp.difficulty : NR.profile.difficulty;
    G.tactical = cp ? cp.tactical : NR.profile.tactical;
    G.runName = NR.profile.name;
    G.chronoT = 0; G.finished = false;
    G.sukunaUsed = false;             // SukunaSlice: once per run, reset here
    G.netSeq = 0; G.netWave = 0;
    G.enemies.length = 0; G.bolts.length = 0; G.shots.length = 0; G.shockwaves.length = 0;
    G.pickups.length = 0; G.spawnQueue.length = 0; G.corpses.length = 0; F.reset();
    G.score = 0; G.combo = 0; G.comboT = 0; G.time = 0; G.wave = 0;
    G.stats = { kills: 0, maxCombo: 0, storms: 0, parries: 0, kunaiHits: 0, salvaged: 0 };
    G.bossActive = false; G.bossRef = null;
    G.timeScale = 1; G.slowT = 0; G.hitStopT = 0;
    G.overShown = false; G.deathT = 0; G.upgradeT = 0; G.clearT = 0; G.rewarded = false; G.lastReward = null;
    G.surviveT = 0; G.surviveBatchT = 0; G.surviveBossN = 0;   // SURVIVE mode state
    G.cam.trauma = 0; G.cam.sx = 0; G.cam.sy = 0;
    G.state = "playing";
    NR.ui.hideAll();
    G.cam.x = U.clamp(G.player.x - NR.view.w / 2,0,Math.max(0,W.W-NR.view.w)); G.cam.y = W.H - NR.view.h;
    G.startT = 1.0; // countdown to wave 1
    NR.adventure.start(G,cp);
    NR.modes?.start(G);
    NR.superRuntime?.prepare();
    G.levelDef = NR.levelsys ? NR.levelsys.levelDef(G.chapter||0, NR.levelsys.currentLevel()) : null;
    if (G.mode !== "adventure" && !NR.modes?.active && G.levelDef) NR.levelsys.banner(G.levelDef);
    if (G.online && NR.net.mode === "host") {
      // share the deterministic seed so guests simulate the same district
      NR.net.transport && NR.net.transport.broadcast({ k: "room-state", room: NR.net.room });
    }
    NR.crazy?.gameplayStart();
    NR.audio?.setMusicMode && NR.audio.setMusicMode("battle"); // combat track
    G.cam.x = U.clamp(G.player.x - NR.view.w / 2,0,Math.max(0,W.W-NR.view.w));
    NR.expeditionUI?.syncRun();
    NR.audio.play("wave");
  };

  // Continue the live encounter: defeated enemies stay defeated, no duplicate rewards.
  G.continueEncounter = function () {
    if (G.state !== "over" || !G.player) return;
    const p = G.player;
    p.dead = false; p.hp = p.maxHp; p.ghostHp = p.hp; p.energy = 100;
    p.x = Math.max(100,Math.min(NR.world.W-250,p.x)); p.y = NR.world.groundY;
    if (NR.modes?.active) NR.modes.respawnPoint(p);
    p.vx = p.vy = 0; p.iframes = 3; p.dashCharges = p.dashMax;
    p.computePose(); G.deathT=0; G.overShown=false; G.finished=false; G.rewarded=false;
    G.bolts.length=0; G.shockwaves.length=0; G.clearT=0; G.upgradeT=0;
    G.state="playing"; G.timeScale=1; G.hitStopT=0; G.slowT=0;
    NR.input.reset(); NR.ui.hideAll();
    G.banner("CONTINUED", "Same encounter · 3 seconds of protection", "#b4e784");
  };

  G.togglePause = function () {
    if (G.state === "playing") {
      G.state = "pause";
      NR.crazy?.gameplayStop();
      NR.ui.show("pause");
    } else if (G.state === "pause") {
      G.state = "playing";
      NR.crazy?.gameplayStart();
    NR.audio?.setMusicMode && NR.audio.setMusicMode("battle"); // combat track
      NR.ui.hideAll();
    }
  };
  G.autoPause = function () { if (G.state === "playing") G.togglePause(); };

  /* ================= waves ================= */
  /* WAVE FIGHT keeps the staged legacy curve (new families appear on set
     waves) and layers the procedural level definition on top: staged pools,
     elites and super actors arrive only when the LEVEL has advanced far
     enough — early levels stay readable. */
  function waveComp(n) {
    if (n % 5 === 0)
      return { boss: true, crawlers: Math.min(2 + Math.floor(n / 5), 5), drones: 0, wraiths: 0, slimes: 0, soldiers: 0 };
    const comp = {
      boss: false,
      crawlers: Math.max(1, Math.min(2 + n, 7)),
      drones: n >= 2 ? Math.min(1 + Math.floor(n / 2.5), 5) : 0,
      wraiths: n >= 3 ? Math.min(Math.floor((n - 1) / 2), 4) : 0,
      slimes: n >= 2 ? Math.min(1 + Math.floor(n / 3), 4) : 0,
      soldiers: n >= 3 ? Math.min(Math.floor(n / 3), 3) : 0,
      warlocks: n >= 6 ? Math.min(1 + Math.floor((n - 6) / 3), 3) : 0,
      rivals: n >= 7 ? Math.min(Math.floor((n - 5) / 2), 2) : 0,
      gunners: n >= 4 ? Math.min(1 + Math.floor((n - 4) / 3), 3) : 0,
      strikers: n >= 8 ? Math.min(1 + Math.floor((n - 8) / 4), 2) : 0,
      blades: n >= 9 ? Math.min(1 + Math.floor((n - 9) / 4), 2) : 0,
      brutes: n >= 10 ? Math.min(1 + Math.floor((n - 10) / 4), 2) : 0,
      apparitions: n >= 11 ? Math.min(1 + Math.floor((n - 11) / 3), 3) : 0,
    };
    // procedural extra defenders, staged by world LEVEL (not just wave)
    const def = G.levelDef;
    if (def && NR.levelsys) {
      const stage = NR.levelsys.stageFor(def.level);
      if (stage.supers > 0 && n >= 5) comp.supers = Math.min(stage.supers, 1 + Math.floor(n / 8));
    }
    return comp;
  }

  function startWave(n) {
    G.wave = n;
    G.netWave = n;
    NR.waveResume?.save();
    NR.net.hostBroadcastWave(n);
    G.waveDamageTaken = false;
    const dmul = NR.levelsys && G.levelDef ? NR.levelsys.enemyMuls(G.levelDef, n) : null;
    G.enemyHpMul = (dmul ? dmul.hp : 1 + (n - 1) * 0.07) * (G.difficulty === "casual" ? .75 : G.difficulty === "hard" ? 1.35 : 1);
    G.enemySpdMul = (dmul ? dmul.spd : 1 + Math.min(0.55, (n - 1) * 0.03)) * (G.difficulty === "casual" ? .85 : G.difficulty === "hard" ? 1.15 : 1);
    G.enemyDmgMul = (dmul ? dmul.dmg : 1 + Math.max(0, n - 6) * 0.05);
    const comp = waveComp(n);
    let delay = 0.4;
    const q = G.spawnQueue;
    // super actors are QUEUED (never pushed instantly — that was a frame spike)
    const superCount = Math.min(comp.supers || 0, 4);
    for (let i = 0; i < superCount; i++) q.push({ type: "super", t: (delay += U.rand(0.8, 1.6)) });
    for (let i = 0; i < comp.crawlers; i++) q.push({ type: "crawler", t: (delay += U.rand(0.4, 0.8)) });
    for (let i = 0; i < comp.slimes; i++) q.push({ type: "slime", t: (delay += U.rand(0.4, 0.9)) });
    for (let i = 0; i < comp.drones; i++) q.push({ type: "drone", t: (delay += U.rand(0.3, 0.7)) });
    for (let i = 0; i < comp.soldiers; i++) q.push({ type: "soldier", t: (delay += U.rand(0.5, 1)) });
    for (let i = 0; i < comp.wraiths; i++) q.push({ type: "wraith", t: (delay += U.rand(0.4, 0.8)) });
    for (let i = 0; i < (comp.warlocks || 0); i++) q.push({ type: "warlock", t: (delay += U.rand(0.5, 1)) });
    for (let i = 0; i < (comp.rivals || 0); i++) q.push({ type: "rival", t: (delay += U.rand(0.6, 1.1)) });
    for (let i = 0; i < (comp.gunners || 0); i++) q.push({ type: "gunner", t: (delay += U.rand(0.5, 1)) });
    for (let i = 0; i < (comp.strikers || 0); i++) q.push({ type: "striker", t: (delay += U.rand(0.6, 1.1)) });
    for (let i = 0; i < (comp.blades || 0); i++) q.push({ type: "blade", t: (delay += U.rand(0.6, 1.1)) });
    for (let i = 0; i < (comp.brutes || 0); i++) q.push({ type: "brute", t: (delay += U.rand(0.7, 1.2)) });
    for (let i = 0; i < (comp.apparitions || 0); i++) q.push({ type: "apparition", t: (delay += U.rand(0.5, 1)) });
    if(n>=3 && !comp.boss) q.push({type:"sentry",t:(delay+=.8)});
    if(n>=4 && !comp.boss) q.push({type:"sentinel",t:(delay+=.8)});
    // host shares the (deterministic) queue with guests
    NR.net.hostBroadcastSpawns(q.map((s) => ({ type: s.type, t: s.t, netId: "e" + (++G.netSeq) })));
    for (const s of q) s.netId = s.netId || "e" + (++G.netSeq);
    if (comp.boss) {
      G.bossActive = true;
      const bx = G.player.x > W.W / 2 ? W.W * 0.28 : W.W * 0.72;
      // BossDefinition rotation — real assets, deterministic pick
      const def = NR.bossDefs
        ? NR.bossDefs.forMilestone(G.chapter || 0, NR.levelsys ? NR.levelsys.currentLevel() : 1, Math.ceil(n / 5))
        : { skin: "mech", name: "SHOGUN-9" };
      const boss = NR.bossDefs ? NR.bossDefs.spawn(def, bx, G.enemyHpMul, Math.ceil(n / 5)) : new NR.Boss(bx, W.groundY, G.enemyHpMul, Math.ceil(n / 5), "mech");
      boss.spawnT = 0;
      boss.netId = "boss" + n;
      G.enemies.push(boss);
      G.bossRef = boss;
      G.banner("⚠ " + (boss.bossName || "SHOGUN-9") + " ⚠", "WAVE " + n + " — eliminate the war machine", "#ff2d95");
      NR.audio.play("bossIntro");
      NR.audio.play("warn");
      G.shake(0.5);
    } else {
      G.banner(G.mode === "survive" ? "SURVIVE — " + U.fmtTime(G.surviveT) : "WAVE " + n, n === 1 ? "survive the onslaught" : U.pick([
        "they keep coming", "hold the line", "no retreat", "the city watches",
      ]), "#00fff4");
      NR.audio.play("wave");
    }
  }

  function spawnEnemy(type, qi) {
    const mul = G.enemyHpMul;
    const side = U.chance(0.5) ? 1 : -1;
    const px = G.player.x;
    const hintX = qi && typeof qi.x === "number" ? qi.x : null;
    let e;
    if (type === "super") {
      // staged super actor (measured Legacy/Mario art), spawned through the queue
      e = NR.superRuntime ? NR.superRuntime.spawn(U.clamp(px + side * U.rand(420, 640), 100, W.W - 100), W.groundY, U.randi(0, 3)) : new NR.Crawler(120, W.groundY, mul);
    } else if (type === "crawler") {
      let x = side > 0 ? W.W - 90 : 90;
      if (Math.abs(x - px) < Math.abs(W.W - x - px)) x = W.W - x; // spawn far from player
      if (hintX !== null) x = U.clamp(hintX, 60, W.W - 60);
      e = new NR.Crawler(x, W.groundY, mul);
    } else if (type === "drone") {
      e = new NR.Drone(U.clamp(px + side * U.rand(380, 640), 120, W.W - 120), U.rand(220, 420), mul);
    } else if (type === "slime") {
      e = new NR.Slime(U.clamp(px + side * U.rand(220, 520), 80, W.W - 80), W.groundY, mul);
    } else if (type === "soldier") {
      e = new NR.Soldier(U.clamp(px + side * U.rand(320, 560), 80, W.W - 80), W.groundY, mul);
    } else if(type === "sentry" || type === "sentinel") {
      e = new (type === "sentry" ? NR.Sentry : NR.Sentinel)(U.clamp(px+side*500,100,W.W-100),W.groundY,mul);
    } else if (type === "warlock") {
      e = new NR.Warlock(U.clamp(px + side * U.rand(380, 560), 90, W.W - 90), W.groundY - 60, mul);
    } else if (type === "rival") {
      e = new NR.Rival(U.clamp(px + side * U.rand(420, 600), 90, W.W - 90), W.groundY, mul);
    } else if (type === "gunner") {
      e = new NR.Gunner(U.clamp(px + side * U.rand(320, 520), 80, W.W - 80), W.groundY, mul);
    } else if (type === "striker") {
      e = new NR.Striker(U.clamp(px + side * U.rand(380, 560), 80, W.W - 80), W.groundY, mul);
    } else if (type === "blade") {
      e = new NR.Blade(U.clamp(px + side * U.rand(420, 620), 90, W.W - 90), W.groundY, mul);
    } else if (type === "brute") {
      e = new NR.Brute(U.clamp(px + side * U.rand(460, 660), 90, W.W - 90), W.groundY, mul);
    } else if (type === "apparition") {
      e = new NR.Apparition(U.clamp(px + side * U.rand(340, 560), 90, W.W - 90), W.groundY - 240, mul);
    } else {
      e = new NR.Wraith(U.clamp(px + side * U.rand(300, 500), 100, W.W - 100), W.groundY - 200, mul);
    }
    if (hintX !== null && type !== "crawler") e.x = U.clamp(hintX + U.rand(-40, 40), 60, W.W - 60);
    if (qi && qi.netId) e.netId = qi.netId;
    F.teleport(e.x, e.y - e.h / 2,
      type === "crawler" ? "red" : type === "drone" ? "cyan" : type === "slime" ? "blue" : type === "soldier" ? "orange" : type === "warlock" ? "purple" : type === "rival" ? "white" : type === "gunner" ? "yellow" : type === "striker" ? "orange" : type === "blade" ? "cyan" : type === "brute" ? "red" : type === "apparition" ? "purple" : "purple");
    // elite roll — staged by level, never in the first levels
    const eliteCh = NR.modes?.active ? (NR.modes.eliteChance || 0) : (G.levelDef ? G.levelDef.eliteChance : 0);
    if (eliteCh > 0 && !e.boss && U.chance(eliteCh)) {
      e.maxHp = e.hp = Math.round(e.hp * 1.6);
      e.elite = true; e.score = Math.round((e.score || 50) * 2.2);
      if (e.speed) e.speed *= 1.15;
      NR.vfx?.ring(e.x, e.y - e.h / 2, { col: "yellow", r1: 90, life: 0.5, lw: 4 });
    }
    G.enemies.push(e);
  }

  function onWaveCleared() {
    if(G.wave>=5)NR.progress.award("wave");
    const perfect = !G.waveDamageTaken;
    if (perfect) {
      G.addScore(750, G.player.x, G.player.y - 120, true);
      G.banner("PERFECT WAVE", "+750 — not a scratch", "#ffe14d");
    } else {
      G.banner("WAVE " + G.wave + " CLEARED", "choose your evolution", "#00fff4");
    }
    G.player.heal(10 + G.wave * 0.5);
    NR.audio.play("upgrade");
    // midgame ad ONLY at a boss-wave break (never during combat), opt-out safe
    if (G.wave % 5 === 0 && NR.crazy && NR.crazy.canMidgame()) {
      G.upgradeT = 1.25;
      NR.crazy.showMidgame("boss-wave-break");
    }
    G.upgradeT = Math.max(G.upgradeT || 0, 0.95); // game-timer driven (pause safe)
  }

  G.waveCleared = function () { onWaveCleared(); };

  G.closeUpgrade = function () {
    G.state = "playing";
    NR.crazy?.gameplayStart();
    NR.audio?.setMusicMode && NR.audio.setMusicMode("battle"); // combat track
    G.startT = G.mode === "adventure" ? 0 : 1.6;
    NR.adventure.checkpointAfterUpgrade(G);
  };

  /* ================= combat ================= */
  G.playerStrike = function (A) {
    const p = G.player;
    let hitAny = false;
    const counter = p.counterT>0;
    const abMul = NR.abilities ? NR.abilities.damageMul(p) : 1;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - p.x;
      const inFront = p.facing > 0 ? dx > -10 : dx < 10;
      if (!inFront || Math.abs(dx) > A.rng) continue;
      const ey = e.y - e.h / 2, py = p.y - 45;
      if (Math.abs(ey - py) > 95 + e.h / 2) continue;
      const crit = U.chance(p.critCh);
      const dmg = A.dmg * p.dmgMul * abMul * (p.overdriveT > 0 ? 2 : 1) * (crit ? 2 : 1) * (counter ? 1.75 : 1);
      // online guest: the host owns enemy hp — report the hit, don't apply it
      if (NR.net.mode === "guest" && e.netId) {
        NR.net.guestHitEnemy(e.netId, dmg, p.facing * A.kb, -A.kb * 0.35);
        F.slash(p.x + p.facing * 55, p.y - 52, p.facing, 0, A.rng * 0.7);
        hitAny = true;
        continue;
      }
      const beforeHp=e.hp;
      e.hurt(dmg, p.facing * A.kb, -A.kb * 0.35, crit, G);
      if(e.hp>=beforeHp)continue;
      NR.vfx.text(e.x, e.y - e.h - 12, Math.round(dmg), { col: crit ? "#ffe14d" : "#ffffff", size: crit ? 30 : 20, crit });
      p.addEnergy(6.5);
      if (p.lifesteal > 0) p.heal(dmg * p.lifesteal);
      hitAny = true;
    }
    // PvP: strike any remote hero standing in the arc
    if (G.pvp) {
      for (const r of NR.net.remote.values()) {
        const dx = r.x - p.x;
        if (Math.sign(dx) !== p.facing || Math.abs(dx) > A.rng) continue;
        if (Math.abs(r.y - p.y) > 110) continue;
        NR.net.sendEvent({ a: "hit-player", dmg: A.dmg * p.dmgMul * abMul });
        F.slash(r.x, r.y - 50, p.facing, 1, 130);
        hitAny = true;
      }
    }
    NR.adventure.strikeProps(p,A,G);
    if (hitAny) {
      NR.evolution?.weaponMagic();
      if(counter){p.counterT=0;F.text(p.x,p.y-135,"COUNTER ×1.75",{col:"#ffe5a1",size:19});}
      G.hitStop(A.heavy ? 0.09 : 0.045);
      G.shake(A.heavy ? 0.3 : 0.12);
    }
  };

  G.stormDamage = function (p) {
    const R = 460;
    F.ring(p.x, p.y - 50, { col: "cyan", r1: R, life: 0.4, lw: 10 });
    G.shake(0.22);
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = U.dist(e.x, e.y - e.h / 2, p.x, p.y - 50);
      if (d > R) continue;
      const dir = Math.sign(e.x - p.x) || 1;
      const dmg = 46 * p.stormMul;
      e.hurt(dmg, dir * 700, -300, true, G);
      F.text(e.x, e.y - e.h - 12, Math.round(dmg), { col: "#7dfff3", size: 26, crit: true });
      if (p.lifesteal > 0) p.heal(dmg * p.lifesteal);
    }
    NR.audio.play("hit");
  };

  G.hurtPlayer = function (dmg, dir, src) {
    const p = G.player;
    if (p && p.isProxy) { NR.modes.proxyHurt(p, dmg, dir); return; }
    if (NR.modes && !NR.modes.allowHurt(G, src)) return;
    if (p.dead || p.iframes > 0 || p.dashT > 0 || p.stormT > 0 || p.shieldT > 0) return;
    if (NR.combat.tryParry(G,dir,src)) return;
    dmg *= (G.difficulty === "casual" ? .6 : G.difficulty === "hard" ? 1.4 : 1)
      * (p.damageTakenMul || 1)
      * (NR.abilities ? NR.abilities.damageTakenMul(p) : 1);
    p.hp -= dmg;
    NR.abilities?.postDamage(p, dmg, G);
    if (p.dead) return;
    p.comboResetT = 99; // combo resets
    G.combo = 0; G.comboT = 0;
    G.waveDamageTaken = true;
    p.iframes = 0.85 * (p.guardMul || 1);
    p.hitstun = 0.26;
    p.vx = (dir || 1) * 430; p.vy = -290;
    const dmgFx = !(NR.profile.settings && NR.profile.settings.damageEffects === false);
    if (dmgFx) hud.hurtVign = 1;
    G.shake(0.4);
    G.hitStop(0.06);
    NR.vfx.text(p.x, p.y - 110, "-" + Math.round(dmg), { col: "#ff5f7a", size: 24, crit: true });
    F.burst(p.x, p.y - 46, { n: 14, col: "red", spd: 340, life: 0.5 });
    NR.audio.play("hurt");
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true;
      G.deathT = 1.5;
      G.slowmo(0.25, 1.4);
      if (dmgFx) hud.flash("rgba(255,45,90,0.4)");
      F.burst(p.x, p.y - 46, { n: 60, col: "cyan", spd: 620, life: 1.1 });
      F.ring(p.x, p.y - 46, { col: "magenta", r1: 380, life: 0.8, lw: 12 });
      NR.audio.play("pdie");
      NR.audio.duck(0.08, 2);
    }
  };

  G.onEnemyKilled = function (e) {
    G.stats.kills++;
    NR.evolution?.rewardKill();
    NR.abilities?.onKill(G.player, G);
    NR.profile.totalKills++; NR.saveProfile();
    G.combo++;
    G.comboT = G.comboWindow();
    if (G.combo > G.stats.maxCombo) G.stats.maxCombo = G.combo;
    G.addScore(e.score, e.x, e.y - e.h - 6, false);
    NR.progress.check(G);
    // giblets (budgeted)
    NR.vfx.burst(e.x, e.y - e.h / 2, { n: 26, col: e.type === "crawler" ? "red" : e.type === "drone" ? "cyan" : "purple", spd: 430, life: 0.65 });
    F.shards(e.x, e.y - e.h / 2, 10, e.type === "crawler" ? "magenta" : "cyan");
    F.ring(e.x, e.y - e.h / 2, { col: "white", r1: 90, life: 0.35, lw: 5 });
    NR.audio.play("enemyDie");
    if (e.type !== "boss") G.slowmo(0.55, 0.08);
    // drops
    if (U.chance(0.09)) G.pickups.push(new NR.Pickup(e.x, e.y - 20, "heart"));
    else if (U.chance(0.15)) G.pickups.push(new NR.Pickup(e.x, e.y - 20, "energy"));
    if (NR.net.mode === "host" && e.netId)
      NR.net.transport && NR.net.transport.broadcast({ k: "enemy-hp", id: e.netId, hp: 0, dead: true });
  };

  G.onBossKilled = function (b) {
    G.stats.kills++; NR.evolution?.rewardKill(); NR.profile.totalKills++; NR.saveProfile(); NR.progress.check(G);
    G.bossActive = false; G.bossRef = null;
    G.addScore(b.score, b.x, b.y - 200, true);
    G.banner((b.bossName || "TARGET") + " ELIMINATED", "+" + U.fmt(b.score), "#ffe14d");
    F.burst(b.x, b.y - 90, { n: 80, col: "orange", spd: 700, life: 1.2 });
    F.burst(b.x, b.y - 90, { n: 40, col: "magenta", spd: 500, life: 1 });
    F.ring(b.x, b.y - 90, { col: "yellow", r1: 600, life: 0.9, lw: 14 });
    G.shake(1);
    hud.flash("rgba(255,225,120,0.35)");
    NR.audio.play("bossDefeat");
    NR.crazy?.happytime(); // a genuine positive moment — platform signal
    for (let i = 0; i < 3; i++) G.pickups.push(new NR.Pickup(b.x + U.rand(-80, 80), b.y - 60, i === 0 ? "heart" : "energy"));
    // clear remaining adds spectacularly
    for (const e of G.enemies) if (!e.dead) { F.burst(e.x, e.y - e.h / 2, { n: 18, col: "orange", spd: 400, life: 0.6 }); e.dead = true; }
    if (NR.net.mode === "host" && b.netId)
      NR.net.transport && NR.net.transport.broadcast({ k: "enemy-hp", id: b.netId, hp: 0, dead: true });
  };

  G.addScore = function (n, x, y, big) {
    const m = G.mult();
    const total = Math.round(n * m);
    G.score += total;
    if (y !== undefined) F.text(x, y, "+" + U.fmt(total), { col: big ? "#ffe14d" : "#9df8ff", size: big ? 26 : 16 });
  };

  /* ================= juice ================= */
  G.banner = (t, s, c) => hud.banner(t, s, c);
  G.shake = (v) => { if (!NR.profile.shake) return; G.cam.trauma = Math.min(1, G.cam.trauma + v); };
  G.flash = (col) => hud.flash(col);
  G.hitStop = (t) => { G.hitStopT = Math.max(G.hitStopT, t); };
  G.slowmo = (s, dur) => { G.timeScale = s; G.slowT = Math.max(G.slowT, dur); };
  G.effDt = function (rd) {
    if (G.hitStopT > 0) { G.hitStopT -= rd; return rd * 0.06; }
    if (G.slowT > 0) { G.slowT -= rd; return rd * G.timeScale; }
    G.timeScale = U.damp(G.timeScale, 1, 6, rd);
    return rd * G.timeScale;
  };

  /* ================= update ================= */
  G.update = function (dt, rd) {
    const p = G.player;
    hud.update(rd);

    if (G.state === "pause") { if (I.justPressed("pause")) G.togglePause(); return; }
    if (G.state === "upgrade" || G.state === "over" || G.state === "victory") return;
    if (G.state !== "playing") return;
    if (I.justPressed("pause")) { G.togglePause(); return; }

    G.time += rd;
    G.chronoT = Math.max(0,G.chronoT-dt);

    // Death takes priority over a pending wave-clear reward.
    if (p.dead) G.upgradeT = 0;

    // delayed upgrade screen (game-time driven)
    if (G.upgradeT > 0) {
      G.upgradeT -= rd;
      if (G.upgradeT <= 0) {
        G.state = "upgrade";
        NR.ui.openUpgrades(NR.upgrades.roll(G.player), G);
        return;
      }
    }

    // player death sequence
    if (p.dead) {
      G.deathT -= rd;
      if (G.deathT <= 0 && !G.overShown) {
        G.overShown = true;
        if (NR.modes?.onDeath(G)) return;
        G.finishRun(false);
        return;
      }
    }

    // wave start countdown (WAVE FIGHT)
    if (G.mode === "survival" && !p.dead && G.startT > 0 && G.startT < 900) {
      G.startT -= rd;
      if (G.startT <= 0) {
        if (G.enemies.length === 0 && G.spawnQueue.length === 0 && !G.bossActive) startWave(G.wave + 1);
        else G.startT = 0.5;
      }
    }

    // SURVIVE: continuous escalating pressure — no wave breaks, high-score run
    if (G.mode === "survive" && !p.dead) {
      G.surviveT += dt;
      G.surviveBatchT -= dt;
      // score trickles with survival time
      if (Math.floor(G.surviveT) !== G._surviveScoreMark) {
        G._surviveScoreMark = Math.floor(G.surviveT);
        G.score += 10 + Math.floor(G.surviveT / 30) * 5;
      }
      if (G.surviveBatchT <= 0 && !G.bossActive) {
        G.surviveBatchT = 10;
        const def = G.levelDef;
        if (def && NR.levelsys) {
          const effLevel = def.level + Math.floor(G.surviveT / 60); // pressure grows over minutes
          const batchDef = NR.levelsys.levelDef(G.chapter || 0, effLevel);
          const batch = NR.levelsys.surviveBatch(G.surviveT, batchDef);
          let d = 0.3;
          const q = G.spawnQueue;
          for (const type of batch) q.push({ type, t: (d += U.rand(0.3, 1.0)) });
          const stage = NR.levelsys.stageFor(batchDef.level);
          if (stage.supers > 0 && U.chance(0.25)) q.push({ type: "super", t: (d += 1) });
          G.enemyHpMul = NR.levelsys.enemyMuls(batchDef, 1 + Math.floor(G.surviveT / 45)).hp
            * (G.difficulty === "casual" ? .75 : G.difficulty === "hard" ? 1.35 : 1);
          G.enemySpdMul = 1 + Math.min(0.6, G.surviveT / 300);
          G.enemyDmgMul = 1 + Math.max(0, Math.floor(G.surviveT / 60) - 1) * 0.08;
          // milestone boss every 3 minutes
          if (NR.levelsys.surviveBossAt(G.surviveT) && !G.bossActive) {
            G.surviveBossN++;
            const bdef = NR.bossDefs
              ? NR.bossDefs.forMilestone(G.chapter || 0, batchDef.level, G.surviveBossN)
              : { skin: "mech", name: "SHOGUN-9" };
            const bx = p.x > W.W / 2 ? W.W * 0.28 : W.W * 0.72;
            const boss = NR.bossDefs ? NR.bossDefs.spawn(bdef, bx, G.enemyHpMul, G.surviveBossN) : new NR.Boss(bx, W.groundY, G.enemyHpMul, G.surviveBossN, "mech");
            boss.spawnT = 0; boss.netId = "boss" + G.surviveBossN;
            G.enemies.push(boss); G.bossRef = boss; G.bossActive = true;
            G.banner("⚠ " + (boss.bossName || "BOSS") + " ⚠", U.fmtTime(G.surviveT) + " — survive the war machine", "#ff2d95");
            NR.audio.play("bossIntro");
            G.shake(0.5);
          }
        }
      }
      // pickup drip keeps long runs alive
      if (G.pickups.length === 0 && U.chance(dt * 0.05))
        G.pickups.push(new NR.Pickup(U.rand(200, W.W - 200), W.groundY - 200, U.chance(0.5) ? "heart" : "energy"));
    }

    // online host: keep the boss health bar honest for guests (2Hz)
    if (NR.net.mode === "host" && G.bossActive && G.bossRef && G.bossRef.netId) {
      G._bossSyncT = (G._bossSyncT || 0) - rd;
      if (G._bossSyncT <= 0) {
        G._bossSyncT = 0.5;
        NR.net.transport && NR.net.transport.broadcast({ k: "enemy-hp", id: G.bossRef.netId, hp: Math.max(0, Math.round(G.bossRef.hp)), dead: false });
      }
    }

    // spawn queue
    for (let i = G.spawnQueue.length - 1; i >= 0; i--) {
      const q = G.spawnQueue[i];
      q.t -= dt;
      if (G.maxAlive && NR.modes?.active && G.enemies.length >= G.maxAlive) continue; // cap: never flood the arena
      if (q.t <= 0) { try { spawnEnemy(q.type, q); } catch (err) { NR.diag?.warn?.("spawn failed: " + q.type + " " + err.message); } G.spawnQueue.splice(i, 1); }
    }

    // Authored expedition logic shares combat, not wave scheduling.
    NR.adventure.update(dt,G);
    if (NR.modes?.active) { NR.modes.update(dt, G); NR.modes.tickRevive(rd, G); }
    NR.evolution?.tick(dt);
    if(G.state !== "playing") return;

    // entities
    p.update(dt, G);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      const tgt = NR.modes?.active ? NR.modes.targetFor(e, G) : null;
      if (tgt) { G.player = tgt; try { e.update(dt * (G.chronoT>0 ? 0.35 : 1), G); } finally { G.player = p; } }
      else e.update(dt * (G.chronoT>0 ? 0.35 : 1), G);
      // player contact damage
      if (!e.dead && e.spawnT <= 0 && !p.dead && e.touchCd <= 0) {
        const overlapX = Math.abs(e.x - p.x) < (e.w + p.w) / 2 - 6;
        const overlapY = Math.abs(e.y - e.h / 2 - (p.y - p.h / 2)) < (e.h + p.h) / 2 - 4;
        if (overlapX && overlapY) {
          G.hurtPlayer(e.dmg * (e.boss ? 1 : G.enemyDmgMul), Math.sign(p.x - e.x) || e.facing, "touch");
          e.touchCd = 0.6;
        }
      }
      if (e.dead) G.enemies.splice(i, 1);
    }
    NR.modes?.guestCorrect?.(dt, G);
    NR.spriteRender.updateCorpses(G, dt);
    for (let i = G.bolts.length - 1; i >= 0; i--) { G.bolts[i].update(dt * (G.chronoT>0 ? 0.35 : 1), G); if (G.bolts[i].dead) G.bolts.splice(i, 1); }
    for(let i=G.shots.length-1;i>=0;i--){G.shots[i].update(dt,G);if(G.shots[i].dead)G.shots.splice(i,1);}
    for (let i = G.shockwaves.length - 1; i >= 0; i--) { G.shockwaves[i].update(dt, G); if (G.shockwaves[i].dead) G.shockwaves.splice(i, 1); }
    for (let i = G.pickups.length - 1; i >= 0; i--) { G.pickups[i].update(dt, G); if (G.pickups[i].dead) G.pickups.splice(i, 1); }
    F.update(dt);
    W.update(rd, NR.view);

    // combo decay
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

    // wave cleared? (WAVE FIGHT only — SURVIVE never breaks)
    if (G.mode === "survival" && G.wave > 0 && G.startT <= 0 && !G.bossActive && G.enemies.length === 0 && G.spawnQueue.length === 0 && !p.dead) {
      G.clearT += dt;
      if (G.clearT > 0.7) { G.clearT = 0; G.startT = 999; onWaveCleared(); }
    } else G.clearT = 0;

    // camera
    const cam = G.cam, view = NR.view;
    const lookX = p.x + p.facing * 90;
    const tx = U.clamp(lookX - view.w / 2, 0, Math.max(0, W.W - view.w));
    const arenaBottom = W.H + (window.innerWidth < 600 ? view.h * .19 : view.h * .08);
    const tyMin = Math.min(0, arenaBottom - view.h);
    const ty = U.clamp(p.y - view.h * 0.58, tyMin, arenaBottom - view.h);
    cam.x = U.damp(cam.x, W.W > view.w ? tx : (W.W - view.w) / 2, 5, rd);
    cam.y = U.damp(cam.y, arenaBottom > view.h ? ty : (arenaBottom - view.h) / 2, 4, rd);
    cam.trauma = Math.max(0, cam.trauma - rd * 1.7);
    const sh = cam.trauma * cam.trauma * 24;
    cam.sx = U.rand(-sh, sh); cam.sy = U.rand(-sh, sh);

    // menu state? handled elsewhere
  };

  G.finishRun = function (victory = false) {
    NR.audio?.setMusicMode && NR.audio.setMusicMode("menu"); // results screen: menu track
    if(G.finished)return;
    G.finished=true;G.state=victory?'victory':'over';
    NR.crazy?.gameplayStop();
    const newHigh = G.score > G.high;
    if (newHigh) { G.high = G.score; NR.store.setItem('nr_high', String(G.high)); }
    // Skyward progression: coins + XP for every run, gems for milestones
    if (!G.rewarded) {
      G.rewarded = true;
      const totals = { score: G.score, kills: G.stats.kills, wave: (G.mode === "survival" || G.mode === "climb" || G.mode === "run") ? Math.max(0,G.wave-1) : victory ? G.chapter+1 : 0 };
      const ledger = G.rewardLedger || {score:0,kills:0,wave:0,gems:0};
      const reward = NR.economy.awardRun({...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Math.max(0,v-ledger[k])])),xpCredit:Math.max(0,(G.liveXp||0)-(ledger.liveXp||0))});
      let gems = 0;
      if ((G.mode === "survival" || G.mode === "climb" || G.mode === "run") && G.wave >= 5) gems += Math.floor(Math.max(0,G.wave-1) / 5) * 5;
      if (G.mode === "adventure" && victory) gems += 25;
      const totalGems = gems;
      gems = Math.max(0,gems-ledger.gems);
      G.rewardLedger = {...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Math.max(v,ledger[k]||0)])),gems:Math.max(totalGems,ledger.gems),liveXp:Math.max(G.liveXp||0,ledger.liveXp||0)};
      NR.waveResume?.markPaid();
      if (gems > 0) NR.economy.addGems(gems);
      G.lastReward = { ...reward, gems };
      NR.progress.check(G);
    }
    if(G.mode==='climb')NR.profile.bestFloor=Math.max(NR.profile.bestFloor||0,(NR.modes.floor||0)+1);
    if(G.mode==='run')NR.profile.bestRun=Math.max(NR.profile.bestRun||0,G.runDist||0);
    if(G.mode==='survival')NR.profile.bestWave=Math.max(NR.profile.bestWave||0,G.wave);
    if(G.mode==='survive')NR.profile.bestSurvive=Math.max(NR.profile.bestSurvive||0,Math.floor(G.surviveT));
    NR.profile.runs++;NR.saveProfile();NR.progress.record(G,victory);
    // validated online leaderboard submission (plausibility + rate limits)
    if (G.online) {
      NR.net.submitLeaderboard({
        wave: G.mode === "survive" ? Math.floor(G.surviveT / 60) : G.wave,
        score: G.score,
        time: Math.round(G.time),
        mode: G.mode,
      });
    }
    if(victory)NR.expeditionUI.showVictory(G);
    else NR.ui.showGameOver(G,newHigh);
    // midgame ad only on the results screen — never during combat
    if (!victory && G.wave >= 3) NR.crazy?.showMidgame("run-end");
    document.getElementById('run-save').textContent=NR.store.persistent?'Record saved on this device. No server or account needed.':'Storage is blocked. This record lasts only while this tab stays open.';
    NR.expeditionUI.refresh();
  };
})();
