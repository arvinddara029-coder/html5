/* ============ PRODUCTION PASS — Hero Select + Enemy Codex ============
   Premium character/enemy browsers for the lobby.

   HERO SELECT (modal-heroes)
     - large animated preview of the highlighted hero (bigger than the cards)
     - hero cards stay visible on the right, locked heroes keep their model,
       name and lock state visible (silhouette + level requirement)
     - stat bars, 3 signature abilities with keycaps [E]/[Z]/[X], perk text
     - the selected hero's kit is bound automatically in the match — there is
       no generic ability vault to manage (relic SPELLS remain optional and
       live inside the hero loadout panel)
     - smooth swap animation between heroes

   ENEMY CODEX (modal-enemies)
     - every registered enemy with a live animated preview, name, tier and
       "first seen" stage; enemies beyond the player's current progression are
       marked ARRIVES LATER instead of hidden
     - the boss rotation (every 5th wave / survive milestone)
     - late-world super threats from the super asset library
   Both panels share one rAF loop that stops when the modals close. */
(function () {
  const CX = (NR.codex = {});
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => (typeof document.querySelectorAll === "function"
    ? Array.prototype.slice.call(document.querySelectorAll(sel)) : []);
  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => setTimeout(() => cb((window.performance || Date).now()), 16);

  /* ---------------- shared animated-preview loop ---------------- */
  const previews = []; // {draw(ctx,dt,now)}
  let loopOn = false, lastT = 0;
  function tick(now) {
    if (!previews.length) { loopOn = false; return; }
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    for (const p of previews) {
      try { p.draw(p.ctx, dt, now); } catch (_) { /* a preview must never kill the loop */ }
    }
    raf(tick);
  }
  function addPreview(canvas, draw) {
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext("2d");
    const entry = { ctx, draw, canvas };
    previews.push(entry);
    if (!loopOn) { loopOn = true; lastT = (window.performance || Date).now(); raf(tick); }
    return entry;
  }
  function clearPreviews() { previews.length = 0; }

  function modalOpen(id) {
    const el = $(id);
    return !!(el && el.classList.contains("open"));
  }
  function stopWhenClosed() {
    // drops every preview once neither codex modal is open (cleanup)
    setTimeout(() => {
      if (!modalOpen("modal-heroes") && !modalOpen("modal-enemies")) clearPreviews();
      else stopWhenClosed();
    }, 400);
  }

  /* ================= HERO SELECT ================= */
  let heroActor = null, heroAnimT = 0, highlighted = null;

  CX.openHeroes = function (focusKey) {
    const modal = $("modal-heroes");
    if (!modal) return;
    clearPreviews();
    qsa(".lobby-modal.open").forEach((el) => el.classList.remove("open"));
    modal.classList.add("open");
    NR.audio.play("uiConfirm");
    highlight(focusKey || NR.profile.character || "kaito");
    stopWhenClosed();
  };

  function highlight(key) {
    const H = NR.heroes;
    const def = H.byKey(key);
    if (!def) return;
    highlighted = def;
    const unlocked = H.isUnlocked(def);
    const isCurrent = NR.profile.character === def.key;

    /* --- left: big animated preview --- */
    const cv = $("hero-select-preview");
    const look = NR.vault ? NR.vault.effectiveLook(def.key) : def.look;
    heroActor = null;
    try { heroActor = NR.char.actor(look, { rate: 1 }); heroActor.play("idle"); }
    catch (_) { heroActor = null; }
    if (cv) {
      cv.width = 300; cv.height = 430;
      addPreview(cv, (ctx, dt) => {
        heroAnimT += dt;
        // while hero art layers are still streaming in, refresh the actor so
        // the preview never gets stuck on a half-loaded composite
        if (heroAnimT < 4 && (heroAnimT * 60 | 0) % 45 === 0) {
          try {
            const fresh = NR.char.actor(NR.vault ? NR.vault.effectiveLook(def.key) : def.look, { rate: 1 });
            fresh.play("idle"); fresh.facing = 1;
            heroActor = fresh;
          } catch (_) {}
        }
        const w = cv.width, h = cv.height;
        ctx.clearRect(0, 0, w, h);
        // pedestal glow
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, unlocked ? "cyan" : "red", w / 2, h - 40, 120, 0.28);
        ctx.restore();
        if (heroActor) {
          heroActor.facing = 1;
          heroActor.update(dt);
          ctx.save();
          if (!unlocked) { ctx.globalAlpha = 0.5; }
          heroActor.draw(ctx, w / 2, h - 34 + Math.sin(heroAnimT * 2.1) * 3, { scale: 2.5 });
          ctx.restore();
        } else {
          ctx.fillStyle = "#22405a";
          ctx.fillRect(w / 2 - 40, h - 200, 80, 170);
        }
      });
    }

    /* --- middle: detail panel (re-rendered with a swap animation) --- */
    const detail = $("hero-detail");
    if (detail) {
      detail.classList.remove("swap");
      void detail.offsetWidth; // restart the CSS transition
      const AB = NR.abilities;
      const kit = (def.kit || []).map((id, i) => {
        const d = AB && AB.def(id);
        const keys = ["E", "Z", "X"];
        return d ? `<div class="hs-ability${i === 2 ? " sig" : ""}">
          <span class="hs-key">${keys[i]}</span>
          <div><b>${d.name}</b><small>${d.desc}</small></div>
        </div>` : "";
      }).join("");
      const bar = (label, v, max, cls) => `
        <div class="hs-stat"><span>${label}</span>
          <div class="hs-bar"><i class="${cls || ""}" style="width:${Math.round(Math.min(100, (v / max) * 100))}%"></i></div>
          <b>${v}</b></div>`;
      const relic = NR.evolution;
      const spellChips = relic && relic.slots
        ? relic.slots.slice(0, 4).map((id) => {
            const sp = relic.spells.find((s) => s.id === id);
            return sp ? `<span class="hs-relic">${sp.name}</span>` : "";
          }).join("") : "";
      detail.innerHTML = `
        <div class="hs-name" style="--c:${def.color}">${def.name}</div>
        <div class="hs-role">${def.role} · <b style="color:${def.color}">${def.tag}</b></div>
        ${unlocked ? "" : `<div class="hs-lock">🔒 UNLOCKS AT LEVEL ${def.unlockLevel} — keep fighting to earn this hero</div>`}
        <div class="hs-stats">
          ${bar("HP", def.hp, 200)}
          ${bar("SPEED", def.speed.toFixed(2), 1.35)}
          ${bar("DAMAGE", def.damage.toFixed(2), 1.55)}
          ${bar("ARMOR", (1 / def.armor).toFixed(2), 1.6)}
        </div>
        <div class="hs-kit">${kit}</div>
        <p class="hs-perk">${def.perk}</p>
        <div class="hs-loadout">
          <span class="hs-lo-label">RELIC SPELLS (OPTIONAL)</span>
          <div class="hs-relics">${spellChips || "<i>none equipped</i>"}</div>
          <button class="ghost-btn" id="hs-manage-relics">✦ MANAGE RELIC SPELLS</button>
        </div>
        <button class="gold-btn hs-select" id="hs-select" ${unlocked ? "" : "disabled"}>
          ${isCurrent ? "SELECTED ✓" : unlocked ? "SELECT HERO" : "LOCKED"}
        </button>`;
      detail.classList.add("swap");
      const selBtn = $("hs-select");
      if (selBtn) selBtn.addEventListener("click", () => {
        if (NR.heroes.select(def.key)) {
          NR.audio.play("heroSelect");
          NR.hub.notify(`${def.name} selected — abilities [E] [Z] [X] bound automatically.`);
          highlight(def.key); renderHeroCards();
          NR.lobby.refreshHeroStage && NR.lobby.refreshHeroStage();
        } else NR.audio.play("deny");
      });
      const relBtn = $("hs-manage-relics");
      if (relBtn) relBtn.addEventListener("click", () => {
        NR.audio.play("uiClick");
        try { NR.evolution && NR.evolution.vault && NR.evolution.vault(); } catch (_) {}
      });
      const custBtn = $("hs-customize");
      if (custBtn) custBtn.addEventListener("click", () => {
        NR.audio.play("uiClick");
        // select first (so the vault edits the hero being previewed), then open cosmetics
        if (unlocked && !isCurrent) NR.heroes.select(def.key);
        const m = $("modal-heroes");
        if (m) m.classList.remove("open");
        NR.vault && NR.vault.openVault && NR.vault.openVault("skin");
        NR.lobby.refreshHeroStage && NR.lobby.refreshHeroStage();
      });
    }

    renderHeroCards();
  }

  function renderHeroCards() {
    const grid = $("hero-grid");
    if (!grid) return;
    const H = NR.heroes;
    grid.replaceChildren(...H.defs.map((def) => {
      const unlocked = H.isUnlocked(def);
      const card = document.createElement("button");
      card.className = "hs-card" + (unlocked ? "" : " locked")
        + (def.key === NR.profile.character ? " current" : "")
        + (highlighted && def.key === highlighted.key ? " hl" : "");
      card.setAttribute("aria-label", def.name);
      // live model thumbnail (single static frame — cheap)
      const cv = document.createElement("canvas");
      cv.width = 92; cv.height = 104;
      card.append(cv);
      const nm = document.createElement("b");
      nm.textContent = def.name;
      const tag = document.createElement("small");
      tag.textContent = unlocked ? def.tag : "🔒 LVL " + def.unlockLevel;
      card.append(nm, tag);
      card.addEventListener("click", () => { NR.audio.play("uiClick"); highlight(def.key); });
      // draw the thumbnail once the modal is visible
      const draw = () => {
        const ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, 92, 104);
        try {
          const look = NR.vault ? NR.vault.effectiveLook(def.key) : def.look;
          const a = NR.char.actor(look, { rate: 1 });
          a.facing = 1;
          if (!unlocked) ctx.globalAlpha = 0.45;
          a.draw(ctx, 46, 98, { scale: 0.62 });
        } catch (_) {
          ctx.fillStyle = "#22405a"; ctx.fillRect(26, 28, 40, 70);
        }
      };
      requestAnimationFrame ? requestAnimationFrame(draw) : draw();
      return card;
    }));
  }

  /* ================= ENEMY CODEX ================= */
  const FIELD = [
    { type: "crawler", name: "ORC CRAWLER", blurb: "Lunging ground beast — closes fast, bites hard." },
    { type: "slime", name: "BLOB", blurb: "Hopping jelly — harmless alone, deadly in packs." },
    { type: "drone", name: "HOVER DRONE", blurb: "Floats at range and fires aimed bolts." },
    { type: "soldier", name: "FOOTSOLDIER", blurb: "Disciplined swordsman with shield discipline." },
    { type: "wraith", name: "WRAITH", blurb: "Phasing spirit — fades, reappears behind you, slashes." },
    { type: "gunner", name: "GUNNER", blurb: "Crouching musketeer — reloads between volleys." },
    { type: "warlock", name: "WARLOCK", blurb: "Casts fire bursts from a distance. Interrupt him." },
    { type: "rival", name: "RIVAL RONIN", blurb: "Mirror-duelist with dashes and counters." },
    { type: "striker", name: "STRIKER", blurb: "Shock trooper — leap-attacks your position." },
    { type: "blade", name: "BLADE ADEPT", blurb: "Twin-blade flurry at close range." },
    { type: "sentry", name: "SENTRY", blurb: "Expedition guardian — holds key positions." },
    { type: "sentinel", name: "SENTINEL", blurb: "Honour guard — heavier, armoured sentry." },
    { type: "brute", name: "WAR BRUTE", blurb: "Tower of muscle. Slow, telegraphed, huge hits." },
    { type: "apparition", name: "APPARITION", blurb: "Late-world phantom elite. Resists crowd control." },
  ];
  const CLS = {
    crawler: "Crawler", slime: "Slime", drone: "Drone", soldier: "Soldier",
    wraith: "Wraith", gunner: "Gunner", warlock: "Warlock", rival: "Rival",
    striker: "Striker", blade: "Blade", sentry: "Sentry", sentinel: "Sentinel",
    brute: "Brute", apparition: "Apparition",
  };

  function firstSeenLevel(type) {
    // earliest level whose staged pool contains the type
    const LS = NR.levelsys;
    if (!LS || !LS.stageFor) return 1;
    let prev = 1;
    for (let lvl = 1; lvl <= 60; lvl++) {
      const st = LS.stageFor(lvl);
      if (st.pool && st.pool.indexOf(type) >= 0) return lvl;
      prev = lvl;
    }
    return prev;
  }

  CX.openEnemies = function () {
    const modal = $("modal-enemies");
    if (!modal) return;
    clearPreviews();
    qsa(".lobby-modal.open").forEach((el) => el.classList.remove("open"));
    modal.classList.add("open");
    NR.audio.play("uiConfirm");
    renderEnemies();
    stopWhenClosed();
  };

  function renderEnemies() {
    const body = $("enemy-codex-body");
    if (!body) return;
    body.replaceChildren();
    const lvl = (NR.profile && NR.profile.level) || 1;
    const stageNow = NR.levelsys && NR.levelsys.stageFor ? NR.levelsys.stageFor(lvl) : null;

    const section = (title, note) => {
      const h = document.createElement("h3");
      h.className = "cx-title";
      h.innerHTML = `${title} <small>${note || ""}</small>`;
      body.append(h);
      const g = document.createElement("div");
      g.className = "cx-grid";
      body.append(g);
      return g;
    };

    /* --- field units --- */
    const grid = section("FIELD UNITS", "every unit is a real, registered enemy");
    for (const f of FIELD) {
      const seen = firstSeenLevel(f.type);
      const active = !stageNow || (stageNow.pool || []).indexOf(f.type) >= 0;
      const card = document.createElement("div");
      card.className = "cx-card" + (active ? "" : " upcoming");
      const cv = document.createElement("canvas");
      cv.width = 118; cv.height = 108;
      card.append(cv);
      const nm = document.createElement("b");
      nm.textContent = f.name;
      const meta = document.createElement("small");
      meta.innerHTML = active
        ? `LVL ${seen}+ · THREAT ${threatOf(f.type)}`
        : `🔒 ARRIVES LVL ${seen}`;
      const blurb = document.createElement("p");
      blurb.textContent = f.blurb;
      card.append(nm, meta, blurb);
      grid.append(card);

      // live preview: instantiate the real class and animate its sprite
      try {
        const Cls = NR[CLS[f.type]];
        if (Cls) {
          const e = new Cls(0, 0, 1);
          e.spawnT = 0; e.facing = 1;
          addPreview(cv, (ctx, dt) => {
            const w = cv.width, h = cv.height;
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.translate(w / 2, h - (e.flying ? 44 : 12));
            if (!active) ctx.globalAlpha = 0.45;
            e.t += dt;
            if (e.spr && e.spr.update) e.spr.update(dt);
            e.draw(ctx);
            ctx.restore();
          });
        }
      } catch (_) { /* card stays, preview just stays blank */ }
    }

    /* --- boss rotation --- */
    const bossGrid = section("BOSS ROTATION", "a boss guards every 5th wave · survive milestones every 3:00");
    if (NR.bossDefs) {
      for (const def of NR.bossDefs.rotation()) {
        const card = document.createElement("div");
        card.className = "cx-card boss";
        const cv = document.createElement("canvas");
        cv.width = 118; cv.height = 108;
        card.append(cv);
        const nm = document.createElement("b");
        nm.textContent = def.name;
        const meta = document.createElement("small");
        meta.textContent = `BOSS · ${def.style ? def.style.toUpperCase() : "DUELIST"} · ${def.reward}💎 BOUNTY`;
        card.append(nm, meta);
        bossGrid.append(card);
        try {
          const b = NR.bossDefs.spawn(def, 0, 1, 1);
          if (b) {
            b.spawnT = 0; b.facing = 1;
            addPreview(cv, (ctx, dt) => {
              const w = cv.width, h = cv.height;
              ctx.clearRect(0, 0, w, h);
              ctx.save();
              const s = Math.min(1, 92 / (b.h || 90));
              ctx.translate(w / 2, h - 10);
              ctx.scale(s, s);
              b.t += dt;
              if (b.spr && b.spr.update) b.spr.update(dt);
              b.draw(ctx);
              ctx.restore();
            });
          }
        } catch (_) {}
      }
    }

    /* --- super threats (late-world super-actor enemies) --- */
    if (NR.superContent && NR.superContent.actors) {
      const supers = NR.superContent.actors.filter((a) => a.role === "enemy").slice(0, 8);
      if (supers.length) {
        const sg = section("SUPER THREATS", "late-world elites from the super collection");
        for (const a of supers) {
          const card = document.createElement("div");
          card.className = "cx-card super upcoming";
          const cv = document.createElement("canvas");
          cv.width = 118; cv.height = 108;
          card.append(cv);
          const nm = document.createElement("b");
          nm.textContent = (a.name || "UNKNOWN").toUpperCase();
          const meta = document.createElement("small");
          meta.textContent = "🔒 LATE-WORLD SUPER THREAT";
          card.append(nm, meta);
          sg.append(card);
          try {
            if (NR.superRuntime) {
              addPreview(cv, (ctx, dt) => {
                const w = cv.width, h = cv.height;
                ctx.clearRect(0, 0, w, h);
                NR.superRuntime.drawActor(ctx, a, "idle", (performance.now() / 1000) % 60, w / 2, h - 12, 84, 1, 0.9);
              });
            }
          } catch (_) {}
        }
      }
    }
  }

  function threatOf(type) {
    // rough threat label from class stats (clamped, descriptive)
    const Cls = NR[CLS[type]];
    try {
      const e = new Cls(0, 0, 1);
      const t = ((e.maxHp || 30) / 30) * ((e.dmg || 10) / 10);
      return t >= 3 ? "★★★" : t >= 1.6 ? "★★" : "★";
    } catch (_) { return "★"; }
  }

  /* wire nav buttons (called from lobby init) */
  CX.init = function () {
    const hb = $("lb-heroes2");
    if (hb) hb.addEventListener("click", () => CX.openHeroes());
    const eb = $("lb-enemies");
    if (eb) eb.addEventListener("click", () => CX.openEnemies());
    const backBtn = $("hs-back");
    if (backBtn) backBtn.addEventListener("click", () => CX.openHeroes());
  };
})();
