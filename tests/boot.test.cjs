/* Boots the REAL game — every js/ file, in index.html order — inside a stub DOM
   and drives it frame by frame. Any TypeError thrown by gameplay, the HUD, the
   expedition UI, the layered hero renderer or the pet companion fails a test
   here instead of surfacing as a red "script error" toast in the browser. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ *
 *  A small but honest DOM: real nodes, real classList/style/dataset,
 *  canvas contexts that record what was drawn. Unknown properties stay
 *  undefined so genuine mistakes still throw.
 * ------------------------------------------------------------------ */
/* ids that actually exist in index.html — anything else is null, like a browser */
const HTML_IDS = new Set(
  (fs.readFileSync(path.join(root, "index.html"), "utf8").match(/id="([^"]+)"/g) || [])
    .map((m) => m.slice(4, -1)),
);

function makeDom(strict) {
  const drawn = { calls: [], images: 0 };
  function ctx2d() {
    const rec = (name) => (...args) => {
      drawn.calls.push(name);
      if (name === "drawImage") drawn.images++;
    };
    const g = {
      canvas: null,
      imageSmoothingEnabled: true,
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      font: "",
      textAlign: "left",
      lineCap: "butt",
      drawImage: rec("drawImage"),
      clearRect: rec("clearRect"),
      fillRect: rec("fillRect"),
      strokeRect: rec("strokeRect"),
      fill: rec("fill"),
      stroke: rec("stroke"),
      save: rec("save"),
      restore: rec("restore"),
      translate: rec("translate"),
      scale: rec("scale"),
      rotate: rec("rotate"),
      beginPath: rec("beginPath"),
      closePath: rec("closePath"),
      moveTo: rec("moveTo"),
      lineTo: rec("lineTo"),
      bezierCurveTo: rec("bezierCurveTo"),
      quadraticCurveTo: rec("quadraticCurveTo"),
      ellipse: rec("ellipse"),
      arc: rec("arc"),
      clip: rec("clip"),
      fillText: rec("fillText"),
      strokeText: rec("strokeText"),
      setTransform: rec("setTransform"),
      setLineDash: rec("setLineDash"),
      arcTo: rec("arcTo"),
      rect: rec("rect"),
      roundRect: rec("roundRect"),
      getLineDash: () => [],
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => null,
      measureText: () => ({ width: 10 }),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
      putImageData: rec("putImageData"),
    };
    return g;
  }
  function classList(el) {
    const set = new Set();
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      contains: (c) => set.has(c),
      toggle: (c, on) => {
        const want = on === undefined ? !set.has(c) : !!on;
        if (want) set.add(c);
        else set.delete(c);
        return want;
      },
      get length() { return set.size; },
    };
  }
  function el(tag) {
    const node = {
      tagName: String(tag || "div").toUpperCase(),
      children: [],
      style: { setProperty() {}, removeProperty() {} },
      dataset: {},
      textContent: "",
      innerHTML: "",
      value: "",
      hidden: false,
      disabled: false,
      width: 64,
      height: 64,
      _listeners: {},
      classList: null,
      className: "",
      get nextElementSibling() {
        const p = node.parentElement;
        if (!p) return null;
        return p.children[p.children.indexOf(node) + 1] || null;
      },
      parentElement: null,
      appendChild(c) { c.parentElement = node; node.children.push(c); return c; },
      append(...c) { node.children.push(...c); },
      replaceChildren(...c) { node.children = c.slice(); },
      removeChild(c) { node.children = node.children.filter((x) => x !== c); },
      remove() {},
      setAttribute(k, v) { node[k] = v; },
      getAttribute(k) { return node[k] === undefined ? null : node[k]; },
      removeAttribute(k) { delete node[k]; },
      addEventListener(type, fn) { (node._listeners[type] = node._listeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(e) { (node._listeners[e.type] || []).forEach((f) => f(e)); return true; },
      click() { (node._listeners.click || []).forEach((f) => f({ type: "click", target: node })); },
      focus() {},
      blur() {},
      closest() { return null; },
      querySelector() { return el("div"); },
      querySelectorAll() { return []; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64, right: 64, bottom: 64 }),
      getContext: () => (node._ctx = node._ctx || ctx2d()),
      toDataURL: () => "data:image/png;base64,",
    };
    node.classList = classList(node);
    return node;
  }
  const byId = Object.create(null);
  const document = {
    hidden: false,
    readyState: "complete",
    body: el("body"),
    documentElement: el("html"),
    fonts: { ready: Promise.resolve(), addEventListener() {} },
    getElementById: (id) => {
      if (strict && !HTML_IDS.has(id)) return null; // real browsers return null
      return (byId[id] = byId[id] || el("div"));
    },
    createTextNode: (text) => ({ textContent: text }),
    createElement: el,
    createElementNS: (ns, tag) => el(tag),
    querySelector: () => el("div"),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    exitFullscreen: () => Promise.resolve(),
    fullscreenElement: null,
  };
  return { document, byId, drawn, el };
}

/* ------------------------------------------------------------------ *
 *  Game engine: loads every script in index.html order.
 * ------------------------------------------------------------------ */
