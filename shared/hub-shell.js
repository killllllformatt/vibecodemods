// vibecodemods/ hub shell — the mode-agnostic panel every vibecodemods hub is built on.
//
// What the shell owns: the panel frame (look from shared/hub-shell.css), drag (mouse + touch),
// minimize, close, the ` (backtick) show/hide key, the tab bar, the toast, one-time banners, the
// first-use acknowledgement, the Connecting / Not supported screens and the Settings tab (panel
// opacity, reset position, about). It also hands every mode a small component kit (`ui`).
//
// What a mode owns: detecting itself, its engine, its header strip, its tabs and its settings.
// A mode is one plain object pushed onto VCM_MODES (see the contract below and README.md), so a
// new mode = a new file in modes/. A new hub = this file + its own mode files + a tiny main.js.
//
// No keybinds beyond the backtick, no looping animations (Chromebooks): only the STAX
// transitions (tab pill, toggles, button press, toast) run, and nothing updates while the panel is
// minimized or hidden.
//
// Mode contract (all fields optional except id, name, detect, tabs):
//   id, name                     'tno', 'Trust No One' (name shows in the header chip)
//   css                          mode-only CSS; write `[data-mode="<id>"]` scoped rules
//   install(hub)                 start the engine once at boot (every mode, active or not);
//                                register teardown with hub.onDestroy(fn)
//   detect()                     'yes' (this is the game) | 'maybe' (could be, e.g. lobby)
//                                | 'wait' (still connecting) | 'no'
//   waiting()                    while detect() says 'wait': { status, icon, title, text } to show
//                                instead of the Connecting skeleton (e.g. "Enter the game code"), or null
//   status()                     { dot: 'live'|'warn'|'idle'|'done'|'', text, tone: ''|'dim'|'warn',
//                                  who }  who = your in-game name, shown dim after the text
//   strip(ui)                    -> { node, update() }  header strip numbers
//   mini()                       -> text shown next to the dot while minimized
//   ack                          first-use text, shown once over tabs marked pub:true
//   tabs: [{ id, label, pub, pubNote, build(ui, hub) -> { nodes:[...], update() } }]
//   settings(ui, hub)            -> { nodes:[...], update() }  appended to the shell Settings tab
//   tick()                       called every UI refresh while this mode is active (banners etc.)
const VCM_MODES = [];

/* @HUB_CSS@ */ // build.mjs replaces this line with `const VCM_HUB_CSS = <hub-shell.css>;`

