import { Container, Sprite, Texture } from 'pixi.js';
import { assets, type AtlasName } from '../game/AssetLoader';
import { ENEMIES, BOSSES, type EnemyDef, type EnemyKind, type BossKind } from '../content/enemies';
import { dir8 } from '../utils/math';

export type { BossKind };

/** Animation sets resolved once per species (avoids name lookups in the loop). */
interface AnimSet {
  atlas: AtlasName;
  anims: Record<string, Texture[]>;
}
const cache = new Map<string, AnimSet>();

function resolveAnims(kind: EnemyKind | BossKind): AnimSet {
  const hit = cache.get(kind);
  if (hit) return hit;
  const src: Record<string, Texture[]> = {};
  let atlas: AtlasName;
  if (kind in BOSSES) {
    atlas = BOSSES[kind as BossKind].atlas;
    for (const [k, v] of Object.entries(assets.sheet(atlas).animations)) src[k] = v;
  } else {
    atlas = ENEMIES[kind as EnemyKind].atlas;
    const anims = assets.sheet(atlas).animations;
    const prefix = kind + '_';
    for (const [k, v] of Object.entries(anims)) {
      if (k.startsWith(prefix)) src[k.slice(prefix.length)] = v;
      if (kind === 'guard' && k.startsWith('guardb_')) src['b_' + k.slice(7)] = v;
    }
  }
  const set = { atlas, anims: src };
  cache.set(kind, set);
  return set;
}

let NEXT_ID = 1;

export class Enemy {
  id = NEXT_ID++;
  kind: EnemyKind | BossKind;
  def: EnemyDef;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** external impulse (knockback), decays fast. */
  kx = 0;
  ky = 0;
  radius: number;
  hp = 1;
  maxHp = 1;
  damage = 1;
  alive = true;
  dying = false;
  dieT = 0;
  state = 'move';
  stateT = 0;
  timer = 0;
  timer2 = 0;
  /** locked target/heading (charges, leaps). */
  tx = 0;
  ty = 0;
  ang = 0;
  /** height above ground (leaps, flight). */
  z = 0;
  flip = false;
  animName = 'walk';
  animT = 0;
  flashT = 0;
  burnT = 0;
  burnDps = 0;
  burnTick = 0;
  slowT = 0;
  slowAmt = 0;
  stunT = 0;
  /** last hits per source (per-target and per-ability damage cooldown). */
  hitAt: Record<string, number> = {};
  dmgAccum = 0;
  dmgAccumT = 0;
  armorPool = 0;
  phase = 1;
  elite = false;
  boss: BossKind | null = null;
  /** part of a composite boss (e.g. Wyrm segments): damage is forwarded to the owner */
  owner: Enemy | null = null;
  /** free-form data for specific AI. */
  mem: Record<string, number> = {};
  sprite: Sprite;
  flashSprite: Sprite;
  shadow: Sprite;
  anims: Record<string, Texture[]>;
  root: Container;

