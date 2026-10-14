import { Container, Sprite, Texture } from 'pixi.js';
import { assets } from '../game/AssetLoader';
import { BASE, type DerivedStats } from '../content/stats';
import { damp } from '../utils/math';

type Face = 'down' | 'up' | 'side';

/** Rune archer: short-acceleration movement, invulnerable dash and animation states. */
export class Hero {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  radius = 7;
  alive = true;
  hp = 100;
  maxHp = 100;
  energy = 60;
  face: Face = 'down';
  flip = false;
  /** aim/facing direction (rad). */
  aim = Math.PI / 2;
  moving = false;
  dashT = 0;
  dashCd = 0;
  dashDx = 0;
  dashDy = 0;
  iframes = 0;
  hurtT = 0;
  shootT = 0;
  deadT = 0;
  animT = 0;
  pulseCd = 0;
  root = new Container();
  sprite: Sprite;
  shadow: Sprite;
  private A: Record<string, Texture[]> = {};
  afterimageT = 0;

  constructor() {
    for (const [k, v] of Object.entries(assets.sheet('hero').animations)) this.A[k] = v;
    this.sprite = new Sprite(this.A['hero_down_idle'][0]);
    this.sprite.anchor.set(0.5, 0.9);
    this.root.addChild(this.sprite);
    this.shadow = new Sprite(assets.tex('fx', 'shadow_m'));
    this.shadow.anchor.set(0.5);
  }

  get dashing(): boolean {
    return this.dashT > 0;
  }

  get invulnerable(): boolean {
    return this.iframes > 0 || this.dashT > 0;
  }

  /** Movement simulation (no collision — the arena resolves it afterwards). */
  update(dt: number, mv: { x: number; y: number }, stats: DerivedStats, wantDash: boolean): boolean {
    let dashed = false;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.animT += dt;
    if (!this.alive) {
      this.deadT += dt;
      this.vx = this.vy = 0;
      return false;
    }
    this.energy = Math.min(BASE.energyMax, this.energy + BASE.energyRegen * dt);
    this.moving = Math.abs(mv.x) + Math.abs(mv.y) > 0.05;
    if (wantDash && this.dashCd <= 0 && this.dashT <= 0) {
      let dx = mv.x, dy = mv.y;
      if (!this.moving) {
        dx = Math.cos(this.aim);
        dy = Math.sin(this.aim);
      }
      const l = Math.hypot(dx, dy) || 1;
      this.dashDx = dx / l;
      this.dashDy = dy / l;
      this.dashT = BASE.dashTime;
      this.dashCd = stats.dashCooldown;
      this.iframes = Math.max(this.iframes, BASE.dashIframes);
      dashed = true;
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashDx * BASE.dashSpeed;
      this.vy = this.dashDy * BASE.dashSpeed;
    } else {
      const tx = mv.x * stats.speed, ty = mv.y * stats.speed;
      this.vx = damp(this.vx, tx, BASE.accel, dt);
      this.vy = damp(this.vy, ty, BASE.accel, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.moving) this.aim = Math.atan2(mv.y, mv.x);
    return dashed;
  }

  /** Updates the visual direction from an angle (movement or shot). */
  faceAngle(a: number): void {
    const c = Math.cos(a), s = Math.sin(a);
    if (Math.abs(c) > Math.abs(s) * 0.9) {
      this.face = 'side';
      this.flip = c < 0;
    } else this.face = s > 0 ? 'down' : 'up';
  }

  sync(time: number): void {
    let name: string;
    let fps = 8;
    let frames: Texture[];
    if (!this.alive) {
      frames = this.A['hero_down_death'];
      const i = Math.min(frames.length - 1, Math.floor(this.deadT * 7));
      this.sprite.texture = frames[i];
      this.root.scale.x = 1;
    } else {
      if (this.dashT > 0) {
        name = 'dash';
        fps = 16;
      } else if (this.hurtT > 0.25) {
        name = 'hurt';
        fps = 10;
      } else if (this.moving) {
        name = 'walk';
        fps = 11;
      } else if (this.shootT > 0) {
        name = 'shoot';
        fps = 12;
      } else name = 'idle';
      frames = this.A[`hero_${this.face}_${name}`] ?? this.A[`hero_${this.face}_idle`];
      this.sprite.texture = frames[Math.floor(this.animT * fps) % frames.length];
      this.root.scale.x = this.face === 'side' && this.flip ? -1 : 1;
    }
    this.root.position.set(Math.round(this.x), Math.round(this.y));
    this.root.zIndex = this.y;
    this.shadow.position.set(Math.round(this.x), Math.round(this.y));
    // blink during post-hit invulnerability (soft, no strobe)
    this.sprite.alpha = this.iframes > 0 && this.dashT <= 0 && this.hurtT > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(time * 18)) : 1;
    this.sprite.tint = this.hurtT > 0.4 ? 0xffb0b0 : 0xffffff;
  }

  /** Current texture (for dash afterimages). */
  get texture(): Texture {
    return this.sprite.texture;
  }
}
