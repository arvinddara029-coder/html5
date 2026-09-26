/* ============ NEON RONIN — particles, slashes, shockwaves, floating text ============ */
(function () {
  const U = NR.util, rand = U.rand, lerp = U.lerp;
  const F = (NR.fx = { parts: [], texts: [], slashes: [], max: 1000 });

  F.reset = function () { F.parts.length = 0; F.texts.length = 0; F.slashes.length = 0; };
  function add(p) { if (F.parts.length > F.max) F.parts.shift(); F.parts.push(p); }

  F.burst = function (x, y, o = {}) {
    const n = o.n || 12, col = o.col || "cyan", spd = o.spd || 260, life = o.life || 0.5,
      size = o.size || 6, type = o.type || "glow", grav = o.grav === undefined ? 600 : o.grav,
      spread = o.spread === undefined ? U.TAU : o.spread, base = o.ang || 0;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread, v = spd * (0.3 + Math.random() * 0.7);
      add({ type, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), grav, t: 0,
        life: life * (0.55 + Math.random() * 0.8), size: size * (0.5 + Math.random()),
        col, rot: rand(U.TAU), vr: (Math.random() - 0.5) * 14 });
    }
  };
  F.sparks = (x, y, n = 8, col = "white", spd = 520) =>
    F.burst(x, y, { n, col, type: "spark", spd, life: 0.32, size: 9, grav: 1000 });
  F.smoke = function (x, y, n = 4) {
    for (let i = 0; i < n; i++)
      add({ type: "smoke", x: x + rand(-8, 8), y: y + rand(-6, 6), vx: rand(-30, 30), vy: rand(-70, -20),
        grav: -40, t: 0, life: rand(0.7, 1.3), size: rand(16, 34), col: "smoke", rot: 0, vr: 0 });
  };
  F.ring = (x, y, o = {}) =>
    add({ type: "ring", x, y, vx: 0, vy: 0, grav: 0, t: 0, life: o.life || 0.45, size: o.r0 || 12,
      r1: o.r1 || 130, col: o.col || "cyan", lw: o.lw || 7, rot: 0, vr: 0 });
  F.shards = (x, y, n, col) => F.burst(x, y, { n, col, type: "shard", spd: 460, life: 0.6, size: 7, grav: 1300 });
  F.embers = (x, y, n, col = "orange") => F.burst(x, y, { n, col, type: "glow", spd: 160, life: 0.9, size: 5, grav: -120 });
  F.text = (x, y, str, o = {}) =>
    F.texts.push({ x, y, str, t: 0, life: o.life || 0.9, col: o.col || "#fff", size: o.size || 20,
      vy: o.vy === undefined ? -85 : o.vy, crit: !!o.crit });
  F.slash = (x, y, dir, stage, reach) =>
    F.slashes.push({ x, y, dir, stage, reach: reach || 150, t: 0, life: 0.24 });
  // ghost trail for dash
  F.ghosts = [];
  F.ghost = (pose) => F.ghosts.push({ pose: Object.assign({}, pose), t: 0, life: 0.34 });
  F.teleport = function (x, y, col = "magenta") {
    F.ring(x, y, { col, r1: 160, life: 0.4 });
    F.burst(x, y - 40, { n: 22, col, spd: 340, life: 0.5, type: "spark", grav: 0, up: 140 });
  };

  F.update = function (dt) {
    const P = F.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = F.texts.length - 1; i >= 0; i--) {
      const t = F.texts[i]; t.t += dt; t.y += t.vy * dt;
      if (t.t >= t.life) F.texts.splice(i, 1);
    }
    for (let i = F.slashes.length - 1; i >= 0; i--) {
      F.slashes[i].t += dt;
      if (F.slashes[i].t >= F.slashes[i].life) F.slashes.splice(i, 1);
    }
    for (let i = F.ghosts.length - 1; i >= 0; i--) {
      F.ghosts[i].t += dt;
      if (F.ghosts[i].t >= F.ghosts[i].life) F.ghosts.splice(i, 1);
    }
  };

  const GLOW_COLS = { cyan: "#aafffb", magenta: "#ffc2e2", white: "#fff", yellow: "#fff3b0", orange: "#ffd9a0", purple: "#dcc4ff", green: "#c2ffdd", red: "#ffc4ca", blue: "#c9e4ff" };

  F.draw = function (ctx) {
    /* --- additive glow pass --- */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of F.parts) {
      const k = 1 - p.t / p.life;
      if (p.type === "glow") {
        NR.sprites.drawGlow(ctx, p.col, p.x, p.y, p.size * (1.6 + (1 - k)), k * 0.9);
      } else if (p.type === "spark") {
        ctx.strokeStyle = GLOW_COLS[p.col] || "#fff";
        ctx.globalAlpha = k; ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.type === "ring") {
        const e = U.ease.outCubic(p.t / p.life);
        ctx.globalAlpha = k;
        ctx.strokeStyle = GLOW_COLS[p.col] || "#fff";
        ctx.lineWidth = p.lw * k + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.size, p.r1, e), 0, U.TAU); ctx.stroke();
      } else if (p.type === "shard") {
        ctx.globalAlpha = k;
        ctx.fillStyle = GLOW_COLS[p.col] || "#fff";
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    /* slash arcs */
    for (const s of F.slashes) drawSlash(ctx, s);
    ctx.restore();

    /* --- normal pass: smoke --- */
    for (const p of F.parts) {
      if (p.type !== "smoke") continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = k * 0.28;
      ctx.drawImage(NR.sprites.soft, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    ctx.globalAlpha = 1;

    /* --- floating combat text --- */
    ctx.save();
    ctx.textAlign = "center";
    for (const t of F.texts) {
      const k = 1 - t.t / t.life;
      const pop = t.t < 0.12 ? U.ease.outBack(t.t / 0.12) : 1;
      const sz = t.size * pop * (t.crit ? 1.25 : 1);
      ctx.font = `900 ${sz}px Orbitron, sans-serif`;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(2,4,12,0.9)";
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  };

  function drawSlash(ctx, s) {
    const p = s.t / s.life, e = U.ease.outCubic(p);
    // angle swept per stage (mirrored by dir)
    let a0, a1;
    if (s.stage === 0) { a0 = -1.9; a1 = 0.9; }
    else if (s.stage === 1) { a0 = 1.5; a1 = -1.6; }
    else { a0 = -2.6; a1 = 1.0; }
    const head = lerp(a0, a1, e), tail = lerp(a0, a1, Math.max(0, e - 0.35));
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.dir, 1);
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const t0 = lerp(tail, head, i / segs), t1 = lerp(tail, head, (i + 1) / segs);
      const fade = i / segs;
      ctx.globalAlpha = (1 - p) * fade * 0.9;
      ctx.strokeStyle = s.stage === 2 ? "#ffd9f1" : "#c9fffb";
      ctx.lineWidth = (s.stage === 2 ? 16 : 11) * (1 - p * 0.5) * fade + 1;
      ctx.beginPath();
      ctx.arc(0, 0, s.reach * (0.85 + fade * 0.2), t0, t1, false);
      ctx.stroke();
    }
    NR.sprites.drawGlow(ctx, s.stage === 2 ? "magenta" : "cyan",
      Math.cos(head) * s.reach, Math.sin(head) * s.reach, 46 * (1 - p) + 8, (1 - p) * 0.9);
    ctx.restore();
  }
})();
