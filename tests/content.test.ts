import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { ACTS } from '../src/content/acts';
import { ENEMIES, BOSSES, BESTIARY, defOf } from '../src/content/enemies';
import { PROPS } from '../src/content/props';
import { CARDS } from '../src/content/upgrades';
import { META_ITEMS } from '../src/systems/Save';

const A = 'public/assets/';
const json = (p: string) => JSON.parse(readFileSync(A + p, 'utf8'));
const anims = (p: string): Record<string, string[]> => json(p).animations;

test('every atlas exists and points to real PNGs', () => {
  for (const p of ['characters/hero', 'enemies/enemies', 'enemies/elites', 'enemies/boss_frog', 'enemies/boss_heart', 'enemies/enemies2', 'enemies/boss_wyrm', 'enemies/boss_colossus', 'enemies/chars',
    'environment/tiles_a', 'environment/tiles_b', 'environment/tiles_c', 'environment/props', 'effects/fx']) {
    const j = json(p + '.json');
    assert.ok(existsSync(A + p.split('/')[0] + '/' + j.meta.image), p);
    assert.ok(Object.keys(j.frames).length > 0);
  }
});

test('every species has its own animations, flash and death', () => {
  const en = anims('enemies/enemies.json');
  for (const k of ['ferr', 'mord', 'vesp']) for (let d = 0; d < 8; d++) assert.ok(en[`${k}_d${d}_${k === 'vesp' ? 'fly' : 'walk'}`], `${k} d${d}`);
  for (const k of ['lodo', 'carap']) assert.ok(en[`${k}_walk`] && en[`${k}_attack`] && en[`${k}_walk_flash`]);
  for (const k of ['sapo_idle', 'sapo_crouch', 'sapo_leap', 'sapo_land', 'suss_float', 'suss_cast']) assert.ok(en[k], k);
  for (const k of ['ferr', 'mord', 'vesp', 'lodo', 'carap', 'sapo', 'suss']) assert.ok(en[`${k}_death`].length >= 4);
  const el = anims('enemies/elites.json');
  for (const k of ['guard_walk', 'guard_charge', 'guardb_walk', 'guardb_charge', 'sacer_float', 'sacer_cast', 'guard_death', 'sacer_death']) assert.ok(el[k], k);
  const fr = anims('enemies/boss_frog.json');
  for (const p of ['batr', 'batr2']) for (const s of ['idle', 'crouch', 'leap', 'land', 'spit']) assert.ok(fr[`${p}_${s}`], `${p}_${s}`);
  const ht = anims('enemies/boss_heart.json');
  for (const k of ['heart1_pulse', 'heart2_pulse', 'heart3_pulse', 'heart_death', 'tentacle_seg', 'tentacle_tip']) assert.ok(ht[k], k);
  const e2 = anims('enemies/enemies2.json');
  for (const k of ['wisp_float', 'wisp_fuse', 'hermit_walk', 'hermit_hide']) assert.ok(e2[k], k);
  const ch = anims('enemies/chars.json');
  for (const k of ['ferr', 'mord', 'lodo', 'golem', 'knight']) {
    for (let d = 0; d < 8; d++) for (const a of ['walk', 'attack']) assert.ok(ch[`${k}_d${d}_${a}`]?.length >= 4 && ch[`${k}_d${d}_${a}_flash`], `${k} d${d} ${a}`);
    assert.ok(ch[`${k}_death`].length >= 4, `${k} death`);
  }
  for (let d = 0; d < 8; d++) assert.ok(e2[`mite_d${d}_walk`], `mite d${d}`);
  for (const k of ['wisp', 'hermit', 'mite']) assert.ok(e2[`${k}_death`].length >= 4, k);
  const wy = anims('enemies/boss_wyrm.json');
  for (let d = 0; d < 8; d++) assert.ok(wy[`wyrm_head_d${d}`] && wy[`wyrm2_head_d${d}`] && wy[`wyrm_tail_d${d}`], `wyrm d${d}`);
  for (const k of ['wyrm_seg', 'wyrm2_seg', 'wyrm_mound', 'wyrm_death']) assert.ok(wy[k], k);
  const co = anims('enemies/boss_colossus.json');
  for (const p of ['col', 'col2']) for (const s of ['idle', 'raise', 'slam', 'roar']) assert.ok(co[`${p}_${s}`], `${p}_${s}`);
  assert.ok(co.col_death);
  assert.equal(Object.keys(ENEMIES).length, 14);
  assert.deepEqual(Object.keys(BOSSES).sort(), ['colossus', 'frog', 'heart', 'wyrm']);
});

