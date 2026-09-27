/* ============ HEROES — a real roster, not palette swaps ============
   Each hero is a different character body from the bundled art packs with its
   own animation set, combat stats and trait:
     · KAITO (the Hero Forge body — keeps every skin/hat/weapon layer)
     · RYU (FREE Samurai), SGT. BRANN (Tiny RPG soldier)
     · HOLLY, GORDON, DIEGO (Sprite Pack 7 mercenaries)
     · ELARA, SIR MORDRED (Gothicvania), ASH (High Forest), VEGA & NIX (Warped)
   The chosen hero replaces the body drawn in-game, in the lobby stage and in
   the heroes screen; stats stack on top of the chosen operator class. */
(function () {
  const E = NR.evolution, C = NR.superContent, SR = NR.spriteRender;
  const KEY = "nr_hero_v1";
  const H = (NR.heroes = {});

  /* body: {kind:'forge'} | {kind:'sheet', sheet, scale, anims} | {kind:'actor', actor:[name, clip], height, faceLeft, clips} */
  H.ROSTER = [
    { id: "kaito", name: "KAITO", title: "THE FORGED BLADE", color: "#8af5e1", body: { kind: "forge" },
      stats: { hp: 1, speed: 1, dmg: 1, armor: 1 }, trait: "Fully customisable in the Hero Forge — every skin, hat, weapon and aura.",
      lore: "The neon ronin of the transit line. Build his look piece by piece." },
    { id: "ryu", name: "RYU", title: "THE LAST RONIN", color: "#ff6b6b",
      body: { kind: "sheet", sheet: "samurai", scale: 2.55, invert: true, anims: { idle: "idle", walk: "walk", run: "walk", jump: "walk", fall: "walk", attack: ["attack"], hurt: "hurt" } },
      stats: { hp: 0.95, speed: 1.06, dmg: 1.18, armor: 1, crit: 0.1, sukuna: 0.8 }, trait: "Iaido — +10% crit chance, Sukuna Slice recharges 20% faster.",
      lore: "A wandering swordsman who never lost a duel he chose." },
    { id: "brann", name: "SGT. BRANN", title: "THE IRON SOLDIER", color: "#9fc3ff",
      body: { kind: "sheet", sheet: "soldier", scale: 3.6, invert: true, anims: { idle: "idle", walk: "walk", run: "walk", jump: "idle", fall: "idle", attack: ["attack", "attack2", "attack3"], hurt: "hurt" } },
      stats: { hp: 1.3, speed: 0.94, dmg: 1.02, armor: 0.82 }, trait: "Shield wall — +30% health and takes 18% less damage.",
      lore: "Held the east gate alone for three nights." },
    { id: "holly", name: "HOLLY", title: "THE HAMMERHEART", color: "#6fe8b0",
      body: { kind: "sheet", sheet: "holly", scale: 3.1, anims: { idle: "idle", walk: "walk", run: "walk", jump: "jump", fall: "fall", attack: ["smash"], airAttack: "aerial", hurt: "hurt" } },
      stats: { hp: 1.1, speed: 0.95, dmg: 1.28, armor: 0.95 }, trait: "Ground smash — +28% damage per hit, the heaviest swings in the roster.",
      lore: "Carries a hammer bigger than she is and swings it like a feather." },
    { id: "gordon", name: "GORDON", title: "THE STORMBLADE", color: "#ffd166",
      body: { kind: "sheet", sheet: "gordon", scale: 2.15, anims: { idle: "idle", walk: "walk", run: "walk", jump: "jump", fall: "fall", attack: ["downswing", "upswing", "stab"], airAttack: "aer", hurt: "hurt" } },
      stats: { hp: 1.05, speed: 1, dmg: 1.1, armor: 1, dashes: 1 }, trait: "Three-part combo — up-swing, down-swing, run stab. +1 dash charge.",
      lore: "A mercenary swordsman who fights in perfect three-count rhythm." },
    { id: "diego", name: "DIEGO", title: "\u201CDEADEYE\u201D", color: "#ff9f5a",
      body: { kind: "sheet", sheet: "diego", scale: 2.3, anims: { idle: "idle", walk: "walk", run: "walk", jump: "jump", fall: "jump", attack: ["shoot"], airAttack: "jshoot", runAttack: "rshoot", hurt: "hurt" } },
      stats: { hp: 0.9, speed: 1.1, dmg: 1.05, armor: 1, energy: 1.35 }, trait: "Quickdraw — builds special energy 35% faster.",
      lore: "Never misses, never explains." },
    { id: "elara", name: "ELARA", title: "OF THE BRIDGE", color: "#ff7ad9",
      body: { kind: "actor", actor: ["Bridge Heroine", "heroine base  idle"], height: 94,
        clips: { idle: "heroine base  idle", walk: "heroine base  run", run: "heroine base  run", jump: "heroine base  jump", fall: "heroine base  jump", attack: "heroine base  player-attack", hurt: "heroine base  idle" } },
      stats: { hp: 0.85, speed: 1.2, dmg: 1.04, armor: 1, jumps: 1 }, trait: "Skyborne — +20% speed and a triple jump.",
      lore: "Guardian of the old bridge, fastest blade in Gothicvania." },
    { id: "mordred", name: "SIR MORDRED", title: "THE TERRIBLE KNIGHT", color: "#b0b8ff",
      body: { kind: "actor", actor: ["Terrible Knight", "swordslash"], height: 100, faceLeft: true,
        clips: { idle: "idle", walk: "run", run: "run", jump: "jump", fall: "jump", attack: ["swordslash", "attackside", "attackup"], airAttack: "airswordslash", hurt: "hurt" } },
      stats: { hp: 1.45, speed: 0.88, dmg: 1.12, armor: 0.8 }, trait: "Black plate — +45% health, 20% damage reduction, slow on his feet.",
      lore: "Cursed armour that walks on its own. Nobody knows who is inside." },
    { id: "ash", name: "ASH", title: "OF THE HIGH FOREST", color: "#9be86b",
      body: { kind: "actor", actor: ["Character", "attack-01"], height: 92,
        clips: { idle: "idle", walk: "run", run: "run", jump: "jump-start", fall: "jump-end", attack: "attack-01", hurt: "idle" } },
      stats: { hp: 1, speed: 1.1, dmg: 1.06, armor: 1, lifesteal: 0.05 }, trait: "Forest blood — heals 5% of damage dealt.",
      lore: "Raised by the old trees; the forest still answers her." },
    { id: "vega", name: "VEGA", title: "SPACE MARINE", color: "#6ad1ff",
      body: { kind: "actor", actor: ["Space Marine Lite", "shoot"], height: 92,
        clips: { idle: "idle gun", walk: "run with gun", run: "run with gun", jump: "jump with gun", fall: "jump with gun", attack: "shoot", hurt: "idle" } },
      stats: { hp: 1.15, speed: 1, dmg: 1.05, armor: 0.92, energy: 1.2 }, trait: "Power armour — 8% damage reduction, +20% energy gain.",
      lore: "Dropped into the wrong war. Decided to win it anyway." },
    { id: "nix", name: "NIX", title: "CYBER DETECTIVE", color: "#c49bff",
      body: { kind: "actor", actor: ["Cyberpunk Detective", "punch"], height: 90,
        clips: { idle: "walk", idleStill: true, walk: "walk", run: "gun-walk", jump: "crouch", fall: "walk", attack: "punch", hurt: "walk" } },
      stats: { hp: 0.9, speed: 1.15, dmg: 1.08, armor: 1, crit: 0.12 }, trait: "Case closed — +12% crit chance and +15% speed.",
      lore: "Solves cases with a trench coat and very fast fists." },
  ];
  // drop any actor hero whose pack isn't present
  const findActor = (name, clip) => C && C.actors.find((a) => a.name === name && a.clips.some((c) => c.name === clip));
  H.ROSTER = H.ROSTER.filter((h) => {
    if (h.body.kind === "sheet") return !!NR.sheets[h.body.sheet];
    if (h.body.kind === "actor") return !!(h.body.ref = findActor(h.body.actor[0], h.body.actor[1]));
    return true;
  });
  H.byId = (id) => H.ROSTER.find((h) => h.id === id);

  let sel = "kaito";
  try { const s = JSON.parse(NR.store.getItem(KEY)); if (s && H.byId(s.id)) sel = s.id; } catch (_) {}
  H.current = () => H.byId(sel) || H.ROSTER[0];
  H.select = function (id) {
    const h = H.byId(id);
    if (!h) return false;
    sel = id;
    try { NR.store.setItem(KEY, JSON.stringify({ id })); } catch (_) {}
    // the old SUPER ROSTER actor slot is superseded by the roster body
    if (E.hero) { E.hero = ""; E.save(); }
    H.preload(h);
    const tag = document.querySelector ? document.querySelector("#hero-tags .hero-tag") : null;
    if (tag) tag.textContent = h.name;
    return true;
  };
  H.preload = function (h) {
    if (!h) return;
    if (h.body.kind === "sheet") NR.assets.preload(Object.values(NR.sheets[h.body.sheet].anims).map((a) => a.path));
    if (h.body.kind === "actor") NR.superRuntime?.preloadActor(h.body.ref);
  };

  /* ---------------- stats ---------------- */
  const apply = E.apply;
  E.apply = function (p) {
    apply(p);
    const s = H.current().stats;
    p.heroId = H.current().id;
    p.maxHp = Math.round(p.maxHp * (s.hp || 1)); p.hp = p.maxHp; p.ghostHp = p.maxHp;
    p.speedMul *= s.speed || 1;
    p.dmgMul *= s.dmg || 1;
    p.damageTakenMul *= s.armor || 1;
    if (s.jumps) p.jumpMax += s.jumps;
    if (s.dashes) { p.dashMax += s.dashes; p.dashCharges = p.dashMax; }
    if (s.energy) p.energyMul *= s.energy;
    if (s.crit) p.critCh = Math.min(0.85, p.critCh + s.crit);
    if (s.lifesteal) p.lifesteal = Math.min(0.5, p.lifesteal + s.lifesteal);
  };

  /* ---------------- rendering ---------------- */
  const ATTACK_TIME = 0.34;
  function sheetAnim(h, P) {
    const A = h.body.anims;
    if (P.dead || P.hurt) return { name: A.hurt || "idle", loop: false };
    if (P.attacking || P.anim === "attack") {
      if (P.air && A.airAttack) return { name: A.airAttack, prog: P.atkP || 0 };
      if ((P.runAmt || 0) > 0.5 && A.runAttack) return { name: A.runAttack, prog: P.atkP || 0 };
      const list = A.attack, idx = Math.max(0, P.attackIdx || 0);
      return { name: list[idx % list.length], prog: P.atkP || 0 };
    }
    const n = P.anim || "idle";
    return { name: A[n] || A.idle, loop: true };
  }
  function drawSheet(ctx, h, P, O) {
    const def = NR.sheets[h.body.sheet];
    const a = sheetAnim(h, P);
    const an = def.anims[a.name] || def.anims.idle;
    if (!an) return false;
    const fps = a.name === "walk" ? 10 + (P.runAmt || 0) * 7 : 8;
    const i = a.prog !== undefined ? Math.min(an.frames - 1, Math.floor(a.prog * an.frames)) : a.loop ? Math.floor((P.t || 0) * fps) % an.frames : 0;
    const cv = SR.frame(h.body.sheet, def.anims[a.name] ? a.name : "idle", i);
    if (!cv) { NR.assets.preload([an.path]); return false; }
    const s = h.body.scale * ((O && O.scale) || 1);
    const w = cv.width * s, hh = cv.height * s, floor = cv._floor * s;
    // enemy sheets are authored for the enemy code path; `invert` corrects them for a hero
    const flip = (def.faceLeft ? P.facing > 0 : P.facing < 0) !== !!h.body.invert;
    ctx.save();
    ctx.translate(P.x, P.y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (O && O.ghost) ctx.globalAlpha *= 0.45;
    ctx.drawImage(cv, -w / 2, -floor, w, hh);
    if (P.hurt && !O?.ghost) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha *= 0.5; ctx.drawImage(cv, -w / 2, -floor, w, hh); }
    ctx.restore();
    return true;
  }
  const clip = (a, name) => a.clips.find((c) => c.name === name);
  function drawActor(ctx, h, P, O) {
    const b = h.body, a = b.ref;
    const ref = b._ref || (b._ref = (() => {
      const idle = clip(a, b.clips.idle) || a.clips[0];
      const [l, t, r, bt] = idle.bounds;
      return { cx: (l + r) / 2, bottom: bt, scale: b.height / Math.max(1, bt - t), cellW: idle.frames[0].rect[2], cellH: idle.frames[0].rect[3] };
    })());
    let name, prog, loop = true;
    if (P.dead || P.hurt) name = b.clips.hurt;
    else if (P.attacking || P.anim === "attack") {
      const list = Array.isArray(b.clips.attack) ? b.clips.attack : [b.clips.attack];
      name = P.air && b.clips.airAttack ? b.clips.airAttack : list[Math.max(0, P.attackIdx || 0) % list.length];
      prog = P.atkP || 0; loop = false;
    } else name = b.clips[P.anim || "idle"] || b.clips.idle;
    const c = clip(a, name) || clip(a, b.clips.idle) || a.clips[0];
    const n = c.frames.length;
    const still = b.clips.idleStill && (P.anim || "idle") === "idle" && loop;
    const idx = prog !== undefined ? Math.min(n - 1, Math.floor(prog * n)) : still ? 0 : Math.floor((P.t || 0) * (c.fps || 10) * (P.anim === "run" ? 1.3 : 1)) % n;
    const f = c.frames[idx];
    let img = NR.assets.get(f.path), rect = f.rect;
    if (!img) for (const alt of f.alternates || []) { const im = NR.assets.get(alt.path); if (im) { img = im; rect = alt.rect; break; } }
    if (!img) { NR.superRuntime?.preloadClip(c); return false; }
    const [sx, sy, fw, fh] = rect;
    // same cell size as idle → pin to the idle body; otherwise centre the clip's own art
    const same = fw === ref.cellW && fh === ref.cellH;
    const cx = same ? ref.cx : (c.bounds[0] + c.bounds[2]) / 2, bottom = same ? ref.bottom : c.bounds[3];
    const s = ref.scale * ((O && O.scale) || 1);
    const flip = b.faceLeft ? P.facing > 0 : P.facing < 0;
    ctx.save();
    ctx.translate(P.x, P.y);
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    if (O && O.ghost) ctx.globalAlpha *= 0.45;
    ctx.drawImage(img, sx, sy, fw, fh, -cx * s, -bottom * s, fw * s, fh * s);
    if (P.hurt && !O?.ghost) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha *= 0.5; ctx.drawImage(img, sx, sy, fw, fh, -cx * s, -bottom * s, fw * s, fh * s); }
    ctx.restore();
    return true;
  }
  /* draw hero `h` for pose P; false = not drawn (forge body or art streaming) */
  H.draw = function (ctx, h, P, O) {
    if (!h || h.body.kind === "forge") return false;
    try { return h.body.kind === "sheet" ? drawSheet(ctx, h, P, O) : drawActor(ctx, h, P, O); } catch (_) { return false; }
  };

  // in-game: the roster body wins over the forge layers (and the old actor slot)
  if (NR.superRuntime) {
    const legacy = NR.superRuntime.hero;
    NR.superRuntime.hero = function (ctx, pose, options) {
      const h = H.current();
      if (h.body.kind !== "forge") {
        if (H.draw(ctx, h, pose, options || {})) return true;
        return true; // art still streaming: skip one frame instead of flashing the forge body
      }
      return legacy(ctx, pose, options || {});
    };
  }
  H.preload(H.current());

  /* lobby hero stage hook (lobby.js calls this before its forge actor) */
  H.drawStage = function (g, x, feetY, t, salute) {
    const h = H.current();
    if (h.body.kind === "forge") return false;
    const pose = { x, y: feetY, facing: 1, t, anim: salute > 0 ? "attack" : "idle", attacking: salute > 0, atkP: salute > 0 ? 1 - salute / 0.5 : 0, attackIdx: 0 };
    return H.draw(g, h, pose, { scale: 1.9 });
  };

  /* ---------------- HEROES screen ---------------- */
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  let view = sel, raf = 0, last = 0, clock = 0, demo = 0;
  const DEMO = ["idle", "walk", "attack", "run", "attack"];
  function statBar(label, v, invert) {
    const row = mk("div", "hs-stat");
    const pct = Math.max(6, Math.min(100, (invert ? 2 - v : v) * 60));
    const fill = mk("i"); fill.style.width = pct + "%";
    const bar = mk("span", "hs-bar"); bar.append(fill);
    const delta = Math.round(((invert ? 1 - v : v - 1)) * 100);
    row.append(mk("b", "", label), bar, mk("em", delta > 0 ? "up" : delta < 0 ? "down" : "", delta === 0 ? "—" : (delta > 0 ? "+" : "") + delta + "%"));
    return row;
  }
  H.render = function () {
    const grid = $("heroes-grid"), detail = $("heroes-detail");
    if (!grid || !detail) return;
    grid.replaceChildren();
    for (const h of H.ROSTER) {
      const b = mk("button", "hero-card" + (h.id === view ? " view" : "") + (h.id === sel ? " sel" : ""));
      b.style.setProperty("--hc", h.color);
      b.dataset.hero = h.id;
      const cv = mk("canvas"); cv.width = 120; cv.height = 120; cv.dataset.hero = h.id;
      b.append(cv, mk("b", "", h.name), mk("small", "", h.title));
      if (h.id === sel) b.append(mk("span", "hc-tag", "EQUIPPED"));
      b.addEventListener("click", () => { view = h.id; H.preload(h); NR.audio.play("ui"); H.render(); });
      grid.append(b);
    }
    const h = H.byId(view) || H.current(), s = h.stats;
    const stage = mk("canvas", "hd-stage"); stage.width = 260; stage.height = 240; stage.id = "hero-detail-canvas";
    const stats = mk("div", "hs-stats");
    stats.append(statBar("HEALTH", s.hp || 1), statBar("SPEED", s.speed || 1), statBar("DAMAGE", s.dmg || 1), statBar("ARMOR", s.armor || 1, true));
    const btns = mk("div", "hd-btns");
    const equip = mk("button", "btn btn-primary", h.id === sel ? "✔ EQUIPPED" : "EQUIP " + h.name);
    equip.disabled = h.id === sel;
    equip.addEventListener("click", () => { H.select(h.id); NR.audio.play("coin"); NR.hub?.notify?.(`${h.name} is now your hero`); H.render(); });
    btns.append(equip);
    if (h.body.kind === "forge") {
      const forge = mk("button", "btn", "OPEN HERO FORGE");
      forge.addEventListener("click", () => { H.select("kaito"); NR.lobby.openModal("modal-creator"); });
      btns.append(forge);
    }
    detail.style.setProperty("--hc", h.color);
    detail.replaceChildren(stage, mk("h3", "", h.name), mk("p", "hd-title", h.title), mk("p", "hd-lore", h.lore), stats, mk("p", "hd-trait", "TRAIT · " + h.trait), btns);
  };
  function loop(now) {
    const modal = $("modal-heroes");
    if (!modal || !modal.classList.contains("open")) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; clock += dt;
    demo = Math.floor(clock / 1.6) % DEMO.length;
    for (const cv of document.querySelectorAll("#heroes-grid canvas")) {
      const h = H.byId(cv.dataset.hero), g = cv.getContext("2d");
      g.clearRect(0, 0, cv.width, cv.height);
      if (h.body.kind === "forge") drawForge(g, cv.width / 2, cv.height - 10, clock, 1);
      else H.draw(g, h, { x: cv.width / 2, y: cv.height - 10, facing: 1, t: clock, anim: "idle" }, { scale: 0.9 });
    }
    const st = $("hero-detail-canvas");
    if (st) {
      const h = H.byId(view) || H.current(), g = st.getContext("2d");
      g.clearRect(0, 0, st.width, st.height);
      const anim = DEMO[demo], atk = anim === "attack", p = (clock % 1.6) / 1.6;
      const pose = { x: st.width / 2, y: st.height - 18, facing: 1, t: clock, anim, attacking: atk, atkP: atk ? Math.min(1, p * 2.2) : 0,
        attackIdx: Math.floor(clock / 1.6) % 3, runAmt: anim === "run" ? 1 : anim === "walk" ? 0.5 : 0 };
      if (h.body.kind === "forge") drawForge(g, pose.x, pose.y, clock, 1.9, anim);
      else H.draw(g, h, pose, { scale: 1.6 });
    }
  }
  const forgeActors = {};
  function drawForge(g, x, y, t, scale, anim) {
    const k = String(scale);
    const a = forgeActors[k] || (forgeActors[k] = NR.char.actor(NR.profile.appearance, { rate: 1 }));
    const want = anim === "run" || anim === "walk" ? "walk" : anim === "attack" ? "attack" : "idle";
    if (a._want !== want || (want === "attack" && a.done)) { a.play(want, want === "attack"); a._want = want; }
    a.facing = 1; a.update(1 / 60);
    a.draw(g, x, y, { scale });
  }
  H.open = function () {
    view = sel;
    H.render();
    if (NR.lobby && NR.lobby.openModal) NR.lobby.openModal("modal-heroes");
    for (const h of H.ROSTER) H.preload(h);
    if (!raf && typeof requestAnimationFrame === "function") { last = 0; raf = requestAnimationFrame(loop); }
  };
})();
