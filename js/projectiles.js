/* ============ NEON RONIN — bolts, boss shockwaves, pickups ============ */
(function () {
  const U = NR.util, W = NR.world, F = NR.fx;

  /* ---------- energy bolt (enemy fire) ---------- */
  class Bolt {
    constructor(x, y, vx, vy, o = {}) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.r = o.r || 7; this.dmg = o.dmg || 10;
      this.col = o.col || "magenta"; this.dead = false; this.life = 5;
      this.trailT = 0;
    }
    update(dt, G) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        F.burst(this.x, this.y, { n: 1, col: this.col, spd: 10, life: 0.25, size: 6, grav: 0 });
      }
      if (W.pointSolid(this.x, this.y) || this.x < -60 || this.x > W.W + 60 || this.y < -200) {
        this.dead = true;
        F.sparks(this.x, this.y, 6, this.col, 300);
        return;
      }
      const p = G.player;
      if (p && !p.dead && W.circleHits(this.x, this.y, this.r + 4, p)) {
        this.dead = true;
        NR.audio.play("boltHit");
        F.sparks(this.x, this.y, 10, "red");
        G.hurtPlayer(this.dmg, Math.sign(this.vx) || 1, "bolt");
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sp = Math.hypot(this.vx, this.vy) || 1;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = this.r * 1.1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - (this.vx / sp) * this.r * 3.2, this.y - (this.vy / sp) * this.r * 3.2);
      ctx.stroke();
      NR.sprites.drawGlow(ctx, this.col, this.x, this.y, this.r * 3.4, 0.95);
      ctx.restore();
    }
  }

  /* ---------- boss ground shockwave (jump to dodge) ---------- */
  class ShockRing {
    constructor(x, dir, o = {}) {
      this.x = x; this.dir = dir; this.speed = o.speed || 460;
      this.h = o.h || 100; this.halfW = 24;
      this.dmg = o.dmg || 18; this.life = 4; this.dead = false;
      this.col = o.col || "orange";
    }
    update(dt, G) {
      this.life -= dt;
      this.x += this.dir * this.speed * dt;
      const y = W.groundY;
      if (U.chance(0.6)) F.burst(this.x, y - 4, { n: 2, col: this.col, spd: 140, life: 0.35, size: 6, up: 120, spread: 1.8 });
      if (this.life <= 0 || this.x < 20 || this.x > W.W - 20) {
        this.dead = true;
        F.sparks(this.x, y - 30, 12, this.col);
        NR.audio.play("slam");
        NR.game.shake(0.25);
        return;
      }
      const p = G.player;
      if (p && !p.dead && Math.abs(p.x - this.x) < this.halfW + p.w / 2 && p.y > y - this.h)
        G.hurtPlayer(this.dmg, this.dir, "shock");
    }
    draw(ctx) {
      const y = W.groundY;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(0, y - this.h, 0, y);
      g.addColorStop(0, "rgba(255,150,60,0)");
      g.addColorStop(0.7, "rgba(255,150,60,0.5)");
      g.addColorStop(1, "rgba(255,220,120,0.9)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.x - this.halfW, y);
      ctx.quadraticCurveTo(this.x, y - this.h * 1.5, this.x + this.halfW, y);
      ctx.closePath();
      ctx.fill();
      NR.sprites.drawGlow(ctx, "orange", this.x, y - 14, 46, 0.8);
      NR.sprites.drawGlow(ctx, "yellow", this.x, y - this.h * 0.55, 26, 0.7);
      ctx.restore();
    }
  }

  /* ---------- pickups: hearts & energy orbs ---------- */
  class Pickup {
    constructor(x, y, kind) {
      this.x = x; this.y = y; this.kind = kind; // 'heart' | 'energy'
      this.vx = U.rand(-140, 140); this.vy = U.rand(-420, -260);
      this.t = U.rand(0, 6); this.life = 13; this.dead = false;
    }
    update(dt, G) {
      this.t += dt; this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      const p = G.player;
      const d = U.dist(this.x, this.y, p.x, p.y - 40);
      if (d < 190) { // magnet
        const a = U.angleTo(this.x, this.y, p.x, p.y - 40);
        const pull = 2400 * (1 - d / 220);
        this.vx += Math.cos(a) * pull * dt;
        this.vy += Math.sin(a) * pull * dt;
      } else {
        this.vy += 1500 * dt;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > W.groundY - 10) { this.y = W.groundY - 10; this.vy *= -0.45; this.vx *= 0.8; }
      if (d < 40) {
        this.dead = true;
        if (this.kind === "heart") {
          p.heal(18);
          F.text(p.x, p.y - 110, "+18 HP", { col: "#7dffa8", size: 20 });
          NR.audio.play("pickup");
        } else {
          p.addEnergy(14);
          F.text(p.x, p.y - 110, "+ENERGY", { col: "#7dfff3", size: 18 });
          NR.audio.play("orb");
        }
        F.burst(this.x, this.y, { n: 12, col: this.kind === "heart" ? "green" : "cyan", spd: 220, life: 0.4, grav: 0 });
      }
    }
    draw(ctx) {
      const bob = Math.sin(this.t * 5) * 5;
      const blink = this.life < 3 ? (Math.sin(this.t * 16) * 0.5 + 0.5) : 1;
      const y = this.y - 14 + bob;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.globalCompositeOperation = "lighter";
      if (this.kind === "heart") {
        NR.sprites.drawGlow(ctx, "green", this.x, y, 30, 0.85);
        ctx.fillStyle = "#8dffab";
        ctx.beginPath();
        const s = 9 + Math.sin(this.t * 6) * 1.5;
        ctx.moveTo(this.x, y + s);
        ctx.bezierCurveTo(this.x - s * 1.6, y, this.x - s * 0.8, y - s * 1.2, this.x, y - s * 0.4);
        ctx.bezierCurveTo(this.x + s * 0.8, y - s * 1.2, this.x + s * 1.6, y, this.x, y + s);
        ctx.fill();
      } else {
        NR.sprites.drawGlow(ctx, "cyan", this.x, y, 28, 0.85);
        ctx.fillStyle = "#c9fffb";
        ctx.save();
        ctx.translate(this.x, y);
        ctx.rotate(this.t * 3);
        const s = 8;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  NR.Bolt = Bolt;
  NR.ShockRing = ShockRing;
  NR.Pickup = Pickup;
})();
