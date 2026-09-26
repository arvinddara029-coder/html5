const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function engine(seed = {}) {
  const data = { ...seed },
    nodes = {};
  const noop = () => {};
  const context = {
    console,
    Math,
    JSON,
    Date,
    Set,
    Number,
    String,
    Array,
    Object,
    performance: { now: () => 1000 },
    setInterval: noop,
    setTimeout: noop,
    clearInterval: noop,
    clearTimeout: noop,
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
          textContent: "",
          classList: { toggle: noop },
          style: {},
        }),
      createElement: (tag) => {
        if (tag !== "canvas") return { style: {} };
        const ctx2d = {
          canvas: null,
          imageSmoothingEnabled: false,
          drawImage: noop,
          clearRect: noop,
          fillRect: noop,
          fill: noop,
          stroke: noop,
          save: noop,
          restore: noop,
          translate: noop,
          scale: noop,
          rotate: noop,
          beginPath: noop,
          closePath: noop,
          moveTo: noop,
          lineTo: noop,
          ellipse: noop,
          arc: noop,
          quadraticCurveTo: noop,
          clip: noop,
          createLinearGradient: () => ({ addColorStop: noop }),
          createRadialGradient: () => ({ addColorStop: noop }),
          createPattern: () => null,
          measureText: () => ({ width: 0 }),
          fillText: noop,
          strokeText: noop,
          setTransform: noop,
          setLineDash: noop,
        };
        return {
          width: 0,
          height: 0,
          style: {},
          getContext: () => ctx2d,
        };
      },
    },
    Image: function () {
      return { set src(v) { this._src = v; }, get src() { return this._src; } };
    },
  };
  context.window = context;
  context.addEventListener = noop;
  context.innerWidth = 1280;
  context.innerHeight = 800;
  vm.createContext(context);
  for (const name of [
    "utils",
    "assetlib",
    "characters",
    "profile",
    "economy",
    "progression",
    "save-transfer",
    "character",
    "input",
    "audio",
    "sprites",
    "spriterender",
    "particles",
    "world",
    "projectiles",
    "combat",
    "player",
    "enemies",
    "expedition-enemies",
    "adventure",
    "upgrades",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(root, "js", name + ".js"), "utf8"),
      context,
      { filename: name + ".js" },
    );
  const NR = context.NR;
  NR.hud = { banners: [], update: noop, banner: noop, flash: noop };
  NR.ui = {
    hideAll: noop,
    show: noop,
    refreshHigh: noop,
    openUpgrades: noop,
    showGameOver: noop,
  };
  NR.hub = { notify: noop };
  NR.expeditionUI = { refresh: noop, syncRun: noop, showVictory: noop };
  NR.view = { w: 1280, h: 940 };
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/game.js"), "utf8"),
    context,
    { filename: "game.js" },
  );
  return { NR, data, context };
}

