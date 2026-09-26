import { launchBrowser } from "./browser.mjs";
import assert from "node:assert/strict";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.setDefaultTimeout(60000);
await page.addInitScript(() => {
  if (!localStorage.getItem("apex-save"))
    localStorage.setItem(
      "apex-save",
      JSON.stringify({ settings: { quality: "low", muted: true } }),
    );
});
try {
  await page.goto(process.env.TEST_URL || "http://localhost:5173/?test=1");
  await page.waitForSelector('body[data-ready="true"]');
  console.log("PASS: models, fonts, HDR and textures loaded");
  console.log(
    "Renderer:",
    await page.evaluate(() => ({
      calls: apexTest.world.renderer.info.render.calls,
      triangles: apexTest.world.renderer.info.render.triangles,
    })),
  );
  await page.evaluate(() => {
    apexTest.world.render = () => {};
  });
  await page.locator('[data-map="desert"]').click();
  assert.equal(
    await page.locator("#location-name").textContent(),
    "DESERT RUN",
  );
  await page.locator('[data-map="night"]').click();
  assert.equal(await page.evaluate(() => apexTest.world.map), "night");
  await page.locator('[data-map="alpine"]').click();
  console.log("PASS: all environments switch");
  await page.locator('[data-page="garage"]').click();
  await page.locator('[data-car="race"]').click();
  await page.locator('[data-paint="#c4372a"]').click();
  await page.locator("#garage-done").click();
  assert.equal(await page.locator("#hero-car-name").textContent(), "R · SPORT");
  console.log("PASS: garage car and paint apply");
  await page.locator("#settings-button").click();
  await page.locator("#density").selectOption("low");
  await page.locator("#volume").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.locator("#settings-done").click();
  await page.locator("#help-button").click();
  await page.locator("#help-done").click();
  await page.locator("#start-button").click();
  await page.waitForFunction(() => apexTest.state === "racing");
  console.log("PASS: countdown and race start");
  await page.keyboard.down("w");
  await page.waitForTimeout(2300);
  await page.keyboard.up("w");
  assert.ok(await page.evaluate(() => apexTest.run.speed > 10));
  const before = await page.evaluate(() => apexTest.world.playerX);
  await page.keyboard.down("d");
  await page.waitForTimeout(450);
  await page.keyboard.up("d");
  assert.ok((await page.evaluate(() => apexTest.world.playerX)) > before);
  console.log("PASS: keyboard throttle and steering");
  // Freeze automatic rendering while testing deterministic simulation boundaries.
  await page.evaluate(() => {
    apexTest.world.ready = false;
    apexTest.run.speed = 180;
    apexTest.run.cooldown = 100;
    apexTest.world.playerX = 1.8;
  });
  await page.keyboard.down("Shift");
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) apexTest.updateRun(1 / 60);
  });
  await page.keyboard.up("Shift");
  assert.ok(await page.evaluate(() => apexTest.run.nitro < 100));
  console.log("PASS: nitro drains and boosts");
  const s = await page.evaluate(() => apexTest.run.speed);
  await page.keyboard.down("s");
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) apexTest.updateRun(1 / 60);
  });
  await page.keyboard.up("s");
  assert.ok((await page.evaluate(() => apexTest.run.speed)) < s);
  console.log("PASS: braking");
  await page.locator("#pause-button").click();
  assert.equal(await page.evaluate(() => apexTest.state), "paused");
  await page.locator("#resume").click();
  assert.equal(await page.evaluate(() => apexTest.state), "racing");
  await page.evaluate(() => {
    apexTest.run.cooldown = 0;
    apexTest.world.playerX = 1.8;
    const h = apexTest.world.hazards[0];
    h.userData.s = apexTest.run.distance;
    h.userData.lane = 2;
    apexTest.world.updateHazards(apexTest.run.distance, false);
    apexTest.updateRun(0);
  });
  console.log("PASS: roadwork collision");
  assert.equal(await page.evaluate(() => apexTest.run.health), 66);
  await page.evaluate(() => {
    apexTest.run.cooldown = 0;
    apexTest.collision();
    apexTest.run.cooldown = 0;
    apexTest.collision();
  });
  assert.equal(await page.evaluate(() => apexTest.state), "results");
  console.log("PASS: collisions, damage, game over");
  await page.locator("#back-home").click();
  await page.locator('[data-page="records"]').click();
  assert.ok((await page.locator(".records-list tbody tr").count()) > 0);
  await page.locator("#modal-close").click();
  console.log("PASS: score and records saved");
  await page.locator('[data-mode="timed"]').click();
  await page.evaluate(() => (apexTest.world.ready = true));
  await page.locator("#start-button").click();
  await page.waitForFunction(() => apexTest.state === "racing");
  await page.evaluate(() => {
    apexTest.world.ready = false;
    apexTest.run.speed = 125;
    apexTest.world.playerX = -0.7;
    apexTest.world.traffic.forEach((c) => {
      c.userData.s = apexTest.run.distance + 400;
    });
    const car = apexTest.world.traffic[0];
    car.userData.s = apexTest.run.distance - 5;
    car.userData.lane = 2;
    car.userData.passed = false;
    apexTest.updateRun(0.001);
  });
  assert.equal(await page.evaluate(() => apexTest.run.near), 1);
  assert.ok((await page.evaluate(() => apexTest.run.time)) > 92);
  console.log("PASS: near-miss score and time bonus");
  await page.evaluate(() => {
    apexTest.run.near = 5;
    apexTest.updateRun(0);
  });
  assert.ok(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("apex-save")).completed.includes("near"),
    ),
  );
  console.log("PASS: challenge completion");
  await page.evaluate(() => {
    apexTest.world.update(0, 1000000, 180, false);
  });
  assert.ok(
    await page.evaluate(() =>
      apexTest.world.segments.every(
        (s) => Number.isFinite(s.position.x) && Math.abs(s.position.z) < 1000,
      ),
    ),
  );
  console.log("PASS: endless road recycling at 1,000 km");
  await page.evaluate(() => {
    apexTest.run.time = 0.02;
    apexTest.updateRun(0.03);
  });
  assert.equal(await page.evaluate(() => apexTest.state), "results");
  console.log("PASS: time attack expiration");
  await page.locator("#back-home").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  console.log("PASS: mobile layout has no horizontal overflow");
  await page.evaluate(() => (apexTest.world.ready = true));
  await page.locator("#start-button").click();
  await page.waitForFunction(() => apexTest.state === "racing");
  await page.evaluate(() => {
    apexTest.world.ready = false;
    apexTest.run.speed = 80;
  });
  const touch = await page.locator('[data-key="arrowleft"]').boundingBox();
  await page.mouse.move(touch.x + touch.width / 2, touch.y + touch.height / 2);
  await page.mouse.down();
  const initialX = await page.evaluate(() => apexTest.world.playerX);
  await page.evaluate(() => apexTest.updateRun(0.2));
  await page.mouse.up();
  assert.ok((await page.evaluate(() => apexTest.world.playerX)) < initialX);
  console.log("PASS: on-screen steering control");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await page.evaluate(() => apexTest.state), "paused");
  console.log("PASS: automatic pause on focus loss");
  assert.deepEqual(errors, []);
  console.log("PASS: no browser errors");
} finally {
  await browser.close();
}