test('bestiary: every entry has a portrait, a name and lore', () => {
  for (const k of BESTIARY) {
    assert.ok(existsSync(`${A}ui/bestiary/${k}.png`), k);
    const d = defOf(k);
    assert.ok(d.name.length > 3 && d.lore.length > 20, k);
  }
  for (const a of ['a', 'b', 'c']) assert.ok(existsSync(`${A}ui/act_${a}.png`), a);
});

test('hero: 3 views (4 directions with mirroring) and every state', () => {
  const h = anims('characters/hero.json');
  for (const d of ['down', 'up', 'side']) for (const s of ['idle', 'walk', 'shoot', 'dash', 'hurt']) assert.ok(h[`hero_${d}_${s}`], `${d} ${s}`);
  assert.ok(h.hero_down_death.length >= 5);
});

test('authored maps: dimensions, known props and valid objectives', () => {
  for (const act of ACTS) {
    const m = json(`maps/${act.map}.json`);
    assert.equal(m.rows.length, m.height);
    for (const r of m.rows) assert.equal(r.length, m.width);
    const solid = (x: number, y: number) => '#~'.includes(m.rows[y][x]);
    for (const k of ['start', 'anchor', 'portal', 'elite']) assert.ok(!solid(m[k][0], m[k][1]), `${act.map} ${k}`);
    const props = anims('environment/props.json');
    for (const p of m.props) {
      assert.ok(PROPS[p.type], `prop without definition: ${p.type}`);
      assert.ok(props[p.type], `prop without art: ${p.type}`);
    }
    assert.ok(m.spawns.length >= 6);
  }
});

test('wave script only references existing creatures and ends in victory', () => {
  for (const act of ACTS) {
    for (const s of act.steps) for (const w of s.waves) for (const k of Object.keys(w.kinds)) assert.ok(k in ENEMIES, k);
  }
  assert.equal(ACTS.length, 1);
  assert.equal(ACTS.at(-1)!.steps.at(-1)!.type, 'victory');
  for (const k of BESTIARY) if (k in ENEMIES && !ENEMIES[k as keyof typeof ENEMIES].elite)
    assert.ok(ACTS.some((a) => a.steps.some((s) => s.waves.some((w) => k in w.kinds))), `${k} never spawns`);
  assert.ok(ACTS.some((a) => a.steps.some((s) => s.elite === 'knight')));
});

test('card and relic icons and audio files exist', () => {
  for (const c of CARDS) assert.ok(existsSync(`${A}ui/icons/${c.icon}.png`), c.icon);
  for (const m of META_ITEMS) assert.ok(existsSync(`${A}ui/icons/${m.icon}.png`), m.icon);
  const au = json('audio/audio.json');
  for (const s of au.sfx) assert.ok(existsSync(`${A}audio/sfx_${s}.mp3`), s);
  for (const m of Object.keys(au.music)) assert.ok(existsSync(`${A}audio/mus_${m}.mp3`), m);
  assert.ok(au.sfx.length >= 14);
});

test('no Canvas 2D usage in game code', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
  for (const f of walk('src').filter((f) => f.endsWith('.ts'))) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/getContext\(\s*['"]2d['"]|CanvasRenderingContext2D|fillRect|\.arc\(/.test(s), f);
  }
});

test('all player-facing text is English (no Portuguese diacritics in src)', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : [`${d}/${f}`]));
  for (const f of walk('src')) assert.ok(!/[ãõçáéíóúâêôÃÕÇÁÉÍÓÚÂÊÔ]/.test(readFileSync(f, 'utf8')), f);
});
