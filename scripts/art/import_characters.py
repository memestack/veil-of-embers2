"""Imports the hand-made character sheets in art_src/character_assets into game atlases.

  python3 scripts/art/import_characters.py

- Each frame is re-centred (centroid of the lower body) and foot-aligned, because the source
  frames drift inside their cells.
- Frames are resampled to 2x the logical in-game size and written with meta.scale = "2".
- Generates hit-flash silhouettes and, for monsters, a dissolve death animation.
"""
import json, os
import numpy as np
from PIL import Image

SRC = 'art_src/character_assets'
OUT = 'public/assets'
RES = 2          # texture resolution (pixels per logical pixel)
FOOT = 0.9       # foot line as a fraction of the frame height (sprite anchorY)

# kind in game -> (source folder, logical height in px)
MONSTERS = {
    'ferr': ('skeleton', 30),
    'mord': ('goblin', 26),
    'lodo': ('slime', 22),
    'golem': ('golem', 40),
    'knight': ('golem', 40),   # elite: same art, scaled and tinted in code
}
HERO = ('ranger', 40)

def load(char, anim):
    d = os.path.join(SRC, char, anim)
    if not os.path.isdir(d): return None
    fs = sorted(f for f in os.listdir(d) if f.startswith('frame_'))
    return [Image.open(os.path.join(d, f)).convert('RGBA') for f in fs]

def anchor_of(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a > 40)
    if not len(ys): return im.width / 2, im.height, 0
    bottom, top = ys.max(), ys.min()
    h = bottom - top + 1
    m = ys >= bottom - 0.45 * h
    return float(xs[m].mean()), float(bottom), h

def normalise(frames_by_anim, logical_h):
    """Re-centre all frames of one character on a shared canvas and resample."""
    infos, ref = {}, []
    for an, frs in frames_by_anim.items():
        infos[an] = [anchor_of(f) for f in frs]
        if an.startswith('walk_down'): ref += [i[2] for i in infos[an]]
    ref_h = float(np.median(ref)) if ref else 100.0
    k = logical_h * RES / ref_h
    L = R = U = 1
    for an, frs in frames_by_anim.items():
        for f, (cx, fy, _) in zip(frs, infos[an]):
            bb = f.getbbox() or (0, 0, 1, 1)
            L = max(L, cx - bb[0]); R = max(R, bb[2] - cx); U = max(U, fy - bb[1])
    half = int(np.ceil(max(L, R) * k)) + 2
    W = 2 * half
    W += W % 2
    H = int(np.ceil(U * k / FOOT)) + 2
    H += (H % 2)
    out = {}
    for an, frs in frames_by_anim.items():
        res = []
        for f, (cx, fy, _) in zip(frs, infos[an]):
            sm = f.convert('RGBa').resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS).convert('RGBA')
            c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            c.alpha_composite(sm, (round(W / 2 - cx * k), round(H * FOOT - fy * k)))
            res.append(c)
        out[an] = res
    return out

def flash(im):
    a = np.array(im)
    w = np.zeros_like(a); w[:, :, :3] = 255; w[:, :, 3] = a[:, :, 3]
    return Image.fromarray(w)

def dissolve(im, n=6, seed=7):
    rng = np.random.default_rng(seed)
    a = np.array(im).astype(np.float32)
    noise = rng.random(a.shape[:2])
    res = []
    for i in range(n):
        t = i / n
        b = a.copy()
        b[:, :, :3] = b[:, :, :3] * (1 - 0.5 * t) + np.array([255, 120, 50]) * 0.5 * t
        b[:, :, 3] *= (noise > t * 1.05).astype(np.float32) * (1 - 0.35 * t)
        res.append(Image.fromarray(b.clip(0, 255).astype(np.uint8)))
    return res

def pack(named, pad=2, maxw=4096):
    items = sorted(named.items(), key=lambda t: -t[1].height)
    x = y = pad; rowh = W = 0; pos = {}
    for n, im in items:
        if x + im.width + pad > maxw: x = pad; y += rowh + pad; rowh = 0
        pos[n] = (x, y); x += im.width + pad; rowh = max(rowh, im.height); W = max(W, x)
    sheet = Image.new('RGBA', (W, y + rowh + pad), (0, 0, 0, 0))
    for n, im in items: sheet.alpha_composite(im, pos[n])
    return sheet, pos