  constructor(kind: EnemyKind | BossKind, def: EnemyDef) {
    this.kind = kind;
    this.def = def;
    this.radius = def.radius;
    this.elite = !!def.elite;
    if (kind in BOSSES) this.boss = kind as BossKind;
    this.anims = resolveAnims(kind).anims;
    this.root = new Container();
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, def.anchorY);
    this.flashSprite = new Sprite(Texture.EMPTY);
    this.flashSprite.anchor.set(0.5, def.anchorY);
    this.flashSprite.visible = false;
    if (def.spriteScale) {
      this.sprite.scale.set(def.spriteScale);
      this.flashSprite.scale.set(def.spriteScale);
    }
    this.root.addChild(this.sprite, this.flashSprite);
    this.shadow = new Sprite(assets.tex('fx', def.shadow));
    this.shadow.anchor.set(0.5);
    this.shadow.alpha = 0.85;
  }

  /** Current frame name (with direction for 8-direction species). */
  private frames(name: string): Texture[] {
    if (this.def.view === 'top8') {
      const d = dir8(this.ang);
      return this.anims[`d${d}_${name}`] ?? this.anims[`d${d}_walk`] ?? this.anims[`d${d}_fly`];
    }
    return this.anims[name] ?? this.anims['walk'] ?? this.anims['idle'] ?? this.anims['float'];
  }

  private flashFrames(name: string): Texture[] | undefined {
    if (this.def.view === 'top8') {
      const d = dir8(this.ang);
      return this.anims[`d${d}_${name}_flash`] ?? this.anims[`d${d}_walk_flash`] ?? this.anims[`d${d}_fly_flash`];
    }
    return this.anims[`${name}_flash`];
  }

  setAnim(name: string, restart = false): void {
    if (this.animName !== name || restart) {
      this.animName = name;
      this.animT = 0;
    }
  }

  /** Updates frames and visual positions (called on render). */
  sync(fps = 10): void {
    const fr = this.frames(this.animName);
    if (!fr) return;
    const i = Math.floor(this.animT * fps) % fr.length;
    this.sprite.texture = fr[i];
    if (this.def.view === 'side') this.root.scale.x = this.flip ? -1 : 1;
    this.root.position.set(Math.round(this.x), Math.round(this.y - this.z));
    this.root.zIndex = this.y;
    this.shadow.position.set(Math.round(this.x), Math.round(this.y + (this.def.view === 'top8' ? 4 : 0)));
    const sz = 1 - Math.min(0.5, this.z / 140);
    this.shadow.scale.set(sz);
    if (this.flashT > 0 && this.boss) {
      this.flashSprite.visible = false;
      this.sprite.tint = 0xff9a9a;
      return;
    }
    if (this.flashT > 0) {
      const ff = this.flashFrames(this.animName);
      if (ff) {
        this.flashSprite.texture = ff[i % ff.length];
        this.flashSprite.visible = true;
        this.flashSprite.alpha = Math.min(1, this.flashT / 0.06);
      }
    } else this.flashSprite.visible = false;
    // burn: orange tint; slow: cyan tint
    this.sprite.tint = this.burnT > 0 ? 0xffc8a0 : this.slowT > 0 ? 0xb8e8ff : this.def.baseTint ?? 0xffffff;
  }

  /** Resets state for pool reuse (same species). */
  reset(): void {
    this.id = NEXT_ID++;
    this.vx = this.vy = this.kx = this.ky = 0;
    this.alive = true;
    this.dying = false;
    this.dieT = 0;
    this.state = 'move';
    this.stateT = 0;
    this.timer = this.timer2 = 0;
    this.z = 0;
    this.animT = 0;
    this.animName = 'walk';
    this.flashT = this.burnT = this.burnDps = this.burnTick = this.slowT = this.slowAmt = this.stunT = 0;
    this.hitAt = {};
    this.dmgAccum = this.dmgAccumT = 0;
    this.armorPool = 0;
    this.phase = 1;
    this.mem = {};
    this.root.visible = true;
    this.root.alpha = 1;
    this.root.rotation = 0;
    this.shadow.visible = true;
    this.sprite.tint = this.def.baseTint ?? 0xffffff;
  }

  /** Death frame (authored dissolve). Returns false when the animation has finished. */
  syncDeath(): boolean {
    const fr = this.anims['death'] ?? this.anims['batr_death'] ?? this.anims['heart_death'] ?? this.anims['wyrm_death'] ?? this.anims['col_death'];
    if (!fr) return false;
    const fps = this.boss ? 5 : 14;
    const i = Math.floor(this.dieT * fps);
    if (i >= fr.length) return false;
    this.sprite.texture = fr[i];
    this.flashSprite.visible = false;
    this.sprite.tint = this.def.baseTint ?? 0xffffff;
    this.root.position.set(Math.round(this.x), Math.round(this.y - this.z));
    this.shadow.alpha = 0.85 * (1 - i / fr.length);
    return true;
  }

  get bodyY(): number {
    return this.y - this.def.bodyY - this.z;
  }

  static createDef(kind: EnemyKind): EnemyDef {
    return ENEMIES[kind];
  }
}
