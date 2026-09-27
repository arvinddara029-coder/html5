/* ============ ITEMS — prices, power, stat bars, EQUIP and "!" info ============
   · Every item has a price. Stronger items cost more: an item's power rank is
     derived from its price tier (listed prices) or from its stable hash (all
     other items, whose price is then computed from that rank).
   · Weak items unlock for FREE when the player reaches a certain level.
   · Item stats are about twice as strong as before and are shown as bars with
     "+X%" (the same look as the HEROES screen), never as a line of text.
   · After buying, the shop shows EQUIP; every card has a "!" how-to-use popup. */
(function () {
  const EC = NR.economy, EV = NR.evolution, P = NR.profile;
  const IT = (NR.items = {});
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };

  /* ---------------- traits (value per power rank; ×2 vs the old table) ---------------- */
  const TRAITS = [
    { name: "Ember", field: "dmgMul", base: 0.05, label: "STRIKE DAMAGE", pct: true },
    { name: "Glacier", field: "guardMul", base: 0.09, label: "HIT PROTECTION", pct: true },
    { name: "Storm", field: "energyMul", base: 0.08, label: "ENERGY GAIN", pct: true },
    { name: "Vampiric", field: "lifesteal", base: 0.008, label: "LIFE STEAL", pct: true },
    { name: "Gale", field: "speedMul", base: 0.024, label: "MOVE SPEED", pct: true },
    { name: "Oracle", field: "critCh", base: 0.012, label: "CRIT CHANCE", pct: true },
    { name: "Titan", field: "maxHp", base: 4, label: "MAX HEALTH", pct: false },
    { name: "Tempest", field: "stormMul", base: 0.07, label: "STORM DAMAGE", pct: true },
  ];
  IT.TRAITS = TRAITS;
  const MAX_RANK = 6, SECOND = 0.35;
  const hash = (s) => EV.hash(s);
  const catalogItem = (cat, id) => (NR.catalog[cat] || []).find((o) => o.id === id);

  /* the starting look and each category's basic pieces stay free forever */
  const FREE = new Set([
    "skin:Male Skin1", "skin:Female Skin1", "hair:Male Hair10", "top:mShirt", "bottom:mPants",
    "underwear:mUnderwear", "shoes:mBoots", "gloves:mGloves", "weapon:mWooden Sword",
  ]);
  for (const cat of Object.keys(NR.catalog)) {
    const list = NR.catalog[cat];
    // first male + first female piece of every category
    const m = list.find((o) => o.g === "m" || o.g === "any"), f = list.find((o) => o.g === "f");
    if (m && cat !== "pet" && cat !== "monster") FREE.add(cat + ":" + m.id);
    if (f && cat !== "pet" && cat !== "monster") FREE.add(cat + ":" + f.id);
    if (cat === "pet" && list[0]) FREE.add("pet:" + list[0].id);
  }
  IT.isFree = (cat, id) => !id || FREE.has(cat + ":" + id);

  /* ---------------- power rank 1..6 ---------------- */
  const listedPrice = EC.price; // the original hand-written price table
  IT.rank = function (cat, id) {
    if (!id || IT.isFree(cat, id)) return 1;
    const lp = listedPrice(cat, id);
    if (lp) {
      if (lp.gems) return Math.min(MAX_RANK, 5 + Math.max(0, Math.min(1, (lp.gems - 10) / 35)));
      return 1 + 4 * Math.max(0, Math.min(1, ((lp.coins || 100) - 100) / 1400));
    }
    const h = hash(cat + ":" + id);
    return 1 + ((h >>> 4) % 5) + ((h >>> 12) % 101) / 100;
  };

  /* ---------------- price: stronger → more expensive ---------------- */
  const round50 = (n) => Math.max(50, Math.round(n / 50) * 50);
  IT.price = function (cat, id) {
    if (!id || IT.isFree(cat, id) || !catalogItem(cat, id)) return listedPrice(cat, id);
    const lp = listedPrice(cat, id);
    if (lp) return lp;
    const r = IT.rank(cat, id);
    if (r >= 5.55) return { gems: 12 + Math.round((r - 5.55) * 45) };
    return { coins: round50(100 + (r - 1) * 250) };
  };
  /* weak coin items become free at a level (2..13) */
  IT.unlockLevel = function (cat, id) {
    const pr = IT.price(cat, id);
    if (!pr || pr.gems || IT.rank(cat, id) >= 2.6) return 0;
    return 2 + (hash("lv:" + cat + ":" + id) % 12);
  };
  EC.price = function (cat, id) { return IT.price(cat, id); };
  EC.owned = function (cat, id) {
    if (!id || IT.isFree(cat, id)) return true;
    if (!EC.price(cat, id)) return true;
    if (P.owned && P.owned[cat + ":" + id]) return true;
    const lv = IT.unlockLevel(cat, id);
    return !!(lv && (P.level || 1) >= lv);
  };
  // what you already wear stays yours (older saves had these for free)
  P.owned = P.owned && typeof P.owned === "object" ? P.owned : {};
  for (const [cat, id] of Object.entries(P.appearance || {})) if (id && catalogItem(cat, id)) P.owned[cat + ":" + id] = 1;
  if (P.pet && catalogItem("pet", P.pet)) P.owned["pet:" + P.pet] = 1;

  /* ---------------- stats (replaces the old per-item text) ---------------- */
  IT.stats = function (cat, id) {
    const r = IT.rank(cat, id);
    const t1 = TRAITS[hash(cat + ":" + id) % TRAITS.length];
    const t2 = TRAITS[hash(cat + ":" + id + "::secondary") % TRAITS.length];
    return [
      { ...t1, value: t1.base * r },
      { ...t2, value: t2.base * r * SECOND, secondary: true },
    ];
  };
  const fmtStat = (s) => (s.pct ? "+" + (s.value * 100).toFixed(s.value < 0.1 ? 1 : 0) + "%" : "+" + Math.round(s.value));
  IT.fmt = fmtStat;
  // E.item keeps its old shape so evolution.js / item-powers.js apply the new values
  EV.item = function (cat, id) {
    const [a, b] = IT.stats(cat, id);
    return {
      name: a.name + " " + (cat === "weapon" ? "Enchantment" : cat === "pet" ? "Companion" : "Resonance"),
      field: a.field, value: a.value, rank: IT.rank(cat, id),
      second: { field: b.field, value: b.value },
      desc: `${a.label} ${fmtStat(a)} · ${b.label} ${fmtStat(b)}`,
    };
  };

  /* bars: full bar = the strongest possible roll of that stat */
  IT.bar = function (label, value, max, text, cls) {
    const row = mk("div", "hs-stat" + (cls ? " " + cls : ""));
    const bar = mk("div", "hs-bar"), fill = mk("i");
    fill.style.width = Math.max(4, Math.min(100, (value / max) * 100)) + "%";
    bar.append(fill);
    const em = mk("em", "up", text);
    row.append(mk("span", "", label), bar, em);
    return row;
  };
  IT.bars = function (cat, id) {
    const box = mk("div", "hs-stats item-bars");
    for (const s of IT.stats(cat, id)) box.append(IT.bar(s.label, s.value, s.base * MAX_RANK * (s.secondary ? SECOND : 1), fmtStat(s)));
    const pw = IT.rank(cat, id);
    box.append(IT.bar("POWER", pw, MAX_RANK, "★" + pw.toFixed(1), "power"));
    return box;
  };
  /* total bonus of a whole look (creator / vault stat panel) */
  IT.totals = function (look, pet) {
    const sum = {};
    for (const [cat, id] of Object.entries({ ...look, pet: pet !== undefined ? pet : look.pet })) {
      if (!id || !catalogItem(cat, id)) continue;
      for (const s of IT.stats(cat, id)) sum[s.field] = (sum[s.field] || 0) + s.value;
    }
    return sum;
  };
  IT.totalBars = function (look, pet) {
    const sum = IT.totals(look, pet), box = mk("div", "hs-stats item-bars total");
    for (const t of TRAITS) {
      const v = sum[t.field] || 0;
      box.append(IT.bar(t.label, v, t.base * MAX_RANK * 3, fmtStat({ ...t, value: v }), v ? "" : "zero"));
    }
    return box;
  };

  /* ---------------- how to use ("!" popup) ---------------- */
  const CAT_NAME = { skin: "Body", monster: "Monster skin", hair: "Hair", ears: "Ears", top: "Armor / top", bottom: "Outfit", underwear: "Base layer", shoes: "Footwear", hat: "Hat", mask: "Mask", gloves: "Gloves", weapon: "Weapon", back: "Cape / pack", aura: "Aura", pet: "Pet" };
  IT.howTo = function (cat, id) {
    const sig = EV.signature ? EV.signature(cat, id) : null;
    const lines = [];
    lines.push(`HOW TO USE: buy it (or unlock it by level), then press EQUIP in the Shop or pick it in VAULT → ITEMS / Hero Forge.`);
    if (cat === "weapon") lines.push(`Your katana strikes gain the stats below. On hit it can trigger ${sig ? sig.name : "its enchantment"} automatically (${sig ? sig.cooldown.toFixed(1) + "s cooldown" : ""}).`);
    else if (cat === "aura") lines.push(`Glows around your hero and fires ${sig ? sig.name : "its power"} on its own every few seconds (${sig ? sig.range + "px range" : ""}).`);
    else if (cat === "pet") lines.push(`Follows you into every run and helps on its own: ${(EV.describe(cat, id).split("·").pop() || "").trim() || "heals, restores energy or attacks"}.`);
    else lines.push(`Passive: the bonus is always active while it is equipped. Nothing to press.`);
    lines.push("Stats work with every hero. The look is shown on the Forged hero (Kaito).");
    const lv = IT.unlockLevel(cat, id);
    if (lv) lines.push(`FREE when you reach LEVEL ${lv}.`);
    return lines;
  };
  let infoBox = null;
  IT.info = function (cat, id) {
    const o = catalogItem(cat, id);
    if (!o) return;
    if (!infoBox) {
      infoBox = mk("div", "item-info-modal");
      infoBox.id = "item-info";
      infoBox.setAttribute("role", "dialog");
      infoBox.addEventListener("click", (e) => { if (e.target === infoBox) infoBox.classList.remove("open"); });
      document.body.append(infoBox);
    }
    const panel = mk("div", "wood-panel item-info-panel");
    const close = mk("button", "lm-close", "✕");
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => infoBox.classList.remove("open"));
    const head = mk("div", "ii-head");
    try { head.append(NR.char.thumb(cat, id, 76)); } catch (_) {}
    const t = mk("div");
    t.append(mk("h3", "", o.name), mk("small", "", (CAT_NAME[cat] || cat).toUpperCase()));
    head.append(t);
    const price = EC.price(cat, id), have = EC.owned(cat, id);
    const tag = mk("p", "ii-price", have ? "✔ OWNED" : price ? (price.gems ? `💎 ${price.gems} GEMS` : `🪙 ${price.coins} COINS`) : "FREE");
    panel.append(close, head, IT.bars(cat, id), tag);
    for (const line of IT.howTo(cat, id)) panel.append(mk("p", "ii-line", line));
    infoBox.replaceChildren(panel);
    infoBox.classList.add("open");
    NR.audio?.play?.("ui");
  };
  IT.infoButton = function (cat, id) {
    const b = mk("span", "info-i", "!");
    b.setAttribute("role", "button");
    b.tabIndex = 0;
    b.title = "How to use";
    b.setAttribute("aria-label", "How to use this item");
    const open = (e) => { e.preventDefault(); e.stopPropagation(); IT.info(cat, id); };
    b.addEventListener("click", open);
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
    return b;
  };

  /* ---------------- equip ---------------- */
  const skinGender = () => (String(P.appearance.skin || "").startsWith("Female") ? "f" : "m");
  IT.equipped = (cat, id) => (cat === "pet" ? P.pet === id : P.appearance[cat] === id);
  IT.equip = function (cat, id) {
    const o = catalogItem(cat, id);
    if (!o || !EC.owned(cat, id)) return false;
    if (cat === "pet") P.pet = id;
    else {
      if (o.g && o.g !== "any" && o.g !== skinGender() && cat !== "skin") {
        NR.hub?.notify?.(`${o.name} is made for ${o.g === "f" ? "female" : "male"} heroes — switch the body in VAULT → ITEMS → SKIN first.`);
        return false;
      }
      P.appearance = { ...P.appearance, [cat]: id };
    }
    NR.saveProfile();
    NR.lobby?.refreshCard?.();
    NR.lobby?.refreshHeroLook?.();
    NR.hub?.notify?.(`${o.name} equipped`);
    NR.audio?.play?.("powerUp");
    return true;
  };

  /* ---------------- creator (Hero Forge) decoration ---------------- */
  const L = NR.lobby;
  if (L) {
    L.decorateOption = function (card, cat, o) {
      card.title = o.name;
      card.append(IT.infoButton(cat, o.id));
      const lv = !EC.owned(cat, o.id) && IT.unlockLevel(cat, o.id);
      if (lv) { const t = mk("span", "unlock-lv", "LV " + lv); card.append(t); }
      const s = IT.stats(cat, o.id)[0];
      const mini = mk("span", "mini-stat", `${s.label.split(" ")[0]} ${fmtStat(s)}`);
      card.append(mini);
    };
    L.afterOptions = function (look) {
      const stage = $("creator-stage");
      if (!stage) return;
      let box = $("creator-stats");
      if (!box) { box = mk("div", "creator-stats"); box.id = "creator-stats"; stage.append(box); }
      box.replaceChildren(mk("div", "lm-label", "LOOK BONUS"), IT.totalBars(look));
    };
  }

  /* ---------------- shop ---------------- */
  const SHOP_TABS = [
    { id: "all", label: "ALL" }, { id: "weapon", label: "WEAPONS" }, { id: "top", label: "ARMOR" },
    { id: "bottom", label: "OUTFITS" }, { id: "shoes", label: "FOOTWEAR" }, { id: "hat", label: "HATS" },
    { id: "hair", label: "HAIR" }, { id: "monster", label: "MONSTER SKINS" }, { id: "back", label: "CAPES & PACKS" },
    { id: "aura", label: "AURAS" }, { id: "pet", label: "PETS" }, { id: "gloves", label: "GLOVES" },
    { id: "mask", label: "MASKS" }, { id: "ears", label: "EARS" }, { id: "skin", label: "BODIES" },
  ];
  let shopTab = "all";
  IT.shopCard = function (cat, o, onChange) {
    const price = EC.price(cat, o.id), own = EC.owned(cat, o.id);
    const afford = price && (P.coins || 0) >= (price.coins || 0) && (P.gems || 0) >= (price.gems || 0);
    const card = mk("div", "shop-card" + (own ? " owned" : ""));
    card.dataset.id = o.id; card.dataset.cat = cat;
    try { card.append(NR.char.thumb(cat, o.id, 76)); } catch (_) {}
    card.append(IT.infoButton(cat, o.id));
    card.append(mk("h5", "", o.name), mk("span", "sc-cat", (CAT_NAME[cat] || cat).toUpperCase()));
    card.append(IT.bars(cat, o.id));
    const lv = !own && IT.unlockLevel(cat, o.id);
    if (lv) card.append(mk("span", "unlock-note", `FREE AT LV ${lv}`));
    const btn = mk("button", "buy");
    if (own) {
      if (IT.equipped(cat, o.id)) { btn.textContent = "EQUIPPED ✓"; btn.className = "buy owned equipped"; btn.disabled = true; }
      else {
        btn.textContent = "EQUIP"; btn.className = "buy equip";
        btn.addEventListener("click", () => { if (IT.equip(cat, o.id)) onChange && onChange(); });
      }
    } else {
      btn.className = "buy" + (afford ? "" : " cant");
      btn.textContent = price.gems ? `💎 ${price.gems}` : `🪙 ${price.coins.toLocaleString("en-US")}`;
      btn.addEventListener("click", () => {
        if (EC.buy(cat, o.id)) {
          NR.hub?.notify?.(`Purchased ${o.name}! Press EQUIP to wear it.`);
          NR.audio?.play?.("powerUp");
          L && L.refreshCard && L.refreshCard();
          onChange && onChange();
        } else {
          NR.hub?.notify?.("Not enough coins or gems — fight, level up or watch an ad for coins.");
          NR.audio?.play?.("deny");
        }
      });
    }
    card.append(btn);
    return card;
  };
  if (L) {
    L.renderShop = function () {
      L.shopRendered = true;
      if (!$("shop-grid")) return;
      const f = $("shop-filter");
      f.replaceChildren(...SHOP_TABS.map((t) => {
        const b = mk("button", shopTab === t.id ? "sel" : "", t.label);
        b.addEventListener("click", () => { shopTab = t.id; L.renderShop(); NR.audio.play("ui"); });
        return b;
      }));
      const items = [];
      for (const cat of Object.keys(NR.catalog)) {
        if (cat === "underwear") continue;
        if (shopTab !== "all" && cat !== shopTab) continue;
        if (shopTab === "all" && cat === "skin") continue;
        for (const o of NR.catalog[cat]) if (EC.price(cat, o.id)) items.push({ cat, o });
      }
      // cheapest first, owned items last
      const cost = ({ cat, o }) => { const p = EC.price(cat, o.id); return (EC.owned(cat, o.id) ? 1e7 : 0) + (p.gems ? 5000 + p.gems * 100 : p.coins); };
      items.sort((a, b) => cost(a) - cost(b));
      $("shop-grid").replaceChildren(...items.map(({ cat, o }) => IT.shopCard(cat, o, () => L.renderShop())));
      L.refreshWallet && L.refreshWallet();
      if (NR.crazy && NR.crazy.decorateShop) NR.crazy.decorateShop();
    };
  }
})();
