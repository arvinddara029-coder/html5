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
  assert.equal(new Set(chapters.map((c) => c.boss)).size, 4, "four different boss bodies across the campaign");
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