function createHub(opts) {
  const ROOT = 'vcm-hub';
  const KEY = opts.storageKey || 'vcm-hub-ui';
  const cleanups = [];
  let alive = true;

  // ---------- saved UI state (per viewer, best effort) ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  saved.tab = saved.tab || {};
  saved.acked = saved.acked || {};
  saved.dismissed = saved.dismissed || {};
  if (typeof saved.opacity !== 'number') saved.opacity = 1;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  // ---------- component kit ----------
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'cls') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'style') n.style.cssText = props[k];
      else if (k === 'data') Object.assign(n.dataset, props[k]);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
      else if (k in n) n[k] = props[k];
      else n.setAttribute(k, props[k]);
    }
    n.append(...kids.flat().filter((x) => x != null && x !== false));
    return n;
  };
  const svg = (d) => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 16 16">${d}</svg>`; return t.content.firstChild; };
  const ICON = {
    min: '<path d="M4 8h8"/>', restore: '<path d="M4 6.5l4 4 4-4"/>', close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3v.2"/>',
  };
  // Write-only-if-changed helpers: render runs on a timer, so these keep the DOM still (an open
  // <select> or a hovered button is never rebuilt under the pointer).
  const put = (n, t) => { t = t == null ? '' : String(t); if (n.textContent !== t) n.textContent = t; };
  const cls = (n, c, on) => { if (n.classList.contains(c) !== !!on) n.classList.toggle(c, !!on); };
  const show = (n, on) => { const v = on ? '' : 'none'; if (n.style.display !== v) n.style.display = v; };
  const prop = (n, k, v) => { if (n[k] !== v) n[k] = v; };
  const setKids = (n, kids) => { const a = kids.filter(Boolean); if (a.length !== n.childNodes.length || a.some((k, i) => n.childNodes[i] !== k)) n.replaceChildren(...a); };

  // Keyed list reconcile: rows are created once per key and moved, never rebuilt.
  function keyed(container, items, keyOf, create, update) {
    const map = container._rows || (container._rows = new Map());
    const want = new Set();
    items.forEach((it, i) => {
      const k = keyOf(it, i);
      want.add(k);
      let row = map.get(k);
      if (!row) { row = create(it); map.set(k, row); }
      update(row, it, i);
      const node = row.node || row;
      if (container.children[i] !== node) container.insertBefore(node, container.children[i] || null);
    });
    for (const [k, row] of map) if (!want.has(k)) { (row.node || row).remove(); map.delete(k); }
  }

  const card = (...kids) => el('div', { cls: 'card' }, ...kids);
  const listCard = (...kids) => el('div', { cls: 'card list' }, ...kids);
  const lbl = (text) => el('div', { cls: 'lbl', text });
  const lblrow = (label, right) => el('div', { cls: 'lblrow' }, typeof label === 'string' ? lbl(label) : label, right);
  const note = (text) => el('div', { cls: 'note', text });
  const why = (text, soft) => el('div', { cls: 'why' + (soft ? ' soft' : ''), text: text || '' });
  const btn = (text, fn, pri) => el('button', { type: 'button', cls: 'btn' + (pri ? ' pri' : ''), text, onclick: fn });
  const kv = (k, v) => { const vn = typeof v === 'object' && v ? v : el('span', { cls: 'v', text: v == null ? '—' : v }); return { node: el('div', { cls: 'kv' }, el('span', { cls: 'k', text: k }), vn), v: vn }; };
  const empty = (icon, title, text) => {
    const t = el('b', { text: title }), s = el('span', { text: text || '' });
    return { node: el('div', { cls: 'empty' }, el('span', { cls: 'e', text: icon }), t, s), set(title2, text2, icon2) { put(t, title2); put(s, text2); if (icon2) put(this.node.firstChild, icon2); } };
  };
  const warnBox = (html) => { const s = el('span'); s.innerHTML = html; return { node: el('div', { cls: 'warn' }, svg(ICON.warn), s), set(h) { if (s._h !== h) { s.innerHTML = h; s._h = h; } } }; };
  const skeleton = (rows = 4) => listCard(...Array.from({ length: rows }, (_, i) =>
    el('div', { cls: 'li' }, el('i', { cls: 'sk c' }), el('i', { cls: 'sk', style: `width:${[44, 58, 36, 50][i % 4]}%` }))));
  const livechip = () => el('span', { cls: 'livechip' });
  const hint = () => el('div', { cls: 'hint' });
  const pubnote = (text) => el('div', { cls: 'pubnote', text });

  // Toggle row: full-width switch with title + sub-line. get/set read and write the setting.
  function toggleRow({ title, sub, get, set }) {
    const cb = el('input', { type: 'checkbox', onchange: () => { set(cb.checked); hub.refresh(); } });
    const t = el('b', { text: title }), s = el('small', { text: sub || '' });
    const node = el('label', { cls: 'sw' }, el('span', {}, t, s), cb, el('i'));
    return {
      node, input: cb,
      update({ sub: sub2, disabled, reason, hot } = {}) {
        prop(cb, 'checked', !!get());
        prop(cb, 'disabled', !!disabled);
        cls(node, 'dis', !!disabled);
        cls(node, 'hot', !!hot);
        cls(s, 'why', !!reason);
        put(s, reason || sub2 || sub || '');
      },
    };
  }
  // Bare switch (used inside action rows). state: '' | 'on' | 'wait'
  function bareToggle(onChange) {
    const cb = el('input', { type: 'checkbox', onchange: () => { onChange(cb.checked); hub.refresh(); } });
    const node = el('label', { cls: 'tg' }, cb, el('i'));
    return { node, input: cb, update(on, wait, disabled) { prop(cb, 'checked', !!on); prop(cb, 'disabled', !!disabled); cls(node, 'wait', !!wait); } };
  }
  // Segmented control: options [{ value, label }]
  function seg(options, get, set) {
    const btns = options.map((o) => el('button', { type: 'button', text: o.label, onclick: () => { set(o.value); hub.refresh(); } }));
    const node = el('div', { cls: 'seg' }, btns);
    return { node, update(disabled) { const v = get(); btns.forEach((b, i) => { cls(b, 'on', options[i].value === v); prop(b, 'disabled', !!disabled); }); } };
  }
  // Slider: hidden native range over the designed track (works with touch + keyboard).
  function slider({ title, min, max, step = 1, get, set, fmt = (v) => v }) {
    const fill = el('b'), knob = el('u'), val = el('span', { cls: 'val' });
    const input = el('input', { type: 'range', min, max, step, oninput: () => { set(+input.value); paint(); }, onchange: () => hub.refresh() });
    const paint = () => {
      const v = get(), f = Math.max(0, Math.min(1, (v - min) / (max - min))) * 100 + '%';
      if (fill.style.width !== f) { fill.style.width = f; knob.style.left = f; }
      if (+input.value !== v) input.value = v;
      put(val, fmt(v));
    };
    const node = el('div', { cls: 'sl' }, el('b', { text: title }), el('div', { cls: 'rng' }, el('i', {}, fill), knob, input), val);
    return { node, update(disabled) { paint(); prop(input, 'disabled', !!disabled); cls(node, 'dis', !!disabled); } };
  }
  // Native select with the designed look; options are reconciled in place so an open menu survives.
  function select({ placeholder, get, set }) {
    const node = el('select', { onchange: () => { set(node.value); hub.refresh(); } });
    const ph = el('option', { value: '', text: placeholder || '—' });
    node.append(ph);
    return {
      node,
      update(options, disabled) { // options: [{ value, label, disabled }]
        keyed({ get children() { return [...node.options].slice(1); }, insertBefore: (n, ref) => node.insertBefore(n, ref || null), _rows: node._rows || (node._rows = new Map()) },
          options, (o) => o.value, (o) => el('option', { value: o.value }),
          (opt, o) => { put(opt, o.label); prop(opt, 'disabled', !!o.disabled); });
        const v = get() || '';
        if (node.value !== v) node.value = options.some((o) => o.value === v) ? v : '';
        cls(node, 'ph', !node.value);
        prop(node, 'disabled', !!disabled);
      },
    };
  }
  // Stat tiles: n = 3 or 5. set(i, value, small)
  function stats(labels) {
    const tiles = labels.map((k) => { const v = el('div', { cls: 'v' }); return { v, node: el('div', { cls: 'stat' }, el('div', { cls: 'k', text: k }), v) }; });
    const node = el('div', { cls: 'stats' + (labels.length === 5 ? ' s5' : '') }, tiles.map((t) => t.node));
    return { node, set(i, value, small) { const h = String(value) + (small ? `<small>${small}</small>` : ''); if (tiles[i].v._h !== h) { tiles[i].v.innerHTML = h; tiles[i].v._h = h; } } };
  }
  // Action row: name, cost, badges, sub-line, a "do once" button and an Auto switch.
  // update({ name, cost, badges:[{text, warm}], state:''|'on'|'wait'|'fired'|'dis', sub, subWhy,
  //          special, useLabel, useDisabled, auto, autoDisabled })
  function actionRow({ onUse, onAuto }) {
    // The name gets the full width (never cut off); cost + badges + status share the line below.
    const name = el('b', { cls: 'an' }), cost = el('span', { cls: 'cost' }), badges = el('span', { style: 'display:contents' });
    const sub = el('small', { cls: 'sub' });
    const use = el('button', { type: 'button', cls: 'mb', onclick: () => { onUse(); hub.refresh(); } });
    const tg = bareToggle(onAuto);
    const node = el('div', { cls: 'ar' }, el('div', { cls: 'nm' }, name, el('div', { cls: 'am' }, cost, badges, sub)), use, tg.node);
    return {
      node,
      update(o) {
        put(name, o.name);
        put(cost, o.cost == null ? '' : o.cost);
        const bk = JSON.stringify(o.badges || []);
        if (badges._k !== bk) { badges._k = bk; badges.replaceChildren(...(o.badges || []).map((b) => el('span', { cls: 'badge' + (b.warm ? ' warm' : ''), text: b.text, title: b.title || '' }))); }
        for (const s of ['on', 'wait', 'fired', 'dis']) cls(node, s, o.state === s);
        cls(node, 'special', !!o.special);
        cls(sub, 'why', !!o.subWhy);
        cls(sub, 'soft', o.subWhy === 'soft');
        put(sub, o.sub || '');
        put(use, o.useLabel || 'Use');
        prop(use, 'disabled', !!o.useDisabled);
        tg.update(o.auto, o.state === 'wait', o.autoDisabled);
      },
    };
  }
  // List row: leading avatar/icon, name (+ dim suffix), tags [{ text, tone:'a'|'b'|'w'|'' }].
  function listRow() {
    const av = el('span', { cls: 'av' }), nm = el('span', { cls: 'n' }), nmT = document.createTextNode(''), nmS = el('em');
    nm.append(nmT, nmS);
    const tags = el('span', { cls: 'tags' });
    const node = el('div', { cls: 'li' }, av, nm, tags);
    return {
      node,
      update(o) {
        put(av, o.icon || '');
        if (av.className !== 'av ' + (o.iconCls || '')) av.className = 'av ' + (o.iconCls || '');
        if (nmT.data !== o.name) nmT.data = o.name;
        put(nmS, o.suffix ? ' ' + o.suffix : '');
        cls(node, 'is-you', !!o.you);
        cls(node, 'is-out', !!o.out);
        const tk = JSON.stringify(o.tags || []);
        if (tags._k !== tk) { tags._k = tk; tags.replaceChildren(...(o.tags || []).map((t) => el('span', { cls: 'tag' + (t.tone ? ' ' + t.tone : ''), text: t.text }))); }
      },
    };
  }
  // Log feed, newest first. entries: [{ t, kind, text, confirms }] — `confirms` = this entry
  // confirms the one just below it. kinds: { kind: { icon, tone } }
  function logFeed(kinds, emptyText) {
    const list = listCard();
    const none = empty('📜', emptyText || 'Nothing yet', '');
    const fmt = (t) => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    return {
      node: list,
      update(entries) {
        if (!entries.length) { setKids(list, [none.node]); return; }
        if (list.firstChild === none.node) none.node.remove();
        keyed(list, entries, (e) => e, (e) => {
          const k = kinds[e.kind] || { icon: '·' };
          return el('div', { cls: 'lg' }, el('time', { text: fmt(e.t) }), el('span', { cls: 'kd ' + (k.tone || ''), text: k.icon }), el('span', { cls: 'tx', text: e.text }));
        }, (row, e) => {
          cls(row, 'cf', !!e.confirms);
          const has = row.lastChild.className === 'cfm';
          if (e.confirms && !has) row.append(el('span', { cls: 'cfm', text: 'confirms ↓' }));
          if (!e.confirms && has) row.lastChild.remove();
        });
      },
    };
  }

  const ui = {
    el, svg, ICON, put, cls, show, prop, setKids, keyed,
    card, listCard, lbl, lblrow, note, why, btn, kv, empty, warnBox, skeleton, livechip, hint, pubnote,
    toggleRow, bareToggle, seg, slider, select, stats, actionRow, listRow, logFeed,
  };

  // ---------- panel chrome ----------
  const style = el('style', { text: (VCM_HUB_CSS + '\n' + opts.modes.map((m) => m.css || '').join('\n')) });
  const panel = el('div', { id: ROOT });
  const chip = el('span', { cls: 'chip' });
  const miniDot = el('i', { cls: 'dot' }), miniTxt = el('span');
  const mini = el('span', { cls: 'mini' }, miniDot, miniTxt);
  const minBtn = el('button', { type: 'button', cls: 'ic', title: 'Minimize (` hides)', 'aria-label': 'Minimize' }, svg(ICON.min));
  const closeBtn = el('button', { type: 'button', cls: 'ic', title: 'Turn off', 'aria-label': 'Close' }, svg(ICON.close));
  const head = el('div', { cls: 'hd' },
    el('div', { cls: 'wm' }, el('strong', { text: 'vibecode' }), 'mods', el('em', { text: '/' })),
    chip, el('span', { cls: 'sp' }), mini, minBtn, closeBtn);
  const stDot = el('i', { cls: 'dot' }), stTxt = el('b'), stWho = el('span', { cls: 'who' });
  const st = el('span', { cls: 'st' }, stDot, stTxt, stWho);
  const stripSlot = el('span', { cls: 'strip' });
  const meta = el('div', { cls: 'meta' }, st, stripSlot);
  const bannerSlot = el('div', { style: 'display:contents' });
  const pill = el('i', { cls: 'pill' });
  const tabsEl = el('div', { cls: 'tabs' });
  const body = el('div', { cls: 'body' });
  const toastEl = el('div', { cls: 'toast' });
  panel.append(head, meta, bannerSlot, tabsEl, body, toastEl);

  let toastTimer = 0;
  function toast(msg) {
    put(toastEl, msg);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // One-time dismissible banner (remembered per id).
  const banners = new Map();
  function banner(id, title, text) {
    if (saved.dismissed[id] || banners.has(id)) return;
    const b = el('div', { cls: 'banner' },
      el('span', {}, el('b', { text: title }), el('small', { text: text || '' })),
      el('button', { type: 'button', cls: 'ic', 'aria-label': 'Dismiss', onclick: () => { saved.dismissed[id] = 1; save(); b.remove(); } }, svg(ICON.close)));
    banners.set(id, b);
    bannerSlot.append(b);
  }

  // ---------- modes, tabs, screens ----------
  const hub = { ui, toast, banner, refresh: () => refresh(), onDestroy: (f) => cleanups.push(f), saved, save, opts };
  let active = null;      // active mode object
  let screen = '';        // 'mode' | 'wait' | 'no'
  let built = null;       // { mode, tabs:[{def, page}], settings }
  let current = '';       // current tab id

  const settingsDef = { id: 'settings', label: 'Settings', build: buildSettings };
  function buildSettings() {
    const op = slider({ title: 'Opacity', min: 40, max: 100, step: 5, get: () => Math.round(saved.opacity * 100), set: (v) => { saved.opacity = v / 100; applyOpacity(); save(); }, fmt: (v) => v + '%' });
    const kbd = el('span', { cls: 'v' }, el('kbd', { text: '`' }));
    const modeV = kv('Mode', '—');
    const modePart = active && active.settings ? active.settings(ui, hub) : null;
    const nodes = [
      lbl('Panel'), listCard(op.node),
      el('div', { cls: 'row' }, btn('Reset position', () => { delete saved.x; delete saved.y; panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.maxHeight = ''; save(); toast('Back in the corner'); })),
      lbl('Show / hide'),
      card(kv('Keyboard', kbd).node, kv('Touch or mouse', 'tap – in the header').node, kv('Turn off', 'click the bookmark again').node),
    ];
    if (modePart) nodes.push(lbl(active.name), ...modePart.nodes);
    nodes.push(lbl('About'), card(kv('Version', opts.version || '—').node, modeV.node));
    return { nodes, update() { op.update(); put(modeV.v, active ? active.name : '—'); if (modePart && modePart.update) modePart.update(); } };
  }

  function buildMode(mode) {
    panel.dataset.mode = mode.id;
    const defs = mode.tabs.concat(settingsDef);
    const tabs = defs.map((def) => ({ def, page: null, btn: el('button', { type: 'button', text: def.label, onclick: () => showTab(def.id) }) }));
    tabs.forEach((t) => cls(t.btn, 'pub', !!t.def.pub));
    tabsEl.replaceChildren(pill, ...tabs.map((t) => t.btn));
    tabsEl.style.setProperty('--n', tabs.length);
    pill.style.setProperty('--n', tabs.length);
    stripSlot.replaceChildren();
    const strip = mode.strip ? mode.strip(ui, hub) : null;
    if (strip) stripSlot.append(strip.node);
    built = { mode, tabs, strip };
    put(chip, mode.name);
    showTab(saved.tab[mode.id] && defs.some((d) => d.id === saved.tab[mode.id]) ? saved.tab[mode.id] : defs[0].id);
  }

  // First-use acknowledgement over the tabs that others can notice (pub).
  function ackPage(mode) {
    return { nodes: [el('div', { cls: 'card ack' }, el('div', { cls: 'cap', text: 'Before you start' }), el('p', { cls: 'tx', text: mode.ack }),
      btn('I understand', () => { saved.acked[mode.id] = 1; save(); const id = current; current = ''; showTab(id); }, true))], update() {} };
  }

  function showTab(id) {
    if (!built) return;
    const i = Math.max(0, built.tabs.findIndex((t) => t.def.id === id));
    const t = built.tabs[i];
    current = t.def.id;
    built.tabs.forEach((x, j) => cls(x.btn, 'on', j === i));
    pill.style.setProperty('--i', i);
    let page;
    if (t.def.pub && built.mode.ack && !saved.acked[built.mode.id]) page = t.ack || (t.ack = ackPage(built.mode));
    else {
      if (!t.page || t.page.isAck) t.page = t.def.id === 'settings' ? buildSettings() : t.def.build(ui, hub);
      page = t.page;
      if (t.def.pub && t.def.pubNote && !page._pub) { page._pub = 1; page.nodes.unshift(pubnote(t.def.pubNote)); }
    }
    body.replaceChildren(...page.nodes);
    body.scrollTop = 0;
    saved.tab[built.mode.id] = current;
    save();
    clamp();
    refresh();
  }

  // Shell screens: connecting (skeleton) and not supported (list of modes this hub knows).
  // Connecting = skeleton; a mode's waiting() info (e.g. "Enter the game code") replaces it.
  const waitSkel = skeleton(4), waitNote = note('Connecting to the game… this can take up to 25 seconds.');
  const waitInfo = empty('', '', '');
  const waitInfoCard = listCard(waitInfo.node);
  const waitPage = [waitInfoCard, waitSkel, waitNote];
  let waitMsg = null;
  const noCard = card(el('div', { cls: 'cap', text: 'Not supported here' }), el('p', { cls: 'tx', style: 'margin-top:6px', text: opts.unsupportedText || 'Open a supported game and click the bookmark again.' }));
  const noPage = [noCard, lbl('Works in'), listCard(...opts.modes.map((m) => el('div', { cls: 'li' }, el('span', { cls: 'av', text: m.icon || '🎮' }), el('span', { cls: 'n', text: m.name })))), note('More modes coming soon.')];
  function showScreen(kind) {
    if (screen === kind) return;
    screen = kind;
    built = null;
    current = '';
    delete panel.dataset.mode;
    stripSlot.replaceChildren();
    // Preview the first mode's tabs, disabled, so the panel doesn't jump when the game connects.
    const labels = ((opts.modes[0] && opts.modes[0].tabs) || []).map((t) => t.label).concat('Settings');
    tabsEl.replaceChildren(pill, ...labels.map((x) => el('button', { type: 'button', text: x })));
    tabsEl.style.setProperty('--n', labels.length); pill.style.setProperty('--n', labels.length); pill.style.setProperty('--i', 0);
    cls(tabsEl, 'off', true);
    show(tabsEl, kind === 'wait');
    put(chip, opts.site || 'Hub');
    body.replaceChildren(...(kind === 'wait' ? waitPage : noPage));
  }

  function pickMode() {
    let best = null, rank = 0;
    const order = { yes: 3, maybe: 2, wait: 1 };
    for (const m of opts.modes) {
      let d = 'no';
      try { d = m.detect(); } catch (e) {}
      if ((order[d] || 0) > rank) { rank = order[d]; best = { m, d }; }
    }
    return best;
  }

  function refresh() {
    if (!alive) return;
    const pick = pickMode();
    if (!pick) { showScreen('no'); active = null; }
    else if (pick.d === 'wait' && !(active && screen === 'mode' && active === pick.m)) { showScreen('wait'); active = null; }
    else if (active !== pick.m || screen !== 'mode') { active = pick.m; screen = 'mode'; cls(tabsEl, 'off', false); show(tabsEl, true); buildMode(active); }

    // still joining (code / name screen): the mode says what to do next
    waitMsg = null;
    if (screen === 'wait' && pick && pick.m.waiting) try { waitMsg = pick.m.waiting(); } catch (e) {}
    if (screen === 'wait') {
      show(waitInfoCard, !!waitMsg); show(waitSkel, !waitMsg); show(waitNote, !waitMsg);
      if (waitMsg) waitInfo.set(waitMsg.title, waitMsg.text, waitMsg.icon);
    }

    // status line + minimized readout
    let s = { dot: 'idle', text: screen === 'wait' ? (waitMsg && waitMsg.status) || 'Connecting…' : 'Not supported here', tone: screen === 'no' ? 'warn' : 'dim' };
    if (screen === 'no') s.dot = 'warn';
    if (screen === 'mode' && active.status) try { s = active.status() || s; } catch (e) {}
    stDot.className = 'dot' + (s.dot ? ' ' + s.dot : '');
    st.className = 'st' + (s.tone ? ' ' + s.tone : '');
    put(stTxt, s.text);
    put(stWho, s.who || '');
    stWho.title = s.who || '';
    miniDot.className = stDot.className;
    let mt = '';
    if (screen === 'mode' && active.mini) try { mt = active.mini() || ''; } catch (e) {}
    put(miniTxt, mt);

    const hidden = panel.style.display === 'none' || panel.classList.contains('min');
    if (hidden || screen !== 'mode' || !built) return;
    try { if (active.tick) active.tick(); } catch (e) {}
    try { if (built.strip) built.strip.update(); } catch (e) {}
    const t = built.tabs.find((x) => x.def.id === current);
    const page = t && (t.def.pub && built.mode.ack && !saved.acked[built.mode.id] ? null : t.page);
    try { if (page && page.update) page.update(); } catch (e) { if (opts.debug) console.warn(e); }
  }

  // ---------- window behaviour (same as STAX) ----------
  const applyOpacity = () => { panel.style.opacity = saved.opacity < 1 ? String(saved.opacity) : ''; };
  const clamp = () => {
    if (!panel.style.left) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(innerWidth - r.width, r.left)) + 'px';
    const top = Math.max(0, Math.min(innerHeight - 48, r.top));
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(120, innerHeight - top - 16) + 'px';
  };
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ic') || e.button > 0) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.right = 'auto';
    panel.classList.add('drag');
    let raf = 0, lx = 0, ly = 0;
    const move = (ev) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; panel.style.left = lx - dx + 'px'; panel.style.top = ly - dy + 'px'; });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); raf = 0;
      panel.classList.remove('drag'); clamp();
      saved.x = panel.style.left; saved.y = panel.style.top; save();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  addEventListener('resize', clamp);
  cleanups.push(() => removeEventListener('resize', clamp));

  const setMin = (on) => {
    cls(panel, 'min', on);
    minBtn.replaceChildren(svg(on ? ICON.restore : ICON.min));
    minBtn.setAttribute('aria-label', on ? 'Restore' : 'Minimize');
    saved.min = on; save(); refresh();
  };
  minBtn.onclick = () => setMin(!panel.classList.contains('min'));
  head.ondblclick = (e) => { if (!e.target.closest('.ic')) minBtn.onclick(); };

  // ` shows/hides. The only key the hub uses — Chromebooks have no Insert or F-keys.
  const onKey = (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '`' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
      refresh();
    }
  };
  addEventListener('keydown', onKey);
  cleanups.push(() => removeEventListener('keydown', onKey));

  // ---------- boot ----------
  for (const m of opts.modes) {
    try { if (m.install) m.install(hub); } catch (e) { console.warn('[vibecodemods] mode', m.id, 'failed to start', e); }
  }
  (document.head || document.documentElement).append(style);
  document.documentElement.append(panel);
  if (saved.x) { panel.style.left = saved.x; panel.style.top = saved.y; panel.style.right = 'auto'; clamp(); }
  applyOpacity();
  if (saved.min) setMin(true);
  refresh();
  const timer = setInterval(refresh, opts.refreshMs || 500);
  cleanups.push(() => clearInterval(timer));

  function destroy() {
    if (!alive) return;
    alive = false;
    cleanups.splice(0).reverse().forEach((f) => { try { f(); } catch (e) {} });
    clearTimeout(toastTimer);
    panel.remove();
    style.remove();
    if (window[opts.global] === api) delete window[opts.global];
  }
  closeBtn.onclick = destroy;
  const api = { destroy, hub, modes: opts.modes, get active() { return active; } };
  return api;
}