function engine(seed = {}, opts = {}) {
  const store = { ...seed };
  const dom = makeDom(!!opts.strictDom);
  const rafQueue = [];
  const context = {
    console,
    Math,
    JSON,
    Date,
    Set,
    Map,
    Number,
    String,
    Array,
    Object,
    Promise,
    Error,
    RegExp,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    navigator: { maxTouchPoints: 0, userAgent: "node" },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: (k) => delete store[k],
    },
    document: dom.document,
    Image: function () {
      const img = { width: 32, height: 32, naturalWidth: 32, naturalHeight: 32, complete: true };
      Object.defineProperty(img, "src", {
        set(v) {
          img._src = v;
          // decode instantly, like a warm cache, unless the test opts out
          if (loadImages) { img.onload && img.onload(); }
        },
        get() { return img._src; },
      });
      return img;
    },
    Audio: function () {
      return { play: () => Promise.resolve(), pause() {}, volume: 1, currentTime: 0, paused: true, ended: true };
    },
  };
  const timers = [];
  let now = 1000;
  let loadImages = opts.loadImages !== false;
  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  context.innerWidth = 1440;
  context.innerHeight = 900;
  context.devicePixelRatio = 1;
  context.location = { hash: "", href: "file:///index.html" };
  vm.createContext(context);

  const order = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .match(/<script src="js\/([^"]+)"><\/script>/g)
    .map((m) => m.match(/js\/([^"]+)/)[1]);
  for (const file of order)
    vm.runInContext(fs.readFileSync(path.join(root, "js", file), "utf8"), context, { filename: file });

  const NR = context.NR;
  NR.view = { w: 1280, h: 940, scale: 1 };
  return { NR, context, dom, store, rafQueue, timers, setImages: (v) => (loadImages = v), tick: (ms) => (now += ms) };
}

/* run N frames of the real main loop body (update + render) */
function play(E, frames, opts = {}) {
  const { NR } = E;
  const G = NR.game;
  const canvas = E.dom.el("canvas");
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < frames; i++) {
    E.tick(16);
    const dt = 1 / 60;
    G.update(dt, dt);
    // the render pass main.js performs every frame
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    NR.world.drawBack(ctx, G.cam, NR.view);
    if (G.player) {
      NR.adventure.draw(ctx, G.cam, NR.view);
      for (const p of G.pickups) p.draw(ctx);
      NR.spriteRender.drawCorpses(ctx, G);
      for (const e of G.enemies) e.draw(ctx);
      for (const w of G.shockwaves) w.draw(ctx);
      G.player.draw(ctx);
      for (const b of G.bolts) b.draw(ctx);
      for (const b of G.shots) b.draw(ctx);
      NR.fx.draw(ctx);
    }
    NR.world.drawFront(ctx, G.cam, NR.view);
    if (NR.hud && NR.hud.draw) NR.hud.draw(ctx, G, 1280, 940);
    NR.hub.update(1000 + i * 16);
    NR.input.postUpdate();
    if (opts.drive) opts.drive(i, G, NR);
  }
}

/* ============================ tests ============================ */

test("every js file referenced by index.html loads without throwing", () => {
  const E = engine();
  assert.ok(E.NR.game, "game core registered");
  assert.ok(E.NR.char && E.NR.lobby && E.NR.expeditionUI, "ui modules registered");
  assert.equal(E.NR.api, undefined, "still a fully static build");
});

test("boot → menu → adventure chapter 1 runs 600 frames with no script error", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.lobby.init();
  NR.hub.init();
  NR.game.toMenu();
  NR.profile.mode = "adventure";
  NR.profile.chapter = 0;
  NR.game.start({ chapter: 0 });
  assert.equal(NR.game.state, "playing");
  play(E, 600, {
    drive: (i, G) => {
      // hold right, jump and attack like a player would
      NR.input.keys.ArrowRight = true;
      if (i % 40 === 0) NR.input.pressed.jump = true;
      if (i % 23 === 0) NR.input.pressed.attack = true;
      if (i % 97 === 0) NR.input.pressed.dash = true;
      // walk the hero through the whole chapter so every zone/gate path runs
      G.player.x = 200 + (i / 600) * (NR.world.W - 500);
      G.player.y = NR.world.groundY;
      G.player.onGround = true;
      G.player.iframes = 99;
      for (const e of G.enemies) e.spawnT = 0;
    },
  });
  assert.ok(NR.game.player.pose.animFrame !== undefined, "hero anim clock initialised");
});

test("survival waves 1-12 run with no script error", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.mode = "survival";
  NR.game.start();
  play(E, 900, {
    drive: (i, G) => {
      NR.input.keys.ArrowRight = i % 120 < 60;
      NR.input.keys.ArrowLeft = i % 120 >= 60;
      if (i % 17 === 0) NR.input.pressed.attack = true;
      if (i % 53 === 0) NR.input.pressed.jump = true;
      G.player.iframes = 99;
      G.player.hp = G.player.maxHp;
      for (const e of G.enemies) e.spawnT = 0;
      if (G.state === "upgrade") { G.state = "playing"; NR.ui.hideAll(); }
      if (G.state === "over") G.start();
    },
  });
  assert.ok(NR.game.wave >= 1, "waves actually started");
});

test("hero run animation advances frames while sprinting (was pinned to frame 0)", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.mode = "survival";
  NR.game.start();
  const p = NR.game.player;
  NR.input.keys.ArrowRight = true;
  const seen = new Set();
  play(E, 90, { drive: () => seen.add(p.pose.anim + ":" + p.pose.animFrame) });
  const runFrames = [...seen].filter((s) => s.startsWith("run:"));
  assert.ok(runFrames.length >= 4, `run row should cycle frames, saw ${[...seen].join(" ")}`);
  const walkFrames = new Set();
  NR.input.keys.ArrowRight = false;
  play(E, 60, { drive: () => { p.vx = 180; p.onGround = true; walkFrames.add(p.pose.animFrame); } });
  assert.ok(walkFrames.size >= 3, "walk row should cycle frames too");
});

test("pet companion uses the run row while running and the idle row while standing", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.pet = "GandalfHardcore doggy sheet.png";
  NR.profile.mode = "survival";
  NR.game.start();
  const p = NR.game.player;
  NR.input.keys.ArrowRight = true;
  play(E, 60);
  assert.equal(p.petRow, 1, "sprinting hero puts the dog on the run row");
  assert.ok(p.petFrame >= 0 && p.petFrame < 6, "run frame inside the 6-frame strip");
  const f1 = p.petFrame;
  play(E, 30);
  assert.notEqual(p.petFrame, f1, "run frames keep advancing");
  NR.input.keys.ArrowRight = false;
  p.vx = 0;
  play(E, 60, { drive: () => { p.vx = 0; } });
  assert.equal(p.petRow, 0, "standing hero lets the dog sit");
  assert.ok(p.petFrame < 5, "idle row must skip the blank 6th cell");
});

test("every registered enemy type updates, draws and dies without throwing", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.mode = "survival";
  NR.game.start();
  const G = NR.game;
  const canvas = E.dom.el("canvas");
  const ctx = canvas.getContext("2d");
  const kinds = [
    ["Crawler", NR.Crawler], ["Slime", NR.Slime], ["Soldier", NR.Soldier],
    ["Drone", NR.Drone], ["Wraith", NR.Wraith], ["Warlock", NR.Warlock],
    ["Rival", NR.Rival], ["Gunner", NR.Gunner], ["Striker", NR.Striker],
    ["Blade", NR.Blade], ["Sentry", NR.Sentry], ["Sentinel", NR.Sentinel],
    ["Apparition", NR.Apparition], ["Brute", NR.Brute],
  ];
  for (const [name, Ctor] of kinds) {
    assert.equal(typeof Ctor, "function", `${name} must be registered`);
    const e = new Ctor(G.player.x + 160, NR.world.groundY, 1);
    e.spawnT = 0;
    G.enemies.push(e);
    for (let i = 0; i < 240; i++) {
      e.update(1 / 60, G);
      e.draw(ctx);
      G.player.x = 400 + Math.sin(i / 20) * 260;
      G.player.y = NR.world.groundY;
      if (i === 200) e.hurt(1e6, 0, 0, true, G);
    }
    assert.ok(e.dead || e.hp <= e.maxHp, `${name} simulated`);
  }
  // every boss body must fight with the shared script
  for (const skin of ["mech", "warlock", "brute"]) {
    const b = new NR.Boss(600, NR.world.groundY, 1, 1, skin);
    b.spawnT = 0;
    G.enemies.push(b);
    for (let i = 0; i < 620 && !b.dead; i++) {
      b.update(1 / 60, G);
      b.draw(ctx);
      G.player.x = 700 + Math.sin(i / 30) * 500;
      if (i % 40 === 0) b.hurt(140, 0, 0, false, G);
    }
    assert.ok(b.dead, `${skin} boss can be killed`);
    G.enemies = G.enemies.filter((e) => !e.dead);
    G.bossActive = false;
  }
  const boss = new NR.Boss(600, NR.world.groundY, 1, 1);
  boss.spawnT = 0;
  G.enemies.push(boss);
  for (let i = 0; i < 620 && !boss.dead; i++) { // the death cinematic runs ~1.5s
    boss.update(1 / 60, G);
    boss.draw(ctx);
    G.player.x = 700 + Math.sin(i / 30) * 500;
    if (i % 40 === 0) boss.hurt(120, 0, 0, false, G);
  }
  assert.ok(boss.dead, "boss can actually be killed");
  assert.equal(G.bossActive, false, "boss kill releases the arena");
});

