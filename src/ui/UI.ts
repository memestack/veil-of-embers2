/**
 * Semantic HTML/CSS interface layer over the WebGL surface.
 * Every frame, bar, card and icon uses the project's own art in /assets/ui.
 */
import { audio } from '../game/AudioManager';
import { asset } from '../game/AssetLoader';
import type { CardDef, Levels } from '../content/upgrades';
import { CARD_BY_ID, CARDS, RARITY_LABEL } from '../content/upgrades';
import { META_ITEMS, type MetaData, type Settings } from '../systems/Save';
import { ACTS } from '../content/acts';
import { BESTIARY, defOf } from '../content/enemies';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

const icon = (name: string) => asset(`ui/icons/${name}.png`);

const UI_IMAGES = ['bar_boss', 'bar_elite', 'bar_energy', 'bar_frame', 'bar_hp', 'button_hover', 'button_normal', 'button_press', 'card_common',
  'card_legendary', 'card_rare', 'frame_common', 'frame_legendary', 'frame_rare', 'menu_art', 'panel', 'panel_cool', 'slot'];

export interface HudData {
  hp: number;
  maxHp: number;
  energy: number;
  pulseCost: number;
  pulseCd: number;
  pulseCdMax: number;
  dashCd: number;
  dashCdMax: number;
  level: number;
  xpFrac: number;
  time: number;
  kills: number;
  coins: number;
  channel: number;
  objTime: number | null;
  levels: Levels;
}

export interface ResultData {
  victory: boolean;
  time: number;
  kills: number;
  damage: number;
  level: number;
  actsDone: number;
  coins: number;
  levels: Levels;
}

export interface MenuCallbacks {
  play(): void;
  cont(): void;
  campaign(): void;
  bestiary(): void;
  records(): void;
  howto(): void;
  settings(): void;
  credits(): void;
  relics(): void;
}

