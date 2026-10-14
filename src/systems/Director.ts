import { Sprite } from 'pixi.js';
import type { World } from '../game/World';
import type { Combat } from './Combat';
import type { Hazards } from './Hazards';
import type { Pickups } from './Pickups';
import type { AiCtx } from '../entities/behaviors';
import { Enemy } from '../entities/Enemy';
import { FrogBoss, HeartBoss, type Boss } from '../entities/bosses';
import { WyrmBoss, ColossusBoss } from '../entities/bosses2';
import { ENEMIES, BOSSES, GUARD_ARMOR_POOL, type EnemyKind, type BossKind } from '../content/enemies';
import type { Step, WaveEntry } from '../content/acts';
import { assets } from '../game/AssetLoader';
import { audio } from '../game/AudioManager';
import { rng, TAU } from '../utils/math';

/**
 * Act director: runs the authored wave table, drives objectives
 * (survive, reach, channel Anchor, elite, boss, portal), guarantees fair spawns
 * (off screen, away from the heroine, sieges with a gap) and the population cap.
 */
export class Director {
  stepIndex = -1;
  step!: Step;
  stepTime = 0;
  private fired = new Set<number>();
  private cycle = -1;
  private streamNext = new Map<number, number>();
  private pools = new Map<string, Enemy[]>();
  maxAlive = 420;
  boss: Boss | null = null;
  elite: Enemy | null = null;
  private anchorSprite: Sprite;
  private anchorGlow: Sprite;
  private anchorAura: Sprite;
  private channel = 0;
  private anchorLit = false;
  private portal: Sprite | null = null;
  private marker: Sprite;
  private doneT = -1;
  private ctx: AiCtx;
  viewW = 640;
  viewH = 360;

  constructor(private readonly w: World, private readonly combat: Combat, hazards: Hazards, private readonly pickups: Pickups) {
    this.ctx = { w, combat, hazards, spawn: (k, x, y) => this.spawnEnemy(k, x, y) };
    combat.onEnemyKilled = (e) => {
      if (e.kind === 'golem') w.shake(0.3);
    };
    const [ax, ay] = this.anchorPos;
    this.anchorAura = w.sprite(assets.tex('fx', 'glow_holy'), w.decals, ax, ay, true);
    this.anchorAura.scale.set(1.6, 1.0);
    this.anchorAura.alpha = 0;
    this.anchorSprite = new Sprite(assets.tex('props', 'anchor_off'));
    this.anchorSprite.anchor.set(0.5, 0.92);
    this.anchorSprite.position.set(ax, ay);
    this.anchorSprite.zIndex = ay;
    w.actors.addChild(this.anchorSprite);
    this.anchorGlow = w.sprite(assets.tex('fx', 'glow_holy'), w.lights, ax, ay - 60, true);
    this.anchorGlow.alpha = 0.08;
    this.marker = new Sprite(assets.tex('fx', 'arrow'));
    this.marker.anchor.set(0.5);
    this.marker.tint = 0xffd27a;
    this.marker.visible = false;
    w.top.addChild(this.marker);
    this.nextStep();
  }

  get ai(): AiCtx {
    return this.ctx;
  }

  get anchorPos(): [number, number] {
    const [tx, ty] = this.w.arena.data.anchor;
    return [tx * 32 + 16, ty * 32 + 26];
  }

  /** Dynamic objective light sources: x, y, radius (world px), intensity, colour. */
  lightSources(out: [number, number, number, number, number][]): void {
    const [ax, ay] = this.anchorPos;
    const t = this.step.type;
    if (this.anchorLit) out.push([ax, ay - 20, 230, 1, 0xffe0b0]);
    else if (t === 'reach' || t === 'channel') out.push([ax, ay - 20, 90 + this.channelFrac * 120, 0.8, 0xffd8a0]);
    else out.push([ax, ay - 20, 60, 0.45, 0xc0c8ff]);
    if (this.portal) out.push([this.portal.x, this.portal.y, 140, 0.9, 0xffc890]);
    if (this.boss && !this.boss.e.dying) out.push([this.boss.e.x, this.boss.e.y - 40, 200, 0.7, this.boss.e.boss === 'heart' ? 0xff9ab8 : 0xb0fff0]);
    if (this.elite && !this.elite.dying) out.push([this.elite.x, this.elite.y - 10, 90, 0.5, 0xffd0c0]);
  }

