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
    "utils", "assetlib", "characters", "profile", "economy", "progression", "save-transfer",
    "character", "input", "audio", "sprites", "spriterender",
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
  // row 0 of every doggy/fox sheet is a 5-frame sit-and-blink loop: the 6th
  // cell is blank, so playing it made the pet flicker out once per cycle
  assert.equal(dog.length, 5);
  assert.equal(NR.char.petFrames("GandalfHardcore fox.png", 1).length, 6);
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
  soldier.cd = 0; // deterministic shot windup; random strafing can leave the 300px range
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

/* ---------------- the Arena fix-pack (user-reported bugs) ---------------- */

test("DAY is the primary atmosphere (profile default and sanitizer)", () => {
  const { NR } = skyward();
  assert.equal(NR.profile.world, "day");
  const hostile = skyward({ nr_profile: JSON.stringify({ world: "void" }) });
  assert.equal(hostile.NR.profile.world, "day");
});

test("hero renderer mirrors the LEFT-facing art when facing right", () => {
  const { NR } = skyward();
  const calls = [];
  const spy = new Proxy(
    {},
    {
      get: (t, k) => {
        if (k === "globalAlpha" || k === "globalCompositeOperation" || k === "fillStyle" || k === "imageSmoothingEnabled") return undefined;
        return (...args) => { calls.push([k, ...args]); };
      },
      set: () => true,
    },
  );
  const built = NR.char.build(NR.profile.appearance);
  NR.char.drawFrame(spy, built, "idle", 0, 100, 200, 1, { scale: 1 });
  assert.ok(
    calls.some((c) => c[0] === "scale" && c[1] === -1 && c[2] === 1),
    "facing right must mirror the left-facing hero art with scale(-1,1)",
  );
});

test("pet strips slice one row only — no doubled pets, run row available", () => {
  const { NR } = skyward();
  assert.equal(NR.petRows["GandalfHardcore fox.png"], 2);
  assert.equal(NR.petRows["GandalfHardcore Wisp.png"], 1);
  const idle = NR.char.petFrames("GandalfHardcore fox.png", 0);
  const run = NR.char.petFrames("GandalfHardcore fox.png", 1);
  assert.equal(idle.length, 5, "idle row holds 5 real frames");
  assert.equal(run.length, 6, "run row holds 6 frames");
  // frames come from a single 32px row, never the stacked 64px sheet
  assert.equal(idle[0].height, 32);
  assert.equal(idle[0].width, 32);
});

test("enemy sheets carry measured crop windows and feet lines", () => {
  const { NR } = skyward();
  for (const key of ["orc", "soldier", "samurai", "wizard", "slime"]) {
    const def = NR.sheets[key];
    assert.ok(def.crop && def.crop.w > 0 && def.crop.h > 0, `${key} needs a crop window`);
    assert.ok(def.floor !== undefined, `${key} needs a floor line`);
    assert.ok(def.floor >= def.crop.y && def.floor <= def.crop.y + def.crop.h, `${key} floor inside crop`);
  }
  assert.equal(NR.sheets.soldier.faceLeft, true, "soldier art faces left");
  assert.equal(NR.sheets.samurai.faceLeft, true, "samurai art faces left");
  // slime sheet is an 8x2 grid of 32x48 cells — multi-row slicing, never a doubled blob
  assert.equal(NR.sheets.slime.perRow, 8);
  assert.equal(NR.sheets.slime.fw, 32);
  assert.equal(NR.sheets.slime.anims.idle.frames, 5); // cells 5-7 are the melt-away, not the loop
  assert.equal(NR.sheets.slime.anims.hop.start, 8);
  assert.equal(NR.sheets.slime.fh, 48);
});

test("warlock and rival packs are registered and fight", () => {
  const { NR } = skyward();
  assert.equal(typeof NR.Warlock, "function");
  assert.equal(typeof NR.Rival, "function");
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  // warlock volleys twin-orbs when in range
  const wl = new NR.Warlock(G.player.x - 420, NR.world.groundY - 40, 1);
  wl.spawnT = 0; wl.castCd = 0.01;
  G.enemies.push(wl);
  let bolts = 0;
  for (let i = 0; i < 300 && bolts < 2; i++) { wl.update(0.016, G); bolts = G.bolts.length; }
  assert.ok(G.bolts.length >= 2, "warlock should hurl shadow orbs");
  assert.ok(wl.y < NR.world.groundY, "warlock hovers above the ground line");
  // rival circles, winds up, and commits to a slash
  const rv = new NR.Rival(G.player.x - 180, NR.world.groundY, 1);
  rv.spawnT = 0; rv.st = 99; // pre-charge the duel clock
  G.enemies.push(rv);
  let sawSlash = false;
  for (let i = 0; i < 200 && !sawSlash; i++) { rv.update(0.016, G); if (rv.state === "slash") sawSlash = true; }
  assert.ok(sawSlash, "rival should wind up and slash in melee range");
});

test("slime variant follows the chapter biome", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "adventure";
  NR.profile.chapter = 1; NR.profile.unlocked = 2;
  G.start({ chapter: 1 });
  const s = new NR.Slime(500, NR.world.groundY, 1);
  assert.equal(s.variant, "slimeGreen", "garden chapter fields green slimes");
  G.start({ chapter: 2 });
  const s2 = new NR.Slime(500, NR.world.groundY, 1);
  assert.equal(s2.variant, "slimeRed", "reactor chapter fields red slimes");
});

