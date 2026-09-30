/* Headless lobby smoke test: exercises the real lobby module against DOM stubs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function lobbyEnv(seed = {}) {
  const data = { ...seed };
  const noop = () => {};
  const timers = [];
  const ctx2d = () => ({
    canvas: null, imageSmoothingEnabled: false,
    drawImage: noop, clearRect: noop, fillRect: noop, fill: noop, stroke: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, ellipse: noop,
    arc: noop, quadraticCurveTo: noop, clip: noop, setLineDash: noop, setTransform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    measureText: () => ({ width: 0 }),
    fillText: noop, strokeText: noop,
  });
  const registry = [];
  const listeners = [];
  let queryAllFn = null;
  const PARENT = {
    addEventListener: noop, removeEventListener: noop,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {}, dataset: {}, append: noop, replaceChildren: noop,
    querySelector: () => null, querySelectorAll: () => [], parentElement: null, children: [],
  };
  const makeEl = (tag, attrs) => {
    const el = {
      tagName: (tag || "div").toUpperCase(),
      id: (attrs && attrs.id) || "",
      textContent: "", innerHTML: "", hidden: false, disabled: false, value: "",
      dataset: {}, style: {}, width: 0, height: 0, src: "", alt: "", loading: "",
      classList: {
        _s: new Set((attrs && attrs.class ? attrs.class : "").split(/\s+/).filter(Boolean)),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else { on ? this._s.add(c) : this._s.delete(c); } },
      },
      children: [],
      parentElement: null,
      append(...kids) { for (const k of kids) { k.parentElement = el; el.children.push(k); } },
      replaceChildren(...kids) { el.children = []; for (const k of kids) { k.parentElement = el; el.children.push(k); } },
      addEventListener(type, fn) { listeners.push({ el, type, fn }); },
      removeEventListener: noop,
      appendChild(kid) { kid.parentElement = el; el.children.push(kid); return kid; },
      insertBefore(kid) { kid.parentElement = el; el.children.push(kid); return kid; },
      removeChild(kid) { el.children = el.children.filter((k) => k !== kid); return kid; },
      remove() { if (el.parentElement) el.parentElement.removeChild(el); },
      replaceWith() {},
      cloneNode() { return makeEl(el.tagName, { id: el.id, class: [...el.classList._s].join(" ") }); },
      contains: (other) => other === el,
      get nextElementSibling() {
        if (!el.parentElement) return null;
        const i = el.parentElement.children.indexOf(el);
        return el.parentElement.children[i + 1] || null;
      },
      get previousElementSibling() {
        if (!el.parentElement) return null;
        const i = el.parentElement.children.indexOf(el);
        return i > 0 ? el.parentElement.children[i - 1] : null;
      },
      get firstElementChild() { return el.children[0] || null; },
      get lastElementChild() { return el.children[el.children.length - 1] || null; },
      matches: (sel) => matches(el, String(sel).trim().split(/\s+/).pop()),
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: el.width, height: el.height }),
      blur: noop,
      closest: () => null,
      querySelector: (sel) => queryWithin(el, sel)[0] || null,
      querySelectorAll: (sel) => queryWithin(el, sel),
      focus: noop,
      getContext: () => ctx2d(),
      offsetWidth: 0,
      setAttribute(k, v) { if (k === "class") el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); if (k === "id") el.id = v; },
      getAttribute: (k) => (k === "id" ? el.id : k === "class" ? [...el.classList._s].join(" ") : null),
    };
    for (const d of ["mode", "difficulty", "world", "close", "value", "cat", "act"])
      el.dataset[d] = (attrs && attrs["data-" + d]) || "";
    // innerHTML = "" clears children, like the real DOM
    let html = "";
    Object.defineProperty(el, "innerHTML", {
      get: () => html,
      set: (v) => { html = String(v == null ? "" : v); if (!html) el.children = []; },
    });
    // className and classList stay in sync, like a real DOM
    let cls = (attrs && attrs.class) || "";
    Object.defineProperty(el, "className", {
      get: () => cls,
      set: (v) => { cls = String(v || ""); el.classList._s = new Set(cls.split(/\s+/).filter(Boolean)); },
    });
    registry.push(el);
    return el;
  };
  const nodes = {};
  const matches = (el, sel) => {
    // supports "tag", ".cls", "#id" and compounds like "button.buy"
    const tag = sel.match(/^[a-zA-Z][\w-]*/);
    if (tag && el.tagName !== tag[0].toUpperCase()) return false;
    const cls = sel.match(/\.([\w-]+)/g) || [];
    for (const c of cls) if (!el.classList.contains(c.slice(1))) return false;
    const id = sel.match(/#([\w-]+)/);
    if (id && el.id !== id[1]) return false;
    if (!tag && !cls.length && !id) return false;
    return true;
  };
  const queryAll = (sel) => {
    const parts = String(sel).trim().split(/\s+/);
    const last = parts.pop();
    return registry.filter((el) => {
      if (!matches(el, last)) return false;
      let cur = el.parentElement;
      for (let i = parts.length - 1; i >= 0; i--) {
        while (cur && !matches(cur, parts[i])) cur = cur.parentElement;
        if (!cur) return false; // ancestor required but missing
        cur = cur.parentElement;
      }
      return true;
    });
  };
  queryAllFn = queryAll;
  // element-scoped selector search: walks the subtree only
  const queryWithin = (root, sel) => {
    const parts = String(sel).trim().split(/\s+/);
    const last = parts.pop();
    const out = [];
    const walk = (node) => {
      for (const kid of node.children) {
        if (matches(kid, last)) {
          let cur = kid.parentElement, ok = true;
          for (let i = parts.length - 1; i >= 0; i--) {
            while (cur && cur !== root && !matches(cur, parts[i])) cur = cur.parentElement;
            if (!cur || cur === root) { ok = false; break; }
            cur = cur.parentElement;
          }
          if (ok) out.push(kid);
        }
        walk(kid);
      }
    };
    walk(root);
    return out;
  };
  const context = {
    console, Math, JSON, Date, Set, Map, Number, String, Array, Object, RegExp, Error,
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    setInterval: noop,
    setTimeout: (fn) => { timers.push(fn); return 0; },
    clearInterval: noop, clearTimeout: noop,
    matchMedia: () => ({ matches: false }),
    navigator: { maxTouchPoints: 0 },
    localStorage: {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => (data[k] = String(v)),
    },
    document: {
      hidden: false, readyState: "complete",
      addEventListener: noop,
      querySelectorAll: queryAll,
      getElementById: (id) => nodes[id] || (nodes[id] = makeEl("div", { id })),
      createElement: (tag) => makeEl(tag),
      body: makeEl("body"),
      documentElement: makeEl("html"),
    },
  };
  context.window = context;
  context.addEventListener = noop;
  context.innerWidth = 1440;
  context.innerHeight = 900;
  context.Image = function () {
    return { set src(v) { this._s = v; }, get src() { return this._s; } };
  };
  // static DOM: build a real tree from index.html so selectors behave like the browser
  const VOID = new Set(["meta", "link", "br", "img", "input", "source", "path", "use", "hr", "area", "base", "col", "embed", "param", "track", "wbr"]);
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const stack = [context.document.body];
  for (const m of html.matchAll(/<(\/?)(\w+)((?:[^>"']|"[^"]*")*?)(\/?)>/g)) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = {};
    for (const a of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const el = makeEl(tag, attrs);
    const parent = stack[stack.length - 1];
    el.parentElement = parent;
    parent.children.push(el);
    if (el.id && !nodes[el.id]) nodes[el.id] = el;
    if (!VOID.has(tag) && m[4] !== "/") stack.push(el);
  }
  for (const el of registry) el.parentElement = el.parentElement || PARENT;
  vm.createContext(context);
  const mods = [
    "utils", "assetlib", "characters", "heroes", "profile", "diagnostics",
    "crazy", "pool", "vfx", "economy", "progression",
    "character", "atlas", "input", "audio", "audiomap", "sprites", "spriterender",
    "particles", "world", "projectiles", "combat", "player", "abilities", "enemies",
    "expedition-enemies", "adventure", "levelsys", "bossdefs", "net", "upgrades", "ui", "game", "hub", "vault", "expedition-ui", "lobby", "loader", "settings-ext",
  ];
  for (const name of mods)
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", name + ".js"), "utf8"),
      context,
      { filename: name + ".js" },
    );
  // the game loop needs a viewport + resize hook
  context.NR.view = { w: 1280, h: 940 };
  context.NR.resize = noop;
  return {
    NR: context.NR, context, nodes, listeners,
    flushTimers() { const t = timers.splice(0); for (const fn of t) fn(); },
  };
}

