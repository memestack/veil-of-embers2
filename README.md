# Veil of Embers — art test build

> **Test branch of the game:** only Act I, with the new hand-made ranger heroine and the new monsters
> (Bone Thrall skeleton, Cave Goblin, Green Slime, Moss Golem and the Golem Warlord elite). Same mechanics.
> Source art lives in `art_src/character_assets`; `python3 scripts/art/import_characters.py` rebuilds the atlases.

A dark, bioluminescent fantasy 2D top-down *survivor-like*. A rune archer wielding the **Ember Crown** — a ring of
flames and runes that spins around her — must rekindle the three Anchors of the Veil while tides of crystal
creatures close in from every side. A ~15–20 minute campaign in three acts with elites, four bosses and card-based
progression.

Built with **PixiJS 8 (WebGL) + TypeScript (strict) + Vite**. No game rendering uses the Canvas 2D API: world,
characters, effects and damage numbers are textured sprites from the project's own atlases.

## Requirements and commands

- Node.js 18+ and npm.

```bash
npm install
npm run dev        # opens http://localhost:5173
npm run build      # type check (tsc) + production build into dist/
npm run preview    # serves the build
npm test           # logic and content-integrity tests (node:test)
npm run assets     # (optional) regenerates art and audio — needs Python 3.10+, Pillow, NumPy, SciPy and FFmpeg
```

Assets are already built in `public/assets/`; `npm run assets` is only needed to change art or sound.
The build uses relative paths, so `dist/` can be served from any subfolder.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD or arrows | drag on the left side of the screen |
| Shoot | automatic (nearest enemy) · optional manual mouse aim in Settings | automatic |
| Dash (brief invulnerability) | Space | DASH button |
| Crown Pulse | Q | Q button |
| Choose card | 1, 2, 3 or click | tap the card |
| Reroll cards (relic) | R or button | button |
| Pause | Esc (auto-pause on focus loss) | II button |
| Mute | M | — |
| Debug panel (FPS, entities, particles) | F3 | — |

## Screens

Loading · Main menu · **Campaign Map** (act select with art, unlocked as you reach each act; starting at a later act
grants catch-up levels and bonus cards) · **Bestiary** (18 entries with portraits, lore and stats; unknown creatures
show as silhouettes until met) · **Records** (runs, wins, defeats, best time, total kills, bosses slain…) ·
Reliquary · How to Play · Settings · Credits · Pause · Card choice · Act transition (with act art) · Victory / Defeat.
In-game toasts announce new bestiary entries.

## Campaign

1. **Act I — The Ash Garden:** survive the tide (built-in tutorial), follow the ember to the Anchor, channel it
   while the horde answers, defeat the **Coral Warden** (breakable armour, spike cone) and then the
   **Ash Wyrm** — a burrowing segmented serpent that breathes a telegraphed fire cone, dives and resurfaces under
   one of three marked mounds (only one is real), and calls sky lightning when enraged.
2. **Act II — The Glass Wood:** wasps, toads, ember wisps, glass golems and the **Glass Priestess** (summons
   minions, marks eruption zones); the second Anchor lies behind the crystal formations; boss **Colossal Batrach**
   (leap with target shadow, shockwave, mud fan, summons, enrage at 50%).
3. **Act III — The Sunken Sanctum:** the densest hordes, an **Ash Knight** elite joining the tide, the
   **Glass Colossus** (marked fist slams with shard bursts, crystal rain, summons golems; red core when enraged),
   the last Anchor on the altar and the **Heart of the Veil** in three phases (crystal arcs with gaps, spirals,
   telegraphed coral roots, pulsing rings).

Win or fall, the results screen shows time, kills, damage, level, acts and cards. The game saves a return point at
the start of each act (**Continue** in the menu).

## Creatures

- **Common (11):** Rustling (swarm beetle), Glowbiter (flanking spider), Mire Child (heavy), Glass Wasp (telegraphed
  dive), Crimson Carapace (armoured charge), Rift Toad (arcing leap), Whisperer (ranged soul orbs), **Ember Wisp**
  (rushes in, swells and bursts — kill it at range), **Coral Hermit** (hides in its shell when hit hard),
  **Glass Golem** (floor-marked slam, shatters into mites), **Shard Mite**.