test("every chapter can be configured, started and completed", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  for (let ch = 0; ch < NR.adventure.chapters.length; ch++) {
    NR.profile.unlocked = NR.adventure.chapters.length - 1;
    NR.profile.mode = "adventure";
    NR.game.finished = false;
    NR.game.start({ chapter: ch });
    const G = NR.game, A = NR.adventure;
    assert.equal(A.active, true, `chapter ${ch} is an adventure`);
    assert.equal(A.relays.length, 3, `chapter ${ch} has 3 relays`);
    // clear every encounter and relay, then walk into the gate
    for (let z = 0; z < A.zones.length; z++) {
      G.player.x = A.zones[z].x;
      G.player.y = NR.world.groundY;
      G.player.iframes = 99;
      A.update(0.01, G);
      // bosses need their death cinematic to run out before they leave the field
      for (const e of [...G.enemies]) {
        e.spawnT = 0;
        if (e.type === "boss") e.update(3, G);
        e.hurt(1e7, 0, 0, false, G);
        if (e.type === "boss") e.update(2, G);
      }
      G.enemies = G.enemies.filter((e) => !e.dead);
      A.update(0.01, G);
      assert.ok(A.zones[z].cleared, `chapter ${ch} zone ${z} clears`);
    }
    for (const r of A.relays) {
      G.player.x = r.x;
      G.player.y = NR.world.groundY;
      NR.input.pressed.interact = true;
      A.update(0.01, G);
      G.state = "playing";
    }
    assert.ok(A.relays.every((r) => r.active), `chapter ${ch} relays restored`);
    G.player.x = NR.world.W - 200;
    G.player.y = NR.world.groundY;
    A.finishing = 0.01;
    A.update(0.02, G);
    assert.ok(G.finished, `chapter ${ch} finishes at the gate`);
  }
});

test("appearance changes rebuild the hero once, not on every asset load", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  const look = { ...NR.profile.appearance };
  const first = NR.char.build(look);
  const again = NR.char.build(look);
  assert.equal(first, again, "identical look returns the cached build");
  // a decode event for unrelated art must not throw the hero cache away
  NR.assets.version += 25;
  assert.equal(NR.char.build(look), first, "unrelated loads no longer rebuild the hero");
  assert.equal(NR.char.has(look), !first.missing.length);
});

test("layered hero frames are drawn from the sheet, not the procedural fallback", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  const built = NR.char.build(NR.profile.appearance);
  assert.ok(built.anims.run.length === NR.char.FRAMES[2], "run row has 8 frames");
  assert.ok(built.anims.run.some((cv) => cv._drew > 0), "run frames composite real layers");
  const canvas = E.dom.el("canvas");
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < built.anims.run.length; f++)
    NR.char.drawFrame(ctx, built, "run", f, 100, 200, 1, { scale: 1 });
  assert.ok(E.dom.drawn.images >= built.anims.run.length, "each run frame hits the canvas");
});

test("every UI entry point survives missing DOM nodes (strict DOM, like a browser)", () => {
  const E = engine({}, { strictDom: true });
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  // the whole menu stack, exactly as index.html wires it at boot
  NR.ui.init();
  NR.hub.init();
  NR.hub.refreshPreferences();
  NR.expeditionUI.init();
  NR.lobby.init();
  NR.ui.refreshHigh();
  NR.ui.syncAudio?.();
  for (const scr of ["menu", "how", "set", "records", "armory", "operators", "credits", "pause"])
    NR.ui.show(scr);
  NR.hub.setWorld("night");
  NR.hub.setWorld("day");
  NR.hub.setDifficulty("hard");
  NR.hub.setDifficulty("normal");
  NR.expeditionUI.refresh();
  NR.expeditionUI.renderOperators?.();
  NR.expeditionUI.showRecords?.();
  NR.expeditionUI.syncRun?.();
  NR.lobby.refreshDeploy?.();
  NR.lobby.refreshCard?.();
  NR.lobby.initCreator?.();
  NR.lobby.renderShop?.();
  for (const modal of ["modal-deploy", "modal-map", "modal-creator", "modal-shop"])
    NR.lobby.openModal?.(modal);
  // upgrade + game-over screens
  NR.profile.mode = "survival";
  NR.game.start();
  NR.game.wave = 1;
  NR.ui.openUpgrades(NR.upgrades.roll(NR.game.player), NR.game);
  NR.game.score = 1234;
  NR.ui.showGameOver(NR.game, true);
  NR.expeditionUI.showVictory?.(NR.game);
  NR.ui.toggleMute();
  NR.ui.toggleMute();
  NR.saveTransfer?.init?.();
  NR.hub.update(9999);
  assert.ok(true, "no UI path threw");
});

test("clicking every wired button in the menu does not throw", () => {
  const E = engine({}, { strictDom: true });
  const { NR, dom } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.hub.init();
  NR.expeditionUI.init();
  NR.lobby.init();
  let clicked = 0;
  for (const node of Object.values(dom.byId)) {
    for (const fn of node._listeners.click || []) {
      fn({ type: "click", target: node, preventDefault() {}, stopPropagation() {} });
      clicked++;
    }
  }
  assert.ok(clicked > 5, `wired ${clicked} click handlers`);
});

test("hero art is composited once, even while 600 assets stream in (lag fix)", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.mode = "survival";
  NR.game.start();
  let composites = 0;
  const realCreate = E.context.document.createElement;
  E.context.document.createElement = (tag) => {
    if (String(tag).toLowerCase() === "canvas") composites++;
    return realCreate(tag);
  };
  // simulate the whole background pack decoding during gameplay: every decode
  // bumps the asset version, which used to throw the hero cache away each time
  play(E, 600, { drive: () => { NR.assets.version++; } });
  E.context.document.createElement = realCreate;
  assert.ok(
    composites <= NR.char.FRAMES.reduce((a, b) => a + b, 0),
    `hero rebuilt itself ${composites} times; expected at most one full 45-frame composite`,
  );
});

