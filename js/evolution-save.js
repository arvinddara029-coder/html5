/* Shared schema for local persistence and portable backups. No functions or DOM
   objects are deserialized; old backups remain readable. */
(function(){
  const E=NR.evolution;
  E.snapshot=()=>({seed:E.seed,levels:[...E.levels],slots:[...E.slots],layout:JSON.parse(JSON.stringify(E.layout)),hero:E.hero,companion:E.companion,relic:E.relic});
  E.validate=(data,profile=NR.profile)=>{
    const fail=()=>{throw new Error('Invalid evolution save.');};
    if(!data || typeof data!=='object' || !Number.isInteger(data.seed)||data.seed<0||data.seed>4294967295)fail();
    if(!Array.isArray(data.levels)||data.levels.length!==NR.adventure.chapters.length||data.levels.some(n=>!Number.isInteger(n)||n<1||n>100000))fail();
    if(!Array.isArray(data.slots)||data.slots.length>10||new Set(data.slots).size!==data.slots.length||data.slots.some(id=>!E.spells.some(s=>s.id===id && s.level<=profile.level)))fail();
    if(!data.layout||typeof data.layout!=='object'||Array.isArray(data.layout)||Object.keys(data.layout).length>32)fail();
    const layout={};
    for(const [key,pos] of Object.entries(data.layout)){
      if(!/^(left|right|down|jump|dash|attack|parry|kunai|tactical|special|spell-[0-9])$/.test(key)||!Array.isArray(pos)||pos.length!==2||pos.some(n=>!Number.isFinite(n)||n<0||n>1))fail();
      layout[key]=[...pos];
    }
    const hero=data.hero||'',companion=data.companion||'',relic=data.relic||'';
    if(relic && !NR.superContent.relics.some(r=>r.id===relic && r.level<=profile.level))fail();
    if(hero && !NR.superContent.actors.some(a=>a.id===hero && a.role==='hero'))fail();
    if(companion && !NR.superContent.actors.some(a=>a.id===companion && a.role==='pet'))fail();
    return {seed:data.seed,levels:[...data.levels],slots:[...data.slots],layout,hero,companion,relic};
  };
  E.restore=data=>{const clean=E.validate(data);Object.assign(E,clean);E.save();E.renderBar?.();};
  // Clamp malformed local layouts too, not just imported layouts.
  try{const clean=E.validate(E.snapshot());Object.assign(E,clean);}catch(_){E.layout={};E.hero='';E.companion='';E.relic='';E.save();}
})();