  get portalPos(): [number, number] | null {
    return this.portal ? [this.portal.x, this.portal.y] : null;
  }

  /** Test tool: completes the current step. */
  skip(): void {
    const t = this.step.type;
    if (t === 'channel') this.lightAnchor();
    else if (t === 'elite') {
      if (this.elite) this.combat.kill(this.elite);
      else this.completeStep();
    } else if (t === 'boss') {
      if (this.boss) this.combat.kill(this.boss.e);
    } else if (t === 'portal') {
      if (this.portal) {
        this.w.hero.x = this.portal.x;
        this.w.hero.y = this.portal.y;
      }
    } else if (t !== 'victory') this.completeStep();
  }

  get channelFrac(): number {
    return this.step.type === 'channel' ? this.channel / (this.step.duration ?? 10) : 0;
  }

  // ------------------------------------------------------------- etapas
  private nextStep(): void {
    const w = this.w;
    this.stepIndex++;
    this.step = w.act.steps[this.stepIndex];
    this.stepTime = 0;
    this.fired.clear();
    this.streamNext.clear();
    this.cycle = -1;
    this.doneT = -1;
    const s = this.step;
    w.hooks.objective(s.text, s.hint);
    if (s.type === 'elite' && s.elite) this.spawnElite(s.elite);
    if (s.type === 'boss' && s.boss) this.spawnBoss(s.boss);
    if (s.type === 'portal') this.openPortal();
    if (s.type === 'channel') this.channel = 0;
    if (s.type === 'victory') {
      this.doneT = 0;
      w.hooks.bossBar(null, 0);
    }
  }

  private completeStep(): void {
    const w = this.w;
    const t = this.step.type;
    if (t === 'survive') {
      w.hooks.banner('The tide recedes', 'The ember shows the way');
      this.pickups.vacuum = true;
    }
    if (t === 'elite' || t === 'boss') w.hooks.bossBar(null, 0);
    this.nextStep();
  }

  update(dt: number): void {
    const w = this.w, h = w.hero;
    this.stepTime += dt;
    const s = this.step;
    this.runWaves(dt);
    // subtle objective marker
    let target: [number, number] | null = null;
    if (s.type === 'reach' || s.type === 'channel') target = this.anchorPos;
    if (s.type === 'portal' && this.portal) target = [this.portal.x, this.portal.y];
    if (s.type === 'elite' && this.elite && !this.elite.dying) target = [this.elite.x, this.elite.y];
    this.updateMarker(target);
    // anchor
    const [ax, ay] = this.anchorPos;
    if (!this.anchorLit) {
      this.anchorAura.alpha = s.type === 'reach' || s.type === 'channel' ? 0.3 + 0.15 * Math.sin(w.time * 3) : 0;
    }
    switch (s.type) {
      case 'survive':
        if (this.stepTime >= (s.duration ?? 60)) this.completeStep();
        break;
      case 'reach':
        if (Math.hypot(h.x - ax, (h.y - ay) / 0.7) < 80) this.completeStep();
        break;
      case 'channel': {
        const inside = Math.hypot(h.x - ax, (h.y - ay) / 0.62) < 52 && h.alive;
        this.channel = Math.max(0, this.channel + (inside ? dt : -dt * 0.35));
        const k = this.channel / (s.duration ?? 10);
        this.anchorSprite.texture = assets.anim('props', 'anchor_charge')[Math.floor(w.time * 6) % 4];
        this.anchorGlow.alpha = 0.1 + k * 0.45;
        this.anchorGlow.scale.set(1 + k * 2);
        this.anchorAura.alpha = inside ? 0.55 + 0.2 * Math.sin(w.time * 8) : 0.25;
        if (inside && Math.random() < dt * 14) w.fx.embers(ax + (Math.random() - 0.5) * 20, ay - 46, 1, 40);
        if (k >= 1) this.lightAnchor();
        break;
      }
      case 'elite':
        if (this.elite && this.elite.dying) {
          this.elite = null;
          w.hooks.banner('Elite defeated!', 'Open the relic chest');
          this.completeStep();
        }
        break;
      case 'boss':
        if (this.boss && this.boss.e.dying) {
          if (this.doneT < 0) {
            this.doneT = 0;
            w.hooks.bossBar(null, 0);
            w.hooks.bossSlain();
            w.freeze(0.25);
            w.shake(1);
            w.screenFlash(0xffe0a0, 0.45);
            audio.play('explosion', { rate: 0.6 });
          }
          this.doneT += dt;
          if (this.doneT < 2.2 && Math.random() < dt * 12) {
            const e = this.boss.e;
            w.fx.explosion(e.x + (Math.random() - 0.5) * 120, e.y - Math.random() * 90, Math.random() < 0.5 ? 'fire' : 'ice', 1.3);
            audio.play('explosion', { rate: 0.8 + Math.random() * 0.4 });
          }
          if (this.doneT > 2.8) {
            this.killAllMinions();
            this.completeStep();
          }
        }
        break;
      case 'portal':
        if (this.portal) {
          this.portal.texture = assets.anim('props', 'portal')[Math.floor(w.time * 6) % 4];
          if (Math.hypot(h.x - this.portal.x, (h.y - this.portal.y) / 0.6) < 26 && h.alive) {
            this.step = { type: 'victory', text: '', waves: [] };
            audio.play('portal');
            w.hooks.actComplete();
          }
        }
        break;
      case 'victory':
        this.doneT += dt;
        if (this.doneT > 1.2 && this.doneT - dt <= 1.2) w.hooks.victory();
        break;
    }
    if (this.boss) this.boss.update(dt);
  }

