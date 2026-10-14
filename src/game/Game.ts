import { Application, BlurFilter, ColorMatrixFilter, Container, Sprite, Texture, type Ticker } from 'pixi.js';
import { assets } from './AssetLoader';
import { audio } from './AudioManager';
import { input } from './InputManager';
import { CameraController } from './CameraController';
import { World, type RunState, type WorldHooks } from './World';
import { Combat } from '../systems/Combat';
import { Weapons } from '../systems/Weapons';
import { Hazards } from '../systems/Hazards';
import { Pickups } from '../systems/Pickups';
import { Director } from '../systems/Director';
import { stepEnemies } from '../entities/behaviors';
import { ACTS } from '../content/acts';
import { defOf, type BossKind, type EnemyKind } from '../content/enemies';
import { rollCards, type CardDef } from '../content/upgrades';
import { xpToNext } from '../content/stats';
import { store, META_ITEMS, type Settings } from '../systems/Save';
import { UI } from '../ui/UI';
import { TouchControls } from '../ui/Touch';
import { rng } from '../utils/math';
import { DevHarness } from './DevHarness';

type State = 'boot' | 'menu' | 'playing' | 'levelup' | 'cards' | 'paused' | 'transition' | 'over';

const STEP = 1 / 60;
/** read at module load: the host may clear the fragment later */
const BOOT_HASH = location.hash;

/** Orchestrates the app, states, acts, cards, pause, results and the fixed-step simulation loop. */
export class Game {
  app = new Application();
  ui = new UI();
  touch = new TouchControls();
  camera = new CameraController();
  state: State = 'boot';
  private worldLayer = new Container();
  private screenLayer = new Container();
  private vignette!: Sprite;
  private flash!: Sprite;
  private world: World | null = null;
  private combat!: Combat;
  private weapons!: Weapons;
  private hazards!: Hazards;
  private pickups!: Pickups;
  private director!: Director;
  private run!: RunState;
  private actStart: RunState | null = null;
  private acc = 0;
  private levelupT = 0;
  private overT = -1;
  private victory = false;
  private debugOn = BOOT_HASH === '#debug' || BOOT_HASH === '#autotest';
  private simMs = 0;
  private desat = new ColorMatrixFilter();
  private lightBlur: BlurFilter | null = null;
  private music: 'menu' | 'combat' | 'boss' | 'none' = 'none';
  private dev = new DevHarness();

