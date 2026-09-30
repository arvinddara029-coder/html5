/* ============ SKYWARD — world: natural green adventure parallax + arenas ============
   The primary environment is a living, natural wildscape: layered green
   hills, forests, grass fringes, bushes and rocks — generated once into
   cached offscreen layers (cheap to blit, zero per-frame allocations).
   The Zero Reactor district keeps its industrial identity. */
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

  let midCity = null, grassFringe = null;
  let rain = [], vehicles = [], lightning = 0, lightT = rand(5, 11), fogT = 0;
  let stars = [], motes = [];

  W.init = function () {
    genMidCity();
    genNatureStamps();
    rain = [];
    for (let i = 0; i < 220; i++)
      rain.push({ fx: Math.random(), fy: Math.random(), len: rand(16, 34), spd: rand(950, 1500) });
    vehicles = [];
    for (let i = 0; i < 7; i++)
      vehicles.push({ fx: Math.random(), fy: rand(0.08, 0.34), v: rand(50, 140) * (U.chance(0.5) ? 1 : -1),
        col: pick(["cyan", "magenta", "yellow"]) });
    // night sky: a fixed star field that slowly parallaxes with the camera
    stars = [];
    for (let i = 0; i < 110; i++)
      stars.push({ fx: Math.random(), fy: Math.random() * 0.62, r: rand(0.7, 2.2), tw: rand(1.5, 5), ph: rand(0, 7) });
    // fireflies (garden night) / embers (reactor night) drifting particles
    motes = [];
    for (let i = 0; i < 40; i++)
      motes.push({ fx: Math.random(), fy: rand(0.25, 0.95), vx: rand(-14, 14), vy: rand(-22, -6), ph: rand(0, 7), big: U.chance(0.2) });
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

  /* cheap procedural grass fringe — only a fallback until the painted
     grass_strip.png decodes, so the ground is never blank on first frame. */
  function genNatureStamps() {
    const f = document.createElement("canvas");
    f.width = 256; f.height = 26;
    const fg = f.getContext("2d");
    for (let x = 0; x < 256; x += 3) {
      const h = 6 + Math.random() * 14;
      fg.strokeStyle = Math.random() < 0.5 ? "#4d8f4e" : "#3c7440";
      fg.lineWidth = 2;
      fg.beginPath();
      fg.moveTo(x, 26);
      fg.quadraticCurveTo(x + (Math.random() - 0.5) * 6, 26 - h * 0.6, x + (Math.random() - 0.5) * 8, 26 - h);
      fg.stroke();
    }
    grassFringe = f;
  }

  W.update = function (dt, view) {
    fogT += dt;
    for (const v of vehicles) {
      v.fx += (v.v / Math.max(view.w, 400)) * dt;
      if (v.fx > 1.1) v.fx = -0.1;
      if (v.fx < -0.1) v.fx = 1.1;
    }
    for (const m of motes) {
      m.fx += (m.vx / Math.max(view.w, 400)) * dt;
      m.fy += (m.vy / Math.max(view.h, 400)) * dt;
      if (m.fy < -0.05) { m.fy = 1.05; m.fx = Math.random(); }
      if (m.fx > 1.05) m.fx = -0.05;
      if (m.fx < -0.05) m.fx = 1.05;
    }
    lightT -= dt;
    const biome = W.biome();
    if (lightT <= 0 && NR.profile.world === "night" && biome === "reactor") {
      lightning = 1;
      lightT = rand(7, 18);
      NR.audio.play("thunder", { delay: rand(0.3, 0.9) });
    }
    lightning = Math.max(0, lightning - dt * 2.4);
  };

  /* current visual biome: adventure chapters carry their own look (the
     final spire keeps its industrial rooftop identity); every arena —
     wave climb, survival run, wave fight — lives in the natural wilds. */
  W.biome = function () {
    return NR.adventure?.active ? NR.adventure.chapter.biome : "wilds";
  };

  /* ---------- background ----------
     DAY (primary): bright natural sky, full-color world art, soft sun.
     NIGHT: the same world falls dark — deep-indigo grade, star field, moon,
     biome life (wilds/garden fireflies, reactor embers). */
  /* tile one painterly jungle treeline with parallax `f`, anchored so its
     base sits `fill` of the view-height above the ground. Returns false if
     the art isn't decoded yet (the renderer simply skips it — no error). */
  function jungleLayer(ctx, cam, view, path, f, fill, alpha) {
    const img = NR.assets && NR.assets.get ? NR.assets.get(path) : null;
    if (!img || !img.width || !img.height) return false;
    const ih = Math.max(220, view.h * fill);
    const iw = ih * (img.width / img.height);
    const baseY = W.groundY - ih + 30;
    const pcx = cam.x + (W.originX || 0);
    const startX = cam.x - (((pcx * f) % iw) + iw) % iw - iw;
    ctx.globalAlpha = alpha;
    for (let x0 = startX; x0 < cam.x + view.w + iw; x0 += iw)
      ctx.drawImage(img, x0, baseY, iw, ih);
    ctx.globalAlpha = 1;
    return true;
  }

  const NIGHT_SKY = { top: "#04060f", mid: "#0a0d21", low: "#160f2a" };
  const DAY_SKY = {
    wilds: ["#7fc4e0", "#cde8c2", "#f5eec0"],
    garden: ["#83c4a4", "#cfe6b8", "#f6e3ac"],
    reactor: ["#8e7a94", "#c69a7e", "#f2c08a"],
    city: ["#6fb3d6", "#bfe0d8", "#f7d7a8"],
  };
  W.drawBack = function (ctx, cam, view) {
    const day = NR.profile.world === "day";
    const biome = W.biome();
    const scenic = true; // every district now paints full-bleed world art
    // --- sky gradient ---
    const g = ctx.createLinearGradient(0, cam.y, 0, cam.y + view.h);
    if (day) {
      const d = DAY_SKY[biome] || DAY_SKY.city;
      g.addColorStop(0, d[0]); g.addColorStop(0.55, d[1]); g.addColorStop(1, d[2]);
    } else {
      g.addColorStop(0, NIGHT_SKY.top); g.addColorStop(0.55, NIGHT_SKY.mid); g.addColorStop(1, NIGHT_SKY.low);
    }
    ctx.fillStyle = g;
    ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);

    // --- night-only star field + moon (behind the world art) ---
    if (!day) {
      ctx.save();
      for (const s of stars) {
        const sx = cam.x + (((s.fx - cam.x * 0.0006) % 1) + 1) % 1 * view.w;
        const sy = cam.y + s.fy * view.h;
        ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(fogT * s.tw + s.ph));
        ctx.fillStyle = "#cfe2ff";
        ctx.fillRect(sx, sy, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // big low moon with halo
      const mx = cam.x + view.w * 0.76 - (cam.x * 0.04 % 60), my = cam.y + view.h * 0.18;
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "yellow", mx, my, 120, 0.3);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#efe6c8";
      ctx.beginPath(); ctx.arc(mx, my, 34, 0, U.TAU); ctx.fill();
      ctx.fillStyle = NIGHT_SKY.top;
      ctx.beginPath(); ctx.arc(mx - 13, my - 6, 29, 0, U.TAU); ctx.fill();
      ctx.restore();
    } else {
      // soft daytime sun
      const sx = cam.x + view.w * 0.2 - (cam.x * 0.03 % 60), sy = cam.y + view.h * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "yellow", sx, sy, 110, 0.4);
      ctx.fillStyle = "rgba(255,246,214,0.9)";
      ctx.beginPath(); ctx.arc(sx, sy, 26, 0, U.TAU); ctx.fill();
      ctx.restore();
    }

    // --- world art (parallax 0.18), day & night use different paintings/grades ---
    let img = null;
    const keyJpg = (biome === "wilds" || biome === "garden") ? "bg_jungle.jpg"
      : biome === "city" ? (day ? "bg_day.jpg" : "bg_far.jpg")
      : 'bg_' + biome + '.jpg';
    const keyShort = keyJpg.replace(/\.jpg$/, "");
    try {
      img = (NR.assets && NR.assets.get && (NR.assets.get(keyJpg) || NR.assets.get(keyShort))) || U.assets.get(keyJpg) || U.assets.get(keyShort);
    } catch (_) {
      img = U.assets.get(keyShort);
    }
    if (NR.adventure?.active && NR.evolution?.background) img = NR.assets.get(NR.evolution.background) || img;
    if (img) {
      const f = 0.18;
      const drawH = view.h * (day || scenic ? 1.08 : 0.9);
      const drawW = drawH * (img.width / img.height);
      const pcx = cam.x + (W.originX || 0);
      let startX = cam.x - (((pcx * f) % drawW) + drawW) % drawW - drawW;
      const baseY = day || scenic ? cam.y - view.h * 0.04 : cam.y + view.h - drawH + view.h * 0.06;
      ctx.globalAlpha = 0.85;
      for (let x0 = startX; x0 < cam.x + view.w + drawW; x0 += drawW)
        ctx.drawImage(img, x0, baseY, drawW, drawH);
      ctx.globalAlpha = 1;
      // THE NIGHTFALL GRADE: bury the world under cold indigo darkness
      if (!day && scenic) {
        ctx.fillStyle = "rgba(7,9,30,0.52)";
        ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);
        const rim = ctx.createLinearGradient(0, cam.y, 0, cam.y + view.h * 0.8);
        rim.addColorStop(0, "rgba(18,26,64,0.4)");
        rim.addColorStop(1, "rgba(4,5,16,0.1)");
        ctx.fillStyle = rim;
        ctx.fillRect(cam.x - 60, cam.y - 60, view.w + 120, view.h + 120);
      }
    }

    // atmospheric depth band (warm in the wilds, violet in the reactor)
    const haze = ctx.createLinearGradient(0, cam.y + view.h * 0.55, 0, cam.y + view.h);
    haze.addColorStop(0, "rgba(70,20,110,0)");
    haze.addColorStop(1, biome === "reactor"
      ? (day ? "rgba(255,214,150,0.22)" : "rgba(90,30,140,0.25)")
      : (day ? "rgba(214,236,170,0.25)" : "rgba(28,44,66,0.3)"));
    ctx.fillStyle = haze;
    ctx.fillRect(cam.x, cam.y + view.h * 0.55, view.w, view.h * 0.45);

    // mid-distance jungle layers (true multi-layer parallax). The reactor
    // keeps its dark skyline; every natural district stacks two painterly
    // jungle treelines that read as depth, not "pasted trees sliding".
    if (biome === "reactor") {
      if (midCity) {
        const f = 0.45, mh = 470, mw = 2048 * (mh / 520);
        const baseY = W.groundY - mh + 26;
        const pcx = cam.x + (W.originX || 0);
        let startX = cam.x - (((pcx * f) % mw) + mw) % mw - mw;
        ctx.globalAlpha = day ? 0.55 : 0.95;
        for (let x0 = startX; x0 < cam.x + view.w + mw; x0 += mw)
          ctx.drawImage(midCity, x0, baseY, mw, mh);
        ctx.globalAlpha = 1;
      }
    } else {
      jungleLayer(ctx, cam, view, "jungle_layer_far.png", 0.22, 0.52, day ? 0.75 : 0.5);
      jungleLayer(ctx, cam, view, "jungle_layer_near.png", 0.45, 0.72, day ? 1 : 0.82);
    }

    // birds drift across the wilds by day
    if (biome !== "reactor" && day) {
      ctx.save();
      ctx.strokeStyle = "rgba(28,44,38,0.75)";
      ctx.lineWidth = 2;
      for (const v of vehicles) {
        const sx = cam.x + v.fx * view.w, sy = cam.y + v.fy * view.h * 0.55 + Math.sin(fogT * 2 + v.v) * 6;
        const flap = Math.sin(fogT * 9 + v.v) * 4;
        ctx.beginPath();
        ctx.moveTo(sx - 7, sy - flap * 0.5);
        ctx.quadraticCurveTo(sx - 2, sy + flap, sx, sy);
        ctx.quadraticCurveTo(sx + 2, sy + flap, sx + 7, sy - flap * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    NR.adventure?.drawScenery(ctx, cam, view);
    drawArena(ctx, cam, view);
  };

  /* ---------- terrain textures (Kenney-style PBR tiles, CC0) ----------
     The texture library in assetlib holds four variants per surface per
     biome; the arena rotates them every SEGW px so districts feel distinct,
     and the `edge` set trims the ground line that used to go unused. */
  const SEGW = 1024;
  const texCache = Object.create(null);
  function texPattern(ctx, path) {
    if (!path) return null;
    const img = NR.assets.get(path);
    if (!img) return null;
    let e = texCache[path];
    if (!e) e = texCache[path] = { pat: null, ctx: null };
    if (e.pat && e.ctx === ctx) return e.pat;
    try {
      e.pat = ctx.createPattern(img, "repeat");
      e.ctx = ctx;
    } catch (_) { return null; }
    return e.pat;
  }
  function biomeFamily() {
    const adv = NR.adventure && NR.adventure.active;
    const ch = adv ? NR.game.chapter || 0 : 0;
    const max = Object.keys(NR.textureBiomes || {}).length - 1;
    return (NR.textureBiomes && NR.textureBiomes[Math.max(0, Math.min(max, ch % (max + 1)))]) || "city";
  }
  function biomeList(kind) {
    const t = NR.textures && NR.textures[biomeFamily() + kind];
    return t && t.length ? t : null;
  }
  function segPick(list, x) {
    if (!list) return null;
    return list[Math.abs(Math.floor(x / SEGW)) % list.length];
  }

  function drawArena(ctx, cam, view) {
    const gy = W.groundY;
    const biome = W.biome();
    const natural = biome !== "reactor";
    // ground body
    const gg = ctx.createLinearGradient(0, gy, 0, W.H + 80);
    gg.addColorStop(0, NR.profile.world === "day" ? (natural ? "#3d5a34" : "#314d53") : "#0d0f22");
    gg.addColorStop(1, "#05060f");
    ctx.fillStyle = gg;
    ctx.fillRect(cam.x - 60, gy, view.w + 120, Math.max(W.H, cam.y + view.h) - gy + 120);
    // tiled terrain texture over the ground body — rotating districts
    const day = NR.profile.world === "day";
    const grounds = biomeList("Ground");
    if (grounds) {
      ctx.save();
      ctx.globalAlpha = day ? 0.5 : 0.34;
      ctx.translate(0, gy);
      const hGround = Math.max(W.H, cam.y + view.h) - gy + 120;
      for (let sx = Math.floor((cam.x - 60) / SEGW) * SEGW; sx < cam.x + view.w + 60; sx += SEGW) {
        const gpat = texPattern(ctx, segPick(grounds, sx));
        if (!gpat) continue;
        ctx.fillStyle = gpat;
        ctx.fillRect(sx, 0, Math.min(SEGW, cam.x + view.w + 60 - sx), hGround);
      }
      ctx.restore();
    }
    // biome overlay from the Elements pack: garden moss, reactor lava veins, city energy sheen
    const family = biomeFamily();
    const reactor = family === "reactor";
    const veins = biomeList("Veins");
    if (veins) {
      ctx.save();
      if (reactor) ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = reactor ? (day ? 0.10 : 0.2) : family === "garden" ? (day ? 0.22 : 0.3) : 0.08;
      ctx.translate(0, gy + 26);
      ctx.scale(1, 0.22); // squash into shallow veins near the surface
      for (let sx = Math.floor((cam.x - 60) / SEGW) * SEGW; sx < cam.x + view.w + 60; sx += SEGW) {
        const overlayPat = texPattern(ctx, segPick(veins, sx));
        if (!overlayPat) continue;
        ctx.fillStyle = overlayPat;
        ctx.fillRect(sx, 0, Math.min(SEGW, cam.x + view.w + 60 - sx), 220);
      }
      ctx.restore();
    }
    // edge band — the surface trim texture right under the neon line
    const edges = biomeList("Edge");
    if (edges) {
      ctx.save();
      ctx.globalAlpha = day ? 0.6 : 0.5;
      ctx.translate(0, gy + 2);
      for (let sx = Math.floor((cam.x - 60) / SEGW) * SEGW; sx < cam.x + view.w + 60; sx += SEGW) {
        const epat = texPattern(ctx, segPick(edges, sx));
        if (!epat) continue;
        ctx.fillStyle = epat;
        ctx.fillRect(sx, 0, Math.min(SEGW, cam.x + view.w + 60 - sx), 24);
      }
      ctx.restore();
    }
    /* ---- realistic ground grass (natural districts) ----
       a pre-generated painterly grass strip tiles along the ground line —
       real blades, ferns and wildflowers instead of the old cartoon fringe.
       Deterministic tiling, zero per-frame allocation. */
    if (natural) {
      const gimg = NR.assets && NR.assets.get ? NR.assets.get("grass_strip.png") : null;
      if (gimg && gimg.width && gimg.height) {
        const gh = 78, gw = gh * (gimg.width / gimg.height);
        ctx.save();
        ctx.globalAlpha = NR.profile.world === "day" ? 1 : 0.62;
        for (let sx = Math.floor((cam.x - 80) / gw) * gw; sx < cam.x + view.w + gw; sx += gw)
          ctx.drawImage(gimg, sx, gy - gh + 14, gw, gh);
        ctx.restore();
      } else if (grassFringe) {
        // fallback until the art decodes — never a blank ground
        ctx.save();
        ctx.globalAlpha = NR.profile.world === "day" ? 0.95 : 0.55;
        for (let sx = Math.floor((cam.x - 60) / 256) * 256; sx < cam.x + view.w + 60; sx += 256)
          ctx.drawImage(grassFringe, sx, gy - 25);
        ctx.restore();
      }
    }
    // ground top edge: a soft sun-lit rim in nature (subtle), neon in reactor
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const edgeCol = natural ? "190,235,150" : "0,255,244";
    const edgeA = natural ? 0.28 : 0.85;
    const eg = ctx.createLinearGradient(0, gy - 8, 0, gy + 10);
    eg.addColorStop(0, `rgba(${edgeCol},0)`);
    eg.addColorStop(0.5, `rgba(${edgeCol},${edgeA})`);
    eg.addColorStop(1, `rgba(${edgeCol},0)`);
    ctx.fillStyle = eg;
    ctx.fillRect(cam.x - 60, gy - 8, view.w + 120, 18);
    ctx.restore();
    // neon grid receding (reactor only — the wilds get soil, not circuitry)
    if (!natural) {
      ctx.strokeStyle = "rgba(0,255,244,0.07)";
      ctx.lineWidth = 1;
      const gridStart = Math.floor((cam.x - 60) / 128) * 128;
      for (let gx = gridStart; gx < cam.x + view.w + 60; gx += 128) {
        ctx.beginPath(); ctx.moveTo(gx, gy + 4); ctx.lineTo(gx - 60, W.H + 60); ctx.stroke();
      }
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
      const plats = biomeList("Plat");
      const ppat = plats ? texPattern(ctx, plats[Math.abs(Math.floor(p.x / 512)) % plats.length]) : null;
      if (ppat) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        NR.util.roundRect(ctx, p.x, p.y, p.w, p.h, 6);
        ctx.clip();
        ctx.fillStyle = ppat;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.restore();
      }
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

  /* ---------- foreground: rain & lightning (city night), fireflies (garden),
     rising embers (reactor) — daytime stays clear and readable. ---------- */
  W.drawFront = function (ctx, cam, view) {
    if (NR.profile.world === "day") return;
    const biome = W.biome();
    if (biome === "city") {
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
    } else {
      // fireflies (garden night) / embers (reactor night)
      const embers = biome === "reactor";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const sx = cam.x + m.fx * view.w;
        const sy = cam.y + m.fy * view.h + Math.sin(fogT * 2 + m.ph) * 8;
        const a = embers ? 0.5 : 0.28 + 0.3 * Math.abs(Math.sin(fogT * 2.2 + m.ph));
        NR.sprites.drawGlow(ctx, embers ? "orange" : "yellow", sx, sy, m.big ? 9 : 5, a);
      }
      ctx.restore();
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
    let overPit = false;
    if (W.pits && W.pits.length) for (const pit of W.pits) if (e.x > pit.x + 6 && e.x < pit.x + pit.w - 6) { overPit = true; break; }
    if (e.y >= W.groundY && !overPit) { e.y = W.groundY; if (e.vy > 0) e.vy = 0; e.onGround = true; }
    if (!wasGround && e.onGround && e.onLand) e.onLand();
    e.x = U.clamp(e.x, 26, W.W - 26);
  };

  W.pointSolid = function (x, y) {
    if (y >= W.groundY + 2 && !(W.pits || []).some((p) => x > p.x && x < p.x + p.w)) return true;
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
