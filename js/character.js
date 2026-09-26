/* ============ SKYWARD — layered character renderer ============
   Composites the Clockwork Raven body-layer packs (skin, hair, ears, outfit,
   hat, mask, gloves, weapon, back, aura) into pre-rendered animation frames.
   Grid: 10 cols x 7 rows of 80x64 cells.
   Rows: 0 idle(5) 1 walk(8) 2 run(8) 3 jump(4) 4 fall(4) 5 attack(6) 6 hurt(10) */
(function () {
  const CW = 80, CH = 64, COLS = 10, ROWS = 7;
  const FRAMES = [5, 8, 8, 4, 4, 6, 10];
  const ANIMS = ["idle", "walk", "run", "jump", "fall", "attack", "hurt"];
  const SCALE = 2; // pre-render at 2x for crisp in-game drawing

  // paint order (back -> front)
  const ORDER = ["back", "monster", "skin", "ears", "bottom", "underwear", "top", "shoes", "gloves", "hair", "hat", "mask", "weapon", "aura"];

  const cache = Object.create(null);
  const CH_ = (NR.char = {});

  CH_.CW = CW; CH_.CH = CH; CH_.FRAMES = FRAMES; CH_.ANIMS = ANIMS;

  function hash(a) {
    return ORDER.map((k) => a[k] || "-").join("|");
  }

  function layerDraw(appearance, key, row, frame) {
    const id = appearance[key];
    if (!id) return null;
    const opt = (NR.catalog[key] || []).find((o) => o.id === id);
    if (!opt) return null;
    const img = NR.assets.get(opt.path);
    if (!img) return null;
    return { img, sx: frame * CW, sy: row * CH };
  }

  /* Build (and cache) every animation frame for an appearance. */
  CH_.build = function (appearance) {
    const key = hash(appearance);
    if (cache[key]) return cache[key];
    const built = { anims: Object.create(null), ready: true };
    for (let r = 0; r < ROWS; r++) {
      const anim = ANIMS[r];
      const n = FRAMES[r];
      const frames = [];
      for (let f = 0; f < n; f++) {
        const cv = document.createElement("canvas");
        cv.width = CW * SCALE; cv.height = CH * SCALE;
        const g = cv.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.scale(SCALE, SCALE);
        for (const layer of ORDER) {
          const l = layerDraw(appearance, layer, r, f);
          if (!l) continue;
          try { g.drawImage(l.img, l.sx, l.sy, CW, CH, 0, 0, CW, CH); } catch (_) {}
        }
        frames.push(cv);
      }
      built.anims[anim] = frames;
    }
    cache[key] = built;
    return built;
  };

  CH_.has = function (appearance) {
    return !!cache[hash(appearance)];
  };

  /* Draw one frame. (x,y) is the character's feet, centered. */
  CH_.drawFrame = function (ctx, built, anim, frame, x, y, facing, opts) {
    const frames = built.anims[anim];
    if (!frames || !frames.length) return;
    const cv = frames[Math.max(0, Math.min(frames.length - 1, frame | 0))];
    const s = (opts && opts.scale) || 1;
    const w = CW * SCALE * s, h = CH * SCALE * s;
    ctx.save();
    ctx.translate(x, y);
    if (facing < 0) ctx.scale(-1, 1);
    if (opts && opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts && opts.tint) {
      ctx.drawImage(cv, -w / 2, -h, w, h);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = opts.tint;
      ctx.fillRect(-w / 2, -h, w, h);
    } else {
      ctx.drawImage(cv, -w / 2, -h, w, h);
    }
    ctx.restore();
  };

  /* ---------------- animation controller ---------------- */
  CH_.actor = function (appearance, opts) {
    const a = {
      appearance,
      built: null,
      anim: "idle",
      frame: 0,
      t: 0,
      rate: (opts && opts.rate) || 1,
      facing: 1,
      lockT: 0,
      onEnd: null,
    };
    a.ensure = function () {
      if (!a.built) a.built = CH_.build(a.appearance);
      return a.built;
    };
    a.play = function (anim, once, rate) {
      if (a.anim === anim && !once) return;
      a.anim = anim; a.frame = 0; a.t = 0;
      if (rate !== undefined) a.rate = rate;
      if (once) a.lockT = 0.4;
      a.ensure();
    };
    a.update = function (dt) {
      a.ensure();
      const frames = a.built.anims[a.anim] || a.built.anims.idle;
      const fps = a.anim === "attack" ? 14 : a.anim === "hurt" ? 12 : a.anim === "walk" ? 10 : a.anim === "run" ? 14 : 6;
      a.t += dt * fps * a.rate;
      if (a.t >= 1) { a.t -= Math.floor(a.t); a.frame = (a.frame + 1) % frames.length; }
      if (a.lockT > 0) {
        a.lockT -= dt;
        if (a.lockT <= 0 && a.onEnd) { const fn = a.onEnd; a.onEnd = null; fn(); }
      }
    };
    a.draw = function (ctx, x, y, opts) {
      a.ensure();
      CH_.drawFrame(ctx, a.built, a.anim, a.frame, x, y, a.facing, opts);
    };
    a.ensure();
    return a;
  };

  /* ---------------- pets ---------------- */
  const petCache = Object.create(null);
  CH_.petFrames = function (petId) {
    if (petCache[petId]) return petCache[petId];
    const opt = (NR.catalog.pet || []).find((o) => o.id === petId);
    if (!opt) return null;
    const n = NR.petFrames[petId] || 6;
    const img = NR.assets.get(opt.path);
    const out = [];
    for (let i = 0; i < n; i++) {
      const cv = document.createElement("canvas");
      if (img) {
        const fw = img.width / n;
        cv.width = fw; cv.height = img.height;
        cv.getContext("2d").drawImage(img, i * fw, 0, fw, img.height, 0, 0, fw, img.height);
      } else {
        cv.width = 32; cv.height = 32; // placeholder keeps callers safe if art is missing
      }
      out.push(cv);
    }
    petCache[petId] = out;
    return out;
  };
  CH_.drawPet = function (ctx, petId, frame, x, y, scale, flip) {
    const frames = CH_.petFrames(petId);
    if (!frames) return;
    const cv = frames[Math.abs(frame | 0) % frames.length];
    const s = scale || 1;
    const w = cv.width * s, h = cv.height * s;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(cv, -w / 2, -h, w, h);
    ctx.restore();
  };

  /* ---------------- icon thumbnails for the creator / shop ---------------- */
  const thumbCache = Object.create(null);
  CH_.thumb = function (cat, id, size) {
    const k = cat + id + size;
    if (thumbCache[k]) return thumbCache[k];
    const opt = (NR.catalog[cat] || []).find((o) => o.id === id);
    const cv = document.createElement("canvas");
    cv.width = cv.height = size || 64;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const img = opt && NR.assets.get(opt.path);
    if (img) {
      if (cat === "pet") {
        // pet sheets are horizontal frame strips: show the first frame, centred
        const n = NR.petFrames[id] || 6;
        const fw = img.width / n;
        const s = (size || 64) / Math.max(fw, img.height);
        const w = fw * s, h = img.height * s;
        g.drawImage(img, 0, 0, fw, img.height, ((size || 64) - w) / 2, ((size || 64) - h) / 2, w, h);
      } else {
        g.drawImage(img, 0, 0, CW, CH, 0, 0, size || 64, size || 64);
      }
      thumbCache[k] = cv; // only cache once the art is actually available
    }
    return cv;
  };
  CH_.missing = function (cat, id) {
    const opt = (NR.catalog[cat] || []).find((o) => o.id === id);
    return !!(opt && !NR.assets.get(opt.path));
  };

  /* composite a small portrait of the full appearance (idle frame 0) */
  CH_.portrait = function (appearance, size) {
    const built = CH_.build(appearance);
    const cv = document.createElement("canvas");
    cv.width = cv.height = size || 96;
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const frame = built.anims.idle[0];
    const s = (size || 96) / (CH * SCALE);
    const w = CW * SCALE * s, h = CH * SCALE * s;
    g.drawImage(frame, ((size || 96) - w) / 2, (size || 96) - h, w, h);
    return cv;
  };
})();