  async start(): Promise<void> {
    store.load();
    const st = store.data.settings;
    if (!localStorage.getItem('veu-de-brasas.save') && matchMedia('(pointer: coarse)').matches) st.quality = 'medium';
    const res = Math.min(window.devicePixelRatio || 1, 2);
    await this.app.init({
      resizeTo: window,
      background: '#07060b',
      antialias: false,
      roundPixels: true,
      resolution: res,
      autoDensity: true,
      preference: 'webgl',
    });
    document.getElementById('app')!.appendChild(this.app.canvas);
    this.app.stage.addChild(this.worldLayer, this.screenLayer);
    input.attach();
    input.onAnyKey = (code) => this.onKey(code);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.ui.loading(0, 'preparando');
    await assets.load((p, label) => this.ui.loading(p, label));
    if (assets.failures.length) {
      console.error('Assets ausentes:', assets.failures);
      const critical = assets.failures.filter((f) => !f.startsWith('audio/'));
      if (critical.length) {
        this.ui.loadingError(critical);
        return;
      }
    }
    void audio.init();
    this.applySettings(st);
    this.onResize();
    this.vignette = new Sprite(assets.tex('fx', 'vignette'));
    this.flash = new Sprite(Texture.WHITE);
    this.flash.alpha = 0;
    this.screenLayer.addChild(this.vignette, this.flash);
    this.desat.desaturate();
    this.desat.brightness(0.85, true);
    this.touch.onPause = () => this.pause();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.dev.auto) this.pause();
    });
    window.addEventListener('blur', () => !this.dev.auto && this.pause());
    window.addEventListener('mousemove', () => undefined);
    this.onResize();
    this.app.ticker.add((t: Ticker) => this.frame(Math.min(0.1, t.deltaMS / 1000)));
    this.toMenu();
    // end-to-end automated test: invincible + autopilot + 3x, starts the campaign (#autotest2/3 = act II/III)
    const checkHash = (h: string = location.hash) => {
      if (h === '#debug') this.debugOn = true;
      const m = /^#autotest([123])?$/.exec(h);
      if (!m) return;
      this.debugOn = true;
      this.dev.god = this.dev.auto = true;
      this.dev.turbo = 3;
      if (this.state === 'menu') this.startAt(m[1] ? Number(m[1]) - 1 : 0);
    };
    checkHash(BOOT_HASH);
    window.addEventListener('hashchange', () => checkHash());
  }

  // ------------------------------------------------------------ settings
  private applySettings(st: Settings): void {
    audio.musicVolume = st.music;
    audio.sfxVolume = st.sfx;
    audio.applyVolumes();
    if (this.world) {
      this.world.quality = st.quality;
      this.world.reduceFlash = st.reduceFlash;
      this.world.reduceShake = st.reduceShake;
      this.world.particles.max = st.quality === 'low' ? 320 : st.quality === 'medium' ? 650 : 1000;
      this.director.maxAlive = st.quality === 'low' ? 200 : st.quality === 'medium' ? 320 : 440;
      this.world.lights.filters = st.quality === 'high' ? [(this.lightBlur ??= new BlurFilter({ strength: 3, quality: 2 }))] : [];
    }
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.touch.visible = (st.touchControls === 'on' || (st.touchControls === 'auto' && coarse)) && (this.state === 'playing' || this.state === 'levelup');
  }

  private saveSettings = (st: Settings) => {
    store.data.settings = st;
    store.save();
    this.applySettings(st);
    this.onResize();
  };

  private onResize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    // base UI scale follows the screen; the user option multiplies it
    const auto = Math.max(0.9, Math.min(1.7, Math.min(h / 620, w / 760)));
    document.documentElement.style.setProperty('--ui', String(auto * store.data.settings.uiScale));
    this.camera.resize(w, h, this.app.renderer.resolution);
    if (this.vignette) {
      this.vignette.width = w;
      this.vignette.height = h;
    }
    if (this.flash) {
      this.flash.width = w;
      this.flash.height = h;
    }
    if (this.director) {
      this.director.viewW = this.camera.viewW;
      this.director.viewH = this.camera.viewH;
    }
  }

  // --------------------------------------------------------------- menus
  private toMenu(): void {
    this.destroyWorld();
    this.state = 'menu';
    this.ui.hudVisible(false);
    this.touch.visible = false;
    this.setMusic('menu');
    const meta = store.data.meta;
    const menu = () =>
      this.ui.menu(meta, !!store.data.checkpoint, {
        play: () => this.newRun(),
        cont: () => this.continueRun(),
        campaign: () => this.ui.campaign(meta, (i) => this.startAt(i), menu),
        bestiary: () => this.ui.bestiary(meta, menu),
        records: () => this.ui.records(meta, menu),
        howto: () => this.ui.howTo(menu),
        settings: () => this.ui.settings(store.data.settings, this.saveSettings, menu),
        credits: () => this.ui.credits(menu),
        relics: () => this.ui.relics(meta, () => store.save(), menu),
      });
    menu();
  }

  private setMusic(m: 'menu' | 'combat' | 'boss' | 'none'): void {
    if (this.music === m) return;
    this.music = m;
    audio.playMusic(m);
  }

  // ------------------------------------------------------------- partida
  private baseRun(): RunState {
    const meta = store.data.meta;
    const skin = META_ITEMS.find((m) => m.id === meta.selectedSkin);
    const mods = meta.enabledMods.filter((m) => meta.unlocked.includes(m));
    return {
      levels: mods.includes('mod_wind') ? { w_wind: 1 } : {},
      heroLevel: 1,
      xp: 0,
      hpFrac: 1,
      time: 0,
      kills: 0,
      damage: 0,
      coins: 0,
      actsDone: 0,
      act: 0,
      rerolls: mods.includes('mod_reroll') ? 1 : 0,
      bonusHpPct: mods.includes('mod_basalt') ? 0.15 : 0,
      skinTint: skin?.tint ?? 0xffffff,
      pendingLevels: 0,
      pendingChest: 0,
    };
  }

  private newRun(): void {
    this.startAt(0);
  }

  /** Starts a fresh run at act `i`; later acts grant catch-up levels and cards. */
  private startAt(i: number): void {
    i = Math.max(0, Math.min(ACTS.length - 1, i));
    this.run = this.baseRun();
    store.data.meta.runs++;
    if (i > 0) {
      this.run.heroLevel = 1 + i * 4;
      this.run.pendingLevels = i * 4;
      this.run.coins = 0;
    }
    this.beginAct(i);
  }

  private continueRun(): void {
    const cp = store.data.checkpoint;
    if (!cp) return this.newRun();
    this.run = this.baseRun();
    Object.assign(this.run, {
      levels: { ...cp.levels },
      heroLevel: cp.heroLevel,
      xp: cp.xp,
      hpFrac: cp.hpFrac,
      time: cp.stats.time,
      kills: cp.stats.kills,
      damage: cp.stats.damage,
      coins: cp.stats.coins,
      actsDone: cp.stats.actsDone,
    });
    this.beginAct(cp.act);
  }

  private beginAct(i: number): void {
    const act = ACTS[i];
    this.run.act = i;
    store.data.meta.maxAct = Math.max(store.data.meta.maxAct, i);
    this.actStart = structuredClone(this.run);
    store.data.checkpoint = {
      act: i,
      levels: { ...this.run.levels },
      heroLevel: this.run.heroLevel,
      xp: this.run.xp,
      hpFrac: this.run.hpFrac,
      stats: { time: this.run.time, kills: this.run.kills, damage: this.run.damage, coins: this.run.coins, actsDone: this.run.actsDone },
    };
    store.save();
    this.state = 'transition';
    this.ui.hideAll();
    this.ui.hudVisible(false);
    this.touch.visible = false;
    this.ui.transition(act.roman, act.title, act.subtitle, 1300, () => this.buildWorld(i), () => {
      this.state = 'playing';
      this.ui.hudVisible(true);
      this.applySettings(store.data.settings);
      this.ui.banner(`Act ${act.roman}`, act.title);
    }, `ui/act_${'abc'[i]}.png`);
  }

  private hooks(): WorldHooks {
    return {
      levelUp: () => undefined,
      heroDied: () => {
        this.overT = 0;
        this.victory = false;
      },
      actComplete: () => this.actComplete(),
      victory: () => {
        this.overT = 0;
        this.victory = true;
      },
      objective: (t, h) => this.ui.objective(t, h),
      bossBar: (n, f) => this.ui.bossBar(n, f),
      banner: (a, b) => this.ui.banner(a, b),
      bossSeen: (k) => {
        const seen = store.data.meta.seen;
        if (seen.includes(k)) return;
        seen.push(k);
        this.ui.toast(`New bestiary entry: ${defOf(k as EnemyKind | BossKind).name}`);
      },
      bossSlain: () => {
        store.data.meta.bossesSlain++;
      },
    };
  }

  private buildWorld(i: number): void {
    this.destroyWorld();
    const st = store.data.settings;
    const w = new World(ACTS[i], this.run, this.hooks(), st.quality);
    this.world = w;
    w.god = this.dev.god;
    this.combat = new Combat(w);
    this.hazards = new Hazards(w);
    this.hazards.combat = this.combat;
    this.pickups = new Pickups(w);
    this.combat.pickups = this.pickups;
    this.weapons = new Weapons(w);
    this.weapons.combat = this.combat;
    this.director = new Director(w, this.combat, this.hazards, this.pickups);
    this.worldLayer.addChild(w.root);
    this.ui.hud(this.hudData(), `Act ${ACTS[i].roman} · ${ACTS[i].title}`);
    this.ui.objective(this.director.step.text, this.director.step.hint);
    this.onResize();
    this.applySettings(st);
    this.camera.snap(w);
    this.camera.update(0, w, this.app.renderer.resolution);
    this.overT = -1;
    this.acc = 0;
    this.setMusic('combat');
  }

  private destroyWorld(): void {
    if (!this.world) return;
    this.director.destroy();
    this.weapons.destroy();
    this.hazards.clearShots();
    this.pickups.clear();
    this.world.destroy();
    this.world = null;
  }

  private actComplete(): void {
    const w = this.world!;
    this.run.actsDone++;
    this.run.hpFrac = Math.max(0.5, w.hero.hp / w.hero.maxHp);
    this.run.pendingLevels = 0;
    this.run.pendingChest = 0;
    this.beginAct(this.run.act + 1);
  }

  private finishRun(): void {
    const w = this.world!;
    const meta = store.data.meta;
    if (this.victory) {
      this.run.actsDone = ACTS.length;
      meta.wins++;
      meta.bestTime = meta.bestTime ? Math.min(meta.bestTime, this.run.time) : this.run.time;
      store.data.checkpoint = null;
      this.run.coins += 40;
      audio.play('victory');
    } else audio.play('defeat');
    meta.coins += this.run.coins;
    if (!this.victory) meta.deaths++;
    meta.totalKills += this.run.kills;
    meta.bestKills = Math.max(meta.bestKills, this.run.kills);
    meta.bestLevel = Math.max(meta.bestLevel, this.run.heroLevel);
    store.save();
    this.state = 'over';
    this.ui.hudVisible(false);
    this.touch.visible = false;
    this.setMusic(this.victory ? 'menu' : 'none');
    w.root.filters = [this.desat];
    this.ui.results(
      { victory: this.victory, time: this.run.time, kills: this.run.kills, damage: this.run.damage, level: this.run.heroLevel, actsDone: this.run.actsDone, coins: this.run.coins, levels: this.run.levels },
      {
        replay: () => (this.victory || !store.data.checkpoint ? this.newRun() : this.continueRun()),
        menu: () => this.toMenu(),
      },
    );
  }

  // ----------------------------------------------------------- pausa/cartas
  private pause(): void {
    if (this.state !== 'playing' && this.state !== 'levelup') return;
    this.state = 'paused';
    this.world!.root.filters = [this.desat];
    audio.duck(true);
    this.touch.visible = false;
    const show = () =>
      this.ui.pause({
        resume: () => this.resume(),
        restart: () => {
          if (this.actStart) {
            this.run = structuredClone(this.actStart);
            this.beginAct(this.run.act);
          }
        },
        settings: () => this.ui.settings(store.data.settings, this.saveSettings, show),
        quit: () => this.toMenu(),
      });
    show();
  }

  private resume(): void {
    this.ui.hideAll();
    this.state = 'playing';
    if (this.world) this.world.root.filters = [];
    audio.duck(false);
    input.clearPressed();
    this.applySettings(store.data.settings);
  }

  private openCards(): void {
    const w = this.world!;
    const chest = this.run.pendingChest > 0;
    const offer = rollCards(this.run.levels, this.run.heroLevel, () => rng.next(), 3, chest ? 'rare' : undefined);
    this.state = 'cards';
    w.root.filters = [this.desat];
    audio.duck(true);
    this.touch.visible = false;
    const title = chest ? 'Relic chest' : `Level ${this.run.heroLevel}`;
    this.ui.cards(offer, this.run.levels, title, this.run.rerolls, (c) => this.pick(c), () => {
      this.run.rerolls--;
      this.openCards();
    });
    if (this.dev.auto) setTimeout(() => this.state === 'cards' && this.pick(this.dev.pickCard(offer)), 350);
  }

  private pick(c: CardDef): void {
    const w = this.world!;
    audio.play(c.rarity === 'legendary' ? 'legendary' : 'card_select');
    if (c.kind === 'heal') {
      w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + w.hero.maxHp * 0.4);
      w.fx.heal(w.hero.x, w.hero.y);
    } else this.run.levels[c.id] = (this.run.levels[c.id] ?? 0) + 1;
    if (c.id === 'u_hp') w.hero.hp += 20;
    w.refreshStats();
    if (this.run.pendingChest > 0) this.run.pendingChest--;
    else this.run.pendingLevels = Math.max(0, this.run.pendingLevels - 1);
    w.fx.levelUp(w.hero.x, w.hero.y);
    if (c.rarity !== 'common') {
      w.screenFlash(c.rarity === 'legendary' ? 0xffd27a : 0xc49aff, 0.25);
      w.fx.anchorBlast(w.hero.x, w.hero.y);
    }
    this.ui.banner(c.name, c.rarity === 'legendary' ? 'Legendary transformation' : undefined, 1.6);
    this.ui.hud(this.hudData(), `Act ${ACTS[this.run.act].roman} · ${ACTS[this.run.act].title}`);
    if (this.run.pendingLevels > 0 || this.run.pendingChest > 0) this.openCards();
    else this.resume();
  }

  // --------------------------------------------------------------- teclado
  private onKey(code: string): void {
    if (code === 'F3' || code === 'Backquote') {
      this.debugOn = !this.debugOn;
      if (!this.debugOn) this.ui.debug(null);
      return;
    }
    if (this.debugOn && this.world && this.state !== 'menu') {
      const w = this.world;
      if (code === 'KeyG') w.god = this.dev.god = !this.dev.god;
      else if (code === 'KeyP') this.dev.auto = !this.dev.auto;
      else if (code === 'KeyN') this.director.skip();
      else if (code === 'KeyB') {
        this.director.maxAlive = 480;
        this.dev.stress(w, (k, x, y) => this.director.spawnEnemy(k, x, y));
      } else if (code === 'KeyT') this.dev.turbo = this.dev.turbo === 1 ? 3 : 1;
      if (['KeyG', 'KeyP', 'KeyN', 'KeyB', 'KeyT'].includes(code)) return;
    }
    if (code === 'KeyM') {
      audio.muted = !audio.muted;
      audio.applyVolumes();
    }
    if (this.ui.handleKey(code)) return;
    if (code === 'Escape' && (this.state === 'playing' || this.state === 'levelup')) this.pause();
  }

  // ------------------------------------------------------------------ loop
  private frame(dt: number): void {
    this.ui.tick(dt);
    const w = this.world;
    if (!w) return;
    const t0 = performance.now();
    if (this.state === 'playing' || this.state === 'levelup') {
      let scale = 1;
      if (this.state === 'levelup') {
        this.levelupT -= dt;
        scale = 0.25;
        if (this.levelupT <= 0) this.openCards();
      }
      if (w.hitstop > 0) w.hitstop -= dt;
      else {
        this.acc += dt * scale * this.dev.turbo;
        let n = 0;
        while (this.acc >= STEP && n < 5 * this.dev.turbo) {
          this.step(STEP);
          this.acc -= STEP;
          n++;
          if (this.state !== 'playing' && this.state !== 'levelup') break;
        }
        if (n === 5 * this.dev.turbo) this.acc = 0;
      }
    } else if (this.state === 'over' || this.state === 'transition') {
      w.particles.update(dt * 0.5);
    }
    if (this.overT >= 0 && this.state === 'playing') {
      this.overT += dt;
      if (this.overT > (this.victory ? 2.5 : 1.8)) this.finishRun();
    }
    this.render(dt);
    const ms = performance.now() - t0;
    this.simMs = this.simMs * 0.9 + ms * 0.1;
    this.dev.stat(ms);
    if (this.debugOn)
      this.ui.debug(
        `FPS ${this.app.ticker.FPS.toFixed(0)}  cpu/frame ${this.simMs.toFixed(2)} ms (p95 ${this.dev.p95.toFixed(2)})\n` +
          `[G] god ${this.dev.god ? 'ON' : 'off'}  [P] autopilot ${this.dev.auto ? 'ON' : 'off'}  [T] ${this.dev.turbo}×  [N] skip step  [B] stress\n` +
          `act ${this.run ? this.run.act + 1 : '-'}  hp ${this.world ? Math.ceil(this.world.hero.hp) : 0}  level ${this.run?.heroLevel ?? 0}  time ${this.run ? this.run.time.toFixed(0) : 0}s  kills ${this.run?.kills ?? 0}\n` +
          `JS errors: ${this.dev.errors.length ? this.dev.errors.slice(-3).join(' | ') : 'none'}\n` +
          `enemies ${this.director.alive}/${this.director.maxAlive}  projectiles ${this.weapons.count}  enemy-shots ${this.hazards.shotCount}\n` +
          `particles ${w.particles.count}/${w.particles.max}  pickups ${this.pickups.live.length}\n` +
          `step ${this.director.stepIndex} ${this.director.step.type} t=${this.director.stepTime.toFixed(1)}  zoom ${this.camera.zoom.toFixed(2)}`,
      );
  }

  private step(dt: number): void {
    const w = this.world!;
    const h = w.hero;
    const st = store.data.settings;
    w.time += dt;
    if (h.alive) this.run.time += dt;
    // input
    let mv = input.move();
    let wantDash = input.consume('Space');
    let wantPulse = input.consume('KeyQ');
    if (this.dev.auto && h.alive) {
      const a = this.dev.move(w, this.director);
      mv = a;
      wantDash = wantDash || a.dash;
      wantPulse = wantPulse || a.pulse;
    }
    const dashed = h.update(dt, mv, w.stats, wantDash);
    w.arena.resolve(h, h.radius, true);
    if (dashed) {
      audio.play('dash');
      w.fx.dust(h.x, h.y, 4, 0.6);
    }
    if (h.dashing && Math.floor(w.time * 60) % 2 === 0) w.fx.afterimage(h.texture, h.x, h.y, h.face === 'side' && h.flip);
    if (h.moving && !h.shootT) h.faceAngle(h.aim);
    if (wantPulse && !this.weapons.tryPulse() && h.alive) audio.play('ui_hover', { rate: 0.6 });
    // optional manual aim
    if (st.manualAim && input.mouseActive) {
      const [mx, my] = this.camera.toWorld(w, input.mouseX, input.mouseY);
      this.weapons.aimX = mx;
      this.weapons.aimY = my;
    } else this.weapons.aimX = this.weapons.aimY = null;
    // spatial grid
    w.hash.clear();
    for (const e of w.enemies) if (e.alive && !e.dying) w.hash.insert(e);
    w.lifestealBudget = Math.min(w.stats.lifestealCap, w.lifestealBudget + w.stats.lifestealCap * dt);
    this.director.update(dt);
    stepEnemies(this.director.ai, dt);
    this.weapons.update(dt);
    this.hazards.update(dt);
    this.combat.updateStatus(dt);
    this.pickups.update(dt);
    this.director.reap();
    w.particles.update(dt);
    w.numbers.update(dt);
    for (let i = w.flashes.length - 1; i >= 0; i--) {
      w.flashes[i][5] -= dt;
      if (w.flashes[i][5] <= 0) w.flashes.splice(i, 1);
    }
    // atmosphere: spores and embers floating around the camera
    if (w.quality !== 'low' && Math.random() < dt * 9) {
      w.fx.ambient(this.camera.x + (Math.random() - 0.5) * this.camera.viewW, this.camera.y + (Math.random() - 0.3) * this.camera.viewH, w.arena.data.tileset);
    }
    // level up: short slow-motion, then cards
    if (this.state === 'playing' && h.alive && this.overT < 0 && (this.run.pendingLevels > 0 || this.run.pendingChest > 0)) {
      this.state = 'levelup';
      this.levelupT = 0.32;
      w.fx.levelUp(h.x, h.y);
      audio.play('levelup');
    }
  }

  private render(dt: number): void {
    const w = this.world!;
    const h = w.hero;
    h.sync(w.time);
    for (const e of w.enemies) if (e.alive && !e.dying && !e.boss) e.sync(e.def.view === 'top8' ? 12 : 8);
    w.arena.updateLights(w.time);
    w.heroLight.position.set(h.x, h.y - 14);
    w.heroLight.alpha = h.alive ? 0.08 + (h.energy / 100) * 0.05 : 0;
    this.camera.update(dt, w, this.app.renderer.resolution);
    this.renderLighting(w);
    this.flash.tint = w.flashColor;
    this.flash.alpha = w.flashAlpha;
    w.flashAlpha = Math.max(0, w.flashAlpha - dt * 2.2);
    // adaptive music
    const boss = this.director.step.type === 'boss' && !!this.director.boss && !this.director.boss.e.dying;
    if (this.state === 'playing') {
      this.setMusic(boss ? 'boss' : 'combat');
      audio.setIntensity(Math.min(1, this.director.alive / 160));
    }
    if (this.state === 'playing' || this.state === 'levelup') {
      this.ui.hud(this.hudData(), `Act ${ACTS[this.run.act].roman} · ${ACTS[this.run.act].title}`);
    }
  }

  private lightBuf: [number, number, number, number, number][] = [];

  /** Darkness veil: heroine, scenery lights, objectives and bosses open pools of light. */
  private renderLighting(w: World): void {
    const L = w.lighting;
    const z = this.camera.zoom;
    L.enabled = w.quality !== 'low';
    L.place(w.root.x, w.root.y, z);
    if (!L.enabled) return;
    L.resize(window.innerWidth, window.innerHeight);
    L.begin();
    const sx = (x: number) => w.root.x + x * z;
    const sy = (y: number) => w.root.y + y * z;
    const vw = window.innerWidth, vh = window.innerHeight;
    const vis = (x: number, y: number, r: number) => x > -r && y > -r && x < vw + r && y < vh + r;
    const h = w.hero;
    if (h.alive) {
      L.light(sx(h.x), sy(h.y - 12), 230 * z, 1, 0xffe8c8);
      L.light(sx(h.x), sy(h.y - 12), 70 * z, 0.6, 0xffc890);
    }
    for (const l of w.arena.lights) {
      const x = sx(l.sprite.x), y = sy(l.sprite.y), r = l.sprite.scale.x * 75 * z;
      if (vis(x, y, r)) L.light(x, y, r, Math.min(1, l.sprite.alpha * 2.4), l.sprite.texture === w.heroLight.texture ? 0xffd8a8 : 0xd0f0ff);
    }
    this.lightBuf.length = 0;
    this.director.lightSources(this.lightBuf);
    for (const [x, y, r, i, c] of this.lightBuf) if (vis(sx(x), sy(y), r * z)) L.light(sx(x), sy(y), r * z, i, c);
    for (const f of w.flashes) {
      const k = f[5] / f[6];
      L.light(sx(f[0]), sy(f[1]), f[2] * z * (0.7 + 0.3 * k), f[3] * k, f[4]);
    }
    L.end(this.app.renderer);
  }

  private hudData() {
    const w = this.world!;
    const h = w.hero;
    return {
      hp: h.hp,
      maxHp: h.maxHp,
      energy: h.energy,
      pulseCost: w.stats.pulse.cost,
      pulseCd: h.pulseCd,
      pulseCdMax: w.stats.pulse.cooldown * w.stats.cdMul,
      dashCd: h.dashCd,
      dashCdMax: w.stats.dashCooldown,
      level: this.run.heroLevel,
      xpFrac: this.run.xp / xpToNext(this.run.heroLevel),
      time: this.run.time,
      kills: this.run.kills,
      coins: this.run.coins,
      channel: this.director ? this.director.channelFrac : 0,
      objTime: this.director && this.director.step.type === 'survive' ? Math.max(0, (this.director.step.duration ?? 0) - this.director.stepTime) : null,
      levels: this.run.levels,
    };
  }
}