  private lightAnchor(): void {
    const w = this.w;
    const [ax, ay] = this.anchorPos;
    this.anchorLit = true;
    this.anchorSprite.texture = assets.tex('props', 'anchor_on');
    this.anchorGlow.alpha = 0.55;
    this.anchorGlow.scale.set(3.2);
    this.anchorAura.alpha = 0.45;
    this.anchorAura.scale.set(4, 2.6);
    // local light changes colour: the ground warms around it
    const warm = w.sprite(assets.tex('fx', 'glow_fire'), w.lights, ax, ay - 10, true);
    warm.scale.set(7, 4.6);
    warm.alpha = 0.22;
    w.fx.anchorBlast(ax, ay);
    w.shake(0.8);
    w.screenFlash(0xffe0a0, 0.35);
    w.freeze(0.12);
    audio.play('anchor');
    w.hooks.banner('Anchor rekindled!', 'The light drives back the tide');
    for (const e of w.enemies) {
      if (!e.alive || e.dying || e.boss) continue;
      const d = Math.hypot(e.x - ax, e.y - ay);
      if (d < 220) this.combat.damageEnemy(e, e.elite ? 120 : 400, { knock: 400, dirX: e.x - ax, dirY: e.y - ay, scaled: false, tint: 0xffe0a0 });
    }
    w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + w.hero.maxHp * 0.25);
    w.fx.heal(w.hero.x, w.hero.y);
    this.pickups.vacuum = true;
    this.completeStep();
  }

  private openPortal(): void {
    const w = this.w;
    const [tx, ty] = w.arena.data.portal;
    const x = tx * 32 + 16, y = ty * 32 + 16;
    this.portal = new Sprite(assets.tex('props', 'portal'));
    this.portal.anchor.set(0.5, 0.55);
    this.portal.position.set(x, y);
    w.decals.addChild(this.portal);
    const g = w.sprite(assets.tex('fx', 'glow_fire'), w.lights, x, y - 6, true);
    g.scale.set(2.4, 1.6);
    g.alpha = 0.4;
    w.fx.anchorBlast(x, y);
    audio.play('portal');
  }

  private updateMarker(target: [number, number] | null): void {
    const w = this.w, h = w.hero;
    if (!target || !h.alive) {
      this.marker.visible = false;
      return;
    }
    const dx = target[0] - h.x, dy = target[1] - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 120) {
      this.marker.visible = false;
      return;
    }
    const a = Math.atan2(dy, dx);
    this.marker.visible = true;
    const r = 34 + Math.sin(w.time * 5) * 3;
    this.marker.position.set(Math.round(h.x + Math.cos(a) * r), Math.round(h.y - 14 + Math.sin(a) * r * 0.8));
    this.marker.rotation = a;
    this.marker.alpha = 0.85;
  }

  // ---------------------------------------------------------------- waves
  private runWaves(dt: number): void {
    const s = this.step;
    let t = this.stepTime;
    if (s.loop) {
      const c = Math.floor(t / s.loop);
      if (c !== this.cycle) {
        this.cycle = c;
        this.fired.clear();
        this.streamNext.clear();
      }
      t = t % s.loop;
    }
    s.waves.forEach((wv, i) => {
      if (wv.until !== undefined) {
        if (t < wv.at || t > wv.until) return;
        const next = this.streamNext.get(i) ?? wv.at;
        if (t >= next) {
          this.streamNext.set(i, t + (wv.every ?? 1));
          this.spawnGroup(wv);
        }
      } else if (!this.fired.has(i) && t >= wv.at) {
        this.fired.add(i);
        this.spawnGroup(wv);
        if (wv.label) this.w.hooks.banner(wv.label);
      }
    });
    void dt;
  }

  get alive(): number {
    let n = 0;
    for (const e of this.w.enemies) if (e.alive && !e.dying) n++;
    return n;
  }

  private pickKind(kinds: WaveEntry['kinds']): EnemyKind {
    const entries = Object.entries(kinds) as [EnemyKind, number][];
    const total = entries.reduce((a, [, v]) => a + v, 0);
    let r = rng.next() * total;
    for (const [k, v] of entries) {
      r -= v;
      if (r <= 0) return k;
    }
    return entries[0][0];
  }

  private chooseZone(gates?: number[]): number {
    const w = this.w, h = w.hero, ar = w.arena;
    const idx = (gates && gates.length ? gates : ar.zoneCells.map((_, i) => i)).filter((i) => ar.zoneCells[i] && ar.zoneCells[i].length);
    const scored = idx.map((i) => {
      const cells = ar.zoneCells[i];
      const [cx, cy] = cells[Math.floor(cells.length / 2)];
      const x = cx * 32 + 16, y = cy * 32 + 16;
      const d = Math.hypot(x - h.x, y - h.y);
      const off = Math.abs(x - h.x) > this.viewW / 2 + 20 || Math.abs(y - h.y) > this.viewH / 2 + 20;
      return { i, score: (d > 260 ? 1 : 0) * 2 + (off ? 1 : 0) + rng.next() * 0.9, d };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.length ? scored[0].i : 0;
  }

  private spawnGroup(wv: WaveEntry): void {
    const w = this.w, h = w.hero, ar = w.arena;
    const room = this.maxAlive - this.alive;
    if (room <= 0) return;
    const count = Math.min(room, wv.count);
    if (wv.formation === 'ring') {
      // siege with a gap: always leaves an escape corridor
      const gapDir = Math.hypot(h.vx, h.vy) > 10 ? Math.atan2(h.vy, h.vx) : rng.range(0, TAU);
      const R = Math.max(this.viewW, this.viewH) * 0.55 + 20;
      let placed = 0;
      for (let i = 0; i < count * 2 && placed < count; i++) {
        const a = gapDir + 0.75 + (i / (count * 2)) * (TAU - 1.5);
        const x = h.x + Math.cos(a) * R, y = h.y + Math.sin(a) * R * 0.75;
        if (ar.isSolidAt(x, y) || x < 20 || y < 20 || x > ar.pxW - 20 || y > ar.pxH - 20) continue;
        if (i % 2 === 0 && placed < count) {
          if (this.spawnEnemy(this.pickKind(wv.kinds), x, y)) placed++;
        }
      }
      return;
    }
    const zi = this.chooseZone(wv.gates);
    const cells = ar.zoneCells[zi];
    if (!cells || !cells.length) return;
    const [ccx, ccy] = cells[Math.floor(rng.next() * cells.length)];
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      if (wv.formation === 'cluster') {
        x = ccx * 32 + 16 + rng.range(-22, 22);
        y = ccy * 32 + 16 + rng.range(-22, 22);
      } else {
        const [cx, cy] = cells[Math.floor(rng.next() * cells.length)];
        x = cx * 32 + rng.range(4, 28);
        y = cy * 32 + rng.range(4, 28);
      }
      if (ar.isSolidAt(x, y)) [x, y] = ar.nearestFree(x, y);
      if (Math.hypot(x - h.x, y - h.y) < 200) continue; // never spawn on top of the heroine
      this.spawnEnemy(this.pickKind(wv.kinds), x, y);
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy | null {
    const w = this.w;
    if (!ENEMIES[kind].elite && this.alive >= this.maxAlive + 20) return null;
    const pool = this.pools.get(kind);
    let e = pool && pool.pop();
    if (e) e.reset();
    else e = new Enemy(kind, ENEMIES[kind]);
    e.x = x;
    e.y = y;
    e.maxHp = e.hp = Math.round(e.def.hp * w.hpMul);
    e.damage = e.def.damage;
    e.timer = rng.range(1, 3);
    e.timer2 = rng.range(2, 4);
    e.animT = rng.range(0, 1);
    e.ang = Math.atan2(w.hero.y - y, w.hero.x - x);
    w.addEnemy(e);
    w.hooks.bossSeen(kind);
    return e;
  }

  private spawnElite(kind: EnemyKind): void {
    const w = this.w;
    const [tx, ty] = w.arena.data.elite;
    let x = tx * 32 + 16, y = ty * 32 + 16;
    if (Math.hypot(x - w.hero.x, y - w.hero.y) < 140) {
      [x, y] = w.arena.nearestFree(x + 200 * Math.sign(x - w.hero.x || 1), y);
    }
    w.hooks.banner(ENEMIES[kind].name, 'Elite');
    audio.play('telegraph', { rate: 0.6 });
    this.ctx.hazards.ring(x, y, 40, 1.2, () => {
      const e = this.spawnEnemy(kind, x, y);
      if (!e) return;
      if (kind === 'guard') e.armorPool = GUARD_ARMOR_POOL * w.hpMul;
      e.timer = 2.5;
      e.timer2 = 3;
      this.elite = e;
      w.fx.explosion(x, y - 20, kind === 'guard' ? 'fire' : 'ice', 1.4);
      w.shake(0.4);
    });
  }

  private spawnBoss(kind: BossKind): void {
    const w = this.w;
    const pos = kind === 'heart' && w.arena.data.boss ? w.arena.data.boss : w.arena.data.elite;
    let x = pos[0] * 32 + 16, y = pos[1] * 32 + 24;
    if (kind !== 'heart' && Math.hypot(x - w.hero.x, y - w.hero.y) < 160) [x, y] = w.arena.nearestFree(x, y - 160);
    w.hooks.banner(BOSSES[kind].name, 'Boss');
    this.boss = kind === 'frog' ? new FrogBoss(this.ctx, x, y) : kind === 'heart' ? new HeartBoss(this.ctx, x, y)
      : kind === 'wyrm' ? new WyrmBoss(this.ctx, x, y) : new ColossusBoss(this.ctx, x, y);
    w.hooks.bossSeen(kind);
  }

  private killAllMinions(): void {
    for (const e of this.w.enemies) if (e.alive && !e.dying && !e.boss) this.combat.kill(e);
  }

  /** Removes creatures whose death animation finished and returns them to the pool. */
  reap(): void {
    const w = this.w;
    const list = w.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e.dying) continue;
      if (e.syncDeath()) continue;
      if (e.boss) {
        e.root.visible = false;
        e.shadow.visible = false;
        if (this.boss && this.boss.e === e) continue; // the boss stays referenced until the step ends
      }
      e.alive = false;
      e.root.parent?.removeChild(e.root);
      e.shadow.parent?.removeChild(e.shadow);
      list[i] = list[list.length - 1];
      list.pop();
      if (!e.boss && !e.elite) {
        let p = this.pools.get(e.kind);
        if (!p) this.pools.set(e.kind, (p = []));
        if (p.length < 300) p.push(e);
      }
    }
  }

  destroy(): void {
    this.boss?.destroy();
    for (const p of this.pools.values()) for (const e of p) e.root.destroy({ children: true });
    this.pools.clear();
  }
}
