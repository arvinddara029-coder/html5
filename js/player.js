/* ============ NEON RONIN — player: movement, combos, dash, blade storm ============ */
(function () {
  const U = NR.util, W = NR.world, F = NR.fx, I = NR.input;
  const GRAV = 2600;

  const ATTACKS = [
    { dur: 0.30, strikeAt: 0.09, dmg: 14, rng: 165, kb: 300, a0: -2.1, a1: 0.95, sfx: "swing" },
    { dur: 0.30, strikeAt: 0.08, dmg: 16, rng: 165, kb: 340, a0: 1.35, a1: -1.8, sfx: "swing2" },
    { dur: 0.46, strikeAt: 0.16, dmg: 32, rng: 190, kb: 640, a0: -2.9, a1: 0.85, sfx: "swing3", heavy: true },
  ];

  class Player {
    constructor() { this.reset(); }

    reset() {
      this.x = W.W / 2; this.y = W.groundY; this.vx = 0; this.vy = 0;
      this.w = 36; this.h = 78; this.facing = 1;
      this.maxHp = 100; this.hp = 100;
      this.energy = 35; this.maxEnergy = 100;
      this.tacticalCd = 0; this.shieldT = 0; this.overdriveT = 0; this.droneT = 0; this.droneShot = 0; this.footT=0;
      this.damageTakenMul = 1; this.character="ronin"; this.trim="#8af5e1"; this.cloak="#cb3d92";
      this.guardMul = 1; this.furyBonus = 0; this.ghostHp = 100;
      this.onGround = true; this.prevBottom = this.y; this.drop = 0;
      this.jumps = 0; this.coyote = 0; this.jumpBuf = 0;
      this.dashT = 0; this.dashDir = 1; this.dashCharges = 1; this.chargeT = 0; this.ghostT = 0;
      this.attackIdx = -1; this.attackT = 0; this.attackDur = 0; this.struck = false; this.queued = false; this.comboResetT = 0;
      this.stormT = 0; this.stormTick = 0;
      this.iframes = 0; this.hitstun = 0; this.landT = 0; this.dead = false;
      this.legPhase = 0; this.t = 0;
      // sprite-sheet animation clock: the hero's body art has 5 idle / 8 walk /
      // 8 run / 4 jump / 4 fall / 6 attack / 10 hurt frames — they must advance.
      this.animT = 0; this.animName = "idle"; this.animFrame = 0;
      this.petT = 0; this.petX = this.x; this.petY = this.y; this.petFlip = false;
      this.petRow = 0; this.petFrame = 0;
      // upgradeable stats
      this.dmgMul = 1; this.speedMul = 1; this.jumpMax = 2;
      this.dashMax = 1; this.dashCdMul = 1; this.energyMul = 1;
      this.lifesteal = 0; this.critCh = 0.05; this.stormMul = 1;
      this.pose = {};
      NR.combat.reset(this);
    }

    /* ================== UPDATE ================== */
    update(dt, G) {
      this.t += dt;
      NR.combat.tick(this,dt);
      NR.abilities?.tick(this, dt, G);
      this.tacticalCd = Math.max(0, this.tacticalCd - dt);
      this.footT -= dt;
      if(this.onGround && Math.abs(this.vx)>100 && this.footT<=0 && !this.dead){this.footT=.3/this.speedMul;NR.audio.play('step');}
      this.droneT=Math.max(0,this.droneT-dt);
      if(this.droneT>0 && !this.dead){
        this.droneShot-=dt;
        const target=G.enemies.filter(e=>!e.dead&&e.spawnT<=0&&U.dist(e.x,e.y,this.x,this.y)<720).sort((a,b)=>Math.abs(a.x-this.x)-Math.abs(b.x-this.x))[0];
        if(target && this.droneShot<=0){this.droneShot=.5;target.hurt(13,Math.sign(target.x-this.x)*30,0,false,G);F.sparks(target.x,target.y-target.h/2,5,'cyan');NR.audio.play('shot');}
      }
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.overdriveT = Math.max(0, this.overdriveT - dt);
      this.iframes = Math.max(0, this.iframes - dt);
      this.drop = Math.max(0, this.drop - dt);
      this.comboResetT -= dt;
      this.landT = Math.max(0, this.landT - dt);

      if (this.hitstun > 0) {
        this.hitstun -= dt;
        this.vx = U.damp(this.vx, 0, 4, dt);
      } else if (!this.dead) {
        this.control(dt, G);
      }

      // dash recharge
      if (this.dashCharges < this.dashMax) {
        this.chargeT += dt;
        if (this.chargeT >= 0.95 * this.dashCdMul) { this.chargeT = 0; this.dashCharges++; }
      }

      // attack state
      if (this.attackT > 0) {
        this.attackT -= dt;
        const A = ATTACKS[this.attackIdx];
        const elapsed = A.dur - this.attackT;
        if (!this.struck && elapsed >= A.strikeAt) {
          this.struck = true;
          NR.audio.play((this.heroDef && this.heroDef.sound && this.heroDef.sound.attack) || A.sfx);
          F.slash(this.x + this.facing * 55, this.y - 52, this.facing, this.attackIdx, A.rng * 0.8);
          G.playerStrike(A);
        }
        if (this.attackT <= 0) {
          if (this.queued && this.attackIdx < ATTACKS.length - 1) this.startAttack(this.attackIdx + 1);
          else this.attackIdx = -1;
        }
      }

      // blade storm damage ticks
      if (this.stormT > 0) {
        this.stormT -= dt;
        this.stormTick -= dt;
        if (this.stormTick <= 0) {
          this.stormTick = 0.33;
          G.stormDamage(this);
        }
        if (U.chance(0.85)) {
          const a = U.rand(U.TAU), r = U.rand(120, 420);
          F.burst(this.x + Math.cos(a) * r, this.y - 60 + Math.sin(a) * r * 0.6,
            { n: 2, col: U.pick(["cyan", "white", "magenta"]), type: "spark", spd: 300, life: 0.3, grav: 0 });
        }
      }

      // integrate
      this.prevBottom = this.y;
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vy = 0;
        this.vx = this.dashDir * 1350;
        this.ghostT -= dt;
        if (this.ghostT <= 0) { this.ghostT = 0.028; F.ghost(this.pose); }
        F.burst(this.x - this.dashDir * 20, this.y - 40, { n: 2, col: "cyan", spd: 60, life: 0.3, size: 10, grav: 0 });
      } else if (this.sukunaT > 0) {
        // SUKUNASLICE special state: airborne blade realm — hover, drift freely,
        // no gravity, guaranteed safe return when the state ends
        this.vy = 0;
        this.y = U.damp(this.y, NR.world.groundY - 250, 6, dt);
        this.vx = U.clamp(this.vx, -680, 680);
      } else {
        this.vy += GRAV * dt;
        if (this.vy > 1900) this.vy = 1900;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      W.collideEntity(this);

      // running dust + leg phase
      if (this.onGround && Math.abs(this.vx) > 60) {
        this.legPhase += Math.abs(this.vx) * dt * 0.052;
        if (U.chance(Math.abs(this.vx) * dt * 0.004))
          F.burst(this.x - Math.sign(this.vx) * 14, this.y - 2, { n: 1, col: "blue", spd: 60, life: 0.3, size: 4, up: 40 });
      }

      this.computePose();
      this.tickAnim(dt);
      this.updatePet(dt);
    }

    /* ---------------- companion gait ----------------
       The pet used to be pinned to a fixed offset and driven off the hero's
       lifetime clock, so it looked glued to the ground and only ever blinked.
       It now has its own gait clock (idle row = sit/blink, run row = 6-frame
       trot) and springs toward a follow slot behind the hero. */
    updatePet(dt) {
      const petId = NR.profile.pet;
      if (!petId || this.dead) return;
      const wisp = petId.indexOf("Wisp") >= 0;
      const running = !wisp && this.onGround && Math.abs(this.vx) > 60;
      const row = running ? 1 : 0;
      if (row !== this.petRow) { this.petRow = row; this.petFrame = 0; this.petT = 0; }
      const n = NR.char.petCount ? NR.char.petCount(petId, row) : 6;
      const fps = row === 1 ? 6 + Math.abs(this.vx) / 55 : 3.4;
      this.petT += dt * fps;
      while (this.petT >= 1) { this.petT -= 1; this.petFrame = (this.petFrame + 1) % Math.max(1, n); }
      // follow slot: just behind the hero, turning to face the way you travel
      const wantX = this.x - this.facing * 56;
      this.petX = U.damp(this.petX === undefined ? wantX : this.petX, wantX, 7, dt);
      this.petY = U.damp(this.petY === undefined ? this.y : this.petY, this.y, this.onGround ? 9 : 4, dt);
      if (Math.abs(this.vx) > 30) this.petFlip = this.vx < 0;
      // doggy wardrobe: the hat / backpack overlays cycle while you play
      if (NR.petWardrobe && petId.indexOf("doggy sheet") >= 0)
        NR.petWear[petId] = Math.floor(this.t / 11) % 2 === 0 ? "hat" : "backpack";
    }

    control(dt, G) {
      const ax = I.axis();
      const mv = this.movement || { accel: 18, air: 10 };
      const abSpeed = NR.abilities ? NR.abilities.speedMul(this) : 1;
      const speed = 430 * this.speedMul * abSpeed * (this.sukunaT > 0 ? 1.45 : 1);
      const attacking = this.attackT > 0;
      const storming = this.stormT > 0;

      if (this.dashT <= 0 && !storming) {
        const target = ax * speed * (attacking ? 0.35 : 1);
        const k = this.onGround ? mv.accel : mv.air;
        this.vx = U.damp(this.vx, target, k, dt);
      }
      if (ax !== 0 && !attacking) this.facing = ax;

      // coyote + jump buffer
      if (this.onGround) { this.coyote = 0.1; this.jumps = 0; }
      else this.coyote -= dt;
      if (I.justPressed("jump")) this.jumpBuf = 0.13; else this.jumpBuf -= dt;

      if (this.jumpBuf > 0 && this.sukunaT <= 0) {
        if (this.onGround || this.coyote > 0) {
          this.doJump(-1000, "jump");
        } else if (this.jumps < this.jumpMax) {
          this.doJump(-920, "djump");
          F.ring(this.x, this.y - 4, { col: "cyan", r1: 60, life: 0.3, lw: 4 });
          F.burst(this.x, this.y, { n: 8, col: "cyan", spd: 160, life: 0.3, up: 60 });
        }
      }

      // drop through platforms
      if (I.justPressed("down") && this.onGround && this.y < W.groundY - 1) {
        this.drop = 0.22; this.y += 4;
      }

      // dash
      if (I.justPressed("dash") && this.dashCharges > 0 && this.dashT <= 0 && !storming && this.sukunaT <= 0) {
        this.dashT = 0.17;
        this.dashDir = ax !== 0 ? ax : this.facing;
        this.facing = this.dashDir;
        this.dashCharges--;
        this.iframes = Math.max(this.iframes, 0.24);
        NR.audio.play("dash");
        G.shake(0.12);
      }

      if (I.justPressed("parry")) NR.combat.guard(this);
      if (I.justPressed("kunai")) NR.combat.throwKunai(this,G);

      // attack
      if ((I.justPressed("attack") || I.down("attack")) && !storming && this.dashT <= 0 && this.parryT <= 0 && this.sukunaT <= 0) {
        if (this.attackT <= 0) this.startAttack(0);
        else if (this.attackIdx < ATTACKS.length - 1) this.queued = true;
      }

      // hero signature kit: basic [E] · defensive [Z] · signature [X]
      if (NR.abilities && this.ab) {
        if (I.justPressed("tactical")) NR.abilities.cast(this, 0, G);
        if (I.justPressed("ability2")) NR.abilities.cast(this, 1, G);
        if (I.justPressed("ability3")) NR.abilities.cast(this, 2, G);
      } else if (I.justPressed("tactical") && this.tacticalCd <= 0) this.castTactical(G);

      // blade storm
      if (I.justPressed("special") && this.energy >= this.maxEnergy && this.stormT <= 0 && this.dashT <= 0 && this.sukunaT <= 0) {
        this.castStorm(G);
      }
    }

    castTactical(G) {
      const power = NR.powers.find(p => p.id === G.tactical);
      if (this.dead || (power.id === 'heal' && this.hp >= this.maxHp)) {
        if (!this.dead) NR.hub.notify('Armor is already at full health.');
        return;
      }
      this.tacticalCd = power.cooldown;
      if (power.id === 'shield') this.shieldT = 3;
      if (power.id === 'heal') { this.heal(35); F.text(this.x, this.y - 120, '+35 HP', { col: '#a5f2a1', size: 25 }); }
      if (power.id === 'overdrive') this.overdriveT = 5;
      if (power.id === 'chrono') G.chronoT = 5;
      if (power.id === 'drone') { this.droneT = 8; this.droneShot = 0; }
      if (power.id === 'pulse') {
        for (const e of G.enemies) {
          if (e.dead || e.spawnT > 0 || U.dist(e.x, e.y - e.h / 2, this.x, this.y - 40) > 380) continue;
          e.hurt(45, (Math.sign(e.x - this.x) || 1) * 850, -380, false, G);
          F.text(e.x, e.y - e.h - 10, '45', { col: '#ffd090', size: 24 });
        }
        G.shake(.3);
      }
      F.ring(this.x, this.y - 40, { col: power.id === 'pulse' ? 'orange' : 'cyan', r1: power.id === 'pulse' ? 380 : 130, life: .65, lw: 7 });
      NR.audio.play(power.id === 'pulse' ? 'storm' : 'upgrade');
    }

    doJump(v, sfx) {
      this.vy = v;
      this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
      this.jumps++;
      NR.audio.play(sfx);
      F.burst(this.x, this.y, { n: 6, col: "cyan", spd: 130, life: 0.35, up: 30 });
    }

    startAttack(idx) {
      const A = ATTACKS[idx];
      this.attackIdx = idx;
      this.attackT = A.dur; this.attackDur = A.dur;
      this.struck = false; this.queued = false;
      // lunge forward slightly with each swing
      this.vx += this.facing * (idx === 2 ? 340 : 200);
    }

    castStorm(G) {
      this.energy = 0;
      this.stormT = 1.05; this.stormTick = 0.12;
      this.iframes = Math.max(this.iframes, 1.15);
      this.attackT = 0; this.attackIdx = -1;
      NR.audio.play("storm");
      NR.audio.duck(0.12, 1.2);
      G.shake(0.5);
      G.flash("rgba(0,255,244,0.35)");
      G.slowmo(0.45, 0.35);
      F.ring(this.x, this.y - 50, { col: "cyan", r1: 460, life: 0.7, lw: 12 });
      G.stats.storms++;
      NR.progress.check(G);
    }

    onLand() {
      NR.audio.play("land");
      this.landT = 0.14;
      F.burst(this.x, this.y, { n: 7, col: "blue", spd: 170, life: 0.3, spread: 2.2, up: 30 });
    }

    addEnergy(n) {
      const previous = this.energy;
      this.energy = Math.min(this.maxEnergy, this.energy + n * this.energyMul);
      if (previous < this.maxEnergy && this.energy >= this.maxEnergy) NR.audio.play("ring");
    }
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

    /* ================== POSE (procedural animation) ================== */
    computePose() {
      const P = this.pose;
      const speedK = U.clamp(Math.abs(this.vx) / 430, 0, 1.4);
      P.x = this.x; P.y = this.y; P.facing = this.facing; P.trim=this.trim; P.cloak=this.cloak; P.character=this.character;
      P.t = this.t;
      // the equipped look: hero signature pieces + the player's explicit Vault choices
      P.appearance = this.look
        || (NR.vault ? NR.vault.effectiveLook(this.character) : NR.profile.appearance);
      P.heroDef = this.heroDef || null;
      P.runAmt = this.onGround ? speedK : 0;
      P.vx = this.vx; // heroAnim reads speed off the pose (drift < 26 px/s reads as standing)
      P.air = !this.onGround;
      P.vy = this.vy;
      P.legPhase = this.legPhase;
      P.lean = U.clamp(this.vx / 900, -0.4, 0.4) + (this.dashT > 0 ? 0.55 : 0);
      P.crouch = this.landT > 0 ? (this.landT / 0.14) * 0.8 : (this.stormT > 0 ? 0.35 : 0);
      P.hurt = this.hitstun > 0;
      P.dash = this.dashT > 0;
      P.storm = this.stormT > 0;
      P.stormAge = 1.05 - this.stormT;
      // sword angle
      if (this.attackT > 0) {
        const A = ATTACKS[this.attackIdx];
        const p = U.clamp((A.dur - this.attackT) / A.dur * 1.15, 0, 1);
        P.swordAng = U.lerp(A.a0, A.a1, U.ease.outCubic(p));
        P.attacking = true;
        P.atkP = p;
      } else {
        P.attacking = false;
        P.swordAng = this.parryT>0 ? -1.3 : P.air ? -0.7 : (-0.35 + Math.sin(this.t * 2.2) * 0.08);
      }
      P.anim = heroAnim(P);
      if (P.animFrame === undefined) P.animFrame = 0;
    }

    /* Advance the body-layer animation clock. Frame rate scales with travel
       speed so a sprint cycles the 8-frame run row faster than a slow walk
       (this is what makes the legs actually move instead of skating). */
    tickAnim(dt) {
      const name = this.pose.anim || "idle";
      if (name !== this.animName) {
        // keep the cycle phase when swapping between the two locomotion rows so
        // walk <-> run transitions do not snap back to frame 0
        const loco = (n) => n === "walk" || n === "run";
        if (!(loco(name) && loco(this.animName))) this.animFrame = 0;
        this.animName = name;
        this.animT = 0;
      }
      const speedK = U.clamp(Math.abs(this.vx) / 430, 0, 1.6);
      const fps =
        name === "run" ? 9 + speedK * 9 :
        name === "walk" ? 7 + speedK * 5 :
        name === "attack" ? 16 :
        name === "hurt" ? 14 :
        name === "jump" || name === "fall" ? 9 : 6.5;
      const row = NR.char.ANIMS.indexOf(name);
      const n = NR.char.FRAMES[row < 0 ? 0 : row] || 1;
      this.animT += dt * fps;
      while (this.animT >= 1) {
        this.animT -= 1;
        // one-shots hold their final frame until the state changes
        if (name === "attack" || name === "hurt") { if (this.animFrame < n - 1) this.animFrame++; }
        else this.animFrame = (this.animFrame + 1) % n;
      }
      this.pose.animFrame = this.animFrame;
    }

    /* ================== DRAW ================== */
    draw(ctx) {
      if(this.parryT>0 || this.counterT>0){
        ctx.save();ctx.translate(this.x,this.y-45);ctx.scale(this.facing,1);
        ctx.strokeStyle=this.parryT>0?"#ffe7a2":"#ffe7a277";ctx.lineWidth=this.parryT>0?5:2;
        ctx.beginPath();ctx.arc(0,0,58,-1.1,1.1);ctx.stroke();ctx.restore();
      }
      if(this.droneT>0){
        const dx=this.x-this.facing*55,dy=this.y-130+Math.sin(this.t*5)*8;
        ctx.save();ctx.fillStyle='#284851';ctx.fillRect(dx-16,dy-10,32,20);ctx.strokeStyle='#8af5e1';ctx.lineWidth=2;ctx.strokeRect(dx-16,dy-10,32,20);
        NR.sprites.drawGlow(ctx,'cyan',dx,dy+14,13,.7);ctx.fillStyle='#8af5e1';ctx.fillRect(dx+this.facing*12-3,dy-2,6,4);ctx.restore();
      }
      if (this.shieldT > 0 || this.overdriveT > 0) {
        ctx.save();
        ctx.strokeStyle = this.shieldT > 0 ? '#c7afff' : '#f9ca62';
        ctx.fillStyle = this.shieldT > 0 ? '#b394ff18' : '#f9ca6212';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 42, 56 + Math.sin(this.t * 8) * 3, 64, 0, 0, U.TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // dash afterimages
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const g of F.ghosts) {
        const a = (1 - g.t / g.life) * 0.45;
        drawHero(ctx, g.pose, { tint: `rgba(0,255,244,${a})`, ghost: true });
      }
      ctx.restore();

      const P = this.pose;
      const blink = this.iframes > 0 && this.dashT <= 0 ? (Math.sin(this.t * 34) > 0 ? 0.45 : 1) : 1;
      // pet companion trots along behind the hero (pet art faces right natively)
      if (NR.profile.pet && !this.dead) {
        const petId = NR.profile.pet;
        const wisp = petId.indexOf("Wisp") >= 0;
        const pscale = wisp ? 2.2 : 2.1;
        const row = this.petRow | 0;
        const bob = wisp
          ? Math.sin(this.t * 4) * 10 - 40
          : (row === 1 ? -Math.abs(Math.sin((this.petFrame + this.petT) * Math.PI / 3)) * 7 : 0);
        // soft shadow so the companion reads as part of the scene
        if (!wisp) {
          ctx.save();
          ctx.globalAlpha = 0.28; ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.ellipse(this.petX, this.petY + 3, 20, 5, 0, 0, U.TAU); ctx.fill();
          ctx.restore();
        }
        NR.char.drawPet(ctx, petId, this.petFrame | 0, this.petX, this.petY - 2 + bob,
          pscale, this.petFlip, row);
      }
      NR.superRuntime?.companion(ctx,this);
      NR.superRuntime?.relic(ctx,this);
      ctx.globalAlpha = blink;
      drawHero(ctx, P, {});
      ctx.globalAlpha = 1;
      // hero ability overlays (bastion ring, blade realm, bone wall…)
      NR.abilities?.drawOverlays(ctx, this, NR.game);

      // storm orbiting blades
      if (this.stormT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const n = 6, base = this.pose.stormAge * 14;
        for (let i = 0; i < n; i++) {
          const a = base + (i / n) * U.TAU;
          const r = 130 + Math.sin(this.t * 9 + i) * 22;
          const bx = this.x + Math.cos(a) * r, by = this.y - 55 + Math.sin(a) * r * 0.55;
          NR.sprites.drawGlow(ctx, i % 2 ? "cyan" : "magenta", bx, by, 26, 0.9);
          ctx.save();
          ctx.translate(bx, by); ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = "#eafffd";
          ctx.fillRect(-1.5, -16, 3, 32);
          ctx.restore();
        }
        ctx.restore();
      }
    }
  }

  /* ---------- layered hero renderer (Clockwork Raven sprite packs) ----------
     The actual body art spans ~46px of the 64px cell height; scale ~1.06 renders
     the hero ~97px tall on screen — readable, weighty, matching the 78px hull.
     IDLE FIX: the walk row used to trigger at 4% speed, so knockback drift and
     landing wobble read as "walking while standing". A real idle now requires
     actual travel; tiny drifts stay on the idle row. */
  const HERO_SCALE = 1.16;
  function heroAnim(P) {
    if (P.hurt) return "hurt";
    if (P.attacking) return "attack";
    if (P.air) return (P.vy || 0) < -40 ? "jump" : "fall";
    if (Math.abs(P.vx || 0) < 26) return "idle"; // drift is NOT walking
    if ((P.runAmt || 0) > 0.72) return "run";
    if ((P.runAmt || 0) > 0.14) return "walk";
    return "idle";
  }
  /* Frame index for the current row. Attacks follow the swing curve so the
     blade lines up with the hit; every other row cycles with the anim clock
     (this used to be pinned to 0, which made the hero skate while running). */
  function heroFrame(P) {
    if (P.attacking) {
      const p = U.clamp(P.atkP || 0, 0, 1);
      return Math.min(5, Math.floor(p * 6));
    }
    return P.animFrame | 0;
  }
  function drawHero(ctx, P, O) {
    if (NR.superRuntime?.hero(ctx,P,O)) return;
    const ghost = O.ghost;
    const built = NR.char.build(P.appearance || NR.profile.appearance);
    const anim = P.anim || heroAnim(P);
    const frame = heroFrame(P);
    // hero-specific readability scale (tank/brute read larger, ghosts slimmer)
    const heroDef = P.heroDef || (NR.heroes && NR.heroes.byKey(P.character));
    const scale = HERO_SCALE * (heroDef && heroDef.scale ? heroDef.scale : 1);
    if (!ghost && !NR.noShadows) {
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(P.x, P.y + 3, 32, 9, 0, 0, U.TAU);
      ctx.fill();
      ctx.restore();
    }
    NR.char.drawFrame(ctx, built, anim, frame, P.x, P.y, P.facing, {
      scale,
      alpha: ghost ? 0.5 : 1,
      tint: ghost ? O.tint : undefined,
    });
    if (P.storm && !ghost) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "cyan", P.x, P.y - 40, 70 + Math.sin(P.t * 20) * 12, 0.45);
      ctx.restore();
    }
  }

  NR.Player = Player;
  NR.drawHero = drawHero;
})();
