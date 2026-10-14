/**
 * Authored campaign script: three acts, each a sequence of steps (objectives) with a wave table
 * giving time, composition, formation and gates. The Director only executes this table; the only
 * variation allowed is the exact position inside a gate.
 */
import type { EnemyKind, BossKind } from './enemies';

export type Formation = 'cluster' | 'arc' | 'line' | 'ring';

export interface WaveEntry {
  /** seconds since the step started (or since the cycle started, for looping steps) */
  at: number;
  /** if set, the entry is a continuous stream from `at` to `until` */
  until?: number;
  every?: number;
  kinds: Partial<Record<EnemyKind, number>>;
  count: number;
  formation?: Formation;
  /** spawn-zone indices of the map (empty = any zone off screen) */
  gates?: number[];
  label?: string;
}

export type StepType = 'survive' | 'reach' | 'channel' | 'elite' | 'boss' | 'portal' | 'victory';

export interface Step {
  type: StepType;
  text: string;
  hint?: string;
  duration?: number;
  /** repeats the wave table every N seconds (steps without a fixed duration) */
  loop?: number;
  waves: WaveEntry[];
  elite?: EnemyKind;
  boss?: BossKind;
}

export interface ActDef {
  id: number;
  roman: string;
  title: string;
  subtitle: string;
  map: 'arena_a' | 'arena_b' | 'arena_c';
  /** ambient light (multiplied over the arena); light sources open brighter pools */
  tint: number;
  hpMul: number;
  dmgMul: number;
  steps: Step[];
}

const S = (at: number, until: number, every: number, kinds: WaveEntry['kinds'], count: number, formation: Formation = 'cluster', gates?: number[]): WaveEntry =>
  ({ at, until, every, kinds, count, formation, gates });
const B = (at: number, kinds: WaveEntry['kinds'], count: number, formation: Formation = 'cluster', gates?: number[], label?: string): WaveEntry =>
  ({ at, kinds, count, formation, gates, label });

export const ACTS: ActDef[] = [
  {
    id: 0, roman: 'I', title: 'The Ash Garden', subtitle: 'The dead walk where the Anchor sleeps.',
    map: 'arena_a', tint: 0x64667c, hpMul: 1, dmgMul: 1,
    steps: [
      { type: 'survive', duration: 170, text: 'Survive the tide', hint: 'WASD to move · your arrows fire on their own · Space: dash',
        waves: [
          S(1, 28, 1.7, { ferr: 1 }, 3),
          B(14, { ferr: 1 }, 8, 'arc', undefined, 'Bones rattle'),
          B(22, { mord: 1 }, 5, 'arc', undefined, 'Goblins!'),
          S(28, 58, 1.25, { ferr: 3, mord: 1 }, 4),
          B(40, { lodo: 1 }, 3, 'cluster', undefined, 'Slimes'),
          S(58, 86, 0.95, { ferr: 4, mord: 2, lodo: 0.5 }, 5),
          B(70, { ferr: 1 }, 26, 'ring', undefined, 'Skeleton siege'),
          S(86, 130, 0.75, { ferr: 5, mord: 3, lodo: 0.6, golem: 0.15 }, 6),
          B(96, { golem: 1 }, 2, 'line', undefined, 'Moss golems'),
          B(110, { mord: 1 }, 10, 'arc'),
          B(120, { lodo: 1, mord: 1 }, 10, 'arc'),
          S(130, 170, 0.6, { ferr: 6, mord: 3, lodo: 0.8, golem: 0.25 }, 6),
          B(145, { ferr: 1, mord: 1 }, 34, 'ring', undefined, 'The tide rises'),
        ] },
      { type: 'reach', text: 'Follow the ember to the Anchor', hint: 'The golden arrow points the way', loop: 6,
        waves: [S(0, 6, 1.4, { ferr: 3, mord: 1 }, 4)] },
      { type: 'channel', duration: 16, text: 'Rekindle the Anchor', hint: 'Stay inside the circle of light · Q: Crown Pulse',
        waves: [
          S(0, 16, 0.55, { ferr: 4, mord: 2 }, 5),
          B(2.5, { lodo: 1 }, 4, 'arc'),
          B(6, { ferr: 1 }, 22, 'ring', undefined, 'The tide answers'),
          B(11, { golem: 1 }, 2, 'cluster'),
        ] },
      { type: 'elite', elite: 'knight', text: 'Defeat the Golem Warlord', hint: 'Dodge its wide sweep · don\'t stand in the fire', loop: 9,
        waves: [S(0, 9, 2.4, { ferr: 2, mord: 1 }, 3)] },
      { type: 'victory', text: 'The Anchor burns again', waves: [] },
    ],
  },
];
