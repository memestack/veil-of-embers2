/**
 * Creature data. Behaviours live in src/entities/behaviors.ts and src/entities/bosses*.ts;
 * this file only holds numbers, names, lore and art references (animation names in the atlases).
 */
export type EnemyKind =
  | 'ferr' | 'mord' | 'lodo' | 'vesp' | 'carap' | 'sapo' | 'suss'
  | 'wisp' | 'hermit' | 'golem' | 'mite'
  | 'guard' | 'sacer' | 'knight';

export type BossKind = 'frog' | 'heart' | 'wyrm' | 'colossus';

export interface EnemyDef {
  kind: EnemyKind | BossKind;
  name: string;
  /** one-line bestiary entry */
  lore: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  /** relative mass: reduces knockback and separation */
  mass: number;
  /** flat damage reduction per hit */
  armor: number;
  /** body centre height above the feet (px), used for hits and numbers */
  bodyY: number;
  view: 'top8' | 'side';
  anchorY: number;
  shadow: 'shadow_s' | 'shadow_m' | 'shadow_l' | 'shadow_xl';
  /** colour of death fragments and particles */
  tint: number;
  atlas: 'enemies' | 'elites' | 'enemies2' | 'chars' | 'boss_frog' | 'boss_heart' | 'boss_wyrm' | 'boss_colossus';
  flying?: boolean;
  elite?: boolean;
  /** chance of dropping a medium crystal instead of a small one */
  bigGem?: number;
  /** sprite scale (same art reused bigger, e.g. elite versions) */
  spriteScale?: number;
  /** permanent tint of the sprite */
  baseTint?: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  ferr: { kind: 'ferr', name: 'Bone Thrall', lore: 'A rattling skeleton with a notched sword. Weak alone, deadly in a tide.', hp: 9, speed: 62, damage: 6, xp: 1, radius: 7, mass: 0.6, armor: 0, bodyY: 15,
    view: 'top8', anchorY: 0.9, shadow: 'shadow_s', tint: 0xf0e2c0, atlas: 'chars' },
  mord: { kind: 'mord', name: 'Cave Goblin', lore: 'Swings a heavy club and circles wide to strike from the flank.', hp: 15, speed: 52, damage: 8, xp: 1, radius: 8, mass: 0.8, armor: 0, bodyY: 13,
    view: 'top8', anchorY: 0.9, shadow: 'shadow_m', tint: 0x9ad040, atlas: 'chars', bigGem: 0.15 },
  lodo: { kind: 'lodo', name: 'Green Slime', lore: 'Slow and heavy. It wobbles forward and swallows whatever it touches.', hp: 42, speed: 28, damage: 12, xp: 3, radius: 10, mass: 2.2, armor: 0, bodyY: 9,
    view: 'top8', anchorY: 0.9, shadow: 'shadow_l', tint: 0x7ad040, atlas: 'chars', bigGem: 1 },
  vesp: { kind: 'vesp', name: 'Glass Wasp', lore: 'Hovers out of reach, marks a line, then dives along it.', hp: 13, speed: 72, damage: 10, xp: 2, radius: 7, mass: 0.5, armor: 0, bodyY: 14,
    view: 'top8', anchorY: 0.5, shadow: 'shadow_s', tint: 0x6ae6ff, atlas: 'enemies', flying: true, bigGem: 0.3 },
  carap: { kind: 'carap', name: 'Crimson Carapace', lore: 'Armoured soldier. Telegraphs a straight charge, then barrels through.', hp: 80, speed: 30, damage: 16, xp: 4, radius: 13, mass: 4, armor: 3, bodyY: 14,
    view: 'side', anchorY: 0.88, shadow: 'shadow_l', tint: 0xc0302a, atlas: 'enemies', bigGem: 1 },
  sapo: { kind: 'sapo', name: 'Rift Toad', lore: 'Crouches, then leaps in an arc. Its landing shakes the ground.', hp: 32, speed: 0, damage: 12, xp: 3, radius: 11, mass: 1.6, armor: 0, bodyY: 10,
    view: 'side', anchorY: 0.88, shadow: 'shadow_l', tint: 0x3fb8a8, atlas: 'enemies', bigGem: 1 },
  suss: { kind: 'suss', name: 'Whisperer', lore: 'Small wraith that keeps its distance and casts slow soul orbs.', hp: 20, speed: 42, damage: 9, xp: 2, radius: 8, mass: 0.7, armor: 0, bodyY: 14,
    view: 'side', anchorY: 0.8, shadow: 'shadow_m', tint: 0x8aa8ff, atlas: 'enemies', bigGem: 0.5 },
  wisp: { kind: 'wisp', name: 'Ember Wisp', lore: 'A giggling spark. It rushes close, swells and bursts. Kill it at range.', hp: 12, speed: 82, damage: 18, xp: 2, radius: 7, mass: 0.4, armor: 0, bodyY: 14,
    view: 'side', anchorY: 0.7, shadow: 'shadow_s', tint: 0xffa040, atlas: 'enemies2', flying: true, bigGem: 0.4 },
  hermit: { kind: 'hermit', name: 'Coral Hermit', lore: 'Hides in its spiked shell when struck hard. Wait for it to peek out.', hp: 60, speed: 34, damage: 12, xp: 3, radius: 12, mass: 2.5, armor: 1, bodyY: 10,
    view: 'side', anchorY: 0.82, shadow: 'shadow_l', tint: 0xe0604a, atlas: 'enemies2', bigGem: 1 },
  golem: { kind: 'golem', name: 'Moss Golem', lore: 'A mossy stone giant. Its slam is marked on the floor before it lands.', hp: 140, speed: 24, damage: 20, xp: 6, radius: 15, mass: 6, armor: 2, bodyY: 20,
    view: 'top8', anchorY: 0.9, shadow: 'shadow_l', tint: 0xb8b8b0, atlas: 'chars', bigGem: 1 },
  mite: { kind: 'mite', name: 'Shard Mite', lore: 'A splinter of golem that scuttles on its own. Fast and fragile.', hp: 6, speed: 78, damage: 5, xp: 1, radius: 5, mass: 0.3, armor: 0, bodyY: 0,
    view: 'top8', anchorY: 0.5, shadow: 'shadow_s', tint: 0x9af0ff, atlas: 'enemies2' },
  guard: { kind: 'guard', name: 'Coral Warden', lore: 'Elite. Breakable armour plates; sprays a cone of coral spikes.', hp: 1500, speed: 30, damage: 20, xp: 40, radius: 22, mass: 12, armor: 0, bodyY: 18,
    view: 'side', anchorY: 0.82, shadow: 'shadow_xl', tint: 0xe05a48, atlas: 'elites', elite: true },
  sacer: { kind: 'sacer', name: 'Glass Priestess', lore: 'Elite. Summons swarms through rune circles and erupts the ground beneath you.', hp: 1300, speed: 38, damage: 14, xp: 40, radius: 16, mass: 10, armor: 0, bodyY: 26,
    view: 'side', anchorY: 0.9, shadow: 'shadow_l', tint: 0x8af0ff, atlas: 'elites', elite: true, flying: true },
  knight: { kind: 'knight', name: 'Golem Warlord', lore: 'Elite. An ancient golem burning from within. Sweeps a wide arc and leaves fire on the floor.', hp: 1700, speed: 40, damage: 22, xp: 45, radius: 22, mass: 9, armor: 2, bodyY: 32,
    view: 'top8', anchorY: 0.9, shadow: 'shadow_xl', tint: 0xff7a3a, atlas: 'chars', elite: true, spriteScale: 1.6, baseTint: 0xffb89a },
};

