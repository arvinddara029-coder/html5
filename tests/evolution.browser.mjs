import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[];let checks=0;
const check=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS',label);};
await mkdir('test-results',{recursive:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BASE_URL||pathToFileURL(resolve('index.html')).href);
  await page.waitForFunction(()=>window.NR?.game.state==='menu',{timeout:60000});
  await page.evaluate(()=>NR.vault.openVault('abilities'));check(await page.locator('#evolution-dialog').isVisible(),'Vault opens '+mobile);
  await page.screenshot({path:`test-results/evolution-vault-${mobile?'mobile':'desktop'}.png`});
  await page.getByRole('button',{name:'CLOSE ×',exact:true}).click();
  await page.evaluate(()=>NR.vault.openSuperRoster());check(await page.locator('#evolution-dialog canvas').count()>5,'New heroes and pets selectable');
  await page.getByRole('button',{name:'SELECT HERO',exact:true}).first().click();
  await page.getByRole('button',{name:'SELECT PET',exact:true}).first().click();
  await page.getByRole('button',{name:'CLOSE ×',exact:true}).click();
  await page.click('#edit-hud');
  const jump=page.locator('#touch [data-act="jump"]');const rect=await jump.boundingBox();check(rect && rect.width>0,'HUD editor controls visible');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(130,250,{steps:10});await page.mouse.up();
  await page.locator('#hud-editor').getByRole('button',{name:'SAVE',exact:true}).click();
  check(await page.evaluate(()=>Array.isArray(NR.evolution.layout.jump)),'HUD drag saved');
  await page.evaluate(()=>{NR.profile.mode='adventure';NR.game.start();NR.game.player.iframes=99;});
  await page.waitForTimeout(900);
  check(await page.evaluate(()=>NR.superRuntime.scene.roster.length===4),'Active district streams new enemies');
  await page.screenshot({path:`test-results/evolution-game-${mobile?'mobile':'desktop'}.png`});
  await page.click('#power-hint');check(await page.locator('#evolution-dialog').innerText().then(t=>t.includes('3 relays')),'Relay hint explains extraction');
  await page.getByRole('button',{name:'CLOSE ×',exact:true}).click();
  await page.evaluate(()=>{NR.profile.mode='survival';NR.game.start();NR.game.player.iframes=99;});
  await page.waitForFunction(()=>NR.game.wave===1);
  await page.evaluate(()=>{NR.game.player.dead=true;NR.game.finishRun(false);});
  await page.click('#btn-continue-encounter');
  check(await page.evaluate(()=>NR.game.state==='playing' && NR.game.wave===1 && !NR.game.player.dead),'Same-wave continue works');
  check(await page.evaluate(()=>{const G=NR.game;G.toMenu();const text=NR.saveTransfer.exportText();const b=NR.saveTransfer.validate(text);return b.evolution.hero===NR.evolution.hero && b.evolution.layout.jump.length===2;}),'Backup includes new systems');
  await page.reload();await page.waitForFunction(()=>window.NR?.game.state==='menu',{timeout:60000});
  await page.evaluate(()=>NR.ui.show('set'));await page.click('#resume-wave');
  await page.waitForFunction(()=>NR.game.wave===1 && NR.game.state==='playing');
  check(await page.evaluate(()=>NR.evolution.hero.length>0),'Saved wave and hero survive reload');
  const toast=await page.locator('#errtoast').textContent();check(!toast.includes('error'),'No frame error toast');
  await context.close();
 }
 check(errors.length===0,'No browser JavaScript errors: '+errors.join('; '));
 console.log(`${checks} browser checks passed`);
}finally{await browser.close();}
