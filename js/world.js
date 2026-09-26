/* ============ NEON RONIN — world: parallax city, arena, rain, lightning ============ */
(function () {
  const U = NR.util, rand = U.rand, randi = U.randi, pick = U.pick;
  const W = (NR.world = {
    W: 2560, H: 1000, groundY: 880,
    platforms: [
      { x: 340, y: 700, w: 360, h: 22 },
      { x: 1860, y: 700, w: 360, h: 22 },
      { x: 1060, y: 545, w: 440, h: 22 },
      { x: 585, y: 415, w: 300, h: 22 },
      { x: 1675, y: 415, w: 300, h: 22 },
    ],
  });

  let midCity = null, rain = [], vehicles = [], lightning = 0, lightT = rand(5, 11), fogT = 0;

  W.init = function () {
    genMidCity();
    rain = [];
    for (let i = 0; i < 220; i++)
      rain.push({ fx: Math.random(), fy: Math.random(), len: rand(16, 34), spd: rand(950, 1500) });
    vehicles = [];
    for (let i = 0; i < 7; i++)
      vehicles.push({ fx: Math.random(), fy: rand(0.08, 0.34), v: rand(50, 140) * (U.chance(0.5) ? 1 : -1),
        col: pick(["cyan", "magenta", "yellow"]) });
  };

  /* mid-distance city silhouette with lit windows + neon billboards */
  function genMidCity() {
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 520;
    const g = c.getContext("2d");
    let x = 0;
    while (x < 2048) {
      const bw = randi(70, 160), bh = randi(130, 470);
      g.fillStyle = pick(["#0c1026", "#0a0e22", "#0e1330"]);
      g.fillRect(x, 520 - bh, bw, bh);
      // windows
      const cols = Math.floor(bw / 16), rows = Math.floor(bh / 22);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (!U.chance(0.16)) continue;
        g.fillStyle = U.chance(0.5) ? "rgba(0,255,244,0.75)" : (U.chance(0.5) ? "rgba(255,45,149,0.7)" : "rgba(255,225,120,0.65)");
        g.fillRect(x + 6 + i * 16, 520 - bh + 10 + j * 22, 5, 8);
      }
      // neon billboard on some towers
      if (bw > 90 && U.chance(0.4)) {
        const ncol = pick(["#ff2d95", "#00fff4", "#9650ff"]);
        g.fillStyle = ncol;
        g.globalAlpha = 0.8;
        g.fillRect(x + bw * 0.2, 520 - bh + 14, bw * 0.6, 6);
        g.globalAlpha = 0.25;
        g.fillRect(x + bw * 0.1, 520 - bh + 8, bw * 0.8, 18);
        g.globalAlpha = 1;
      }
      // antenna
      if (U.chance(0.5)) {
        g.fillStyle = "#0c1026";
        g.fillRect(x + bw / 2 - 1, 520 - bh - 22, 2, 22);
        g.fillStyle = "#ff3355";
        g.beginPath(); g.arc(x + bw / 2, 520 - bh - 24, 2.5, 0, U.TAU); g.fill();
      }
      x += bw + randi(4, 20);
    }
    midCity = c;
  }

  W.update = function (dt, view) {
    fogT += dt;
    for (const v of vehicles) {
      v.fx += (v.v / Math.max(view.w, 400)) * dt;
      if (v.fx > 1.1) v.fx = -0.1;
      if (v.fx < -0.1) v.fx = 1.1;
    }
    lightT -= dt;
    if (lightT <= 0 && NR.profile.world === "night") {
      lightning = 1;
      lightT = rand(7, 18);
      NR.audio.play("thunder", { delay: rand(0.3, 0.9) });
    }
    lightning = Math.max(0, lightning - dt * 2.4);
  };

  /* ---------- background ---------- */
  W.drawBack = function (ctx, cam, view) {
    const day = NR.profile.world === "day";
    const biome = NR.adventure?.active ? NR.adventure.chapter.biome : "city";
    const scenic = biome === "garden" || biome === "reactor";
    // sky
    const g = ctx.createLinearGradient(0, cam.y, 0, cam.y + view.h);
    g.addColorStop(0, day ? "#7eb9c9" : "#070818");
    g.addColorStop(0.55, day ? "#c4d7ce" : "#0d0f26");
    g.addColorStop(1, day ? "#f2cba3" : "#1b1030");
    ctx.fillStyle = g;
    ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);

    // far AI-generated cityscape (parallax 0.18), tiled
    const img = U.assets.get(scenic ? "bg_"+biome : day ? "bg_day" : "bg_far");
    if (img) {
      const f = 0.18;
      const drawH = view.h * (day || scenic ? 1.08 : 0.9);
      const drawW = drawH * (img.width / img.height);
      let startX = cam.x - (((cam.x * f) % drawW) + drawW) % drawW - drawW;
      const baseY = day || scenic ? cam.y - view.h * 0.04 : cam.y + view.h - drawH + view.h * 0.06;
      ctx.globalAlpha = 0.85;
      for (let x0 = startX; x0 < cam.x + view.w + drawW; x0 += drawW)
        ctx.drawImage(img, x0, baseY, drawW, drawH);
      ctx.globalAlpha = 1;
    }

    // purple haze band
    const haze = ctx.createLinearGradient(0, cam.y + view.h * 0.55, 0, cam.y + view.h);
    haze.addColorStop(0, "rgba(70,20,110,0)");
    haze.addColorStop(1, day ? "rgba(255,214,150,0.22)" : "rgba(90,30,140,0.25)");
    ctx.fillStyle = haze;
    ctx.fillRect(cam.x, cam.y + view.h * 0.55, view.w, view.h * 0.45);

    // mid city (parallax 0.45)
    if (midCity) {
      const f = 0.45, mh = 470, mw = 2048 * (mh / 520);
      const baseY = W.groundY - mh + 26;
      let startX = cam.x - (((cam.x * f) % mw) + mw) % mw - mw;
      ctx.globalAlpha = scenic ? (day ? .25 : .5) : day ? 0.55 : 0.95;
      for (let x0 = startX; x0 < cam.x + view.w + mw; x0 += mw)
        ctx.drawImage(midCity, x0, baseY, mw, mh);
      ctx.globalAlpha = 1;
    }

    // flying vehicles (screen-space streaks)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const v of vehicles) {
      const sx = cam.x + v.fx * view.w, sy = cam.y + v.fy * view.h * 0.9;
      NR.sprites.drawGlow(ctx, v.col, sx, sy, 9, 0.8);
      ctx.strokeStyle = "rgba(180,220,255,0.5)";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - v.v * 0.25, sy); ctx.stroke();
    }
    ctx.restore();

    NR.adventure?.drawScenery(ctx, cam, view);
    drawArena(ctx, cam, view);
  };

  function drawArena(ctx, cam, view) {
    const gy = W.groundY;
    // ground body
    const gg = ctx.createLinearGradient(0, gy, 0, W.H + 80);
    gg.addColorStop(0, NR.profile.world === "day" ? "#314d53" : "#0d0f22");
    gg.addColorStop(1, "#05060f");
    ctx.fillStyle = gg;
    ctx.fillRect(cam.x - 60, gy, view.w + 120, Math.max(W.H, cam.y + view.h) - gy + 120);
    // ground top neon edge
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const eg = ctx.createLinearGradient(0, gy - 8, 0, gy + 10);
    eg.addColorStop(0, "rgba(0,255,244,0)");
    eg.addColorStop(0.5, "rgba(0,255,244,0.85)");
    eg.addColorStop(1, "rgba(0,255,244,0)");
    ctx.fillStyle = eg;
    ctx.fillRect(cam.x - 60, gy - 8, view.w + 120, 18);
    ctx.restore();
    // neon grid receding
    ctx.strokeStyle = "rgba(0,255,244,0.07)";
    ctx.lineWidth = 1;
    const gridStart = Math.floor((cam.x - 60) / 128) * 128;
    for (let gx = gridStart; gx < cam.x + view.w + 60; gx += 128) {
      ctx.beginPath(); ctx.moveTo(gx, gy + 4); ctx.lineTo(gx - 60, W.H + 60); ctx.stroke();
    }
    // arena boundary walls
    for (const bx of [0, W.W]) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "magenta", bx, gy - 220, 60, 0.16);
      ctx.fillStyle = "rgba(255,45,149,0.35)";
      ctx.fillRect(bx - 2, gy - 460, 4, 460);
      ctx.restore();
    }
    // platforms
    for (const p of W.platforms) {
      if (p.x + p.w < cam.x - 50 || p.x > cam.x + view.w + 50) continue;
      // supports shadow
      ctx.fillStyle = "rgba(3,4,12,0.5)";
      ctx.fillRect(p.x + 8, p.y + p.h + 8, p.w, 8);
      // slab
      const pg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      pg.addColorStop(0, "#1a2142");
      pg.addColorStop(1, "#0a0d20");
      ctx.fillStyle = pg;
      NR.util.roundRect(ctx, p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      if (NR.adventure?.active) {
        for(let x=p.x; x<p.x+p.w; x+=70) NR.atlas.draw(ctx,36,x,p.y+3,Math.min(70,p.x+p.w-x),16);
      }
      // neon top edge
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(0,255,244,0.75)";
      ctx.fillRect(p.x + 4, p.y - 1.5, p.w - 8, 3);
      NR.sprites.drawGlow(ctx, "cyan", p.x + p.w / 2, p.y + p.h, p.w * 0.42, 0.10);
      ctx.restore();
      // hover thrusters
      const th = Math.sin(fogT * 6 + p.x) * 0.3 + 0.7;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "magenta", p.x + 30, p.y + p.h + 8, 12 * th, 0.5);
      NR.sprites.drawGlow(ctx, "magenta", p.x + p.w - 30, p.y + p.h + 8, 12 * (1.4 - th), 0.5);
      ctx.restore();
    }
  }

  /* ---------- foreground: rain + lightning ---------- */
  W.drawFront = function (ctx, cam, view) {
    if (NR.profile.world === "day") return;
    ctx.save();
    ctx.strokeStyle = "rgba(160,200,255,0.33)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const wind = Math.sin(fogT * 0.7) * 0.12 + 0.16;
    for (const r of rain) {
      r.fy += (r.spd / Math.max(view.h, 400)) * (1 / 60);
      r.fx += wind * (r.spd / Math.max(view.h, 400)) * (1 / 60);
      if (r.fy > 1.05) { r.fy = -0.05; r.fx = Math.random(); }
      if (r.fx > 1.05) r.fx = -0.05;
      const sx = cam.x + r.fx * view.w, sy = cam.y + r.fy * view.h;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - wind * r.len, sy - r.len);
    }
    ctx.stroke();
    ctx.restore();
    // lightning flash
    if (lightning > 0) {
      ctx.fillStyle = `rgba(210,225,255,${lightning * 0.16})`;
      ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);
    }
  };

  /* ---------- collision ---------- */
  // entity: {x(center), y(feet bottom), w, h, vx, vy, prevBottom, drop}
  W.collideEntity = function (e) {
    const wasGround = e.onGround;
    e.onGround = false; e.support = null;
    if (e.vy >= 0 && !e.drop) {
      for (const p of W.platforms) {
        if (e.x + e.w / 2 > p.x && e.x - e.w / 2 < p.x + p.w &&
            e.prevBottom <= p.y + 8 && e.y >= p.y) {
          e.y = p.y; e.vy = 0; e.onGround = true; e.support = p;
          break;
        }
      }
    }
    if (e.y >= W.groundY) { e.y = W.groundY; if (e.vy > 0) e.vy = 0; e.onGround = true; }
    if (!wasGround && e.onGround && e.onLand) e.onLand();
    e.x = U.clamp(e.x, 26, W.W - 26);
  };

  W.pointSolid = function (x, y) {
    if (y >= W.groundY + 2) return true;
    for (const p of W.platforms)
      if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return true;
    return false;
  };

  // circle vs aabb (box given as center-x, bottom-y)
  W.circleHits = function (cx, cy, r, e) {
    const left = e.x - e.w / 2, top = e.y - e.h;
    const nx = U.clamp(cx, left, left + e.w), ny = U.clamp(cy, top, top + e.h);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  };
})();
