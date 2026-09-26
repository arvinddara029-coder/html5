/* ============ SKYWARD — sheet-based sprite renderer for enemies & projectiles ============ */
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
    const cv = document.createElement("canvas");
    cv.width = def.fw; cv.height = def.fh;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    try { g.drawImage(img, i * def.fw, 0, def.fw, def.fh, 0, 0, def.fw, def.fh); } catch (_) {}
    cache[key] = cv;
    return cv;
  }

  /* pixels from the bottom of a cell to the feet (keeps sprites grounded) */
  const FEET = { orc: 14, soldier: 12, samurai: 10, slime: 8 };

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
      a.anim = name; a.frame = 0; a.t = 0; a.done = false;
      a.fps = o.fps || FPS[name] || 10;
    };
    a.update = function (dt) {
      const n = a.count();
      a.t += dt * a.fps;
      while (a.t >= 1) {
        a.t -= 1;
        a.frame++;
        if (a.frame >= n) { a.frame = n - 1; a.done = true; }
      }
    };
    a.draw = function (ctx, x, y, facing, opts2) {
      const def = NR.sheets[sheetKey];
      if (!def) return;
      const cv = frame(sheetKey, a.anim, a.frame);
      if (!cv) return;
      const scale = (opts2 && opts2.scale) || 1;
      const inset = ((opts2 && opts2.inset !== undefined) ? opts2.inset : FEET[sheetKey] || 0) * scale;
      const w = def.fw * scale, h = def.fh * scale;
      ctx.save();
      ctx.translate(x, y - inset);
      if (facing < 0) ctx.scale(-1, 1);
      if (opts2 && opts2.alpha !== undefined) ctx.globalAlpha = opts2.alpha;
      if (opts2 && opts2.flash) {
        ctx.drawImage(cv, -w / 2, -h, w, h);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = opts2.flash;
        ctx.fillRect(-w / 2, -h, w, h);
      } else {
        ctx.drawImage(cv, -w / 2, -h, w, h);
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
      const cv = frame(c.sheet, "death", Math.min(3, c.frame));
      if (!cv) continue;
      const def = NR.sheets[c.sheet];
      const w = def.fw * c.scale, h = def.fh * c.scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - c.t / c.life);
      ctx.translate(c.x, c.y - (FEET[c.sheet] || 0) * c.scale);
      if (c.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(cv, -w / 2, -h, w, h);
      ctx.restore();
    }
  };
})();