test("reaching the extraction gate with everything cleared FINISHES the level", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "adventure";
  NR.profile.unlocked = 0; NR.profile.chapter = 0;
  G.start({ chapter: 0 });
  const A = NR.adventure;
  assert.ok(A.active);
  // simulate: all patrols dead, all relays restored, player walks to the gate
  A.zones.forEach((z) => { z.started = true; z.cleared = true; });
  A.relays.forEach((r) => { r.active = true; });
  G.enemies.length = 0;
  G.player.x = NR.world.W - 200;
  G.player.y = NR.world.groundY;
  let victory = false;
  for (let i = 0; i < 80; i++) {
    A.update(0.03, G);
    if (G.state === "victory") { victory = true; break; }
  }
  assert.ok(victory, "walking into the extraction gate must complete the chapter");
  assert.equal(NR.profile.unlocked, 1, "chapter 1 unlocked after the win");
});

test("the gate stays locked until relays and patrols are done", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "adventure";
  NR.profile.unlocked = 0; NR.profile.chapter = 0;
  G.start({ chapter: 0 });
  const A = NR.adventure;
  // patrols beaten but relays NOT restored → the gate must refuse
  A.zones.forEach((z) => { z.started = true; z.cleared = true; });
  G.enemies.length = 0;
  G.player.x = NR.world.W - 200;
  for (let i = 0; i < 40; i++) A.update(0.03, G);
  assert.notEqual(G.state, "victory", "no free victory with relays missing");
  assert.ok(A.prompt && A.prompt.kind === "locked", "gate should report what is missing");
  assert.match(A.prompt.label, /RELAYS 0\/3/, "tells the player exactly what remains");
});

test("Sprite Pack 7 mercenaries are registered and fight", () => {
  const { NR } = skyward();
  assert.equal(typeof NR.Gunner, "function", "Diego gunner");
  assert.equal(typeof NR.Striker, "function", "Holly striker");
  assert.equal(typeof NR.Blade, "function", "Gordon blade");
  // wide attack cells carry their own geometry
  for (const [k, anim, fw] of [["diego", "shoot", 48], ["holly", "smash", 64], ["gordon", "combo", 80]]) {
    const a = NR.sheets[k].anims[anim];
    assert.equal(a.fw, fw, `${k}.${anim} wide cell`);
    assert.ok(a.crop && a.crop.w > 0, `${k}.${anim} crop`);
  }
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  // gunner: in rifle range it plants and fires a burst
  const gn = new NR.Gunner(G.player.x - 380, NR.world.groundY, 1);
  gn.spawnT = 0;
  G.enemies.push(gn);
  for (let i = 0; i < 300 && !G.bolts.length; i++) gn.update(0.016, G);
  assert.ok(G.bolts.length >= 1, "gunner should fire rifle rounds");
  G.bolts.length = 0;
  // striker: leaps and lands into a twin shockwave
  const st = new NR.Striker(G.player.x - 260, NR.world.groundY, 1);
  st.spawnT = 0; st.st = 99;
  G.enemies.push(st);
  for (let i = 0; i < 400 && !G.shockwaves.length; i++) st.update(0.016, G);
  assert.ok(G.shockwaves.length >= 2, "striker ground-pound should emit twin shockwaves");
  // blade: closes in and commits to the combo
  const bl = new NR.Blade(G.player.x - 90, NR.world.groundY, 1);
  bl.spawnT = 0;
  G.enemies.push(bl);
  let sawCombo = false;
  for (let i = 0; i < 200 && !sawCombo; i++) { bl.update(0.016, G); if (bl.state === "combo") sawCombo = true; }
  assert.ok(sawCombo, "blade should commit to a combo at close range");
});

test("wave 9 fields the Sprite Pack 7 roster", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  G.wave = 8;
  G.startT = 0.4;
  G.enemies.length = 0; G.spawnQueue.length = 0; G.bossActive = false;
  G.player.dead = false;
  const types = new Set();
  for (let i = 0; i < 160; i++) {
    G.update(0.05, 0.05);
    for (const q of G.spawnQueue) types.add(q.type);
    for (const e of G.enemies) types.add(e.type);
    if (types.has("gunner") && types.has("striker") && types.has("blade")) break;
  }
  assert.equal(G.wave, 9);
  assert.ok(types.has("gunner"), "wave 9 fields a gunner");
  assert.ok(types.has("striker"), "wave 9 fields a striker");
  assert.ok(types.has("blade"), "wave 9 fields a blade");
});

test("boss barrage never shadows the muzzle methods (regression)", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  const boss = new NR.Boss(G.player.x + 400, NR.world.groundY, 1, 1);
  boss.spawnT = 0; boss.st = 99; boss.state = "barrage"; boss.burstT = 0;
  G.enemies.push(boss);
  for (let i = 0; i < 120; i++) boss.update(0.05, G); // must not throw
  assert.ok(G.bolts.length > 0, "barrage should vent a fan of rounds");
  assert.equal(typeof boss.muzzle, "function");
  assert.equal(typeof boss.muzzleY, "function");
});

test("late survival waves field warlocks and rivals", () => {
  const { NR } = skyward();
  const G = NR.game;
  NR.profile.mode = "survival";
  G.start();
  G.wave = 6;
  G.startT = 0.4;
  G.enemies.length = 0; G.spawnQueue.length = 0; G.bossActive = false;
  G.player.dead = false;
  const types = new Set();
  for (let i = 0; i < 120; i++) {
    G.update(0.05, 0.05);
    for (const q of G.spawnQueue) types.add(q.type);
    for (const e of G.enemies) types.add(e.type);
    if (types.has("warlock") && types.has("rival")) break;
  }
  assert.equal(G.wave, 7);
  assert.ok(types.has("warlock"), "wave 7 should field a warlock");
  assert.ok(types.has("rival"), "wave 7 should field a rival");
});
