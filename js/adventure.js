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
      name: "THE NEON OUTSKIRTS",
      short: "Outskirts",
      district: "SECTOR 09",
      biome: "city",
      color: "#8af5e1",
      description:
        "Follow the abandoned transit line. Restore three relays and find a way beyond the city wall.",
      objective: "Restore the transit relays",
      length: 6800,
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
    },
  ];
  const basePlatforms = W.platforms.map((p) => ({ ...p }));
  A.configure = function (mode, chapter) {
    A.active = mode === "adventure";
    A.chapter = A.chapters[chapter] || A.chapters[0];
    A.prompt = null;
    A.t = 0;
    A.pendingCheckpoint = false;
    if (!A.active) {
      W.W = 2560;
      W.platforms = basePlatforms.map((p) => ({ ...p }));
      return;
    }
    W.W = A.chapter.length;
    W.platforms = [];
    // Each district has a different traversal rhythm. Ground is always walkable;
    // elevated routes reward double jumps without blocking relay accessibility.
    const patterns = [
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
    ];
    for (let i = 0; i < 4; i++)
      for (const [dx, y, w, ampX, ampY] of patterns[A.chapter.id]) {
        const x = 650 + i * 1500 + dx;
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
    A.relays = [1750, 3400, 5050].map((x, id) => ({ id, x, active: false }));
    A.zones = [750, 2350, 4000, 5600].map((x, id) => ({
      id,
      x,
      started: false,
      cleared: false,
      gate: x + 620,
    }));
    A.caches = [500, 2170, 3860, 5480].map((x, id) => ({ id, x, open: false }));
    const dangers = [
      [
        [1180, "spikes", 100],
        [2870, "laser", 85],
        [4400, "saw", 100],
        [5840, "laser", 85],
      ],
      [
        [1100, "spikes", 100],
        [2720, "saw", 100],
        [4250, "spikes", 100],
        [5860, "saw", 100],
      ],
      [
        [980, "laser", 85],
        [2520, "laser", 85],
        [4220, "saw", 100],
        [5920, "laser", 85],
      ],
    ];
    A.hazards = dangers[A.chapter.id].map(([x, type, w], id) => ({
      x,
      type,
      w,
      id,
      phase: id * 0.9,
    }));
    A.shards = [];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const platform =
          W.platforms[
            i * patterns[A.chapter.id].length +
              Math.min(j, patterns[A.chapter.id].length - 1)
          ];
        A.shards.push({
          id: i * 4 + j,
          x:
            platform.x +
            platform.w * (j === 3 && A.chapter.id === 0 ? 0.75 : 0.4),
          y: platform.y - 45,
          collected: false,
        });
      }
    A.props = [620, 1100, 2200, 3100, 3900, 5420].map((x, id) => ({
      id,
      x: x + A.chapter.id * 25,
      y: W.groundY,
      hp: 28,
      broken: false,
    }));
  };
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
      G.score = checkpoint.score;
      G.time = checkpoint.time;
      G.stats = { ...G.stats, ...checkpoint.stats };
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
    if (zone.id === 3 && G.chapter === 2) {
      const boss = new NR.Boss(x + 120, y, m, 1);
      G.bossActive = true;
      G.bossRef = boss;
      add(boss);
      G.banner("SHOGUN-9", "The final lock is a war machine.", "#ff826b");
    } else {
      add(new NR.Crawler(x - 100, y, m));
      add(new NR.Crawler(x + 150, y, m));
      if (G.chapter >= 1 || zone.id >= 1) add(new NR.Slime(x + 40, y, m));
      if (zone.id > 0 || G.chapter > 0) add(new NR.Sentry(x + 260, y, m));
      if (zone.id > 1 || G.chapter > 0) add(new NR.Soldier(x - 40, y, m));
      if (zone.id === 3 || G.chapter === 2) add(new NR.Sentinel(x + 60, y, m));
      if (G.chapter > 0 && zone.id === 2)
        add(new NR.Wraith(x + 200, y - 100, m));
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
    if (p.x > W.W - 340)
      A.prompt = {
        label: exitReady
          ? "EXTRACT / COMPLETE CHAPTER"
          : "RESTORE ALL THREE RELAYS",
        kind: exitReady ? "exit" : "locked",
      };
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
        G.score += 1500;
        NR.progress.award("escape");
        if (G.chapter === 2) NR.progress.award("zero");
        NR.profile.unlocked = Math.max(
          NR.profile.unlocked,
          Math.min(2, G.chapter + 1),
        );
        NR.saveProfile();
        NR.checkpoint.clear();
        NR.audio.sample("victory");
        G.finishRun(true);
        return;
      } else
        NR.hub.notify(
          "Activate every relay before extracting. Follow the map markers.",
        );
      A.prompt = null;
    }
  };
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
      ctx.fillStyle = "#172c38";
      ctx.fillRect(ex - 50, gy - 190, 100, 190);
      ctx.strokeStyle = ready ? "#d5fa5b" : "#688292";
      ctx.lineWidth = 4;
      ctx.strokeRect(ex - 44, gy - 184, 88, 179);
      NR.atlas.draw(ctx, 70, ex - 24, gy - 125, 48, 48);
      ctx.fillStyle = ready ? "#d5fa5b22" : "#0a111d";
      ctx.fillRect(ex - 38, gy - 175, 76, 165);
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = ready ? "#d5fa5b" : "#9eaebb";
      ctx.fillText("EXTRACTION", ex, gy - 207);
    }
    ctx.restore();
  };
})();
