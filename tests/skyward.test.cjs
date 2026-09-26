/* Skyward systems: asset catalog, economy, character renderer, sprite enemies. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

/* Headless harness: real canvas-less stubs, but real module graph. */
function skyward(seed = {}) {
  const data = { ...seed },
    nodes = {};
  const noop = () => {};
  const ctx2d = () => ({
    imageSmoothingEnabled: false,
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
  const context = {
    console, Math, JSON, Date, Set, Number, String, Array, Object,
    performance: { now: () => 1000 },
    setInterval: noop, setTimeout: noop, clearInterval: noop, clearTimeout: noop,
    matchMedia: () => ({ matches: false }),
    navigator: { maxTouchPoints: 0 },
    localStorage: {
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => (data[k] = String(v)),
    },
    document: {
      hidden: false,
      addEventListener: noop,
      querySelectorAll: () => [],
      getElementById: (id) =>
        nodes[id] ||
        (nodes[id] = {
          textContent: "", hidden: false, disabled: false, value: "", dataset: {},
          classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
          style: {}, append: noop, replaceChildren: noop, focus: noop,
          addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
          getContext: () => ctx2d(), parentElement: { addEventListener: noop },
        }),
      createElement: (tag) =>
        tag === "canvas"
          ? { width: 0, height: 0, style: {}, getContext: () => ctx2d() }
          : { style: {} },
    },
  };
  context.window = context;
  context.addEventListener = noop;
  context.innerWidth = 1280;
  context.innerHeight = 800;
  context.Image = function () {
    return { set src(v) {}, get src() { return ""; } };
  };
  vm.createContext(context);
  const mods = [
    "utils", "assetlib", "profile", "economy", "progression", "save-transfer",
    "characters", "character", "input", "audio", "sprites", "spriterender",
    "particles", "world", "projectiles", "combat", "player", "enemies",
    "expedition-enemies", "adventure", "upgrades",
  ];
  for (const name of mods)
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", name + ".js"), "utf8"),
      context,
      { filename: name + ".js" },
    );
  const NR = context.NR;
  NR.hud = { banners: [], update: noop, banner: noop, flash: noop, hurtVign: 0 };
  NR.ui = { hideAll: noop, show: noop, refreshHigh: noop, openUpgrades: noop, showGameOver: noop };
  NR.hub = { notify: noop, setWorld: noop, setDifficulty: noop };
  NR.expeditionUI = { refresh: noop, syncRun: noop, showVictory: noop };
  NR.view = { w: 1280, h: 940 };
  NR.audio = NR.audio || {};
  NR.audio.play = noop;
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/game.js"), "utf8"),
    context,
    { filename: "game.js" },
  );
  return { NR, data, context };
}

/* ---------------- asset catalog ---------------- */
test("every catalog, sheet and texture path exists on disk", () => {
  const { NR } = skyward();
  let total = 0;
  for (const cat of Object.keys(NR.catalog))
    for (const o of NR.catalog[cat]) {
      total++;
      assert.ok(
        fs.existsSync(path.join(root, "assets", o.path)),
        `${cat}:${o.id} -> ${o.path}`,
      );
      assert.ok(o.name && o.name.length, `${cat}:${o.id} needs a name`);
      assert.ok(["m", "f", "any"].includes(o.g), `${cat}:${o.id} gender`);
    }
  for (const key of Object.keys(NR.sheets))
    for (const a of Object.keys(NR.sheets[key].anims)) {
      total++;
      const def = NR.sheets[key].anims[a];
      assert.ok(fs.existsSync(path.join(root, "assets", def.path)), `${key}.${a}`);
      assert.ok(def.frames >= 1 && def.frames <= 20, `${key}.${a} frames`);
    }
  for (const t of Object.keys(NR.textures))
    for (const p of NR.textures[t]) {
      total++;
      assert.ok(fs.existsSync(path.join(root, "assets", p)), `texture ${t}:${p}`);
    }
  assert.ok(total > 250, `expected a large catalog, saw ${total}`);
});

