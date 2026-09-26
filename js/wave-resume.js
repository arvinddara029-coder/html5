/* A survival wave-boundary checkpoint. Live Continue retains the encounter;
   after reload this deliberately restarts the saved wave with the saved build. */
(function(){
  const R=NR.waveResume={},G=NR.game;
  const numeric=(n,max=1e8)=>Number.isFinite(n)&&n>=0&&n<=max;
  R.validate=c=>{
    if(!c||typeof c.runId!=='string'||! /^[a-z0-9]{1,40}$/.test(c.runId)||c.version!==1||!Number.isInteger(c.wave)||c.wave<1||c.wave>10000||!NR.characters.some(a=>a.id===c.character)||!['casual','normal','hard'].includes(c.difficulty)||!NR.powers.some(a=>a.id===c.tactical))return null;
    if(!c.player||!NR.checkpoint.playerFields.every(k=>numeric(c.player[k],10000))||c.player.maxHp<1||c.player.hp<1||c.player.hp>c.player.maxHp||c.player.energy>100||c.player.critCh>1||c.player.lifesteal>1||c.player.speedMul<.1||c.player.dashCdMul<.05||!Number.isInteger(c.player.jumpMax)||c.player.jumpMax<1||c.player.jumpMax>4||!Number.isInteger(c.player.dashMax)||c.player.dashMax<1||c.player.dashMax>3)return null;
    if(!numeric(c.score)||!numeric(c.time,1e6)||!numeric(c.liveXp)||!Number.isInteger(c.heroLevel)||c.heroLevel<1||c.heroLevel>99)return null;
    if(!c.stats || !['kills','maxCombo','storms','parries','kunaiHits','salvaged'].every(k=>numeric(c.stats[k],1e7)))return null;
    if(!c.ledger||!['score','kills','wave','gems','liveXp'].every(k=>numeric(c.ledger[k])))return null;
    if(c.magic && !["damage","cost","cooldown"].every(k=>numeric(c.magic[k],20)&&c.magic[k]>=.25))return null;
    return c;
  };
  R.get=()=>{try{return R.validate(JSON.parse(NR.store.getItem('nr_wave_resume_v1')));}catch(_){return null;}};
  R.save=()=>{
    if(G.mode!=='survival'||G.player.dead||G.wave<1)return;
    const c={version:1,runId:G.runId,wave:G.wave,character:G.character,difficulty:G.difficulty,tactical:G.tactical,
      player:Object.fromEntries(NR.checkpoint.playerFields.map(k=>[k,G.player[k]])),score:G.score,time:G.time,
      stats:{...G.stats},liveXp:G.liveXp||0,heroLevel:G.player.evoLevel||NR.profile.level,
      ledger:{...G.rewardLedger},magic:{...NR.evolution.magic}};
    if(R.validate(c))NR.store.setItem('nr_wave_resume_v1',JSON.stringify(c));
  };
  R.resume=()=>{
    const c=R.get();if(!c){NR.hub.notify('No saved survival wave.');return false;}
    NR.profile.mode='survival';NR.profile.character=c.character;NR.profile.difficulty=c.difficulty;NR.profile.tactical=c.tactical;
    G.start();
    for(const key of NR.checkpoint.playerFields)G.player[key]=c.player[key];
    if(c.magic)NR.evolution.magic={...c.magic};
    G.player.hp=G.player.maxHp;G.player.ghostHp=G.player.hp;G.player.evoLevel=c.heroLevel;
    G.player.dashCharges=G.player.dashMax;G.player.iframes=3;
    G.wave=c.wave-1;G.startT=.75;G.score=c.score;G.time=c.time;G.stats={...c.stats};G.liveXp=c.liveXp;G.rewardLedger={...c.ledger};G.runId=c.runId;
    const paid=R.paid();
    if(paid?.runId===c.runId)for(const key of Object.keys(G.rewardLedger))G.rewardLedger[key]=Math.max(G.rewardLedger[key],paid.ledger[key]);
    // Replayed kills must not pay XP twice if the previous attempt reached a later total.
    G.replayKills=paid?.runId===c.runId?Math.max(0,paid.kills-c.stats.kills):0;
    NR.evolution.onLevelUp(c.heroLevel,NR.profile.level);
    G.banner('RESUME WAVE '+c.wave,'Saved build restored · wave restarts',' #d5fa5b');return true;
  };
  R.validateReceipt=p=>p && typeof p.runId==='string' && /^[a-z0-9]{1,40}$/.test(p.runId) && numeric(p.kills) && p.ledger && ['score','kills','wave','gems','liveXp'].every(k=>numeric(p.ledger[k])) ? p : null;
  R.paid=()=>{try{return R.validateReceipt(JSON.parse(NR.store.getItem('nr_wave_paid_v1')));}catch(_){return null;}};
  R.markPaid=()=>{
    if(G.mode!=='survival')return;
    const prev=R.paid(),same=prev?.runId===G.runId;
    const ledger=Object.fromEntries(Object.entries(G.rewardLedger).map(([k,v])=>[k,Math.max(v,same?prev.ledger[k]:0)]));
    NR.store.setItem('nr_wave_paid_v1',JSON.stringify({runId:G.runId,kills:Math.max(G.stats.kills,same?prev.kills:0),ledger}));
  };
})();
