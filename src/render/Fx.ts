import type { Texture } from 'pixi.js';
import { assets } from '../game/AssetLoader';
import type { World } from '../game/World';
import { rng, TAU } from '../utils/math';

/** Authored VFX presets composed with the particle system. */
export class Fx {
  private t: Record<string, Texture[]> = {};

  constructor(private readonly w: World) {
    for (const k of ['ember', 'spark', 'explosion', 'explosion_ice', 'explosion_volt', 'smoke', 'chunk', 'heal', 'levelup',
      'shockwave', 'boss_wave', 'beam', 'crystal_burst', 'glow_fire', 'glow_ice', 'glow_holy', 'glow_spirit', 'glow_danger', 'dash_streak'])
      this.t[k] = assets.anim('fx', k);
  }

  private get dense(): number {
    return this.w.quality === 'low' ? 0.45 : this.w.quality === 'medium' ? 0.75 : 1;
  }

  hit(x: number, y: number, tint = 0xffe0a0, strong = false): void {
    const p = this.w.particles;
    p.emit({ x, y, life: 0.16, frames: this.t.spark, scale: strong ? 1.3 : 0.9, alpha: 1, alphaEnd: 0.6, add: true, tint });
    const n = Math.ceil((strong ? 5 : 2) * this.dense);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), v = rng.range(40, 120);
      p.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rng.range(0.15, 0.3), tex: this.t.ember[rng.int(0, 1)], drag: 6, add: true, tint });
    }
  }

  death(x: number, y: number, tint: number, big = false): void {
    const p = this.w.particles;
    const n = Math.ceil((big ? 16 : 6) * this.dense);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), v = rng.range(30, big ? 140 : 90);
      p.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, z: rng.range(2, 8), vz: rng.range(40, 130), life: rng.range(0.45, 0.9),
        tex: this.t.chunk[rng.int(0, 3)], tint, alpha: 1, alphaEnd: 0.0, scale: big ? 1.4 : 1, drag: 1.5 });
    }
    p.emit({ x, y: y - 2, life: 0.35, frames: this.t.smoke, scale: big ? 1.6 : 0.9, alpha: 0.7, alphaEnd: 0, vy: -10 });
  }

  explosion(x: number, y: number, kind: 'fire' | 'ice' | 'volt' = 'fire', scale = 1): void {
    const key = kind === 'fire' ? 'explosion' : kind === 'ice' ? 'explosion_ice' : 'explosion_volt';
    const p = this.w.particles;
    p.emit({ x, y, life: 0.42, frames: this.t[key], scale, alpha: 1, alphaEnd: 0.8, add: true });
    this.w.flashLight(x, y, 90 * scale + 30, 0.9, kind === 'fire' ? 0xffa050 : kind === 'ice' ? 0x9af0ff : 0xb0b8ff, 0.35);
    p.emit({ x, y, life: 0.3, tex: this.t[kind === 'fire' ? 'glow_fire' : kind === 'ice' ? 'glow_ice' : 'glow_spirit'][0], scale: 1.6 * scale, scaleEnd: 2.4 * scale, alpha: 0.5, alphaEnd: 0, add: true });
    if (kind === 'fire') this.embers(x, y, Math.ceil(6 * scale), 90 * scale);
    p.emit({ x, y, life: 0.7, frames: this.t.smoke, scale: 1.2 * scale, scaleEnd: 1.8 * scale, alpha: 0.55, alphaEnd: 0, vy: -16 });
  }

  embers(x: number, y: number, n: number, speed = 70): void {
    const p = this.w.particles;
    for (let i = 0; i < Math.ceil(n * this.dense); i++) {
      const a = rng.range(0, TAU), v = rng.range(speed * 0.3, speed);
      p.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, gravity: -30, life: rng.range(0.4, 0.9), tex: this.t.ember[rng.int(0, 3)], drag: 3, add: true, alpha: 1, alphaEnd: 0 });
    }
  }

  burn(x: number, y: number): void {
    if (rng.next() > 0.5 * this.dense) return;
    this.w.particles.emit({ x: x + rng.range(-4, 4), y, vy: -26, life: 0.5, tex: this.t.ember[rng.int(0, 2)], add: true, alphaEnd: 0, gravity: -20 });
  }

  heal(x: number, y: number): void {
    for (let i = 0; i < 6; i++)
      this.w.particles.emit({ x: x + rng.range(-10, 10), y: y - rng.range(0, 20), vy: -30, life: 0.8, frames: this.t.heal, add: true, alphaEnd: 0 });
  }

  levelUp(x: number, y: number): void {
    const p = this.w.particles;
    p.emit({ x, y: y - 16, life: 0.6, frames: this.t.levelup, scale: 1.4, alpha: 1, alphaEnd: 0.4, add: true });
    p.emit({ x, y: y - 20, life: 0.9, frames: this.t.beam, scale: 1, alpha: 0.9, alphaEnd: 0, add: true, frameByLife: false });
    this.embers(x, y - 16, 14, 120);
  }

  shockwave(x: number, y: number, scale = 1, boss = false): void {
    this.w.particles.emit({ x, y, life: 0.5, frames: boss ? this.t.boss_wave : this.t.shockwave, scale, alpha: 1, alphaEnd: 0.5, add: true });
  }

  crystal(x: number, y: number, scale = 1): void {
    const p = this.w.particles;
    p.emit({ x, y, life: 0.35, frames: this.t.crystal_burst, scale, add: true, alphaEnd: 0.6 });
    for (let i = 0; i < Math.ceil(6 * this.dense); i++) {
      const a = rng.range(0, TAU), v = rng.range(40, 120);
      p.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: 4, vz: rng.range(30, 90), life: rng.range(0.4, 0.7),
        tex: this.t.chunk[rng.int(0, 3)], tint: 0x9af0ff, alphaEnd: 0, drag: 2 });
    }
  }

  anchorBlast(x: number, y: number): void {
    const p = this.w.particles;
    for (let k = 0; k < 3; k++) p.emit({ x, y, life: 0.7 + k * 0.25, frames: this.t.shockwave, scale: 1.6 + k * 0.9, alpha: 1, alphaEnd: 0, add: true });
    p.emit({ x, y: y - 40, life: 1.4, frames: this.t.beam, scale: 1.8, alpha: 1, alphaEnd: 0, add: true, frameByLife: false });
    this.embers(x, y - 30, 40, 200);
  }

  /** Lightning from the sky (boss attacks and combos). */
  skyBolt(x: number, y: number): void {
    const p = this.w.particles;
    p.emit({ x, y: y - 56, life: 0.32, frames: assets.anim('fx', 'sky_bolt'), frameByLife: false, scale: 1, alpha: 1, alphaEnd: 0.2, add: true });
    p.emit({ x, y, life: 0.3, frames: this.t.explosion_volt, scale: 0.8, add: true });
    this.w.flashLight(x, y, 170, 1, 0xc0c8ff, 0.3);
    this.w.screenFlash(0xd0d8ff, 0.1);
  }

  /** Ambient spores/embers floating around the arena (atmosphere). */
  ambient(x: number, y: number, kind: 'a' | 'b' | 'c'): void {
    const tint = kind === 'a' ? 0xffb060 : kind === 'b' ? 0x8af0e0 : 0xc8a0ff;
    this.w.particles.emit({ x, y, vx: rng.range(-6, 6), vy: rng.range(-14, -4), life: rng.range(2.5, 4.5), frames: assets.anim('fx', 'spore'),
      frameByLife: false, alpha: 0.75, alphaEnd: 0, add: true, tint, scale: rng.range(0.8, 1.4) });
  }

  smoke(x: number, y: number, scale = 1): void {
    this.w.particles.emit({ x, y, life: 0.6, frames: this.t.smoke, scale, scaleEnd: scale * 1.5, alpha: 0.6, alphaEnd: 0, vy: -12, vx: rng.range(-8, 8) });
  }

  dust(x: number, y: number, n = 6, scale = 1): void {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU);
      this.w.particles.emit({ x: x + Math.cos(a) * 10 * scale, y: y + Math.sin(a) * 5 * scale, vx: Math.cos(a) * 50 * scale, vy: Math.sin(a) * 25 * scale,
        life: 0.5, frames: this.t.smoke, scale: 0.8 * scale, scaleEnd: 1.4 * scale, alpha: 0.5, alphaEnd: 0, drag: 4 });
    }
  }

  afterimage(tex: Texture, x: number, y: number, flip: boolean, tint = 0xffb060): void {
    // the particle uses a centred anchor; the hero sprite's foot sits at 90% of the frame height
    this.w.particles.emit({ x, y: y - tex.height * 0.4, life: 0.28, tex, alpha: 0.55, alphaEnd: 0, add: true, tint, scale: 1, flip });
  }
}
