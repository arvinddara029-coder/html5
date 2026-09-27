/* ============ VAULT — everything you own, in one lobby screen ============
   Tabs: ITEMS (Hero Forge gear: skin, hair, mask, armor, weapon…), PETS,
   COMPANIONS (animated companions), SUMMONS (monsters you can call into a
   fight with T), SPELLS (keys 1–0) and RELICS. Every entry shows stat bars,
   a price or unlock level, BUY → EQUIP, and a "!" how-to-use popup. */
(function () {
  const P = NR.profile, EC = NR.economy, EV = NR.evolution, IT = NR.items, C = NR.superContent, S = NR.superRuntime;
  const V = (NR.vault = {});
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const KEY = "nr_vault_v1";
  let data = {};
  try { data = JSON.parse(NR.store.getItem(KEY) || "{}") || {}; } catch (_) { data = {}; }
  if (typeof data.summon !== "string") data.summon = "";
  V.save = () => NR.store.setItem(KEY, JSON.stringify(data));
  V.summon = () => (data.summon && S && S.actor(data.summon) ? data.summon : "");
  V.setSummon = (id) => { data.summon = id || ""; V.save(); NR.abilities?.syncButtons?.(); };

  /* ---------------- monsters & companions: price, stats ---------------- */
  const hash = (s) => EV.hash(s);
  const actors = (role) => (C ? C.actors.filter((a) => (Array.isArray(role) ? role.includes(a.role) : a.role === role)) : []);
  V.summons = () => actors(["enemy", "guardian"]);
  V.companions = () => actors("pet");
  V.summonStats = function (a) {
    const h = hash(a.id), g = a.role === "guardian";
    return { dmg: g ? 30 : 16 + (h % 12), life: g ? 16 : 13, flying: /fly|crow|ghost|bird|skull|bee|bat/.test(a.name.toLowerCase()), guardian: g };
  };
  V.priceOf = function (kind, a) {
    const h = hash(kind + a.id);
    if (kind === "summon") {
      if (a.role === "guardian") return { gems: 20 + (h % 21) };
      return { coins: 400 + (h % 9) * 150 };
    }
    return h % 3 === 0 ? { gems: 15 + (h % 16) } : { coins: 600 + (h % 7) * 150 };
  };
  V.unlockLevel = (kind, a) => (kind === "summon" && a.role !== "guardian" && hash("free" + a.id) % 4 === 0 ? 3 + (hash(a.id) % 10) : 0);
  V.owns = function (kind, a) {
    if (P.owned && P.owned[kind + ":" + a.id]) return true;
    const lv = V.unlockLevel(kind, a);
    return !!(lv && (P.level || 1) >= lv);
  };
  V.buy = function (kind, a) {
    if (V.owns(kind, a)) return true;
    const pr = V.priceOf(kind, a);
    if (!EC.spend(pr.coins || 0, pr.gems || 0)) return false;
    P.owned = P.owned || {};
    P.owned[kind + ":" + a.id] = 1;
    NR.saveProfile();
    return true;
  };

  /* ---------------- generic info popup ---------------- */
  let infoBox = null;
  V.info = function (title, sub, bars, lines, draw) {
    if (!infoBox) {
      infoBox = mk("div", "item-info-modal"); infoBox.id = "vault-info";
      infoBox.addEventListener("click", (e) => { if (e.target === infoBox) infoBox.classList.remove("open"); });
      document.body.append(infoBox);
    }
    const panel = mk("div", "wood-panel item-info-panel");
    const close = mk("button", "lm-close", "✕"); close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => infoBox.classList.remove("open"));
    const head = mk("div", "ii-head");
    if (draw) head.append(draw);
    const t = mk("div"); t.append(mk("h3", "", title), mk("small", "", sub)); head.append(t);
    panel.append(close, head);
    if (bars) panel.append(bars);
    for (const l of lines) panel.append(mk("p", "ii-line", l));
    infoBox.replaceChildren(panel);
    infoBox.classList.add("open");
  };
  const infoBtn = (fn) => {
    const b = mk("span", "info-i", "!"); b.setAttribute("role", "button"); b.tabIndex = 0; b.title = "How to use";
    b.setAttribute("aria-label", "How to use");
    const open = (e) => { e.preventDefault(); e.stopPropagation(); fn(); NR.audio?.play?.("ui"); };
    b.addEventListener("click", open); b.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
    return b;
  };
  function actorCanvas(a, w, h) {
    const cv = mk("canvas", "v-actor"); cv.width = w; cv.height = h;
    cv.dataset.actor = a.id;
    if (S) {
      const clip = S.clip(a, "idle");
      S.preloadClip(clip);
      NR.assets.load([...new Set(clip.frames.map((f) => f.path))]).then(() => {
        const g = cv.getContext && cv.getContext("2d");
        if (g) { g.clearRect(0, 0, w, h); S.drawActor(g, a, "idle", 0, w / 2, h - 6, h * 0.8, 1, 1); }
      });
    }
    return cv;
  }
  const priceText = (pr) => (pr.gems ? `💎 ${pr.gems}` : `🪙 ${pr.coins.toLocaleString("en-US")}`);

  /* ---------------- modal ---------------- */
  const TABS = [
    { id: "items", label: "ITEMS" }, { id: "pets", label: "PETS" }, { id: "companions", label: "COMPANIONS" },
    { id: "summons", label: "SUMMONS" }, { id: "spells", label: "SPELLS" }, { id: "relics", label: "RELICS" },
  ];
  const ITEM_CATS = [
    ["skin", "SKIN"], ["hair", "HAIR"], ["top", "ARMOR"], ["bottom", "OUTFIT"], ["shoes", "FOOTWEAR"], ["gloves", "GLOVES"],
    ["hat", "HAT"], ["mask", "MASK"], ["weapon", "WEAPON"], ["back", "BACK"], ["aura", "AURA"], ["ears", "EARS"], ["monster", "MONSTER"],
  ];
  const state = { tab: "items", cat: "weapon", page: 0 };
  function build() {
    if ($("modal-vault")) return $("modal-vault");
    const host = $("lobby") || document.body;
    const m = mk("div", "lobby-modal wide vault-modal"); m.id = "modal-vault";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Vault");
    m.innerHTML = `<div class="wood-panel"><div class="lm-head"><h2>VAULT</h2>
      <div class="wallet" style="margin-right:10px"><div class="wallet-chip"><b>🪙 <span id="vault-coins">0</span></b></div><div class="wallet-chip gems"><b>💎 <span id="vault-gems">0</span></b></div></div>
      <button class="lm-close" aria-label="Close" id="vault-close">✕</button></div>
      <div class="vault-tabs" id="vault-tabs"></div>
      <div class="vault-layout"><aside class="vault-side" id="vault-side"><canvas id="vault-hero" width="200" height="230"></canvas><div id="vault-totals"></div></aside>
      <div class="vault-main"><div class="vault-sub" id="vault-sub"></div><div class="shop-grid vault-grid" id="vault-grid"></div><div class="vault-pager" id="vault-pager"></div></div></div>
      <p class="deploy-note" id="vault-note">BUY → EQUIP · TAP ! FOR HOW TO USE · WEAK ITEMS BECOME FREE AS YOU LEVEL UP</p></div>`;
    host.append(m);
    m.addEventListener("click", (e) => { if (e.target === m) V.close(); });
    const close = $("vault-close");
    if (close) close.addEventListener("click", () => { NR.audio?.play?.("ui"); V.close(); });
    return m;
  }
  V.close = function () { const m = $("modal-vault"); if (m) m.classList.remove("open"); };
  V.open = function (tab) {
    build();
    if (tab) state.tab = tab;
    if (NR.lobby && NR.lobby.openModal) NR.lobby.openModal("modal-vault");
    else $("modal-vault").classList.add("open");
    V.render();
    startLoop();
  };
  function wallet() {
    if ($("vault-coins")) $("vault-coins").textContent = (P.coins || 0).toLocaleString("en-US");
    if ($("vault-gems")) $("vault-gems").textContent = (P.gems || 0).toLocaleString("en-US");
    NR.lobby?.refreshWallet?.();
  }
  V.render = function () {
    if (!$("vault-grid")) return;
    const tabs = $("vault-tabs");
    tabs.replaceChildren(...TABS.map((t) => {
      const b = mk("button", state.tab === t.id ? "sel" : "", t.label);
      b.dataset.vtab = t.id;
      b.addEventListener("click", () => { state.tab = t.id; state.page = 0; NR.audio?.play?.("ui"); V.render(); });
      return b;
    }));
    const sub = $("vault-sub"), grid = $("vault-grid"), pager = $("vault-pager");
    sub.replaceChildren(); pager.replaceChildren();
    const rerender = () => { wallet(); V.render(); };
    let cards = [];
    if (state.tab === "items") {
      sub.append(...ITEM_CATS.map(([id, label]) => {
        const b = mk("button", state.cat === id ? "sel" : "", label);
        b.addEventListener("click", () => { state.cat = id; state.page = 0; NR.audio?.play?.("ui"); V.render(); });
        return b;
      }));
      const g = String(P.appearance.skin || "").startsWith("Female") ? "f" : "m";
      const list = (NR.catalog[state.cat] || []).filter((o) => state.cat === "skin" || o.g === g || o.g === "any");
      if (["monster", "ears", "hat", "mask", "back", "aura", "gloves"].includes(state.cat)) {
        const none = mk("div", "shop-card none-card");
        none.append(mk("h5", "", "NONE"), mk("span", "sc-cat", "REMOVE " + state.cat.toUpperCase()));
        const b = mk("button", "buy equip", P.appearance[state.cat] ? "UNEQUIP" : "EQUIPPED ✓");
        b.disabled = !P.appearance[state.cat];
        b.addEventListener("click", () => { P.appearance = { ...P.appearance, [state.cat]: "" }; NR.saveProfile(); NR.lobby?.refreshCard?.(); NR.lobby?.refreshHeroLook?.(); rerender(); });
        none.append(b); cards.push(none);
      }
      cards.push(...list.map((o) => IT.shopCard(state.cat, o, rerender)));
    } else if (state.tab === "pets") {
      const none = mk("div", "shop-card none-card");
      none.append(mk("h5", "", "NO PET"), mk("span", "sc-cat", "PET"));
      const b = mk("button", "buy equip", P.pet ? "UNEQUIP" : "EQUIPPED ✓"); b.disabled = !P.pet;
      b.addEventListener("click", () => { P.pet = ""; NR.saveProfile(); rerender(); });
      none.append(b); cards.push(none);
      cards.push(...(NR.catalog.pet || []).map((o) => IT.shopCard("pet", o, rerender)));
    } else if (state.tab === "companions") {
      cards = V.companions().map((a) => actorCard("companion", a, rerender));
    } else if (state.tab === "summons") {
      const all = V.summons(), per = 12, pages = Math.max(1, Math.ceil(all.length / per));
      state.page = Math.min(state.page, pages - 1);
      cards = all.slice(state.page * per, state.page * per + per).map((a) => actorCard("summon", a, rerender));
      const prev = mk("button", "ghost-btn", "‹ PREV"), next = mk("button", "ghost-btn", "NEXT ›");
      prev.disabled = state.page === 0; next.disabled = state.page >= pages - 1;
      prev.addEventListener("click", () => { state.page--; V.render(); });
      next.addEventListener("click", () => { state.page++; V.render(); });
      pager.append(prev, mk("span", "", `${state.page + 1} / ${pages} · ${all.length} MONSTERS · SUMMON WITH T`), next);
    } else if (state.tab === "spells") {
      cards = EV.spells.map((s) => spellCard(s, rerender));
      pager.append(mk("span", "", `${EV.slots.length} / 10 SLOTS · KEYS 1–9, 0 · SPELLS USE ENERGY`));
    } else if (state.tab === "relics") {
      cards = (C ? C.relics : []).map((r) => relicCard(r, rerender));
    }
    grid.replaceChildren(...cards);
    const tot = $("vault-totals");
    if (tot) tot.replaceChildren(mk("div", "lm-label", "EQUIPPED BONUS"), IT.totalBars(P.appearance, P.pet));
    wallet();
  };

  function actorCard(kind, a, rerender) {
    const card = mk("div", "shop-card actor-card");
    card.dataset.id = a.id;
    card.append(actorCanvas(a, 120, 96));
    const equippedNow = kind === "summon" ? data.summon === a.id : EV.companion === a.id;
    const own = V.owns(kind, a), pr = V.priceOf(kind, a), lv = V.unlockLevel(kind, a);
    card.append(mk("h5", "", a.name), mk("span", "sc-cat", kind === "summon" ? (a.role === "guardian" ? "GUARDIAN SUMMON" : "MONSTER SUMMON") : "COMPANION"));
    let bars;
    if (kind === "summon") {
      const s = V.summonStats(a);
      bars = mk("div", "hs-stats item-bars");
      bars.append(IT.bar("DAMAGE", s.dmg, 30, "+" + s.dmg), IT.bar("DURATION", s.life, 16, s.life + "s"), IT.bar("COOLDOWN", 20, 38, NR.abilities ? NR.abilities.summonCd + "s" : "38s"));
      if (s.flying) bars.append(mk("span", "unlock-note", "FLYING"));
    } else bars = IT.bars("pet", a.id);
    card.append(bars);
    const how = kind === "summon"
      ? ["HOW TO USE: buy it, press EQUIP, then in a fight press T (or the ☠ SUMMON button).", `${a.name} fights next to you for ${V.summonStats(a).life}s and attacks the closest enemy. Cooldown ${NR.abilities ? NR.abilities.summonCd : 38}s.`, "Summons get stronger with your hero level and damage bonuses."]
      : ["HOW TO USE: buy it, press EQUIP. It follows your hero in every run.", "Companions help on their own every few seconds (heal, energy or attack) and add the stat bonus shown."];
    card.append(infoBtn(() => V.info(a.name, kind.toUpperCase(), bars.cloneNode(true), how, actorCanvas(a, 90, 76))));
    if (!own && lv) card.append(mk("span", "unlock-note", `FREE AT LV ${lv}`));
    const btn = mk("button", "buy");
    if (!own) {
      const afford = (P.coins || 0) >= (pr.coins || 0) && (P.gems || 0) >= (pr.gems || 0);
      btn.className = "buy" + (afford ? "" : " cant"); btn.textContent = priceText(pr);
      btn.addEventListener("click", () => {
        if (V.buy(kind, a)) { NR.hub?.notify?.(`${a.name} unlocked! Press EQUIP.`); NR.audio?.play?.("powerUp"); rerender(); }
        else { NR.hub?.notify?.("Not enough coins or gems."); NR.audio?.play?.("deny"); }
      });
    } else if (equippedNow) {
      btn.className = "buy equip"; btn.textContent = "UNEQUIP";
      btn.addEventListener("click", () => { if (kind === "summon") V.setSummon(""); else { EV.companion = ""; EV.save(); } rerender(); });
    } else {
      btn.className = "buy equip"; btn.textContent = "EQUIP";
      btn.addEventListener("click", () => {
        if (kind === "summon") V.setSummon(a.id); else { EV.companion = a.id; EV.save(); }
        NR.hub?.notify?.(`${a.name} equipped`); NR.audio?.play?.("powerUp"); rerender();
      });
    }
    if (equippedNow) card.classList.add("owned", "equipped-card");
    card.append(btn);
    return card;
  }
  function spellCard(s, rerender) {
    const card = mk("div", "shop-card spell-card");
    card.dataset.id = s.id;
    const locked = (P.level || 1) < s.level, slot = EV.slots.indexOf(s.id);
    card.append(mk("div", "spell-ico", "✦"), mk("h5", "", s.name), mk("span", "sc-cat", locked ? "UNLOCKS AT LEVEL " + s.level : slot >= 0 ? "SLOT " + (slot === 9 ? 0 : slot + 1) : "SPELL"));
    const cost = EV.spellCost ? EV.spellCost(s) : s.cost, cd = EV.spellCooldown ? EV.spellCooldown(s) : s.cd;
    const pw = 1 + ((P.level || 1) - 1) * 0.05;
    const bars = mk("div", "hs-stats item-bars");
    bars.append(IT.bar("POWER", pw, 3, "+" + Math.round((pw - 1) * 100) + "%"), IT.bar("ENERGY", cost, 100, String(Math.round(cost))), IT.bar("COOLDOWN", cd, 30, cd.toFixed(1) + "s"));
    card.append(bars);
    card.append(infoBtn(() => V.info(s.name, "SPELL", bars.cloneNode(true), [
      "HOW TO USE: EQUIP it into one of 10 slots. In a fight press its number key (1–9, 0) or tap its button on the left.",
      s.desc, `Costs ${Math.round(cost)} energy · ${cd.toFixed(1)}s cooldown. Strikes charge your energy.`, "Spell strength rises 5% per hero level."])));
    const btn = mk("button", "buy equip", locked ? "🔒 LV " + s.level : slot >= 0 ? "REMOVE" : "EQUIP");
    btn.disabled = locked || (slot < 0 && EV.slots.length >= 10);
    btn.addEventListener("click", () => { EV.equip(s.id); NR.audio?.play?.("ui"); rerender(); });
    if (slot >= 0) card.classList.add("owned");
    card.append(btn);
    return card;
  }
  function relicCard(r, rerender) {
    const card = mk("div", "shop-card relic-card");
    const img = mk("img", "relic-img"); img.alt = r.name; img.loading = "lazy";
    img.src = "assets/" + r.path.split("/").map(encodeURIComponent).join("/");
    card.append(img, mk("h5", "", r.name), mk("span", "sc-cat", "RELIC"));
    const bars = IT.bars("weapon", r.id);
    card.append(bars);
    card.append(infoBtn(() => V.info(r.name, "RELIC", bars.cloneNode(true), ["HOW TO USE: EQUIP it. The relic floats beside your hero and adds its weapon magic to your strikes.", EV.describe("weapon", r.id)])));
    const locked = (P.level || 1) < r.level, on = EV.relic === r.id;
    const btn = mk("button", "buy equip", locked ? "🔒 LV " + r.level : on ? "UNEQUIP" : "EQUIP");
    btn.disabled = locked;
    btn.addEventListener("click", () => { EV.relic = on ? "" : r.id; EV.save(); NR.audio?.play?.("ui"); rerender(); });
    if (on) card.classList.add("owned");
    card.append(btn);
    return card;
  }

  /* hero preview in the side panel */
  let raf = 0, actor = null, lookKey = "", clock = 0, last = 0;
  function loop(now) {
    const m = $("modal-vault");
    if (!m || !m.classList.contains("open")) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; clock += dt;
    const cv = $("vault-hero");
    if (!cv || !cv.getContext) return;
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    const key = JSON.stringify(P.appearance) + P.pet;
    if (key !== lookKey || !actor) { lookKey = key; actor = NR.char.actor(P.appearance, { rate: 1 }); actor.play("idle"); }
    const h = NR.heroes && NR.heroes.current();
    if (h && h.body.kind !== "forge" && NR.heroes.draw(g, h, { x: cv.width / 2, y: cv.height - 12, facing: 1, t: clock, anim: "idle" }, { scale: 1.2 })) return;
    actor.update(dt);
    actor.draw(g, cv.width / 2, cv.height - 12, { scale: 1.7 });
    if (P.pet) NR.char.drawPet(g, P.pet, Math.floor(clock * 8), cv.width / 2 - 70, cv.height - 10, 1.6, false);
  }
  function startLoop() { if (!raf && typeof requestAnimationFrame === "function") { last = 0; raf = requestAnimationFrame(loop); } }

  /* lobby button */
  const btn = $("lb-vault");
  if (btn) btn.addEventListener("click", () => { NR.audio?.play?.("ui"); V.open(); });
  // in-game ✦ button still opens the quick spell vault dialog
})();
