/* ============ Asset bosses — no more procedural robot ============
   Every boss is now a real character from the bundled art packs:
     AZRAKEL (Gothicvania demon lord), IGNIS (hell beast), GROMM (ogre warlord),
     VERMILION (grotto dragon), NOCTIS (nightmare steed) — plus the existing
     sheet bosses ARCH-WARLOCK VEXIS (EVil Wizard 2), GORO (orc) and KUROGANE
     (samurai). They share SHOGUN-9's proven fight script (phases, barrage,
     slam, charge, stun window); only the body, name and projectile colour
     change. The old SHOGUN-9 "mech" body stays registered for old saves/tests
     but is no longer used by any world, level or survival wave. */
(function () {
  const C = NR.superContent, U = NR.util, F = NR.fx;
  const SKINS = NR.bossSkins;

  const actor = (name, clip) => C.actors.find((a) => a.name === name && (!clip || a.clips.some((c) => c.name === clip)));
  const clipOf = (a, name) => a && a.clips.find((c) => c.name === name);

  /* clip names come from the compiled super-content catalog */
  const ACTOR_BOSSES = {
    demon: {
      name: "AZRAKEL, THE DEMON LORD", actor: ["Demon", "demonattack"], height: 250, faceLeft: true, hover: 26,
      w: 150, h: 215, col: "#63e6ff", bolt: "cyan",
      clips: { idle: "idle", walk: "idle", tele: "demonattack", attack: "demonattack", barrage: "demonattackbreath", hurt: "idle" },
      // the attack sheets are 312x220 cells with the body shifted (+56,+44) from the 256x176 idle cells
      offset: { demonattack: [56, 44], demonattackbreath: [56, 44] },
    },
    hellbeast: {
      name: "IGNIS, THE HELL BEAST", actor: ["Hell Beast", "burn"], height: 205, faceLeft: false,
      w: 110, h: 200, col: "#ff6a3d", bolt: "orange",
      clips: { idle: "idle", walk: "idle", tele: "breath", attack: "burn", barrage: "breath", hurt: "idle" },
    },
    ogre: {
      name: "GROMM, THE OGRE WARLORD", actor: ["Ogre", "walk"], height: 200, faceLeft: true,
      w: 130, h: 190, col: "#c7d36a", bolt: "yellow",
      clips: { idle: "idle", walk: "walk", tele: "attack", attack: "attack", barrage: "attack", hurt: "idle-unarmed" },
    },
    dragon: {
      name: "VERMILION, THE GROTTO DRAGON", actor: ["Grotto Escape 2 Boss Dragon", "breath"], height: 165, faceLeft: true,
      w: 190, h: 150, col: "#ff4d3a", bolt: "red",
      clips: { idle: "idle", walk: "idle", tele: "tail", attack: "tail", barrage: "breath", hurt: "idle" },
    },
    nightmare: {
      name: "NOCTIS, THE NIGHTMARE STEED", actor: ["Nightmare", "run"], height: 185, faceLeft: true,
      w: 170, h: 170, col: "#56c8ff", bolt: "blue",
      clips: { idle: "idle", walk: "run", tele: "idle", attack: "run", barrage: "idle", hurt: "idle" },
    },
  };
  for (const [key, def] of Object.entries(ACTOR_BOSSES)) {
    const a = actor(def.actor[0], def.actor[1]);
    if (!a) continue; // pack missing: that boss simply isn't registered
    SKINS[key] = { sheet: null, w: def.w, h: def.h, name: def.name, col: def.col, actorDef: def, actorRef: a };
  }
  // sheet bosses keep their bodies but get proper titles
  if (SKINS.brute) SKINS.brute.name = "GORO THE BREAKER";
  if (SKINS.ronin) SKINS.ronin.name = "KUROGANE THE RIVAL";
  if (SKINS.warlock) SKINS.warlock.name = "ARCH-WARLOCK VEXIS";

  /* rotation used by every world level and every survival boss wave */
  const B = (NR.bosses = {});
  B.POOL = ["ronin", "ogre", "demon", "warlock", "brute", "hellbeast", "dragon", "nightmare"].filter((k) => SKINS[k]);
  B.nameOf = (skin) => (SKINS[skin] && SKINS[skin].name) || "BOSS";
  B.WORLD_BOSS_EVERY = 8;
  B.isWorldBossLevel = (level) => level % B.WORLD_BOSS_EVERY === 0;
  B.forLevel = function (chapter, level) {
    const ch = NR.adventure.chapters[chapter];
    if (level <= 1 && ch && SKINS[ch.boss]) return ch.boss; // each world opens with its own champion
    return B.POOL[(chapter * 3 + level - 1) % B.POOL.length];
  };
  B.forWave = (wave) => B.POOL[(Math.max(1, Math.floor(wave / 5)) - 1) % B.POOL.length];

  /* worlds: authored champions, all from the art packs */
  const authored = [
    ["ronin", "KUROGANE THE RIVAL"],
    ["ogre", "GROMM, THE OGRE WARLORD"],
    ["demon", "AZRAKEL, THE DEMON LORD"],
    ["warlock", "ARCH-WARLOCK VEXIS"],
    ["brute", "GORO THE BREAKER"],
    ["hellbeast", "IGNIS, THE HELL BEAST"],
  ];
  NR.adventure.chapters.forEach((ch, i) => {
    const [skin, name] = authored[i % authored.length];
    if (!SKINS[skin]) return;
    ch.boss = skin; ch.bossName = name;
    ch.description = ch.description.replace(/SHOGUN-9 PRIME/g, name).replace(/SHOGUN-9/g, name.split(",")[0]);
  });
  NR.adventure.bossSkin = function () {
    const G = NR.game, lvl = (NR.evolution && NR.evolution.levels[G.chapter]) || 1;
    return B.forLevel(G.chapter || 0, lvl);
  };

  /* ---------------- rendering ---------------- */
  const Boss = NR.Boss, P = Boss.prototype;
  function refOf(def, a) {
    if (!def._ref) {
      const idle = clipOf(a, def.clips.idle) || a.clips[0];
      const [l, t, r, b] = idle.bounds;
      def._ref = { cx: (l + r) / 2, bottom: b, scale: def.height / Math.max(1, b - t), cellW: idle.frames[0].rect[2] };
    }
    return def._ref;
  }
  function pickClip(boss, def, a) {
    const s = boss.state;
    const key =
      s === "barrage" ? "barrage" :
      s === "slamTel" || s === "chargeTel" ? "tele" :
      s === "charging" || s === "slamAir" ? "attack" :
      s === "stunned" || boss.stunned > 0 ? "hurt" :
      Math.abs(boss.vx) > 40 ? "walk" : "idle";
    const once = key === "barrage" || key === "tele" || key === "attack";
    return { clip: clipOf(a, def.clips[key]) || clipOf(a, def.clips.idle) || a.clips[0], once, key };
  }
  function frameImage(f) {
    const img = NR.assets.get(f.path);
    if (img) return { img, rect: f.rect };
    for (const alt of f.alternates || []) { const im = NR.assets.get(alt.path); if (im) return { img: im, rect: alt.rect }; }
    NR.assets.preload([f.path]);
    return null;
  }
  B.drawActor = function (ctx, boss, def, a, x, y, facing, opts) {
    const ref = refOf(def, a);
    const { clip, once } = pickClip(boss, def, a);
    const n = clip.frames.length, fps = clip.fps || 10;
    const time = once ? boss.st : boss.t;
    const idx = once ? Math.min(n - 1, Math.floor(time * fps * 1.2)) : Math.floor(time * fps) % n;
    const fr = frameImage(clip.frames[idx]) || frameImage(clip.frames[0]);
    if (!fr) return false;
    const [sx, sy, fw, fh] = fr.rect;
    const off = (def.offset && def.offset[clip.name]) || [0, 0];
    const sameCell = clip.frames[0].rect[2] === ref.cellW;
    const cx = (sameCell || def.offset ? ref.cx : (clip.bounds[0] + clip.bounds[2]) / 2) + off[0];
    const bottom = ref.bottom + off[1];
    const s = ref.scale * ((opts && opts.scale) || 1);
    const flip = def.faceLeft ? facing > 0 : facing < 0;
    ctx.save();
    ctx.translate(x, y - (def.hover || 0) - Math.sin(boss.t * 2) * (def.hover ? 6 : 0));
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (opts && opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    ctx.drawImage(fr.img, sx, sy, fw, fh, -cx * s, -bottom * s, fw * s, fh * s);
    if (opts && opts.flash) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha *= 0.55;
      ctx.drawImage(fr.img, sx, sy, fw, fh, -cx * s, -bottom * s, fw * s, fh * s);
    }
    ctx.restore();
    return true;
  };
  B.preload = function (skin) {
    const S = SKINS[skin];
    if (!S || !S.actorRef) return;
    NR.superRuntime?.preloadActor(S.actorRef);
  };

  const baseDraw = P.draw;
  P.draw = function (ctx) {
    const S = SKINS[this.skin];
    if (!S || !S.actorDef) return baseDraw.call(this, ctx);
    const def = S.actorDef;
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, this.w * 0.5, 13, 0, 0, U.TAU); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    NR.sprites.drawGlow(ctx, this.phase === 2 ? "red" : def.bolt || "purple", this.x, this.y - this.h * 0.5,
      this.h * (0.6 + Math.sin(this.t * 5) * 0.05), this.phase === 2 ? 0.34 : 0.2);
    ctx.restore();
    const dying = this.state === "dying" ? Math.max(0.2, 1 - this.st / 1.5) : 1;
    const drawn = B.drawActor(ctx, this, def, S.actorRef, this.x, this.y, this.facing, { alpha: dying, flash: this.flash > 0 });
    if (!drawn) { // art still streaming: a dark silhouette instead of nothing
      ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = "#1a1030";
      ctx.beginPath(); ctx.ellipse(this.x, this.y - this.h / 2, this.w / 2, this.h / 2, 0, 0, U.TAU); ctx.fill(); ctx.restore();
    }
    if (this.state === "chargeTel") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + Math.sin(this.t * 24) * 0.2; ctx.strokeStyle = "#ff2d5f"; ctx.lineWidth = 4; ctx.setLineDash([16, 12]);
      ctx.beginPath(); ctx.moveTo(this.x, this.y - 60); ctx.lineTo(this.x + this.facing * 1400, this.y - 60); ctx.stroke(); ctx.restore();
    }
    if (this.state === "barrage") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, def.bolt || "purple", this.muzzle(), this.muzzleY(), 28 + Math.sin(this.t * 30) * 8, 0.9);
      ctx.restore();
    }
    this.drawSpawnFx(ctx);
  };
  // muzzle follows the art: the mouth/hands of a 250px demon are not at 108px
  const baseMuzzle = P.muzzle, baseMuzzleY = P.muzzleY;
  P.muzzle = function () { const S = SKINS[this.skin]; return S && S.actorDef ? this.x + this.facing * this.w * 0.45 : baseMuzzle.call(this); };
  P.muzzleY = function () { const S = SKINS[this.skin]; return S && S.actorDef ? this.y - this.h * 0.62 - (S.actorDef.hover || 0) : baseMuzzleY.call(this); };

  /* constructor wrapper: art preload + world-boss scaling */
  class AssetBoss extends Boss {
    constructor(x, y, mul, bossNum, skin, hpScale) {
      if (!SKINS[skin] || skin === "mech") skin = B.POOL[(bossNum - 1) % B.POOL.length] || skin;
      super(x, y, mul, bossNum, skin, hpScale);
      this.bossName = B.nameOf(this.skin);
      B.preload(this.skin);
    }
  }
  NR.Boss = AssetBoss;
})();
