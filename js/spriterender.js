/* ============ SKYWARD — sheet-based sprite renderer for enemies & projectiles ============
   Sheets declare a measured `crop` window (tight art bounds inside each cell)
   plus a `floor` line (cell-y of the feet). Frames are sliced to the window and
   drawn with the floor pinned to the entity's ground y — no more floating,
   no more postage-stamp characters. `faceLeft` mirrors art that faces left. */
(function () {
  const S = (NR.spriteRender = {});
  const cache = Object.create(null); // "sheet|anim|frame" -> canvas

  const FPS = { idle: 8, walk: 11, run: 13, attack: 13, attack2: 13, attack3: 15, hurt: 10, death: 9 };

  function frame(sheetKey, anim, i) {
    const def = NR.sheets[sheetKey];
    if (!def) return null;
    const a = def.anims[anim];
    if (!a) return null;
    const img = NR.assets.get(a.path);
    if (!img) return null;
    const key = sheetKey + "|" + anim + "|" + i;
    if (cache[key]) return cache[key];
    // anims may override the cell geometry (Sprite Pack 7 attack sheets are wider)
    const fw = a.fw || def.fw, fh = a.fh || def.fh;
    const perRow = a.perRow || def.perRow || 0;
    const base = a.start || 0; // anims may begin mid-sheet (slime row 1 = hop)
    const sx = perRow ? ((base + i) % perRow) * fw : (base + i) * fw;
    const sy = perRow ? Math.floor((base + i) / perRow) * fh : 0;
    const c = a.crop || def.crop || { x: 0, y: 0, w: fw, h: fh };
    const cv = document.createElement("canvas");
    cv.width = c.w; cv.height = c.h;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    try { g.drawImage(img, sx + c.x, sy + c.y, c.w, c.h, 0, 0, c.w, c.h); } catch (_) {}
    // feet line within the cropped window (per-anim override allowed)
    cv._floor = (a.floor !== undefined ? a.floor : def.floor !== undefined ? def.floor : c.y + c.h) - c.y;
    cache[key] = cv;
    return cv;
  }

  S.frame = frame; // cropped frame canvas (carries _floor) — used by the hero roster

  /* pixels from the cropped window top to the feet, for legacy callers */
  S.feetOf = function (sheetKey, anim) {
    const cv = frame(sheetKey, anim || "idle", 0);
    return cv ? cv._floor : 0;
  };

  /* anim controller bound to one sheet */
  S.anim = function (sheetKey, opts) {
    const o = opts || {};
    const a = {
      sheet: sheetKey,
      anim: o.anim || "idle",
      frame: 0,
      t: 0,
      fps: o.fps || FPS[o.anim || "idle"],
      done: false,
    };
    a.count = function (name) {
      const def = NR.sheets[sheetKey];
      const an = def && def.anims[name || a.anim];
      return an ? an.frames : 1;
    };
    a.set = function (name, restart) {
      if (a.anim === name && !restart) return;
      if (!NR.sheets[sheetKey] || !NR.sheets[sheetKey].anims[name]) return; // sheet may lack the anim
      a.anim = name; a.frame = 0; a.t = 0; a.done = false;
      a.fps = o.fps || FPS[name] || 10;
    };
    a.update = function (dt) {
      const n = a.count();
      a.t += dt * a.fps;
      while (a.t >= 1) {
        a.t -= 1;
        a.frame++;
        if (a.frame >= n) { a.frame = 0; }
      }
    };
    // x = entity center, y = ground y (feet). Art rises from the floor line.
    a.draw = function (ctx, x, y, facing, opts2) {
      const def = NR.sheets[sheetKey];
      if (!def) return;
      const cv = frame(sheetKey, a.anim, a.frame);
      if (!cv) return;
      const scale = (opts2 && opts2.scale) || 1;
      const w = cv.width * scale, h = cv.height * scale;
      const floorPx = cv._floor * scale; // distance from window top to feet
      const flip = def.faceLeft ? facing > 0 : facing < 0;
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      if (opts2 && opts2.alpha !== undefined) ctx.globalAlpha = opts2.alpha;
      if (opts2 && opts2.flash) {
        ctx.drawImage(cv, -w / 2, -floorPx, w, h);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = opts2.flash;
        ctx.fillRect(-w / 2, -floorPx, w, h);
      } else {
        ctx.drawImage(cv, -w / 2, -floorPx, w, h);
      }
      ctx.restore();
    };
    return a;
  };

  /* static single-frame sprite (projectiles, icons) */
  S.slice = function (path, fw, fh, i, scale) {
    const key = "static|" + path + "|" + i;
    if (cache[key]) return cache[key];
    const img = NR.assets.get(path);
    const cv = document.createElement("canvas");
    cv.width = (fw || 32) * (scale || 1); cv.height = (fh || 32) * (scale || 1);
    if (img) {
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(img, i * (fw || 32), 0, fw || 32, fh || 32, 0, 0, cv.width, cv.height);
    }
    cache[key] = cv;
    return cv;
  };

  /* ---------------- death corpses (short-lived animated sprites) ---------------- */
  S.spawnCorpse = function (G, sheetKey, x, y, facing, scale) {
    if (!G.corpses) G.corpses = [];
    G.corpses.push({ sheet: sheetKey, x, y, facing, scale: scale || 1, t: 0, life: 0.62, frame: 0 });
  };
  S.updateCorpses = function (G, dt) {
    if (!G.corpses || !G.corpses.length) return;
    for (let i = G.corpses.length - 1; i >= 0; i--) {
      const c = G.corpses[i];
      c.t += dt;
      c.frame = Math.floor((c.t / c.life) * 4);
      if (c.t >= c.life) G.corpses.splice(i, 1);
    }
  };
  S.drawCorpses = function (ctx, G) {
    if (!G.corpses) return;
    for (const c of G.corpses) {
      const def = NR.sheets[c.sheet];
      if (!def) continue;
      const deathAnim = def.anims.death ? "death" : "idle";
      const n = def.anims[deathAnim].frames;
      const cv = frame(c.sheet, deathAnim, Math.min(n - 1, c.frame));
      if (!cv) continue;
      const w = cv.width * c.scale, h = cv.height * c.scale;
      const floorPx = cv._floor * c.scale;
      const flip = def.faceLeft ? c.facing > 0 : c.facing < 0;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - c.t / c.life);
      ctx.translate(c.x, c.y);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(cv, -w / 2, -floorPx, w, h);
      ctx.restore();
    }
  };
})();