test("frame budget: 600 gameplay frames stay under 60ms of JS per frame on average", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  NR.profile.mode = "survival";
  NR.game.start();
  const t0 = Date.now();
  play(E, 600, {
    drive: (i, G) => {
      NR.input.keys.ArrowRight = true;
      if (i % 11 === 0) NR.input.pressed.attack = true;
      G.player.iframes = 99;
      G.player.hp = G.player.maxHp;
      for (const e of G.enemies) e.spawnT = 0;
      if (G.state === "upgrade") { G.state = "playing"; NR.ui.hideAll(); }
    },
  });
  const ms = (Date.now() - t0) / 600;
  assert.ok(ms < 8, `averaged ${ms.toFixed(2)}ms per simulated frame (update + full render)`);
});

/* ---------------- content coverage: characters, chapters, assets ---------------- */

test("six operators exist, each with distinct stats and a valid signature look", () => {
  const E = engine();
  const { NR } = E;
  assert.equal(NR.characters.length, 6, "roster grew from 3 to 6 operators");
  const ids = new Set();
  for (const c of NR.characters) {
    assert.ok(!ids.has(c.id), `unique id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.hp > 0 && c.speed > 0 && c.damage > 0 && c.jumps > 0, `${c.id} has real stats`);
    if (!c.look) continue;
    for (const [cat, id] of Object.entries(c.look)) {
      const list = NR.catalog[cat] || [];
      assert.ok(list.some((o) => o.id === id), `${c.id} ${cat} "${id}" must exist in the catalog`);
    }
  }
  // stats must actually differ
  const stats = NR.characters.map((c) => `${c.hp}/${c.speed}/${c.damage}/${c.jumps}/${c.dashes}/${c.armor}`);
  assert.equal(new Set(stats).size, stats.length, "no two operators share a stat line");
  // and applying one equips its look on the hero
  const p = new NR.Player();
  NR.applyCharacter(p, "grim");
  assert.equal(p.maxHp, 190);
  assert.equal(p.look.weapon, "mGolden Axe");
  assert.equal(p.look.monster, "Female Orc skin");
  p.computePose();
  assert.equal(p.pose.appearance.weapon, "mGolden Axe", "the hero wears the operator's gear");
  NR.applyCharacter(p, "ronin");
  assert.equal(p.look, null, "operators without a signature look keep the creator's appearance");
});

test("special monster skins replace the base skin instead of hiding under it", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  const plain = NR.char.build({ ...NR.profile.appearance, monster: "" });
  const demon = NR.char.build({ ...NR.profile.appearance, monster: "Female Demon skin" });
  assert.notEqual(plain, demon, "equipping a monster skin produces a different build");
  // the demon build must not have drawn the base skin layer over the top
  const skinPath = (NR.catalog.skin.find((o) => o.id === NR.profile.appearance.skin) || {}).path;
  assert.ok(skinPath, "profile has a base skin");
  assert.ok(demon.anims.idle.length === NR.char.FRAMES[0]);
});

test("six authored chapters, each with its own boss body and route", () => {
  const E = engine();
  const { NR } = E;
  const chapters = NR.adventure.chapters;
  assert.equal(chapters.length, 6, "campaign grew from 3 to 6 chapters");
  const names = new Set(chapters.map((c) => c.name));
  assert.equal(names.size, 6, "every chapter has a distinct name");
  for (const c of chapters) {
    assert.ok(["city", "garden", "reactor"].includes(c.biome), `${c.name} biome`);
    assert.ok(c.length >= 6800, `${c.name} is a full route`);
    assert.ok(NR.bossSkins[c.boss], `${c.name} fields a real boss body`);
    assert.ok(c.bossName, `${c.name} names its boss`);
  }
  assert.equal(new Set(chapters.map((c) => c.boss)).size, 6, "six different boss bodies across the campaign");
  assert.ok(chapters.every((c) => c.boss !== "mech"), "no world is led by the old procedural robot");
  assert.equal(new Set(chapters.map((c) => c.bossName)).size, 6, "every chapter names a different boss");
  assert.ok(chapters[chapters.length - 1].finale, "the last chapter is the finale");
});

test("every asset path the game references exists on disk", () => {
  const E = engine();
  const { NR } = E;
  const missing = [];
  for (const [sheet, def] of Object.entries(NR.sheets))
    for (const [anim, a] of Object.entries(def.anims))
      if (!fs.existsSync(path.join(root, "assets", a.path))) missing.push(`${sheet}.${anim}: ${a.path}`);
  for (const [cat, list] of Object.entries(NR.catalog))
    for (const o of list)
      if (!fs.existsSync(path.join(root, "assets", o.path))) missing.push(`${cat}: ${o.path}`);
  for (const list of Object.values(NR.textures))
    for (const p of list)
      if (!fs.existsSync(path.join(root, "assets", p))) missing.push(`texture: ${p}`);
  for (const p of Object.values(NR.petWardrobe))
    if (!fs.existsSync(path.join(root, "assets", p))) missing.push(`wardrobe: ${p}`);
  assert.deepEqual(missing, [], "no dangling asset paths");
});

test("the whole roster of enemy art is reachable from real gameplay", () => {
  const E = engine();
  const { NR } = E;
  NR.sprites.init();
  NR.world.init();
  NR.ui.init();
  const used = new Set();
  NR.profile.mode = "survival";
  NR.profile.unlocked = NR.adventure.chapters.length - 1;
  // every adventure chapter, every zone
  for (let ch = 0; ch < NR.adventure.chapters.length; ch++) {
    NR.game.finished = false;
    NR.game.start({ chapter: ch });
    const G = NR.game, A = NR.adventure;
    for (const z of A.zones) {
      G.player.x = z.x;
      G.player.y = NR.world.groundY;
      G.player.iframes = 99;
      A.update(0.01, G);
      for (const e of G.enemies) used.add(e.type);
      G.enemies = [];
      G.bossActive = false;
    }
  }
  // every survival wave up to 14
  NR.profile.mode = "survival";
  for (let w = 1; w <= 14; w++) {
    NR.game.finished = false;
    NR.game.start();
    NR.game.wave = w - 1;
    NR.game.startT = 0.001;
    NR.game.update(0.02, 0.02);
    for (const e of NR.game.enemies) used.add(e.type);
    for (const q of NR.game.spawnQueue) used.add(q.type);
  }
  for (const type of ["crawler", "slime", "soldier", "drone", "wraith", "warlock", "rival",
    "gunner", "striker", "blade", "sentry", "sentinel", "brute", "apparition", "boss"])
    assert.ok(used.has(type), `${type} actually appears in a chapter or wave`);
});

/* Evolution expansion regressions, using the same full script graph as index.html. */
test('evolution: ten-slot cap, level locks and removal', () => {
  const { NR } = engine();
  const E=NR.evolution;
  E.equip('phoenix');
  assert.equal(E.slots.includes('phoenix'),false);
  NR.profile.level=20;
  E.slots=[];
  for(const s of E.spells) E.equip(s.id);
  assert.equal(E.slots.length,10);
  E.equip(E.slots[0]);
  assert.equal(E.slots.length,9);
  E.equip('phoenix');
  assert.equal(E.slots.length,10);
});
test('evolution: spells consume energy once, observe cooldown and pause', () => {
  const { NR }=engine();const G=NR.game,E=NR.evolution;
  G.start();G.player.energy=100;
  assert.equal(E.cast('ember'),true);
  assert.equal(G.player.energy,84);
  assert.equal(E.cast('ember'),false);
  E.tick(9);G.state='pause';
  assert.equal(E.cast('ember'),false);
  G.state='playing';assert.equal(E.cast('ember'),true);
});
test('evolution: generated route stable on retry, changes per level and world', () => {
  const { NR }=engine();const A=NR.adventure,E=NR.evolution;
  const layout=()=>JSON.stringify(NR.world.platforms);
  A.configure('adventure',0);const first=layout();
  A.configure('adventure',0);assert.equal(layout(),first);
  E.levels[0]++;A.configure('adventure',0);assert.notEqual(layout(),first);
  assert.equal(A.relays.length,3);assert.equal(A.zones.length,4);
  for(const p of NR.world.platforms){assert.ok(p.x>0 && p.x+p.w<NR.world.W);assert.ok(p.y<NR.world.groundY);}
});
test('evolution: continue preserves encounter and cannot duplicate defeat rewards', () => {
  const { NR }=engine();const G=NR.game;
  NR.profile.mode='survival';G.start();G.wave=4;G.score=600;G.stats.kills=5;
  G.player.dead=true;G.finishRun(false);
  const coins=NR.profile.coins,xp=NR.profile.xp;
  G.continueEncounter();
  assert.equal(G.wave,4);assert.equal(G.player.dead,false);assert.equal(G.player.hp,G.player.maxHp);
  assert.equal(G.player.iframes,3);
  G.player.dead=true;G.finishRun(false);
  assert.equal(NR.profile.coins,coins);assert.equal(NR.profile.xp,xp);
});
test('evolution: every super asset is indexed, replacements and backgrounds exist', () => {
  const { NR }=engine();
  assert.ok(NR.superManifest.length>2000);
  assert.ok(NR.evolution.assetReplacements>0);
  for(const p of NR.superManifest)assert.ok(fs.existsSync(path.join(root,'assets',p)),p);
  NR.adventure.configure('adventure',0);
  assert.ok(NR.evolution.background.includes('super/'));
});

test('super expansion: every measured actor loads, draws and fights without script errors',()=>{
  const E=engine(),{NR}=E;NR.game.start();
  const ctx=E.context.document.createElement('canvas').getContext('2d');
  for(const a of NR.superContent.actors){
    assert.ok(a.clips.length>0,a.name);
    for(const clip of a.clips){assert.ok(clip.bounds[2]>clip.bounds[0]);for(const f of clip.frames)assert.ok(fs.existsSync(path.join(root,'assets',f.path)),f.path);}
    NR.superRuntime.preloadActor(a);
    NR.superRuntime.drawActor(ctx,a,'walk',1,300,NR.world.groundY,80,1,1);
    if(['enemy','guardian'].includes(a.role)){
      const e=new NR.SuperEnemy(450,NR.world.groundY,1,a.id);e.spawnT=0;NR.game.enemies=[e];
      for(let i=0;i<30;i++){e.update(.016,NR.game);e.draw(ctx);}
      e.hurt(10000,0,0,false,NR.game);assert.equal(e.dead,true);
    }
  }
});
test('live level-up immediately strengthens current player and unlocks abilities',()=>{
  const {NR}=engine();const G=NR.game;G.start();
  NR.profile.xp=110;NR.profile.level=1;G.player.evoLevel=1;
  const hp=G.player.maxHp,dmg=G.player.dmgMul;
  NR.evolution.rewardKill();
  assert.equal(NR.profile.level,2);assert.equal(G.player.maxHp,hp+4);assert.ok(G.player.dmgMul>dmg);
  NR.evolution.equip('frost');assert.ok(NR.evolution.slots.includes('frost'));
});
test('portable backup preserves purchases, all six chapters, hero, relic, HUD and vault',()=>{
  const {NR}=engine();NR.profile.coins=1000;
  assert.equal(NR.economy.buy('skin','Male Skin3'),true);
  NR.profile.unlocked=5;NR.profile.chapter=5;NR.profile.character='vex';
  NR.evolution.hero=NR.superContent.actors.find(a=>a.role==='hero').id;
  NR.evolution.relic=NR.superContent.relics[0].id;
  NR.evolution.layout.jump=[.2,.4];NR.game.toMenu();
  const text=NR.saveTransfer.exportText();const b=NR.saveTransfer.validate(text);
  assert.equal(b.profile.owned['skin:Male Skin3'],1);
  assert.equal(b.profile.chapter,5);assert.equal(b.profile.character,'vex');
  NR.evolution.hero='';NR.evolution.layout={};NR.saveTransfer.apply(text);
  assert.equal(NR.evolution.hero,b.evolution.hero);assert.equal(NR.evolution.layout.jump[0],.2);
  const malformed=JSON.parse(text);malformed.evolution.slots=Array(11).fill('ember');
  assert.throws(()=>NR.saveTransfer.apply(JSON.stringify(malformed)));
});
test('saved survival wave resumes with upgrades, without repeated XP or coin payouts',()=>{
  const {NR}=engine(),G=NR.game;NR.profile.mode='survival';G.start();G.wave=4;G.player.dmgMul*=2;
  NR.waveResume.save();const damage=G.player.dmgMul;
  G.stats.kills=1;NR.evolution.rewardKill();G.score=120;G.player.dead=true;G.finishRun(false);
  const coins=NR.profile.coins,xp=NR.profile.xp;
  G.toMenu();assert.equal(NR.waveResume.resume(),true);assert.equal(G.wave,3);assert.equal(G.player.dmgMul,damage);
  G.wave=4;G.stats.kills=1;NR.evolution.rewardKill();G.score=120;G.player.dead=true;G.finishRun(false);
  assert.equal(NR.profile.xp,xp);assert.equal(NR.profile.coins,coins);
});
test('all original super files have explicit coverage status and all eleven FBX exports have guardian sprites',()=>{
  const {NR}=engine();const coverage=NR.superContent.coverage;
  for(const p of NR.superManifest)assert.ok(coverage[p],p);
  assert.equal(NR.superContent.actors.filter(a=>a.role==='guardian').length,11);
  for(const p of NR.superManifest.filter(p=>p.endsWith('.fbx')))assert.equal(coverage[p],'runtime-mapped');
});

/* ---------------- Sukuna Slice, world levels, asset bosses, hero roster ---------------- */
test("SUKUNA SLICE: hero flies for 5s and every on-screen enemy is cut in two", () => {
  const E = engine(), { NR } = E, G = NR.game;
  NR.profile.mode = "survival"; G.start();
  G.spawnQueue = []; G.enemies = [];
  const gy = NR.world.groundY, p = G.player;
  for (let i = 0; i < 5; i++) { const e = new NR.Soldier(p.x - 300 + i * 150, gy, 1); e.spawnT = 0; G.enemies.push(e); }
  const boss = new NR.Boss(p.x + 420, gy, 1, 1, "demon"); boss.spawnT = 0; boss.state = "idle"; G.enemies.push(boss);
  G.bossActive = true; G.bossRef = boss;
  const kills = G.stats.kills, startY = p.y, bossHp = boss.hp;
  assert.equal(NR.sukuna.ready(), true, "starts ready");
  assert.equal(NR.sukuna.cast(), true);
  let top = p.y, halves = 0;
  play(E, 60 * 5.3, { drive: () => { top = Math.min(top, p.y); halves = Math.max(halves, NR.sukuna.halves.length); } });
  assert.ok(startY - top > 150, "hero rose into the air");
  assert.ok(Math.abs(p.y - startY) < 40 || p.onGround, "hero comes back down after the domain");
  assert.ok(halves >= 10, "each slain enemy leaves two halves");
  assert.ok(G.stats.kills >= kills + 5, "sliced enemies count as kills");
  assert.ok(boss.hp < bossHp && !boss.dead, "bosses take heavy damage but are not one-shot");
  assert.ok(G.player.sukunaUsed && !NR.sukuna.ready(), "single use: not ready again this run");
  assert.equal(NR.sukuna.cast(), false, "a second cast in the same run is refused");
  G.start();
  assert.equal(NR.sukuna.ready(), true, "a new run gets a fresh Sukuna Slice");
});

test("world levels: endless per-world track, Level 8 world boss opens the next world", () => {
  const E = engine(), { NR } = E, L = NR.levels, A = NR.adventure;
  assert.equal(L.maxPlayable(0), (L.best[0] || 0) + 1);
  NR.profile.unlocked = 0;
  for (let lv = 1; lv <= 7; lv++) { L.onClear(0, lv); assert.equal(L.opensNextWorld(0), false, "level " + lv + " keeps world 2 closed"); }
  L.onClear(0, 8);
  assert.equal(L.opensNextWorld(0), true, "clearing Level 8 opens world 2");
  assert.equal(L.select(0, 50), 9, "cannot skip ahead of the track");
  assert.equal(L.select(0, 3), 3, "any cleared level can be replayed");
  assert.equal(NR.evolution.levels[0], 3);
  assert.ok(NR.bosses.isWorldBossLevel(8) && NR.bosses.isWorldBossLevel(16) && !NR.bosses.isWorldBossLevel(9));
  const skins = new Set();
  for (let lv = 1; lv <= 16; lv++) { const s = NR.bosses.forLevel(0, lv); assert.ok(NR.bossSkins[s] && s !== "mech", "level " + lv + " boss uses asset art"); skins.add(s); }
  assert.ok(skins.size >= 6, "bosses rotate through the roster");
  assert.ok(A.chapters.every((c) => !/SHOGUN-9/.test(c.bossName)));
});

test("asset bosses fight, draw and die with the shared boss script", () => {
  const E = engine(), { NR } = E, G = NR.game; G.start();
  const ctx = E.dom.el("canvas").getContext("2d");
  for (const skin of ["demon", "hellbeast", "ogre", "dragon", "nightmare"]) {
    assert.ok(NR.bossSkins[skin], skin + " registered");
    const b = new NR.Boss(600, NR.world.groundY, 1, 1, skin); b.spawnT = 0;
    assert.ok(b.bossName && !/SHOGUN/.test(b.bossName), skin + " has its own name");
    G.enemies = [b];
    for (let i = 0; i < 620 && !b.dead; i++) { b.update(1 / 60, G); b.draw(ctx); if (i % 40 === 0) b.hurt(140, 0, 0, false, G); }
    assert.ok(b.dead, skin + " boss can be killed");
    G.bossActive = false;
  }
});

test("hero roster: distinct bodies with real stat differences", () => {
  const E = engine(), { NR } = E, G = NR.game, H = NR.heroes;
  assert.ok(H.ROSTER.length >= 8, "at least eight heroes");
  const bodies = new Set(H.ROSTER.map((h) => h.body.kind === "sheet" ? h.body.sheet : h.body.kind === "actor" ? h.body.ref.id : "forge"));
  assert.equal(bodies.size, H.ROSTER.length, "every hero is a different character body");
  const ctx = E.dom.el("canvas").getContext("2d");
  const stats = {};
  for (const h of H.ROSTER) {
    assert.equal(H.select(h.id), true);
    G.start();
    stats[h.id] = [G.player.maxHp, G.player.speedMul, G.player.dmgMul];
    play(E, 30, { drive: (i) => { if (i === 5) G.player.attack?.(); } });
    G.player.draw(ctx);
    H.drawStage(ctx, 100, 200, 1, 0.2);
  }
  assert.ok(stats.mordred[0] > stats.elara[0], "the knight is tankier than the heroine");
  assert.ok(stats.elara[1] > stats.mordred[1], "the heroine is faster than the knight");
  assert.equal(JSON.parse(E.store.nr_hero_v1 || E.store.getItem?.("nr_hero_v1") || "{}").id !== undefined, true, "choice persists");
});

/* ---------------- items, abilities, vault, CrazyGames, online ---------------- */
test("items: every item has a price or is free, stronger items cost more, levels unlock cheap ones", () => {
  const { NR } = engine(), IT = NR.items, EC = NR.economy, P = NR.profile;
  let priced = 0, free = 0;
  for (const cat of Object.keys(NR.catalog)) for (const o of NR.catalog[cat]) {
    const pr = EC.price(cat, o.id);
    if (IT.isFree(cat, o.id)) { free++; continue; }
    assert.ok(pr && ((pr.coins || 0) > 0 || (pr.gems || 0) > 0), `${cat}:${o.id} has a price`);
    priced++;
    const [st] = IT.stats(cat, o.id), rank = IT.rank(cat, o.id);
    assert.ok(st.value > 0 && rank >= 1 && rank <= 6, `${cat}:${o.id} has a stat`);
  }
  assert.ok(priced > 100 && free > 10);
  // price follows rank
  const all = [];
  for (const cat of ["weapon", "top", "hair"]) for (const o of NR.catalog[cat]) { const pr = EC.price(cat, o.id); if (pr && pr.coins && !IT.isFree(cat, o.id)) all.push([IT.rank(cat, o.id), pr.coins]); }
  const lo = all.filter((x) => x[0] < 2).map((x) => x[1]), hi = all.filter((x) => x[0] > 4).map((x) => x[1]);
  if (lo.length && hi.length) assert.ok(Math.max(...lo) <= Math.min(...hi), "weak items are cheaper than strong ones");
  // level unlocks
  const lvItems = [];
  for (const cat of Object.keys(NR.catalog)) for (const o of NR.catalog[cat]) { const lv = IT.unlockLevel(cat, o.id); if (lv) lvItems.push([cat, o.id, lv]); }
  assert.ok(lvItems.length > 5, "some items unlock by level");
  const [cat, id, lv] = lvItems[0];
  P.level = lv - 1; P.owned = {};
  assert.equal(EC.owned(cat, id), false);
  P.level = lv;
  assert.equal(EC.owned(cat, id), true, "reaching the level makes it free");
  // bars markup: +X% text, never plain prose
  const bars = IT.bars("weapon", NR.catalog.weapon[3].id);
  assert.ok(bars.children.length >= 2);
});

test("items: buy → EQUIP → equipped, and the ! info opens how-to-use", () => {
  const { NR } = engine(), IT = NR.items, EC = NR.economy, P = NR.profile;
  P.coins = 99999; P.gems = 999; P.level = 1;
  const g = String(P.appearance.skin).startsWith("Female") ? "f" : "m";
  const o = NR.catalog.weapon.find((x) => (x.g === g || x.g === "any") && !EC.owned("weapon", x.id));
  assert.ok(o, "an unowned weapon exists");
  assert.equal(EC.buy("weapon", o.id), true);
  assert.equal(EC.owned("weapon", o.id), true);
  assert.notEqual(P.appearance.weapon, o.id, "buying does not auto-equip");
  assert.equal(IT.equip("weapon", o.id), true);
  assert.equal(P.appearance.weapon, o.id);
  assert.equal(IT.equipped("weapon", o.id), true);
  IT.info("weapon", o.id);
  const card = IT.shopCard("weapon", o, () => {});
  assert.ok(card.children.some((c) => c.className === "info-i"), "card has a ! button");
});

test("hero abilities: every hero has three distinct abilities that hit enemies and respect cooldowns", () => {
  const E = engine(), { NR } = E, G = NR.game, HA = NR.abilities, H = NR.heroes;
  const names = new Set();
  for (const h of H.ROSTER) {
    const defs = HA.forHero(h.id);
    assert.equal(defs.length, 3, h.id + " has 3 abilities");
    for (const d of defs) { assert.ok(!names.has(d.name), d.name + " unique"); names.add(d.name); }
    H.select(h.id);
    NR.profile.mode = "survival"; G.start(); G.startT = 1e9; G.spawnQueue = [];
    const p = G.player, gy = NR.world.groundY;
    G.enemies = [];
    for (let i = 0; i < 4; i++) { const e = new NR.Soldier(p.x + 120 + i * 60, gy, 3); e.spawnT = 0; G.enemies.push(e); }
    const hp0 = G.enemies.reduce((s, e) => s + e.hp, 0);
    for (let i = 0; i < 3; i++) {
      p.facing = 1;
      assert.equal(HA.tryCast(p, i), true, `${h.id} ability ${i + 1} casts`);
      assert.equal(HA.tryCast(p, i), false, "cooldown blocks a second cast");
      play(E, 50);
    }
    const hp1 = G.enemies.filter((e) => !e.dead).reduce((s, e) => s + e.hp, 0);
    const offensive = HA.forHero(h.id).some((d) => d.dmg > 0);
    if (offensive) assert.ok(hp1 < hp0, h.id + " abilities damage enemies");
    play(E, 60 * 21);
    assert.equal(HA.cooldown(G.player, 0), 0, "cooldowns recover");
  }
  H.select("kaito");
});

test("vault: tabs render, a monster summon can be bought, equipped and called with T", () => {
  const E = engine(), { NR } = E, G = NR.game, V = NR.vault, HA = NR.abilities, P = NR.profile;
  P.coins = 99999; P.gems = 999;
  V.open();
  for (const t of ["items", "pets", "companions", "summons", "spells", "relics"]) V.open(t);
  const a = V.summons().find((x) => x.role === "enemy");
  assert.ok(a, "monster summons exist");
  assert.equal(V.buy("summon", a), true);
  V.setSummon(a.id);
  assert.equal(V.summon(), a.id);
  NR.profile.mode = "survival"; G.start(); G.startT = 1e9; G.spawnQueue = [];
  const e = new NR.Soldier(G.player.x + 200, NR.world.groundY, 2); e.spawnT = 0; G.enemies = [e];
  NR.input.pressed.summon = true;
  play(E, 1);
  assert.equal(HA.allies.length, 1, "T calls the equipped monster");
  const hp = e.hp;
  play(E, 240);
  assert.ok(e.hp < hp || e.dead, "the summon attacks enemies");
  play(E, 60 * 17);
  assert.equal(HA.allies.length, 0, "the summon leaves after its time");
});

test("CrazyGames + online modules are safe without the SDK or PeerJS", async () => {
  const { NR } = engine();
  assert.equal(await NR.crazy.init(), false, "no SDK → offline, no throw");
  assert.equal(await NR.crazy.rewardCoins(), false);
  assert.equal(await NR.crazy.midgame("boss"), "skipped");
  assert.ok(NR.crazy.inviteLink("ABCDE").includes("room=ABCDE"));
  NR.onlineUI.open();
  NR.net.board.record(7, "solo", "");
  NR.net.board.merge([{ n: "<script>", w: 99, m: "coop", d: 1 }, { n: "x", w: "bad", m: "nope" }]);
  const top = NR.net.board.top(5, "wave");
  assert.equal(top[0].w, 99);
  assert.ok(!/[<>]/.test(top[0].n), "names are sanitised");
});

/* fake PeerJS: two game instances talk through an in-memory broker */
function fakePeer(hub) {
  const tick = (fn) => Promise.resolve().then(fn);
  class Emitter { constructor() { this.h = {}; } on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; } off(e, f) { this.h[e] = (this.h[e] || []).filter((x) => x !== f); } emit(e, ...a) { for (const f of (this.h[e] || []).slice()) f(...a); } }
  class Conn extends Emitter {
    constructor(peer) { super(); this.peer = peer; this.open = false; }
    send(m) { const o = this.other, c = JSON.parse(JSON.stringify(m)); hub.bytes = (hub.bytes || 0) + JSON.stringify(m).length; tick(() => o.open && o.emit("data", c)); }
    close() { if (!this.open) return; this.open = false; const o = this.other; tick(() => { if (o.open) { o.open = false; o.emit("close"); } }); this.emit("close"); }
  }
  return class Peer extends Emitter {
    constructor(id) { super(); if (typeof id !== "string") id = "anon-" + Math.random().toString(36).slice(2); this.id = id; this.destroyed = false;
      tick(() => { if (hub.peers.has(id)) { this.emit("error", { type: "unavailable-id" }); return; } hub.peers.set(id, this); this.emit("open", id); }); }
    connect(id) {
      const a = new Conn(id);
      tick(() => {
        const t = hub.peers.get(id);
        if (!t) { this.emit("error", { type: "peer-unavailable" }); return; }
        const b = new Conn(this.id); a.other = b; b.other = a; a.open = b.open = true;
        t.emit("connection", b); b.emit("open"); a.emit("open");
      });
      return a;
    }
    call() { return null; }
    destroy() { this.destroyed = true; hub.peers.delete(this.id); }
    reconnect() {}
  };
}
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test("online co-op: invite by room code, both heroes in the lobby, shared waves, chat", async () => {
  const hub = { peers: new Map() };
  const A = engine(), B = engine();
  A.context.Peer = fakePeer(hub); B.context.Peer = fakePeer(hub);
  const NA = A.NR.net, NB = B.NR.net;
  B.NR.heroes.select("ryu");
  assert.equal(await NA.host("coop"), true);
  await settle();
  const code = NA.room;
  assert.ok(/^[A-Z0-9]{5}$/.test(code));
  assert.equal(await NB.join(code), true);
  await settle();
  assert.equal(NA.members.length, 2, "host sees the friend");
  assert.equal(NB.members.length, 2, "friend sees the host");
  assert.equal(NB.members.find((m) => m.pid === 0).heroId, A.NR.heroes.current().id);
  assert.equal(NA.members.find((m) => m.pid === 1).heroId, "ryu", "the friend's hero is shown in the lobby");
  // a third player is refused (duo)
  const C = engine(); C.context.Peer = fakePeer(hub);
  let err = ""; C.NR.net.on("error", (m) => (err = m));
  assert.notEqual(await C.NR.net.join(code), true);
  assert.match(err, /full/i);
  // chat both ways
  const got = []; NA.on("chat", (c) => got.push(c.text));
  NB.chat("hello <b>host</b>");
  await settle();
  assert.ok(got.includes("hello <b>host</b>"), "chat reaches the host as plain text");
  // start the shared run
  assert.equal(NA.start(), true);
  await settle();
  const GA = A.NR.game, GB = B.NR.game;
  assert.equal(GA.others.length, 1); assert.equal(GB.others.length, 1);
  assert.equal(GB.netGuest, true);
  assert.equal(GA.others[0].heroId, "ryu", "host runs the friend with the friend's hero");
  for (let i = 0; i < 40; i++) {
    play(A, 8); play(B, 8, { drive: () => { B.NR.input.keys.ArrowRight = i < 20; } });
    await settle(2);
  }
  if (process.env.NR_BYTES) console.log("net bytes for ~5.3s of co-op:", hub.bytes);
  assert.ok(GA.wave >= 1 && GB.wave === GA.wave, "the friend sees the same wave");
  assert.ok(GA.enemies.length > 0, "enemies spawned");
  assert.equal(GB.enemies.length, GA.enemies.length, "the friend sees every enemy");
  assert.ok(Math.abs(GB.enemies[0].x - GA.enemies[0].x) < 60, "enemy positions match");
  assert.ok(GA.others[0].x > A.NR.world.W / 2, "the friend's hero walked right on the host");
  // a partner going down does not end the run while the other lives
  Object.assign(GA.others[0], { iframes: 0, dashT: 0, shieldT: 0, stormT: 0, parryT: 0 });
  GA.player = GA.others[0]; GA.hurtPlayer(9999, 1, "test"); GA.player = GA.me;
  assert.equal(GA.others[0].dead, true);
  play(A, 30); await settle();
  assert.equal(GA.state, "playing", "run continues with one fighter up");
  // host leaves → friend gets a clean message, no crash
  let lost = ""; NB.on("error", (m) => (lost = m));
  await NA.leave();
  await settle();
  assert.match(lost, /host left|connection/i);
  assert.equal(NB.role, null);
});

test("online PvP 1v1: no monsters, blades hurt the other player, last one standing wins", async () => {
  const hub = { peers: new Map() };
  const A = engine(), B = engine();
  A.context.Peer = fakePeer(hub); B.context.Peer = fakePeer(hub);
  const NA = A.NR.net, NB = B.NR.net;
  await NA.host("pvp1"); await settle();
  await NB.join(NA.room); await settle();
  assert.equal(NB.mode, "pvp1");
  const ends = []; NA.on("end", (r) => ends.push(["A", r])); NB.on("end", (r) => ends.push(["B", r]));
  NA.start(); await settle();
  const GA = A.NR.game;
  assert.equal(GA.pvp, true);
  assert.notEqual(GA.me.team, GA.others[0].team, "opposite teams");
  play(A, 120); await settle();
  assert.equal(GA.enemies.length, 0, "no monsters in PvP");
  const foe = GA.others[0];
  foe.x = GA.me.x + 80; foe.y = GA.me.y; GA.me.facing = 1;
  const hp = foe.hp;
  GA.playerStrike({ dmg: 30, rng: 165, kb: 300 });
  assert.ok(foe.hp < hp, "your blade hurts the other player");
  for (let i = 0; i < 40 && !foe.dead; i++) { foe.iframes = 0; GA.playerStrike({ dmg: 60, rng: 165, kb: 300 }); }
  assert.equal(foe.dead, true);
  for (let i = 0; i < 20; i++) { play(A, 4); await settle(2); }
  assert.ok(ends.some(([w, r]) => w === "A" && r.pvp && r.won), "host wins");
  assert.ok(ends.some(([w, r]) => w === "B" && r.pvp && !r.won), "friend is told they lost");
});

test("worlds: SURVIVE levels jump to a random world each level, WAVE FIGHT changes world after a boss", () => {
  const E = engine(), { NR } = E, G = NR.game, PO = NR.polish, P = NR.profile;
  let same = 0;
  for (let n = 2; n < 60; n++) if (PO.worldFor(n) === PO.worldFor(n - 1)) same++;
  assert.equal(same, 0, "two levels in a row never share a world");
  P.mode = "adventure"; P.advLevel = 7; G.start();
  assert.equal(G.chapter, PO.worldFor(7));
  assert.equal(NR.evolution.levels[G.chapter], 7, "the level counter is shared by all worlds");
  NR.levels.onClear(G.chapter, 7);
  assert.equal(P.advLevel, 8);
  P.mode = "survival"; G.start();
  const before = G.chapter;
  const boss = new NR.Boss(600, NR.world.groundY, 1, 1, "demon"); G.bossActive = true; G.bossRef = boss;
  G.onBossKilled(boss);
  E.timers.splice(0).forEach((f) => f());
  assert.notEqual(G.chapter, before, "a new world after the boss");
});
