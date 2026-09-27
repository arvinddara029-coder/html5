/* ============ PRODUCTION PASS — the Vault ============
   ONE main Vault in the lobby (no more vaults buried in Settings):
     HERO · SKINS · HAIR · MASK · ARMOR · COSMETICS · PETS · ABILITIES

   Fixes the modular cosmetic system:
     - equipping/removing now ALWAYS shows/hides correctly: an explicit
       override map (profile.cosmeticOverride) decides whether the player's
       choice or the hero's signature piece wins — no more "hero ignores my
       hat" and no floating/duplicated pieces (single paint pass per layer).
   Item cards everywhere (Vault + Shop):
     Name · Type · VALUE as a numeric modifier (+8%) · Rarity · Price ·
     Equip state · optional level requirement · description · `!` info icon
     opening a panel that explains the item's actual effect. */
(function () {
  const $ = (id) => document.getElementById(id);
  const P = NR.profile;
  const V = (NR.vault = {});
  let open = false, tab = "skin";

  /* Hero selection and the ability kit moved OUT of the vault: heroes have
     their own Hero Select screen and their 3 abilities bind automatically.
     This modal is the cosmetic + pet collection (with the shop pricing). */
  const TABS = [
    { id: "skin", label: "SKINS" },
    { id: "hair", label: "HAIR" },
    { id: "mask", label: "MASK" },
    { id: "armor", label: "ARMOR" },
    { id: "cosmetics", label: "COSMETICS" },
    { id: "pet", label: "PETS" },
  ];
  const TAB_CATS = {
    skin: ["skin", "monster"],
    hair: ["hair", "ears"],
    mask: ["mask", "hat"],
    armor: ["top", "bottom", "shoes", "gloves", "weapon"],
    cosmetics: ["back", "aura"],
    pet: ["pet"],
  };

  /* ============ value / rarity model (numeric, never ability words) ============ */
  const RARITY_ORDER = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
  V.rarity = function (cat, id) {
    const price = NR.economy.price(cat, id);
    if (!price) return "COMMON";
    if (price.gems) return price.gems >= 30 ? "LEGENDARY" : "EPIC";
    if (price.coins >= 1200) return "RARE";
    if (price.coins >= 500) return "UNCOMMON";
    return "COMMON";
  };
  const FIELD_LABEL = {
    dmgMul: "STRIKE DAMAGE", guardMul: "HIT PROTECTION", energyMul: "ENERGY GAIN",
    lifesteal: "LIFE STEAL", speedMul: "MOVE SPEED", critCh: "CRIT CHANCE",
    maxHp: "MAX HEALTH", stormMul: "STORM DAMAGE",
  };
  /* Numeric value like "+8.4% CRIT CHANCE" — never an ability word. */
  V.itemValue = function (cat, id) {
    const t = NR.evolution ? NR.evolution.item(cat, id) : null;
    if (!t) return null;
    const fmt = (field, v) =>
      field === "maxHp" ? `+${Math.round(v)} HP` : `+${(v * 100).toFixed(1)}%`;
    const parts = [fmt(t.field, t.value)];
    if (t.second) parts.push(fmt(t.second.field, t.second.value));
    return { main: parts.join(" · "), stats: [FIELD_LABEL[t.field], t.second && FIELD_LABEL[t.second.field]].filter(Boolean) };
  };
  V.itemInfo = function (cat, id) {
    const t = NR.evolution ? NR.evolution.item(cat, id) : null;
    const price = NR.economy.price(cat, id);
    const val = V.itemValue(cat, id);
    const lines = [];
    const catName = (TAB_CATS[cat] ? cat : ({ back: "back piece", aura: "aura", pet: "pet", weapon: "weapon" })[cat]) || cat;
    lines.push(`TYPE · ${String(catName).toUpperCase()}`);
    if (val) lines.push(`VALUE · ${val.main} ${val.stats.join(" + ")}`);
    lines.push(`RARITY · ${V.rarity(cat, id)}`);
    if (price) lines.push(`PRICE · ${price.gems ? price.gems + " GEMS" : price.coins.toLocaleString("en-US") + " COINS"}`);
    else lines.push("PRICE · FREE");
    if (t && t.name) lines.push(`SIGNATURE · ${t.name}`);
    const active = ["weapon", "aura", "pet"].includes(cat);
    lines.push(active ? "USAGE · PASSIVE — triggers automatically in combat on its own cooldown" : "USAGE · PASSIVE — always active while equipped");
    lines.push(`BELONGS TO · your hero (currently ${NR.heroes.current().name}); visible on the character the moment it is equipped`);
    if (cat === "pet") lines.push("The companion follows you in runs and in the lobby.");
    return lines.join("\n");
  };

  /* ============ look resolution (fixes equip/remove on all heroes) ============ */
  V.effectiveLook = function (heroKey) {
    const hero = NR.heroes.byKey(heroKey || P.character);
    const ov = P.cosmeticOverride || {};
    const look = Object.assign({}, P.appearance);
    if (hero.look) {
      for (const cat of Object.keys(hero.look)) {
        const playerChose = ov[cat] === true;
        if (!playerChose) look[cat] = hero.look[cat]; // hero signature piece
      }
    }
    return look;
  };
  V.markOverride = function (cat) {
    P.cosmeticOverride = P.cosmeticOverride || {};
    P.cosmeticOverride[cat] = true;
  };
  V.isEquipped = function (cat, id) {
    if (cat === "pet") return P.pet === id;
    return (V.effectiveLook()[cat] || "") === id;
  };

  /* equip / unequip with visual correctness + persistence */
  V.equip = function (cat, id) {
    if (cat === "pet") { P.pet = id || ""; NR.saveProfile(); return true; }
    if (!NR.economy.owned(cat, id)) return false;
    P.appearance[cat] = id || "";
    V.markOverride(cat);
    NR.saveProfile();
    return true;
  };
  V.unequip = function (cat) {
    if (cat === "pet") { P.pet = ""; NR.saveProfile(); return true; }
    P.appearance[cat] = "";
    V.markOverride(cat);
    NR.saveProfile();
    return true;
  };

  /* ============ `!` information popover ============ */
  let popover = null;
  function showInfo(title, text, anchor) {
    hideInfo();
    popover = document.createElement("div");
    popover.className = "item-info-pop";
    const h = document.createElement("b");
    h.textContent = title;
    const pre = document.createElement("div");
    pre.className = "iip-body";
    pre.textContent = text;
    const close = document.createElement("button");
    close.className = "iip-close"; close.textContent = "✕"; close.setAttribute("aria-label", "Close");
    close.addEventListener("click", hideInfo);
    popover.append(close, h, pre);
    document.body.append(popover);
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    popover.style.left = Math.max(8, Math.min(innerWidth - 300, r.left)) + "px";
    popover.style.top = Math.max(8, Math.min(innerHeight - 240, r.bottom + 6)) + "px";
  }
  function hideInfo() { if (popover) { popover.remove(); popover = null; } }
  document.addEventListener("click", (e) => { if (popover && !popover.contains(e.target) && !e.target.closest(".item-info-btn")) hideInfo(); }, true);

  /* ============ item card builder (shared by Vault + Shop) ============ */
  V.itemCard = function (opts) {
    /* opts: {cat, id, name, thumb, price, owned, levelReq, actions:true} */
    const { cat, id, name } = opts;
    const card = document.createElement("div");
    const _ownedNow = NR.economy && NR.economy.owned(cat, id);
    card.className = "v-item rar-" + V.rarity(cat, id).toLowerCase() + (_ownedNow ? " owned" : "");
    const thumb = opts.thumb || NR.char.thumb(cat, id, 76);
    card.append(thumb);
    const h = document.createElement("h5");
    h.textContent = name;
    const type = document.createElement("span");
    type.className = "vi-type";
    type.textContent = String(cat).toUpperCase();
    const val = V.itemValue(cat, id);
    const valueEl = document.createElement("span");
    valueEl.className = "vi-value";
    valueEl.textContent = val ? val.main : "COSMETIC · NO STAT"; // numeric value, never an ability word
    const rarity = document.createElement("span");
    rarity.className = "vi-rarity";
    rarity.textContent = V.rarity(cat, id);
    const info = document.createElement("button");
    info.className = "item-info-btn";
    info.textContent = "!";
    info.title = "What does this item do?";
    info.setAttribute("aria-label", "Item information: " + name);
    info.addEventListener("click", (e) => { e.stopPropagation(); NR.audio.play("uiClick"); showInfo(name, V.itemInfo(cat, id), info); });
    const bottom = document.createElement("div");
    bottom.className = "vi-bottom";
    bottom.append(valueEl, rarity, info);
    card.append(h, type, bottom);
    if (opts.levelReq && P.level < opts.levelReq) {
      const lock = document.createElement("span");
      lock.className = "vi-lock";
      lock.textContent = "LEVEL " + opts.levelReq;
      card.append(lock);
    }
    if (opts.actions !== false) {
      const owned = NR.economy.owned(cat, id);
      const equipped = V.isEquipped(cat, id);
      const act = document.createElement("button");
      act.className = "vi-act buy" + (equipped ? " equipped" : "");
      if (!owned) {
        const price = NR.economy.price(cat, id);
        act.textContent = price ? (price.gems ? "💎 " + price.gems : "🪙 " + price.coins.toLocaleString("en-US")) : "FREE";
        act.addEventListener("click", () => {
          if (NR.economy.buy(cat, id)) {
            NR.audio.play("purchase");
            NR.hub.notify(`Purchased ${name}!`);
            V.equip(cat, id);
            NR.audio.play("equip");
            rerender();
          } else {
            NR.audio.play("uiError");
            NR.hub.notify("Not enough coins or gems — fight to earn more!");
          }
        });
      } else if (equipped) {
        act.textContent = "✓ EQUIPPED";
        act.addEventListener("click", () => { V.unequip(cat); NR.audio.play("unequip"); rerender(); });
      } else {
        act.textContent = "EQUIP";
        act.addEventListener("click", () => { V.equip(cat, id); NR.audio.play("equip"); rerender(); });
      }
      card.append(act);
    }
    return card;
  };

  /* ============ tabs ============ */
  function renderTabs() {
    const bar = $("vault-tabs");
    bar.replaceChildren(...TABS.map((t) => {
      const b = document.createElement("button");
      b.textContent = t.label;
      b.className = tab === t.id ? "sel" : "";
      b.addEventListener("click", () => { tab = t.id; NR.audio.play("uiClick"); renderTabs(); renderBody(); });
      return b;
    }));
  }

  /* live preview inside the vault */
  let previewCanvas = null, previewActor = null, previewT = 0, previewRaf = 0, previewLast = 0;
  function previewLoop(now) {
    previewRaf = requestAnimationFrame(previewLoop);
    if (!open || !previewCanvas) return;
    const dt = Math.min(0.05, (now - previewLast) / 1000 || 0.016);
    previewLast = now; previewT += dt;
    const g = previewCanvas.getContext("2d");
    g.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!previewActor) return;
    previewActor.update(dt);
    previewActor.draw(g, previewCanvas.width / 2, previewCanvas.height - 24, { scale: 2.2 });
    const pet = P.pet;
    if (pet && tab === "pet") {
      const wisp = pet.indexOf("Wisp") >= 0;
      NR.char.drawPet(g, pet, Math.floor(previewT * 8), previewCanvas.width / 2 - 100,
        previewCanvas.height - 18 - (wisp ? 56 : 0) + Math.sin(previewT * 3) * 4, wisp ? 2.2 : 2.0, false);
    }
  }

  function renderBody() {
    const body = $("vault-body");
    if (!body) return;
    body.replaceChildren();
    previewActor = NR.char.actor(V.effectiveLook(), { rate: 1 });
    previewActor.play("idle");

    renderCatalogTab(body); // hero selection: NR.codex (Hero Select screen)
    // footer: cross-links (super roster + hero select live OUTSIDE the vault)
    const foot = document.createElement("div");
    foot.className = "v-footer";
    const rosterBtn = document.createElement("button");
    rosterBtn.className = "ghost-btn";
    rosterBtn.textContent = "SUPER ROSTER & RELIC WEAPONS";
    rosterBtn.addEventListener("click", () => NR.vault.openSuperRoster && NR.vault.openSuperRoster());
    const heroBtn = document.createElement("button");
    heroBtn.className = "ghost-btn";
    heroBtn.textContent = "← HERO SELECT";
    heroBtn.addEventListener("click", () => { V.closeVault(); NR.codex && NR.codex.openHeroes && NR.codex.openHeroes(); });
    foot.append(heroBtn, rosterBtn);
    body.append(foot);
  }

  /* ---- HERO tab: real, mechanically different heroes ---- */
  
  

  /* ---- catalog tabs (skins/hair/mask/armor/cosmetics/pets) ---- */
  function renderCatalogTab(body) {
    const cats = TAB_CATS[tab] || [];
    for (const cat of cats) {
      const section = document.createElement("div");
      section.className = "v-section";
      const h = document.createElement("h3");
      h.textContent = ({ skin: "BASE SKIN", monster: "MONSTER SKIN", hair: "HAIRSTYLE", ears: "EARS", mask: "MASK", hat: "HEADGEAR", top: "CHEST ARMOR", bottom: "LEG ARMOR", shoes: "FOOTWEAR", gloves: "GLOVES", weapon: "WEAPON", back: "BACK PIECE", aura: "AURA", pet: "PETS & COMPANIONS" })[cat] || cat.toUpperCase();
      section.append(h);
      // optional categories get an explicit NONE card (remove works on every hero)
      if (["monster", "ears", "hat", "mask", "gloves", "back", "aura", "weapon"].includes(cat)) {
        const none = document.createElement("button");
        none.className = "v-item none-card" + (V.isEquipped(cat, "") ? " sel" : "");
        none.innerHTML = `<span class="vi-type">REMOVE</span><h5>NONE</h5><span class="vi-value">clears this slot</span><span class="vi-act">✓ CLEAR</span>`;
        none.addEventListener("click", () => { V.unequip(cat); NR.audio.play("unequip"); renderBody(); });
        const wrap = document.createElement("div");
        wrap.className = "v-grid";
        wrap.append(none);
        section.append(wrap);
      }
      const grid = document.createElement("div");
      grid.className = "v-grid";
      const list = (NR.catalog[cat] || []).filter((o) => cat === "pet" || o.g === "any" || o.g === genderOf());
      for (const o of list) {
        grid.append(V.itemCard({ cat, id: o.id, name: o.name }));
      }
      section.append(grid);
      body.append(section);
    }
    // pets: also the super companions
    if (tab === "pet" && NR.evolution) {
      const E = NR.evolution;
      if (NR.superContent) {
        const section = document.createElement("div");
        section.className = "v-section";
        section.innerHTML = "<h3>EXOTIC COMPANIONS</h3>";
        const g = document.createElement("div");
        g.className = "v-grid";
        for (const actor of NR.superContent.actors.filter((a) => a.role === "pet").slice(0, 12)) {
          const on = E.companion === actor.id;
          const card = document.createElement("button");
          card.className = "v-item ability-card" + (on ? " sel" : "");
          card.innerHTML = `<span class="ab-slot">${on ? "SUMMONED" : "SUMMON"}</span><h5>${actor.name}</h5><p class="ab-desc">${E.describe("pet", actor.id)}</p>`;
          card.addEventListener("click", () => {
            E.companion = on ? "" : actor.id;
            E.save();
            NR.audio.play(on ? "unequip" : "equip");
            renderBody();
          });
          g.append(card);
        }
        section.append(g);
        body.append(section);
      }
    }
  }
  function genderOf() {
    const look = V.effectiveLook();
    return String(look.skin || "").startsWith("Female") ? "f" : "m";
  }

  /* ============ open / close ============ */
  function rerender() {
    if (open) renderBody();
    NR.lobby?.refreshCard?.();
    if (NR.lobby && NR.lobby.hero) { /* lobby stage refresh below */ }
    NR.lobby?.refreshHeroStage?.();
  }
  V.openVault = function (startTab) {
    if (startTab === "abilities" || startTab === "hero") { // legacy routes → hero select
      if (NR.codex && NR.codex.openHeroes) return NR.codex.openHeroes();
      startTab = "skin";
    }
    const m = $("modal-vault");
    if (!m) return;
    if (startTab) tab = startTab;
    open = true;
    m.classList.add("open");
    previewCanvas = $("vault-preview");
    if (!previewRaf) previewRaf = requestAnimationFrame(previewLoop);
    renderTabs(); renderBody();
    NR.audio.play("uiClick");
  };
  V.closeVault = function () {
    const m = $("modal-vault");
    if (m) m.classList.remove("open");
    open = false;
    hideInfo();
  };
  V.isOpen = () => open;

  /* wiring happens after DOM exists (called from lobby init) */
  V.init = function () {
    const m = $("modal-vault");
    if (!m) return;
    m.querySelector("[data-close='modal-vault']")?.addEventListener("click", () => V.closeVault());
    m.addEventListener("click", (e) => { if (e.target === m) V.closeVault(); });
    const tabsBtn = $("lb-vault");
    if (tabsBtn) tabsBtn.addEventListener("click", () => V.openVault());
  };
})();