test("static build contains no backend or API client", () => {
  assert.equal(fs.existsSync(path.join(root, "server.py")), false);
  for (const name of fs.readdirSync(path.join(root, "js"))) {
    const s = fs.readFileSync(path.join(root, "js", name), "utf8");
    assert.ok(!s.includes("NR.api"), name);
    assert.ok(!s.includes("/api/"), name);
  }
  const { NR } = engine();
  assert.equal(NR.api, undefined);
  assert.equal(NR.profile.mode, "adventure");
});
test("malformed profile and enum values recover safely", () => {
  const { NR } = engine({ nr_profile: "{bad json" });
  assert.equal(NR.profile.character, "ronin");
  const p = engine({
    nr_profile: JSON.stringify({
      mode: "invalid",
      character: "../../bad",
      chapter: 100,
      unlocked: 1,
      tactical: "bad",
    }),
  }).NR.profile;
  assert.equal(p.mode, "adventure");
  assert.equal(p.character, "ronin");
  assert.equal(p.chapter, 1);
  assert.equal(p.tactical, "shield");
});
test("operators have distinct health, jumps, dash and armor", () => {
  const { NR } = engine();
  const p = new NR.Player();
  NR.applyCharacter(p, "kestrel");
  assert.equal(p.maxHp, 75);
  assert.equal(p.jumpMax, 3);
  assert.equal(p.dashMax, 2);
  p.reset();
  NR.applyCharacter(p, "titan");
  assert.equal(p.maxHp, 150);
  assert.equal(p.damageTakenMul, 0.8);
  assert.equal(p.dmgMul, 1.25);
});
test("adventure and survival configure different world widths and schedulers", () => {
  const { NR } = engine();
  NR.game.start();
  assert.equal(NR.world.W, 6800);
  assert.equal(NR.game.player.x, 200);
  NR.game.update(1.1, 1.1);
  assert.equal(NR.game.wave, 0);
  NR.profile.mode = "survival";
  NR.game.start();
  assert.equal(NR.world.W, 2560);
  assert.equal(NR.world.platforms.length, 5);
  NR.game.update(1.1, 1.1);
  assert.equal(NR.game.wave, 1);
});
test("adventure encounter gates block progress until defenders are defeated", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  G.start();
  G.player.x = 2000;
  A.update(0.01, G);
  assert.equal(A.zones[0].started, true);
  assert.ok(G.enemies.length > 0);
  assert.ok(G.player.x <= A.zones[0].gate - 32);
  for (const e of [...G.enemies]) e.hurt(10000, 0, 0, false, G);
  G.enemies = [];
  A.update(0.01, G);
  assert.equal(A.zones[0].cleared, true);
  G.player.x = 1700;
  A.update(0.01, G);
  assert.equal(G.player.x, 1700);
});
test("relay checkpoints capture upgrades and restore character/loadout", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  NR.profile.character = "kestrel";
  NR.profile.tactical = "drone";
  G.start();
  A.zones[0].started = true;
  A.zones[0].cleared = true;
  G.player.x = 1750;
  NR.input.pressed.interact = true;
  A.update(0.01, G);
  assert.equal(G.state, "upgrade");
  assert.equal(A.relays[0].active, true);
  G.player.dmgMul = 1.7;
  G.closeUpgrade();
  const cp = NR.checkpoint.get();
  assert.ok(cp);
  assert.equal(cp.player.dmgMul, 1.7);
  NR.profile.character = "titan";
  NR.profile.tactical = "heal";
  G.start({ resume: true });
  assert.equal(G.character, "kestrel");
  assert.equal(G.tactical, "drone");
  assert.equal(G.player.dmgMul, 1.7);
  assert.equal(G.player.x, 1750);
  assert.equal(A.zones[0].cleared, true);
  assert.equal(A.relays[0].active, true);
});
test("invalid checkpoint is rejected without altering game state", () => {
  const { NR } = engine({
    nr_checkpoint_v3: JSON.stringify({ version: 1, chapter: 9, player: {} }),
  });
  assert.equal(NR.checkpoint.get(), null);
  NR.game.start({ resume: true });
  assert.equal(NR.game.state, "loading");
});
test("supply caches reward once and full set unlocks achievement", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  G.start();
  A.zones.forEach((z) => {
    z.started = true;
    z.cleared = true;
  });
  for (const c of A.caches) {
    G.player.x = c.x;
    G.player.hp = 40;
    NR.input.pressed.interact = true;
    A.update(0.01, G);
    assert.equal(c.open, true);
    assert.equal(G.player.hp, 65);
  }
  assert.ok(NR.unlockedAchievements.has("cache"));
  const score = G.score;
  A.update(0.01, G);
  assert.equal(G.score, score);
});
test("moving platform carries grounded player by its displacement", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  G.start();
  A.zones.forEach((z) => {
    z.started = true;
    z.cleared = true;
  });
  const p = WPlatform(NR);
  const oldX = p.x,
    oldY = p.y;
  G.player.x = p.x + 70;
  G.player.y = p.y;
  G.player.support = p;
  G.player.onGround = true;
  const px = G.player.x,
    py = G.player.y;
  A.update(0.1, G);
  assert.ok(Math.abs(G.player.x - px - (p.x - oldX)) < 0.001);
  assert.ok(Math.abs(G.player.y - py - (p.y - oldY)) < 0.001);
});
function WPlatform(NR) {
  return NR.world.platforms.find((p) => p.moving);
}
test("hazards have warning / active phases and deal real damage", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  G.start();
  A.zones.forEach((z) => {
    z.started = true;
    z.cleared = true;
  });
  const h = A.hazards.find((h) => h.type === "laser");
  G.player.x = h.x + 30;
  G.player.y = NR.world.groundY;
  A.t = 0.7;
  A.update(0.01, G);
  assert.equal(h.warning, true);
  assert.equal(G.player.hp, 100);
  A.t = 1.4;
  A.update(0.01, G);
  assert.equal(h.active, true);
  assert.ok(G.player.hp < 100);
});
test("shield, repair, overdrive, chrono and drone powers affect simulation", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const p = G.player;
  G.tactical = "shield";
  p.castTactical(G);
  G.hurtPlayer(20, 1);
  assert.equal(p.hp, 100);
  p.reset();
  G.tactical = "heal";
  p.hp = 30;
  p.castTactical(G);
  assert.equal(p.hp, 65);
  p.reset();
  G.tactical = "overdrive";
  p.castTactical(G);
  assert.equal(p.overdriveT, 5);
  p.reset();
  G.tactical = "chrono";
  p.castTactical(G);
  assert.equal(G.chronoT, 5);
  p.reset();
  G.tactical = "drone";
  p.castTactical(G);
  assert.equal(p.droneT, 8);
  assert.equal(p.tacticalCd, 24);
});
test("pause freezes adventure motion and power cooldowns", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  G.player.tacticalCd = 10;
  G.togglePause();
  const t = NR.adventure.t;
  G.update(2, 2);
  assert.equal(G.player.tacticalCd, 10);
  assert.equal(NR.adventure.t, t);
  assert.equal(G.time, 0);
});
test("extraction requires all relays and encounters; victory saves and unlocks", () => {
  const { NR } = engine();
  const G = NR.game,
    A = NR.adventure;
  G.start();
  A.zones.forEach((z) => {
    z.started = true;
    z.cleared = true;
  });
  G.player.x = 6600;
  NR.input.pressed.interact = true;
  A.update(0.01, G);
  assert.equal(G.state, "playing");
  A.relays.forEach((r) => (r.active = true));
  A.update(0.01, G);
  assert.equal(G.state, "victory");
  assert.equal(NR.profile.unlocked, 1);
  assert.equal(NR.records.length, 1);
  assert.equal(NR.records[0].victory, true);
  assert.equal(NR.checkpoint.get(), null);
  G.finishRun(true);
  assert.equal(NR.records.length, 1);
});
test("later survival waves introduce sentries and sentinels", () => {
  const { NR } = engine();
  NR.profile.mode = "survival";
  const G = NR.game;
  G.start();
  G.wave = 3;
  G.startT = 0.001;
  G.update(0.01, 0.01);
  assert.ok(G.spawnQueue.some((q) => q.type === "sentry"));
  assert.ok(G.spawnQueue.some((q) => q.type === "sentinel"));
});
test("local record archive is capped and sorted; achievements are idempotent", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  for (let i = 0; i < 25; i++) {
    G.score = i;
    NR.progress.record(G, false);
  }
  assert.equal(NR.records.length, 20);
  assert.equal(NR.records[0].score, 24);
  NR.progress.award("first");
  NR.progress.award("first");
  assert.equal(NR.unlockedAchievements.size, 1);
});
test("imported atlas, sound files and license notices are bundled locally", () => {
  for (const name of [
    "platformIndustrial_sheet.png",
    "platformIndustrial_sheet.xml",
    "License.txt",
    "LICENSE.md",
    "ATTRIBUTION.md",
    "highUp.ogg",
    "laser3.ogg",
    "lowDown.ogg",
    "phaseJump1.ogg",
    "powerUp1.ogg",
    "powerUp4.ogg",
    "zap1.ogg",
    "zap2.ogg",
  ])
    assert.ok(
      fs.statSync(path.join(root, "assets/kenney", name)).size > 50,
      name,
    );
});

