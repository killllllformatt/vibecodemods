// Gimkit "Trust No One" (impostor mode) helper — role reveal + answer assist + Mission Control automation.
//
// 1) Impostor reveal: the Blueboat server sends IMPOSTER_MODE_PEOPLE (every player's real role)
//    to ALL clients, and re-sends it whenever a client asks with IMPOSTER_MODE_REQUEST_PEOPLE
//    (the game itself asks when you open the investigation picker). We ask on inject and on every
//    phase change, so it works on a mid-game inject and ejections stay current.
// 2) Answer highlight: the current question object ships with `correct` flags on its answers.
// 3) Auto-answer (F8 toggle, off by default): clicks the correct answer, then Continue.
// 4) Mission Control automation: pick a target, then toggle auto actions. Every Mission Control
//    action is one frame — IMPOSTER_MODE_PURCHASE {item, on?} — and the server tracks your ⚡
//    energy itself: a purchase you can't afford is silently dropped, and a donation only ever
//    moves the energy you really have (no free/infinite anything). So automation just fires the
//    purchase when you can actually afford it. The available actions + their costs are read live
//    from the game's own shop list, so this works for whatever role you are (crewmate or impostor)
//    and for the donate-only shop you get after being voted out.
//
// Mode = classic (Blueboat), NOT Colyseus/Phaser: wss://<x>.gimkitconnect.com/blueboat (socket.io v2),
// binary frames = 0x04 + msgpack {type:2, data:[event, payload], nsp:"/"}.
// Insert = hide/show panel.  F8 = auto-answer.
//
// For UI code: window.__tnoReveal exposes state (people, me, target, on, auto, gameStatus), actions
// (purchase, vote, requestPeople) and read getters under .api — see HUB-BLUEPRINT.md §3.
(() => {
  if (window.__tnoReveal) return;
  const S = (window.__tnoReveal = {
    people: [], me: null, status: '', gameStatus: '', ws: null, room: null, auto: false,
    // Mission Control automation state:
    target: '',          // selected target player id
    on: {},              // { <shopItemId>: true } = that auto-action is armed
    lastAction: 0,       // throttle stamp
  });

  // --- minimal msgpack ---
  const td = new TextDecoder();
  const te = new TextEncoder();
  function decode(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    const str = (n) => { const s = td.decode(u8.subarray(o, o + n)); o += n; return s; };
    const arr = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; };
    const map = (n) => { const m = {}; for (let i = 0; i < n; i++) { const k = read(); m[k] = read(); } return m; };
    const bin = (n) => { const b = u8.slice(o, o + n); o += n; return b; };
    const ext = (n) => { o += 1 + n; return undefined; };
    function read() {
      const b = u8[o++];
      if (b < 0x80) return b;
      if (b < 0x90) return map(b & 0x0f);
      if (b < 0xa0) return arr(b & 0x0f);
      if (b < 0xc0) return str(b & 0x1f);
      if (b >= 0xe0) return b - 0x100;
      let v;
      switch (b) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: v = u8[o]; o += 1; return bin(v);
        case 0xc5: v = dv.getUint16(o); o += 2; return bin(v);
        case 0xc6: v = dv.getUint32(o); o += 4; return bin(v);
        case 0xc7: v = u8[o]; o += 1; return ext(v);
        case 0xc8: v = dv.getUint16(o); o += 2; return ext(v);
        case 0xc9: v = dv.getUint32(o); o += 4; return ext(v);
        case 0xca: v = dv.getFloat32(o); o += 4; return v;
        case 0xcb: v = dv.getFloat64(o); o += 8; return v;
        case 0xcc: v = u8[o]; o += 1; return v;
        case 0xcd: v = dv.getUint16(o); o += 2; return v;
        case 0xce: v = dv.getUint32(o); o += 4; return v;
        case 0xcf: v = Number(dv.getBigUint64(o)); o += 8; return v;
        case 0xd0: v = dv.getInt8(o); o += 1; return v;
        case 0xd1: v = dv.getInt16(o); o += 2; return v;
        case 0xd2: v = dv.getInt32(o); o += 4; return v;
        case 0xd3: v = Number(dv.getBigInt64(o)); o += 8; return v;
        case 0xd4: return ext(1);
        case 0xd5: return ext(2);
        case 0xd6: return ext(4);
        case 0xd7: return ext(8);
        case 0xd8: return ext(16);
        case 0xd9: v = u8[o]; o += 1; return str(v);
        case 0xda: v = dv.getUint16(o); o += 2; return str(v);
        case 0xdb: v = dv.getUint32(o); o += 4; return str(v);
        case 0xdc: v = dv.getUint16(o); o += 2; return arr(v);
        case 0xdd: v = dv.getUint32(o); o += 4; return arr(v);
        case 0xde: v = dv.getUint16(o); o += 2; return map(v);
        case 0xdf: v = dv.getUint32(o); o += 4; return map(v);
      }
      throw new Error('msgpack byte 0x' + b.toString(16));
    }
    return read();
  }
  // Encoder covering what Blueboat client frames use (maps, arrays, strings, small ints, bools,
  // undefined as fixext1 type 0 — the same "d4 00 00" the game's notepack emits).
  function encode(v, out = []) {
    if (v === undefined) out.push(0xd4, 0, 0);
    else if (v === null) out.push(0xc0);
    else if (v === true) out.push(0xc3);
    else if (v === false) out.push(0xc2);
    else if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v < 0x80) out.push(v);
      else { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); out.push(0xcb, ...new Uint8Array(b.buffer)); }
    } else if (typeof v === 'string') {
      const s = te.encode(v);
      if (s.length < 32) out.push(0xa0 | s.length);
      else if (s.length < 256) out.push(0xd9, s.length);
      else out.push(0xda, s.length >> 8, s.length & 0xff);
      out.push(...s);
    } else if (Array.isArray(v)) {
      out.push(0x90 | v.length);
      v.forEach((x) => encode(x, out));
    } else {
      const ks = Object.keys(v);
      out.push(0x80 | ks.length);
      ks.forEach((k) => { encode(k, out); encode(v[k], out); });
    }
    return out;
  }

  function sendToRoom(key, data) {
    if (!S.ws || S.ws.readyState !== 1 || !S.room) return false;
    // The game omits `data` entirely when there is no payload (e.g. REQUEST_PEOPLE) — match that
    // exactly rather than sending an explicit undefined, so we never trip server-side validation.
    const inner = data === undefined ? { room: S.room, key } : { room: S.room, key, data };
    const pkt = { type: 2, data: ['blueboat_SEND_MESSAGE', inner], options: { compress: true }, nsp: '/' };
    S.ws.send(new Uint8Array([0x04, ...encode(pkt)]));
    return true;
  }
  const requestPeople = () => sendToRoom('IMPOSTER_MODE_REQUEST_PEOPLE', undefined);
  // Every Mission Control action (investigate, note look, meeting, impostor sabotage, donate) is
  // this one frame. `on` is the target id for targeted actions, omitted for the rest.
  const purchase = (item, on) => sendToRoom('IMPOSTER_MODE_PURCHASE', on === undefined ? { item } : { item, on });
  // Meeting vote: data is the bare target id (only valid while status === 'voting').
  const vote = (id) => sendToRoom('IMPOSTER_MODE_VOTE', id);

  // Engine.io v3 binary frame: 0x04 + socket.io-msgpack packet {type, data:[event, payload], nsp}
  function onFrame(ws, ab) {
    const u8 = new Uint8Array(ab);
    if (u8[0] !== 0x04) return;
    let pkt;
    try { pkt = decode(u8.subarray(1)); } catch (e) { return; }
    if (!pkt || !Array.isArray(pkt.data)) return;
    const [event, msg] = pkt.data;
    if (typeof event === 'string' && event.startsWith('message-')) {
      const firstSighting = !S.room;
      S.ws = ws;
      S.room = event.slice(8);
      if (firstSighting && !S.people.length) setTimeout(requestPeople, 200);
    }
    if (!msg || !msg.key) return;
    if (msg.key === 'IMPOSTER_MODE_PEOPLE' && Array.isArray(msg.data)) {
      S.people = msg.data;
      // An ejected target can't be acted on — drop it so targeted autos pause until a new pick.
      const t = S.people.find((p) => p.id === S.target);
      if (S.target && (!t || t.votedOff)) S.target = '';
      resolveSelf();
      render();
    } else if (msg.key === 'STATE_UPDATE' && msg.data) {
      if (msg.data.type === 'IMPOSTER_MODE_PERSON') { S.me = msg.data.value; render(); }
      else if (msg.data.type === 'GAME_STATUS') { S.gameStatus = msg.data.value; render(); } // 'gameplay' → 'results' = game over
      else if (msg.data.type === 'IMPOSTER_MODE_STATUS' && msg.data.value !== S.status) {
        S.status = msg.data.value;
        // ejections aren't pushed — re-ask on every phase change (and once more after results settle)
        setTimeout(requestPeople, 300);
        setTimeout(requestPeople, 3000);
      }
    }
  }

  // Hook incoming without needing the socket instance: consumers read MessageEvent.data and
  // `this.target` is the WebSocket. Catches the already-open lobby socket (mid-game inject).
  const desc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
  const seen = new WeakSet();
  Object.defineProperty(MessageEvent.prototype, 'data', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const d = desc.get.call(this);
      try {
        if (this.target instanceof WebSocket && d instanceof ArrayBuffer && !seen.has(this)) {
          seen.add(this);
          onFrame(this.target, d);
        }
      } catch (e) {}
      return d;
    },
  });

  // Mid-game inject: incoming binary traffic can be quiet for a while (idle "Continue" screens),
  // so also learn the socket from the next outgoing frame (engine.io pings every ~25s) and the
  // room id from React props — then we can act without waiting for inbound traffic.
  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function () {
    if (!S.ws && /gimkitconnect/.test(this.url)) { S.ws = this; bootstrap(); }
    return origSend.apply(this, arguments);
  };

  // --- React helpers ---
  function fiberOf(el) { const k = Object.keys(el).find((k) => k.startsWith('__reactFiber$')); return k && el[k]; }
  function reactRoot() {
    const el = [...document.querySelectorAll('body *')].find((e) => fiberOf(e));
    let f = el && fiberOf(el);
    while (f && f.return) f = f.return;
    return f;
  }
  // Walk the WHOLE fiber tree (child + sibling), not just the ancestor chain — joinDetails/user/the
  // MobX stores live on branches off to the side of any given DOM node.
  function dfs(visit) {
    let steps = 0;
    (function rec(f, depth) {
      if (!f || depth > 600 || steps > 9000) return;
      steps++;
      if (visit(f)) return; // truthy = stop
      rec(f.child, depth + 1);
      rec(f.sibling, depth);
    })(reactRoot(), 0);
  }
  function roomFromReact() {
    let found = null;
    dfs((f) => {
      const jd = f.memoizedProps && f.memoizedProps.joinDetails;
      if (jd && typeof jd.roomId === 'string') { found = jd.roomId; return true; }
    });
    return found;
  }
  function ownName() {
    let found = null;
    dfs((f) => {
      const u = f.memoizedProps && f.memoizedProps.user;
      if (u && typeof u.name === 'string') { found = u.name; return true; }
    });
    return found;
  }
  // Prefer the authoritative IMPOSTER_MODE_PERSON (by id); fall back to matching our own display
  // name against the roster (the React `user` object carries no id that matches the people list).
  function resolveSelf() {
    if (S.me && S.me.id) return;
    const nm = ownName();
    if (!nm) return;
    const matches = S.people.filter((p) => p.name === nm);
    if (matches.length === 1) S.me = { id: matches[0].id, name: nm, role: matches[0].role, byName: true };
  }

  // --- MobX store access (energy, shop items, limits, elimination) ---
  const deref = (v) => (v && typeof v === 'object' && 'value_' in v) ? v.value_ : v;
  let _stores = null;
  function stores() {
    if (_stores && _stores.imposter) return _stores;
    dfs((f) => {
      const p = f.memoizedProps;
      if (p && typeof p === 'object' && p.imposter && p.balance && p.navigation) { _stores = p; return true; }
    });
    return _stores;
  }
  const balanceVal = () => { const s = stores(); return s ? (deref(s.balance.balance) || 0) : 0; };
  const invLeft = () => { const s = stores(); return s ? (deref(s.imposter.investigationsLeft) ?? 0) : 0; };
  const meetLeft = () => { const s = stores(); return s ? (deref(s.imposter.meetingsLeft) ?? 0) : 0; };
  const myRole = () => { const s = stores(); const me = s && deref(s.imposter.me); return (me && me.role) || (S.me && S.me.role) || '?'; };
  const amEliminated = () => { const s = stores(); const me = s && deref(s.imposter.me); return !!(me && me.votedOff); };
  // The game's own list of what you can buy right now (role- and alive/dead-aware).
  function shopItems() {
    const s = stores();
    if (!s) return [];
    const si = s.imposter.shopItems;
    return Array.isArray(si) ? si : (si && si.slice ? [...si] : []);
  }
  // Actions that take no target (the meeting is group-wide; a disguise applies to yourself).
  const NO_TARGET = new Set(['meeting', 'blendIn']);
  // These draw from the shared "investigations left" pool.
  const USES_INVESTIGATION = new Set(['privateInvestigation', 'publicInvestigation']);

  function bootstrap() {
    if (!S.room) S.room = roomFromReact();
    if (S.ws && S.room && !S.people.length) requestPeople();
    render();
  }

  // --- answers ---
  function currentQuestion() {
    const start = document.querySelector('span.notranslate');
    if (!start) return null;
    let f = fiberOf(start), i = 0;
    while (f && i < 80) {
      let h = f.memoizedState, j = 0;
      while (h && j < 60) {
        const v = h.memoizedState;
        if (Array.isArray(v) && v[0] && Array.isArray(v[0].answers) && v[0].text !== undefined) return v[0];
        h = h.next; j++;
      }
      f = f.return; i++;
    }
    return null;
  }
  // Answer/continue buttons ignore synthetic DOM clicks; call the React onClick prop instead.
  function reactClick(el) {
    let f = fiberOf(el), i = 0;
    while (f && i < 15) {
      const p = f.memoizedProps;
      if (p && typeof p.onClick === 'function') { p.onClick({ preventDefault() {}, stopPropagation() {} }); return true; }
      f = f.return; i++;
    }
    return false;
  }
  const leaf = (t) => [...document.querySelectorAll('button,div,span')].find((e) => e.children.length === 0 && e.textContent.trim() === t);
  // Answer text in the data sometimes carries trailing whitespace; compare trimmed on both sides.
  const answerSpan = (t) => [...document.querySelectorAll('span.notranslate')].find((e) => e.textContent.trim() === String(t).trim());
  function answerBox(span) {
    for (let el = span; el && el !== document.body; el = el.parentElement) {
      const p = fiberOf(el) && fiberOf(el).memoizedProps;
      if (p && typeof p.onClick === 'function') return el;
    }
    return span;
  }

  let marked = null;
  function highlightTick() {
    const q = currentQuestion();
    const c = q && q.answers.find((a) => a.correct);
    const span = c && answerSpan(c.text);
    const box = span && answerBox(span);
    if (box === marked) return;
    if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; }
    marked = box || null;
    if (marked) { marked.style.outline = '4px solid #56d364'; marked.style.outlineOffset = '-6px'; }
  }
  let busy = false;
  async function autoTick() {
    if (!S.auto || busy) return;
    busy = true;
    try {
      const cont = leaf('Continue');
      if (cont) { reactClick(cont); return; }
      const q = currentQuestion();
      const c = q && q.answers.find((a) => a.correct);
      const span = c && answerSpan(c.text);
      if (span) reactClick(span);
    } finally {
      setTimeout(() => (busy = false), 450);
    }
  }

  // --- Mission Control automation engine ---
  // Fire at most one armed, affordable action per pass, throttled, so result modals don't stack
  // and the server never sees a burst. All gating is client-side courtesy; the server is the real
  // backstop (it silently drops anything you can't afford).
  function autoActionTick() {
    if (!S.ws || S.ws.readyState !== 1 || !S.room) return;
    const now = Date.now();
    if (now - S.lastAction < 4000) return;
    const items = shopItems();
    if (!items.length) return;
    const bal = balanceVal();
    const tObj = S.people.find((p) => p.id === S.target);
    const targetOk = !!(tObj && !tObj.votedOff && !(S.me && S.me.id === tObj.id));
    for (const it of items) {
      if (!it || !S.on[it.id]) continue;
      const cost = it.cost || 0;
      if (bal < cost) continue;
      if (USES_INVESTIGATION.has(it.id) && invLeft() <= 0) continue;
      if (it.id === 'meeting' && meetLeft() <= 0) continue;
      if (it.id === 'donate' && bal <= 0) continue;
      if (NO_TARGET.has(it.id)) { purchase(it.id); S.lastAction = now; return; }
      if (!targetOk) continue;                 // targeted action needs a live target
      purchase(it.id, S.target);
      S.lastAction = now;
      return;
    }
  }

  // Housekeeping loop: highlight/auto-answer + the Mission Control engine (own 4s throttle inside),
  // keep retrying the handshake until the roster is in, and keep the live status line fresh.
  let ticks = 0;
  setInterval(() => {
    try {
      highlightTick();
      autoTick();
      autoActionTick();
      ticks++;
      if (!S.people.length && (ticks % 8 === 0)) bootstrap();   // ~every 2s until we have the roster
      if (S.people.length && !S.me) resolveSelf();
      updateStatus();
    } catch (e) {}
  }, 250);

  // --- panel ---
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;top:12px;right:12px;z-index:2147483647;width:236px;padding:10px 12px;' +
    'background:rgba(10,14,20,.9);color:#e6edf3;font:13px/1.45 system-ui,sans-serif;' +
    'border:1px solid #30363d;border-radius:8px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  document.documentElement.appendChild(panel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function rosterHTML() {
    if (!S.people.length) {
      return `<span style="opacity:.7">${S.room ? 'asking server…' : 'waiting for game traffic…'}</span>`;
    }
    const rows = S.people
      .slice()
      .sort((a, b) => (a.role === 'imposter' ? 0 : 1) - (b.role === 'imposter' ? 0 : 1))
      .map((p) => {
        const imp = p.role === 'imposter';
        const self = S.me && S.me.id === p.id;
        const tags = [p.votedOff && 'ejected', p.markedAsClear && 'clear'].filter(Boolean).join(', ');
        return (
          `<div style="${p.votedOff ? 'opacity:.45;text-decoration:line-through;' : ''}` +
          `${self ? 'outline:1px solid #8b949e;border-radius:4px;padding:0 3px;' : ''}">` +
          `<span style="color:${imp ? '#ff5c5c' : '#56d364'}">${imp ? '🔪' : '🔍'}</span> ` +
          `${esc(p.name)}${self ? ' <span style="opacity:.6">(you)</span>' : ''}` +
          `${tags ? ` <span style="opacity:.6">(${tags})</span>` : ''}</div>`
        );
      })
      .join('');
    const left = S.people.filter((p) => p.role === 'imposter' && !p.votedOff).length;
    return `<div style="opacity:.6;margin-bottom:2px">${left} impostor(s) left</div>${rows}`;
  }

  function controlsHTML() {
    const items = shopItems();
    if (!S.people.length) return '';
    const opts = S.people
      .filter((p) => !(S.me && S.me.id === p.id))
      .map((p) => `<option value="${esc(p.id)}" ${p.id === S.target ? 'selected' : ''}>${esc(p.name)}${p.votedOff ? ' (ejected)' : ''}</option>`)
      .join('');
    const tog = items.map((it) => {
      const onv = !!S.on[it.id];
      const tgt = NO_TARGET.has(it.id) ? '' : ' ◎';
      return `<button data-k="${esc(it.id)}" style="pointer-events:auto;cursor:pointer;margin:2px 2px 0 0;padding:3px 7px;border-radius:6px;` +
        `border:1px solid ${onv ? '#56d364' : '#30363d'};background:${onv ? 'rgba(86,211,100,.18)' : 'rgba(255,255,255,.04)'};` +
        `color:${onv ? '#56d364' : '#c9d1d9'};font:11px system-ui">${esc(it.name)}${tgt} <b>⚡${it.cost || 0}</b> · ${onv ? 'ON' : 'off'}</button>`;
    }).join('');
    const picker = items.every((it) => NO_TARGET.has(it.id)) ? '' :
      `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">` +
      `<span style="opacity:.6;font-size:11px">Target</span>` +
      `<select id="tnoTarget" style="pointer-events:auto;flex:1;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:5px;font:11px system-ui;padding:2px"><option value="" ${S.target ? '' : 'selected'}>— nobody —</option>${opts}</select>` +
      `</div>`;
    return `<div style="margin-top:7px;border-top:1px solid #30363d;padding-top:6px">` +
      `<div style="opacity:.55;font-size:10.5px;margin-bottom:4px">Auto Mission Control (◎ = needs target)</div>` +
      picker +
      `<div style="display:flex;flex-wrap:wrap">${tog || '<span style="opacity:.6;font-size:11px">no actions available</span>'}</div>` +
      `<div id="tnoStat" style="opacity:.6;font-size:10.5px;margin-top:5px">${statusText()}</div>` +
      `</div>`;
  }

  function statusText() {
    return `⚡${balanceVal()} · inv ${invLeft()} · meet ${meetLeft()} · ${esc(myRole())}${amEliminated() ? ' · ELIMINATED' : ''}`;
  }
  function updateStatus() {
    const el = panel.querySelector('#tnoStat');
    if (el) el.textContent = statusText();
  }

  function render() {
    if (panel.style.display === 'none') return; // keep hidden state
    const foot = `<div style="margin-top:6px;opacity:.55;font-size:11px">F8 auto-answer: <b style="color:${S.auto ? '#56d364' : '#8b949e'}">${S.auto ? 'ON' : 'off'}</b> · Ins hide</div>`;
    panel.innerHTML = `<b>TNO reveal</b>${rosterHTML()}${controlsHTML()}${foot}`;
    wireControls();
  }
  function wireControls() {
    const sel = panel.querySelector('#tnoTarget');
    if (sel) sel.onchange = () => { S.target = sel.value; };
    panel.querySelectorAll('button[data-k]').forEach((b) => {
      b.onclick = () => { const k = b.dataset.k; S.on[k] = !S.on[k]; render(); };
    });
  }
  bootstrap();

  addEventListener('keydown', (e) => {
    if (e.key === 'Insert') { panel.style.display = panel.style.display === 'none' ? '' : 'none'; if (panel.style.display !== 'none') render(); }
    else if (e.key === 'F8') { e.preventDefault(); S.auto = !S.auto; render(); }
  });
  S.requestPeople = requestPeople;
  S.purchase = purchase;
  S.vote = vote;
  // Read API for UI code (the hub): everything a panel needs without reaching into this closure.
  const stats = () => {
    const s = stores(); if (!s || !s.questions) return null;
    const c = deref(s.questions.questionsAnsweredCorrectly) || 0, w = deref(s.questions.questionsAnsweredIncorrectly) || 0;
    return { correct: c, incorrect: w, total: c + w, accuracy: c + w ? c / (c + w) : 0, streak: deref(s.balance.streakAmount) || 0 };
  };
  S.api = {
    balance: balanceVal, investigationsLeft: invLeft, meetingsLeft: meetLeft, role: myRole,
    eliminated: amEliminated, shopItems, stats, currentQuestion,
    impostorsLeft: () => S.people.filter((p) => p.role === 'imposter' && !p.votedOff).length,
    phase: () => { const s = stores(); return (s && deref(s.imposter.status)) || S.status; },
    gameCode: () => new URLSearchParams(location.search).get('gc'),
    connected: () => !!(S.ws && S.ws.readyState === 1 && S.room),
  };
})();
