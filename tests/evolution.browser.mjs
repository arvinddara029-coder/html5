import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = []; let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; console.log('PASS', label); };
await mkdir('test-results', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage(); page.setDefaultTimeout(150000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.BASE_URL || pathToFileURL(resolve('index.html')).href);
    await page.waitForFunction(() => window.NR?.game.state === 'menu', { timeout: 120000 });
    check(await page.locator('#scr-load img[src$=".gif"], #scr-load .load-guide').count() === 0, 'Splash has no animated art ' + tag);

    /* settings: trimmed, credits, zoom */
    await page.evaluate(() => NR.ui.show('set'));
    check(await page.locator('#open-vault, #super-roster, #open-super').count() === 0, 'Old vault/super buttons removed');
    await page.locator('#zoom-range').fill('150');
    check(await page.evaluate(() => Math.abs(NR.view.zoom - 1.5) < 0.01), 'Character size slider zooms the game');
    await page.click('#btn-credits');
    check((await page.locator('#scr-credits').innerText()).includes('Made by Arvind Bishnoi'), 'Credits show only the author');
    await page.click('#btn-credits-back');

    /* HUD editor: move + resize */
    await page.click('#edit-hud');
    const jump = page.locator('#touch [data-act="jump"]'); const rect = await jump.boundingBox();
    check(rect && rect.width > 0, 'HUD editor controls visible');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(130, 250, { steps: 10 }); await page.mouse.up();
    await page.locator('#hud-size').fill('150');
    await page.locator('#hud-editor').getByRole('button', { name: 'SAVE', exact: true }).click();
    check(await page.evaluate(() => { const j = NR.evolution.layout.jump; return Array.isArray(j) && j.length === 3 && Math.abs(j[2] - 1.5) < 0.01; }), 'HUD drag + size saved');

    /* lobby: vault */
    await page.evaluate(() => NR.game.toMenu());
    await page.click('#lb-vault');
    check(await page.locator('#modal-vault').isVisible(), 'VAULT opens from the lobby');
    await page.click('#vault-tabs [data-vtab="summons"]');
    await page.waitForTimeout(600);
    check(await page.locator('#vault-grid .actor-card').count() >= 6, 'Monster summons listed');
    await page.screenshot({ path: `test-results/vault-${tag}.png` });
    await page.click('#vault-tabs [data-vtab="items"]');
    check(await page.locator('#vault-grid .hs-stat').count() > 4, 'Items show stat bars');
    await page.locator('#vault-grid .info-i').first().click();
    check(await page.locator('.item-info-modal.open').first().isVisible(), '! opens how-to-use info');
    await page.screenshot({ path: `test-results/item-info-${tag}.png` });
    await page.locator('.item-info-modal.open .lm-close').first().click();
    await page.click('#vault-close');

    /* shop: buy → equip */
    await page.evaluate(() => { NR.profile.coins = 50000; NR.profile.gems = 500; NR.saveProfile(); });
    await page.click('#lb-shop');
    const buy = page.locator('#shop-grid .buy:not(.equip):not(.equipped):not(.cant)').first();
    await buy.click();
    check(await page.locator('#shop-grid .buy.equip').count() > 0, 'EQUIP appears after buying');
    await page.screenshot({ path: `test-results/shop-${tag}.png` });
    await page.evaluate(() => document.querySelectorAll('.lobby-modal.open').forEach((m) => m.classList.remove('open')));

    /* online lobby (UI only — the sandbox has no internet) */
    await page.click('#lb-online');
    check(await page.locator('#modal-online').isVisible(), 'ONLINE lobby opens');
    check(await page.locator('#ol-players .ol-card').count() >= 2, 'Lobby shows two player slots');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/online-${tag}.png` });
    await page.click('#modal-online [data-otab="board"]');
    check(await page.locator('#ol-rank').isVisible(), 'Leaderboard tab');
    await page.click('#ol-close');

    /* PLAY: two modes, no world picker */
    await page.click('#lb-play');
    check(await page.locator('#deploy-chapters').isHidden(), 'World picker hidden');
    check(await page.locator('#deploy-modes .deploy-mode').count() === 2, 'Two modes: WAVE FIGHT + SURVIVE');
    await page.click('#deploy-modes [data-mode="survival"]');
    await page.click('#deploy-start');
    await page.waitForFunction(() => NR.game.state === 'playing' && !NR.loading.hold, { timeout: 60000 });
    await page.evaluate(() => { NR.game.player.iframes = 99; });
    await page.keyboard.press('KeyU');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => NR.abilities.cooldown(NR.game.player, 0) > 0), 'U casts the hero ability');
    check(await page.locator('#hab-name-1').innerText().then((t) => t.length > 1 && t !== 'ABILITY'), 'Ability buttons are named for the hero');
    await page.keyboard.press('KeyV');
    await page.waitForTimeout(200);
    check(await page.evaluate(() => NR.sukuna.used() && !NR.sukuna.ready()), 'Sukuna Slice: used once');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/game-${tag}.png` });
    check(await page.evaluate(() => NR.view.zoom >= 1.19), 'Gameplay camera is zoomed in');

    /* continue + backup */
    await page.evaluate(() => { NR.game.player.dead = true; NR.game.finishRun(false); });
    await page.click('#btn-continue-encounter');
    check(await page.evaluate(() => NR.game.state === 'playing' && !NR.game.player.dead), 'Same-wave continue works');
    check(await page.evaluate(() => { const G = NR.game; G.toMenu(); const text = NR.saveTransfer.exportText(); const b = NR.saveTransfer.validate(text); return b.evolution.layout.jump.length === 3; }), 'Backup includes the resized HUD');
    const toast = await page.locator('#errtoast').textContent().catch(() => '');
    check(!String(toast).includes('error'), 'No frame error toast');
    await context.close();
  }
  check(errors.length === 0, 'No browser JavaScript errors: ' + errors.join('; '));
  console.log(`${checks} browser checks passed`);
} finally { await browser.close(); }