test("blocked storage falls back to the latest in-memory value and reports it", () => {
  const { NR, context } = engine({ nr_example: "old" });
  context.localStorage.setItem = () => {
    throw new Error("Storage disabled");
  };
  assert.equal(NR.store.setItem("nr_example", "new"), false);
  assert.equal(NR.store.getItem("nr_example"), "new");
  assert.equal(NR.store.persistent, false);
});

test("new enemy telegraphs produce attacks and Sentinel front armor matters", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const sentry = new NR.Sentry(600, NR.world.groundY, 1);
  sentry.spawnT = 0;
  sentry.cooldown = 0.1;
  sentry.update(0.2, G);
  assert.equal(G.bolts.length, 1);
  const sentinel = new NR.Sentinel(700, NR.world.groundY, 1);
  sentinel.spawnT = 0;
  sentinel.facing = -1;
  G.player.x = 600;
  const initial = sentinel.hp;
  sentinel.hurt(20, 0, 0, false, G);
  assert.equal(initial - sentinel.hp, 13);
  G.player.x = 800;
  const next = sentinel.hp;
  sentinel.hurt(20, 0, 0, false, G);
  assert.equal(next - sentinel.hp, 20);
  sentinel.stunned = 0;
  sentinel.windup = 0.01;
  sentinel.update(0.02, G);
  assert.equal(G.shockwaves.length, 1);
});

