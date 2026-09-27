/* ============ SUKUNA SLICE — signature ultimate ============
   ONCE PER RUN. Press V / G (or the 斬 SUKUNA button):
     · the hero rises into the air and hovers for 5 seconds (invulnerable)
     · the background drops into a crimson "domain", katana "shiiing" sounds
     · five cleave waves sweep the screen; every enemy on screen is cut into
       two halves that slide apart along the cut line and fall away
     · bosses cannot be one-shot: each wave takes 9% of their max health
   Halves are real snapshots of the enemy's current sprite frame, clipped along
   a random diagonal — the actual character is split, not a stock effect. */
(function () {
  const U = NR.util, F = NR.fx, I = NR.input, G = NR.game;
  const DURATION = 5, BASE_COOLDOWN = 24, WAVES = [0.45, 1.3, 2.15, 3.0, 3.85], BOSS_CUT = 0.09;
  const SK = (NR.sukuna = { halves: [], slashes: [], cuts: [], domain: 0, cooldown: 0, maxCooldown: BASE_COOLDOWN });

  SK.reset = function () {
    SK.halves.length = 0; SK.slashes.length = 0; SK.cuts.length = 0;
    SK.domain = 0; SK.cooldown = 0; SK.wave = 0; SK.caster = null;
    SK.maxCooldown = BASE_COOLDOWN * ((NR.heroes && NR.heroes.current().sukuna) || 1);
  };
  // the domain belongs to whoever opened it (co-op partners can open their own once)
  SK.active = () => !!(SK.caster && SK.caster.sukunaT > 0 && !SK.caster.dead);
  SK.used = () => !!(G.player && G.player.sukunaUsed);
  SK.ready = () => G.state === "playing" && !!G.player && !G.player.dead && !G.player.sukunaUsed && !SK.active();

  SK.cast = function () {
    if (!SK.ready()) return false;
    const p = G.player;
    p.sukunaUsed = true; SK.caster = p;
    p.sukunaT = DURATION; p.sukunaBaseY = p.y;
    p.sukunaTargetY = Math.max(180, NR.world.groundY - 250);
    p.iframes = Math.max(p.iframes, DURATION + 0.4);
    p.vx = 0; p.vy = 0; p.attackT = 0; p.attackIdx = -1; p.dashT = 0;
    SK.wave = 0;
    SK.cooldown = 0; // single use: no recharge, the button shows USED
    // enemy projectiles on screen dissolve as the domain opens
    for (const b of G.bolts) { F.sparks(b.x, b.y, 4, "red"); b.dead = true; }
    NR.audio.play("domain");
    NR.audio.duck(0.15, 2.5);
    G.banner("SUKUNA SLICE", "DOMAIN EXPANSION · 5 SECONDS · ONCE PER RUN", "#ff3048");
    G.shake(0.5);
    G.flash && G.flash("rgba(255,40,60,0.35)");
    F.ring(p.x, p.y - 50, { col: "red", r1: 420, life: 0.6, lw: 5 });
    return true;
  };

  /* ---------------- slicing ---------------- */
  const SNAP = 440, FOOT = 340; // snapshot canvas + feet anchor inside it
  function snapshot(e) {
    try {
      const cv = document.createElement("canvas");
      if (!cv.getContext) return null;
      cv.width = SNAP; cv.height = SNAP;
      const g = cv.getContext("2d");
      if (!g || !g.translate) return null;
      const hp = e.hp, spawn = e.spawnT, flash = e.flash;
      e.hp = e.maxHp; e.spawnT = 0; e.flash = 0; // no health bar / teleport glow in the halves
      g.save(); g.translate(SNAP / 2 - e.x, FOOT - e.y);
      e.draw(g);
      g.restore();
      e.hp = hp; e.spawnT = spawn; e.flash = flash;
      return cv;
    } catch (_) { return null; }
  }
  SK.slice = function (e, angle) {
    const img = snapshot(e);
    const cy = e.y - (e.h || 60) * 0.55;
    const a = angle === undefined ? U.rand(-0.55, 0.55) : angle;
    const nx = -Math.sin(a), ny = Math.cos(a); // cut-line normal (points "down" side)
    const push = U.rand(110, 170);
    const base = { img, x: e.x, y: e.y, cy, a, t: 0, life: 1.7, floor: e.flying ? NR.world.groundY : e.y };
    // side -1 = upper half (slides along the cut and lifts off), +1 = lower half
    SK.halves.push({ ...base, side: -1, vx: Math.cos(a) * push * (Math.random() < 0.5 ? -1 : 1) - nx * 60, vy: -260 - ny * 40, rot: 0, vr: U.rand(-3.2, 3.2), ox: 0, oy: 0 });
    SK.halves.push({ ...base, side: 1, vx: nx * 50, vy: -60, rot: 0, vr: U.rand(-1.2, 1.2), ox: 0, oy: 0 });
    if (SK.halves.length > 60) SK.halves.splice(0, SK.halves.length - 60);
    // bright cut line + blood/spark spray along the edge
    SK.cuts.push({ x: e.x, y: cy, a, t: 0, life: 0.32, len: Math.max(140, (e.w || 50) * 2.4) });
    F.burst(e.x, cy, { n: 22, col: "red", spd: 420, life: 0.6 });
    F.sparks(e.x, cy, 10, "white");
    // kill through the enemy's own death path, but replace its corpse with the halves
    const before = G.corpses ? G.corpses.length : 0;
    e.hp = 0;
    try { e.die(G); } catch (_) { e.dead = true; }
    e.dead = true;
    if (G.corpses && G.corpses.length > before) G.corpses.splice(before);
  };
  function inView(e) {
    const cam = G.cam, v = NR.view;
    return e.x > cam.x - 60 && e.x < cam.x + v.w + 60 && e.y > cam.y - 200 && e.y - (e.h || 60) < cam.y + v.h + 60;
  }
  function cleave() {
    SK.wave++;
    const p = SK.caster || G.player;
    NR.audio.play(SK.wave === 1 ? "bladeFlurry" : "blade");
    G.shake(0.35);
    // screen-wide slash streaks for this wave
    for (let i = 0; i < 7; i++) addSlash(0.28 + Math.random() * 0.12, 1.4);
    let cut = 0;
    for (const e of G.enemies.slice()) {
      if (e.dead || e.spawnT > 0 || !inView(e)) continue;
      if (e.boss) {
        if (e.state === "intro" || e.state === "dying") continue;
        const was = e.hp;
        e.hurt(e.maxHp * BOSS_CUT, 0, 0, true, G);
        SK.cuts.push({ x: e.x, y: e.y - (e.h || 150) * 0.5, a: U.rand(-0.6, 0.6), t: 0, life: 0.35, len: (e.w || 130) * 2.6 });
        F.burst(e.x, e.y - (e.h || 150) * 0.5, { n: 30, col: "red", spd: 520, life: 0.7 });
        if (e.hp < was) cut++;
      } else { SK.slice(e); cut++; }
    }
    if (cut) { G.hitStop && G.hitStop(0.06); F.text(p.x, p.y - 140, "SLICED ×" + cut, { col: "#ff5a6e", size: 26 }); }
  }
  function addSlash(life, width) {
    const cam = G.cam, v = NR.view;
    const cx = cam.x + Math.random() * v.w, cy = cam.y + v.h * (0.15 + Math.random() * 0.7);
    SK.slashes.push({ x: cx, y: cy, a: U.rand(-0.9, 0.9) + (Math.random() < 0.5 ? 0 : Math.PI / 2 * 0.3), len: U.rand(v.w * 0.35, v.w * 0.9), t: 0, life, w: width || 1 });
    if (SK.slashes.length > 40) SK.slashes.shift();
  }

  /* ---------------- per-frame ---------------- */
  SK.update = function (dt) {
    if (!G.player) return;
    const p = SK.caster || G.player;
    if (I.justPressed("sukuna") && !G.netGuest) {
      if (!SK.cast() && G.player.sukunaUsed) NR.hub?.notify?.("SUKUNA SLICE already used this run · next run it is ready again");
    }
    if (SK.active()) {
      const elapsed = DURATION - p.sukunaT;
      SK.domain = Math.min(1, SK.domain + dt * 3);
      while (SK.wave < WAVES.length && elapsed >= WAVES[SK.wave]) cleave();
      if (Math.random() < dt * 9) addSlash(0.22, 0.8); // ambient cuts inside the domain
    } else SK.domain = Math.max(0, SK.domain - dt * 2);
    for (let i = SK.halves.length - 1; i >= 0; i--) {
      const h = SK.halves[i];
      h.t += dt;
      h.vy += 1500 * dt;
      h.ox += h.vx * dt; h.oy += h.vy * dt;
      h.rot += h.vr * dt;
      // halves come to rest on the floor they were standing on
      const bottom = h.y + h.oy;
      if (bottom > h.floor && h.vy > 0) { h.oy = h.floor - h.y; h.vy *= -0.18; h.vx *= 0.6; h.vr *= 0.5; }
      if (h.t >= h.life) SK.halves.splice(i, 1);
    }
    for (const list of [SK.slashes, SK.cuts]) for (let i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t >= list[i].life) list.splice(i, 1); }
    const cd = document.getElementById("sukuna-cd");
    if (cd) {
      const mine = SK.active() && SK.caster === G.player;
      const txt = mine ? "LIVE" : G.player.sukunaUsed ? "USED" : "";
      if (cd.textContent !== txt) cd.textContent = txt;
      const btn = cd.parentElement;
      if (btn && btn.classList) { btn.classList.toggle("ready", !G.player.sukunaUsed && !SK.active()); btn.classList.toggle("live", mine); btn.classList.toggle("used", !!G.player.sukunaUsed && !mine); }
    }
  };

  /* hero flight: replaces normal physics while the domain is open */
  const PP = NR.Player.prototype;
  const baseUpdate = PP.update;
  PP.update = function (dt, g) {
    if (!(this.sukunaT > 0) || this.dead) return baseUpdate.call(this, dt, g);
    this.t += dt;
    this.sukunaT = Math.max(0, this.sukunaT - dt);
    this.iframes = Math.max(this.iframes, 0.3);
    const ax = I.axis();
    if (ax) this.facing = ax;
    this.vx = U.damp(this.vx, ax * 240, 6, dt);
    this.x = U.clamp(this.x + this.vx * dt, 40, NR.world.W - 40);
    const hover = Math.sin(this.t * 3) * 8;
    const rising = this.sukunaT > 0.45;
    this.y = U.damp(this.y, rising ? this.sukunaTargetY + hover : this.sukunaBaseY, rising ? 5 : 7, dt);
    this.prevBottom = this.y;
    this.vy = rising ? -60 : 200; this.onGround = false;
    if (this.sukunaT <= 0) { this.vy = 0; this.iframes = Math.max(this.iframes, 0.6); }
    if (Math.random() < dt * 30) F.burst(this.x + U.rand(-20, 20), this.y - U.rand(10, 80), { n: 1, col: "red", spd: 60, life: 0.5, size: 5, grav: -40 });
    this.computePose();
    this.tickAnim(dt);
    this.updatePet(dt);
  };
  const baseDraw = PP.draw;
  PP.draw = function (ctx) {
    if (this.sukunaT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "red", this.x, this.y - 45, 95 + Math.sin(this.t * 14) * 10, 0.55);
      ctx.restore();
    }
    baseDraw.call(this, ctx);
  };

  /* crimson domain darkens the scenery behind the fighters */
  const drawBack = NR.world.drawBack;
  NR.world.drawBack = function (ctx, cam, view) {
    drawBack.call(this, ctx, cam, view);
    if (SK.domain <= 0.01 || !G.player || G.state === "menu") return;
    ctx.save();
    ctx.globalAlpha = 0.62 * SK.domain;
    ctx.fillStyle = "#1a0006";
    ctx.fillRect(cam.x - 100, cam.y - 100, view.w + 200, view.h + 200);
    ctx.globalAlpha = 0.28 * SK.domain;
    ctx.fillStyle = "#ff1e3c";
    ctx.fillRect(cam.x - 100, cam.y - 100, view.w + 200, view.h + 200);
    ctx.restore();
  };

  /* halves, cut lines and screen slashes draw over the fight */
  const fxDraw = NR.fx.draw;
  NR.fx.draw = function (ctx) {
    fxDraw(ctx);
    if (!SK.halves.length && !SK.slashes.length && !SK.cuts.length) return;
    for (const h of SK.halves) {
      if (!h.img) continue;
      const k = h.t / h.life, alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      // move to the cut centre, rotate the piece, clip to its side of the line
      const px = h.x + h.ox, py = h.cy + h.oy;
      ctx.translate(px, py);
      ctx.rotate(h.rot);
      ctx.rotate(h.a);
      ctx.beginPath();
      if (h.side < 0) ctx.rect(-SNAP, -SNAP, SNAP * 2, SNAP);
      else ctx.rect(-SNAP, 0, SNAP * 2, SNAP);
      ctx.clip();
      ctx.rotate(-h.a);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(h.img, -SNAP / 2, -(FOOT - (h.y - h.cy)), SNAP, SNAP);
      ctx.restore();
      // glowing wound along the cut edge
      if (k < 0.5) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (0.5 - k) * 1.6;
        ctx.translate(px, py); ctx.rotate(h.rot + h.a);
        ctx.fillStyle = "#ff3048"; ctx.fillRect(-40, -2, 80, 4);
        ctx.restore();
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const s of SK.slashes) {
      const k = s.t / s.life, reach = Math.min(1, k * 4);
      const dx = Math.cos(s.a) * s.len / 2, dy = Math.sin(s.a) * s.len / 2;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = "#ff2340"; ctx.lineWidth = 7 * s.w * (1 - k);
      ctx.beginPath(); ctx.moveTo(s.x - dx, s.y - dy); ctx.lineTo(s.x - dx + dx * 2 * reach, s.y - dy + dy * 2 * reach); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * s.w * (1 - k);
      ctx.beginPath(); ctx.moveTo(s.x - dx, s.y - dy); ctx.lineTo(s.x - dx + dx * 2 * reach, s.y - dy + dy * 2 * reach); ctx.stroke();
    }
    for (const c of SK.cuts) {
      const k = c.t / c.life, dx = Math.cos(c.a) * c.len / 2, dy = Math.sin(c.a) * c.len / 2;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = "#ffe0e4"; ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.beginPath(); ctx.moveTo(c.x - dx, c.y - dy); ctx.lineTo(c.x + dx, c.y + dy); ctx.stroke();
    }
    ctx.restore();
  };

  /* hook into the run lifecycle */
  const start = G.start;
  G.start = function (...args) {
    SK.reset();
    const r = start.apply(G, args);
    if (G.player) { G.player.sukunaT = 0; G.player.sukunaUsed = false; }
    return r;
  };
  const update = G.update;
  G.update = function (dt, rd) {
    update.call(G, dt, rd);
    if (G.state === "playing") SK.update(dt);
  };
  const reset = NR.fx.reset;
  NR.fx.reset = function () { reset(); SK.halves.length = 0; SK.slashes.length = 0; SK.cuts.length = 0; };
})();