test("lobby boots, renders every panel and survives modal churn", () => {
  const env = lobbyEnv();
  const { NR, nodes, listeners } = env;
  assert.ok(NR.lobby, "lobby module missing");
  // boot
  NR.lobby.init();
  // player card reflects the profile
  assert.equal(nodes["pc-name"].textContent, NR.profile.name);
  assert.match(nodes["pc-level"].textContent, /^LV \d+$/);
  assert.ok(nodes["pc-coins"].textContent.length > 0);
  assert.equal(nodes["event-list"].children.length, 4, "four event cards");
  // deploy modal
  NR.lobby.openModal("modal-deploy");
  assert.ok(nodes["modal-deploy"].classList.contains("open"));
  assert.ok(nodes["chapter-cards"].children.length >= 3, "chapter cards rendered");
  // map modal
  NR.lobby.openModal("modal-map");
  assert.ok(nodes["modal-map"].classList.contains("open"));
  // creator modal
  NR.lobby.openModal("modal-creator");
  assert.ok(nodes["modal-creator"].classList.contains("open"));
  assert.ok(nodes["creator-tabs"].children.length >= 14, "creator tabs rendered");
  assert.ok(nodes["creator-options"].children.length >= 5, "creator options rendered");
  // switching to a bigger category repopulates the grid
  const hairTab = listeners.find((l) => l.type === "click" && l.el.textContent === "HAIR");
  hairTab.fn();
  assert.ok(nodes["creator-options"].children.length >= 5, "hair options rendered");
  // shop modal
  NR.lobby.openModal("modal-shop");
  assert.ok(nodes["modal-shop"].classList.contains("open"));
  assert.ok(nodes["shop-grid"].children.length > 20, "shop stock rendered");
  assert.ok(nodes["shop-filter"].children.length >= 10, "shop filters rendered");
  // refresh paths used by hub/expedition UI
  NR.lobby.refreshCard();
  NR.lobby.refreshDeploy();
  NR.lobby.renderEvents();
});

