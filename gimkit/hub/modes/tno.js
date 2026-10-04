// Gimkit "Trust No One" (impostor mode) — engine + hub tabs.
//
// Engine (unchanged logic from trust-no-one/tno-reveal.js, live-verified 2026-10-04):
// 1) Role reveal: the Blueboat server sends IMPOSTER_MODE_PEOPLE (every player's real role) to ALL
//    clients and re-sends it whenever a client asks with IMPOSTER_MODE_REQUEST_PEOPLE. We ask on
//    inject and on every phase change, so mid-game injects work and ejections stay current.
// 2) Answer highlight: the current question object ships with `correct` flags on its answers.
// 3) Auto-answer (a toggle in the Answers tab): clicks the correct answer, then Continue; when the
//    question screen is away it falls back to sending QUESTION_ANSWERED directly.
// 4) Mission Control automation: every action is one IMPOSTER_MODE_PURCHASE {item, on?} frame. The
//    server tracks ⚡ itself (unaffordable = silently dropped), so we only fire what you can afford.
//    Teacher turned student meetings off → crewmates still get a "Forced meeting".
//
// Mode = classic (Blueboat), NOT Colyseus/Phaser: wss://<x>.gimkitconnect.com/blueboat (socket.io v2),
// binary frames = 0x04 + msgpack {type:2, data:[event, payload], nsp:"/"}.
// Debug handle: window.__vcmGimkit.modes[i].S (engine state) and .api (read getters).
VCM_MODES.push((() => {
  const S = {
    people: [], me: null, status: '', gameStatus: '', ws: null, room: null,
    auto: false,         // auto-answer
    highlight: true,     // green outline on the correct answer
    target: '',          // selected target player id
    on: {},              // { <shopItemId>: true } = that auto-action is armed
    lastAction: 0,
    actionEveryMs: 4000, // auto-action pace
    rr: 0,               // round-robin cursor over armed actions
    autoVote: false,
    votedFor: '',
    answerMs: 2000,      // auto-answer base delay per question
    jitter: 0.3,         // ±30% random spread on that delay
    log: [],             // newest-first: {t, kind, text}
    fired: {},           // { <itemId>: time the last purchase was sent } (UI "just fired")
    mode: 'unknown',     // 'tno' | 'other' | 'unknown'
    sawTno: false,
    phaseSince: Date.now(),
    startedAt: Date.now(),
    sendHooked: false,
    answerMode: '',      // '' | 'click' | 'direct'
    directAnswers: 0,
    onLog: null,         // UI hook: called with each new log entry
  };
  let alive = true;
  const cleanups = [];

  // Settings survive Play Again (it reloads the page). The target isn't saved — ids change per game.
  const PREF_KEY = 'vcm-tno-settings';
  const PREF_FIELDS = ['auto', 'highlight', 'on', 'autoVote', 'answerMs', 'jitter', 'actionEveryMs'];
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (saved) PREF_FIELDS.forEach((k) => { if (k in saved) S[k] = saved[k]; });
  } catch (e) {}
  let savedPrefs = '';
  function savePrefs() {
    const v = JSON.stringify(Object.fromEntries(PREF_FIELDS.map((k) => [k, S[k]])));
    if (v !== savedPrefs) { savedPrefs = v; try { localStorage.setItem(PREF_KEY, v); } catch (e) {} }
  }
  const LOG_MAX = 100;
  const addLog = (kind, text) => {
    const e = { t: Date.now(), kind, text };
    S.log.unshift(e);
    if (S.log.length > LOG_MAX) S.log.length = LOG_MAX;
    if (S.onLog) try { S.onLog(e); } catch (x) {}
  };
  const nameOf = (id) => (S.people.find((p) => p.id === id) || {}).name || 'someone';

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
  // Encoder covering what Blueboat client frames use (undefined = fixext1 type 0, like notepack).
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
    if (!alive || !S.ws || S.ws.readyState !== 1 || !S.room) return false;
    // The game omits `data` when there is no payload (e.g. REQUEST_PEOPLE) — match that exactly.
    const inner = data === undefined ? { room: S.room, key } : { room: S.room, key, data };
    const pkt = { type: 2, data: ['blueboat_SEND_MESSAGE', inner], options: { compress: true }, nsp: '/' };
    S.ws.send(new Uint8Array([0x04, ...encode(pkt)]));
    return true;
  }
  const requestPeople = () => sendToRoom('IMPOSTER_MODE_REQUEST_PEOPLE', undefined);
  const purchase = (item, on) => {
    const ok = sendToRoom('IMPOSTER_MODE_PURCHASE', on === undefined ? { item } : { item, on });
    const it = actionItems().find((x) => x.id === item);
    if (ok) { S.fired[item] = Date.now(); addLog('sent', `You sent ${it ? it.name : item}${on ? ' on ' + nameOf(on) : ''}`); }
    return ok;
  };
  const vote = (id) => { const ok = sendToRoom('IMPOSTER_MODE_VOTE', id); if (ok) addLog('vote', `You voted for ${nameOf(id)}`); return ok; };

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
    // Other classic modes answer a roster request with an EMPTY list — that doesn't count as TNO.
    const tnoKey = /^IMPOSTER_MODE_/.test(msg.key) && !(msg.key === 'IMPOSTER_MODE_PEOPLE' && !(Array.isArray(msg.data) && msg.data.length));
    if (tnoKey || (msg.data && /^IMPOSTER_MODE_/.test(msg.data.type || ''))) { S.sawTno = true; S.mode = 'tno'; }
    if (msg.key === 'TOAST' && msg.data && msg.data.message) addLog(msg.data.type === 'success' ? 'result' : 'warn', msg.data.message);
    if (msg.key === 'SUCCESS_MODAL_INFO' && msg.data) addLog('result', [msg.data.title, msg.data.description].filter(Boolean).join(' '));
    if (msg.key === 'IMPOSTER_MODE_PEOPLE' && Array.isArray(msg.data)) {
      for (const p of msg.data) {
        const old = S.people.find((o) => o.id === p.id);
        if (!old) continue;
        if (p.votedOff && !old.votedOff) addLog('eject', `${p.name} was ejected (${p.role === 'imposter' ? 'impostor' : 'crewmate'})`);
        if (p.markedAsClear && !old.markedAsClear) addLog('clear', `${p.name} was marked clear`);
      }
      S.people = msg.data;
      const t = S.people.find((p) => p.id === S.target);
      if (S.target && (!t || t.votedOff)) { addLog('target', `${t ? t.name : 'Your target'} was ejected. Pick a new target`); S.target = ''; }
      resolveSelf();
    } else if (msg.key === 'STATE_UPDATE' && msg.data) {
      if (msg.data.type === 'IMPOSTER_MODE_PERSON') S.me = msg.data.value;
      else if (msg.data.type === 'GAME_QUESTIONS' && Array.isArray(msg.data.value)) msg.data.value.forEach(cacheQ);
      else if (msg.data.type === 'GAME_STATUS') {
        S.gameStatus = msg.data.value;
        if (S.gameStatus === 'results') addLog('phase', 'Game over: ' + winner());
      } else if (msg.data.type === 'IMPOSTER_MODE_STATUS' && msg.data.value !== S.status) {
        S.status = msg.data.value;
        S.phaseSince = Date.now();
        const label = { questions: 'Back to questions', discussion: 'Meeting called', voting: 'Voting started', votingResult: 'Voting finished' }[S.status];
        if (label) addLog('phase', label);
        setTimeout(requestPeople, 300);
        setTimeout(requestPeople, 3000);
      }
    }
  }

  // --- hooks (installed at boot so the lobby socket and liftoff roster are caught) ---
  function installHooks() {
    // Incoming without the socket instance: consumers read MessageEvent.data; `this.target` is the WS.
    const desc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
    const seen = new WeakSet();
    const ourGet = function () {
      const d = desc.get.call(this);
      if (!alive) return d;
      try {
        if (this.target instanceof WebSocket && d instanceof ArrayBuffer && !seen.has(this)) {
          seen.add(this);
          onFrame(this.target, d);
        }
      } catch (e) {}
      return d;
    };
    Object.defineProperty(MessageEvent.prototype, 'data', { configurable: true, enumerable: desc.enumerable, get: ourGet });
    // Restore only if nobody hooked on top of us since; otherwise stay a pass-through (alive=false).
    cleanups.push(() => {
      const cur = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
      if (cur && cur.get === ourGet) Object.defineProperty(MessageEvent.prototype, 'data', desc);
    });
    // Learn the socket from the next outgoing frame too (pings every ~25s on idle screens). Another
    // script may lock WebSocket.prototype.send; then we run incoming-only (still works).
    const origSend = WebSocket.prototype.send;
    const ourSend = function () {
      if (alive && !S.ws && /gimkitconnect/.test(this.url)) { S.ws = this; bootstrap(); }
      return origSend.apply(this, arguments);
    };
    try { WebSocket.prototype.send = ourSend; } catch (e) {}
    S.sendHooked = WebSocket.prototype.send === ourSend;
    cleanups.push(() => { if (WebSocket.prototype.send === ourSend) try { WebSocket.prototype.send = origSend; } catch (e) {} });
  }

  // --- React helpers ---
  function fiberOf(el) { const k = Object.keys(el).find((k) => k.startsWith('__reactFiber$')); return k && el[k]; }
  function reactRoot() {
    const el = [...document.querySelectorAll('body *')].find((e) => !e.closest('#vcm-hub') && fiberOf(e));
    let f = el && fiberOf(el);
    while (f && f.return) f = f.return;
    return f;
  }
  // Walk the WHOLE fiber tree — joinDetails/user/the MobX stores live on side branches.
  function dfs(visit) {
    let steps = 0;
    (function rec(f, depth) {
      if (!f || depth > 600 || steps > 9000) return;
      steps++;
      if (visit(f)) return;
      rec(f.child, depth + 1);
      rec(f.sibling, depth);
    })(reactRoot(), 0);
  }
  function roomFromReact() {
    let found = null;
    dfs((f) => { const jd = f.memoizedProps && f.memoizedProps.joinDetails; if (jd && typeof jd.roomId === 'string') { found = jd.roomId; return true; } });
    return found;
  }
  function ownName() {
    let found = null;
    dfs((f) => { const u = f.memoizedProps && f.memoizedProps.user; if (u && typeof u.name === 'string') { found = u.name; return true; } });
    return found;
  }
  let _myName = '', _myNameAt = 0;
  function myName() {
    if (S.me && S.me.name) return S.me.name;
    if (!_myName && Date.now() - _myNameAt > 3000) { _myNameAt = Date.now(); _myName = ownName() || ''; }
    return _myName;
  }
  // Prefer IMPOSTER_MODE_PERSON (by id); fall back to a unique display-name match.
  function resolveSelf() {
    if (S.me && S.me.id) return;
    const nm = ownName();
    if (!nm) return;
    const matches = S.people.filter((p) => p.name === nm);
    if (matches.length === 1) S.me = { id: matches[0].id, name: nm, role: matches[0].role, byName: true };
  }

  // --- MobX store access ---
  const deref = (v) => (v && typeof v === 'object' && 'value_' in v) ? v.value_ : v;
  let _stores = null;
  let _storesMiss = 0;
  function stores() {
    if (_stores && _stores.imposter) return _stores;
    if (Date.now() - _storesMiss < 2000) return null; // not in a game yet: don't walk React every tick
    _storesMiss = Date.now();
    dfs((f) => { const p = f.memoizedProps; if (p && typeof p === 'object' && p.imposter && p.balance && p.navigation) { _stores = p; return true; } });
    return _stores;
  }
  const balanceVal = () => { const s = stores(); return s ? (deref(s.balance.balance) || 0) : 0; };
  const invLeft = () => { const s = stores(); return s ? (deref(s.imposter.investigationsLeft) ?? 0) : 0; };
  const meetLeft = () => { const s = stores(); return s ? (deref(s.imposter.meetingsLeft) ?? 0) : 0; };
  const myRole = () => { const s = stores(); const me = s && deref(s.imposter.me); return (me && me.role) || (S.me && S.me.role) || '?'; };
  const amEliminated = () => { const s = stores(); const me = s && deref(s.imposter.me); return !!(me && me.votedOff); };
  function shopItems() {
    const s = stores();
    if (!s) return [];
    const si = s.imposter.shopItems;
    return Array.isArray(si) ? si : (si && si.slice ? [...si] : []);
  }
  // Student meetings off only drops Meeting from the shop list; the server still accepts it.
  const FORCED_MEETING = { id: 'meeting', name: 'Forced meeting', cost: 10, forced: true };
  const canForceMeeting = () => {
    const items = shopItems();
    return items.length > 0 && !amEliminated() && myRole() === 'detective' && !items.some((i) => i.id === 'meeting');
  };
  const actionItems = () => (canForceMeeting() ? shopItems().concat(FORCED_MEETING) : shopItems());
  const NO_TARGET = new Set(['meeting', 'blendIn']);
  const USES_INVESTIGATION = new Set(['privateInvestigation', 'publicInvestigation']);

  function bootstrap() {
    if (!S.room) S.room = roomFromReact();
    if (S.ws && S.room && !S.people.length && S.mode !== 'other') requestPeople();
  }
  let liveSince = 0;
  // 'join' = lobby, 'gameplay', 'results'. The socket value wins; the store has it on a late inject.
  const gameStatusNow = () => { if (S.gameStatus) return S.gameStatus; const s = stores(); return (s && s.gameValues && deref(s.gameValues.gameStatus)) || ''; };
  const gameLive = () => gameStatusNow() === 'gameplay';
  // The game's own options name the mode: specialGameType ['IMPOSTER'] = Trust No One. Readable the
  // moment you're in a game (lobby included), before any socket traffic. Verified live 2026-10-04.
  function specialType() {
    const s = stores(); const go = s && deref(s.gameOptions);
    if (!go || !go.type) return null; // options not loaded yet
    const t = deref(go.specialGameType);
    return t ? (Array.isArray(t) ? [...t] : Object.values(t)).map(String) : [];
  }
  // Which pre-game screen is showing: 'code' (enter the game code), 'name' (type a name),
  // 'nickname' (teacher turned on the nickname generator: read-only name + Join), or '' (none).
  // Some setups skip naming and drop you straight into the lobby; that path just never shows 'name'.
  function preGameScreen() {
    if (S.ws || gameStatusNow()) return '';
    const inputs = [...document.querySelectorAll('input')].filter((e) => !e.closest('#vcm-hub') && e.offsetParent !== null);
    if (inputs.some((e) => /game code/i.test(e.placeholder))) return 'code';
    if (inputs.some((e) => /name/i.test(e.placeholder))) return 'name';
    if (inputs.some((e) => e.readOnly && e.type === 'text') && /nickname/i.test(document.body.innerText)) return 'nickname';
    return '';
  }
  function detectMode() {
    if (S.mode === 'tno') return;
    const st = specialType();
    if (S.sawTno || shopItems().length || (st && st.includes('IMPOSTER'))) { S.mode = 'tno'; return; }
    if (st) { S.mode = 'other'; return; }
    if (!gameLive() || !S.ws) { liveSince = 0; return; }
    if (!liveSince) liveSince = Date.now();
    if (Date.now() - liveSince > 8000) S.mode = 'other';
  }
  function winner() { return S.people.some((p) => p.role === 'imposter' && !p.votedOff) ? 'Impostors win' : 'Crewmates win'; }

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
  const leaf = (t) => [...document.querySelectorAll('button,div,span')].find((e) => e.children.length === 0 && e.textContent.trim() === t && !e.closest('#vcm-hub'));
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
    let box = null;
    if (S.highlight) {
      const q = currentQuestion();
      const c = q && q.answers.find((a) => a.correct);
      const span = c && answerSpan(c.text);
      box = span && answerBox(span);
    }
    if (box === marked) return;
    if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; }
    marked = box || null;
    if (marked) { marked.style.outline = '4px solid #56d364'; marked.style.outlineOffset = '-6px'; }
  }
  cleanups.push(() => { if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; marked = null; } });
  let nextAnswerAt = 0;
  const jittered = () => S.answerMs * (1 + (Math.random() * 2 - 1) * S.jitter);

  // Direct-answer fallback (question screen away): send QUESTION_ANSWERED ourselves at the same pace.
  const qCache = new Map();
  const cacheQ = (q) => { if (q && q._id && Array.isArray(q.answers) && q.answers.some((a) => a.correct)) qCache.set(q._id, q); };
  const phaseNow = () => { const s = stores(); return (s && deref(s.imposter.status)) || S.status; };
  const questionCount = () => { const s = stores(); const l = s && s.questions && deref(s.questions.questionList); return (l && l.length) || qCache.size; };
  let offScreenSince = 0, directCursor = -1;
  function nextDirectQuestion() {
    const s = stores();
    const list = (s && s.questions && deref(s.questions.questionList)) || [];
    const ids = list.length ? list : [...qCache.keys()];
    if (directCursor < 0) directCursor = (s && s.questions && deref(s.questions.currentQuestionIndex)) || 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[(directCursor + i) % ids.length];
      if (qCache.has(id)) { directCursor = (directCursor + i + 1) % ids.length; return qCache.get(id); }
    }
    return null;
  }
  function directAnswer() {
    const q = nextDirectQuestion();
    const c = q && q.answers.find((a) => a.correct);
    if (!c) return false;
    const ok = sendToRoom('QUESTION_ANSWERED', { questionId: q._id, answer: q.type === 'text' ? c.text : c._id });
    if (ok) S.directAnswers++;
    return ok;
  }
  function autoTick() {
    const q = currentQuestion();
    cacheQ(q);
    if (!S.auto) { offScreenSince = 0; S.answerMode = ''; return; }
    const now = Date.now();
    const cont = leaf('Continue');
    const c = q && q.answers.find((a) => a.correct);
    const span = c && answerSpan(c.text);
    if (cont || span) { offScreenSince = 0; directCursor = -1; S.answerMode = 'click'; }
    else if (!offScreenSince) offScreenSince = now;
    if (now < nextAnswerAt) return;
    if (cont) { reactClick(cont); nextAnswerAt = now + jittered(); return; }
    if (span) { reactClick(span); nextAnswerAt = now + 350 + Math.random() * 300; return; }
    if (offScreenSince && now - offScreenSince > 2500 && phaseNow() === 'questions' && S.gameStatus !== 'results') {
      if (directAnswer()) { S.answerMode = 'direct'; nextAnswerAt = now + jittered(); }
    }
  }

  // --- Mission Control engine ---
  const CREW_ITEMS = ['privateInvestigation', 'publicInvestigation', 'noteViewer', 'meeting'];
  const IMP_ITEMS = ['investigationRemover', 'fakeInvestigation', 'clearListRemover', 'blendIn'];
  function blockReason(id) {
    const items = actionItems();
    const it = items.find((x) => x.id === id);
    if (S.gameStatus === 'results') return 'Game over';
    if (!it) {
      if (amEliminated()) return "You're eliminated: only Donate is available";
      if (id === 'donate') return "Only after you're voted out";
      if (CREW_ITEMS.includes(id) && myRole() === 'imposter') return 'Crewmate-only';
      if (IMP_ITEMS.includes(id) && myRole() === 'detective') return 'Impostor-only';
      return 'Not available right now';
    }
    if (id === 'meeting' && meetLeft() <= 0) return 'No meetings left';
    if (USES_INVESTIGATION.has(id) && invLeft() <= 0) return 'No investigations left';
    const bal = balanceVal();
    if (id === 'donate' && bal <= 0) return 'Nothing to donate yet';
    if (id !== 'donate' && bal < (it.cost || 0)) return `Need ⚡${(it.cost || 0) - bal} more`;
    if (!NO_TARGET.has(id) && !targetLive()) return 'Pick a target first';
    return '';
  }
  function targetLive() {
    const t = S.people.find((p) => p.id === S.target);
    return !!(t && !t.votedOff && !(S.me && S.me.id === t.id));
  }
  function queue() {
    const armed = actionItems().filter((it) => it && S.on[it.id]);
    if (!armed.length) return [];
    const k = S.rr % armed.length;
    return armed.slice(k).concat(armed.slice(0, k));
  }
  function doOnce(id) {
    const r = blockReason(id);
    if (r) { addLog('warn', r); return r; }
    if (NO_TARGET.has(id)) purchase(id); else purchase(id, S.target);
    return '';
  }
  function autoActionTick() {
    if (!S.ws || S.ws.readyState !== 1 || !S.room || S.gameStatus === 'results') return;
    const now = Date.now();
    if (S.on.donate && amEliminated() && !blockReason('donate')) { purchase('donate', S.target); S.lastAction = now; return; }
    if (now - S.lastAction < S.actionEveryMs) return;
    const armed = actionItems().filter((it) => it && S.on[it.id]);
    for (let i = 0; i < armed.length; i++) {
      const idx = (S.rr + i) % armed.length;
      const it = armed[idx];
      if (blockReason(it.id)) continue;
      if (NO_TARGET.has(it.id)) purchase(it.id); else purchase(it.id, S.target);
      S.rr = idx + 1;
      S.lastAction = now;
      return;
    }
  }
  function autoVoteTick() {
    if (S.status !== 'voting') { S.votedFor = ''; return; }
    if (!S.autoVote || !targetLive() || amEliminated() || S.votedFor === S.target) return;
    if (vote(S.target)) S.votedFor = S.target;
  }

  const stats = () => {
    const s = stores(); if (!s || !s.questions) return null;
    const c = deref(s.questions.questionsAnsweredCorrectly) || 0, w = deref(s.questions.questionsAnsweredIncorrectly) || 0;
    return { correct: c, incorrect: w, total: c + w, accuracy: c + w ? c / (c + w) : 0, streak: deref(s.balance.streakAmount) || 0 };
  };
  const api = {
    balance: balanceVal, investigationsLeft: invLeft, meetingsLeft: meetLeft, role: myRole,
    eliminated: amEliminated, shopItems, stats, currentQuestion, questionCount,
    impostorsLeft: () => S.people.filter((p) => p.role === 'imposter' && !p.votedOff).length,
    phase: phaseNow,
    gameCode: () => { const s = stores(); return new URLSearchParams(location.search).get('gc') || (s && s.gameValues && deref(s.gameValues.gameCode)) || null; },
    connected: () => !!(S.ws && S.ws.readyState === 1 && S.room),
    live: gameLive,
    mode: () => S.mode,
    answerMode: () => S.answerMode,
    directAnswers: () => S.directAnswers,
    knownQuestions: () => qCache.size,
    gameOver: () => S.gameStatus === 'results',
    lobby: () => gameStatusNow() === 'join',
    preGameScreen,
    winner,
    stalled: () => S.status === 'votingResult' && S.gameStatus !== 'results' && Date.now() - S.phaseSince > 60000,
    votingFor: () => (S.status === 'voting' ? Math.round((Date.now() - S.phaseSince) / 1000) : 0),
    studentMeetingsOff: canForceMeeting,
    actionItems, blockReason, queue, targetLive,
    otherScripts: () => [
      window.stores && window.stores.assignment && 'Gimkit Cheat (TheLazySquid)',
      !/\[native code\]/.test(String(Object.freeze)) && 'gimkit cheats (MOD MENU)',
    ].filter(Boolean),
  };

  // =================================================================== hub UI
  const CATALOGUE = {
    detective: [
      { id: 'privateInvestigation', name: 'Private Investigation', cost: 7 },
      { id: 'publicInvestigation', name: 'Public Investigation', cost: 15 },
      { id: 'noteViewer', name: 'Note Look', cost: 7 },
      { id: 'meeting', name: 'Meeting', cost: 10 },
    ],
    imposter: [
      { id: 'investigationRemover', name: 'Investigation Remover', cost: 10 },
      { id: 'fakeInvestigation', name: 'Fake Investigation', cost: 6 },
      { id: 'clearListRemover', name: 'Unclear', cost: 15 },
      { id: 'blendIn', name: 'Disguise', cost: 15 },
    ],
  };
  const DONATE = { id: 'donate', name: 'Donate', cost: null };
  // A blocked row that you can still arm (Auto waits for it) vs one that can't happen at all.
  const SOFT = /^(Need ⚡|Pick a target|Nothing to donate)/;
  const isTno = () => S.mode === 'tno';
  // Lobby = the game hasn't started. In a running game with no roster yet (fresh mid-game inject) we
  // still show the game UI; only the roster-dependent bits wait for it.
  const inLobby = () => { const g = gameStatusNow(); return g === 'join' || (!g && !S.people.length); };
  const fmtClock = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function rosterRows() {
    // Impostors first; duplicate names get a dim "#2"; "(you)" only when we know which one is you.
    const sorted = S.people.slice().sort((a, b) => (a.role === 'imposter' ? 0 : 1) - (b.role === 'imposter' ? 0 : 1) || (a.votedOff ? 1 : 0) - (b.votedOff ? 1 : 0));
    const seenNames = {};
    return sorted.map((p) => {
      const n = (seenNames[p.name] = (seenNames[p.name] || 0) + 1);
      return { p, dup: S.people.filter((x) => x.name === p.name).length > 1 ? n : 0 };
    });
  }

  const mode = {
    id: 'tno',
    name: 'Trust No One',
    icon: '🔪',
    ack: 'Actions and answers are visible to other players and the teacher.',
    css: `
[data-mode="tno"]{--tone-a:#ff7a70;--tone-b:#56d364;--accent-warm:#ffb547}
[data-mode="tno"] .av.imp{background:color-mix(in srgb,var(--tone-a) 16%,transparent)}
[data-mode="tno"] .av.crew{background:color-mix(in srgb,var(--tone-b) 14%,transparent)}
[data-mode="tno"] .av.out{background:var(--s2)}
[data-mode="tno"] .ar.special{background:linear-gradient(90deg,rgba(255,181,71,.11),rgba(255,181,71,.015) 80%)}
[data-mode="tno"] .ar.special .t>b{color:#ffe2b3}
[data-mode="tno"] .big.energy{color:var(--accent-warm)}
[data-mode="tno"] .you{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}
[data-mode="tno"] .you .yn{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:650}
[data-mode="tno"] .role{flex:0 0 auto;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--s2)}
[data-mode="tno"] .role.ta{background:color-mix(in srgb,var(--tone-a) 14%,transparent)}
[data-mode="tno"] .role.tb{background:color-mix(in srgb,var(--tone-b) 13%,transparent)}`,

    install(hub) {
      if (window.__tnoReveal && window.__tnoReveal.destroy) window.__tnoReveal.destroy(); // the old stand-alone tool
      installHooks();
      let ticks = 0;
      const loop = setInterval(() => {
        try {
          highlightTick();
          autoTick();
          autoActionTick();
          autoVoteTick();
          detectMode();
          ticks++;
          if (!S.people.length && S.mode !== 'other' && ticks % 8 === 0) bootstrap();
          if (S.people.length && !S.me) resolveSelf();
          savePrefs();
        } catch (e) {}
      }, 250);
      cleanups.push(() => clearInterval(loop));
      S.onLog = (e) => { if (e.kind === 'target') hub.toast(e.text); };
      bootstrap();
      hub.onDestroy(() => { alive = false; cleanups.splice(0).forEach((f) => { try { f(); } catch (e) {} }); });
    },

    detect() {
      if (!/(^|\.)gimkit\.com$/.test(location.hostname)) return 'no';
      if (S.mode === 'other') return 'no';
      if (preGameScreen()) { S.startedAt = Date.now(); return 'wait'; } // still joining; the 30 s clock starts after
      if (S.mode === 'tno') return 'yes';
      if (S.ws || stores()) return 'maybe'; // in a game, mode not known yet
      return Date.now() - S.startedAt > 30000 ? 'no' : 'wait';
    },

    // Shown by the shell in place of the Connecting skeleton while you're still joining.
    waiting() {
      const scr = preGameScreen();
      if (scr === 'code') return { status: 'Enter a game code', icon: '🔢', title: 'Enter the game code', text: "It's on your teacher's screen. The hub connects by itself once you're in." };
      if (scr === 'name') return { status: 'Choose your name', icon: '✏️', title: 'Pick your name', text: 'Press Join and the hub connects by itself.' };
      if (scr === 'nickname') return { status: 'Nickname picked for you', icon: '🎲', title: 'Random nicknames are on', text: 'Keep this one or re-roll it, then press Join.' };
      return null;
    },

    status() {
      if (S.gameStatus === 'results') return { dot: 'done', text: 'Game over · ' + winner() };
      if (gameStatusNow() === 'join') return { dot: 'idle', text: 'In the lobby · waiting for the host', tone: 'dim' };
      if (!isTno()) return S.ws || gameStatusNow() ? { dot: 'idle', text: 'Waiting to start', tone: 'dim' } : { dot: 'idle', text: 'Connecting…', tone: 'dim' };
      if (api.stalled()) return { dot: 'warn', text: 'Stalled', tone: 'warn' };
      if (amEliminated()) return { dot: 'idle', text: '👻 Eliminated', tone: 'dim' };
      const ph = phaseNow();
      if (ph === 'discussion') return { dot: 'live', text: 'Meeting' };
      if (ph === 'voting') return { dot: 'live', text: 'Voting · ' + fmtClock(api.votingFor()) };
      if (ph === 'votingResult') return { dot: 'live', text: 'Results' };
      return { dot: 'live', text: 'In game' };
    },

    mini() { return isTno() ? '⚡ ' + balanceVal() : ''; },

    strip(ui) {
      const { el, put, show } = ui;
      const role = el('span'), energy = el('span', { cls: 'tw' }), imps = el('span', { title: 'Impostors left' }),
        inv = el('span', { title: 'Investigations left (shared)' }), meet = el('span', { title: 'Meetings left' });
      const node = el('span', { style: 'display:contents' }, role, energy, imps, inv, meet);
      return {
        node,
        update() {
          const on = isTno() && (S.people.length > 0 || gameLive());
          [role, energy, imps, inv, meet].forEach((n) => show(n, on));
          if (!on) return;
          const r = myRole(), dead = amEliminated();
          put(role, dead ? '👻' : r === 'imposter' ? '🔪' : r === 'detective' ? '🔍' : '?');
          role.className = r === 'imposter' ? 'ta' : r === 'detective' ? 'tb' : 'tn';
          role.title = r === 'imposter' ? 'You: Impostor' : r === 'detective' ? 'You: Crewmate' : '';
          put(energy, '⚡ ' + balanceVal());
          show(imps, !dead && S.people.length > 0); show(inv, !dead); show(meet, !dead);
          put(imps, '🔪' + api.impostorsLeft());
          put(inv, '🔎' + invLeft());
          put(meet, '📣' + meetLeft());
        },
      };
    },

    tick() {
      const others = api.otherScripts();
      if (others.length) this._hub.banner('tno-other-' + others[0], 'Another Gimkit cheat is running', `(${others.join(', ')}) Turn off its auto-answer so answers aren't sent twice.`);
    },

    tabs: [
      // ---------------------------------------------------------------- Roles
      {
        id: 'roles', label: 'Roles',
        build(ui) {
          const { el, put, show, keyed } = ui;
          const you = el('div', { cls: 'card' });
          // Your username with your role beside it.
          const youName = el('b', { cls: 'yn' }), youRole = el('span', { cls: 'role' });
          you.append(el('div', { cls: 'cap', text: 'You' }), el('div', { cls: 'you' }, youName, youRole));
          const leftN = el('b'), count = ui.lbl('Players');
          const head = ui.lblrow(count, el('span', { cls: 'note' }, leftN, ' impostors left'));
          const list = ui.listCard();
          const wait = ui.empty('🚀', 'Waiting for liftoff', 'Roles appear when the game starts.');
          const conn = ui.skeleton(4);
          const waitCard = ui.listCard(wait.node);
          return {
            nodes: [you, head, list, waitCard, conn],
            update() {
              const have = S.people.length > 0;
              show(you, have); show(head, have); show(list, have);
              const lob = gameStatusNow() === 'join' || (!gameStatusNow() && !!S.ws);
              show(waitCard, !have && lob); show(conn, !have && !lob);
              if (!have) return;
              const r = myRole(), dead = amEliminated();
              put(youName, myName() || 'You');
              put(youRole, (dead ? '👻 ' : '') + (r === 'imposter' ? '🔪 Impostor' : r === 'detective' ? '🔍 Crewmate' : 'Not sure yet'));
              youRole.className = 'role ' + (r === 'imposter' ? 'ta' : r === 'detective' ? 'tb' : 'tn');
              put(count, 'Players · ' + S.people.length);
              put(leftN, api.impostorsLeft());
              keyed(list, rosterRows(), (x) => x.p.id, () => ui.listRow(), (row, { p, dup }) => {
                const imp = p.role === 'imposter', self = !!(S.me && S.me.id === p.id);
                const tags = [];
                if (p.votedOff) tags.push({ text: 'Ejected' });
                if (p.markedAsClear) tags.push({ text: 'Clear', tone: 'b' });
                if (S.target === p.id) tags.push({ text: 'Target', tone: 'w' });
                row.update({
                  icon: imp ? '🔪' : '🔍', iconCls: p.votedOff ? 'out' : imp ? 'imp' : 'crew',
                  name: p.name, suffix: [dup ? '#' + dup : '', self ? '(you)' : ''].filter(Boolean).join(' '),
                  tags, you: self, out: p.votedOff,
                });
              });
            },
          };
        },
      },
      // ---------------------------------------------------------------- Actions
      {
        id: 'actions', label: 'Actions', pub: true, pubNote: 'Other players can notice these',
        build(ui) {
          const { el, put, show, keyed } = ui;
          const bal = el('div', { cls: 'big energy' });
          const pick = ui.select({ placeholder: '— nobody —', get: () => S.target, set: (v) => { S.target = v; } });
          const pickWhy = ui.why('', true);
          const top = ui.card(el('div', { cls: 'cap', text: 'Energy' }), bal, el('div', { cls: 'col' }, ui.lbl('Target'), pick.node, pickWhy));
          top.querySelector('.lbl').style.margin = '0 2px';
          const lobby = ui.listCard(ui.empty('🚀', 'Waiting for liftoff', 'Actions unlock when the game starts.').node);
          const over = ui.warnBox('');
          const next = el('div', { cls: 'next' });
          const lblMine = ui.lbl('Your actions'), mine = ui.listCard();
          const lblOther = ui.lbl('Other role'), other = ui.listCard();
          const hint = ui.hint();
          const vote = ui.toggleRow({ title: 'Auto-vote the target', sub: 'During meetings: votes once, re-votes only if you change target', get: () => S.autoVote, set: (v) => { S.autoVote = v; } });
          const voteCard = ui.listCard(vote.node);
          const rowFor = (it) => ui.actionRow({
            onUse: () => { const r = doOnce(it.id); if (r) mode._hub.toast(r); },
            onAuto: (on) => { S.on[it.id] = on; },
          });
          const rowState = (it) => {
            const live = actionItems().find((x) => x.id === it.id) || (it.id === 'meeting' && canForceMeeting() ? FORCED_MEETING : null);
            const meta = live || it;
            const r = blockReason(it.id);
            const hard = !!r && !SOFT.test(r);
            const armed = !!S.on[it.id];
            const recent = S.fired[it.id] && Date.now() - S.fired[it.id] < 3000;
            const forced = !!(live && live.forced);
            const target = !NO_TARGET.has(it.id);
            const badges = [];
            if (target) badges.push({ text: '◎', title: 'Needs a target' });
            if (forced) badges.push({ text: '⚑', warm: true, title: 'Teacher turned these off' });
            let state = '', sub = 'Off', subWhy = '';
            if (hard) { state = 'dis'; sub = r; subWhy = 'soft'; }
            else if (recent) { state = 'fired'; sub = 'Sent · just now'; }
            else if (armed && r) { state = 'wait'; sub = 'Armed · ' + r[0].toLowerCase() + r.slice(1); }
            else if (armed) { state = 'on'; sub = 'Auto on · ready'; }
            else if (r) { sub = r; subWhy = 'hard'; }
            else if (forced) sub = 'Teacher turned meetings off';
            else if (it.id === 'donate') sub = 'Give all your ⚡ to the target';
            return {
              name: meta.name, cost: meta.cost == null ? '' : '⚡' + meta.cost, badges, state, sub, subWhy, special: forced,
              useLabel: recent ? 'Sent' : 'Do once', useDisabled: !!r, auto: armed, autoDisabled: hard && !armed,
            };
          };
          return {
            nodes: [lobby, top, over.node, next, lblMine, mine, lblOther, other, hint, voteCard],
            update() {
              const lob = inLobby();
              show(lobby, lob);
              [top, lblMine, mine, lblOther, other, voteCard].forEach((n) => show(n, !lob));
              const gameOver = S.gameStatus === 'results';
              show(over.node, gameOver || api.stalled());
              if (gameOver) over.set(`<b>Game over · ${winner()}.</b> Actions are frozen; the Log still has everything.`);
              else if (api.stalled()) over.set(`<b>Nothing's moved for a minute.</b> The host may have left. If it doesn't move soon, the game is probably over.`);
              if (lob) { show(next, false); show(hint, false); return; }
              put(bal, '⚡ ' + balanceVal());
              const targets = S.people.filter((p) => !(S.me && S.me.id === p.id)).map((p) => ({ value: p.id, label: p.name + (p.votedOff ? ' (ejected)' : ''), disabled: p.votedOff }));
              pick.update(targets, gameOver);
              put(pickWhy, S.target ? '' : 'Pick who your targeted actions aim at');
              // Your role's rows first; when eliminated, Donate moves to the top and the rest grey out.
              const r = myRole(), dead = amEliminated();
              const myList = r === 'imposter' ? CATALOGUE.imposter : CATALOGUE.detective;
              const otherList = r === 'imposter' ? CATALOGUE.detective : CATALOGUE.imposter;
              const mineItems = dead ? [DONATE, ...myList] : myList;
              const otherItems = dead ? otherList : [...otherList, DONATE];
              put(lblMine, dead ? 'Eliminated · you can still donate' : 'Your actions');
              put(lblOther, dead ? 'Other role' : 'Other role & later');
              const fill = (box, items) => keyed(box, items, (it) => it.id, rowFor, (row, it) => row.update(rowState(it)));
              fill(mine, mineItems);
              fill(other, otherItems);
              const q = queue();
              show(next, q.length > 1 && !gameOver);
              if (q.length > 1) { next.replaceChildren('Next up: ', el('b', { text: q[0].name })); }
              const voting = phaseNow() === 'voting';
              vote.update({ hot: voting && !dead, disabled: dead || gameOver, reason: dead ? "You're eliminated" : '' });
              show(hint, voting && api.votingFor() >= 30);
              put(hint, 'Waiting for everyone to vote or the host to end voting');
            },
          };
        },
      },
      // ---------------------------------------------------------------- Answers
      {
        id: 'answers', label: 'Answers', pub: true, pubNote: 'Changes your score, which others can see',
        build(ui) {
          const { el, put, show } = ui;
          const hl = ui.toggleRow({ title: 'Highlight correct answer', sub: 'Green outline in the game', get: () => S.highlight, set: (v) => { S.highlight = v; } });
          const au = ui.toggleRow({ title: 'Auto-answer', sub: 'Keeps answering even when you leave the question screen', get: () => S.auto, set: (v) => { S.auto = v; } });
          const chip = ui.livechip();
          const known = el('div', { cls: 'note' });
          const bg = el('div', { cls: 'col' }, el('div', { cls: 'row', style: 'align-items:center' }, chip), known);
          const SPEEDS = [{ value: 4000, label: 'Slow' }, { value: 2000, label: 'Normal' }, { value: 1000, label: 'Fast' }];
          const speed = ui.seg(SPEEDS, () => S.answerMs, (v) => { S.answerMs = v; });
          const cap = el('div', { cls: 'segcap' });
          const st = ui.stats(['✓ Right', '✗ Wrong', 'Total', 'Accuracy', '🔥 Streak']);
          return {
            nodes: [ui.listCard(hl.node, au.node), bg, ui.lbl('Speed'), el('div', { cls: 'col' }, speed.node, cap), ui.lbl('Your stats'), st.node],
            update() {
              hl.update();
              au.update();
              const direct = S.auto && S.answerMode === 'direct';
              show(bg, direct);
              if (direct) {
                put(chip, 'Answering in background · ' + S.directAnswers + ' sent');
                put(known, `Knows ${api.knownQuestions()} of ${questionCount()} questions`);
              }
              speed.update();
              put(cap, `≈${S.answerMs / 1000} s per question, with a little random spread`);
              const s = stats() || { correct: 0, incorrect: 0, total: 0, accuracy: 0, streak: 0 };
              st.set(0, s.correct); st.set(1, s.incorrect); st.set(2, s.total);
              st.set(3, Math.round(s.accuracy * 100), '%'); st.set(4, s.streak);
            },
          };
        },
      },
      // ---------------------------------------------------------------- Log
      {
        id: 'log', label: 'Log',
        build(ui) {
          const feed = ui.logFeed({
            sent: { icon: '↳' }, result: { icon: '✓', tone: 'tb' }, vote: { icon: '☑', tone: 'tn' },
            phase: { icon: '◆', tone: 'tn' }, eject: { icon: '▲', tone: 'ta' }, clear: { icon: '○', tone: 'tb' },
            target: { icon: '◎', tone: 'tw' }, warn: { icon: '!', tone: 'ta' },
          }, 'Nothing yet');
          let seen = null, len = -1;
          return {
            nodes: [feed.node],
            update() {
              if (S.log[0] === seen && S.log.length === len) return;
              seen = S.log[0]; len = S.log.length;
              // A game result right after (above) our own "sent" confirms it.
              feed.update(S.log.map((e, i) => {
                const below = S.log[i + 1];
                return Object.assign(e, { confirms: e.kind === 'result' && below && below.kind === 'sent' && e.t - below.t < 6000 });
              }));
            },
          };
        },
      },
    ],

    settings(ui) {
      const { el, put, show } = ui;
      const pace = ui.slider({ title: 'Auto pace', min: 2, max: 10, step: 1, get: () => Math.round(S.actionEveryMs / 1000), set: (v) => { S.actionEveryMs = v * 1000; }, fmt: (v) => v + ' s' });
      const code = ui.kv('Game code', '');
      const codeCard = ui.card(code.node);
      return {
        nodes: [ui.listCard(pace.node), ui.note('One auto action every few seconds. Slower looks more natural.'), codeCard,
          ui.note('After Play Again, click the bookmark again. Your settings come back (not the target).')],
        update() {
          pace.update();
          const gc = api.gameCode();
          show(codeCard, !!gc);
          put(code.v, gc || '');
        },
      };
    },

    S, api,
  };
  // The shell passes `hub` to install(); keep it for tick()/toasts.
  const install = mode.install;
  mode.install = function (hub) { mode._hub = hub; return install.call(mode, hub); };
  return mode;
})());