- **Elites (3):** Coral Warden, Glass Priestess, **Ash Knight** (wind-up cone sweep that leaves burning ground;
  every third attack is a line dash with a fire trail).
- **Bosses (4):** **Ash Wyrm**, Colossal Batrach, **Glass Colossus**, Heart of the Veil.

## Mechanics

- **Weapons (6):** Rune Arrow (automatic; fan and pierce via cards), Ember Crown (orbiting burn damage + Q Pulse that
  expands, pushes and ignites), Solar Lance (pierces a whole row), Storm Chain (visible chain lightning), Crystal
  Lotus (arcing seed that bursts into slowing shards) and Cinder Wind (crescent gust that pushes light creatures).
- **Legendary combos:** Blazing Tornado (Crown + Wind: fire tornadoes), Thunder Shard (Chain + Lotus: every
  electrocuted target fires a shard), Circular Dawn (Lance + Crown: the Pulse fires radial lances), plus Solar
  Archer (incendiary arrows and a fan every 4th shot).
- **Cards (20):** Jade, Amethyst and Solar Gold rarities with data-driven weights and conditions; never repeat nor
  offer a maxed card; the first pick always includes a new weapon. Elite chests guarantee a high rarity.
- **Data-driven combat:** health, damage, armour, breakable armour, burn, slow, stun, mass-based knockback,
  per-target and per-source damage cooldowns, lifesteal capped per second, hitstop, grouped damage numbers.
- **Effects:** half-resolution lighting veil (dark ambient + additive light pools from the heroine, lanterns,
  Anchors, bosses and transient flashes from explosions and lightning), fire rings, burning ground, sky bolts,
  falling crystal shards, ambient spores/embers, dissolve deaths with fragments.
- **Fairness:** enemies never spawn within 200 px of the heroine and prefer off-screen zones; sieges always leave a
  gap; heavy attacks are preceded by textured floor warnings; the dash passes through projectiles.
- **Reliquary (meta progression):** Amber Embers unlock two alternate Crown colours and three light modifiers
  (reroll, +15% health, start with Cinder Wind). None of it is required to win.

## Architecture

```
src/
  main.ts                 entry point
  game/                   Game (states and 60 Hz fixed-step loop), World (act layers and services),
                          Arena (authored tilemap, layered edge autotiling, collision), AssetLoader, AudioManager,
                          InputManager, CameraController, DevHarness (test tools)
  entities/               Hero, Enemy, behaviors (AI of 14 species), bosses (Batrach, Heart), bosses2 (Wyrm, Colossus)
  systems/                Combat, Weapons, Director (waves and objectives), Hazards (telegraphs, enemy shots, fire),
                          Pickups, Save (versioned localStorage with migration)
  content/                data: enemies + bestiary, cards, derived stats, act scripts, props
  render/                 Particles (pooled), Fx (VFX presets), Lighting (light veil), DamageNumbers (sprite digits)
  ui/                     UI (HTML/CSS over WebGL: menus, campaign map, bestiary, records, HUD, cards, pause,
                          settings, results), Touch
scripts/art               authored pixel-art pipeline + PixiJS-format atlas packer
scripts/audio             music and SFX synthesis
scripts/maps              ASCII-drawn maps + validator (reachability, zones, objectives)
tests/                    logic and content-integrity tests
```

Performance decisions: spatial hash rebuilt each step without allocation; pools for enemies, projectiles,
particles, numbers and pickups; automatic merging of excess XP crystals; atlas sprites (few draw calls); population
and particle caps per graphics quality (Low/Medium/High; High adds a slight bloom to the light layer); one screen
filter, only applied during pause/cards.

## Test tools

Open the debug panel with **F3** (or the ` key). Then: **G** invincibility, **P** autopilot (follows the objective,
flees the horde, picks cards), **N** skip the current step, **B** stress test (≈420 creatures + max arsenal),
**T** speed 1×/3×. Adding `#autotest` to the URL starts a hands-free run (invincible + autopilot + 3×);
`#autotest2` / `#autotest3` start at Act II / Act III.

## Known limitations

- Gamepads are not supported (there was no way to test one).
- Performance targets (60 FPS with 200–500 creatures on desktop) are targets: the F3 panel shows the real numbers
  on your machine.
