/* ============ SKYWARD — fantasy lobby: hero stage, events, deploy, creator, shop ============ */
(function () {
  const $ = (id) => document.getElementById(id);
  const P = NR.profile;
  const L = (NR.lobby = {});

  const TITLES = [
    [1, "WANDERER"], [4, "PATHFINDER"], [8, "BLADEBEARER"], [14, "RONIN"],
    [22, "WARLORD"], [32, "SKYWARD CHAMPION"], [45, "MYTHIC HERO"], [60, "LEGEND"],
  ];
  const titleFor = (lv) => {
    let t = TITLES[0][1];
    for (const [min, name] of TITLES) if (lv >= min) t = name;
    return t;
  };

  /* ================= icons ================= */
  let coinFrames = null;
  function buildCoin() {
    const img = NR.assets.get("GandalfHardcore Emojis and Icons/GandalfHardcore Emojis and Icons/Coin.png");
    if (!img) return null;
    const n = 12, fw = img.width / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 16;
      cv.getContext("2d").drawImage(img, i * fw, 0, fw, 16, 0, 0, 16, 16);
      out.push(cv);
    }
    return out;
  }
  function gemCanvas(size) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size || 26;
    const g = cv.getContext("2d");
    const s = size || 26, u = s / 26;
    g.scale(u, u);
    // faceted cyan gem
    const grad = g.createLinearGradient(0, 2, 0, 24);
    grad.addColorStop(0, "#d8fbff"); grad.addColorStop(0.45, "#5fd8ff"); grad.addColorStop(1, "#1b6fbf");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(13, 1); g.lineTo(23, 9); g.lineTo(13, 25); g.lineTo(3, 9); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 1.4; g.stroke();
    g.beginPath(); g.moveTo(3, 9); g.lineTo(23, 9); g.moveTo(13, 1); g.lineTo(13, 25);
    g.moveTo(8, 9); g.lineTo(13, 25); g.moveTo(18, 9); g.lineTo(13, 25);
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 0.9; g.stroke();
    return cv;
  }

  /* ================= player card ================= */
  L.refreshCard = function () {
    if (!$("pc-name")) return;
    $("pc-name").textContent = P.name;
    $("pc-level").textContent = "LV " + (P.level || 1);
    $("pc-title").textContent = titleFor(P.level || 1);
    const cur = NR.economy.levelFromXp(P.xp || 0);
    const pct = Math.max(0, Math.min(100, (cur.into / cur.need) * 100));
    $("pc-xp-fill").style.width = pct.toFixed(1) + "%";
    $("pc-xp-text").textContent = `${cur.into} / ${cur.need} XP`;
    $("pc-next").textContent = `NEXT: LV ${cur.level + 1}`;
    $("pc-coins").textContent = (P.coins || 0).toLocaleString("en-US");
    $("pc-gems").textContent = (P.gems || 0).toLocaleString("en-US");
    // avatar portrait
    const av = $("pc-avatar");
    if (av && !av.dataset.dirty) {
      const g = av.getContext("2d");
      g.clearRect(0, 0, av.width, av.height);
      try { g.drawImage(NR.char.portrait(P.appearance, 62), 0, 0); } catch (_) {}
    }
    const sc = $("shop-coins"), sg = $("shop-gems");
    if (sc) sc.textContent = (P.coins || 0).toLocaleString("en-US");
    if (sg) sg.textContent = (P.gems || 0).toLocaleString("en-US");
    L.refreshWallet();
    // deploy note reflects level bonus
    const bonus = NR.economy.levelBonus();
    if ($("deploy-note"))
      $("deploy-note").textContent =
        `LEVEL ${P.level || 1} · +${Math.round((bonus.hp - 1) * 100)}% HP & +${Math.round((bonus.damage - 1) * 100)}% DAMAGE`;
  };

  /* wallet-only refresh (safe to call from shop rendering) */
  L.refreshWallet = function () {
    const sc = $("shop-coins"), sg = $("shop-gems");
    if (sc) sc.textContent = (P.coins || 0).toLocaleString("en-US");
    if (sg) sg.textContent = (P.gems || 0).toLocaleString("en-US");
    $("pc-coins").textContent = (P.coins || 0).toLocaleString("en-US");
    $("pc-gems").textContent = (P.gems || 0).toLocaleString("en-US");
  };

  /* ================= hero stage ================= */
  const hero = { actor: null, raf: 0, last: 0, t: 0, wave: 0, saluteT: 0 };
  const GUIDE_PATH = "GandalfHardcFREE NPC/GandalfHardcore Goddess NPC.png";
  const GUIDE_FRAMES = 13; // 832x64 strip of 64x64 frames
  function heroLoop(now) {
    hero.raf = requestAnimationFrame(heroLoop);
    const dt = Math.min(0.05, (now - hero.last) / 1000 || 0.016);
    hero.last = now;
    hero.t += dt;
    // guide sprite (Luna) — animated Goddess NPC strip
    const gc = $("guide-canvas");
    if (gc) {
      const gimg = NR.assets.get(GUIDE_PATH);
      const g2 = gc.getContext("2d");
      g2.clearRect(0, 0, gc.width, gc.height);
      g2.imageSmoothingEnabled = false;
      if (gimg) {
        const f = Math.floor(hero.t * 9) % GUIDE_FRAMES;
        g2.drawImage(gimg, f * 64, 0, 64, 64, 0, 0, gc.width, gc.height);
      }
    }
    const cv = $("hero-canvas");
    if (!cv || !document.getElementById("scr-menu").classList.contains("active")) return;
    const g = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    const scale = 2.15;
    const feetY = h - 26;
    const bob = Math.sin(hero.t * 2.2) * 3;
    // gentle idle sway: the actor bobs via vertical offset
    const a = hero.actor;
    if (a) {
      a.facing = 1;
      a.update(dt);
      // salute: play attack animation briefly
      if (hero.saluteT > 0) {
        hero.saluteT -= dt;
        if (hero.saluteT <= 0) a.play("idle");
      }
      // pet follows behind (pet art faces right natively → no flip needed here)
      if (P.pet) {
        const px = w / 2 - 95 + Math.sin(hero.t * 1.4) * 6;
        const wisp = P.pet.indexOf("Wisp") >= 0;
        const py = feetY - 2 - (wisp ? 40 : 0);
        NR.char.drawPet(g, P.pet, Math.floor(hero.t * 8), px, py, 2.1, false);
        // doggy wardrobe: hat ↔ backpack overlay, swapped every few seconds
        if (P.pet.indexOf("doggy sheet") >= 0) {
          const acc = NR.assets.get(Math.floor(hero.t / 5) % 2
            ? "GandalfHardcore Pet companion/GandalfHardcore doggy hat.png"
            : "GandalfHardcore Pet companion/GandalfHardcore doggy backpack.png");
          if (acc) {
            const af = Math.floor(hero.t * 8) % 6, s2 = 2.1;
            g.drawImage(acc, af * 32, 0, 32, 32, px - (32 * s2) / 2, py - 32 * s2, 32 * s2, 32 * s2);
          }
        }
      }
      a.draw(g, w / 2, feetY + bob, { scale });
    }
  }
  L.initHero = function () {
    const cv = $("hero-canvas");
    if (!cv) return;
    hero.actor = NR.char.actor(P.appearance, { rate: 1 });
    hero.actor.play("idle");
    const host = cv.parentElement || cv; // canvas lives inside the stage frame
    host.addEventListener("click", () => {
      if (hero.saluteT > 0) return;
      hero.saluteT = 0.5;
      hero.actor.play("attack", true, 1.1);
      NR.audio.play("swing");
    });
    if (!hero.raf) hero.raf = requestAnimationFrame(heroLoop);
  };

  /* ================= events & news ================= */
  const EVENTS = [
    {
      id: "dragon", title: "Dragon's Den Raid", desc: "The red wyrm wakes. Survivors only.",
      img: "assets/event_dragon.jpg", art: "img", offset: 29 * 3600 + 5 * 60,
      tag: "RAID", action: () => openModal("modal-deploy", "survival"),
    },
    {
      id: "luna", title: "New Hero: Luna", desc: "Featured art of Luna — craft her look in the Hero Forge.",
      img: "assets/GandalfHardcFREE NPC/GandalfHardcore Goddess Portrait 640x640.png", art: "img",
      offset: 6 * 3600, tag: "NEW", action: () => openModal("modal-creator"),
    },
    {
      id: "guild", title: "Guild Wars", desc: "Season 3 — hold the arena against endless waves.",
      img: "assets/event_guild.jpg", art: "img", offset: 3 * 86400,
      tag: "SEASON 3", action: () => openModal("modal-deploy", "survival"),
    },
    {
      id: "grandlobby", title: "The Grand Lobby", desc: "Seasonal rest hall is open — review your run archive and medals.",
      img: "assets/lobby.png", art: "img", offset: 5 * 86400,
      tag: "REST HUB", action: () => NR.ui.show("records"),
    },
  ];
  function fmtCountdown(ms) {
    if (ms <= 0) return "LIVE NOW";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `Starts in ${d}d ${h}h`;
    if (h > 0) return `Starts in ${h}h ${m}m`;
    return `Starts in ${m}m`;
  }
  L.renderEvents = function () {
    const box = $("event-list");
    if (!box) return;
    const now = Date.now();
    if (!P.events || typeof P.events !== "object") P.events = {};
    box.replaceChildren();
    for (const ev of EVENTS) {
      if (!P.events[ev.id]) P.events[ev.id] = now + ev.offset * 1000;
      const ends = P.events[ev.id];
      const card = document.createElement("button");
      card.className = "event-card";
      card.dataset.event = ev.id;
      const art = document.createElement("div");
      art.className = "ev-art";
      const img = document.createElement("img");
      img.src = encodeURI(ev.img); img.alt = ""; img.loading = "lazy";
      art.append(img);
      const body = document.createElement("div");
      body.className = "ev-body";
      body.innerHTML =
        `<h4>${ev.title}</h4><p>${ev.desc}</p>` +
        `<div class="ev-meta"><span class="live"></span><span data-count="${ev.id}">${fmtCountdown(ends - now)}</span></div>`;
      card.append(art, body);
      card.addEventListener("click", () => { NR.audio.play("ui"); ev.action(); });
      box.append(card);
    }
    NR.saveProfile();
  };
  function tickEvents() {
    const now = Date.now();
    for (const ev of EVENTS) {
      const el = document.querySelector(`[data-count="${ev.id}"]`);
      if (el && P.events && P.events[ev.id]) el.textContent = fmtCountdown(P.events[ev.id] - now);
    }
  }

  /* ================= modals ================= */
  function openModal(id, preset) {
    const m = $(id);
    if (!m) return;
    document.querySelectorAll(".lobby-modal.open").forEach((el) => el.classList.remove("open"));
    m.classList.add("open");
    if (id === "modal-deploy") {
      if (preset) setMode(preset);
      L.refreshDeploy();
    }
    if (id === "modal-map") refreshMap();
    if (id === "modal-creator") { L.initCreator(); }
    if (id === "modal-shop") { L.renderShop(); }
  }
  L.openModal = openModal;
  function closeModal(id) { $(id) && $(id).classList.remove("open"); }

  /* ================= deploy panel — WORLD SELECT first ================= */
  /* one card per chapter — art falls back instead of breaking on new chapters */
  const WORLD_ART = ["bg_day.jpg", "bg_garden.jpg", "bg_reactor.jpg", "bg_far.jpg", "menu_hero.jpg", "lobby.png"];
  const WORLD_TAG = ["TRANSIT LINE", "RECLAIMED GARDENS", "THE CORE", "SUNKEN FOUNDRY", "SKYWARD DOCKS", "THE SPIRE"];
  const worldArt = (id) => WORLD_ART[id % WORLD_ART.length];
  const worldTag = (id) => WORLD_TAG[id % WORLD_TAG.length];
  function worldCard(ch, selectable) {
    const locked = ch.id > P.unlocked;
    const cleared = ch.id < P.unlocked;
    const b = document.createElement("button");
    b.className =
      "world-card" +
      (selectable && P.chapter === ch.id ? " sel" : "") +
      (locked ? " locked" : "") +
      (cleared ? " cleared" : "");
    b.dataset.chapter = ch.id;
    b.disabled = locked;
    b.innerHTML =
      `<img class="wc-art" src="assets/${worldArt(ch.id)}" alt="" loading="lazy"/>` +
      `<span class="wc-shade"></span>` +
      `<span class="wc-num">WORLD ${String(ch.id + 1).padStart(2, "0")} · ${worldTag(ch.id)}</span>` +
      `<span class="wc-body"><h4>${ch.short}</h4><p>${ch.district} · ${ch.description}</p></span>` +
      `<span class="wc-state">${
        locked
          ? "🔒 CLEAR WORLD 0" + ch.id + " FIRST"
          : cleared
            ? "✔ CLEARED — REPLAY"
            : selectable && P.chapter === ch.id
              ? "◈ SELECTED"
              : "READY"
      }</span>`;
    return b;
  }
  function setMode(mode) {
    P.mode = mode;
    NR.saveProfile();
    document.querySelectorAll("#deploy-modes .deploy-mode").forEach((b) => {
      b.classList.toggle("sel", b.dataset.mode === mode);
      b.setAttribute("aria-pressed", b.dataset.mode === mode);
    });
    $("deploy-chapters").style.display = mode === "adventure" ? "" : "none";
    $("deploy-title").textContent = mode === "adventure" ? "SELECT YOUR WORLD" : "ARENA — WAVE SURVIVAL";
  }
  L.refreshDeploy = function () {
    if (!$("chapter-cards")) return;
    setMode(P.mode);
    document.querySelectorAll("#deploy-difficulty button").forEach((b) =>
      b.classList.toggle("sel", b.dataset.difficulty === P.difficulty));
    document.querySelectorAll("#deploy-world button").forEach((b) =>
      b.classList.toggle("sel", b.dataset.world === P.world));
    // big world cards — the world comes FIRST, before anything else
    const active = document.activeElement && document.activeElement.dataset.chapter;
    $("chapter-cards").replaceChildren(...NR.adventure.chapters.map((ch) => {
      const b = worldCard(ch, true);
      b.addEventListener("click", () => {
        P.chapter = ch.id; NR.saveProfile(); L.refreshDeploy(); NR.audio.play("ui");
      });
      return b;
    }));
    if (active !== undefined && active !== null && active !== false)
      $("chapter-cards") && $("chapter-cards").querySelector(`[data-chapter="${active}"]`)?.focus({ preventScroll: true });
    // continue checkpoint
    const cp = NR.checkpoint.get();
    const cont = $("deploy-continue");
    if (cont) {
      cont.hidden = !cp;
      if (cp)
        cont.textContent = `↳ CONTINUE · ${NR.adventure.chapters[cp.chapter].short.toUpperCase()} · RELAY ${cp.relays.length}/3`;
    }
    L.refreshCard();
  };
  function refreshMap() {
    if (!$("map-cards")) return;
    $("map-cards").replaceChildren(...NR.adventure.chapters.map((ch) => {
      const b = worldCard(ch, false);
      b.addEventListener("click", () => {
        if (ch.id > P.unlocked) return;
        P.chapter = ch.id; P.mode = "adventure"; NR.saveProfile();
        closeModal("modal-map"); openModal("modal-deploy");
        NR.audio.play("ui");
      });
      return b;
    }));
  }

  /* ================= character creator ================= */
  const CATS = [
    { id: "skin", label: "SKIN" }, { id: "monster", label: "MONSTER" }, { id: "hair", label: "HAIR" },
    { id: "ears", label: "EARS" }, { id: "top", label: "TOP" }, { id: "bottom", label: "BOTTOM" },
    { id: "underwear", label: "UNDERWEAR" }, { id: "shoes", label: "FOOTWEAR" }, { id: "hat", label: "HAT" },
    { id: "mask", label: "MASK" }, { id: "gloves", label: "GLOVES" }, { id: "weapon", label: "WEAPON" },
    { id: "back", label: "BACK" }, { id: "aura", label: "AURA" }, { id: "pet", label: "PET" },
  ];
  const OPTIONAL = new Set(["monster", "ears", "hat", "mask", "back", "aura", "pet", "gloves"]);
  const creator = { look: null, cat: "skin", anim: "idle", raf: 0, last: 0, t: 0, actor: null, inited: false };

  function gender() {
    const skin = (creator.look && creator.look.skin) || P.appearance.skin || "";
    return String(skin).startsWith("Female") ? "f" : "m";
  }

  function renderTabs() {
    const box = $("creator-tabs");
    box.replaceChildren(...CATS.map((c) => {
      const b = document.createElement("button");
      b.textContent = c.label;
      b.className = creator.cat === c.id ? "sel" : "";
      b.addEventListener("click", () => { creator.cat = c.id; renderTabs(); renderOptions(); NR.audio.play("ui"); });
      return b;
    }));
  }
  function renderOptions() {
    const box = $("creator-options");
    const g = gender();
    const list = (NR.catalog[creator.cat] || []).filter((o) => o.g === g || o.g === "any");
    const frag = [];
    if (OPTIONAL.has(creator.cat)) {
      const none = document.createElement("button");
      none.className = "opt-card" + (!creator.look[creator.cat] ? " sel" : "");
      none.innerHTML = `<canvas width="64" height="64"></canvas><span>NONE</span>`;
      none.addEventListener("click", () => { creator.look[creator.cat] = ""; applyLook(); renderOptions(); });
      frag.push(none);
    }
    const missing = list.filter((o) => NR.char.missing(creator.cat, o.id)).map((o) => o.path);
    // one batch at a time: re-render once it lands, never in a loop
    if (missing.length && !creator.preloading) {
      creator.preloading = true;
      NR.assets.load(missing).then(() => {
        creator.preloading = false;
        if ($("modal-creator").classList.contains("open")) renderOptions();
      });
    }
    for (const o of list) {
      const owned = NR.economy.owned(creator.cat, o.id);
      const price = NR.economy.price(creator.cat, o.id);
      const card = document.createElement("button");
      card.className = "opt-card" + (creator.look[creator.cat] === o.id ? " sel" : "") + (owned ? " owned" : "");
      card.dataset.id = o.id;
      card.title = NR.evolution?.describe(creator.cat,o.id) || o.name;
      const thumb = NR.char.thumb(creator.cat, o.id, 64);
      card.append(thumb);
      const label = document.createElement("span");
      label.textContent = o.name.length > 13 ? o.name.slice(0, 12) + "…" : o.name;
      card.append(label);
      if (price) {
        const tag = document.createElement("span");
        tag.className = "price" + (price.gems ? " gem" : "");
        tag.textContent = price.gems ? `💎${price.gems}` : `🪙${price.coins}`;
        card.append(tag);
      }
      if (!owned) {
        const lock = document.createElement("span");
        lock.className = "lock"; lock.textContent = "🔒";
        card.append(lock);
      }
      card.addEventListener("click", () => {
        if (!NR.economy.owned(creator.cat, o.id)) {
          if (NR.economy.buy(creator.cat, o.id)) {
            NR.hub.notify(`Unlocked ${o.name}!`);
            NR.audio.play("powerUp");
          } else {
            NR.hub.notify("Not enough coins or gems — fight or visit the shop!");
            NR.audio.play("deny");
            return;
          }
        }
        creator.look[creator.cat] = o.id;
        if (NR.evolution) NR.hub.notify(NR.evolution.describe(creator.cat,o.id));
        applyLook(); renderOptions(); L.refreshCard();
        NR.audio.play("ui");
      });
      frag.push(card);
    }
    box.replaceChildren(...frag);
  }
  function applyLook() {
    creator.actor = NR.char.actor(creator.look, { rate: 1 });
    creator.actor.play(creator.anim);
  }
  function creatorLoop(now) {
    creator.raf = requestAnimationFrame(creatorLoop);
    const dt = Math.min(0.05, (now - creator.last) / 1000 || 0.016);
    creator.last = now;
    creator.t += dt;
    const cv = $("creator-canvas");
    if (!cv || !$("modal-creator").classList.contains("open")) return;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    if (creator.actor) {
      creator.actor.update(dt);
      creator.actor.draw(g, cv.width / 2, cv.height - 22, { scale: 2.3 });
      const pet = creator.look.pet;
      if (pet) {
        const wisp = pet.indexOf("Wisp") >= 0;
        NR.char.drawPet(g, pet, Math.floor(creator.t * 8),
          cv.width / 2 - 96, cv.height - 18 - (wisp ? 56 : 0) + Math.sin(creator.t * 3) * 4,
          wisp ? 2.2 : 2.0, false);
      }
    }
  }
  L.initCreator = function () {
    if (!creator.inited) {
      creator.look = { ...P.appearance };
      renderTabs(); renderOptions();
      $("creator-anims").querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          creator.anim = b.dataset.anim;
          $("creator-anims").querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
          creator.actor && creator.actor.play(creator.anim, creator.anim === "attack", 1);
          NR.audio.play("ui");
        }));
      $("creator-random").addEventListener("click", () => randomize());
      $("creator-reset").addEventListener("click", () => {
        creator.look = { ...DEFAULT_LOOK() };
        applyLook(); renderTabs(); renderOptions(); L.refreshCard(); NR.audio.play("ui");
      });
      $("creator-save").addEventListener("click", () => {
        const pet = creator.look.pet || "";
        P.appearance = { ...creator.look };
        delete P.appearance.pet; // pets live on the profile root
        P.pet = pet;
        NR.saveProfile();
        hero.actor = NR.char.actor(P.appearance, { rate: 1 });
        hero.actor.play("idle");
        L.refreshCard();
        closeModal("modal-creator");
        NR.hub.notify("Hero updated. Your legend continues.");
        NR.audio.play("powerUp");
      });
      creator.inited = true;
      if (!creator.raf) creator.raf = requestAnimationFrame(creatorLoop);
    } else {
      creator.look = { ...P.appearance };
      renderOptions();
    }
  };
  function DEFAULT_LOOK() {
    return {
      skin: "Male Skin1", monster: "", hair: "Male Hair10", ears: "",
      top: "mShirt", bottom: "mPants", underwear: "mUnderwear", shoes: "mBoots",
      gloves: "mGloves", hat: "", mask: "", back: "", weapon: "mWooden Sword", aura: "",
    };
  }
  function randomize() {
    const g = gender();
    const pick = (cat) => {
      const list = (NR.catalog[cat] || []).filter((o) => (o.g === g || o.g === "any") && NR.economy.owned(cat, o.id));
      if (!list.length) return "";
      return list[Math.floor(Math.random() * list.length)].id;
    };
    const look = { ...creator.look };
    look.hair = pick("hair"); look.ears = pick("ears"); look.top = pick("top");
    look.bottom = pick("bottom"); look.underwear = pick("underwear"); look.shoes = pick("shoes");
    look.hat = pick("hat"); look.mask = pick("mask"); look.gloves = pick("gloves");
    look.weapon = pick("weapon"); look.back = pick("back"); look.aura = pick("aura");
    look.pet = Math.random() < 0.4 ? pick("pet") : "";
    if (Math.random() < 0.25) look.hat = "";
    if (Math.random() < 0.3) look.aura = "";
    creator.look = look;
    applyLook(); renderOptions(); NR.audio.play("ui");
  }

  /* ================= shop ================= */
  const SHOP_TABS = [
    { id: "all", label: "ALL" }, { id: "weapon", label: "WEAPONS" }, { id: "top", label: "ARMOR" },
    { id: "bottom", label: "OUTFITS" }, { id: "shoes", label: "FOOTWEAR" }, { id: "hat", label: "HATS" },
    { id: "hair", label: "HAIR" }, { id: "monster", label: "MONSTER SKINS" }, { id: "back", label: "CAPES & PACKS" },
    { id: "aura", label: "AURAS" }, { id: "pet", label: "PETS" }, { id: "gloves", label: "GLOVES" },
    { id: "mask", label: "MASKS" }, { id: "ears", label: "EARS" },
  ];
  let shopTab = "all";
  L.shopRendered = false;
  L.renderShop = function () {
    L.shopRendered = true;
    if (!$("shop-grid")) return;
    // filter chips
    const f = $("shop-filter");
    f.replaceChildren(...SHOP_TABS.map((t) => {
      const b = document.createElement("button");
      b.textContent = t.label;
      b.className = shopTab === t.id ? "sel" : "";
      b.addEventListener("click", () => { shopTab = t.id; L.renderShop(); NR.audio.play("ui"); });
      return b;
    }));
    const items = [];
    for (const cat of Object.keys(NR.catalog)) {
      if (cat === "skin" || cat === "underwear") continue;
      if (shopTab !== "all" && cat !== shopTab) continue;
      for (const o of NR.catalog[cat]) {
        const price = NR.economy.price(cat, o.id);
        if (price) items.push({ cat, o, price });
      }
    }
    const grid = $("shop-grid");
    grid.replaceChildren(...items.map(({ cat, o }) =>
      // shared item card: name · type · numeric VALUE · rarity · price ·
      // equip state · `!` information panel — no ability words in value slots
      NR.vault.itemCard({ cat, id: o.id, name: o.name })
    ));
    L.refreshWallet();
  };
  /* AUTO-RESUME: if a saved wave-boundary checkpoint exists, offer it front
     and center — the player never hunts through menus to get their run back. */
  L.refreshResumeBanner = function () {
    const banner = $("resume-banner");
    if (!banner || !NR.waveResume) return;
    const c = NR.waveResume.get();
    if (!c || c.wave < 1) { banner.hidden = true; return; }
    banner.hidden = false;
    const note = $("resume-run-note");
    if (note) note.textContent = `WAVE ${c.wave} · ${c.character.toUpperCase()} · SCORE ${Math.round(c.score).toLocaleString("en-US")}`;
    const btn = $("resume-run-btn");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => {
        NR.audio.play("uiConfirm");
        NR.loader.wrap("RESUMING SAVED RUN", Promise.resolve(NR.waveResume.resume()));
      });
    }
  };

  /* refresh the lobby hero stage after Vault changes (used by vault.js) */
  L.refreshHeroStage = function () {
    hero.actor = NR.char.actor(NR.vault ? NR.vault.effectiveLook() : P.appearance, { rate: 1 });
    hero.actor.play("idle");
    L.refreshCard();
    const tags = $("hero-tags");
    if (tags) {
      const c = NR.heroes.current();
      tags.innerHTML =
        `<span class="hero-tag">${c.name} · ${c.tag}</span><span class="hero-tag">${titleFor(P.level || 1)}</span>` +
        `<span class="hero-tag">${P.mode === "adventure" ? "CAMPAIGN" : P.mode === "run" ? "SURVIVAL RUN" : "WAVE CLIMB"}</span>`;
    }
  };

  /* ================= level-up banner ================= */
  function checkLevelUp() {
    const n = NR.economy.pendingLevelUps || 0;
    if (n <= 0) return;
    NR.economy.pendingLevelUps = 0;
    const banner = $("levelup-banner");
    if (!banner) return;
    $("levelup-sub").textContent = `LEVEL ${P.level} · ${titleFor(P.level)} · +${n * 150} COINS`;
    banner.classList.remove("show");
    void banner.offsetWidth;
    banner.classList.add("show");
    setTimeout(() => banner.classList.remove("show"), 2500);
  }

  /* ================= init ================= */
  /* ================= COMBAT MANUAL demo strips =================
     The elf-archer packs (idle/walk) + Warrior sheet act out the controls
     live inside the HOW screen. */
  const HOW_STRIPS = [
    { id: "how-idle", path: "idle/sprite sheets/idle.png", fw: 46, fh: 55, frames: 10, cols: 10, fps: 8, scale: 2.1,
      pre: { path: "walk/sprite sheets/from idle.png", fw: 45, fh: 58, frames: 2, cols: 2 } }, // settle-in transition
    { id: "how-walk", path: "walk/sprite sheets/walk.png", fw: 45, fh: 58, frames: 24, cols: 4, fps: 14, scale: 2.0, flip: true },
    { id: "how-combo", path: "GandalfHardcore Warrior.png", fw: 80, fh: 64, frames: 8, cols: 10, fps: 9, scale: 1.9, row: 9 },
  ];
  let howT = 0, howLast = 0;
  function howLoop(now) {
    requestAnimationFrame(howLoop);
    if (!document.getElementById("scr-how").classList.contains("active")) { howLast = now; return; }
    howT += Math.min(0.05, (now - howLast) / 1000 || 0.016); howLast = now;
    for (const s of HOW_STRIPS) {
      const cv = $(s.id); if (!cv) continue;
      const img = NR.assets.get(s.path); if (!img) continue;
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      const preN = s.pre ? s.pre.frames : 0;
      const total = preN + s.frames;
      const f = Math.floor(howT * s.fps) % total;
      let srcImg = img, sx, sy, sfw = s.fw, sfh = s.fh;
      if (f < preN) { // play the transition strip first, then settle into the loop
        const pimg = NR.assets.get(s.pre.path);
        if (pimg) { srcImg = pimg; sfw = s.pre.fw; sfh = s.pre.fh; }
        sx = f * sfw; sy = 0;
      } else {
        const fm = f - preN;
        sx = (fm % s.cols) * sfw;
        sy = s.row !== undefined ? s.row * sfh : Math.floor(fm / s.cols) * sfh;
      }
      g.save();
      if (s.flip) { g.translate(cv.width, 0); g.scale(-1, 1); }
      const dw = sfw * s.scale, dh = sfh * s.scale;
      g.drawImage(srcImg, sx, sy, sfw, sfh, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
      g.restore();
      // ground line under the actor
      g.fillStyle = "rgba(0,255,244,0.5)";
      g.fillRect((cv.width - dw) / 2 - 14, (cv.height + dh) / 2 - 2, dw + 28, 2);
    }
  }

  L.init = function () {
    requestAnimationFrame(howLoop);
    coinFrames = buildCoin();
    // wallet icons
    for (const id of ["coin-icon", "shop-coin"]) {
      const cv = $(id);
      if (cv && coinFrames) {
        const g = cv.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(coinFrames[0], 0, 0, cv.width, cv.height);
      }
    }
    for (const id of ["gem-icon", "shop-gem"]) {
      const cv = $(id);
      if (cv) {
        const g = cv.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(gemCanvas(cv.width), 0, 0);
      }
    }
    // coin spin animation
    let ci = 0;
    setInterval(() => {
      if (!coinFrames) return;
      ci = (ci + 1) % coinFrames.length;
      for (const id of ["coin-icon", "shop-coin"]) {
        const cv = $(id);
        if (cv && document.getElementById("scr-menu").classList.contains("active")) {
          const g = cv.getContext("2d");
          g.clearRect(0, 0, cv.width, cv.height);
          g.imageSmoothingEnabled = false;
          g.drawImage(coinFrames[ci], 0, 0, cv.width, cv.height);
        }
      }
    }, 110);

    // fireflies
    const ff = $("fireflies");
    if (ff) {
      for (let i = 0; i < 22; i++) {
        const s = document.createElement("i");
        s.style.left = Math.random() * 100 + "%";
        s.style.top = 55 + Math.random() * 45 + "%";
        s.style.animationDuration = 5 + Math.random() * 7 + "s";
        s.style.animationDelay = -Math.random() * 8 + "s";
        ff.append(s);
      }
    }

    // nav — PLAY opens the two primary modes directly (no world-map detour)
    if ($("lb-play")) $("lb-play").addEventListener("click", () => { NR.audio.play("ui"); openModal("modal-play"); });
    if ($("lb-map")) $("lb-map").addEventListener("click", () => { NR.audio.play("ui"); openModal("modal-map"); });
    if ($("lb-heroes")) $("lb-heroes").addEventListener("click", () => { NR.audio.play("ui"); NR.vault.openVault("hero"); });
    if ($("lb-online")) $("lb-online").addEventListener("click", () => { NR.audio.play("uiConfirm"); NR.social.openOnline(); });
    if ($("lb-vault")) $("lb-vault").addEventListener("click", () => { NR.audio.play("ui"); NR.vault.openVault(); });
    if ($("lb-shop")) $("lb-shop").addEventListener("click", () => { NR.audio.play("ui"); openModal("modal-shop"); });
    if ($("lb-settings")) $("lb-settings").addEventListener("click", () => { NR.audio.play("ui"); NR.ui.show("set"); });
    if ($("lb-settings-nav")) $("lb-settings-nav").addEventListener("click", () => { NR.audio.play("ui"); NR.ui.show("set"); });
    if ($("lb-profile")) $("lb-profile").addEventListener("click", () => { NR.audio.play("ui"); NR.expeditionUI.showRecords(); });
    document.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => { NR.audio.play("ui"); closeModal(b.dataset.close); }));
    document.querySelectorAll(".lobby-modal").forEach((m) =>
      m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); }));

    /* PLAY modal: exactly two primary modes + secondary routes */
    document.querySelectorAll("#play-modes .pm-card").forEach((b) =>
      b.addEventListener("click", () => {
        NR.audio.play("uiConfirm");
        const mode = b.dataset.pmode;
        closeModal("modal-play");
        if (mode === "climb" || mode === "wavefight") { P.mode = "climb"; NR.saveProfile(); startRun(); }
        else if (mode === "run" || mode === "survive") { P.mode = "run"; NR.saveProfile(); startRun(); }
        else if (mode === "campaign") openModal("modal-deploy");
        else if (mode === "online") NR.social.openOnline();
      }));
    const startRun = () => {
      NR.game.online = false; NR.game.pvp = false;
      NR.loader.wrap("ENTERING " + (P.mode === "run" ? "SURVIVAL RUN" : "WAVE CLIMB"),
        Promise.resolve(NR.game.start()));
    };

    // social hub + vault + codex (hero select / enemy roster) live inside the lobby
    NR.social?.init();
    NR.vault?.init();
    NR.codex?.init();
    L.refreshResumeBanner();

    // deploy controls
    document.querySelectorAll("#deploy-modes .deploy-mode").forEach((b) =>
      b.addEventListener("click", () => { setMode(b.dataset.mode); NR.audio.play("ui"); }));
    document.querySelectorAll("#deploy-difficulty button").forEach((b) =>
      b.addEventListener("click", () => { NR.hub.setDifficulty(b.dataset.difficulty); L.refreshDeploy(); NR.audio.play("ui"); }));
    document.querySelectorAll("#deploy-world button").forEach((b) =>
      b.addEventListener("click", () => { NR.hub.setWorld(b.dataset.world); NR.audio.play("ui"); }));
    if ($("deploy-start")) $("deploy-start").addEventListener("click", () => {
      NR.audio.play("uiConfirm");
      closeModal("modal-deploy");
      NR.loader.wrap("ENTERING WORLD", Promise.resolve(NR.game.start()));
    });

    // hero tags
    const tags = $("hero-tags");
    if (tags) {
      const c = NR.heroes.current();
      tags.innerHTML =
        `<span class="hero-tag">${c.name} · ${c.tag}</span><span class="hero-tag">${titleFor(P.level || 1)}</span>` +
        `<span class="hero-tag">${P.mode === "adventure" ? "CAMPAIGN · WORLD " + (P.chapter + 1) : P.mode === "survive" ? "SURVIVE" : "WAVE FIGHT"}</span>`;
    }

    L.refreshCard();
    L.renderEvents();
    L.initHero();
    setInterval(tickEvents, 1000);
    setTimeout(checkLevelUp, 600);
  };
})();