def write_atlas(path, frames, anims):
    """frames: name -> Image (unique textures); anims: anim -> [frame names]"""
    sheet, pos = pack(frames)
    base = os.path.basename(path)
    sheet.save(os.path.join(OUT, path + '.png'))
    js = {'frames': {}, 'animations': anims,
          'meta': {'image': base + '.png', 'format': 'RGBA8888', 'size': {'w': sheet.width, 'h': sheet.height}, 'scale': str(RES)}}
    for n, im in frames.items():
        x, y = pos[n]
        js['frames'][n] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}, 'rotated': False, 'trimmed': False,
                           'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height}, 'sourceSize': {'w': im.width, 'h': im.height}}
    json.dump(js, open(os.path.join(OUT, path + '.json'), 'w'))
    return sheet.size

def add(frames, anims, name, imgs):
    names = []
    for i, im in enumerate(imgs):
        fn = f'{name}_{i}'; frames[fn] = im; names.append(fn)
    anims[name] = names
    return names

def alias(anims, name, names):
    anims[name] = list(names)

def build_hero():
    char, lh = HERO
    src = {a: load(char, a) for a in os.listdir(os.path.join(SRC, char)) if os.path.isdir(os.path.join(SRC, char, a))}
    n = normalise(src, lh)
    frames, anims = {}, {}
    views = {'down': 'down', 'up': 'up', 'side': 'right'}
    for v, d in views.items():
        walk = add(frames, anims, f'hero_{v}_walk', n[f'walk_{d}'])
        alias(anims, f'hero_{v}_idle', [walk[0], walk[0], walk[3], walk[3]])
        alias(anims, f'hero_{v}_dash', walk[1:4])
        add(frames, anims, f'hero_{v}_shoot', n[f'attack_{d}'])
    hurt = add(frames, anims, 'hero_down_hurt', n['hurt'][:3])
    add(frames, anims, 'hero_down_hurt_flash', [flash(f) for f in n['hurt'][:3]])
    for v in ('up', 'side'):
        alias(anims, f'hero_{v}_hurt', hurt)
        alias(anims, f'hero_{v}_hurt_flash', anims['hero_down_hurt_flash'])
    add(frames, anims, 'hero_down_death', n['death'])
    return write_atlas('characters/hero', frames, anims), n

DIRS = {0: 'right', 1: 'right', 2: 'down', 3: 'left', 4: 'left', 5: 'left', 6: 'up', 7: 'right'}

def build_monsters():
    frames, anims, portraits = {}, {}, {}
    cache = {}
    for kind, (char, lh) in MONSTERS.items():
        if char not in cache:
            src = {a: load(char, a) for a in os.listdir(os.path.join(SRC, char)) if os.path.isdir(os.path.join(SRC, char, a))}
            n = normalise(src, lh)
            u = {}
            for d in ('right', 'left', 'up', 'down'):
                for a in ('walk', 'attack'):
                    u[f'{a}_{d}'] = add(frames, anims, f'{char}__{a}_{d}', n[f'{a}_{d}'])
                    u[f'{a}_{d}_flash'] = add(frames, anims, f'{char}__{a}_{d}_flash', [flash(f) for f in n[f'{a}_{d}']])
            u['death'] = add(frames, anims, f'{char}__death', dissolve(n['walk_down'][0]))
            cache[char] = u
            portraits[char] = n['walk_down'][0]
        u = cache[char]
        for d, nm in DIRS.items():
            for a in ('walk', 'attack'):
                alias(anims, f'{kind}_d{d}_{a}', u[f'{a}_{nm}'])
                alias(anims, f'{kind}_d{d}_{a}_flash', u[f'{a}_{nm}_flash'])
            alias(anims, f'{kind}_d{d}_windup', u[f'attack_{nm}'][:2])
            alias(anims, f'{kind}_d{d}_swing', u[f'attack_{nm}'][2:])
            alias(anims, f'{kind}_d{d}_windup_flash', u[f'attack_{nm}_flash'][:2])
            alias(anims, f'{kind}_d{d}_swing_flash', u[f'attack_{nm}_flash'][2:])
        alias(anims, f'{kind}_death', u['death'])
    for k in [a for a in anims if '__' in a]: del anims[k]
    size = write_atlas('enemies/chars', frames, anims)
    os.makedirs(os.path.join(OUT, 'ui/bestiary'), exist_ok=True)
    for kind, (char, _) in MONSTERS.items():
        im = portraits[char]
        bb = im.getbbox(); im = im.crop(bb)
        s = 60 / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        c = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); c.alpha_composite(im, ((64 - im.width) // 2, (64 - im.height) // 2))
        c.save(os.path.join(OUT, f'ui/bestiary/{kind}.png'))
    return size

if __name__ == '__main__':
    print('hero', build_hero()[0])
    print('chars', build_monsters())