test("catalog ids are unique per category and gender-tagged", () => {
  const { NR } = skyward();
  for (const cat of Object.keys(NR.catalog)) {
    const ids = NR.catalog[cat].map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${cat}`);
  }
});

test("character renderer builds every animation row for a full look", () => {
  const { NR } = skyward();
  const look = NR.profile.appearance;
  const built = NR.char.build(look);
  for (const anim of NR.char.ANIMS) {
    assert.ok(built.anims[anim] && built.anims[anim].length, `missing ${anim}`);
  }
  assert.equal(built.anims.idle.length, 5);
  assert.equal(built.anims.walk.length, 8);
  assert.equal(built.anims.run.length, 8);
  assert.equal(built.anims.jump.length, 4);
  assert.equal(built.anims.fall.length, 4);
  assert.equal(built.anims.attack.length, 6);
  assert.equal(built.anims.hurt.length, 10);
  // caching returns the same object
  assert.equal(NR.char.build(look), built);
});

test("character actor advances frames and plays one-shot attacks", () => {
  const { NR } = skyward();
  const a = NR.char.actor(NR.profile.appearance);
  a.play("walk");
  const start = a.frame;
  for (let i = 0; i < 20; i++) a.update(0.1);
  assert.ok(a.frame !== start || a.anim === "walk");
  a.play("attack", true);
  assert.equal(a.anim, "attack");
  a.update(0.5);
  assert.ok(a.lockT <= 0);
});

test("pet frames slice into strips", () => {
  const { NR } = skyward();
  const frames = NR.char.petFrames("GandalfHardcore Wisp.png");
  assert.equal(frames.length, 5);
  const dog = NR.char.petFrames("GandalfHardcore fox.png");
  assert.equal(dog.length, 6);
});

/* ---------------- economy ---------------- */
test("level curve, purchases and level bonus behave", () => {
  const { NR } = skyward();
  const P = NR.profile;
  P.coins = 1000; P.gems = 5; P.xp = 0; P.level = 1;
  const E = NR.economy;
  assert.equal(E.xpForLevel(1), 120);
  assert.equal(E.xpForLevel(2), 210);
  const at = E.levelFromXp(120);
  assert.equal(at.level, 2);
  assert.equal(at.into, 0);
  // buy a coin item
  assert.ok(E.price("hat", "mMale Blue cap").coins > 0);
  assert.ok(E.buy("hat", "mMale Blue cap"));
  assert.ok(E.owned("hat", "mMale Blue cap"));
  assert.ok(P.coins < 1000);
  // cannot re-buy
  assert.ok(!E.buy("hat", "mMale Blue cap"));
  // gem item without gems fails
  P.gems = 0;
  assert.ok(!E.buy("hat", "fFemale Santa hat"));
  P.gems = 99;
  assert.ok(E.buy("hat", "fFemale Santa hat"));
  // level up grants a coin bonus
  const before = P.level;
  E.applyXp(100000);
  assert.ok(P.level > before);
  assert.ok(P.coins > 0);
  const bonus = E.levelBonus();
  assert.ok(bonus.hp > 1 && bonus.damage > 1);
});

test("run rewards convert score and kills into coins and xp", () => {
  const { NR } = skyward();
  const P = NR.profile;
  P.coins = 0; P.xp = 0; P.level = 1;
  const r = NR.economy.awardRun({ score: 12000, kills: 40, wave: 6 });
  assert.ok(r.coins > 0 && r.xp > 0);
  assert.ok(P.level > 1);
});

/* ---------------- sprite enemies ---------------- */
test("slime and soldier enemies are registered and simulate", () => {
  const { NR } = skyward();
  assert.equal(typeof NR.Slime, "function");
  assert.equal(typeof NR.Soldier, "function");
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  const slime = new NR.Slime(400, NR.world.groundY, 1);
  const soldier = new NR.Soldier(G.player.x - 240, NR.world.groundY, 1);
  soldier.spawnT = 0;
  slime.spawnT = 0;
  assert.equal(slime.type, "slime");
  assert.equal(soldier.type, "soldier");
  for (let i = 0; i < 30; i++) {
    slime.update(0.016, G);
    soldier.update(0.016, G);
  }
  // soldier eventually shoots a bolt at the player
  let sawBolt = false;
  for (let i = 0; i < 400 && !sawBolt; i++) {
    soldier.update(0.016, G);
    if (G.bolts.length) sawBolt = true;
  }
  assert.ok(sawBolt, "soldier should fire a bolt");
  // death spawns a corpse that expires
  const before = G.corpses.length;
  slime.die(G);
  assert.equal(G.corpses.length, before + 1);
  NR.spriteRender.updateCorpses(G, 1);
  assert.equal(G.corpses.length, before);
});

test("crawler uses the orc sheet and death spawns a corpse", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  const c = new NR.Crawler(300, NR.world.groundY, 1);
  c.update(0.016, G);
  assert.equal(c.spr.sheet, "orc");
  const n = G.corpses.length;
  c.die(G);
  assert.equal(G.corpses.length, n + 1);
  assert.ok(c.dead);
});

test("wave composition includes slimes and soldiers", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  // jump the countdown straight into wave 4
  G.wave = 3;
  G.startT = 0.4;
  G.enemies.length = 0;
  G.spawnQueue.length = 0;
  G.bossActive = false;
  G.player.dead = false;
  const types = new Set();
  for (let i = 0; i < 80; i++) {
    G.update(0.05, 0.05);
    for (const q of G.spawnQueue) types.add(q.type);
    for (const e of G.enemies) types.add(e.type);
    if (types.has("slime") && types.has("soldier")) break;
  }
  assert.equal(G.wave, 4, "countdown should open wave 4");
  assert.ok(types.has("slime"), "wave 4 should field slimes");
  assert.ok(types.has("soldier"), "wave 4 should field soldiers");
  assert.ok(types.has("crawler"), "wave 4 should field crawlers");
});

/* ---------------- profile integrity ---------------- */
test("appearance defaults are valid catalog ids", () => {
  const { NR } = skyward();
  const P = NR.profile;
  for (const [key, val] of Object.entries(P.appearance)) {
    if (!val) continue;
    const ok = (NR.catalog[key] || []).some((o) => o.id === val);
    assert.ok(ok, `appearance.${key} = ${val} is not a catalog id`);
  }
  assert.ok(P.level >= 1);
  assert.ok(typeof P.coins === "number" && typeof P.gems === "number");
});

test("a hostile saved appearance falls back to defaults", () => {
  const { NR } = skyward({
    nr_profile: JSON.stringify({
      appearance: { skin: "../../etc/passwd", hair: "nope", weapon: 42 },
      level: -5, coins: "lots", gems: null, owned: "bad",
    }),
  });
  const P = NR.profile;
  assert.equal(P.appearance.skin, "Male Skin1");
  assert.equal(P.appearance.hair, "Male Hair10");
  assert.equal(P.appearance.weapon, "mWooden Sword");
  assert.equal(P.level, 1);
  assert.equal(P.coins, 500);
  assert.equal(P.gems, 10);
  assert.equal(Object.keys(P.owned).length, 0);
});

test("lobby and profile default looks agree", () => {
  const { NR } = skyward();
  const lobbySrc = fs.readFileSync(path.join(root, "js/lobby.js"), "utf8");
  const m = lobbySrc.match(/skin: "([^"]+)", monster: "", hair: "([^"]+)", ears: "",\s*top: "([^"]+)", bottom: "([^"]+)", underwear: "([^"]+)", shoes: "([^"]+)",\s*gloves: "([^"]+)", hat: "", mask: "", back: "", weapon: "([^"]+)"/);
  assert.ok(m, "lobby default look not found");
  const A = NR.profile.appearance;
  assert.equal(m[1], A.skin);
  assert.equal(m[2], A.hair);
  assert.equal(m[3], A.top);
  assert.equal(m[4], A.bottom);
  assert.equal(m[5], A.underwear);
  assert.equal(m[6], A.shoes);
  assert.equal(m[7], A.gloves);
  assert.equal(m[8], A.weapon);
});
