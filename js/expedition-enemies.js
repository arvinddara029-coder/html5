/* Telegraph-driven expedition enemies; also join later survival waves. */
(function () {
  const U = NR.util,
    F = NR.fx;
  class Sentry extends NR.Enemy {
    constructor(x, y, mul = 1) {
      super(x, y);
      this.type = "sentry";
      this.w = 48;
      this.h = 66;
      this.hp = this.maxHp = Math.round(60 * mul);
      this.dmg = 9;
      this.score = 180;
      this.cooldown = 1.5;
      this.aim = 0;
    }
    update(dt, G) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.touchCd -= dt;
      if (this.spawnT > 0) {
        this.spawnT -= dt;
        return;
      }
      this.facing = G.player.x > this.x ? 1 : -1;
      if (this.stunned > 0) {
        this.stunned -= dt;
        this.aim = 0;
      } else {
        this.cooldown -= dt;
        if (this.cooldown <= 0.65 && Math.abs(G.player.x - this.x) < 950)
          this.aim = Math.max(0.01, this.aim + dt);
        if (this.cooldown <= 0) {
          const a = U.angleTo(this.x, this.y - 48, G.player.x, G.player.y - 42);
          G.bolts.push(
            new NR.Bolt(
              this.x + this.facing * 29,
              this.y - 48,
              Math.cos(a) * 430,
              Math.sin(a) * 430,
              { r: 6, dmg: 12 * G.enemyDmgMul, col: "orange" },
            ),
          );
          this.cooldown = 2.1;
          this.aim = 0;
          NR.audio.sample("sentry");
        }
      }
      this.vx = U.damp(this.vx, 0, 6, dt);
      this.phys(dt);
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = this.flash > 0 ? "#fff" : "#233c4c";
      ctx.strokeStyle = "#688894";
      ctx.lineWidth = 2;
      NR.util.roundRect(ctx, -24, -60, 48, 51, 5);
      ctx.fill();
      ctx.stroke();
      NR.atlas.draw(ctx, 46, -19, -54, 38, 42);
      ctx.fillStyle = this.aim > 0 ? "#ff7555" : "#d5fa5b";
      ctx.fillRect(this.facing > 0 ? 12 : -37, -51, 25, 8);
      ctx.fillStyle = "#425967";
      ctx.fillRect(-29, -10, 58, 10);
      if (this.aim > 0) {
        ctx.strokeStyle = "#ff885977";
        ctx.setLineDash([7, 9]);
        ctx.beginPath();
        ctx.moveTo(this.facing * 25, -47);
        const p = NR.game.player;
        ctx.lineTo(p.x - this.x, p.y - 42 - this.y);
        ctx.stroke();
      }
      ctx.restore();
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }
  class Sentinel extends NR.Enemy {
    constructor(x, y, mul = 1) {
      super(x, y);
      this.type = "sentinel";
      this.w = 62;
      this.h = 98;
      this.hp = this.maxHp = Math.round(135 * mul);
      this.dmg = 17;
      this.score = 350;
      this.cooldown = 1.7;
      this.windup = 0;
      this.leg = 0;
    }
    hurt(dmg, kx, ky, crit, G) {
      const front = Math.sign(G.player.x - this.x) === this.facing;
      return super.hurt(
        dmg * (front && this.windup <= 0 ? 0.65 : 1),
        kx * 0.6,
        ky * 0.4,
        crit,
        G,
      );
    }
    update(dt, G) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.touchCd -= dt;
      if (this.spawnT > 0) {
        this.spawnT -= dt;
        return;
      }
      if (this.stunned > 0) {
        this.stunned -= dt;
        this.vx = U.damp(this.vx, 0, 8, dt);
      } else if (this.windup > 0) {
        this.windup -= dt;
        this.vx = 0;
        if (this.windup <= 0) {
          G.shockwaves.push(
            new NR.ShockRing(this.x, this.facing, {
              speed: 360,
              h: 65,
              dmg: 14 * G.enemyDmgMul,
            }),
          );
          NR.audio.play("slam");
          G.shake(0.2);
        }
      } else {
        this.facing = G.player.x > this.x ? 1 : -1;
        this.cooldown -= dt;
        this.vx = U.damp(this.vx, this.facing * 95 * G.enemySpdMul, 5, dt);
        if (Math.abs(G.player.x - this.x) < 340 && this.cooldown <= 0) {
          this.windup = 0.8;
          this.cooldown = 2.8;
        }
      }
      this.leg += Math.abs(this.vx) * dt * 0.04;
      this.phys(dt);
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.facing, 1);
      ctx.strokeStyle = "#3e5764";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sign * 13, -33);
        ctx.lineTo(sign * 16 + Math.sin(this.leg + sign) * 8, -6);
        ctx.stroke();
      }
      ctx.fillStyle = this.flash > 0 ? "#fff" : "#35434b";
      NR.util.roundRect(ctx, -29, -80, 57, 49, 7);
      ctx.fill();
      NR.atlas.draw(ctx, 71, -23, -77, 45, 42);
      ctx.fillStyle = this.windup > 0 ? "#ff6049" : "#f6c57d";
      ctx.fillRect(-15, -93, 36, 23);
      ctx.fillStyle = "#111d25";
      ctx.fillRect(3, -86, 21, 7);
      ctx.fillStyle = "#688080";
      ctx.fillRect(24, -72, 12, 44);
      ctx.strokeStyle = this.windup > 0 ? "#ff7248" : "#d8eaf0";
      ctx.lineWidth = 3;
      ctx.strokeRect(25, -72, 10, 44);
      if (this.windup > 0) {
        ctx.fillStyle = "#ff8b4b";
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("!", -4, -107);
      }
      ctx.restore();
      this.hpBar(ctx);
      this.drawSpawnFx(ctx);
    }
  }
  NR.Sentry = Sentry;
  NR.Sentinel = Sentinel;
})();
