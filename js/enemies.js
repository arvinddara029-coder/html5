/* ============ NEON RONIN — enemies: Crawler, Drone, Wraith + boss SHOGUN-9 ============ */
(function () {
  const U = NR.util, W = NR.world, F = NR.fx;
  const GRAV = 2600;

  /* ============ base ============ */
  class Enemy {
    constructor(x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.prevBottom = y; this.onGround = false; this.drop = 0;
      this.facing = -1; this.t = U.rand(0, 9); this.flash = 0;
      this.stunned = 0; this.dead = false; this.touchCd = 0;
      this.spawnT = 0.4; // teleport-in effect timer
    }
    hurt(dmg, kx, ky, crit, G) {
      if (this.dead) return false;
      this.hp -= dmg;
      this.flash = 0.12;
      this.stunned = Math.max(this.stunned, crit ? 0.34 : 0.2);
      if (!this.flying) { this.vx += kx * (this.boss ? 0.08 : 1); this.vy += ky * (this.boss ? 0 : 1); }
      else { this.vx += kx * 0.5; this.vy += ky * 0.4; }
      F.sparks(this.x, this.y - this.h / 2, crit ? 14 : 7, crit ? "yellow" : "white");
      NR.audio.play(crit ? "hitCrit" : "hit");
      if (this.hp <= 0) { this.die(G); return true; }
      return false;
    }
    die(G) { this.dead = true; G.onEnemyKilled(this); }
    phys(dt) {
      this.prevBottom = this.y;
      this.vy += GRAV * dt;
      if (this.vy > 1900) this.vy = 1900;
      this.x += this.vx * dt; this.y += this.vy * dt;
      W.collideEntity(this);
    }
    drawSpawnFx(ctx) {
      if (this.spawnT <= 0) return;
      const k = this.spawnT / 0.4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k;
      NR.sprites.drawGlow(ctx, "magenta", this.x, this.y - this.h / 2, this.h, 0.7 * k);
      ctx.restore();
    }
    hpBar(ctx) {
      if (this.boss || this.hp >= this.maxHp) return;
      const w = 44, k = U.clamp(this.hp / this.maxHp, 0, 1);
      const top = this.y - (this.barY || this.h) - 14; // barY tracks the (taller) visible art
      ctx.fillStyle = "rgba(5,8,18,0.8)";
      ctx.fillRect(this.x - w / 2, top, w, 5);
      ctx.fillStyle = "#ff2d5f";
      ctx.fillRect(this.x - w / 2, top, w * k, 5);
    }
  }

  /* ============ CRAWLER — fast ground beast ============ */
  class Crawler extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "crawler";
      this.w = 56; this.h = 74; this.barY = 88; // visible orc art ≈ 86px tall at scale 2.6
      this.maxHp = this.hp = Math.round(30 * mul);
      this.dmg = 12; this.score = 100;
      this.speed = 150; this.cd = U.rand(0.5, 1.5); this.windup = 0; this.lungeT = 0;
      this.legPhase = 0;
      this.spr = NR.spriteRender.anim("orc", { anim: "idle" });
      this.dying = 0;
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; this.spr.set("blink"); this.spr.update(dt); return; }
      const p = G.player;
      this.facing = p.x > this.x ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); }
      else if (this.windup > 0) {
        this.windup -= dt;
        this.vx = U.damp(this.vx, 0, 12, dt);
        if (this.windup <= 0) {
          this.lungeT = 0.34;
          this.vx = this.facing * 720;
          this.vy = -180;
          NR.audio.play("dash");
        }
      } else if (this.lungeT > 0) {
        this.lungeT -= dt;
      } else {
        this.cd -= dt;
        const dx = p.x - this.x;
        if (Math.abs(dx) < 170 && Math.abs(p.y - this.y) < 70 && this.cd <= 0) {
          this.windup = 0.38; this.cd = U.rand(1.4, 2.2);
        } else {
          this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 6, dt);
        }
      }
      this.legPhase += Math.abs(this.vx) * dt * 0.09;
      this.phys(dt);
      // sprite state
      if (this.dying > 0) { this.dying -= dt; this.spr.set("death"); }
      else if (this.stunned > 0 || this.hitstun > 0) this.spr.set("hurt");
      else if (this.windup > 0) this.spr.set("attack");
      else if (Math.abs(this.vx) > 40) this.spr.set("walk");
      else this.spr.set("idle");
      this.spr.update(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "orc", this.x, this.y, this.facing, 2.6);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      // ground shadow tracks the art scale
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 3, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      const scale = (this.dying > 0 ? Math.max(0.2, this.dying / 0.45) : 1) * 2.6;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale });
      if (this.windup > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "red", this.x, this.y - 48, 44 + Math.sin(this.t * 40) * 12, 0.5);
        ctx.restore();
      }
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ DRONE — flying ranged unit ============ */
  class Drone extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "drone"; this.flying = true;
      this.w = 46; this.h = 30;
      this.maxHp = this.hp = Math.round(22 * mul);
      this.dmg = 10; this.score = 150;
      this.shootCd = U.rand(1.2, 2.4); this.aimT = 0; this.aimAng = 0;
      this.rotor = 0;
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt; this.rotor += dt * 40;
      if (this.spawnT > 0) { this.spawnT -= dt; this.spr.set("blink"); this.spr.update(dt); return; }
      const p = G.player;
      this.facing = p.x > this.x ? 1 : -1;
      if (this.stunned > 0) this.stunned -= dt;
      // hover: keep lateral distance, bob
      const wantX = p.x - this.facing * 280;
      const wantY = p.y - 230 + Math.sin(this.t * 2.2) * 34;
      this.vx = U.damp(this.vx, U.clamp((wantX - this.x) * 3, -260, 260), 5, dt);
      this.vy = U.damp(this.vy, U.clamp((wantY - this.y) * 3, -200, 240), 5, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = U.clamp(this.x, 40, W.W - 40);
      this.y = U.clamp(this.y, 120, W.groundY - 90);
      // aim + fire
      if (this.aimT > 0) {
        this.aimT -= dt;
        this.aimAng = U.angleTo(this.x, this.y, p.x, p.y - 44);
        if (this.aimT <= 0) {
          const sp = 540;
          G.bolts.push(new NR.Bolt(this.x + Math.cos(this.aimAng) * 24, this.y + Math.sin(this.aimAng) * 24,
            Math.cos(this.aimAng) * sp, Math.sin(this.aimAng) * sp, { dmg: this.dmg * G.enemyDmgMul, col: "magenta" }));
          NR.audio.play("shot");
          this.shootCd = U.rand(1.8, 2.6) / G.enemySpdMul;
        }
      } else if (this.stunned <= 0) {
        this.shootCd -= dt;
        if (this.shootCd <= 0) { this.aimT = 0.55; this.aimAng = U.angleTo(this.x, this.y, p.x, p.y - 44); }
      }
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      const bodyC = this.flash > 0 ? "#fff" : "#181238";
      // aim laser telegraph
      if (this.aimT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = "#ff2d5f"; ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(this.aimAng) * 900, Math.sin(this.aimAng) * 900);
        ctx.stroke();
        ctx.restore();
      }
      // rotor blur
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#8fb0e8"; ctx.lineWidth = 2;
      const rw = 20 + Math.sin(this.rotor) * 6;
      ctx.beginPath(); ctx.moveTo(-rw, -22); ctx.lineTo(rw, -22); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = bodyC === "#fff" ? "#fff" : "#0d0a24";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -12); ctx.stroke();
      // body
      ctx.fillStyle = bodyC;
      U.roundRect(ctx, -24, -12, 48, 24, 11); ctx.fill();
      // dome
      ctx.fillStyle = this.flash > 0 ? "#fff" : "#241a52";
      ctx.beginPath(); ctx.arc(0, -10, 11, Math.PI, 0); ctx.fill();
      // eye
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const eyeC = this.aimT > 0 ? "red" : "magenta";
      NR.sprites.drawGlow(ctx, eyeC, this.facing * 8, 0, 13, 0.95);
      ctx.restore();
      // engine glow
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "cyan", 0, 14, 10 + Math.sin(t * 11) * 3, 0.7);
      ctx.restore();
      ctx.restore();
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ WRAITH — teleporting assassin ============ */
  class Wraith extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "wraith"; this.flying = true;
      this.w = 40; this.h = 82;
      this.maxHp = this.hp = Math.round(48 * mul);
      this.dmg = 16; this.score = 250;
      this.state = "drift"; this.st = 0; this.tpCd = 2.2;
      this.alpha = 1; this.bladeUp = 0;
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt; this.st += dt;
      if (this.spawnT > 0) { this.spawnT -= dt; this.spr.set("blink"); this.spr.update(dt); return; }
      const p = G.player;
      if (this.stunned > 0) { this.stunned -= dt; this.state = "drift"; this.st = 0; }
      this.facing = p.x > this.x ? 1 : -1;
      switch (this.state) {
        case "drift": {
          this.alpha = U.damp(this.alpha, 1, 8, dt);
          const wantX = p.x - this.facing * 200;
          const wantY = p.y - 6 + Math.sin(this.t * 1.8) * 14;
          this.vx = U.damp(this.vx, U.clamp((wantX - this.x) * 2, -170, 170), 4, dt);
          this.vy = U.damp(this.vy, U.clamp((wantY - this.y) * 2.4, -160, 160), 4, dt);
          this.tpCd -= dt;
          if (this.tpCd <= 0) { this.state = "fadeout"; this.st = 0; }
          break;
        }
        case "fadeout":
          this.alpha = Math.max(0, this.alpha - dt * 5);
          this.vx = this.vy = 0;
          if (this.alpha <= 0) {
            F.teleport(this.x, this.y - 40, "purple");
            this.x = U.clamp(p.x - this.facing * 110, 60, W.W - 60);
            this.y = p.y;
            F.teleport(this.x, this.y - 40, "purple");
            NR.audio.play("dash");
            this.state = "windup"; this.st = 0;
          }
          break;
        case "windup":
          this.alpha = U.damp(this.alpha, 1, 10, dt);
          this.bladeUp = U.damp(this.bladeUp, 1, 8, dt);
          if (this.st > 0.36) {
            this.state = "slash"; this.st = 0;
            NR.audio.play("swing2");
            F.slash(this.x + this.facing * 46, this.y - 50, this.facing, 1, 120);
            // hit check
            const hb = { x: this.x + this.facing * 60, y: this.y - 50, w: 60, h: 110 };
            if (Math.abs(p.x - hb.x) < hb.w && Math.abs((p.y - 40) - hb.y) < hb.h)
              G.hurtPlayer(this.dmg * G.enemyDmgMul, this.facing, "slash");
          }
          break;
        case "slash":
          this.bladeUp = U.damp(this.bladeUp, -0.5, 18, dt);
          if (this.st > 0.3) { this.state = "drift"; this.st = 0; this.tpCd = U.rand(2.0, 3.0) / G.enemySpdMul; this.bladeUp = 0; }
          break;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = U.clamp(this.x, 40, W.W - 40);
      this.y = U.clamp(this.y, 140, W.groundY + 4);
      if (U.chance(dt * 6)) F.burst(this.x + U.rand(-10, 10), this.y - U.rand(0, 60), { n: 1, col: "purple", spd: 30, life: 0.5, size: 5, grav: -60 });
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.facing, 1);
      ctx.globalAlpha = this.alpha;
      const bodyC = this.flash > 0 ? "#fff" : "#150a30";
      // robe (wavy floating bottom, no legs)
      ctx.fillStyle = bodyC;
      ctx.beginPath();
      ctx.moveTo(0, -82);
      ctx.quadraticCurveTo(20, -78, 16, -52);
      const waves = 4;
      for (let i = 0; i <= waves; i++) {
        const wx = 16 - (i * 32) / waves;
        const wy = -52 + 52 * (i / waves) + Math.sin(t * 6 + i * 1.4) * 5;
        ctx.lineTo(wx * 0.9, wy * 0.9);
      }
      ctx.quadraticCurveTo(-18, -76, 0, -82);
      ctx.closePath(); ctx.fill();
      // hood
      ctx.fillStyle = this.flash > 0 ? "#fff" : "#0d0620";
      ctx.beginPath(); ctx.arc(2, -74, 11, 0, U.TAU); ctx.fill();
      // glowing eyes
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "purple", 7, -75, 9, 0.9);
      NR.sprites.drawGlow(ctx, "purple", 1, -74, 7, 0.7);
      ctx.restore();
      // blade arm
      const bu = this.bladeUp;
      const sa = U.lerp(-1.1, -2.6, Math.max(0, bu));
      const hand = U.seg(4, -58, sa, 24);
      strokeSeg2(ctx, 4, -58, hand[0], hand[1], 5.5, bodyC);
      const tip = U.seg(hand[0], hand[1], sa, 36);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#d8b4ff"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      if (bu > 0.5) NR.sprites.drawGlow(ctx, "purple", tip[0], tip[1], 22, (bu - 0.5) * 1.4);
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha = 1;
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }
  function strokeSeg2(ctx, x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  /* ============ BOSS — SHOGUN-9 ============ */
  /* Three boss bodies share one fight script (phases, barrage, air-slam,
     charge, stun window) so every chapter finale plays differently without
     duplicating AI:
       mech    — SHOGUN-9, the procedural war machine (chapters 1 & the finale)
       warlock — ARCH-WARLOCK, the EVil Wizard 2 art at boss scale
       brute   — GORO, the Tiny-RPG orc with its cleave-effect layer */
  const BOSS_SKINS = {
    mech: { sheet: null, w: 130, h: 176, name: "SHOGUN-9", col: "#ff8f3d" },
    warlock: { sheet: "wizard", scale: 2.7, w: 120, h: 200, name: "ARCH-WARLOCK VEXIS", col: "#c08bff" },
    brute: { sheet: "orc", scale: 4.6, w: 150, h: 165, name: "GORO THE BREAKER", col: "#ff6a4d" },
    ronin: { sheet: "samurai", scale: 2.9, w: 130, h: 150, name: "KUROGANE THE RIVAL", col: "#8af5e1" },
  };
  class Boss extends Enemy {
    constructor(x, y, mul, bossNum, skin, hpScale) {
      super(x, y);
      this.type = "boss"; this.boss = true;
      this.skin = BOSS_SKINS[skin] ? skin : "mech";
      const S = BOSS_SKINS[this.skin];
      this.w = S.w; this.h = S.h;
      this.maxHp = this.hp = Math.round(
        820 * mul * (1 + (bossNum - 1) * 0.5) * (hpScale || 1),
      );
      this.dmg = 20; this.score = 4000;
      this.bossNum = bossNum;
      this.bossName = S.name;
      this.state = "intro"; this.st = 0;
      this.phase = 1; this.legPh = 0; this.coreT = 0;
      this.atkCd = 1.6; this.burstN = 0; this.burstT = 0;
      // NOTE: never add a this.muzzleY data field — it shadows the muzzleY() method
      this.dropY = -260; this.x = x; this.y = this.dropY;
      if (S.sheet) {
        this.spr = NR.spriteRender.anim(S.sheet, { anim: "fall" });
        this.fx = NR.spriteRender.anim("orcFx", { anim: "cleave" });
      }
    }
    /* map the fight state onto the sprite sheet's own animations */
    syncSkin() {
      if (!this.spr) return;
      const has = (n) => {
        const def = NR.sheets[this.spr.sheet];
        return !!(def && def.anims[n]);
      };
      const pick = (...names) => names.find((n) => has(n)) || "idle";
      const want =
        this.state === "intro" || this.state === "slamAir" ? pick(this.vy < 0 ? "jump" : "fall", "idle") :
        this.state === "slamTel" || this.state === "chargeTel" ? pick("jump", "attack") :
        this.state === "barrage" ? pick("attack2", "attack") :
        this.state === "stunned" || this.stunned > 0 ? pick("hurt", "idle") :
        this.state === "dying" ? pick("death", "hurt", "idle") :
        this.state === "charging" ? pick("attack", "walk") :
        Math.abs(this.vx) > 40 ? pick("walk", "idle") : "idle";
      this.spr.set(want);
      this.spr.update(1 / 60);
    }
    speedK() { return this.phase === 2 ? 1.35 : 1; }
    update(dt, G) {
      this.t += dt; this.st += dt; this.flash -= dt; this.touchCd -= dt; this.coreT += dt;
      if (this.flash > 0 && this.stunned > 0 && this.state !== "stunned") this.stunned = 0; // boss resists stun
      this.facing = G.player.x > this.x ? 1 : -1;
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
        this.phase = 2;
        G.banner("SHOGUN-9 — OVERDRIVE", "his core burns hot", "#ff2d95");
        F.ring(this.x, this.y - 90, { col: "magenta", r1: 420, life: 0.7, lw: 10 });
        NR.audio.play("roar");
        G.shake(0.6);
      }
      const p = G.player;
      switch (this.state) {
        case "intro":
          this.y = U.damp(this.y, W.groundY, 4.5, dt);
          if (W.groundY - this.y < 8) {
            this.y = W.groundY;
            this.state = "idle"; this.st = 0;
            NR.audio.play("slam"); NR.audio.play("roar");
            G.shake(0.9);
            F.burst(this.x, this.y - 10, { n: 40, col: "orange", spd: 560, life: 0.7, up: 260 });
            F.smoke(this.x, this.y - 10, 8);
          }
          return; // no gravity during intro
        case "idle":
          this.vx = U.damp(this.vx, Math.sign(p.x - this.x) * 90 * this.speedK(), 4, dt);
          if (this.st > this.atkCd / this.speedK()) {
            this.st = 0;
            const far = Math.abs(p.x - this.x) > 420;
            const r = Math.random();
            if (far) this.state = r < 0.5 ? "barrage" : "chargeTel";
            else this.state = r < 0.65 ? "slamTel" : (r < 0.85 ? "barrage" : "chargeTel");
            if (this.state === "barrage") { this.burstN = 0; this.burstT = 0.3; }
          }
          break;
        case "slamTel":
          this.vx = U.damp(this.vx, 0, 8, dt);
          if (this.st > 0.45) {
            this.state = "slamAir"; this.st = 0;
            this.vy = -1350;
            this.vx = U.clamp((p.x - this.x) * 1.9, -750, 750);
            NR.audio.play("jump");
          }
          break;
        case "slamAir":
          if (this.onGround && this.vy >= 0) {
            this.state = "recover"; this.st = 0;
            NR.audio.play("slam");
            G.shake(0.85);
            G.shockwaves.push(new NR.ShockRing(this.x - 60, -1, { dmg: 18 * G.enemyDmgMul }));
            G.shockwaves.push(new NR.ShockRing(this.x + 60, 1, { dmg: 18 * G.enemyDmgMul }));
            F.burst(this.x, this.y - 8, { n: 44, col: "orange", spd: 640, life: 0.8, up: 300 });
            F.smoke(this.x, this.y - 8, 10);
            if (this.phase === 2) { // radial bolt ring in overdrive
              for (let i = 0; i < 10; i++) {
                const a = (i / 10) * U.TAU - Math.PI / 2;
                G.bolts.push(new NR.Bolt(this.x, this.y - 90, Math.cos(a) * 380, Math.sin(a) * 380,
                  { dmg: 12 * G.enemyDmgMul, col: "purple", r: 8 }));
              }
              NR.audio.play("shot");
            }
          }
          break;
        case "barrage":
          this.vx = U.damp(this.vx, 0, 8, dt);
          this.burstT -= dt;
          if (this.burstT <= 0) {
            this.burstN++;
            this.burstT = 0.42 / this.speedK();
            const n = this.phase === 2 ? 7 : 5;
            const baseA = U.angleTo(this.muzzle(), this.muzzleY(), p.x, p.y - 40);
            for (let i = 0; i < n; i++) {
              const a = baseA + (i - (n - 1) / 2) * 0.17;
              G.bolts.push(new NR.Bolt(this.muzzle(), this.muzzleY(), Math.cos(a) * 520, Math.sin(a) * 520,
                { dmg: 11 * G.enemyDmgMul, col: this.phase === 2 ? "purple" : "magenta" }));
            }
            NR.audio.play("shot");
            F.burst(this.muzzle(), this.muzzleY(), { n: 6, col: "magenta", spd: 200, life: 0.25 });
            if (this.burstN >= (this.phase === 2 ? 4 : 3)) { this.state = "idle"; this.st = 0; this.atkCd = U.rand(1.1, 1.8); }
          }
          break;
        case "chargeTel":
          this.vx = U.damp(this.vx, 0, 8, dt);
          if (this.st > 0.6 / this.speedK()) {
            this.state = "charging"; this.st = 0;
            this.vx = this.facing * 980 * this.speedK();
            NR.audio.play("warn");
            NR.audio.play("dash");
          }
          break;
        case "charging":
          F.burst(this.x - this.facing * 50, this.y - 20, { n: 3, col: "orange", spd: 200, life: 0.3, up: 60 });
          if (this.x <= 60 || this.x >= W.W - 60 || this.st > 1.4) {
            this.state = "stunned"; this.st = 0;
            this.vx = 0;
            NR.audio.play("slam");
            G.shake(0.7);
            F.sparks(this.x + this.facing * 60, this.y - 90, 24, "yellow");
          }
          break;
        case "stunned": // vulnerable window ×1.6 damage (handled via vulnMul)
          this.vx = 0;
          if (this.st > 1.5) { this.state = "idle"; this.st = 0; this.atkCd = 0.8; }
          break;
        case "recover":
          this.vx = U.damp(this.vx, 0, 6, dt);
          if (this.st > 0.65 / this.speedK()) { this.state = "idle"; this.st = 0; this.atkCd = U.rand(1.0, 1.7); }
          break;
        case "dying":
          this.vx = 0;
          if (U.chance(dt * 14)) {
            const ex = this.x + U.rand(-60, 60), ey = this.y - U.rand(20, 160);
            F.burst(ex, ey, { n: 16, col: U.pick(["orange", "yellow", "magenta"]), spd: 380, life: 0.6 });
            NR.audio.play("kill");
            G.shake(0.25);
          }
          if (this.st > 1.5) {
            this.dead = true;
            G.onBossKilled(this);
          }
          return;
      }
      this.legPh += Math.abs(this.vx) * dt * 0.05;
      this.phys(dt);
      this.syncSkin();
      // contact damage is bigger on boss
      this.dmg = 22;
    }
    vulnMul() { return this.state === "stunned" ? 1.6 : 1; }
    muzzle() { return this.x + this.facing * 62; }
    muzzleY() { return this.y - 108; }
    hurt(dmg, kx, ky, crit, G) {
      if (this.dead || this.state === "dying" || this.state === "intro") return false;
      const final = dmg * this.vulnMul();
      this.hp -= final;
      this.flash = 0.08;
      F.sparks(this.x + this.facing * -30, this.y - 100, crit ? 16 : 8, crit ? "yellow" : "white");
      NR.audio.play(crit ? "hitCrit" : "hit");
      if (this.hp <= 0) {
        this.hp = 0;
        this.state = "dying"; this.st = 0;
        G.slowmo(0.22, 1.4);
        NR.audio.play("explode");
        NR.audio.duck(0.1, 1.5);
        return false;
      }
      return false;
    }
    /* sheet-skinned bosses (warlock / brute) draw real pack art */
    drawSkin(ctx) {
      const S = BOSS_SKINS[this.skin];
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, this.w * 0.42, 12, 0, 0, U.TAU); ctx.fill();
      ctx.restore();
      // aura so a boss-scale sprite still reads as a boss
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, this.phase === 2 ? "magenta" : "purple", this.x, this.y - this.h * 0.5,
        this.h * (0.55 + Math.sin(this.t * 5) * 0.05), this.phase === 2 ? 0.4 : 0.26);
      ctx.restore();
      const dying = this.state === "dying" ? Math.max(0.25, 1 - this.st / 1.5) : 1;
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: S.scale * dying, alpha: dying });
      // the orc pack's cleave-effect layer lands with the slam / charge
      if (this.skin === "brute" && (this.state === "slamAir" || this.state === "charging")) {
        this.fx.update(1 / 60);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.85;
        this.fx.draw(ctx, this.x + this.facing * 40, this.y - 30, this.facing, { scale: S.scale * 0.9 });
        ctx.restore();
      }
      // cast telegraph for the warlock
      if (this.skin === "warlock" && this.state === "barrage") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "purple", this.muzzle(), this.muzzleY(), 26 + Math.sin(this.t * 30) * 7, 0.9);
        ctx.restore();
      }
      this.drawSpawnFx(ctx);
    }
    draw(ctx) {
      if (this.spr) { this.drawSkin(ctx); return; }
      const t = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.facing, 1);
      const hot = this.phase === 2;
      const AC = hot ? "#ff2d95" : "#ff8f3d";
      const bodyC = this.flash > 0 ? "#fff" : "#1c1440";
      const darkC = this.flash > 0 ? "#fff" : "#120c2e";
      const stunWobble = this.state === "stunned" ? Math.sin(t * 30) * 0.05 : 0;
      ctx.rotate(stunWobble);
      // legs
      const step = Math.sin(this.legPh) * U.clamp(Math.abs(this.vx) / 100, 0, 1);
      strokeSeg2(ctx, -28, -70, -34 + step * 16, -2, 17, darkC);
      strokeSeg2(ctx, 28, -70, 34 - step * 16, -2, 17, bodyC);
      // feet
      strokeSeg2(ctx, -34 + step * 16, -2, -46 + step * 16, -1, 12, darkC);
      strokeSeg2(ctx, 34 - step * 16, -2, 48 - step * 16, -1, 12, bodyC);
      // pelvis
      ctx.fillStyle = darkC;
      U.roundRect(ctx, -34, -92, 68, 30, 8); ctx.fill();
      // torso
      ctx.fillStyle = bodyC;
      U.roundRect(ctx, -56, -168, 112, 86, 12); ctx.fill();
      // chest plate lines
      ctx.strokeStyle = darkC; ctx.lineWidth = 3;
      ctx.strokeRect(-44, -156, 88, 60);
      // shoulder pauldrons
      ctx.fillStyle = darkC;
      U.roundRect(ctx, -76, -172, 34, 34, 9); ctx.fill();
      U.roundRect(ctx, 42, -172, 34, 34, 9); ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, hot ? "magenta" : "orange", -59, -160, 10, 0.5);
      NR.sprites.drawGlow(ctx, hot ? "magenta" : "orange", 59, -160, 10, 0.5);
      ctx.restore();
      // head
      ctx.fillStyle = darkC;
      U.roundRect(ctx, -18, -196, 36, 28, 7); ctx.fill();
      // horn
      ctx.strokeStyle = bodyC; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -194); ctx.quadraticCurveTo(18, -210, 30, -204); ctx.stroke();
      // visor
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = AC;
      ctx.fillRect(-14, -186, 30, 5);
      NR.sprites.drawGlow(ctx, hot ? "magenta" : "orange", 2, -184, 18, 0.85);
      ctx.restore();
      // core
      const corePulse = 1 + Math.sin(this.coreT * (hot ? 10 : 6)) * 0.18;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, hot ? "magenta" : "orange", 0, -126, 34 * corePulse, 0.95);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, -126, 8 * corePulse, 0, U.TAU); ctx.fill();
      ctx.restore();
      // left arm: blade
      const bladeRise = this.state === "slamTel" ? -1.6 : (this.state === "slamAir" ? 0.8 : -0.25);
      const lh = U.seg(-58, -150, bladeRise, 46);
      strokeSeg2(ctx, -58, -150, lh[0], lh[1], 13, darkC);
      const lt = U.seg(lh[0], lh[1], bladeRise, 66);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = AC; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(lh[0], lh[1]); ctx.lineTo(lt[0], lt[1]); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(lh[0], lh[1]); ctx.lineTo(lt[0], lt[1]); ctx.stroke();
      ctx.restore();
      // right arm: cannon
      const aiming = this.state === "barrage";
      const ca = aiming ? 1.35 : 0.5;
      const ch = U.seg(58, -150, ca, 40);
      strokeSeg2(ctx, 58, -150, ch[0], ch[1], 14, bodyC);
      ctx.fillStyle = darkC;
      ctx.beginPath(); ctx.arc(ch[0], ch[1], 15, 0, U.TAU); ctx.fill();
      if (aiming) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, hot ? "magenta" : "orange", ch[0], ch[1], 20 + Math.sin(t * 30) * 6, 0.9);
        ctx.restore();
      }
      // charge telegraph line
      if (this.state === "chargeTel") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.4 + Math.sin(t * 24) * 0.2;
        ctx.strokeStyle = "#ff2d5f"; ctx.lineWidth = 4;
        ctx.setLineDash([16, 12]);
        ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(1400, -60); ctx.stroke();
        ctx.restore();
      }
      // jet flames while airborne-slam
      if (this.state === "slamAir" && this.vy < 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "cyan", -26, -2, 18, 0.8);
        NR.sprites.drawGlow(ctx, "cyan", 26, -2, 18, 0.8);
        ctx.restore();
      }
      ctx.restore();
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ SLIME — bouncing blob (blue/green/red per chapter) ============ */
  class Slime extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "slime";
      this.w = 54; this.h = 60; this.barY = 100; // blob window ≈ 91px tall at scale 1.9
      this.maxHp = this.hp = Math.round(24 * mul);
      this.dmg = 10; this.score = 80;
      this.speed = 120; this.hopT = U.rand(0.4, 1.1); this.hopDir = U.chance(0.5) ? 1 : -1;
      const variant = NR.adventure && NR.adventure.active
        ? (NR.game.chapter === 1 ? "slimeGreen" : NR.game.chapter === 2 ? "slimeRed" : "slime")
        : "slime";
      this.variant = variant;
      this.spr = NR.spriteRender.anim(variant, { anim: "idle", fps: 10 });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      this.facing = p.x > this.x ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); }
      else if (this.onGround) {
        this.hopT -= dt;
        if (this.hopT <= 0) {
          this.hopT = U.rand(0.7, 1.4);
          this.hopDir = Math.sign(p.x - this.x) || this.hopDir;
          this.vx = this.hopDir * this.speed * G.enemySpdMul;
          this.vy = -520;
          this.onGround = false;
        } else this.vx = U.damp(this.vx, 0, 5, dt);
      }
      // always idle-bounce: physics already arcs the hop; the hop row draws its
      // own in-cell shadow which would float alongside an airborne body
      this.spr.set("idle");
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, this.variant || "slime", this.x, this.y, this.facing, NR.sheets[this.variant]?.renderScale || 1.9);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const flash = this.flash > 0 ? "rgba(255,255,255,0.9)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: NR.sheets[this.variant]?.renderScale || 1.9 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ SOLDIER — armoured archer ============ */
  class Soldier extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "soldier";
      this.w = 52; this.h = 74; this.barY = 84; // soldier art ≈ 81px tall at scale 2.6
      this.maxHp = this.hp = Math.round(46 * mul);
      this.dmg = 14; this.score = 160;
      this.speed = 105; this.aimT = 0; this.cd = U.rand(0.8, 1.8); this.strafe = U.chance(0.5) ? 1 : -1;
      this.spr = NR.spriteRender.anim("soldier", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); }
      else if (this.aimT > 0) {
        this.aimT -= dt;
        this.vx = U.damp(this.vx, 0, 10, dt);
        if (this.aimT <= 0) {
          this.spr.set("attack", true);
          const bolt = new NR.Bolt(this.x + this.facing * 26, this.y - 46, this.facing * 620, 0, { dmg: this.dmg * G.enemyDmgMul, col: "yellow", r: 6 });
          G.bolts.push(bolt);
          NR.audio.play("shot");
          this.cd = U.rand(1.5, 2.6);
        }
      } else {
        this.cd -= dt;
        const dist = Math.abs(dx);
        const lined = Math.abs(p.y - this.y) < 130;
        if (dist < 300 && lined && this.cd <= 0) {
          this.aimT = 0.5; // wind up the shot
        } else if (dist < 190) {
          this.vx = U.damp(this.vx, -Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt); // too close, back off
        } else if (dist > 470) {
          this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt); // too far, close in
        } else {
          this.vx = U.damp(this.vx, this.strafe * this.speed * 0.45 * G.enemySpdMul, 5, dt); // strafe
          if (U.chance(dt * 0.5)) this.strafe *= -1;
        }
      }
      if (this.aimT > 0.25) this.spr.set("attack");
      else this.spr.set(Math.abs(this.vx) > 40 ? "walk" : "idle");
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "soldier", this.x, this.y, this.facing, 2.6);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.32; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this.aimT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "yellow", this.x + this.facing * 34, this.y - 52, 15 + Math.sin(this.t * 30) * 5, 0.8);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 2.6 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ WARLOCK — hovering arcane caster (EVil Wizard 2 pack) ============
     Glides just above the floor, keeps range and hurls twin shadow orbs.
     The wizard art faces RIGHT natively, so the standard flip applies. */
  class Warlock extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "warlock"; this.flying = true; // skips physics knock-up, hovers via its own integrator
      this.w = 54; this.h = 140; this.barY = 165; // wizard window ≈ 160px tall at scale 1.1
      this.maxHp = this.hp = Math.round(60 * mul);
      this.dmg = 13; this.score = 300;
      this.speed = 96; this.castCd = U.rand(1.2, 2.2); this.castT = 0; this.burstLeft = 0;
      this.hoverH = 30; // rides on a dark mist — feet (robe) stay near the ground
      this.spr = NR.spriteRender.anim("wizard", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 5, dt); }
      else if (this.castT > 0) {
        this.castT -= dt;
        this.vx = U.damp(this.vx, 0, 8, dt);
        if (this.castT <= 0 && !this.dead) {
          // twin orb volley with a slight spread
          const baseA = U.angleTo(this.x, this.y - 78, p.x, p.y - 44);
          for (const off of [-0.16, 0.16]) {
            const a = baseA + off, sp = 460;
            G.bolts.push(new NR.Bolt(this.x + this.facing * 40, this.y - 78,
              Math.cos(a) * sp, Math.sin(a) * sp, { dmg: this.dmg * G.enemyDmgMul, col: "purple", r: 7 }));
          }
          NR.audio.play("shot");
          F.slash(this.x + this.facing * 44, this.y - 78, this.facing, 1, 90);
          this.burstLeft--;
          if (this.burstLeft > 0) this.castT = 0.42;
          else this.castCd = U.rand(2.2, 3.2) / G.enemySpdMul;
        }
      } else {
        this.castCd -= dt;
        const dist = Math.abs(dx);
        if (dist < 260) this.vx = U.damp(this.vx, -Math.sign(dx) * this.speed * G.enemySpdMul, 4, dt);
        else if (dist > 560) this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 4, dt);
        else this.vx = U.damp(this.vx, Math.sin(this.t * 0.9) * 54, 3, dt);
        if (dist < 720 && this.castCd <= 0) { this.burstLeft = 2; this.castT = 0.45; this.spr.set("attack", true); }
      }
      // hover: glide above ground with a slow bob, own gravity-free integrator
      const wantY = NR.world.groundY - this.hoverH + Math.sin(this.t * 2.1) * 8;
      this.vy = U.damp(this.vy, U.clamp((wantY - this.y) * 2.4, -220, 220), 5, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = U.clamp(this.x, 40, NR.world.W - 40);
      // sprite state
      if (this.castT > 0) this.spr.set("attack");
      else if (Math.abs(this.vx) > 46) this.spr.set("walk");
      else this.spr.set("idle");
      this.spr.update(dt);
      if (U.chance(dt * 5)) F.burst(this.x + U.rand(-20, 20), this.y - U.rand(10, 90), { n: 1, col: "purple", spd: 26, life: 0.5, size: 5, grav: -40 });
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "wizard", this.x, this.y, this.facing, 1.1);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      // mist shadow under the hover
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(this.x, NR.world.groundY + 3, 30, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "purple", this.x, NR.world.groundY - 2, 26, 0.35 + 0.1 * Math.sin(this.t * 6));
      ctx.restore();
      if (this.castT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "purple", this.x + this.facing * 40, this.y - 78, 18 + Math.sin(this.t * 26) * 5, 0.85);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 1.1 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ RIVAL — masterless duelist (Samurai pixel art pack) ============
     Circles the player mid-range, telegraphs, then commits to a fast iai slash.
     The samurai art faces LEFT natively (faceLeft handles the mirror). */
  class Rival extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "rival";
      this.w = 48; this.h = 92; this.barY = 102; // samurai art ≈ 96px tall at scale 2.5
      this.maxHp = this.hp = Math.round(75 * mul);
      this.dmg = 18; this.score = 340;
      this.speed = 210; this.state = "circle"; this.st = 0; this.circleDir = U.chance(0.5) ? 1 : -1;
      this.spr = NR.spriteRender.anim("samurai", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt; this.st += dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      const dist = Math.abs(dx);
      this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) {
        this.stunned -= dt; this.state = "circle"; this.st = 0;
        this.vx = U.damp(this.vx, 0, 6, dt);
      } else switch (this.state) {
        case "circle": {
          const want = dist > 320 ? Math.sign(dx) : dist < 150 ? -Math.sign(dx) : this.circleDir * 0.55;
          this.vx = U.damp(this.vx, want * this.speed * G.enemySpdMul, 6, dt);
          if (U.chance(dt * 0.6)) this.circleDir *= -1;
          if (dist < 260 && this.st > U.rand(0.8, 1.5)) {
            this.state = "windup"; this.st = 0;
            NR.audio.play("warn");
          }
          break;
        }
        case "windup":
          this.vx = U.damp(this.vx, 0, 10, dt);
          if (this.st > 0.4) {
            this.state = "slash"; this.st = 0;
            this.vx = this.facing * 620;
            NR.audio.play("swing2");
            F.slash(this.x + this.facing * 52, this.y - 54, this.facing, 2, 150);
            if (Math.abs(p.x - this.x) < 130 && Math.abs(p.y - this.y) < 90)
              G.hurtPlayer(this.dmg * G.enemyDmgMul, this.facing, "slash");
          }
          break;
        case "slash":
          if (this.st > 0.26) { this.state = "circle"; this.st = 0; }
          break;
      }
      this.phys(dt);
      if (this.state === "windup" || this.state === "slash") this.spr.set("attack");
      else if (Math.abs(this.vx) > 40) this.spr.set("walk");
      else this.spr.set("idle");
      this.spr.update(dt);
    }
    die(G) {
      if (this.dead) return;
      // the pack has no death strip — drop with a hurt frame burst instead
      NR.spriteRender.spawnCorpse(G, "samurai", this.x, this.y, this.facing, 2.5);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.33; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 32, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this.state === "windup") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "red", this.x + this.facing * 30, this.y - 52, 22 + Math.sin(this.t * 34) * 7, 0.6);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 2.5 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ GUNNER — Diego, the burst trooper (Sprite Pack 7) ============
     Keeps rifle range, plants, fires a 3-round burst, then visibly reloads.
     Wide 48px shoot cell + narrow 32px run/idle cells (per-anim geometry). */
  class Gunner extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "gunner";
      this.w = 46; this.h = 76; this.barY = 90; // trooper art ≈ 80px tall at scale 2.0
      this.maxHp = this.hp = Math.round(34 * mul);
      this.dmg = 5; this.score = 120;
      this.speed = 150; this.phase = "move"; this.phaseT = 0; this.burstLeft = 0; this.burstCd = 0;
      this.hopCd = U.rand(2.4, 4.5); this.airFired = 0;
      this.spr = NR.spriteRender.anim("diego", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); this.spr.set("idle"); }
      else if (this.phase === "shoot") {
        this.phaseT -= dt; this.burstCd -= dt;
        this.vx = U.damp(this.vx, this.runShot ? this.vx : 0, this.runShot ? 2 : 12, dt);
        this.spr.set(this.crouched ? "cshoot" : this.runShot ? "rshoot" : "shoot");
        if (this.burstCd <= 0 && this.burstLeft > 0) {
          this.burstLeft--;
          this.burstCd = 0.13;
          const muzY = this.y - (this.crouched ? 30 : 44);
          G.bolts.push(new NR.Bolt(this.x + this.facing * 30, muzY, this.facing * 700, U.rand(-30, 30), { dmg: this.dmg * G.enemyDmgMul, col: "red", r: 5 }));
          NR.audio.play("shot");
        }
        if (this.phaseT <= 0) { this.phase = "reload"; this.phaseT = 0.9; this.spr.set(this.crouched ? "creload" : "reload", true); }
      } else if (this.phase === "reload") {
        this.phaseT -= dt; this.vx = U.damp(this.vx, 0, 8, dt);
        this.spr.set(this.crouched ? "creload" : "reload");
        if (this.phaseT <= 0) this.phase = "move";
      } else if (this.phase === "hop") {
        // leap clear of a rushing player and shoot mid-air (Jump + air-fire rows)
        this.burstCd -= dt;
        this.spr.set(this.vy < -60 ? "jump" : "jshoot");
        if (this.burstCd <= 0 && this.airFired < 2) {
          this.airFired++; this.burstCd = 0.16;
          G.bolts.push(new NR.Bolt(this.x + this.facing * 28, this.y - 46, this.facing * 660, 90, { dmg: this.dmg * G.enemyDmgMul, col: "red", r: 5 }));
          NR.audio.play("shot");
        }
        if (this.onGround && this.vy >= 0 && this.t > 0.2) { this.phase = "move"; this.hopCd = U.rand(3, 5.5); }
      } else {
        const dist = Math.abs(dx);
        const lined = Math.abs(p.y - this.y) < 120;
        this.crouched = dist < 220; // point-blank → drops to a knee for stability
        this.hopCd -= dt;
        if (dist < 250 && this.onGround && this.hopCd <= 0) {
          // too close for comfort — hop backwards and answer from the air
          this.phase = "hop"; this.airFired = 0; this.burstCd = 0.12;
          this.vy = -620; this.vx = -Math.sign(dx) * 300; this.onGround = false;
          NR.audio.play("jump");
        } else if (dist < 300 && !this.crouched) this.vx = U.damp(this.vx, -Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt); // too close — back off
        else if (dist > 480) this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt);  // too far — push in
        else { this.vx = U.damp(this.vx, 0, 5, dt);
          if (lined) {
            this.phase = "shoot"; this.phaseT = 0.42; this.burstLeft = 3; this.burstCd = 0.05;
            this.runShot = Math.abs(this.vx) > 110; // firing on the move uses the run-fire row
            this.spr.set(this.crouched ? "cshoot" : this.runShot ? "rshoot" : "shoot", true);
          }
        }
        if (this.phase === "move")
          this.spr.set(this.crouched ? "crouch" : Math.abs(this.vx) > 40 ? "walk" : (lined ? "stand" : "idle"));
      }
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "diego", this.x, this.y, this.facing, 2.0);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this.phase === "shoot") { // muzzle flash
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "yellow", this.x + this.facing * 34, this.y - 44, 10 + Math.sin(this.t * 50) * 3, 0.75);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 2.0 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ STRIKER — Holly, the leaping smasher (Sprite Pack 7) ============
     Sprints in, leaps at the player, and ground-pounds a twin shockwave. */
  class Striker extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "striker";
      this.w = 44; this.h = 62; this.barY = 74; // brawler art ≈ 66px tall at scale 2.2
      this.maxHp = this.hp = Math.round(60 * mul);
      this.dmg = 16; this.score = 260;
      this.speed = 175; this.state = "chase"; this.st = 0;
      this.spr = NR.spriteRender.anim("holly", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      if (this.state !== "smash") this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); this.spr.set("idle"); }
      else if (this.state === "chase") {
        this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt);
        this.spr.set(Math.abs(this.vx) > 40 ? "walk" : "idle");
        if (Math.abs(dx) < 340 && this.onGround && this.st > 0.5) {
          this.state = "leap"; this.st = 0;
          this.vx = Math.sign(dx) * Math.min(560, Math.abs(dx) * 2.2);
          this.vy = -820;
          this.onGround = false;
          NR.audio.play("jump");
          this.spr.set("jump", true);
        }
      } else if (this.state === "leap") {
        this.spr.set(this.vy < 0 ? "jump" : "aerial");
        if (this.onGround) { // landed → pound
          this.state = "smash"; this.st = 0;
          this.spr.set("smash", true);
          G.shake(0.5);
          NR.audio.play("slam");
          G.shockwaves.push(new NR.ShockRing(this.x - 56, -1, { dmg: this.dmg * G.enemyDmgMul }));
          G.shockwaves.push(new NR.ShockRing(this.x + 56, 1, { dmg: this.dmg * G.enemyDmgMul }));
          F.burst(this.x, this.y - 4, { n: 26, col: "orange", spd: 420, life: 0.6, up: 240 });
        }
      } else { // smash recovery — she stays low, catching her breath
        this.st += dt;
        this.vx = U.damp(this.vx, 0, 10, dt);
        this.spr.set(this.st > 0.42 ? "duck" : "smash");
        if (this.st > 0.7) { this.state = "chase"; this.st = 0; }
      }
      if (this.state === "chase" || this.stunned > 0) this.st += dt;
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "holly", this.x, this.y, this.facing, 2.2);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = "#000";
      const gy = NR.world.groundY;
      ctx.beginPath(); ctx.ellipse(this.x, gy + 3, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 2.2 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ BLADE — Gordon, the berserker (Sprite Pack 7) ============
     Run-stabs from range, then commits to a 3-strike combo at close quarters. */
  class Blade extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "blade";
      this.w = 52; this.h = 88; this.barY = 98; // swordsman art ≈ 81px tall at scale 1.8
      this.maxHp = this.hp = Math.round(90 * mul);
      this.dmg = 15; this.score = 380;
      this.speed = 230; this.state = "chase"; this.st = 0;
      this.dashCd = U.rand(1, 2); this.landed = null; // combo strikes already dealt
      this.leapCd = U.rand(2.5, 4.5);
      this.comboAnim = "combo"; this.hitFrames = [5, 11, 16]; this.comboDur = 1.6;
      this.spr = NR.spriteRender.anim("gordon", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.flash -= dt; this.touchCd -= dt; this.dashCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      const p = G.player;
      const dx = p.x - this.x;
      if (this.state === "chase") this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) { this.stunned -= dt; this.vx = U.damp(this.vx, 0, 6, dt); this.spr.set("idle"); }
      else if (this.state === "chase") {
        const dist = Math.abs(dx);
        const lined = Math.abs(p.y - this.y) < 80;
        this.leapCd -= dt;
        if (dist > 260 && dist < 470 && this.onGround && this.leapCd <= 0) {
          // closing leap: Jump → Falling → Landed rows, with a shockwave on impact
          this.state = "leap"; this.st = 0;
          this.vy = -760; this.vx = Math.sign(dx) * Math.min(520, dist * 1.5);
          this.onGround = false;
          this.spr.set("jump", true);
          NR.audio.play("jump");
        } else if (dist > 460 && lined && this.dashCd <= 0) {
          this.state = "stab"; this.st = 0; this.landed = null;
          this.spr.set("stab", true);
        } else if (dist < 110 && lined) {
          // commit to a swing — long three-hit combo or a single rising/cleaving cut
          this.state = "combo"; this.st = 0; this.landed = {};
          if (Math.random() < 0.55) { this.comboAnim = "combo"; this.hitFrames = [5, 11, 16]; this.comboDur = 1.6; }
          else { this.comboAnim = U.pick(["upswing", "downswing", "aer"]); this.hitFrames = [4]; this.comboDur = 0.75; }
          this.spr.set(this.comboAnim, true);
        } else {
          this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 5, dt);
          this.spr.set(Math.abs(this.vx) > 40 ? "walk" : "idle");
        }
      } else if (this.state === "leap") {
        this.st += dt;
        this.spr.set(this.vy < 0 ? "jump" : "fall");
        if (this.onGround && this.vy >= 0) {
          this.state = "land"; this.st = 0;
          this.spr.set("landed", true);
          NR.audio.play("slam");
          G.shake(0.3);
          F.burst(this.x, this.y - 6, { n: 16, col: "cyan", spd: 320, life: 0.45, up: 180 });
          if (Math.abs(p.x - this.x) < 120 && Math.abs(p.y - this.y) < 100)
            G.hurtPlayer(this.dmg * 0.8 * G.enemyDmgMul, this.facing, "slam");
        }
      } else if (this.state === "land") {
        this.st += dt;
        this.vx = U.damp(this.vx, 0, 12, dt);
        this.spr.set(this.st > 0.34 ? "crouch" : "landed");
        if (this.st > 0.6) { this.state = "chase"; this.st = 0; this.leapCd = U.rand(3.2, 5.2); this.facing = dx > 0 ? 1 : -1; }
      } else if (this.state === "stab") {
        this.st += dt;
        this.vx = this.facing * 640 * G.enemySpdMul; // full-commit dash
        this.spr.set("stab");
        if (!this.landed && Math.abs(dx) < 78 && Math.abs(G.player.y - this.y) < 90) {
          this.landed = true;
          G.hurtPlayer(this.dmg * G.enemyDmgMul, this.facing, "slash");
          F.sparks(G.player.x, G.player.y - 40, 12, "cyan");
        }
        if (this.st > 0.5) { this.state = "cool"; this.st = 0; this.dashCd = U.rand(2.2, 3.4); }
      } else if (this.state === "combo") {
        this.st += dt;
        this.vx = U.damp(this.vx, this.facing * 40, 4, dt); // tiny forward creep per swing
        this.spr.set(this.comboAnim);
        const f = this.spr.frame;
        for (const hitF of this.hitFrames) {
          if (f >= hitF && !this.landed[hitF]) {
            this.landed[hitF] = true;
            if (Math.abs(dx) < 95 && Math.abs(G.player.y - this.y) < 90)
              G.hurtPlayer(this.dmg * G.enemyDmgMul, this.facing, "slash");
            F.sparks(this.x + this.facing * 46, this.y - 44, 8, "white");
            NR.audio.play("slash");
          }
        }
        if (this.spr.done || this.st > this.comboDur) { this.state = "cool"; this.st = 0; }
      } else { // cool — drops to a knee, then strafes back into the fight
        this.st += dt;
        this.vx = U.damp(this.vx, -Math.sign(dx) * this.speed * 0.5 * G.enemySpdMul, 5, dt);
        this.spr.set(this.st < 0.3 ? "crouch" : this.st > 0.7 ? "stand" : "idle");
        if (this.st > 0.85) { this.state = "chase"; this.st = 0; this.facing = dx > 0 ? 1 : -1; }
      }
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "gordon", this.x, this.y, this.facing, 1.8);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.33; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 3, 28, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this.state === "combo") { // blade trail glow while sweeping
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "cyan", this.x + this.facing * 40, this.y - 44, 20, 0.35 + 0.15 * Math.sin(this.t * 30));
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 1.8 });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ APPARITION — diving phantom (EVil Wizard 2 pack) ============
     The warlock keeps its distance; the apparition does the opposite. It hangs
     in the air on the Jump frame, drops on Fall, and casts Attack2 on impact —
     the three wizard animations the roster never used. */
  class Apparition extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "apparition"; this.flying = true;
      this.w = 52; this.h = 130; this.barY = 160;
      this.maxHp = this.hp = Math.round(72 * mul);
      this.dmg = 18; this.score = 340;
      this.speed = 190; this.state = "hover"; this.st = 0; this.hoverCd = U.rand(0.8, 1.8);
      this.alpha = 0.92;
      this.spr = NR.spriteRender.anim("wizard", { anim: "idle" });
    }
    update(dt, G) {
      this.t += dt; this.st += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; this.spr.set("idle"); this.spr.update(dt); return; }
      const p = G.player;
      const dx = p.x - this.x;
      this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) {
        this.stunned -= dt; this.state = "hover"; this.st = 0;
        this.vx = U.damp(this.vx, 0, 6, dt); this.spr.set("hurt");
      } else if (this.state === "hover") {
        // drift above the hero, then commit
        const wantX = p.x + Math.sin(this.t * 1.7) * 150;
        const wantY = NR.world.groundY - 250 + Math.sin(this.t * 2.4) * 26;
        this.vx = U.damp(this.vx, U.clamp((wantX - this.x) * 2.2, -this.speed, this.speed), 4, dt);
        this.vy = U.damp(this.vy, U.clamp((wantY - this.y) * 2.4, -220, 220), 5, dt);
        this.hoverCd -= dt;
        this.spr.set(Math.abs(this.vx) > 60 ? "walk" : "idle");
        if (this.hoverCd <= 0 && Math.abs(dx) < 420) { this.state = "rise"; this.st = 0; this.spr.set("jump", true); }
      } else if (this.state === "rise") {
        this.vy = U.damp(this.vy, -260, 6, dt);
        this.vx = U.damp(this.vx, Math.sign(dx) * 120, 4, dt);
        this.spr.set("jump");
        if (this.st > 0.34) { this.state = "dive"; this.st = 0; this.spr.set("fall", true); NR.audio.play("dash"); }
      } else if (this.state === "dive") {
        this.vy = 900; this.vx = U.damp(this.vx, Math.sign(dx) * 260, 3, dt);
        this.spr.set("fall");
        if (U.chance(dt * 30)) F.burst(this.x, this.y - 60, { n: 1, col: "purple", spd: 40, life: 0.4, size: 6, grav: -80 });
        if (this.y >= NR.world.groundY - 6) {
          this.state = "cast"; this.st = 0; this.y = NR.world.groundY;
          this.vx = 0; this.spr.set("attack2", true);
          NR.audio.play("swing3");
          G.shake(0.35);
          F.burst(this.x, this.y - 10, { n: 22, col: "purple", spd: 380, life: 0.55, up: 200 });
          // impact ring: hurts only if you stayed underneath
          if (Math.abs(p.x - this.x) < 150 && p.y > NR.world.groundY - 120)
            G.hurtPlayer(this.dmg * G.enemyDmgMul, Math.sign(p.x - this.x) || 1, "slam");
        }
      } else { // cast → back into the air
        this.vx = U.damp(this.vx, 0, 10, dt);
        this.spr.set("attack2");
        if (this.st > 0.28 && this.st < 0.34) {
          const a = U.angleTo(this.x, this.y - 70, p.x, p.y - 44);
          for (const off of [-0.22, 0, 0.22]) {
            const ang = a + off;
            G.bolts.push(new NR.Bolt(this.x + this.facing * 30, this.y - 70,
              Math.cos(ang) * 430, Math.sin(ang) * 430, { dmg: this.dmg * 0.6 * G.enemyDmgMul, col: "purple", r: 7 }));
          }
          NR.audio.play("shot");
        }
        if (this.st > 0.75) { this.state = "hover"; this.st = 0; this.hoverCd = U.rand(1.1, 2.1) / G.enemySpdMul; }
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = U.clamp(this.x, 40, NR.world.W - 40);
      this.y = U.clamp(this.y, 150, NR.world.groundY);
      this.spr.update(dt);
      if (U.chance(dt * 7)) F.burst(this.x + U.rand(-18, 18), this.y - U.rand(10, 110), { n: 1, col: "purple", spd: 24, life: 0.5, size: 5, grav: -50 });
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "wizard", this.x, this.y, this.facing, 1.1);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, NR.world.groundY + 3, 28, 7, 0, 0, U.TAU); ctx.fill();
      ctx.restore();
      if (this.state === "dive") { // falling telegraph on the floor
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "purple", this.x, NR.world.groundY - 4, 40, 0.5);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 1.1, alpha: this.alpha });
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  /* ============ BRUTE — armoured orc heavy (Tiny RPG orc + effect layer) ============
     Slow, huge, and its swing draws the pack's separate cleave-effect sheet. */
  class Brute extends Enemy {
    constructor(x, y, mul) {
      super(x, y);
      this.type = "brute";
      this.w = 96; this.h = 150; this.barY = 175;
      this.maxHp = this.hp = Math.round(150 * mul);
      this.dmg = 22; this.score = 420;
      this.speed = 92; this.state = "walk"; this.st = 0; this.swingCd = U.rand(1.2, 2.2);
      this.armored = true;
      this.spr = NR.spriteRender.anim("orc", { anim: "idle" });
      this.fx = NR.spriteRender.anim("orcFx", { anim: "cleave" });
    }
    hurt(dmg, kx, ky, crit, G) {
      // front-facing plate soons 35% of the hit; flanking is rewarded
      const front = Math.sign(G.player.x - this.x) === this.facing;
      return super.hurt(dmg * (front && this.state !== "swing" ? 0.65 : 1), kx * 0.45, ky * 0.4, crit, G);
    }
    update(dt, G) {
      this.t += dt; this.st += dt; this.flash -= dt; this.touchCd -= dt;
      if (this.spawnT > 0) { this.spawnT -= dt; this.spr.set("idle"); this.spr.update(dt); return; }
      const p = G.player;
      const dx = p.x - this.x;
      if (this.state !== "swing") this.facing = dx > 0 ? 1 : -1;
      if (this.stunned > 0) {
        this.stunned -= dt; this.state = "walk"; this.st = 0;
        this.vx = U.damp(this.vx, 0, 7, dt); this.spr.set("hurt");
      } else if (this.state === "wind") {
        this.vx = U.damp(this.vx, 0, 12, dt);
        this.spr.set("attack");
        if (this.st > 0.42) {
          this.state = "swing"; this.st = 0;
          this.spr.set("attack2", true);
          this.fx.set("cleave", true);
          NR.audio.play("swing3");
        }
      } else if (this.state === "swing") {
        this.vx = U.damp(this.vx, this.facing * 190, 6, dt);
        this.spr.set("attack2");
        this.fx.update(dt);
        if (this.st > 0.1 && this.st < 0.2 && !this.landed) {
          this.landed = true;
          G.shake(0.3);
          F.sparks(this.x + this.facing * 80, this.y - 70, 16, "yellow");
          if (Math.abs(p.x - this.x) < 175 && Math.abs(p.y - this.y) < 120)
            G.hurtPlayer(this.dmg * G.enemyDmgMul, this.facing, "slash");
        }
        if (this.st > 0.55) { this.state = "walk"; this.st = 0; this.landed = false; this.swingCd = U.rand(1.6, 2.6) / G.enemySpdMul; }
      } else {
        this.swingCd -= dt;
        this.vx = U.damp(this.vx, Math.sign(dx) * this.speed * G.enemySpdMul, 4, dt);
        this.spr.set(Math.abs(this.vx) > 30 ? "walk" : "idle");
        if (Math.abs(dx) < 210 && Math.abs(p.y - this.y) < 110 && this.swingCd <= 0) {
          this.state = "wind"; this.st = 0;
        }
      }
      this.spr.update(dt);
      this.phys(dt);
    }
    die(G) {
      if (this.dead) return;
      NR.spriteRender.spawnCorpse(G, "orc", this.x, this.y, this.facing, 4.2);
      Enemy.prototype.die.call(this, G);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.36; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 4, 52, 12, 0, 0, U.TAU); ctx.fill();
      ctx.restore();
      if (this.state === "wind") { // charged-up tell
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        NR.sprites.drawGlow(ctx, "red", this.x, this.y - 90, 48 + Math.sin(this.t * 34) * 12, 0.45);
        ctx.restore();
      }
      const flash = this.flash > 0 ? "rgba(255,255,255,0.85)" : null;
      this.spr.draw(ctx, this.x, this.y, this.facing, { flash, scale: 4.2 });
      if (this.state === "swing") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9;
        this.fx.draw(ctx, this.x + this.facing * 30, this.y, this.facing, { scale: 4.2 });
        ctx.restore();
      }
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }

  NR.Enemy = Enemy;
  NR.Crawler = Crawler;
  NR.Slime = Slime;
  NR.Soldier = Soldier;
  NR.Drone = Drone;
  NR.Wraith = Wraith;
  NR.Boss = Boss;
  NR.Warlock = Warlock;
  NR.Rival = Rival;
  NR.Gunner = Gunner;
  NR.Striker = Striker;
  NR.Blade = Blade;
  NR.Apparition = Apparition;
  NR.Brute = Brute;
  NR.bossSkins = BOSS_SKINS;
})();
