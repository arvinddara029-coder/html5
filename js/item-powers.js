/* Every item has a stable, distinct two-trait signature; equipment magic uses
   the same values displayed in the store, not disconnected flavour text. */
(function(){
  const E=NR.evolution,P=NR.profile;
  const archetypes=['Flame Crown','Ice Prison','Vampire Pact','Chain Lightning','Earthshatter','Gravity Well','Venom Bloom','Wind Reversal','Spirit Battery','Judgment'];
  E.signature=(cat,id)=>{
    const h=E.hash(cat+':'+id);
    return {id:h.toString(36),mode:h%10,name:archetypes[h%10],damage:12+(h%211)/10,range:150+(h>>>8)%301,
      cooldown:4+(h>>>16)%61/10,duration:1.2+(h>>>20)%17/10,targets:1+(h>>>10)%4};
  };
  const stat=E.item;
  E.item=(cat,id)=>{
    const first=stat(cat,id),second=stat(cat,id+'::secondary');
    return {...first,second:{...second,value:second.value*.35},desc:first.desc+` · secondary ${second.field} +${(second.value*.35).toFixed(3)}`};
  };
  const apply=E.apply;
  E.apply=p=>{
    apply(p);
    const look=p.look||P.appearance;
    // Replace the first-pass appearance modifiers when an operator has a signature look.
    if(p.look)for(const [cat,id] of Object.entries(P.appearance))if(id && NR.catalog[cat]?.some(o=>o.id===id)){const t=stat(cat,id);p[t.field]-=t.value;}
    for(const [cat,id] of Object.entries({...look,pet:P.pet})){
      if(!id||!NR.catalog[cat]?.some(o=>o.id===id))continue;
      const t=E.item(cat,id);
      if(p.look && cat!=='pet')p[t.field]+=t.value;
      p[t.second.field]=(p[t.second.field]||0)+t.second.value;
    }
    const hero=E.hero?E.signature('hero',E.hero):null;
    if(hero){p.maxHp+=hero.targets*3;p.dmgMul+=hero.damage/500;}
    p.hp=p.maxHp;p.critCh=Math.min(.85,p.critCh);p.lifesteal=Math.min(.5,p.lifesteal);
  };
  E.describe=(cat,id)=>{
    const t=E.item(cat,id),s=E.signature(cat,id);
    return t.desc+(['weapon','aura','pet'].includes(cat)?` · ${s.name}: ${s.damage.toFixed(1)} power, ${s.range}px, ${s.targets} targets, ${s.cooldown.toFixed(1)}s cooldown`:'');
  };
  E.proc=(s,source)=>{
    const G=NR.game,p=G.player,power=(1+(P.level-1)*.05)*(E.magic?.damage||1);
    const targets=G.enemies.filter(e=>!e.dead && e.spawnT<=0 && Math.hypot(e.x-p.x,e.y-p.y)<s.range).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)).slice(0,s.targets);
    if(s.mode===1){G.chronoT=Math.max(G.chronoT,s.duration);}
    if(s.mode===2)p.heal(s.damage*.4*power);
    if(s.mode===7){p.iframes=Math.max(p.iframes,.35);p.dashCharges=Math.min(p.dashMax,p.dashCharges+1);}
    if(s.mode===8)p.energy=Math.min(100,p.energy+s.damage*.4);
    for(const e of targets){
      const dmg=s.damage*power*(s.mode===9 && e.hp<e.maxHp*.35?2:1);
      if(s.mode===6){e.venom={time:s.duration,tick:0,damage:dmg*.2};}
      else e.hurt(dmg,(s.mode===5?-1:1)*(Math.sign(e.x-p.x)||1)*180,s.mode===4?-550:-80,false,G);
    }
    NR.superRuntime?.effect(p.x,p.y,s.id+source,s.range*.65);
  };
  E.weaponMagic=()=>{
    const id=E.relic || (NR.game.player.look||P.appearance).weapon;if(!id)return;
    const s=E.signature('weapon',id);
    if(E.cooldowns.weapon>0)return;E.cooldowns.weapon=s.cooldown;E.proc(s,'weapon');
  };
  // Replace prior generic pet/aura tick while keeping cooldowns, statuses and HUD in one place.
  E.tick=dt=>{
    const G=NR.game,p=G.player;
    for(const key of Object.keys(E.cooldowns||{}))E.cooldowns[key]=Math.max(0,E.cooldowns[key]-dt);
    if(p.dead)return;
    for(const e of G.enemies){if(e.dead||!e.venom)continue;const v=e.venom;v.time-=dt;v.tick-=dt;
      if(v.tick<=0){v.tick=.5;e.hurt(v.damage,0,0,false,G);}if(v.time<=0)e.venom=null;}
    for(const [cat,id] of [['aura',(p.look||P.appearance).aura],['pet',E.companion||P.pet]])if(id && !(E.cooldowns[cat]>0)){
      const s=E.signature(cat,id);E.cooldowns[cat]=s.cooldown;E.proc(s,cat);
    }
    E.updateBar?.();
  };
})();