export const fmtTime = (t: number): string => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export class UI {
  root = $('#ui');
  private screens: Record<string, HTMLElement> = {};
  private bannerT = 0;
  private hudBuilt = '';
  private keyHandler: ((code: string) => boolean) | null = null;
  onPause: (() => void) | null = null;

  constructor() {
    // UI images and font resolved through the central loader (works in dev, build and subfolders)
    const rootStyle = document.documentElement.style;
    // absolute URLs: a relative url() inside a CSS variable would resolve against the stylesheet's folder
    for (const n of UI_IMAGES) rootStyle.setProperty(`--img-${n.replace(/_/g, '-')}`, `url("${new URL(asset(`ui/${n}.png`), document.baseURI).href}")`);
    if ('FontFace' in window) {
      const face = new FontFace('Lora', `url("${asset('fonts/Lora-Variable.ttf')}")`, { weight: '400 700' });
      face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
    }
    this.root.innerHTML = '';
    for (const id of ['loading', 'menu', 'modal', 'cards', 'pause', 'results', 'transition']) {
      const s = el(`<div class="screen ${id === 'modal' || id === 'pause' || id === 'results' ? 'modal' : ''}" id="${id}"></div>`);
      this.screens[id] = s;
      this.root.appendChild(s);
    }
    this.root.appendChild(el(`<div id="hud"></div>`));
    this.root.appendChild(el(`<div id="banner"><div class="b1"></div><div class="b2"></div></div>`));
    this.root.appendChild(el(`<div id="toasts"></div>`));
    document.body.appendChild(el(`<div id="debug"></div>`));
    // interface sounds on every button
    this.root.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest('.btn,.card,.relic,.actcard,.beast')) audio.play('ui_hover');
    });
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn,.relic,.seg button,.toggle,.actcard,.beast')) audio.play('ui_click');
    });
  }

  /** Routes keys to the active screen (1-3 on cards, Esc etc.). Returns true if handled. */
  handleKey(code: string): boolean {
    return this.keyHandler ? this.keyHandler(code) : false;
  }

  private show(id: string | null, keep: string[] = []): void {
    for (const [k, s] of Object.entries(this.screens)) if (!keep.includes(k)) s.classList.toggle('on', k === id);
    this.keyHandler = null;
  }

  hideAll(): void {
    this.show(null);
  }

  // ------------------------------------------------------------- loading
  loading(p: number, label: string): void {
    const s = this.screens.loading;
    if (!s.innerHTML)
      s.innerHTML = `<h2>VEIL OF EMBERS</h2><div class="bar"><div class="fill"></div></div><div class="label"></div><div class="err"></div>`;
    this.show('loading');
    $('.fill', s).style.width = `${Math.round(p * 100)}%`;
    $('.label', s).textContent = label;
  }

  loadingError(files: string[]): void {
    const s = this.screens.loading;
    $('.err', s).innerHTML = `Could not load: <br>${files.slice(0, 6).join('<br>')}<br><br>Check that the <b>public/assets</b> folder is complete and reload the page.`;
  }

  // ---------------------------------------------------------------- menu
  menu(meta: MetaData, hasCheckpoint: boolean, cb: MenuCallbacks): void {
    const s = this.screens.menu;
    const seen = BESTIARY.filter((k) => meta.seen.includes(k)).length;
    s.innerHTML = `
      <div class="art"></div>
      <div class="coins"><img src="${asset('ui/icons/w_crown.png')}" alt="">${meta.coins} Amber Embers</div>
      <img class="logo" src="${asset('ui/logo.png')}" alt="Veil of Embers">
      <div class="col">
        <button class="btn" data-a="play">PLAY<span class="sub">new campaign</span></button>
        ${hasCheckpoint ? '<button class="btn" data-a="cont">CONTINUE<span class="sub">resume from the saved act</span></button>' : ''}
        <div class="sec">
        <button class="btn" data-a="campaign">Campaign Map<span class="sub">${meta.maxAct + 1} / ${ACTS.length} acts discovered</span></button>
        <button class="btn" data-a="bestiary">Bestiary<span class="sub">${seen} / ${BESTIARY.length} creatures</span></button>
        <button class="btn" data-a="relics">Reliquary</button>
        <button class="btn" data-a="records">Records</button>
        <button class="btn" data-a="howto">How to Play</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="credits">Credits</button>
        </div>
      </div>
      <div class="ver">v1.1 · PixiJS 8 / WebGL · ${meta.wins} win${meta.wins === 1 ? '' : 's'}${meta.bestTime ? ' · best time ' + fmtTime(meta.bestTime) : ''}</div>`;
    s.querySelectorAll<HTMLButtonElement>('.btn').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a as keyof MenuCallbacks;
        cb[a]();
      }),
    );
    this.show('menu');
    this.focusFirst(s);
    this.keyHandler = (code) => this.navKeys(s, code);
  }

  // -------------------------------------------------------- campaign map
  campaign(meta: MetaData, onStart: (act: number) => void, onClose: () => void): void {
    const html = `<h2>Campaign Map</h2>
      <p>Each Anchor you reach opens a new path. Starting at a later act grants bonus relic cards to catch up.</p>
      <div class="acts">${ACTS.map((a, i) => {
        const open = i <= meta.maxAct;
        const bosses = a.steps.filter((st) => st.boss).map((st) => defOf(st.boss!).name);
        const elites = a.steps.filter((st) => st.elite).map((st) => defOf(st.elite!).name);
        return `<button class="actcard ${open ? '' : 'locked'}" data-i="${i}" ${open ? '' : 'disabled'}>
          <div class="thumb" style="background-image:url('${asset(`ui/act_${'abc'[i]}.png`)}')"><span class="rn">${a.roman}</span>${open ? '' : '<span class="lock">SEALED</span>'}</div>
          <div class="info"><div class="t">${a.title}</div><div class="d">${open ? a.subtitle : 'Reach this act in a campaign to unlock it.'}</div>
          ${open ? `<div class="m">Elite: ${elites.join(', ') || '—'}<br>Boss${bosses.length > 1 ? 'es' : ''}: ${bosses.join(', ')}</div>
          <div class="go">${i === 0 ? 'Start from the beginning' : `Start here · +${i * 4} bonus cards`}</div>` : ''}</div></button>`;
      }).join('')}</div>`;
    this.modal(html, onClose, (root) => {
      root.querySelectorAll<HTMLButtonElement>('.actcard:not([disabled])').forEach((b) =>
        b.addEventListener('click', () => {
          root.classList.remove('on');
          onStart(Number(b.dataset.i));
        }),
      );
    });
  }

  // ------------------------------------------------------------ bestiary
  bestiary(meta: MetaData, onClose: () => void): void {
    const html = `<h2>Bestiary</h2><p>Creatures are recorded the first time they cross your path.</p>
      <div class="beasts">${BESTIARY.map((k) => {
        const d = defOf(k);
        const known = meta.seen.includes(k);
        const tag = k === 'heart' ? 'final' : d.atlas.startsWith('boss') ? 'boss' : d.elite ? 'elite' : 'common';
        return `<button class="beast ${tag} ${known ? '' : 'unknown'}" data-k="${k}">
          <img src="${asset(`ui/bestiary/${k}.png`)}" alt=""><span>${known ? d.name : '???'}</span></button>`;
      }).join('')}</div>
      <div class="beastinfo"><i>Select a creature.</i></div>`;
    this.modal(html, onClose, (root) => {
      const info = $('.beastinfo', root);
      const pick = (b: HTMLElement) => {
        root.querySelectorAll('.beast').forEach((x) => x.classList.toggle('sel', x === b));
        const k = b.dataset.k as (typeof BESTIARY)[number];
        const d = defOf(k);
        if (!meta.seen.includes(k)) {
          info.innerHTML = `<div class="t">Unknown creature</div><p>Not yet encountered. Keep pushing through the acts.</p>`;
          return;
        }
        const tag = b.classList.contains('final') ? 'Final boss' : b.classList.contains('boss') ? 'Boss' : b.classList.contains('elite') ? 'Elite' : 'Common';
        info.innerHTML = `<img src="${asset(`ui/bestiary/${k}.png`)}" alt=""><div><div class="t">${d.name} <small>${tag}</small></div>
          <p>${d.lore}</p><div class="st"><span>Health <b>${d.hp}</b></span><span>Damage <b>${d.damage}</b></span><span>Speed <b>${d.speed || '—'}</b></span><span>Armour <b>${d.armor}</b></span>${d.flying ? '<span><b>Flying</b></span>' : ''}</div></div>`;
      };
      root.querySelectorAll<HTMLElement>('.beast').forEach((b) => b.addEventListener('click', () => pick(b)));
      const first = root.querySelector<HTMLElement>('.beast:not(.unknown)');
      if (first) pick(first);
    });
  }

  // ------------------------------------------------------------- records
  records(meta: MetaData, onClose: () => void): void {
    const seen = BESTIARY.filter((k) => meta.seen.includes(k)).length;
    this.modal(
      `<h2>Records</h2><div class="panel-in results"><div class="grid">
        <div>Runs started <b>${meta.runs}</b></div><div>Victories <b>${meta.wins}</b></div>
        <div>Defeats <b>${meta.deaths}</b></div><div>Best victory time <b>${meta.bestTime ? fmtTime(meta.bestTime) : '—'}</b></div>
        <div>Total creatures slain <b>${meta.totalKills.toLocaleString('en-US')}</b></div><div>Most kills in a run <b>${meta.bestKills}</b></div>
        <div>Highest level <b>${meta.bestLevel}</b></div><div>Bosses slain <b>${meta.bossesSlain}</b></div>
        <div>Acts discovered <b>${Math.min(meta.maxAct + 1, ACTS.length)} / ${ACTS.length}</b></div><div>Bestiary <b>${seen} / ${BESTIARY.length}</b></div>
        <div>Amber Embers <b>${meta.coins}</b></div><div>Relics owned <b>${meta.unlocked.length} / ${META_ITEMS.length}</b></div>
      </div></div>`,
      onClose,
    );
  }

  toast(text: string): void {
    const box = $('#toasts');
    const t = el(`<div class="toast"></div>`);
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
  }

  private focusFirst(s: HTMLElement): void {
    const b = s.querySelector<HTMLElement>('.btn');
    if (b && !matchMedia('(pointer: coarse)').matches) b.focus({ preventScroll: true });
  }

  /** Arrow/Enter navigation over button lists. */
  private navKeys(s: HTMLElement, code: string): boolean {
    const btns = Array.from(s.querySelectorAll<HTMLElement>('.btn:not([disabled])'));
    if (!btns.length) return false;
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (code === 'ArrowDown' || code === 'KeyS') {
      btns[(i + 1) % btns.length].focus();
      return true;
    }
    if (code === 'ArrowUp' || code === 'KeyW') {
      btns[(i - 1 + btns.length) % btns.length].focus();
      return true;
    }
    return false;
  }

  modal(html: string, onClose: () => void, extra?: (root: HTMLElement) => void): void {
    const s = this.screens.modal;
    s.innerHTML = `<div class="panel">${html}<div class="row"><button class="btn" data-close>Back</button></div></div>`;
    $('[data-close]', s).addEventListener('click', () => {
      s.classList.remove('on');
      onClose();
    });
    extra?.(s);
    s.classList.add('on');
    this.keyHandler = (code) => {
      if (code === 'Escape') {
        s.classList.remove('on');
        onClose();
        return true;
      }
      return false;
    };
  }

  howTo(onClose: () => void): void {
    this.modal(
      `<h2>How to Play</h2>
      <p>Rekindle the <b>Anchor of the Veil</b> and defeat the Golem Warlord. Survive the creature tides, face elites and bosses.</p>
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows — move · Your <b>Rune Arrows</b> fire on their own at the nearest enemy.</p>
      <p><kbd>Space</kbd> — short dash with invulnerability (passes through projectiles and shockwaves).</p>
      <p><kbd>Q</kbd> — <b>Crown Pulse</b>: the Ember Crown expands, pushes back and ignites (costs energy).</p>
      <p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> — choose a card on level up · <kbd>Esc</kbd> — pause.</p>
      <p><span style="color:var(--jade)">Jade</span> cards are direct upgrades, <span style="color:var(--amethyst)">Amethyst</span> cards bring new weapons and effects, <span style="color:var(--gold)">Solar Gold</span> cards transform your arsenal — including the combos <b>Blazing Tornado</b>, <b>Thunder Shard</b> and <b>Circular Dawn</b>.</p>
      <p><span style="color:var(--blood)">Red dashed</span> areas on the floor announce attacks: step out or dash through. Burning ground hurts — don't linger.</p>
      <p>Elite: the <b>Golem Warlord</b> raises its fists before a wide sweep and leaves burning ground behind.</p>
      <p>Touch: drag on the left side to move; Dash and Pulse buttons on the right.</p>`,
      onClose,
    );
  }

  credits(onClose: () => void): void {
    this.modal(
      `<h2>Credits</h2>
      <p><b>Veil of Embers</b> — concept, art direction, code, sprites, VFX, maps, music and sound effects made for this project.</p>
      <p>Art: original pixel art generated by the <code>scripts/art</code> pipeline (shapes drawn part by part, shaded with custom colour ramps).</p>
      <p>Audio: original synthesis in <code>scripts/audio</code>.</p>
      <p>Interface font: <b>Lora</b> (Cyreal, SIL Open Font License 1.1).</p>
      <p>Rendering engine: <b>PixiJS 8</b> (MIT licence).</p>
      <p>Intensity reference: <i>Magic Archer</i> gameplay footage; no assets, names or interface were copied.</p>`,
      onClose,
    );
  }

  relics(meta: MetaData, onChange: () => void, onClose: () => void): void {
    const render = (root: HTMLElement) => {
      const box = $('.relics', root);
      box.innerHTML = META_ITEMS.map((m) => {
        const owned = meta.unlocked.includes(m.id);
        const active = m.kind === 'skin' ? meta.selectedSkin === m.id : meta.enabledMods.includes(m.id);
        return `<div class="relic ${owned ? 'owned' : ''} ${active ? 'active' : ''}" data-id="${m.id}">
          <img src="${icon(m.icon)}" alt="" style="${m.tint && m.tint !== 0xffffff ? `filter: drop-shadow(0 0 0 #000) hue-rotate(${m.id === 'skin_frost' ? 170 : 70}deg)` : ''}">
          <div><div class="t">${m.name}</div><div class="d">${m.desc}</div>
          <div class="c">${owned ? (active ? (m.kind === 'skin' ? 'Equipped' : 'Active') : m.kind === 'skin' ? 'Click to equip' : 'Click to activate') : `${m.cost} Embers — click to unlock`}</div></div></div>`;
      }).join('');
      box.querySelectorAll<HTMLElement>('.relic').forEach((r) =>
        r.addEventListener('click', () => {
          const m = META_ITEMS.find((x) => x.id === r.dataset.id)!;
          if (!meta.unlocked.includes(m.id)) {
            if (meta.coins < m.cost) {
              audio.play('hurt', { gain: 0.3, rate: 1.6 });
              return;
            }
            meta.coins -= m.cost;
            meta.unlocked.push(m.id);
            audio.play('rare');
          } else if (m.kind === 'skin') meta.selectedSkin = m.id;
          else if (meta.enabledMods.includes(m.id)) meta.enabledMods = meta.enabledMods.filter((x) => x !== m.id);
          else meta.enabledMods.push(m.id);
          onChange();
          $('.have', root).textContent = String(meta.coins);
          render(root);
        }),
      );
    };
    this.modal(
      `<h2>Reliquary</h2><p>Amber Embers drop from creatures, chests and bosses. Unlocks are optional: the campaign can be won without them.</p>
       <p style="color:var(--gold)">You have <b class="have">${meta.coins}</b> Embers.</p><div class="relics"></div>`,
      onClose,
      render,
    );
  }

  settings(st: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
    const q = (v: string) => (st.quality === v ? 'on' : '');
    const yn = (b: boolean) => (b ? 'On' : 'Off');
    const html = `<h2>Settings</h2><div class="settings">
      <label>Music <input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music"></label>
      <label>Sound effects <input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx"></label>
      <label>Graphics quality <span class="seg" data-k="quality"><button data-v="low" class="${q('low')}">Low</button><button data-v="medium" class="${q('medium')}">Medium</button><button data-v="high" class="${q('high')}">High</button></span></label>
      <label>Reduce flashes <button class="toggle ${st.reduceFlash ? 'on' : ''}" data-k="reduceFlash">${yn(st.reduceFlash)}</button></label>
      <label>Reduce camera shake <button class="toggle ${st.reduceShake ? 'on' : ''}" data-k="reduceShake">${yn(st.reduceShake)}</button></label>
      <label>Manual mouse aim <button class="toggle ${st.manualAim ? 'on' : ''}" data-k="manualAim">${yn(st.manualAim)}</button></label>
      <label>Interface scale <span class="seg" data-k="uiScale">${[0.85, 1, 1.15, 1.3].map((v) => `<button data-v="${v}" class="${st.uiScale === v ? 'on' : ''}">${Math.round(v * 100)}%</button>`).join('')}</span></label>
      <label>Touch controls <span class="seg" data-k="touchControls">${(['auto', 'on', 'off'] as const).map((v) => `<button data-v="${v}" class="${st.touchControls === v ? 'on' : ''}">${v === 'auto' ? 'Auto' : v === 'on' ? 'Always' : 'Never'}</button>`).join('')}</span></label>
      <p style="font-size:0.8em;color:var(--ink-dim)">Debug panel: <kbd>F3</kbd>.</p></div>`;
    this.modal(html, onClose, (root) => {
      root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
        inp.addEventListener('input', () => {
          (st as unknown as Record<string, number>)[inp.dataset.k!] = Number(inp.value);
          onChange(st);
        }),
      );
      root.querySelectorAll<HTMLElement>('.seg').forEach((seg) =>
        seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            const k = seg.dataset.k!;
            const v = b.dataset.v!;
            (st as unknown as Record<string, unknown>)[k] = k === 'uiScale' ? Number(v) : v;
            seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            onChange(st);
          }),
        ),
      );
      root.querySelectorAll<HTMLButtonElement>('.toggle').forEach((b) =>
        b.addEventListener('click', () => {
          const k = b.dataset.k as 'reduceFlash' | 'reduceShake' | 'manualAim';
          st[k] = !st[k];
          b.classList.toggle('on', st[k]);
          b.textContent = yn(st[k]);
          onChange(st);
        }),
      );
    });
  }

  // ----------------------------------------------------------------- HUD
  hudVisible(on: boolean): void {
    $('#hud').classList.toggle('on', on);
    if (!on) this.bossBar(null, 0);
  }

  hud(d: HudData, actLabel: string): void {
    const hud = $('#hud');
    const owned = ['w_arrow', 'w_crown', ...CARDS.filter((c) => c.kind === 'weapon' && (d.levels[c.id] ?? 0) > 0).map((c) => c.id)];
    const key = owned.join(',');
    if (this.hudBuilt !== key || !hud.innerHTML) {
      this.hudBuilt = key;
      const name = (id: string) => (id === 'w_arrow' ? 'Rune Arrow' : id === 'w_crown' ? 'Ember Crown' : CARD_BY_ID[id].name);
      hud.innerHTML = `
        <div class="xp"><div class="f"></div></div>
        <div class="tl">
          <div class="bar hp" title="Health"><div class="ghost"></div><div class="f"></div><div class="t"></div></div>
          <div class="bar en" title="Crown energy"><div class="f"></div><div class="t"></div></div>
          <div class="lvl">Level 1</div></div>
        <div class="tc"><div class="act"></div><div class="obj"></div><div class="bar small chan" style="display:none"><div class="f"></div></div></div>
        <div class="tr"><div><img src="${icon('u_focus')}" alt=""><b class="time">00:00</b></div>
          <div title="Kills"><img src="${icon('u_fury')}" alt=""><b class="kills">0</b></div>
          <div title="Amber Embers"><img src="${icon('w_crown')}" alt=""><b class="coins">0</b></div></div>
        <div class="boss"><div class="name"></div><div class="bar boss"><div class="ghost"></div><div class="f"></div></div></div>
        <div class="weapons">${owned.map((id) => `<div class="slot w" data-id="${id}" title="${name(id)}"><img src="${icon(id === 'w_arrow' ? 'w_arrow' : id === 'w_crown' ? 'w_crown' : CARD_BY_ID[id].icon)}" alt="">${CARD_BY_ID[id] ? `<div class="lv">${'<i></i>'.repeat(CARD_BY_ID[id].max)}</div>` : ''}</div>`).join('')}</div>
        <div class="hint"></div>
        <div class="round">
          <div class="rb pulse" title="Crown Pulse (Q)"><img src="${icon('u_pulse')}" alt=""><div class="cd"></div><span class="key">Q</span></div>
          <div class="rb dash" title="Dash (Space)"><img src="${icon('u_speed')}" alt=""><div class="cd"></div><span class="key">SPC</span></div></div>`;
      this.objective(this.objText, this.hintText);
    }
    $('.xp .f', hud).style.width = `${(d.xpFrac * 100).toFixed(1)}%`;
    $('.lvl', hud).textContent = `Level ${d.level}`;
    const hpF = Math.max(0, d.hp / d.maxHp) * 100;
    $('.hp .f', hud).style.width = `${hpF}%`;
    $('.hp .ghost', hud).style.width = `${hpF}%`;
    $('.hp .t', hud).textContent = `${Math.ceil(d.hp)} / ${d.maxHp}`;
    $('.en .f', hud).style.width = `${d.energy}%`;
    $('.en .t', hud).textContent = `Energy ${Math.floor(d.energy)}`;
    $('.act', hud).textContent = actLabel;
    $('.obj', hud).textContent = d.objTime !== null ? `${this.objText} — ${fmtTime(d.objTime).replace(/^0/, '')}` : this.objText;
    $('.time', hud).textContent = fmtTime(d.time);
    $('.kills', hud).textContent = String(d.kills);
    $('.coins', hud).textContent = String(d.coins);
    const chan = $('.chan', hud);
    chan.style.display = d.channel > 0 ? 'block' : 'none';
    if (d.channel > 0) $('.f', chan).style.width = `${Math.min(100, d.channel * 100)}%`;
    const pulse = $('.pulse', hud);
    const pReady = d.pulseCd <= 0 && d.energy >= d.pulseCost;
    pulse.classList.toggle('ready', pReady);
    const pf = d.pulseCd > 0 ? d.pulseCd / d.pulseCdMax : d.energy < d.pulseCost ? 1 - d.energy / d.pulseCost : 0;
    $('.cd', pulse).style.setProperty('--p', `${(pf * 100).toFixed(0)}%`);
    $('.dash .cd', hud).style.setProperty('--p', `${((d.dashCd / d.dashCdMax) * 100).toFixed(0)}%`);
    hud.querySelectorAll<HTMLElement>('.slot.w').forEach((s) => {
      const lv = d.levels[s.dataset.id!] ?? 0;
      s.querySelectorAll('.lv i').forEach((i, k) => i.classList.toggle('on', k < lv));
    });
    // tutorial hint fades out by itself after a few seconds
    this.hintT -= 1 / 60;
    $('.hint', hud).classList.toggle('on', !!this.hintText && this.hintT > 0);
  }

  private objText = '';
  private hintText = '';
  private hintT = 0;

  objective(text: string, hint?: string): void {
    this.objText = text;
    this.hintText = hint ?? '';
    this.hintT = 9;
    const h = document.querySelector('#hud .hint');
    if (h) h.textContent = this.hintText;
  }

  bossBar(name: string | null, frac: number): void {
    const b = document.querySelector<HTMLElement>('#hud .boss');
    if (!b) return;
    b.classList.toggle('on', !!name);
    if (!name) return;
    $('.name', b).textContent = name;
    $('.f', b).style.width = `${frac * 100}%`;
    $('.ghost', b).style.width = `${frac * 100}%`;
  }

  banner(t1: string, t2 = '', dur = 2.4): void {
    const b = $('#banner');
    $('.b1', b).textContent = t1;
    $('.b2', b).textContent = t2;
    b.classList.add('on');
    this.bannerT = dur;
  }

  tick(dt: number): void {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) $('#banner').classList.remove('on');
    }
  }

  // ---------------------------------------------------------------- cards
  cards(offer: CardDef[], levels: Levels, title: string, rerolls: number, onPick: (c: CardDef) => void, onReroll: () => void): void {
    const s = this.screens.cards;
    const portrait = window.innerWidth < window.innerHeight;
    const scale = Math.max(1.5, Math.min(3, Math.min(window.innerHeight * 0.62 / 148, (window.innerWidth * 0.92) / (3 * 104 + 40))));
    s.innerHTML = `<h2>${title}</h2><div class="sub">Choose a card · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></div><div class="row"></div>
      <div class="actions">${rerolls > 0 ? `<button class="btn" data-r>Reroll (${rerolls})</button>` : ''}</div>`;
    const row = $('.row', s);
    offer.forEach((c, i) => {
      const next = (levels[c.id] ?? 0) + 1;
      const lvl = c.kind === 'heal' ? 'Restoration' : c.max === 1 ? 'Transformation' : next === 1 ? (c.kind === 'weapon' ? 'New weapon' : 'New') : `Level ${next - 1} → ${next}`;
      const card = el(`<button class="card ${c.rarity} ${portrait ? 'compact' : ''}" style="--s:${scale.toFixed(2)}" aria-label="${c.name}">
        <div class="rar">${RARITY_LABEL[c.rarity]}</div>
        <div class="ill"><img src="${icon(c.icon)}" alt="">${c.rarity !== 'common' ? '<div class="shine"></div>' : ''}</div>
        <div class="nm">${c.name}</div><div class="lvl">${lvl} · ${RARITY_LABEL[c.rarity].split(' · ')[1]}</div>
        <div class="ds">${c.desc(Math.min(next, c.max))}</div><kbd class="k">${i + 1}</kbd></button>`);
      card.addEventListener('click', () => onPick(c));
      row.appendChild(card);
    });
    s.querySelector('[data-r]')?.addEventListener('click', onReroll);
    this.show('cards');
    if (offer.some((c) => c.rarity === 'legendary')) audio.play('legendary');
    else if (offer.some((c) => c.rarity === 'rare')) audio.play('rare');
    else audio.play('card_open');
    this.keyHandler = (code) => {
      const idx = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(code) % 3;
      if (idx >= 0 && offer[idx]) {
        onPick(offer[idx]);
        return true;
      }
      if (code === 'KeyR' && rerolls > 0) {
        onReroll();
        return true;
      }
      return false;
    };
  }

  // ---------------------------------------------------------------- pause
  pause(cb: { resume(): void; restart(): void; settings(): void; quit(): void }): void {
    const s = this.screens.pause;
    s.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:10px;align-items:center">
      <h2>Paused</h2>
      <button class="btn" data-a="resume">Resume</button>
      <button class="btn" data-a="restart">Restart act<span class="sub">back to the start of the current act</span></button>
      <button class="btn" data-a="settings">Settings</button>
      <button class="btn" data-a="quit">Quit to menu<span class="sub">progress is saved at the start of each act</span></button></div>`;
    s.querySelectorAll<HTMLButtonElement>('.btn').forEach((b) => b.addEventListener('click', () => cb[b.dataset.a as keyof typeof cb]()));
    this.show('pause');
    this.focusFirst(s);
    this.keyHandler = (code) => {
      if (code === 'Escape') {
        cb.resume();
        return true;
      }
      return this.navKeys(s, code);
    };
  }

  // --------------------------------------------------------------- results
  results(r: ResultData, cb: { replay(): void; menu(): void }): void {
    const s = this.screens.results;
    const ups = Object.entries(r.levels).filter(([id, v]) => v > 0 && CARD_BY_ID[id] && CARD_BY_ID[id].kind !== 'heal');
    s.innerHTML = `<div class="panel results">
      <h2 style="color:${r.victory ? 'var(--gold)' : 'var(--blood)'}">${r.victory ? 'The Veil is sealed' : 'The ember went out'}</h2>
      <p style="text-align:center">${r.victory ? 'The Anchor burns again and the Golem Warlord has fallen. The garden breathes — for now.' : 'The tide won this time — but every attempt reveals new combinations. Try again.'}</p>
      <div class="grid">
        <div>Time <b>${fmtTime(r.time)}</b></div><div>Enemies slain <b>${r.kills}</b></div>
        <div>Damage dealt <b>${Math.round(r.damage).toLocaleString('en-US')}</b></div><div>Level reached <b>${r.level}</b></div>
        <div>Acts cleared <b>${r.actsDone} / ${ACTS.length}</b></div><div>Amber Embers <b>+${r.coins}</b></div>
      </div>
      <div class="ups">${ups.map(([id, v]) => `<img src="${icon(CARD_BY_ID[id].icon)}" title="${CARD_BY_ID[id].name} lv ${v}" alt="${CARD_BY_ID[id].name}">`).join('')}</div>
      <div class="row"><button class="btn" data-a="replay">${r.victory ? 'Play again' : 'Try again'}</button><button class="btn" data-a="menu">Main menu</button></div></div>`;
    s.querySelectorAll<HTMLButtonElement>('.btn').forEach((b) => b.addEventListener('click', () => cb[b.dataset.a as keyof typeof cb]()));
    this.show('results');
    this.focusFirst(s);
    this.keyHandler = (code) => this.navKeys(s, code);
  }

  // ------------------------------------------------------------ transition
  transition(roman: string, title: string, subtitle: string, holdMs: number, mid: () => void, done: () => void, art?: string): void {
    const s = this.screens.transition;
    s.innerHTML = `${art ? `<div class="tart" style="background-image:url('${asset(art)}')"></div>` : ''}<div class="roman">ACT ${roman}</div><div class="title">${title}</div><div class="subtitle">${subtitle}</div>`;
    s.classList.add('on');
    requestAnimationFrame(() => s.classList.add('vis'));
    setTimeout(() => {
      mid();
      setTimeout(() => {
        s.classList.remove('vis');
        setTimeout(() => {
          s.classList.remove('on');
          done();
        }, 650);
      }, holdMs);
    }, 700);
  }

  debug(text: string | null): void {
    const d = $('#debug');
    d.classList.toggle('on', text !== null);
    if (text !== null) d.textContent = text;
  }
}