test("creator equips a locked item only after a successful purchase", () => {
  const { NR, nodes, listeners } = lobbyEnv();
  NR.profile.coins = 0;
  NR.profile.gems = 0;
  NR.lobby.init();
  NR.lobby.openModal("modal-creator");
  // switch to the HAT tab and try to click a paid option
  const hatTab = listeners.find((l) => l.type === "click" && l.el.textContent === "HAT");
  assert.ok(hatTab, "hat tab not wired");
  hatTab.fn();
  const cards = nodes["creator-options"].children;
  assert.ok(cards.length > 1);
  // find a locked (paid) card: it has a price tag child
  const paid = cards.find((c) => c.children.some((k) => (k.className || "").includes("price")));
  assert.ok(paid, "no paid hat option found");
  const click = listeners.find((l) => l.el === paid && l.type === "click");
  assert.ok(click, "paid card has no click handler");
  click.fn(); // should refuse (no currency) and keep the current look
  assert.equal(NR.profile.appearance.hat || "", "", "locked item is not equipped for free");
  assert.equal(nodes["creator-options"].children.length > 0, true);
  // now grant coins and buy
  NR.profile.coins = 999999;
  click.fn();
  assert.ok(NR.economy.owned("hat", paid.dataset.id), "hat should now be owned");
  // saving the look persists it to the profile
  listeners.find((l) => l.el.id === "creator-save" && l.type === "click").fn();
  assert.equal(NR.profile.appearance.hat, paid.dataset.id, "hat should now be equipped");
  assert.equal(nodes["modal-creator"].classList.contains("open"), false, "creator closes on save");
});

test("deploy wiring stores mode, difficulty and world on the profile", () => {
  const { NR, nodes, listeners } = lobbyEnv();
  NR.lobby.init();
  NR.lobby.openModal("modal-deploy");
  const survival = listeners.find((l) => l.type === "click" && l.el.dataset && l.el.dataset.mode === "survival");
  assert.ok(survival, "survival mode button not wired");
  survival.fn();
  assert.equal(NR.profile.mode, "survival");
  assert.equal(nodes["deploy-chapters"].style.display, "none", "chapter picker hides in survival");
  const hard = listeners.find((l) => l.type === "click" && l.el.dataset && l.el.dataset.difficulty === "hard");
  hard.fn();
  assert.equal(NR.profile.difficulty, "hard");
  const day = listeners.find((l) => l.type === "click" && l.el.dataset && l.el.dataset.world === "day");
  day.fn();
  assert.equal(NR.profile.world, "day");
});

