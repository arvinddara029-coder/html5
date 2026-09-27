/* Equipment powers, persistent adventure seeds and ten-slot spell loadouts. */
(function () {
  const E = NR.evolution = {}, P = NR.profile;
  const read = () => { try { return JSON.parse(NR.store.getItem('nr_evolution_v1')) || {}; } catch (_) { return {}; } };
  const saved = read();
  E.hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  E.seed = Number.isInteger(saved.seed) ? saved.seed >>> 0 : Math.floor(Math.random() * 4294967296);
  E.levels = Array.from({length: NR.adventure.chapters.length}, (_, i) => Math.max(1, Math.min(100000, Math.floor(Number(saved.levels?.[i]) || 1))));
  E.spells = [
    ['ember','Ember Nova','Burn nearby enemies',1,8,16,'fire'],
    ['frost','Frost Lock','Freeze the pace of battle for 3 seconds',2,12,20,'slow'],
    ['mend','Living Spring','Restore health instantly',3,16,22,'heal'],
    ['ward','Astral Ward','Block incoming damage for 3 seconds',4,18,25,'shield'],
    ['thunder','Chain Thunder','Strike the nearest three enemies',5,10,22,'chain'],
    ['quake','Earth Breaker','Launch enemies into the air',6,13,24,'launch'],
    ['siphon','Soul Harvest','Damage nearby enemies and steal life',7,15,25,'drain'],
    ['blink','Wind Step','Refill dash charges and gain brief immunity',8,12,18,'dash'],
    ['star','Starfall','Long-range blast across the battlefield',9,20,30,'blast'],
    ['nova','Void Collapse','Pull enemies toward you with a gravity burst',10,17,28,'pull'],
    ['phoenix','Phoenix Heart','Greater healing and brief protection',12,24,35,'phoenix'],
    ['execution','Radiant Judgment','Heavy damage to the closest target',15,18,30,'execute'],
  ].map(([id,name,desc,level,cd,cost,effect])=>({id,name,desc,level,cd,cost,effect}));
  E.slots = Array.isArray(saved.slots) ? [...new Set(saved.slots)].filter(id=>E.spells.some(s=>s.id===id && s.level<=P.level)).slice(0,10) : ['ember'];
  E.relic = typeof saved.relic==='string'?saved.relic:'';
  E.hero = typeof saved.hero==='string' ? saved.hero : '';
  E.companion = typeof saved.companion==='string' ? saved.companion : '';
  E.layout = saved.layout && typeof saved.layout === 'object' ? saved.layout : {};
  E.save = () => NR.store.setItem('nr_evolution_v1', JSON.stringify({seed:E.seed,levels:E.levels,slots:E.slots,layout:E.layout,hero:E.hero,companion:E.companion,relic:E.relic}));
  E.equip = id => {
    if (E.slots.includes(id)) E.slots = E.slots.filter(x=>x!==id);
    else if (E.slots.length < 10 && E.spells.some(s=>s.id===id && s.level<=P.level)) E.slots.push(id);
    E.save(); E.renderBar?.();
  };
  const traits = [
    ['Ember','dmgMul',.025,'strike damage'], ['Glacier','guardMul',.045,'hit protection'],
    ['Storm','energyMul',.04,'energy gain'], ['Vampiric','lifesteal',.004,'life steal'],
    ['Gale','speedMul',.012,'movement speed'], ['Oracle','critCh',.006,'critical chance'],
    ['Titan','maxHp',2,'maximum health'], ['Tempest','stormMul',.035,'storm damage']
  ];
  E.item = (category,id) => {
    const h = E.hash(category+':'+id), t = traits[h % traits.length], rank = 1 + ((h >>> 4) % 5) + ((h >>> 12) % 101)/100;
    return {name:t[0]+' '+(category==='weapon'?'Enchantment':category==='pet'?'Companion':'Resonance'), field:t[1], value:t[2]*rank,
      desc:`${t[0]} · +${t[1]==='maxHp' ? t[2]*rank+' HP' : (t[2]*rank*100).toFixed(1)+'%'} ${t[3]} · signature ${h.toString(36).toUpperCase()}`};
  };
  E.apply = p => {
    const level = P.level || 1;
    p.evoLevel=level;
    p.maxHp += (level-1)*4; p.dmgMul *= 1+(level-1)*.025; p.stormMul *= 1+(level-1)*.03;
    for (const [cat,id] of Object.entries({...P.appearance,pet:P.pet})) {
      if (!id || !NR.catalog[cat]?.some(o=>o.id===id)) continue;
      const t = E.item(cat,id); p[t.field] = (p[t.field] || 0)+t.value;
    }
    p.critCh=Math.min(.85,p.critCh); p.lifesteal=Math.min(.5,p.lifesteal); p.hp=p.maxHp;
    E.cooldowns={}; E.petT=0; E.magic={damage:1,cost:1,cooldown:1};
  };
  E.onLevelUp = (before,level) => {
    const p=NR.game.player;
    if(p && p.evoLevel && level>p.evoLevel){
      const old=p.evoLevel;
      p.maxHp+=(level-old)*4; p.hp=Math.min(p.maxHp,p.hp+(level-old)*4);
      p.dmgMul *= (1+(level-1)*.025)/(1+(old-1)*.025);
      p.stormMul *= (1+(level-1)*.03)/(1+(old-1)*.03);
      p.evoLevel=level;
    }
    const names=E.spells.filter(s=>s.level>before && s.level<=level).map(s=>s.name);
    NR.hub?.notify(`LEVEL ${level} · +${(level-before)*4} HP · Damage & magic boosted${names.length?' · UNLOCKED: '+names.join(', '):''}`);
    E.renderBar?.();
  };
  E.rewardKill = () => {
    const G=NR.game;G.liveXp=(G.liveXp||0)+12;
    if(G.replayKills>0)G.replayKills--;else NR.economy.applyXp(12,'Enemy defeated');
    NR.waveResume?.markPaid();
  };
  E.spellCost=s=>Math.ceil(s.cost*(E.magic?.cost||1));
  E.spellCooldown=s=>s.cd*Math.max(.6,1-Math.floor((P.level-1)/5)*.04)*(E.magic?.cooldown||1);
  E.cast = id => {
    const G=NR.game,p=G.player,s=E.spells.find(s=>s.id===id);
    if (!s || G.state!=='playing' || p.dead || !E.slots.includes(id) || P.level<s.level || (E.cooldowns?.[id]||0)>0 || p.energy<E.spellCost(s)) return false;
    p.energy-=E.spellCost(s); E.cooldowns[id]=E.spellCooldown(s);
    const power=(1+(P.level-1)*.05)*(E.magic?.damage||1);
    if (s.effect==='heal' || s.effect==='phoenix') p.heal(32*power);
    if (s.effect==='shield' || s.effect==='phoenix') p.shieldT=3;
    if (s.effect==='slow') G.chronoT=3;
    if (s.effect==='dash') { p.dashCharges=p.dashMax; p.iframes=1.2; }
    const range=s.effect==='blast'?900:460;
    let targets=G.enemies.filter(e=>!e.dead && e.spawnT<=0 && Math.hypot(e.x-p.x,e.y-p.y)<range).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x));
    if(s.effect==='chain') targets=targets.slice(0,3);
    if(s.effect==='execute') targets=targets.slice(0,1);
    if(['fire','chain','launch','drain','blast','pull','execute'].includes(s.effect)) for(const e of targets) {
      const dmg=(s.effect==='execute'?100:s.effect==='blast'?65:34)*power;
      e.hurt(dmg, (s.effect==='pull'?-1:1)*(Math.sign(e.x-p.x)||1)*350,s.effect==='launch'?-650:-150,true,G);
      if(s.effect==='drain') p.heal(dmg*.15);
    }
    NR.superRuntime?.effect(p.x,p.y-45,id,150,'magic');
    NR.fx.ring(p.x,p.y-40,{col:'cyan',r1:Math.min(range,340),life:.4,lw:3});
    G.banner(s.name,`LEVEL ${P.level} · POWER ×${power.toFixed(2)}`,'#b4e784'); return true;
  };
  E.tick = dt => {
    for(const id of Object.keys(E.cooldowns||{})) E.cooldowns[id]=Math.max(0,E.cooldowns[id]-dt);
    const G=NR.game,p=G.player;
    if(p.dead)return;
    if((P.pet || E.companion) && !p.dead) {
      E.petT=(E.petT||0)-dt;
      if(E.petT<=0) {
        const h=E.hash(E.companion || P.pet), mode=h%3; E.petT=5+(h%4);
        if(mode===0) p.heal(4+P.level);
        else if(mode===1) p.energy=Math.min(100,p.energy+8+P.level);
        else { const e=G.enemies.find(e=>!e.dead && e.spawnT<=0 && Math.abs(e.x-p.x)<450); if(e) e.hurt(12+P.level*2,120,-80,false,G); }
      }
    }
    E.updateBar?.();
  };
  E.generate = () => {
    const A=NR.adventure;if(!A.active)return;
    let seed=E.hash(`${E.seed}:${A.chapter.id}:${E.levels[A.chapter.id]}`);
    const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
    const count=14+Math.floor(rand()*6);
    NR.world.platforms = Array.from({length:count},(_,i)=>{
      const x=450+i*(NR.world.W-1050)/count+rand()*130;
      const y=NR.world.groundY-95-rand()*175,w=110+rand()*150;
      return {x,y,w,h:24,...(rand()<.3?{moving:true,baseX:x,baseY:y,phase:rand()*6,ampX:35+rand()*55,ampY:15+rand()*25}:{})};
    });
    for(const z of A.zones){const shift=Math.round(rand()*140-70);z.x+=shift;z.gate+=shift;}
    for(const r of A.relays)r.x+=Math.round(rand()*120-60);
    for(const list of [A.caches,A.props,A.hazards]) for(const o of list) o.x+=Math.round(rand()*200-100);
    for(const h of A.hazards){ h.type=['spikes','saw','laser'][Math.floor(rand()*3)];h.phase=rand()*6; }
    const backgrounds=(NR.superManifest||[]).filter(p=> /Background Castle.*\.png$/i.test(p));
    E.background=backgrounds[(A.chapter.id+E.levels[A.chapter.id]-1)%backgrounds.length];
    if(E.background) NR.assets.preload([E.background]);
    // Keep shards on their generated platforms, and the mandatory route on walkable ground.
    A.shards.forEach((s,i)=>{const p=NR.world.platforms[i%NR.world.platforms.length];if(p){s.x=p.x+p.w*.5;s.y=p.y-45;}});
  };
  E.save();
})();
(function () {
  const E=NR.evolution,P=NR.profile;
  const weaponNames=['Flame cleave','Frost field','Vampire edge','Thunder arc'];
  const auraNames=['Healing pulse','Energy pulse','Protection pulse','Gravity pulse'];
  E.describe=(cat,id)=>E.item(cat,id).desc+(cat==='weapon'?` · ${weaponNames[E.hash(id)%4]} every 5s on hit`:cat==='aura'?` · ${auraNames[E.hash(id)%4]} every 8s`:cat==='pet'?` · ${['Heals you','Restores energy','Attacks enemies'][E.hash(id)%3]} every ${5+E.hash(id)%4}s`:'');
  E.weaponMagic=()=>{
    if((E.cooldowns.weapon||0)>0)return;
    E.cooldowns.weapon=5;
    const G=NR.game,p=G.player,id=P.appearance.weapon||'',mode=E.hash(id)%4;
    if(mode===1) G.chronoT=1.5;
    else if(mode===2) p.heal(8+P.level);
    else for(const e of G.enemies.filter(e=>!e.dead && e.spawnT<=0 && Math.abs(e.x-p.x)<(mode===3?400:190)).slice(0,mode===3?3:20)) e.hurt(10+P.level*2,p.facing*200,-100,false,G);
    NR.fx.ring(p.x,p.y-40,{col:mode===0?'orange':'cyan',r1:150,life:.3,lw:2});
  };
  const tick=E.tick;
  E.tick=dt=>{
    tick(dt);
    if(!NR.game.player.dead && P.appearance.aura && !(E.cooldowns.aura>0)) {
      E.cooldowns.aura=8; const p=NR.game.player,mode=E.hash(P.appearance.aura)%4;
      if(mode===0)p.heal(5+P.level);
      if(mode===1)p.energy=Math.min(100,p.energy+12);
      if(mode===2)p.shieldT=Math.max(p.shieldT||0,1.2);
      if(mode===3)for(const e of NR.game.enemies)if(!e.dead && Math.abs(e.x-p.x)<250)e.hurt(5+P.level,-Math.sign(e.x-p.x)*150,-80,false,NR.game);
    }
  };
  // Exact-path replacements preserve frame layouts. Everything else remains browsable on demand.
  const paths=new Set(NR.superManifest||[]);
  let replacements=Object.values(NR.catalog).flat().filter(o=>o.path?.startsWith("super/")).length;
  const visit=o=>{if(!o || typeof o!=='object')return;for(const [k,v] of Object.entries(o)){if(k==='path' && typeof v==='string' && paths.has('super/'+v)){o[k]='super/'+v;replacements++;}else if(typeof v==='object')visit(v);}};
  visit(NR.catalog);visit(NR.sheets);
  E.assetReplacements=replacements;
  const slimePath='super/Legacy Collection/Assets/TinyRPG/Characters/Battle Sprites/Living Pack 1/Slime/slime-sheet.png';
  if(paths.has(slimePath)) NR.sheets.slimeGreen={fw:118,fh:79,crop:{x:10,y:14,w:100,h:60},floor:74,renderScale:.95,
    anims:{idle:{path:slimePath,frames:4},hop:{path:slimePath,frames:4},death:{path:slimePath,frames:4}}};
})();
