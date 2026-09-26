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
      this.energy = 0; this.maxEnergy = 100;
      this.onGround = true; this.prevBottom = this.y; this.drop = 0;
      this.jumps = 0; this.coyote = 0; this.jumpBuf = 0;
      this.dashT = 0; this.dashDir = 1; this.dashCharges = 1; this.chargeT = 0; this.ghostT = 0;
      this.attackIdx = -1; this.attackT = 0; this.attackDur = 0; this.struck = false; this.queued = false; this.comboResetT = 0;
      this.stormT = 0; this.stormTick = 0;
      this.iframes = 0; this.hitstun = 0; this.landT = 0; this.dead = false;
      this.legPhase = 0; this.t = 0;
      // upgradeable stats
      this.dmgMul = 1; this.speedMul = 1; this.jumpMax = 2;
      this.dashMax = 1; this.dashCdMul = 1; this.energyMul = 1;
      this.lifesteal = 0; this.critCh = 0.05; this.stormMul = 1;
      this.pose = {};
    }

    /* ================== UPDATE ================== */
    update(dt, G) {
      this.t += dt;
      this.iframes = Math.max(0, this.iframes - dt);
      this.drop = Math.max(0, this.drop - dt);
      this.comboResetT -= dt;
      this.landT = Math.max(0, this.landT - dt);

      if (this.hitstun > 0) {
        this.hitstun -= dt;
        this.vx = U.damp(this.vx, 0, 4, dt);
      } else {
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
          NR.audio.play(A.sfx);
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
    }

    control(dt, G) {
      const ax = I.axis();
      const speed = 430 * this.speedMul;
      const attacking = this.attackT > 0;
      const storming = this.stormT > 0;

      if (this.dashT <= 0 && !storming) {
        const target = ax * speed * (attacking ? 0.35 : 1);
        const k = this.onGround ? 18 : 10;
        this.vx = U.damp(this.vx, target, k, dt);
      }
      if (ax !== 0 && !attacking) this.facing = ax;

      // coyote + jump buffer
      if (this.onGround) { this.coyote = 0.1; this.jumps = 0; }
      else this.coyote -= dt;
      if (I.justPressed("jump")) this.jumpBuf = 0.13; else this.jumpBuf -= dt;

      if (this.jumpBuf > 0) {
        if (this.onGround || this.coyote > 0) {
          this.doJump(-1000, "jump");
        } else if (this.jumps < this.jumpMax - 1) {
          this.jumps++;
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
      if (I.justPressed("dash") && this.dashCharges > 0 && this.dashT <= 0 && !storming) {
        this.dashT = 0.17;
        this.dashDir = ax !== 0 ? ax : this.facing;
        this.facing = this.dashDir;
        this.dashCharges--;
        this.iframes = Math.max(this.iframes, 0.24);
        NR.audio.play("dash");
        G.shake(0.12);
      }

      // attack
      if (I.justPressed("attack") && !storming && this.dashT <= 0) {
        if (this.attackT <= 0) this.startAttack(0);
        else if (this.attackIdx < ATTACKS.length - 1) this.queued = true;
      }

      // blade storm
      if (I.justPressed("special") && this.energy >= this.maxEnergy && this.stormT <= 0 && this.dashT <= 0) {
        this.castStorm(G);
      }
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
    }

    onLand() {
      this.landT = 0.14;
      F.burst(this.x, this.y, { n: 7, col: "blue", spd: 170, life: 0.3, spread: 2.2, up: 30 });
    }

    addEnergy(n) {
      this.energy = Math.min(this.maxEnergy, this.energy + n * this.energyMul);
      if (this.energy >= this.maxEnergy) NR.audio.play("ring");
    }
    heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

    /* ================== POSE (procedural animation) ================== */
    computePose() {
      const P = this.pose;
      const speedK = U.clamp(Math.abs(this.vx) / 430, 0, 1.4);
      P.x = this.x; P.y = this.y; P.facing = this.facing;
      P.t = this.t;
      P.runAmt = this.onGround ? speedK : 0;
      P.air = !this.onGround;
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
      } else {
        P.attacking = false;
        P.swordAng = P.air ? -0.7 : (-0.35 + Math.sin(this.t * 2.2) * 0.08);
      }
    }

    /* ================== DRAW ================== */
    draw(ctx) {
      // dash afterimages
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const g of F.ghosts) {
        const a = (1 - g.t / g.life) * 0.45;
        drawRonin(ctx, g.pose, { tint: `rgba(0,255,244,${a})`, ghost: true });
      }
      ctx.restore();

      const P = this.pose;
      const blink = this.iframes > 0 && this.dashT <= 0 ? (Math.sin(this.t * 34) > 0 ? 0.45 : 1) : 1;
      ctx.globalAlpha = blink;
      drawRonin(ctx, P, {});
      ctx.globalAlpha = 1;

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

  /* ---------- procedural ronin renderer ---------- */
  function drawRonin(ctx, P, O) {
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.scale(P.facing, 1);
    const ghost = O.ghost;
    const BODY = ghost ? O.tint : "#12172e";
    const TRIM = ghost ? O.tint : "#00fff4";
    const CLOAK = ghost ? "transparent" : "rgba(255,45,149,0.85)";
    const cr = (P.crouch || 0) * 10;
    const lean = P.lean || 0;
    const hipY = -46 + cr, shY = hipY - 27 + cr * 0.4;

    // --- cloak (fluttering) ---
    if (!ghost) {
      const flap = Math.sin(P.t * 7) * 5 + (P.runAmt || 0) * 12 + (P.air ? 14 : 0);
      const grd = ctx.createLinearGradient(0, shY, -34 - flap, 0);
      grd.addColorStop(0, "rgba(255,45,149,0.9)");
      grd.addColorStop(1, "rgba(120,10,70,0.15)");
      ctx.fillStyle = CLOAK === "transparent" ? "rgba(0,0,0,0)" : grd;
      ctx.beginPath();
      ctx.moveTo(2, shY + 2);
      ctx.quadraticCurveTo(-26 - flap, shY + 18, -30 - flap * 1.5, -8 + Math.sin(P.t * 9) * 4);
      ctx.quadraticCurveTo(-14, 2, -2, -6);
      ctx.closePath(); ctx.fill();
    }

    // --- legs ---
    let a1, a2, b1, b2; // thigh/shin angles
    if (P.air) { a1 = 0.55; b1 = 1.15; a2 = -0.3; b2 = 0.75; }
    else if (P.dash) { a1 = 0.9; b1 = 0.25; a2 = -1.05; b2 = 0.3; }
    else {
      const p = P.legPhase, sw = (P.runAmt || 0);
      const idle = Math.sin(P.t * 2.2) * 0.04;
      a1 = Math.sin(p) * 0.78 * sw + idle;
      a2 = Math.sin(p + Math.PI) * 0.78 * sw + idle - 0.06;
      b1 = Math.max(0.06, -Math.sin(p - 0.7)) * 1.15 * sw + 0.06;
      b2 = Math.max(0.06, -Math.sin(p + Math.PI - 0.7)) * 1.15 * sw + 0.06;
    }
    const legW = 7.5;
    drawLeg(ctx, 0, hipY, a2, b2, legW, ghost ? O.tint : "#0d1126"); // back leg
    drawLeg(ctx, 0, hipY, a1, b1, legW, BODY); // front leg

    // --- torso ---
    const shX = lean * 12, shYv = shY;
    ctx.strokeStyle = BODY; ctx.lineWidth = 15; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(shX, shYv); ctx.stroke();
    // chest neon core
    if (!ghost) {
      NR.sprites.drawGlow(ctx, "cyan", shX + 2, shYv + 6, 12, P.storm ? 0.95 : 0.55);
      ctx.fillStyle = "#00fff4";
      ctx.fillRect(shX - 1, shYv + 2, 5, 8);
    }

    // --- head (hood + visor) ---
    const hx = shX + lean * 4, hy = shYv - 14;
    ctx.fillStyle = ghost ? O.tint : "#0a0e22";
    ctx.beginPath(); ctx.arc(hx, hy, 10, 0, U.TAU); ctx.fill();
    if (!ghost) {
      ctx.fillStyle = "#141b3a";
      ctx.beginPath(); ctx.arc(hx - 2, hy - 2, 11, Math.PI * 0.65, Math.PI * 1.75); ctx.fill();
      // visor
      ctx.strokeStyle = TRIM; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx + 2, hy - 1); ctx.lineTo(hx + 9, hy - 2); ctx.stroke();
      NR.sprites.drawGlow(ctx, "cyan", hx + 7, hy - 1, 8, 0.8);
    }

    // --- back arm ---
    const armSw = (P.runAmt || 0) * Math.sin(P.legPhase + Math.PI) * 0.55;
    strokeLimb(ctx, shX - 1, shYv + 2, armSw + 0.25, 13, armSw + 0.75, 12, 5.5, ghost ? O.tint : "#0d1126");

    // --- sword arm + katana ---
    const sa = P.swordAng === undefined ? -0.35 : P.swordAng;
    const elb = U.seg(shX, shYv + 2, sa * 0.45 + 0.3, 13);
    const hand = U.seg(elb[0], elb[1], sa - 0.15, 14);
    strokeSeg(ctx, shX, shYv + 2, elb[0], elb[1], 6, BODY);
    strokeSeg(ctx, elb[0], elb[1], hand[0], hand[1], 5.5, BODY);
    // katana
    const bl = P.attacking ? 52 : 46;
    const tip = U.seg(hand[0], hand[1], sa, bl);
    const hilt = U.seg(hand[0], hand[1], sa, -9);
    ctx.lineCap = "round";
    ctx.strokeStyle = ghost ? O.tint : "#1a1030"; ctx.lineWidth = 5;
    strokeSeg(ctx, hand[0], hand[1], hilt[0], hilt[1], 5, ghost ? O.tint : "#1a1030");
    // guard
    strokeSeg(ctx, hand[0] - 4, hand[1] + 2, hand[0] + 4, hand[1] - 2, 3, ghost ? O.tint : "#2a3560");
    if (!ghost) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(0,255,244,0.55)"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = ghost ? O.tint : "#eafffd"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    if (!ghost) NR.sprites.drawGlow(ctx, "cyan", tip[0], tip[1], P.attacking ? 16 : 9, P.attacking ? 0.9 : 0.5);

    // storm aura
    if (P.storm && !ghost) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      NR.sprites.drawGlow(ctx, "cyan", 0, -46, 90 + Math.sin(P.t * 20) * 14, 0.5);
      ctx.restore();
    }
    ctx.restore();
  }

  function strokeSeg(ctx, x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function strokeLimb(ctx, x, y, a1, l1, a2, l2, w, col) {
    const j = U.seg(x, y, a1, l1);
    const f = U.seg(j[0], j[1], a2, l2);
    strokeSeg(ctx, x, y, j[0], j[1], w, col);
    strokeSeg(ctx, j[0], j[1], f[0], f[1], w * 0.85, col);
  }
  function drawLeg(ctx, x, y, thigh, knee, w, col) {
    strokeLimb(ctx, x, y, thigh, 21, knee, 20, w, col);
  }

  NR.Player = Player;
  NR.drawRonin = drawRonin;
})();