test("event cards route to their destination", () => {
  const { NR, nodes, listeners } = lobbyEnv();
  NR.lobby.init();
  const cards = nodes["event-list"].children;
  assert.equal(cards.length, 4);
  const raid = cards[0];
  const click = listeners.find((l) => l.el === raid && l.type === "click");
  click.fn();
  assert.ok(nodes["modal-deploy"].classList.contains("open"), "raid opens deploy");
  assert.equal(NR.profile.mode, "survival", "raid preselects survival");
  const luna = cards[1];
  listeners.find((l) => l.el === luna && l.type === "click").fn();
  assert.ok(nodes["modal-creator"].classList.contains("open"), "Luna opens the forge");
});

test("level-up banner fires for pending level ups", () => {
  const env = lobbyEnv();
  const { NR, nodes } = env;
  NR.economy.pendingLevelUps = 2;
  NR.profile.level = 3;
  NR.lobby.init();
  env.flushTimers();
  assert.ok(nodes["levelup-banner"].classList.contains("show"), "banner should show");
  assert.match(nodes["levelup-sub"].textContent, /LEVEL 3/);
});

test("a full run scores, pays out and returns to the lobby", () => {
  const env = lobbyEnv();
  const { NR, nodes, listeners } = env;
  NR.lobby.init();
  NR.profile.mode = "survival";
  NR.game.start();
  const G = NR.game;
  assert.equal(G.state, "playing");
  assert.ok(G.player, "player spawned");
  const coinsBefore = NR.profile.coins;
  const xpBefore = NR.profile.xp;
  const runsBefore = NR.profile.runs || 0;
  // play: walk, hop, attack and clear waves as they come
  let wavesSeen = 0;
  for (let i = 0; i < 1500 && G.state === "playing"; i++) {
    G.player.x += 1.1;
    G.player.vy = -260;
    if (i % 45 === 0) G.player.startAttack(i % 90 === 0 ? 1 : 0);
    G.update(0.016, 0.016);
    wavesSeen = Math.max(wavesSeen, G.wave);
    if (G.state === "upgrade") {
      const pick = nodes["cards"].children[0];
      const h = listeners.find((l) => l.type === "click" && l.el === pick);
      if (h) h.fn(); // choose the offered upgrade and keep playing
    }
    // finish off anything close so the wave advances
    for (const e of G.enemies) if (Math.abs(e.x - G.player.x) < 90) { e.hp = 0; G.onEnemyKilled(e); }
    G.enemies = G.enemies.filter((e) => e.hp > 0);
  }
  assert.ok(wavesSeen >= 2, "waves progressed: " + wavesSeen);
  assert.ok(G.stats.kills > 0, "enemies were killed");
  assert.ok(G.score > 0, "score accumulated");
  assert.ok(G.stats.maxCombo >= 1, "combo tracked");
  G.finishRun(false);
  assert.equal(G.state, "over");
  assert.ok(NR.profile.coins > coinsBefore, "coins awarded");
  assert.ok(NR.profile.xp > xpBefore, "xp awarded");
  assert.equal(NR.profile.runs, runsBefore + 1, "run counter incremented");
  // back to the lobby
  G.toMenu();
  assert.equal(G.state, "menu");
  assert.equal(nodes["scr-menu"].classList.contains("active"), true, "menu screen is active");
  assert.equal(G.enemies.length + G.bolts.length + G.pickups.length + G.corpses.length, 0, "arenas cleared");
});

test("shop purchases spend coins and unlock gear", () => {
  const env = lobbyEnv();
  const { NR, nodes, listeners } = env;
  NR.profile.coins = 5000;
  NR.lobby.init();
  NR.lobby.openModal("modal-shop");
  const cards = nodes["shop-grid"].children;
  assert.ok(cards.length > 10, "shop stock rendered");
  // switch to a tab with affordable stock
  const tabs = nodes["shop-filter"].children;
  listeners.find((l) => l.type === "click" && l.el === tabs[1]).fn();
  // re-read the grid: clicking a tab re-renders it
  const fresh = nodes["shop-grid"].children.filter((c) => !c.classList.contains("owned"));
  assert.ok(fresh.length > 0, "unowned stock exists");
  const before = NR.profile.coins;
  const buyBtn = fresh[0].querySelector("button.buy");
  assert.ok(buyBtn, "shop card has a buy button");
  listeners.find((l) => l.type === "click" && l.el === buyBtn).fn();
  assert.ok(NR.profile.coins < before || NR.profile.gems < 10, "currency was spent");
});
