/* Accessible, lazy-rendered vault, asset archive and draggable HUD editor. */
(function () {
  const E=NR.evolution,G=NR.game,$=id=>document.getElementById(id);
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.onclick=fn;return b;};
  const dialog=document.createElement('dialog');dialog.id='evolution-dialog';document.body.append(dialog);
  let resume=false;
  const close=()=>{dialog.close();if(resume && G.state==='pause'){G.state='playing';NR.ui.hideAll();}resume=false;};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  function open(title) {
    if(!dialog.open){resume=G.state==='playing';if(resume){G.state='pause';NR.input.reset();}}
    dialog.replaceChildren();const h=document.createElement('h2');h.textContent=title;
    dialog.append(button('CLOSE ×',close),h);if(!dialog.open)dialog.showModal();
  }
  function para(text,parent=dialog){const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
  E.vault=()=>{
    open('ABILITY VAULT');
    para(`PLAYER LEVEL ${NR.profile.level} · ${E.slots.length} / 10 slots · Keys 1–9, 0 · Unequip any ability to use fewer slots.`);
    para('Kills grant XP immediately. Each player level adds +4 maximum HP, +2.5% base strike damage and +3% storm power immediately, including during a run. Spell strength rises by 5% per level; each 5-level rank reduces cooldown by 4% (maximum 40%). Run completion adds bonus XP.');
    const grid=document.createElement('div');grid.className='evo-grid';dialog.append(grid);
    for(const s of E.spells){const card=document.createElement('article');const rank=1+Math.floor((NR.profile.level-1)/5);
      const h=document.createElement('h3');h.textContent=s.name;card.append(h);
      para(`${s.desc} · ${E.spellCost(s)} energy · ${E.spellCooldown(s).toFixed(1)}s cooldown · Rank ${rank}`,card);
      const locked=!E.isUnlocked(s);
      const ownedByLevel=(NR.profile.level||1)>=(s.level||1);
      const price=E.spellPrice(s);
      if(locked){
        // two ways in: reach the level (free) or buy now with coins
        const buy=button(`BUY NOW · ${price} COINS`,()=>{if(E.buySpell(s.id)){E.vault();NR.audio.play('purchase');}else NR.audio.play('deny');});
        buy.disabled=(NR.profile.coins||0)<price;buy.classList.add('buy');
        card.append(buy,document.createElement('br'));
        const lvl=button(`FREE AT LEVEL ${s.level}`,()=>NR.hub.notify(`Reach player level ${s.level} to unlock ${s.name} for free.`));
        lvl.classList.add('ghost');card.append(lvl);
      } else {
        const b=button(E.slots.includes(s.id)?`REMOVE · SLOT ${E.slots.indexOf(s.id)+1}`:'EQUIP',()=>{E.equip(s.id);E.vault();});
        b.disabled=!E.slots.includes(s.id) && E.slots.length>=10;card.append(b);
        if(!ownedByLevel){const tag=document.createElement('small');tag.className='purchased-tag';tag.textContent='PURCHASED EARLY';card.append(tag);}
      }
      grid.append(card);
    }
    const gear=document.createElement('details'),summary=document.createElement('summary');summary.textContent='EQUIPPED ITEM POWERS';gear.append(summary);
    for(const [cat,id] of Object.entries({...NR.profile.appearance,pet:NR.profile.pet}))if(id && NR.catalog[cat])para(`${cat.toUpperCase()} · ${id}: ${E.describe(cat,id)}`,gear);
    dialog.append(gear);
  };
  const bar=document.createElement('div');bar.id='ability-bar';document.body.append(bar);
  E.renderBar=()=>{bar.replaceChildren(...E.slots.map((id,i)=>{const s=E.spells.find(s=>s.id===id);const b=button(`${i===9?0:i+1} · ${s.name}`,()=>E.cast(id));b.dataset.spell=id;b.dataset.hud='spell-'+i;b.title=`${s.desc} · ${s.cost} energy · ${s.cd}s`;return b;}));applyLayout();};
  const levelLabel=document.createElement('span');levelLabel.id='world-level-label';$('game-status').append(levelLabel);
  E.updateBar=()=>{levelLabel.textContent=G.mode==='adventure'?`WORLD ${G.chapter+1} · LEVEL ${E.levels[G.chapter]} · HERO LV ${NR.profile.level}`:`HERO LV ${NR.profile.level}`;for(const b of bar.children){const s=E.spells.find(s=>s.id===b.dataset.spell),cd=E.cooldowns?.[s.id]||0;b.disabled=cd>0 || G.player.energy<E.spellCost(s);b.textContent=`${E.slots.indexOf(s.id)===9?0:E.slots.indexOf(s.id)+1} · ${s.name}${cd>0?' · '+Math.ceil(cd)+'s':''}`;}};
  // Visibility follows actual game UI states, even while the simulation is paused.
  const show=NR.ui.show,hide=NR.ui.hideAll;
  NR.ui.show=function(...args){show(...args);bar.hidden=true;};
  NR.ui.hideAll=function(...args){hide(...args);bar.hidden=false;};
  window.addEventListener('keydown',e=>{if(dialog.open || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const m=/^Digit([0-9])$/.exec(e.code);if(m){const i=m[1]==='0'?9:Number(m[1])-1;if(E.slots[i]){e.preventDefault();E.cast(E.slots[i]);}}});
  // In-game ✦ keeps the spell loadout dialog; the Settings vault buttons are
  // GONE — the lobby Vault owns abilities/heroes/pets now.
  if ($('open-vault')) $('open-vault').onclick=E.vault;
  if ($('play-vault')) $('play-vault').onclick=()=>{ if (NR.game.state==='playing') E.vault(); else (NR.codex ? NR.codex.openHeroes() : NR.vault.openVault()); };
  $('btn-continue-encounter').onclick=()=>G.continueEncounter();
  $('next-world-level').onclick=()=>{NR.profile.mode='adventure';NR.profile.chapter=G.chapter;NR.saveProfile();NR.loader.startGame('ENTERING WORLD '+(G.chapter+1),{chapter:G.chapter});};
  $('power-hint').onclick=()=>{
    open('RELAY RESTORED — WHAT CHANGES?');
    const portraits=NR.superContent.portraits,portrait=document.createElement('img');
    portrait.src='assets/'+portraits[((G.chapter||0)+(E.levels[G.chapter]||1))%portraits.length].split('/').map(encodeURIComponent).join('/');portrait.alt='Relay guide';portrait.width=portrait.height=72;dialog.append(portrait);
    para('Restore all 3 relays and defeat all 4 patrols to open extraction. Stand beside a relay, then press F or tap its prompt.');
    para('A restored relay grants 30 XP, heals 20 HP, refills dash and kunai, resets your tactical cooldown, and awards an upgrade choice. Arcane Amplifier, Efficient Channel and Timeweave upgrade Vault magic. Read each upgrade card: the chosen power changes your current run immediately. After choosing, your health, powers and cleared objectives are saved at that relay.');
    para('Level-up XP unlocks more Vault spells at levels 2–10, 12 and 15. Equip up to ten; use number keys or touch buttons. Energy and cooldowns are shown on each spell.');
    para('Defeated? Continue Same Wave / Encounter revives you where you fell with 3 seconds of protection. It does not pay the same rewards twice. After closing the tab, use Resume Saved Wave in Settings to restart your saved survival wave, or Continue for your adventure relay.');
    para(`World ${G.chapter+1 || 1} · Level ${E.levels[G.chapter]||1}. Next Level on victory generates a new route in the same world; Next Chapter travels to another world.`);
  };
  // Bounded percentage coordinates survive phone rotation and desktop resizing.
  const controls=()=>[...document.querySelectorAll('#touch [data-act],#ability-bar button')];
  function key(b){return b.dataset.hud || b.dataset.act;}
  function place(b,pos){if(!Array.isArray(pos)||pos.length!==2||!pos.every(Number.isFinite))return;b.style.position='fixed';b.style.left=`calc(${Math.max(0,Math.min(1,pos[0]))*100}% - ${Math.max(0,Math.min(1,pos[0]))*b.offsetWidth}px)`;b.style.top=`calc(${Math.max(0,Math.min(1,pos[1]))*100}% - ${Math.max(0,Math.min(1,pos[1]))*b.offsetHeight}px)`;b.style.margin='0';}
  function applyLayout(){for(const b of controls())place(b,E.layout[key(b)]);}
  let editing=false,drag=null;
  const editor=document.createElement('div');editor.id='hud-editor';editor.hidden=true;
  editor.append(document.createTextNode('CUSTOM HUD · Drag any control. '),button('SAVE',()=>finish(true)),button('CANCEL',()=>finish(false)),button('RESET',()=>{E.layout={};for(const b of controls())b.removeAttribute('style');}));document.body.append(editor);
  let previous;
  function finish(save){if(!save)E.layout=previous;else E.save();for(const b of controls())b.removeAttribute('style');applyLayout();editing=false;document.body.classList.remove('editing-hud');editor.hidden=true;NR.ui.show('set');}
  $('edit-hud').onclick=()=>{previous=JSON.parse(JSON.stringify(E.layout));editing=true;for(const b of bar.children)b.disabled=false;NR.input.reset();NR.ui.hideAll();document.body.classList.add('editing-hud');editor.hidden=false;applyLayout();};
  document.addEventListener('pointerdown',e=>{if(!editing)return;const b=e.target.closest('#touch [data-act],#ability-bar button');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const r=b.getBoundingClientRect();drag={b,id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};b.setPointerCapture(e.pointerId);},true);
  document.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const {b,dx,dy}=drag;const pos=[Math.max(0,Math.min(1,(e.clientX-dx)/Math.max(1,innerWidth-b.offsetWidth))),Math.max(0,Math.min(1,(e.clientY-dy)/Math.max(1,innerHeight-b.offsetHeight)))];E.layout[key(b)]=pos;place(b,pos);},true);
  for(const event of ['pointerup','pointercancel'])document.addEventListener(event,e=>{if(!editing)return;if(drag){e.preventDefault();e.stopImmediatePropagation();drag=null;}},true);
  document.addEventListener('click',e=>{if(editing && e.target.closest('#touch,#ability-bar')){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('resize',applyLayout);
  // Paginated archive indexes every file, including source formats. No 2,000-image preload.
  let page=0,query='';
  function archive(){open('SUPER ASSET LIBRARY');
    para(`${NR.superManifest.length} files indexed · ${E.assetReplacements} matching gameplay sprite references replaced. ${NR.superContent.actors.length} actors, ${NR.superContent.backgrounds.length} backgrounds, ${NR.superContent.terrain.length} tilesets and ${NR.superContent.effects.length} spell sequences wired. FBX exports are rendered guardians; remaining source/layout variants are identified per file below.`);
    const search=document.createElement('input');search.placeholder='Search heroes, enemies, maps, packs…';search.value=query;search.setAttribute('aria-label','Search asset library');
    const results=document.createElement('div');results.className='evo-grid';const pager=document.createElement('div');
    function draw(){const files=NR.superManifest.filter(p=>p.toLowerCase().includes(query.toLowerCase()));page=Math.min(page,Math.max(0,Math.ceil(files.length/24)-1));results.replaceChildren();
      for(const path of files.slice(page*24,page*24+24)){const card=document.createElement('article'),url='assets/'+path.split('/').map(encodeURIComponent).join('/');
        if(/\.(png|jpg|gif)$/i.test(path)){const img=document.createElement('img');img.src=url;img.loading='lazy';img.alt=path.split('/').pop();card.append(img);}
        para(NR.superContent.coverage[path]||'indexed',card);
        const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=path.replace('super/','');card.append(a);results.append(card);
      }
      pager.replaceChildren(button('← PREVIOUS',()=>{page=Math.max(0,page-1);draw();}),document.createTextNode(` ${page+1} / ${Math.max(1,Math.ceil(files.length/24))} · ${files.length} files `),button('NEXT →',()=>{page++;draw();}));
    }
    search.oninput=()=>{query=search.value;page=0;draw();};dialog.append(search,pager,results);draw();
  }
    // super roster + asset archive are reachable from the Vault / debug tools
  NR.vault.openSuperRoster=()=>{
    open('SUPER ROSTER · HEROES & COMPANIONS');
    para('Choose a hero or pet from the new packs. Selection applies to the next run. Every actor uses measured animation frames, not a full contact sheet.');
    dialog.append(button('DEFAULT HERO',()=>{E.hero='';E.save();}),button('NO SUPER PET',()=>{E.companion='';E.save();}));
    const grid=document.createElement('div');grid.className='evo-grid';dialog.append(grid);
    for(const actor of NR.superContent.actors.filter(a=>['hero','pet'].includes(a.role))){
      const card=document.createElement('article'),h=document.createElement('h3');h.textContent=actor.name;card.append(h);
      const clip=NR.superRuntime.clip(actor,'idle'),frame=clip.frames[0];
      const canvas=document.createElement('canvas');canvas.width=200;canvas.height=110;card.append(canvas);
      NR.assets.load([...new Set(clip.frames.map(f=>f.path))]).then(()=>NR.superRuntime.drawActor(canvas.getContext('2d'),actor,'idle',0,100,105,90,1,1));
      para(actor.role==='hero'?`Hero signature: +${E.signature('hero',actor.id).targets*3} HP, +${(E.signature('hero',actor.id).damage/5).toFixed(1)}% strike multiplier`:E.describe('pet',actor.id),card);
      card.append(button('SELECT '+actor.role.toUpperCase(),()=>{if(actor.role==='hero')E.hero=actor.id;else E.companion=actor.id;E.save();NR.hub.notify(actor.name+' selected for next run.');}));grid.append(card);
    }
    dialog.append(button('UNEQUIP RELIC',()=>{E.relic='';E.save();NR.hub.notify('Relic unequipped.');}));
    for(const relic of NR.superContent.relics){
      const card=document.createElement('article'),img=document.createElement('img');img.src='assets/'+relic.path.split('/').map(encodeURIComponent).join('/');img.alt=relic.name;card.append(img);
      para(relic.name+' · '+E.describe('weapon',relic.id),card);
      const select=button(NR.profile.level<relic.level?'UNLOCK LEVEL '+relic.level:'EQUIP RELIC',()=>{E.relic=relic.id;E.save();NR.hub.notify(relic.name+' selected for next run.');});select.disabled=NR.profile.level<relic.level;card.append(select);grid.append(card);
    }
  };
  if ($('super-roster')) $('super-roster').onclick=()=>NR.vault.openSuperRoster();
  if ($('open-super')) $('open-super').onclick=archive;
  NR.vault.openArchive=archive;
  E.renderBar();bar.hidden=true;
})();
