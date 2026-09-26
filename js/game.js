/* ============ NEON RONIN — game core: states, waves, combat resolution ============ */
(function () {
  const U = NR.util, W = NR.world, F = NR.fx, I = NR.input, hud = NR.hud;

  const G = (NR.game = {
    state: "loading", // loading | menu | playing | upgrade | pause | over
    score: 0, high: Math.max(0, Math.min(1e8, Number(NR.store.getItem("nr_high")) || 0)),
    wave: 0, combo: 0, comboT: 0, time: 0,
    enemies: [], bolts: [], shots: [], shockwaves: [], pickups: [], spawnQueue: [],
    bossActive: false, bossRef: null,
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
    G.state = "menu";
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
    NR.adventure.configure(G.mode,G.chapter); NR.resize?.();
    NR.audio.init();
    if (!G.player) G.player = new NR.Player();
    G.player.reset();
    NR.applyCharacter(G.player,G.character);
    I.reset(); hud.banners.length = 0; hud.hurtVign = 0; hud.flashA = 0;
    G.difficulty = cp ? cp.difficulty : NR.profile.difficulty;
    G.tactical = cp ? cp.tactical : NR.profile.tactical;
    G.runName = NR.profile.name;
    G.chronoT = 0; G.finished = false;
    G.enemies.length = 0; G.bolts.length = 0; G.shots.length = 0; G.shockwaves.length = 0;
    G.pickups.length = 0; G.spawnQueue.length = 0; G.corpses.length = 0; F.reset();
    G.score = 0; G.combo = 0; G.comboT = 0; G.time = 0; G.wave = 0;
    G.stats = { kills: 0, maxCombo: 0, storms: 0, parries: 0, kunaiHits: 0, salvaged: 0 };
    G.bossActive = false; G.bossRef = null;
    G.timeScale = 1; G.slowT = 0; G.hitStopT = 0;
    G.overShown = false; G.deathT = 0; G.upgradeT = 0; G.clearT = 0; G.rewarded = false; G.lastReward = null;
    G.cam.trauma = 0; G.cam.sx = 0; G.cam.sy = 0;
    G.state = "playing";
    NR.ui.hideAll();
    G.cam.x = U.clamp(G.player.x - NR.view.w / 2,0,Math.max(0,W.W-NR.view.w)); G.cam.y = W.H - NR.view.h;
    G.startT = 1.0; // countdown to wave 1
    NR.adventure.start(G,cp);
    G.cam.x = U.clamp(G.player.x - NR.view.w / 2,0,Math.max(0,W.W-NR.view.w));
    NR.expeditionUI?.syncRun();
    NR.audio.play("wave");
  };

  G.togglePause = function () {
    if (G.state === "playing") {
      G.state = "pause";
      NR.ui.show("pause");
    } else if (G.state === "pause") {
      G.state = "playing";
      NR.ui.hideAll();
    }
  };
  G.autoPause = function () { if (G.state === "playing") G.togglePause(); };

  /* ================= waves ================= */
  function waveComp(n) {
    if (n % 5 === 0)
      return { boss: true, crawlers: Math.min(2 + Math.floor(n / 5), 5), drones: 0, wraiths: 0, slimes: 0, soldiers: 0 };
    return {
      boss: false,
      crawlers: Math.max(1, Math.min(2 + n, 7)),
      drones: n >= 2 ? Math.min(1 + Math.floor(n / 2.5), 5) : 0,
      wraiths: n >= 3 ? Math.min(Math.floor((n - 1) / 2), 4) : 0,
      slimes: n >= 2 ? Math.min(1 + Math.floor(n / 3), 4) : 0,
      soldiers: n >= 3 ? Math.min(Math.floor(n / 3), 3) : 0,
    };
  }

  function startWave(n) {
    G.wave = n;
    G.waveDamageTaken = false;
    G.enemyHpMul = (1 + (n - 1) * 0.07) * (G.difficulty === "casual" ? .75 : G.difficulty === "hard" ? 1.35 : 1);
    G.enemySpdMul = (1 + Math.min(0.55, (n - 1) * 0.03)) * (G.difficulty === "casual" ? .85 : G.difficulty === "hard" ? 1.15 : 1);
    G.enemyDmgMul = 1 + Math.max(0, n - 6) * 0.05;
    const comp = waveComp(n);
    let delay = 0.4;
    const q = G.spawnQueue;
    for (let i = 0; i < comp.crawlers; i++) q.push({ type: "crawler", t: (delay += U.rand(0.4, 0.8)) });
    for (let i = 0; i < comp.slimes; i++) q.push({ type: "slime", t: (delay += U.rand(0.4, 0.9)) });
    for (let i = 0; i < comp.drones; i++) q.push({ type: "drone", t: (delay += U.rand(0.3, 0.7)) });
    for (let i = 0; i < comp.soldiers; i++) q.push({ type: "soldier", t: (delay += U.rand(0.5, 1)) });
    for (let i = 0; i < comp.wraiths; i++) q.push({ type: "wraith", t: (delay += U.rand(0.4, 0.8)) });
    if(n>=3 && !comp.boss) q.push({type:"sentry",t:(delay+=.8)});
    if(n>=4 && !comp.boss) q.push({type:"sentinel",t:(delay+=.8)});
    if (comp.boss) {
      G.bossActive = true;
      const bx = G.player.x > W.W / 2 ? W.W * 0.28 : W.W * 0.72;
      const boss = new NR.Boss(bx, W.groundY, G.enemyHpMul, Math.ceil(n / 5));
      boss.spawnT = 0;
      G.enemies.push(boss);
      G.bossRef = boss;
      G.banner("⚠ SHOGUN-9 ⚠", "WAVE " + n + " — eliminate the war machine", "#ff2d95");
      NR.audio.play("warn");
    } else {
      G.banner("WAVE " + n, n === 1 ? "survive the onslaught" : U.pick([
        "they keep coming", "hold the line", "no retreat", "the city watches",
      ]), "#00fff4");
      NR.audio.play("wave");
    }
  }

  function spawnEnemy(type) {
    const mul = G.enemyHpMul;
    const side = U.chance(0.5) ? 1 : -1;
    const px = G.player.x;
    let e;
    if (type === "crawler") {
      let x = side > 0 ? W.W - 90 : 90;
      if (Math.abs(x - px) < Math.abs(W.W - x - px)) x = W.W - x; // spawn far from player
      e = new NR.Crawler(x, W.groundY, mul);
    } else if (type === "drone") {
      e = new NR.Drone(U.clamp(px + side * U.rand(380, 640), 120, W.W - 120), U.rand(220, 420), mul);
    } else if (type === "slime") {
      e = new NR.Slime(U.clamp(px + side * U.rand(220, 520), 80, W.W - 80), W.groundY, mul);
    } else if (type === "soldier") {
      e = new NR.Soldier(U.clamp(px + side * U.rand(320, 560), 80, W.W - 80), W.groundY, mul);
    } else if(type === "sentry" || type === "sentinel") {
      e = new (type === "sentry" ? NR.Sentry : NR.Sentinel)(U.clamp(px+side*500,100,W.W-100),W.groundY,mul);
    } else {
      e = new NR.Wraith(U.clamp(px + side * U.rand(300, 500), 100, W.W - 100), W.groundY - 200, mul);
    }
    F.teleport(e.x, e.y - e.h / 2,
      type === "crawler" ? "red" : type === "drone" ? "cyan" : type === "slime" ? "blue" : type === "soldier" ? "orange" : "purple");
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
    G.upgradeT = 0.95; // game-timer driven (pause safe)
  }

  G.closeUpgrade = function () {
    G.state = "playing";
    G.startT = G.mode === "adventure" ? 0 : 1.6;
    NR.adventure.checkpointAfterUpgrade(G);
  };

  /* ================= combat ================= */
  G.playerStrike = function (A) {
    const p = G.player;
    let hitAny = false;
    const counter = p.counterT>0;
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - p.x;
      const inFront = p.facing > 0 ? dx > -10 : dx < 10;
      if (!inFront || Math.abs(dx) > A.rng) continue;
      const ey = e.y - e.h / 2, py = p.y - 45;
      if (Math.abs(ey - py) > 95 + e.h / 2) continue;
      const crit = U.chance(p.critCh);
      const dmg = A.dmg * p.dmgMul * (p.overdriveT > 0 ? 2 : 1) * (crit ? 2 : 1) * (counter ? 1.75 : 1);
      const beforeHp=e.hp;
      e.hurt(dmg, p.facing * A.kb, -A.kb * 0.35, crit, G);
      if(e.hp>=beforeHp)continue;
      F.text(e.x, e.y - e.h - 12, Math.round(dmg), { col: crit ? "#ffe14d" : "#ffffff", size: crit ? 30 : 20, crit });
      p.addEnergy(6.5);
      if (p.lifesteal > 0) p.heal(dmg * p.lifesteal);
      hitAny = true;
    }
    NR.adventure.strikeProps(p,A,G);
    if (hitAny) {
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
    if (p.dead || p.iframes > 0 || p.dashT > 0 || p.stormT > 0 || p.shieldT > 0) return;
    if (NR.combat.tryParry(G,dir,src)) return;
    dmg *= (G.difficulty === "casual" ? .6 : G.difficulty === "hard" ? 1.4 : 1) * (p.damageTakenMul || 1);
    p.hp -= dmg;
    p.comboResetT = 99; // combo resets
    G.combo = 0; G.comboT = 0;
    G.waveDamageTaken = true;
    p.iframes = 0.85 * (p.guardMul || 1);
    p.hitstun = 0.26;
    p.vx = (dir || 1) * 430; p.vy = -290;
    hud.hurtVign = 1;
    G.shake(0.4);
    G.hitStop(0.06);
    F.text(p.x, p.y - 110, "-" + Math.round(dmg), { col: "#ff5f7a", size: 24, crit: true });
    F.burst(p.x, p.y - 46, { n: 14, col: "red", spd: 340, life: 0.5 });
    NR.audio.play("hurt");
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true;
      G.deathT = 1.5;
      G.slowmo(0.25, 1.4);
      hud.flash("rgba(255,45,90,0.4)");
      F.burst(p.x, p.y - 46, { n: 60, col: "cyan", spd: 620, life: 1.1 });
      F.ring(p.x, p.y - 46, { col: "magenta", r1: 380, life: 0.8, lw: 12 });
      NR.audio.play("pdie");
      NR.audio.duck(0.08, 2);
    }
  };

  G.onEnemyKilled = function (e) {
    G.stats.kills++;
    NR.profile.totalKills++; NR.saveProfile();
    G.combo++;
    G.comboT = G.comboWindow();
    if (G.combo > G.stats.maxCombo) G.stats.maxCombo = G.combo;
    G.addScore(e.score, e.x, e.y - e.h - 6, false);
    NR.progress.check(G);
    // giblets
    F.burst(e.x, e.y - e.h / 2, { n: 26, col: e.type === "crawler" ? "red" : e.type === "drone" ? "cyan" : "purple", spd: 430, life: 0.65 });
    F.shards(e.x, e.y - e.h / 2, 10, e.type === "crawler" ? "magenta" : "cyan");
    F.ring(e.x, e.y - e.h / 2, { col: "white", r1: 90, life: 0.35, lw: 5 });
    NR.audio.play("kill");
    if (e.type !== "boss") G.slowmo(0.55, 0.08);
    // drops
    if (U.chance(0.09)) G.pickups.push(new NR.Pickup(e.x, e.y - 20, "heart"));
    else if (U.chance(0.15)) G.pickups.push(new NR.Pickup(e.x, e.y - 20, "energy"));
  };

  G.onBossKilled = function (b) {
    G.stats.kills++; NR.profile.totalKills++; NR.saveProfile(); NR.progress.check(G);
    G.bossActive = false; G.bossRef = null;
    G.addScore(b.score, b.x, b.y - 200, true);
    G.banner("TARGET ELIMINATED", "+" + U.fmt(b.score), "#ffe14d");
    F.burst(b.x, b.y - 90, { n: 80, col: "orange", spd: 700, life: 1.2 });
    F.burst(b.x, b.y - 90, { n: 40, col: "magenta", spd: 500, life: 1 });
    F.ring(b.x, b.y - 90, { col: "yellow", r1: 600, life: 0.9, lw: 14 });
    G.shake(1);
    hud.flash("rgba(255,225,120,0.35)");
    NR.audio.play("explode");
    for (let i = 0; i < 3; i++) G.pickups.push(new NR.Pickup(b.x + U.rand(-80, 80), b.y - 60, i === 0 ? "heart" : "energy"));
    // clear remaining adds spectacularly
    for (const e of G.enemies) if (!e.dead) { F.burst(e.x, e.y - e.h / 2, { n: 18, col: "orange", spd: 400, life: 0.6 }); e.dead = true; }
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
        G.finishRun(false);
        return;
      }
    }

    // wave start countdown
    if (G.mode === "survival" && !p.dead && G.startT > 0 && G.startT < 900) {
      G.startT -= rd;
      if (G.startT <= 0) {
        if (G.enemies.length === 0 && G.spawnQueue.length === 0 && !G.bossActive) startWave(G.wave + 1);
        else G.startT = 0.5;
      }
    }

    // spawn queue
    for (let i = G.spawnQueue.length - 1; i >= 0; i--) {
      const q = G.spawnQueue[i];
      q.t -= dt;
      if (q.t <= 0) { spawnEnemy(q.type); G.spawnQueue.splice(i, 1); }
    }

    // Authored expedition logic shares combat, not wave scheduling.
    NR.adventure.update(dt,G);
    if(G.state !== "playing") return;

    // entities
    p.update(dt, G);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.update(dt * (G.chronoT>0 ? 0.35 : 1), G);
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
    NR.spriteRender.updateCorpses(G, dt);
    for (let i = G.bolts.length - 1; i >= 0; i--) { G.bolts[i].update(dt * (G.chronoT>0 ? 0.35 : 1), G); if (G.bolts[i].dead) G.bolts.splice(i, 1); }
    for(let i=G.shots.length-1;i>=0;i--){G.shots[i].update(dt,G);if(G.shots[i].dead)G.shots.splice(i,1);}
    for (let i = G.shockwaves.length - 1; i >= 0; i--) { G.shockwaves[i].update(dt, G); if (G.shockwaves[i].dead) G.shockwaves.splice(i, 1); }
    for (let i = G.pickups.length - 1; i >= 0; i--) { G.pickups[i].update(dt, G); if (G.pickups[i].dead) G.pickups.splice(i, 1); }
    F.update(dt);
    W.update(rd, NR.view);

    // combo decay
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }

    // wave cleared?
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
    if(G.finished)return;
    G.finished=true;G.state=victory?'victory':'over';
    const newHigh = G.score > G.high;
    if (newHigh) { G.high = G.score; NR.store.setItem('nr_high', String(G.high)); }
    // Skyward progression: coins + XP for every run, gems for milestones
    if (!G.rewarded) {
      G.rewarded = true;
      const reward = NR.economy.awardRun({
        score: G.score, kills: G.stats.kills, wave: G.mode === "survival" ? G.wave : G.chapter + 1,
      });
      let gems = 0;
      if (G.mode === "survival" && G.wave >= 5) gems += Math.floor(G.wave / 5) * 5;
      if (G.mode === "adventure" && G.finished) gems += 25;
      if (gems > 0) NR.economy.addGems(gems);
      G.lastReward = { ...reward, gems };
      NR.progress.check(G);
    }
    if(G.mode==='survival')NR.profile.bestWave=Math.max(NR.profile.bestWave||0,G.wave);
    NR.profile.runs++;NR.saveProfile();NR.progress.record(G,victory);
    if(victory)NR.expeditionUI.showVictory(G);
    else NR.ui.showGameOver(G,newHigh);
    document.getElementById('run-save').textContent=NR.store.persistent?'Record saved on this device. No server or account needed.':'Storage is blocked. This record lasts only while this tab stays open.';
    NR.expeditionUI.refresh();
  };
})();
