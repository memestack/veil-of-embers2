import { Assets, Spritesheet, Texture, TextureStyle } from 'pixi.js';

/** Asset base path (works with Vite dev/build and when served from subfolders). */
export const BASE_URL: string = (() => {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  return env?.BASE_URL ?? './';
})();
export const asset = (p: string): string => `${BASE_URL}assets/${p}`;

const ATLASES = {
  hero: 'characters/hero.json',
  enemies: 'enemies/enemies.json',
  elites: 'enemies/elites.json',
  enemies2: 'enemies/enemies2.json',
  chars: 'enemies/chars.json',
  boss_wyrm: 'enemies/boss_wyrm.json',
  boss_colossus: 'enemies/boss_colossus.json',
  boss_frog: 'enemies/boss_frog.json',
  boss_heart: 'enemies/boss_heart.json',
  tiles_a: 'environment/tiles_a.json',
  tiles_b: 'environment/tiles_b.json',
  tiles_c: 'environment/tiles_c.json',
  props: 'environment/props.json',
  fx: 'effects/fx.json',
} as const;

export type AtlasName = keyof typeof ATLASES;

export interface MapData {
  name: string;
  tileset: 'a' | 'b' | 'c';
  tileSize: number;
  width: number;
  height: number;
  rows: string[];
  start: [number, number];
  anchor: [number, number];
  portal: [number, number];
  elite: [number, number];
  boss: [number, number] | null;
  props: { type: string; x: number; y: number }[];
  spawns: [number, number, number, number][];
}

/** Central registry: resolves paths, reports progress and records failures. */
export class AssetLoader {
  readonly sheets: Partial<Record<AtlasName, Spritesheet>> = {};
  readonly maps: Record<string, MapData> = {};
  readonly audio: Record<string, ArrayBuffer> = {};
  audioManifest: { sfx: string[]; music: Record<string, number> } = { sfx: [], music: {} };
  readonly failures: string[] = [];

  async load(onProgress: (p: number, label: string) => void): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    const names = Object.keys(ATLASES) as AtlasName[];
    const mapNames = ['arena_a', 'arena_b', 'arena_c'];
    let manifest: { sfx: string[]; music: Record<string, number> } = { sfx: [], music: {} };
    try {
      manifest = await (await fetch(asset('audio/audio.json'))).json();
    } catch {
      this.failures.push('audio/audio.json');
    }
    this.audioManifest = manifest;
    const audioFiles = [...manifest.sfx.map((s) => `sfx_${s}`), ...Object.keys(manifest.music).map((m) => `mus_${m}`)];
    const total = names.length + mapNames.length + audioFiles.length;
    let done = 0;
    const tick = (label: string) => onProgress(++done / total, label);

    await Promise.all(
      names.map(async (n) => {
        try {
          const sheet = (await Assets.load(asset(ATLASES[n]))) as Spritesheet;
          // hand-made high-resolution characters are downsampled on screen: smooth filtering keeps them clean
          const mode = n === 'hero' || n === 'chars' ? 'linear' : 'nearest';
          for (const tex of Object.values(sheet.textures)) tex.source.scaleMode = mode;
          this.sheets[n] = sheet;
        } catch (e) {
          console.error('Failed to load atlas', n, e);
          this.failures.push(ATLASES[n]);
        }
        tick(`art: ${n}`);
      }),
    );
    await Promise.all(
      mapNames.map(async (m) => {
        try {
          this.maps[m] = (await (await fetch(asset(`maps/${m}.json`))).json()) as MapData;
        } catch (e) {
          console.error('Failed to load map', m, e);
          this.failures.push(`maps/${m}.json`);
        }
        tick(`map: ${m}`);
      }),
    );
    // audio: fetch bytes now; decode once the AudioContext exists
    let i = 0;
    const queue = [...audioFiles];
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift()!;
        try {
          const r = await fetch(asset(`audio/${f}.mp3`));
          if (!r.ok) throw new Error(String(r.status));
          this.audio[f] = await r.arrayBuffer();
        } catch {
          this.failures.push(`audio/${f}.mp3`);
        }
        i++;
        tick(`sound: ${f}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  sheet(n: AtlasName): Spritesheet {
    const s = this.sheets[n];
    if (!s) throw new Error(`Missing atlas: ${n}`);
    return s;
  }

  /** Frames of an animation; throws a descriptive error if the name does not exist (avoids silent invisible sprites). */
  anim(atlas: AtlasName, name: string): Texture[] {
    const a = this.sheet(atlas).animations[name];
    if (!a) throw new Error(`Missing animation: ${atlas}/${name}`);
    return a;
  }

  tex(atlas: AtlasName, name: string): Texture {
    return this.anim(atlas, name)[0];
  }

  has(atlas: AtlasName, name: string): boolean {
    return !!this.sheets[atlas]?.animations[name];
  }
}

export const assets = new AssetLoader();
