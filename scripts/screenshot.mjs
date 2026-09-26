import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    console.log(m.type(), m.text());
});
await page.goto("http://localhost:5173/?test=1");
await page.waitForSelector('body[data-ready="true"]', { timeout: 120000 });
await page.evaluate(() => {
  window.apexTest.world.ready = false;
});
await page.waitForTimeout(1500);
await page.screenshot({
  path: "/home/user/apex-desktop.png",
  fullPage: true,
  timeout: 120000,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => {
  apexTest.world.resize();
  apexTest.world.update(0, 0, 0, true);
  apexTest.world.render();
});
await page.waitForTimeout(1000);
await page.screenshot({
  path: "/home/user/apex-mobile.png",
  fullPage: true,
  timeout: 120000,
});
await page.setViewportSize({ width: 1280, height: 800 });
await page.evaluate(() => {
  apexTest.world.ready = true;
  const original = apexTest.world.render.bind(apexTest.world);
  apexTest.world.savedRender = original;
  apexTest.world.render = () => {};
});
await page.locator("#start-button").click();
await page.waitForFunction(() => apexTest.state === "racing", {
  timeout: 60000,
});
await page.evaluate(() => {
  apexTest.world.ready = false;
  apexTest.run.speed = 148;
  apexTest.run.distance = 240;
  apexTest.world.setTraffic(14);
  apexTest.world.traffic.forEach((c, i) => {
    c.userData.s = 270 + i * 24;
  });
  apexTest.world.updateTraffic(0, 240, 148);
  apexTest.world.update(1, 240, 148, false);
  apexTest.updateRun(0);
  apexTest.world.savedRender();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: "/home/user/apex-race.png", timeout: 120000 });
console.log("Desktop, mobile and gameplay captures ready");
await browser.close();
