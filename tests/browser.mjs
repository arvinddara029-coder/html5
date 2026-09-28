import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Defaults to file:// to prove the game does not require a server.
const base = process.env.BASE_URL || pathToFileURL(resolve("index.html")).href;
const options = {
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
};
if (process.env.CHROMIUM_PATH)
  options.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(options),
  errors = [],
  requests = [];
let checks = 0;
await mkdir("test-results", { recursive: true });
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log("PASS", label);
}
async function ready(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(base);
  await page.waitForFunction(() => window.NR?.game.state === "menu");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}
async function clearZone(page, id) {
  const spawned = await page.evaluate((id) => {
    const G = NR.game,
      A = NR.adventure,
      z = A.zones[id];
    G.player.x = z.x;
    G.player.y = NR.world.groundY;
    G.player.vx = 0;
    G.player.vy = 0;
    G.player.iframes = 99;
    A.update(0.01, G);
    const types = G.enemies.map((e) => e.type);
    for (const e of [...G.enemies]) {
      e.spawnT = 0;
      if (e.type === "boss") e.update(3, G);
      e.hurt(100000, 0, 0, false, G);
      if (e.type === "boss") e.update(2, G);
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
    A.update(0.01, G);
    return { types, cleared: z.cleared };
  }, id);
  check(
    spawned.types.length > 0,
    `chapter encounter ${id + 1} spawns real defenders`,
  );
  check(
    spawned.cleared,
    `chapter encounter ${id + 1} clears and releases barrier`,
  );
  return spawned.types;
}
async function relay(page, id) {
  await page.evaluate((id) => {
    const G = NR.game;
    G.player.x = NR.adventure.relays[id].x;
    G.player.y = NR.world.groundY;
    G.player.vx = G.player.vy = 0;
    G.player.onGround = true;
    NR.input.pressed.interact = true;
    NR.adventure.update(0.01, G);
  }, id);
  await page.locator("#scr-up").waitFor({ state: "visible" });
  check(
    (await page.locator("#cards button").count()) === 3,
    "relay offers 3 upgrades",
  );
  await page.locator("#cards button").first().click();
  check(
    await page.evaluate((id) => NR.checkpoint.get()?.relays.includes(id), id),
    "upgrade is included in local checkpoint",
  );
}
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  await ready(page);
  check(
    await page.evaluate(
      () => NR.api === undefined && NR.profile.mode === "adventure",
    ),
    "static game boots in adventure mode",
  );
  check(
    await page.locator('[data-chapter="1"]').isDisabled(),
    "later chapters start locked",
  );
  check(
    await page.evaluate(() => NR.util.assets.get("industrial")?.width > 0),
    "CC0 industrial atlas loads",
  );
  await page.screenshot({ path: "test-results/lobby-v3.png" });
  await page.click("#btn-operators");
  await page.locator("#scr-operators").waitFor({ state: "visible" });
  check(
    (await page.locator(".operator-card").count()) === 3,
    "3 selectable operators",
  );
  await page.click('[data-operator="kestrel"]');
  await page.screenshot({ path: "test-results/operator-roster.png" });
  await page.click("#btn-operators-back");
  await page.click("#btn-armory");
  check(
    (await page.locator("#armory-options .power-card").count()) === 6,
    "6 tactical powers",
  );
  await page.click('#armory-options [data-power="drone"]');
  await page.click("#btn-armory-back");
  await page.click("#btn-profile");
  await page.fill("#callsign", "TEST_RONIN");
  await page.locator("#callsign").blur();
  await page.locator("#music-volume").fill("25");
  await page.locator("#sfx-volume").fill("40");
  check(
    await page.evaluate(
      () => NR.profile.musicVolume === 0.25 && NR.profile.sfxVolume === 0.4,
    ),
    "independent audio volume settings",
  );
  check(
    await page.locator('a[href="privacy.html"]').count(),
    "settings links to the privacy policy",
  );
  await page.click("#btn-set-back");
  await page.reload();
  await page.waitForFunction(() => NR.game.state === "menu");
  check(
    await page.evaluate(
      () =>
        NR.profile.character === "kestrel" &&
        NR.profile.tactical === "drone" &&
        NR.profile.name === "TEST_RONIN",
    ),
    "operator, power and callsign persist",
  );
  await page.click("#btn-start");
  await page.waitForFunction(() => NR.game.state === "playing");
  check(
    await page.evaluate(
      () => NR.game.mode === "adventure" && NR.world.W === 6800,
    ),
    "adventure creates long scrolling world",
  );
  check(
    await page.evaluate(
      () =>
        NR.game.player.hp === 75 &&
        NR.game.player.jumpMax === 3 &&
        NR.game.player.dashMax === 2,
    ),
    "Kestrel mechanics applied",
  );
  check(
    await page.locator("#touch").isVisible(),
    "desktop screen controls visible",
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  await page.keyboard.press("Space");
  await page.waitForTimeout(80);
  await page.keyboard.press("Space");
  check(
    await page.evaluate(() => NR.game.player.jumps === 3),
    "operator-specific triple jump",
  );
  await page.keyboard.press("e");
  check(
    await page.evaluate(() => NR.game.player.droneT > 7),
    "Arc Companion activates",
  );
  await page.click("#game-pause");
  const time = await page.evaluate(() => NR.game.time);
  await page.waitForTimeout(200);
  check(
    await page.evaluate((t) => NR.game.time === t, time),
    "pause freezes adventure",
  );
  check(
    !(await page.locator("#touch").isVisible()),
    "controls hide while paused",
  );
  await page.click("#btn-resume");
  await page.evaluate(() => {
    const p = NR.game.player;
    p.x = 500;
    p.y = NR.world.groundY;
    p.vx = p.vy = 0;
    p.hp = 30;
    p.onGround = true;
  });
  await page.locator("#interaction-prompt").waitFor({ state: "visible" });
  await page.click("#interaction-prompt");
  check(
    await page.evaluate(
      () => NR.adventure.caches[0].open && NR.game.player.hp >= 55,
    ),
    "context button opens supply cache and heals",
  );
  await clearZone(page, 0);
  await relay(page, 0);
  const checkpointDamage = await page.evaluate(
    () => NR.checkpoint.get().player.dmgMul,
  );
  await page.reload();
  await page.waitForFunction(() => NR.game.state === "menu");
  await page.click("#btn-continue");
  check(
    await page.evaluate(
      () => NR.game.player.x > 1700 && NR.adventure.relays[0].active,
    ),
    "continue resumes at saved relay after reload",
  );
  check(
    await page.evaluate((d) => NR.game.player.dmgMul === d, checkpointDamage),
    "checkpoint preserves chosen upgrade",
  );
  await page.click("#game-world");
  check(
    await page.evaluate(() => NR.profile.world === "day"),
    "day mode during adventure",
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/adventure-relay.png" });
  for (let id = 1; id < 4; id++) {
    await clearZone(page, id);
    if (id < 3) await relay(page, id);
  }
  await page.evaluate(() => {
    NR.game.player.x = 6600;
    NR.game.player.vx = 0;
    NR.input.pressed.interact = true;
    NR.adventure.update(0.01, NR.game);
  });
  await page.locator("#scr-victory").waitFor({ state: "visible" });
  check(
    await page.evaluate(
      () =>
        NR.profile.unlocked === 1 &&
        NR.records[0].victory &&
        NR.checkpoint.get() === null,
    ),
    "chapter victory unlocks next route and clears checkpoint",
  );
  await page.screenshot({ path: "test-results/chapter-victory.png" });
  for (let chapter = 1; chapter < 3; chapter++) {
    await page.click("#btn-next-chapter");
    await page.waitForFunction(
      (c) => NR.game.chapter === c && NR.game.state === "playing",
      chapter,
    );
    check(
      await page.evaluate(
        (c) => NR.adventure.chapter.biome === (c === 1 ? "garden" : "reactor"),
        chapter,
      ),
      "distinct chapter biome loaded",
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/chapter-${chapter + 1}.png` });
    for (let id = 0; id < 4; id++) {
      const types = await clearZone(page, id);
      if (chapter === 2 && id === 3)
        check(types.includes("boss"), "final reactor encounter is SHOGUN-9");
      if (id < 3) await relay(page, id);
    }
    await page.evaluate(() => {
      NR.game.player.x = 6600;
      NR.game.player.vx = 0;
      NR.input.pressed.interact = true;
      NR.adventure.update(0.01, NR.game);
    });
    await page.locator("#scr-victory").waitFor({ state: "visible" });
  }
  check(
    await page.locator("#btn-next-chapter").isHidden(),
    "final chapter has a proper ending, not an endless next button",
  );
  check(
    await page.evaluate(
      () => NR.unlockedAchievements.has("zero") && NR.records.length === 3,
    ),
    "campaign completion achievement and all records saved locally",
  );
  await page.click("#btn-victory-menu");
  await page.click("#nav-leaderboard");
  check(
    (await page.locator(".board-row").count()) === 3,
    "local archive renders completed runs",
  );
  check(
    (await page.locator(".achievement.unlocked").count()) > 1,
    "achievements show unlocked states",
  );
  await page.click('[data-record-filter="survival"]');
  check(
    (await page.locator(".board-row").count()) === 0,
    "records filter separates game modes",
  );
  await page.click("#btn-records-back");
  await page.click('[data-mode="survival"]');
  check(
    await page.locator("#campaign-route").isHidden(),
    "survival hides chapter selection",
  );
  await page.click("#btn-start");
  await page.waitForFunction(() => NR.game.wave === 1);
  check(
    await page.evaluate(
      () => NR.world.W === 2560 && NR.game.mode === "survival",
    ),
    "survival retains compact wave arena",
  );
  check(
    await page.locator("#adventure-hud").isHidden(),
    "no adventure HUD in survival",
  );
  await page.evaluate(() => {
    const G = NR.game;
    G.enemies = [];
    G.spawnQueue = [];
    G.wave = 3;
    G.startT = 0.001;
    G.update(0.01, 0.01);
  });
  check(
    await page.evaluate(
      () =>
        NR.game.spawnQueue.some((q) => q.type === "sentry") &&
        NR.game.spawnQueue.some((q) => q.type === "sentinel"),
    ),
    "new enemies join later survival waves",
  );
  await page.evaluate(() => {
    const G = NR.game;
    G.player.reset();
    G.player.iframes = 0;
    G.score = 500;
    G.hurtPlayer(999, 1);
    G.deathT = 0.01;
    G.update(0.02, 0.02);
  });
  await page.locator("#scr-over").waitFor({ state: "visible" });
  check(
    (await page.locator("#run-save").textContent()).includes("No server"),
    "game-over stores record without network submission",
  );
  // New mechanics use actual keyboard input; deterministic enemies isolate damage.
  await page.evaluate(() => {
    NR.game.toMenu();
    Object.assign(NR.profile, {
      character: "ronin",
      mode: "adventure",
      chapter: 0,
    });
    NR.game.start();
    NR.game.player.critCh = 0;
  });
  await page.keyboard.press("q");
  await page.waitForFunction(() => NR.game.player.parryT > 0);
  check(
    await page.evaluate(() => {
      const G = NR.game,
        p = G.player,
        hp = p.hp;
      new NR.Bolt(p.x + 45, p.y - 40, -1800, 0).update(0.05, G);
      return p.hp === hp && G.stats.parries === 1 && G.shots.length === 1;
    }),
    "keyboard parry reflects incoming bolt",
  );
  await page.evaluate(() => {
    const G = NR.game,
      p = G.player;
    G.shots = [];
    const e = new NR.Crawler(p.x + 100, p.y, 10);
    e.spawnT = 0;
    e.update = () => {};
    G.enemies = [e];
    window.counterBefore = e.hp;
  });
  await page.screenshot({ path: "test-results/counter-ready.png" });
  await page.keyboard.press("j");
  await page.waitForFunction(
    () => NR.game.enemies[0].hp < window.counterBefore,
  );
  check(
    await page.evaluate(
      () =>
        window.counterBefore - NR.game.enemies[0].hp === 24.5 &&
        NR.game.player.counterT === 0,
    ),
    "keyboard counter applies 1.75x damage once",
  );
  await page.keyboard.press("r");
  await page.waitForFunction(() => NR.game.stats.kunaiHits > 0);
  check(
    await page.evaluate(() => NR.game.player.kunaiCharges === 2),
    "keyboard kunai damages enemy and spends one charge",
  );
  await page.evaluate(() => {
    const G = NR.game,
      p = G.player;
    G.enemies = [];
    G.shots = [];
    p.x = NR.adventure.props[0].x - 120;
    p.y = NR.world.groundY;
    p.vx = 0;
    p.vy = 0;
    p.kunaiCharges = 3;
    p.throwCd = 0;
  });
  await page.keyboard.press("r");
  await page.waitForFunction(() => NR.adventure.props[0].hp < 28);
  await page.waitForFunction(() => NR.game.player.throwCd === 0);
  await page.keyboard.press("r");
  await page.waitForFunction(() => NR.adventure.props[0].broken);
  check(
    await page.evaluate(() => NR.game.stats.salvaged === 1),
    "ranged attacks break a real loot crate",
  );
  await page.evaluate(() => {
    const G = NR.game,
      A = NR.adventure;
    A.relays[0].active = true;
    A.zones[0].cleared = true;
    NR.checkpoint.save(G, A);
    G.toMenu();
  });
  const savedName = await page.evaluate(() => NR.profile.name);
  // The settings backup panel was removed; the export/validate/apply API stays
  // and is exercised directly instead of through the deleted buttons.
  const backup = await page.evaluate(() => NR.saveTransfer.exportText());
  check(
    JSON.parse(backup).checkpoint.props.includes(0),
    "backup includes destroyed loot and checkpoint",
  );
  check(
    await page.evaluate((text) => {
      try {
        NR.saveTransfer.validate(text);
        return false;
      } catch (_) {
        return true;
      }
    }, "{invalid"),
    "bad backup rejected",
  );
  check(
    await page.evaluate((name) => NR.profile.name === name, savedName),
    "invalid backup preserves existing profile",
  );
  const applied = await page.evaluate(
    ({ text, saved }) => {
      NR.profile.name = "CHANGED";
      NR.saveProfile();
      NR.checkpoint.clear();
      const res = NR.saveTransfer.apply(text);
      const cp = NR.checkpoint.get();
      return {
        persistent: res.persistent,
        name: NR.profile.name,
        props: cp ? cp.props : null,
      };
    },
    { text: backup, saved: savedName },
  );
  check(
    applied.persistent && applied.name === savedName,
    "confirmed import restores the saved profile",
  );
  check(
    applied.props && applied.props.includes(0),
    "confirmed import restores profile and loot checkpoint",
  );
  await page.reload();
  await page.waitForFunction(() => NR.game.state === "menu");
  check(
    await page.evaluate(
      (name) =>
        NR.profile.name === name && NR.checkpoint.get().props.includes(0),
      savedName,
    ),
    "imported backup survives page reload",
  );
  await page.click("#btn-continue");
  await page.waitForFunction(() => NR.game.state === "playing");
  check(
    await page.evaluate(
      () => NR.adventure.props[0].broken && NR.game.stats.salvaged === 1,
    ),
    "continued imported checkpoint does not respawn destroyed loot",
  );
  await page.close();

  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({
      viewport: size,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const mobile = await context.newPage();
    await ready(mobile);
    check(
      await mobile.evaluate(
        () => document.querySelector(".hub-shell").scrollWidth <= innerWidth,
      ),
      `no lobby overflow ${size.width}`,
    );
    await mobile.screenshot({
      path: `test-results/mobile-lobby-${size.width}.png`,
    });
    await mobile.click("#btn-operators");
    await mobile.click('[data-operator="titan"]');
    await mobile.click("#btn-operators-back");
    await mobile.click(size.width <= 600 ? "#btn-mobile-start" : "#btn-start");
    await mobile.waitForFunction(() => NR.game.state === "playing");
    check(
      await mobile.evaluate(() => NR.game.player.maxHp === 150),
      `mobile operator selection ${size.width}`,
    );
    const bounds = await mobile.locator("#touch .tbtn").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );
    check(
      bounds.every(
        (r) =>
          r.left >= 0 &&
          r.right <= size.width &&
          r.top >= 0 &&
          r.bottom <= size.height,
      ),
      `all controls in bounds ${size.width}`,
    );
    check(
      bounds.every((a, i) =>
        bounds.every(
          (b, j) =>
            i === j ||
            a.right <= b.left ||
            b.right <= a.left ||
            a.bottom <= b.top ||
            b.bottom <= a.top,
        ),
      ),
      `no overlapping controls ${size.width}`,
    );
    const cdp = await context.newCDPSession(mobile),
      right = await mobile.locator('[data-act="right"]').boundingBox(),
      attack = await mobile.locator('[data-act="attack"]').boundingBox();
    const point = (r, id) => ({
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      id,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(right, 1), point(attack, 2)],
    });
    await mobile.waitForTimeout(180);
    check(
      await mobile.evaluate(
        () =>
          NR.input.down("right") &&
          NR.input.down("attack") &&
          NR.game.player.x > 200,
      ),
      `simultaneous movement and attack ${size.width}`,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    check(
      await mobile.evaluate(
        () => !NR.input.down("right") && !NR.input.down("attack"),
      ),
      `touch cancellation ${size.width}`,
    );
    check(
      (await mobile.locator(".t-right .tbtn").count()) === 7,
      `seven visible combat actions ${size.width}`,
    );
    await mobile.tap('[data-act="parry"]');
    await mobile.waitForFunction(() => NR.game.player.parryCd > 0);
    check(
      await mobile.evaluate(() => NR.game.player.parryCd > 0),
      `touch parry works ${size.width}`,
    );
    await mobile.waitForFunction(() => NR.game.player.parryT === 0);
    await mobile.tap('[data-act="kunai"]');
    await mobile.waitForFunction(() => NR.game.player.kunaiCharges === 2);
    check(
      await mobile.evaluate(() => NR.game.player.kunaiCharges === 2),
      `touch kunai works ${size.width}`,
    );
    await mobile.evaluate(() => {
      NR.game.player.x = 500;
      NR.game.player.y = NR.world.groundY;
      NR.game.player.vx = 0;
    });
    await mobile.locator("#interaction-prompt").waitFor({ state: "visible" });
    await mobile.tap("#interaction-prompt");
    await mobile.waitForFunction(() => NR.adventure.caches[0].open);
    check(
      await mobile.evaluate(() => NR.adventure.caches[0].open),
      `touch interaction works ${size.width}`,
    );
    await mobile.waitForTimeout(150);
    await mobile.screenshot({
      path: `test-results/mobile-adventure-${size.width}.png`,
    });
    await mobile.tap("#game-pause");
    await mobile.locator("#scr-pause").waitFor({ state: "visible" });
    check(
      await mobile.locator("#touch").isHidden(),
      `mobile pause ${size.width}`,
    );
    await context.close();
  }
  check(
    !requests.some((url) => /\/api\//.test(url)),
    "zero API requests across all scenarios",
  );
  check(
    !requests.some(
      (url) => /^https?:/.test(url) && !url.startsWith(new URL(base).origin),
    ),
    "no external runtime/CDN requests",
  );
  check(
    errors.length === 0,
    "no uncaught browser errors: " + errors.join(", "),
  );
  console.log(
    `\n${checks} browser checks passed. Tested via ${base.startsWith("file:") ? "file:// (no server)" : "static hosting"}.`,
  );
} finally {
  await browser.close();
}