/** Coral Warden breakable armour: absorbs this much at 55% reduction before breaking */
export const GUARD_ARMOR_POOL = 320;

/** Bosses: base numbers (multiplied by the act's difficulty) */
export const BOSSES: Record<BossKind, EnemyDef> = {
  wyrm: { kind: 'wyrm', name: 'The Ash Wyrm', lore: 'Boss. A burrowing serpent of cinders. Watch the mounds: one of them is real.', hp: 3000, speed: 0, damage: 20, xp: 70, radius: 16, mass: 999, armor: 0, bodyY: 10,
    view: 'side', anchorY: 0.5, shadow: 'shadow_xl', tint: 0xff7a3a, atlas: 'boss_wyrm', elite: true },
  frog: { kind: 'frog', name: 'The Colossal Batrach', lore: 'Boss. Its shadow marks where it will land. Furious at half health.', hp: 4200, speed: 0, damage: 22, xp: 80, radius: 34, mass: 99, armor: 0, bodyY: 40,
    view: 'side', anchorY: 0.93, shadow: 'shadow_xl', tint: 0x3fb8a8, atlas: 'boss_frog', elite: true },
  colossus: { kind: 'colossus', name: 'The Glass Colossus', lore: 'Boss. Slams the floor and calls down crystal rain. Its core cracks red when enraged.', hp: 4600, speed: 18, damage: 22, xp: 80, radius: 30, mass: 999, armor: 0, bodyY: 60,
    view: 'side', anchorY: 0.95, shadow: 'shadow_xl', tint: 0x6ae0f0, atlas: 'boss_colossus', elite: true },
  heart: { kind: 'heart', name: 'The Heart of the Veil', lore: 'Final boss. Three phases of crystal arcs, coral roots and pulsing rings. Every pattern has a gap.', hp: 4800, speed: 0, damage: 20, xp: 0, radius: 40, mass: 999, armor: 0, bodyY: 52,
    view: 'side', anchorY: 0.85, shadow: 'shadow_xl', tint: 0xff5a8a, atlas: 'boss_heart', elite: true },
};

/** Bestiary order */
export const BESTIARY: (EnemyKind | BossKind)[] = ['ferr', 'mord', 'lodo', 'golem', 'knight'];

export const defOf = (k: EnemyKind | BossKind): EnemyDef => (k in ENEMIES ? ENEMIES[k as EnemyKind] : BOSSES[k as BossKind]);