test("parry is directional, timed and excludes hazards and shockwaves", () => {
  const { NR } = engine();
  NR.game.start();
  const G = NR.game,
    p = G.player;
  p.facing = 1;
  p.energy = 0;
  assert.ok(NR.combat.guard(p));
  G.hurtPlayer(20, -1, "slash");
  assert.equal(p.hp, p.maxHp);
  assert.equal(G.stats.parries, 1);
  assert.equal(p.energy, 8);
  assert.equal(p.counterT, 2);
  assert.ok(NR.unlockedAchievements.has("parry"));
  assert.equal(NR.combat.guard(p), false);
  for (const [dir, source, elapsed] of [
    [1, "slash", 0],
    [-1, "hazard", 0],
    [-1, "shock", 0],
    [-1, "touch", 0.23],
  ]) {
    p.reset();
    p.facing = 1;
    NR.combat.guard(p);
    NR.combat.tick(p, elapsed);
    G.hurtPlayer(10, dir, source);
    assert.equal(p.hp, 90, `${source}/${dir}/${elapsed}`);
  }
});
test("counter survives a miss, boosts one melee strike and expires", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const p = G.player;
  p.critCh = 0;
  p.counterT = 2;
  const attack = { dmg: 20, rng: 165, kb: 100 };
  G.playerStrike(attack);
  assert.equal(p.counterT, 2);
  const e = new NR.Crawler(p.x + 90, p.y, 10);
  e.spawnT = 0;
  G.enemies.push(e);
  let hp = e.hp;
  G.playerStrike(attack);
  assert.equal(hp - e.hp, 35);
  assert.equal(p.counterT, 0);
  hp = e.hp;
  G.playerStrike(attack);
  assert.equal(hp - e.hp, 20);
  p.counterT = 2;
  NR.combat.tick(p, 2.1);
  assert.equal(p.counterT, 0);
});
test("kunai charges regenerate, respect pause and sweep fast targets", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const p = G.player;
  for (let i = 0; i < 3; i++) {
    p.throwCd = 0;
    assert.ok(NR.combat.throwKunai(p, G));
  }
  assert.equal(p.kunaiCharges, 0);
  assert.equal(NR.combat.throwKunai(p, G), false);
  G.togglePause();
  G.update(1, 1);
  assert.equal(p.kunaiChargeT, 0);
  G.togglePause();
  NR.combat.tick(p, 3);
  assert.equal(p.kunaiCharges, 1);
  const e = new NR.Crawler(400, p.y, 10);
  e.spawnT = 0;
  G.enemies = [e];
  const hp = e.hp;
  const k = new NR.Kunai(200, p.y - 40, 10000, 0);
  k.update(0.05, G);
  assert.equal(e.hp, hp - 22);
  assert.ok(k.dead);
  assert.ok(k.x < e.x);
  assert.equal(G.stats.kunaiHits, 1);
});
test("ranged collisions select the nearest obstruction and do not hit through platforms", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const e = new NR.Crawler(450, 880, 10);
  e.spawnT = 0;
  G.enemies = [e];
  NR.world.platforms = [{ x: 300, y: 800, w: 40, h: 60 }];
  const hp = e.hp;
  const k = new NR.Kunai(200, 840, 10000, 0);
  k.update(0.04, G);
  assert.equal(e.hp, hp);
  assert.equal(k.x, 300);
  assert.equal(NR.combat.segmentBox(0, 0, 0, 100, 10, 20, 10, 10), null);
  assert.equal(NR.combat.segmentBox(15, 0, 15, 100, 10, 20, 10, 10), 0.2);
});
test("frontal bolt reflects into a damaging friendly projectile; a rear bolt hurts", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const p = G.player;
  p.facing = 1;
  NR.combat.guard(p);
  const b = new NR.Bolt(p.x + 110, p.y - 40, -2000, 0);
  b.update(0.1, G);
  assert.ok(b.dead);
  assert.equal(p.hp, p.maxHp);
  assert.equal(G.shots.length, 1);
  assert.ok(G.shots[0].vx > 0);
  const e = new NR.Crawler(p.x + 160, p.y, 10);
  e.spawnT = 0;
  G.enemies.push(e);
  const hp = e.hp;
  G.shots[0].update(0.15, G);
  assert.equal(e.hp, hp - 32);
  p.reset();
  p.x = 200;
  p.facing = 1;
  NR.combat.guard(p);
  const rear = new NR.Bolt(100, p.y - 40, 2000, 0);
  rear.update(0.1, G);
  assert.equal(p.hp, 90);
});
test("all chapter layouts differ, are bounded and offer reachable platform steps", () => {
  const { NR } = engine(),
    layouts = [],
    hazards = [];
  for (let c = 0; c < 3; c++) {
    NR.adventure.configure("adventure", c);
    const W = NR.world,
      A = NR.adventure;
    layouts.push(JSON.stringify(W.platforms));
    hazards.push(JSON.stringify(A.hazards));
    assert.equal(A.shards.length, 16);
    assert.equal(A.props.length, 6);
    for (const p of W.platforms) {
      assert.ok(p.x >= 0 && p.x + p.w < W.W);
      assert.ok(p.y >= 450 && p.y < 880);
    }
    const groups = c === 0 ? 3 : 4;
    for (let i = 0; i < 4; i++) {
      const ps = W.platforms.slice(i * groups, (i + 1) * groups);
      assert.ok(880 - ps[0].y <= 200);
      for (let j = 1; j < ps.length; j++) {
        assert.ok(ps[j - 1].y - ps[j].y <= 200);
        assert.ok(ps[j].x - (ps[j - 1].x + ps[j - 1].w) <= 300);
      }
    }
  }
  assert.equal(new Set(layouts).size, 3);
  assert.equal(new Set(hazards).size, 3);
});
test("loot crates break from melee or kunai, reward once and stay broken after resume", () => {
  const { NR } = engine();
  const G = NR.game;
  G.start();
  const A = NR.adventure,
    p = G.player;
  p.x = A.props[0].x - 80;
  p.facing = 1;
  G.playerStrike({ dmg: 32, rng: 165, kb: 100 });
  assert.ok(A.props[0].broken);
  assert.equal(G.pickups.length, 1);
  const score = G.score;
  A.hurtProp(A.props[0], 100, G);
  assert.equal(G.score, score);
  assert.equal(G.pickups.length, 1);
  const second = A.props[1];
  new NR.Kunai(second.x - 100, second.y - 25, 1000, 0, 32).update(0.2, G);
  assert.ok(second.broken);
  A.relays[0].active = true;
  A.zones[0].cleared = true;
  NR.checkpoint.save(G, A);
  G.start({ resume: true });
  assert.ok(A.props[0].broken && A.props[1].broken);
  assert.equal(G.stats.salvaged, 2);
  for (const o of A.props) A.hurtProp(o, 100, G);
  assert.ok(NR.unlockedAchievements.has("salvage"));
});
test("version-one checkpoints without new combat fields or props remain compatible", () => {
  const { NR, data } = engine();
  const G = NR.game;
  G.start();
  NR.checkpoint.save(G, NR.adventure);
  const c = JSON.parse(data.nr_checkpoint_v3);
  delete c.props;
  delete c.stats.parries;
  delete c.stats.kunaiHits;
  delete c.stats.salvaged;
  NR.store.setItem("nr_checkpoint_v3", JSON.stringify(c));
  G.start({ resume: true });
  assert.equal(G.stats.parries, 0);
  assert.equal(G.player.kunaiCharges, 3);
  assert.equal(NR.adventure.props.filter((o) => o.broken).length, 0);
});
test("backup round-trip restores unlocked chapter, checkpoint, records and preferences", () => {
  const { NR } = engine();
  const G = NR.game;
  NR.profile.unlocked = 2;
  NR.profile.chapter = 2;
  NR.profile.world = "day";
  G.start();
  NR.adventure.props[0].broken = true;
  NR.checkpoint.save(G, NR.adventure);
  NR.progress.record(G, false);
  NR.progress.award("parry");
  G.high = 1234;
  G.toMenu();
  const text = NR.saveTransfer.exportText();
  NR.profile.unlocked = 0;
  NR.profile.chapter = 0;
  NR.profile.world = "night";
  NR.checkpoint.clear();
  NR.records = [];
  assert.equal(NR.saveTransfer.apply(text).persistent, true);
  assert.equal(NR.profile.world, "day");
  assert.equal(NR.profile.unlocked, 2);
  assert.equal(NR.checkpoint.get().chapter, 2);
  assert.equal(NR.checkpoint.get().props[0], 0);
  assert.equal(NR.records.length, 1);
  assert.equal(G.high, 1234);
});
test("bad backups are rejected before any mutation, including future versions and unsafe keys", () => {
  const { NR, data } = engine();
  NR.game.start();
  NR.checkpoint.save(NR.game, NR.adventure);
  NR.game.toMenu();
  const valid = NR.saveTransfer.exportText();
  const before = JSON.stringify(data);
  const variants = [
    "{bad",
    valid.replace('"version": 1', '"version": 999'),
    '{"__proto__":{"polluted":true}}',
    "x".repeat(NR.saveTransfer.maxBytes + 1),
  ];
  for (const mutate of [
    (b) => (b.profile.chapter = 8),
    (b) => (b.records = [{}]),
    (b) => (b.achievements = ["nope"]),
    (b) => (b.checkpoint.props = [99]),
    (b) => (b.checkpoint.player.speedMul = -1),
    (b) => (b.checkpoint.stats.parries = "oops"),
  ]) {
    const b = JSON.parse(valid);
    mutate(b);
    variants.push(JSON.stringify(b));
  }
  for (const text of variants) {
    assert.throws(() => NR.saveTransfer.apply(text), /Invalid/);
    assert.equal(JSON.stringify(data), before);
  }
});
test("backup import survives blocked storage in memory and rejects importing during play", () => {
  const { NR, context } = engine();
  NR.game.start();
  const text = NR.saveTransfer.exportText();
  assert.throws(() => NR.saveTransfer.apply(text), /mission hub/);
  NR.game.toMenu();
  context.localStorage.setItem = () => {
    throw new Error("blocked");
  };
  const b = JSON.parse(text);
  b.profile.name = "IMPORTED";
  assert.equal(NR.saveTransfer.apply(JSON.stringify(b)).persistent, false);
  assert.equal(NR.profile.name, "IMPORTED");
  assert.equal(JSON.parse(NR.store.getItem("nr_profile")).name, "IMPORTED");
  assert.ok(NR.saveTransfer.exportText().includes("IMPORTED"));
});
