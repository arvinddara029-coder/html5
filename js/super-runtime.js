/* Measured source sprites become actual actors, spell FX, terrain and scenery.
   Only the current district's small asset set streams; source/3D files are never
   passed to the canvas renderer or misrepresented as playable sprites. */
(function () {
  const C=NR.superContent, E=NR.evolution, G=NR.game, U=NR.util;
  const S=NR.superRuntime={effects:[],scene:null};
  S.actor=id=>C.actors.find(a=>a.id===id);
  S.clip=(actor,state,t=0)=>{
    const expressions={idle:/idle|stand|taunt|no.fire|ship|breath/,walk:/walk|run|fly|chase|skip/,attack:/attack|slash|shoot|breath|burn|fire/,hurt:/hurt|hit|damage/,death:/dead|death|die|vanish/,jump:/jump|fly|fall/};
    const matches=actor.clips.filter(c=>(expressions[state]||/idle/).test(c.name));
    return (matches.length?matches:actor.clips)[Math.floor(Math.max(0,t)/4)%(matches.length||actor.clips.length)];
  };
  S.preloadClip=clip=>NR.assets.preload([...new Set(clip.frames.flatMap(f=>[f.path,...(f.alternates||[]).map(a=>a.path)]))]);
  S.preloadActor=actor=>{if(actor)for(const clip of actor.clips)S.preloadClip(clip);};
  S.drawClip=(ctx,clip,t,x,y,height=80,facing=1,alpha=1,loop=true)=>{
    const index=loop?Math.floor(Math.max(0,t)*clip.fps)%clip.frames.length:Math.min(clip.frames.length-1,Math.floor(Math.max(0,t)*clip.fps));
    const base=clip.frames[index],aliases=base.alternates||[];
    const chosen=Math.floor(Math.max(0,t))%(aliases.length+1);
    const alternate=chosen?aliases[chosen-1]:base;
    const f=NR.assets.get(alternate.path)?alternate:base,img=NR.assets.get(f.path);if(!img)return false;
    const [sx,sy,fw,fh]=f.rect,[l,top,r,bottom]=clip.bounds,scale=height/Math.max(1,bottom-top);
    // Full cell is drawn relative to the union bounds; transparent animation padding is preserved.
    ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);if(facing<0)ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(img,sx,sy,fw,fh,-(l+(r-l)/2)*scale,-bottom*scale,fw*scale,fh*scale);ctx.restore();return true;
  };
  S.drawActor=(ctx,actor,state,t,x,y,height,facing,alpha)=>S.drawClip(ctx,S.clip(actor,state,t),t,x,y,height,facing,alpha);
  S.hero=(ctx,pose,options)=>{
    const actor=S.actor(E.hero);if(!actor)return false;
    const state=pose.dead?'death':pose.anim==='attack'||pose.attack?'attack':pose.anim==='jump'||pose.anim==='fall'?'jump':pose.anim==='run'||pose.anim==='walk'?'walk':'idle';
    return S.drawActor(ctx,actor,state,pose.t||0,pose.x,pose.y,92,pose.facing,options.ghost?.5:1);
  };
  S.relic=(ctx,p)=>{
    const relic=C.relics.find(r=>r.id===E.relic);if(!relic)return;const img=NR.assets.get(relic.path);if(!img)return;
    ctx.save();ctx.translate(p.x+p.facing*30,p.y-40);ctx.rotate(Math.sin(p.t*4)*.12+(p.attackT>0?p.facing*p.t*10:0));
    ctx.drawImage(img,-24,-24,48,48);ctx.restore();
  };
  S.companion=(ctx,p)=>{
    const actor=S.actor(E.companion);if(!actor||p.dead)return;
    S.drawActor(ctx,actor,Math.abs(p.vx)>20?'walk':'idle',p.t,p.petX||p.x-65,p.petY||p.y,42,p.facing,1);
  };
  S.effect=(x,y,key,size=130)=>{
    if(!C.effects.length)return;
    const clip=C.effects[E.hash(String(key))%C.effects.length];S.preloadClip(clip);
    S.effects.push({clip,x,y,size,t:0});if(S.effects.length>28)S.effects.shift();
  };
  const fxUpdate=NR.fx.update,fxDraw=NR.fx.draw,fxReset=NR.fx.reset;
  NR.fx.update=dt=>{fxUpdate(dt);for(const f of S.effects)f.t+=dt;S.effects=S.effects.filter(f=>f.t<(f.clip.frames.length/f.clip.fps)+.15);};
  NR.fx.draw=ctx=>{fxDraw(ctx);for(const f of S.effects)S.drawClip(ctx,f.clip,f.t,f.x,f.y,f.size,1,1,false);};
  NR.fx.reset=()=>{fxReset();S.effects=[];};
  S.prepare=()=>{
    const chapter=G.chapter||0,level=E.levels[chapter]||1,index=chapter*11+level-1;
    const enemies=C.actors.filter(a=>a.role==='enemy');
    const roster=Array.from({length:4},(_,i)=>enemies[(index*4+i)%enemies.length]);
    const back=C.backgrounds[index%C.backgrounds.length],tile=C.terrain[index%C.terrain.length];
    const props=Array.from({length:8},(_,i)=>C.props[(index*8+i)%C.props.length]);
    const helpers=C.actors.filter(a=>a.role==='npc'),npc=helpers[index%helpers.length];
    const fire=C.ambient.filter(c=>c.name==='campfire')[index%16],portal=C.ambient.find(c=>c.name==='portal'),snow=C.ambient.find(c=>c.name==='snow');
    for(const clip of [fire,portal,snow])if(clip)S.preloadClip(clip);
    S.scene={roster,back,tile,props,index,npc,fire,portal,snow};
    S.preloadActor(npc);
    NR.assets.preload([C.relics.find(r=>r.id===E.relic)?.path,back?.path,tile?.path,...props.map(p=>p?.path),...C.hud].filter(Boolean));
    for(const actor of [...roster,S.actor(E.hero),S.actor(E.companion)])S.preloadActor(actor);
    // Also stream the upcoming spell visuals before the first cast.
    for(const id of E.slots)S.preloadClip(C.effects[E.hash(id)%C.effects.length]);
    if(back)E.background=back.path;
  };
  S.drawScenery=(ctx,cam,view)=>{
    const scene=S.scene;if(!scene)return;
    const width=NR.world.W,gy=NR.world.groundY;
    if(NR.adventure.active){
      if(scene.fire)for(const cache of NR.adventure.caches){if(cache.x>cam.x-100&&cache.x<cam.x+view.w+100)S.drawClip(ctx,scene.fire,NR.adventure.t,cache.x+80,gy,48);}
      if(scene.portal && width-230>cam.x-200 && width-230<cam.x+view.w+200)S.drawClip(ctx,scene.portal,NR.adventure.t,width-230,gy,175);
      if(scene.snow && scene.index%5===4)S.drawClip(ctx,scene.snow,NR.adventure.t,cam.x+view.w/2,cam.y+view.h,view.h,1,.3);
    }
    if(scene.npc && NR.adventure.active)for(const r of NR.adventure.relays){if(r.x>cam.x-100&&r.x<cam.x+view.w+100)S.drawActor(ctx,scene.npc,'idle',NR.adventure.t,r.x-70,gy,75,1,1);}
    for(let i=0;i<scene.props.length;i++){
      const p=scene.props[i],x=350+i*(width-700)/scene.props.length;if(x<cam.x-250||x>cam.x+view.w+250)continue;
      const img=NR.assets.get(p.path);if(!img)continue;
      const [l,t,r,b]=p.rect,h=Math.min(180,b-t)*1.5,w=h*(r-l)/Math.max(1,b-t);
      ctx.drawImage(img,l,t,r-l,b-t,x-w/2,gy-h,w,h);
    }
  };
  S.drawTerrain=(ctx,cam,view)=>{
    const tile=S.scene?.tile;if(!tile)return;const img=NR.assets.get(tile.path);if(!img)return;
    const cells=tile.cells,idx=(S.scene.index*17)%cells.length,rect=cells[idx];
    const stamp=(x,y,w,h)=>{ctx.drawImage(img,...rect,x,y,w,h);};
    for(let x=Math.floor(cam.x/32)*32;x<cam.x+view.w+32;x+=32)stamp(x,NR.world.groundY,32,32);
    for(const p of NR.world.platforms){if(p.x+p.w<cam.x||p.x>cam.x+view.w)continue;for(let x=p.x;x<p.x+p.w;x+=32)stamp(x,p.y,Math.min(32,p.x+p.w-x),Math.min(24,p.h));}
  };
  const back=NR.adventure.drawScenery;
  NR.adventure.drawScenery=(ctx,cam,view)=>{back(ctx,cam,view);S.drawScenery(ctx,cam,view);};
  const front=NR.world.drawFront;
  NR.world.drawFront=(ctx,cam,view)=>{S.drawTerrain(ctx,cam,view);front(ctx,cam,view);};

  const hudDraw=NR.hud.draw;
  NR.hud.draw=(ctx,G,w,h)=>{
    hudDraw(ctx,G,w,h);if(!G.player)return;
    const x=w<650?190:320,y=20,frame=NR.assets.get(C.hud.find(p=>p.endsWith('/Hp bar.png')));
    const orb=NR.assets.get(C.hud.find(p=>p.endsWith('/red bar.png')));
    const energy=NR.assets.get(C.hud.find(p=>p.endsWith('/Blue bar.png')));
    const xp=NR.assets.get(C.hud.find(p=>p.endsWith('/yellow bar.png')));
    const base=NR.assets.get(C.hud.find(p=>p.endsWith('/Base-01.png')));
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(frame)ctx.drawImage(frame,x,y,58,32);
    if(orb)ctx.drawImage(orb,x+1,y+2,24,24);
    if(base)ctx.drawImage(base,141,63,25,23,x+52,y-1,12,12);
    if(energy)ctx.drawImage(energy,x+28,y+13,32*Math.max(0,Math.min(1,G.player.energy/100)),4);
    const lv=NR.economy.levelFromXp(NR.profile.xp);
    if(xp)ctx.drawImage(xp,x+28,y+21,32*Math.min(1,lv.into/lv.need),3);
    ctx.fillStyle='#fff';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText(String(NR.profile.level),x+13,y+17);ctx.restore();
  };

  class SuperEnemy extends NR.Enemy {
    constructor(x,y,mul,actorId){
      super(x,y);this.actor=S.actor(actorId)||S.scene?.roster[0]||C.actors.find(a=>a.role==='enemy');
      this.type='super';this.actorId=this.actor.id;
      const h=E.hash(this.actor.id);this.style=this.actor.role==='guardian'?1:h%5;
      this.w=48+(h%16);this.h=60+(h%30);this.barY=this.h;
      this.maxHp=this.hp=Math.round((30+h%36)*mul);this.dmg=8+h%9;this.score=100+h%70;
      this.speed=90+h%90;this.cd=1+(h%9)/10;this.windup=0;this.action='idle';
      this.flying=this.actor.role==='guardian'||/fly|crow|ghost|bird|skull|spaceship|ship|bee/.test(this.actor.name.toLowerCase());
      if(this.actor.role==='guardian'){this.h=130;this.w=75;this.maxHp=this.hp=Math.round(90*mul);this.dmg=15;this.score=350;}
      if(this.flying)this.y-=120;
      S.preloadActor(this.actor);
    }
    update(dt,G){
      this.t+=dt;this.flash-=dt;this.touchCd-=dt;
      if(this.spawnT>0){this.spawnT-=dt;return;}
      const p=G.player,dx=p.x-this.x;this.facing=dx>=0?1:-1;
      this.cd-=dt;
      if(this.stunned>0){this.stunned-=dt;this.vx=U.damp(this.vx,0,7,dt);this.action='hurt';}
      else if(this.windup>0){
        this.windup-=dt;this.action='attack';this.vx=U.damp(this.vx,0,8,dt);
        if(this.windup<=0){
          if(this.style===1||this.flying){
            const angle=Math.atan2(p.y-40-(this.y-this.h/2),dx);
            G.bolts.push(new NR.Bolt(this.x,this.y-this.h/2,Math.cos(angle)*350,Math.sin(angle)*350,{dmg:this.dmg*G.enemyDmgMul,col:'purple'}));
          }else if(this.style===2){G.shockwaves.push(new NR.ShockRing(this.x,this.facing,{h:55,dmg:this.dmg*G.enemyDmgMul,speed:260}));}
          else {this.vx=this.facing*(this.style===3?620:390);this.vy=this.style===4?-500:-150;}
          S.effect(this.x,this.y,this.actor.id,80);
        }
      }else {
        this.action='walk';this.vx=U.damp(this.vx,this.facing*this.speed*G.enemySpdMul,4,dt);
        if(Math.abs(dx)<(this.flying||this.style===1?480:210)&&this.cd<=0){this.windup=.6;this.cd=2+(E.hash(this.actor.id)%9)/10;}
      }
      if(this.flying){this.x+=this.vx*dt;this.y=U.damp(this.y,p.y-95+Math.sin(this.t*2)*24,1.5,dt);this.x=U.clamp(this.x,40,NR.world.W-40);}
      else this.phys(dt);
    }
    die(G){if(this.dead)return;S.effect(this.x,this.y,this.actor.id+'death',110);super.die(G);}
    draw(ctx){
      const drawn=S.drawActor(ctx,this.actor,this.action,this.t,this.x,this.y,this.h,this.facing,this.flash>0?.55:1);
      if(!drawn){ctx.fillStyle='#b1a3eb';ctx.fillRect(this.x-this.w/2,this.y-this.h,this.w,this.h);}
      if(this.windup>0){ctx.strokeStyle='#ffe384';ctx.lineWidth=3;ctx.beginPath();ctx.arc(this.x,this.y-this.h/2,this.h*.7,0,U.TAU);ctx.stroke();}
      this.hpBar(ctx);this.drawSpawnFx(ctx);
    }
  }
  NR.SuperEnemy=SuperEnemy;
  S.guardian=(x,y)=>{const list=C.actors.filter(a=>a.role==='guardian');return list.length?new SuperEnemy(x,y,G.enemyHpMul,list[((G.chapter||0)+(E.levels[G.chapter]||1)-1)%list.length].id):null;};
  S.spawn=(x,y,index=0)=>new SuperEnemy(x,y,G.enemyHpMul,S.scene?.roster[index%4]?.id);
})();
