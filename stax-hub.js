// vibecodemods/ STAX — bookmarklet mod menu for buildyourstax.com
// All changes go through the game's own Vuex store (commit/dispatch).
// Hide/show: ` (backtick) or Insert. Click the bookmarklet again to close.
// Low-end friendly: no fonts, images, blur or libraries; only transform/opacity/color
// transitions (off with reduced-motion); stats refresh once a second, only for the
// open tab, and nothing runs while hidden or minimized.
(() => {
  const old = window.__staxHub;
  if (old) { old.destroy(); return; }

  const findRoot = () => {
    const app = document.querySelector('#app');
    if (app && app.__vue__) return app.__vue__.$root;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    for (let n = w.currentNode; n; n = w.nextNode()) if (n.__vue__) return n.__vue__.$root;
  };
  const vm = findRoot();
  const s = vm && vm.$store;
  if (!s || !s.state.wealth) { alert('vibecodemods: game not found. Open buildyourstax.com and start a game first.'); return; }

  const g = () => s.state.game;
  const isSolo = () => !!g().solo;
  const sock = () => vm.$socket;
  const money = n => '$' + Math.round(Number(n) || 0).toLocaleString();
  const cleanups = [];
  const opts = { skipBad: false, claimGood: false };

  // ---------- actions ----------
  const addCash = amount => {
    if (!(amount > 0)) return;
    s.commit('wealth/incrementCash', { amount });
    toast('+' + money(amount));
  };

  // Mark lessons learned BEFORE activating so their popups (which unready the user) never mount.
  const unlockInvestments = () => {
    for (const type of Object.keys(s.state.investments.list)) {
      s.commit('investments/completeInvestmentLesson', { type });
      s.commit('investments/activateInvestmentType', { type });
    }
    setTimeout(() => {
      const u = g().user;
      if (!isSolo() && u && !u.ready) s.dispatch('game/user/readyUser');
    }, 300);
    toast('All investments unlocked');
  };

  const unlockAchievements = () => {
    let n = 0;
    for (const a of Object.values(s.state.achievements.list)) if (!a.unlocked) { s.commit('achievements/unlock', a); n++; }
    toast(n ? `Unlocked ${n} achievements` : 'Already have them all');
  };

  const togglePause = () => {
    const paused = g().paused;
    if (isSolo()) s.dispatch(paused ? 'game/unpause' : 'game/pause');
    else if (sock()) sock().emit(paused ? 'unpause-game' : 'pause-game', g().id);
    setTimeout(refresh, 50);
  };

  const skipEvent = sit => s.commit('situations/complete', sit);
  const handleEvent = sit => {
    if (!sit) return;
    if (sit.is_cost && opts.skipBad) { skipEvent(sit); toast('Skipped: ' + sit.title); }
    else if (!sit.is_cost && opts.claimGood) { s.dispatch('situations/receive'); toast('Claimed: ' + sit.title); }
  };
  cleanups.push(s.watch(() => s.getters['situations/active'], handleEvent));

  const triggerEvent = id => {
    const sit = s.state.situations.list[id];
    if (!sit) return;
    if (s.getters['situations/isActive']) return toast('Finish the current event first');
    s.commit('situations/activate', sit);
    refresh();
  };
  const skipCurrent = () => {
    const a = s.getters['situations/active'];
    if (a) { skipEvent(a); toast('Skipped: ' + a.title); refresh(); } else toast('No event right now');
  };

  const forceStart = () => {
    if (!sock()) return;
    sock().emit('start-game', g().id);
    setTimeout(() => { if (g().paused && sock()) sock().emit('unpause-game', g().id); }, 1500);
    toast('Game started');
  };
  const renameSelf = name => {
    if (!name) return;
    s.commit('game/user/setUserName', { name });
    if (!isSolo()) s.dispatch('game/user/update');
    toast('Renamed to ' + name);
  };

  // update-score honors the `id` field, so we can rewrite ANOTHER player's name and/or score — the
  // computer (id 1) included. The target's own client re-asserts its real values every tick (~5s),
  // so we hold ours by re-emitting. A null field keeps their live value (change only name, or only
  // score). Verified live 2026-09-30: a held name+score shows on the host leaderboard for both a
  // real player and the computer.
  const spoofs = new Map(); // String(id) -> { name|null, score|null, timer }
  const emitSpoof = id => {
    const sp = spoofs.get(String(id)), v = g().players.list[id];
    if (!sp || !v || !sock()) return;
    sock().emit('update-score', {
      id: v.id,
      name: sp.name != null ? sp.name : v.name,
      score: sp.score != null ? sp.score : v.score,
      ready: true, isHost: false,
      portfolio: v.portfolio || { savings: 0, cds: 0, fund: 0, stocks: 0, bonds: 0, crop: 0, gold: 0 },
    });
  };
  const stopSpoof = id => {
    const k = String(id), sp = spoofs.get(k);
    if (sp) { clearInterval(sp.timer); spoofs.delete(k); }
  };
  const startSpoof = (id, name, score) => {
    const k = String(id);
    if (!k || isSolo() || (name == null && score == null)) return;
    stopSpoof(k);
    spoofs.set(k, { name, score, timer: setInterval(() => emitSpoof(k), 1000) });
    emitSpoof(k);
    toast('Holding ' + [name != null ? '“' + name + '”' : null, score != null ? money(score) : null].filter(Boolean).join(' · '));
  };
  cleanups.push(() => [...spoofs.keys()].forEach(stopSpoof));

  // ---------- UI ----------
  const P = '#stax-hub';
  const css = `
${P}{--bg:#06060a;--s1:rgba(255,255,255,.035);--s2:rgba(255,255,255,.06);--s3:rgba(255,255,255,.11);--ln:rgba(255,255,255,.07);--ln2:rgba(255,255,255,.13);
--fg:#f3f2f8;--dim:#8d8b9c;--acc:#a58bff;--acc2:#58c7ff;--grad:linear-gradient(90deg,#8b6cff,#58c7ff);--on:#08070d;--red:#ff7a70;
position:fixed;top:16px;right:16px;width:336px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;
z-index:2147483647;will-change:transform;
background:radial-gradient(110% 70% at 100% 0%,rgba(124,92,255,.24),transparent 60%),radial-gradient(80% 55% at 0% 8%,rgba(56,170,255,.12),transparent 65%),radial-gradient(90% 50% at 40% 105%,rgba(214,76,190,.09),transparent 70%),var(--bg);color:var(--fg);border:1px solid var(--ln2);border-radius:14px;color-scheme:dark;
font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;
box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 18px 40px -12px rgba(0,0,0,.65),0 2px 6px rgba(0,0,0,.3);
user-select:none;-webkit-user-select:none;contain:layout paint style;overflow:hidden;text-align:left}
${P} *{box-sizing:border-box;margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;line-height:inherit;box-shadow:none;outline:0}
${P}::before{content:"";position:absolute;inset:0;pointer-events:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220' fill='none' stroke='white'%3E%3Cg stroke-opacity='.08'%3E%3Ccircle cx='318' cy='-6' r='64'/%3E%3Ccircle cx='318' cy='-6' r='112'/%3E%3Ccircle cx='318' cy='-6' r='166'/%3E%3Cpath d='M318 -6 L150 220'/%3E%3C/g%3E%3Cg stroke-opacity='.16'%3E%3Cpath d='M168 30 L204 14 L232 40 L270 26'/%3E%3Cpath d='M204 14 L196 58'/%3E%3C/g%3E%3Cg fill='white' stroke='none' fill-opacity='.55'%3E%3Ccircle cx='168' cy='30' r='1.3'/%3E%3Ccircle cx='204' cy='14' r='1.8'/%3E%3Ccircle cx='232' cy='40' r='1.3'/%3E%3Ccircle cx='270' cy='26' r='1.1'/%3E%3Ccircle cx='196' cy='58' r='1'/%3E%3Ccircle cx='120' cy='12' r='.9'/%3E%3Ccircle cx='290' cy='96' r='.9'/%3E%3C/g%3E%3C/svg%3E") no-repeat right top/320px auto}
${P}>*{position:relative}
${P} svg{width:14px;height:14px;flex:0 0 auto;display:block}
${P} .hd{display:flex;align-items:center;gap:10px;padding:12px 8px 12px 14px;cursor:grab;touch-action:none}
${P}.drag .hd{cursor:grabbing}
${P} .wm svg.mark{position:absolute;left:0;top:0;width:30px;height:20px;overflow:visible;color:#fff;pointer-events:none}
${P} .ttl .wm{font:400 15px/1.15 "Avenir Next","Century Gothic",Futura,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.015em;color:#fff;position:relative;flex:0 0 auto;white-space:nowrap;padding:0 0 3px 12px}
${P} .ttl .wm strong{font-weight:700}
${P} .ttl .wm em{font-style:normal;color:var(--dim)}
${P} .ttl{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;line-height:1.2}
${P} .ttl small{min-width:0;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${P} .dot{width:6px;height:6px;border-radius:50%;background:var(--s3);flex:0 0 auto}
${P} .dot.live{background:#b9a6ff;box-shadow:0 0 0 3px rgba(165,139,255,.2)}
${P} .dot.warn{background:var(--red);box-shadow:0 0 0 3px rgba(236,124,90,.16)}
${P} .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:var(--dim);cursor:pointer;transition:background .12s,color .12s}
${P} .ic:hover{background:var(--s2);color:var(--fg)}
${P} .tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:0 10px;padding:3px;background:rgba(0,0,0,.35);border:1px solid var(--ln);border-radius:10px}
${P} .tabs button{position:relative;z-index:1;padding:6px 0;font-size:12px;font-weight:560;color:var(--dim);cursor:pointer;border-radius:7px;transition:color .15s;text-align:center}
${P} .tabs button:hover,${P} .tabs button.on{color:var(--fg)}
${P} .pill{position:absolute!important;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/5);background:var(--s3);border-radius:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.35);transition:transform .22s cubic-bezier(.3,.7,.2,1)}
${P} .body{overflow-y:auto;padding:12px 12px 14px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--s3) transparent}
${P}.min .tabs,${P}.min .body,${P}.min .toast{display:none}
${P} .card{background:var(--s1);border:1px solid var(--ln);border-radius:11px;padding:12px}
${P} .card.list{padding:0}
${P} .k{color:var(--dim)}
${P} .cap{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
${P} .big{font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.1;margin:4px 0 10px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${P} .sep{height:1px;background:var(--ln);margin:0 -12px}
${P} .kv{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0 0}
${P} .card>.kv:first-child{padding-top:0}
${P} .kv+.kv{border-top:1px solid var(--ln);margin-top:8px}
${P} .kv .v{font-weight:600;font-variant-numeric:tabular-nums;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P} .lbl{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dim);margin:6px 2px 0}
${P} .row{display:flex;gap:6px}
${P} .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
${P} .btn{flex:1;min-height:36px;padding:8px 12px;border-radius:9px;background:var(--s2);border:1px solid var(--ln);cursor:pointer;font-weight:560;text-align:center;white-space:nowrap;transition:background .12s,border-color .12s,transform .08s}
${P} .btn:hover{background:var(--s3);border-color:var(--ln2)}
${P} .btn:active,${P} .act:active{transform:scale(.98)}
${P} .btn.pri{background:#fff;border-color:transparent;color:var(--on);font-weight:650;box-shadow:0 0 0 1px rgba(255,255,255,.2),0 6px 18px -6px rgba(140,110,255,.55)}
${P} .btn.pri:hover{background:#e9e4ff}
${P} .row>.btn{flex:0 0 auto}
${P} .btn:disabled,${P} .act:disabled,${P} select:disabled{opacity:.45;cursor:not-allowed;transform:none}
${P} .btn:disabled:hover{background:var(--s2);border-color:var(--ln)}
${P} .btn.pri:disabled:hover{background:#fff}
${P} .act:disabled:hover{background:none;color:var(--dim)}
${P} .col{display:flex;flex-direction:column;gap:6px}
${P} .why{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);padding:0 2px}
${P} .why::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--red);flex:0 0 auto}
${P} .why:empty{display:none}
${P} .alert{margin:10px 10px 0}
${P}.min .alert{display:none}
${P} .act{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;text-align:left;color:var(--dim);transition:background .12s,transform .08s}
${P} .act+.act{border-top:1px solid var(--ln)}
${P} .act:hover{background:var(--s2);color:var(--fg)}
${P} .act span{flex:1;min-width:0;display:flex;flex-direction:column}
${P} .act b{font-weight:600;color:var(--fg)}
${P} .act small,${P} .sw small{font-size:11.5px;color:var(--dim)}
${P} .card.list>:first-child{border-radius:10px 10px 0 0}
${P} .card.list>:last-child{border-radius:0 0 10px 10px}
${P} .field,${P} select{flex:1;min-width:0;min-height:36px;display:flex;align-items:center;gap:4px;background:rgba(0,0,0,.45);border:1px solid var(--ln2);border-radius:9px;padding:0 10px;transition:border-color .12s,box-shadow .12s}
${P} .field:focus-within,${P} select:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(165,139,255,.18)}
${P} .field .pre{color:var(--dim)}
${P} input{flex:1;min-width:0;height:34px;user-select:text;-webkit-user-select:text;font-variant-numeric:tabular-nums;-moz-appearance:textfield;appearance:textfield}
${P} input::placeholder{color:var(--dim);opacity:.8}
${P} input::-webkit-inner-spin-button,${P} input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
${P} select{-webkit-appearance:none;appearance:none;cursor:pointer;padding-right:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
background:rgba(0,0,0,.45) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238d8b9c' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M5 6.5l3 3 3-3'/%3E%3C/svg%3E") no-repeat right 9px center/14px}
${P} option{background:#12111a;color:#f3f2f8}
${P} .btn:focus-visible,${P} .act:focus-visible,${P} .ic:focus-visible,${P} .tabs button:focus-visible{box-shadow:0 0 0 2px var(--acc)}
${P} .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
${P} .stat{background:var(--s1);border:1px solid var(--ln);border-radius:11px;padding:10px 10px 11px;min-width:0}
${P} .stat .k{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${P} .stat .v{font-size:17px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap}
${P} .stat .v small{font-size:11px;font-weight:500;color:var(--dim);margin-left:2px}
${P} .bar{height:3px;border-radius:2px;background:var(--s3);margin-top:9px;overflow:hidden}
${P} .bar i{display:block;height:100%;background:var(--grad);transform-origin:left;transform:scaleX(0);transition:transform .35s ease}
${P} .sw{position:relative;display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer}
${P} .sw+.sw{border-top:1px solid var(--ln)}
${P} .sw span{flex:1;min-width:0;display:flex;flex-direction:column}
${P} .sw b{font-weight:600}
${P} .sw input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
${P} .sw i{flex:0 0 auto;position:relative;width:34px;height:20px;border-radius:10px;background:var(--s3);transition:background .15s}
${P} .sw i::before{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#cfd2c3;transition:transform .16s cubic-bezier(.3,.7,.2,1)}
${P} .sw input:checked+i{background:var(--grad)}
${P} .sw input:checked+i::before{transform:translateX(14px);background:#fff}
${P} .sw input:focus-visible+i{box-shadow:0 0 0 2px var(--acc)}
${P} .evt{display:flex;align-items:center;gap:8px;margin-top:6px;font-weight:600;font-size:14px;min-width:0}
${P} .evt span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P} .note{color:var(--dim);font-size:12px;padding:0 2px;text-wrap:pretty}
${P} .warn{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:rgba(236,124,90,.09);border:1px solid rgba(236,124,90,.22);color:#f2c4b1;font-size:12px}
${P} .warn svg{margin-top:1px;color:var(--red)}
${P} table{width:100%;border-collapse:collapse}
${P} td{padding:9px 12px;vertical-align:top}
${P} tr+tr td{border-top:1px solid var(--ln)}
${P} td:first-child{color:var(--dim)}
${P} td:last-child{text-align:right;font-weight:600}
${P} .empty{padding:12px;color:var(--dim);font-size:12px}
${P} .toast{position:absolute!important;z-index:2;left:50%;bottom:14px;max-width:calc(100% - 28px);transform:translate(-50%,8px);opacity:0;pointer-events:none;
background:var(--fg);color:var(--bg);font-weight:600;font-size:12px;padding:7px 13px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
box-shadow:0 8px 20px rgba(0,0,0,.45);transition:opacity .18s,transform .18s}
${P} .toast.show{opacity:1;transform:translate(-50%,0)}
@media (pointer:coarse){${P} .btn,${P} .field,${P} select{min-height:42px}${P} .ic{width:38px;height:38px}${P} .tabs button{padding:9px 0}}
@media (max-width:480px){${P}{left:8px!important;right:8px!important;top:8px!important;width:auto;max-height:calc(100vh - 16px)}}
@media (prefers-reduced-motion:reduce){${P} *{transition:none!important}}`;

  const el = (tag, props, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const icon = d => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`; return t.content.firstChild; };
  const ICON = { min: '<path d="M4 8h8"/>', close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>', chev: '<path d="M6 4l4 4-4 4"/>', warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3v.2"/>' };
  const btn = (text, fn, cls = '') => el('button', { type: 'button', className: 'btn ' + cls, textContent: text, onclick: fn });
  const act = (title, sub, fn) => el('button', { type: 'button', className: 'act', onclick: fn },
    el('span', {}, el('b', { textContent: title }), el('small', { textContent: sub })), icon(ICON.chev));
  const out = () => el('span', { className: 'v', textContent: '—' });
  const kv = (label, v) => el('div', { className: 'kv' }, el('span', { className: 'k', textContent: label }), v);
  const lbl = text => el('div', { className: 'lbl', textContent: text });
  const note = text => el('div', { className: 'note', textContent: text });
  const card = (cls, ...kids) => el('div', { className: 'card ' + cls }, ...kids);
  const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  // gate: disables a control and says why. Reason goes in its own line, or replaces an existing subtitle.
  const gate = (node, why, sub) => ({ node, why, sub, orig: sub ? sub.textContent : '', msg: sub ? null : el('div', { className: 'why' }) });
  const withWhy = gt => el('div', { className: 'col' }, gt.node, gt.msg);
  const applyGates = list => (list || []).forEach(x => {
    let r = '';
    try { r = x.why() || ''; } catch (e) {}
    if (x.node.disabled !== !!r) x.node.disabled = !!r;
    if (x.msg) put(x.msg, r); else put(x.sub, r || x.orig);
  });
  const noLink = () => { const k = sock(); return !k ? 'Not connected to the lobby server' : k.connected === false ? 'Lost connection to the lobby server' : ''; };
  const putBar = (bar, f) => { const t = `scaleX(${Math.max(0, Math.min(1, f || 0)).toFixed(3)})`; if (bar.style.transform !== t) bar.style.transform = t; };
  const swtch = (title, sub, key) => {
    const cb = el('input', { type: 'checkbox', onchange: () => { opts[key] = cb.checked; handleEvent(s.getters['situations/active']); } });
    return el('label', { className: 'sw' }, el('span', {}, el('b', { textContent: title }), el('small', { textContent: sub })), cb, el('i'));
  };

  const panel = el('div', { id: 'stax-hub' });
  const style = el('style', { textContent: css });
  const minBtn = el('button', { type: 'button', className: 'ic', title: 'Minimize  (` or Insert hides)' }, icon(ICON.min));
  const closeBtn = el('button', { type: 'button', className: 'ic', title: 'Close' }, icon(ICON.close));
  const logoMark = () => { const t = document.createElement('template'); t.innerHTML = '<svg class="mark" viewBox="0 0 30 20" fill="currentColor"><path d="M7.5 2.4C7.8 4.8 8.3 5.3 10.1 5.6 8.3 5.9 7.8 6.4 7.5 8.8 7.2 6.4 6.7 5.9 4.9 5.6 6.7 5.3 7.2 4.8 7.5 2.4z"/><path d="M4.1 7.8C1.6 10 1.2 13.2 4.5 14.8 7.5 16.2 13 16.4 23.8 14.4 13.5 15.6 8 15.4 5.2 14 2.6 12.8 2.4 10.2 4.1 7.8z"/></svg>'; return t.content.firstChild; };
  const statusDot = el('i', { className: 'dot' }), statusTxt = el('span', { textContent: '…' });
  const head = el('div', { className: 'hd' },
    el('div', { className: 'ttl' }, el('div', { className: 'wm' }, logoMark(), el('strong', { textContent: 'vibecode' }), 'mods', el('em', { textContent: '/' })), el('small', {}, statusDot, statusTxt)),
    minBtn, closeBtn);
  const pill = el('i', { className: 'pill' });
  const tabs = el('div', { className: 'tabs' }, pill);
  const body = el('div', { className: 'body' });
  const toastEl = el('div', { className: 'toast' });

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  const pages = {};

  {
    const cash = el('div', { className: 'big', textContent: '—' }), worth = out();
    const amt = el('input', { type: 'number', value: 100000, min: 0, step: 1000, inputMode: 'numeric' });
    const addCustom = () => addCash(+amt.value);
    amt.onkeydown = e => { if (e.key === 'Enter') addCustom(); };
    amt.oninput = () => refresh();
    const addBtn = btn('Add', addCustom, 'pri');
    const gAdd = gate(addBtn, () => +amt.value > 0 ? '' : 'Enter an amount above $0');
    pages.Money = {
      gates: [gAdd],
      nodes: [
        card('', el('div', { className: 'cap', textContent: 'Pocket cash' }), cash, el('div', { className: 'sep' }), kv('Net worth', worth)),
        lbl('Quick add'),
        el('div', { className: 'grid3' }, btn('+10K', () => addCash(1e4)), btn('+100K', () => addCash(1e5)), btn('+1M', () => addCash(1e6))),
        lbl('Custom amount'),
        el('div', { className: 'row' }, el('label', { className: 'field' }, el('span', { className: 'pre', textContent: '$' }), amt), addBtn),
        gAdd.msg,
      ],
      update() {
        put(cash, money(s.state.wealth.cash));
        put(worth, money(s.getters['wealth/worth']));
      },
    };
  }

  {
    const stat = k => {
      const n = el('span', { textContent: '—' }), of = el('small'), bar = el('i');
      return { n, of, bar, node: el('div', { className: 'stat' }, el('div', { className: 'k', textContent: k }), el('div', { className: 'v' }, n, of), el('div', { className: 'bar' }, bar)) };
    };
    const sy = stat('Year'), si = stat('Investments'), sa = stat('Achievements');
    const setStat = (st, a, b) => { put(st.n, String(a)); put(st.of, '/' + b); putBar(st.bar, b ? a / b : 0); };
    const pauseBtn = btn('', togglePause);
    const pauseNote = note('');
    const invAct = act('All investments', 'Opens every investment type', unlockInvestments);
    const achAct = act('All achievements', 'Marks every achievement earned', unlockAchievements);
    const gPause = gate(pauseBtn, () => isSolo() ? '' : noLink());
    pages.Game = {
      gates: [
        gPause,
        gate(invAct, () => Object.values(s.state.investments.list).every(i => i.active) ? 'Every investment is already open' : '', invAct.querySelector('small')),
        gate(achAct, () => Object.values(s.state.achievements.list).every(a => a.unlocked) ? 'You already have every achievement' : '', achAct.querySelector('small')),
      ],
      nodes: [
        el('div', { className: 'stats' }, sy.node, si.node, sa.node),
        lbl('Unlock'),
        card('list', invAct, achAct),
        lbl('Clock'),
        withWhy(gPause),
        pauseNote,
      ],
      update() {
        const inv = Object.values(s.state.investments.list), ach = Object.values(s.state.achievements.list);
        setStat(sy, s.getters['time/year'] + 1, 20);
        setStat(si, inv.filter(i => i.active).length, inv.length);
        setStat(sa, ach.filter(a => a.unlocked).length, ach.length);
        const p = g().paused, solo = isSolo(), what = solo ? 'time' : 'lobby';
        put(pauseBtn, p ? `Resume ${what}` : `Pause ${what}`);
        pauseBtn.className = 'btn' + (p ? ' pri' : '');
        put(pauseNote, solo ? 'Freezes your own clock.' : 'Pauses the whole lobby for every player.');
      },
    };
  }

  {
    // rebuilt whenever the game's event list changes (new lobby / new game)
    const pick = el('select');
    let pickSig = null;
    const current = el('span', { textContent: '—' }), dot = el('i', { className: 'dot' });
    const skipBtn = btn('Skip current event', skipCurrent);
    const trigBtn = btn('Trigger event', () => triggerEvent(pick.value), 'pri');
    const gSkip = gate(skipBtn, () => s.getters['situations/active'] ? '' : 'No event to skip right now');
    const gTrig = gate(trigBtn, () => !pick.options.length ? 'This game has no good events to trigger' : s.getters['situations/isActive'] ? 'Finish the current event first' : '');
    pages.Events = {
      gates: [gSkip, gTrig],
      nodes: [
        card('', el('div', { className: 'cap', textContent: 'Current event' }), el('div', { className: 'evt' }, dot, current)),
        card('list', swtch('Auto-skip bad events', 'Closes them without paying', 'skipBad'), swtch('Auto-claim good events', 'Collects the payout right away', 'claimGood')),
        withWhy(gSkip),
        lbl('Trigger a good event'),
        pick,
        withWhy(gTrig),
      ],
      update() {
        const all = s.state.situations.list || {};
        const sig = Object.keys(all).join(',');
        if (sig !== pickSig) {
          pickSig = sig;
          const keep = pick.value;
          const good = Object.values(all).filter(x => !x.is_cost && !x.prerequisites).sort((a, b) => b.amount - a.amount);
          pick.replaceChildren(...good.map(x => el('option', { value: x.id, textContent: `${x.title}  +${money(x.amount)}` })));
          if (good.some(x => String(x.id) === keep)) pick.value = keep;
          pick.disabled = !good.length;
        }
        const a = s.getters['situations/active'];
        put(current, a ? a.title : 'None right now');
        dot.className = 'dot' + (a ? (a.is_cost ? ' warn' : ' live') : '');
      },
    };
  }

  {
    const date = out(), rows = el('tbody');
    const tbl = card('list', el('table', {}, rows));
    let built = '';
    pages.Intel = {
      nodes: [
        card('', kv('Real-world year', date)),
        lbl('Company → real stock'),
        tbl,
        note('The made-up companies replay these real stocks, starting from that year.'),
      ],
      update() {
        const start = s.getters['time/realStartYear'];
        put(date, start ? String(start + s.getters['time/year']) : '—');
        const cfg = g().config || {};
        const list = Object.values(cfg.stocks || {}).map(x => [x.name, x.title]);
        if (cfg.crop) list.push(['Crop', cfg.crop.name]);
        const sig = JSON.stringify(list);
        if (sig === built) return;
        built = sig;
        rows.replaceChildren(...(list.length
          ? list.map(([a, b]) => el('tr', {}, el('td', { textContent: a }), el('td', { textContent: b })))
          : [el('tr', {}, el('td', { className: 'empty', textContent: 'Not loaded yet' }))]));
      },
    };
  }

  {
    const code = out();
    const myName = el('input', { type: 'text', placeholder: 'New name for you', maxLength: 40 });
    const doRename = () => { renameSelf(myName.value.trim()); myName.value = ''; };
    myName.onkeydown = e => { if (e.key === 'Enter') doRename(); };
    const gStart = gate(btn('Force-start game', forceStart), noLink);

    const target = el('select');
    const theirName = el('input', { type: 'text', placeholder: 'New name (optional)', maxLength: 40 });
    const theirScore = el('input', { type: 'number', placeholder: 'New score (optional)', min: 0, step: 1000, inputMode: 'numeric' });
    const doSpoof = () => {
      const name = theirName.value.trim(), score = theirScore.value.trim();
      startSpoof(target.value, name || null, score === '' ? null : Math.max(0, Math.round(+score)));
      theirName.value = ''; theirScore.value = ''; refresh();
    };
    const onEnter = e => { if (e.key === 'Enter' && !spoofBtn.disabled) doSpoof(); };
    theirName.onkeydown = onEnter; theirScore.onkeydown = onEnter;
    theirName.oninput = theirScore.oninput = () => refresh();
    const spoofBtn = btn('Apply', doSpoof, 'pri');
    const gSpoof = gate(spoofBtn, () => !target.options.length ? 'No players to edit yet'
      : (!theirName.value.trim() && theirScore.value.trim() === '') ? 'Enter a name or a score'
      : noLink());
    const spoofList = card('list');
    let rosterSig = null, spoofSig = null;
    const groupOnly = el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
      lbl('Host controls'),
      withWhy(gStart),
      lbl('Edit another player'),
      target,
      el('label', { className: 'field' }, theirName),
      el('div', { className: 'row' }, el('label', { className: 'field' }, el('span', { className: 'pre', textContent: '$' }), theirScore), spoofBtn),
      gSpoof.msg,
      note('Rewrites a player’s name and/or score on everyone’s leaderboard — the computer too. Leave a box blank to keep that value. Held until you stop it; their own game keeps running. A real player only appears once their game has sent a score update.'),
      spoofList);
    const soloNote = note('You’re in a solo game. Host controls appear in group games.');
    const warn = el('div', { className: 'warn' }, icon(ICON.warn), el('span', { textContent: 'Lobby actions show on everyone’s screen, including the teacher’s.' }));
    pages.Lobby = {
      gates: [gStart, gSpoof],
      nodes: [
        warn,
        card('', kv('Lobby code', code)),
        lbl('Your name'),
        el('div', { className: 'row' }, el('label', { className: 'field' }, myName), btn('Rename', doRename)),
        groupOnly, soloNote,
      ],
      update() {
        const solo = isSolo();
        groupOnly.style.display = solo ? 'none' : 'flex';
        soloNote.style.display = solo ? '' : 'none';
        warn.style.display = solo ? 'none' : '';
        put(code, solo ? 'Solo' : String(g().id || '—'));
        if (solo) return;

        // rebuild the dropdown only when the roster/names change, keeping the selection
        const list = targets();
        const sig = list.map(p => p.id + ':' + p.name).join('|');
        if (sig !== rosterSig) {
          rosterSig = sig;
          const keep = target.value;
          target.replaceChildren(...list.map(p => el('option', { value: p.id, textContent: isComputer(p) ? 'Computer' : p.name })));
          if (list.some(p => String(p.id) === keep)) target.value = keep;
          target.disabled = !list.length;
        }
        const ssig = [...spoofs].map(([id, sp]) => id + ':' + sp.name + ':' + sp.score).join('|');
        if (ssig !== spoofSig) {
          spoofSig = ssig;
          spoofList.style.display = spoofs.size ? '' : 'none';
          spoofList.replaceChildren(...[...spoofs].map(([id, sp]) => {
            const p = g().players.list[id];
            const who = p ? (isComputer(p) ? 'Computer' : p.name) : 'player ' + id;
            const held = [sp.name != null ? '“' + sp.name + '”' : null, sp.score != null ? money(sp.score) : null].filter(Boolean).join(' · ');
            return act('Holding ' + held, who + ' · click to stop', () => { stopSpoof(id); toast('Stopped'); refresh(); });
          }));
        }
      },
    };
  }

  // Everyone we can target: the built-in computer (id 1, in every game) plus the other real players
  // we've heard from. We only learn of a real player once they join or send a score update, so this
  // can be incomplete — no player count is shown, since we can't know it reliably.
  const targets = () => {
    const G = g(), me = G.user && G.user.id;
    return G.players ? Object.values(G.players.list).filter(p => p.id !== me) : [];
  };
  const isComputer = p => p && p.id === 1;
  const updateStatus = () => {
    const G = g();
    put(statusTxt, 'buildyourstax.com');
    const c = 'dot' + (G.paused ? '' : ' live');
    if (statusDot.className !== c) statusDot.className = c;
  };

  // ---------- tabs / refresh ----------
  const names = Object.keys(pages);
  let current = 'Money';
  const tabBtns = names.map(name => el('button', { type: 'button', textContent: name, onclick: () => show(name) }));
  tabs.append(...tabBtns);
  // panel-wide problems, shown as a banner above the page
  const alertTxt = el('span'), alertEl = el('div', { className: 'warn alert', style: 'display:none' }, icon(ICON.warn), alertTxt);
  const problem = () => {
    const a = document.querySelector('#app');
    if (a && a.__vue__ && a.__vue__.$root.$store !== s) return 'The game reloaded. Click the bookmarklet twice to reconnect.';
    if (!g()) return 'No game running. Start or join one and the menu will pick it up.';
    if (!isSolo() && noLink()) return noLink() + '. Lobby actions won’t reach anyone until it reconnects.';
    return '';
  };
  const refresh = () => {
    if (panel.style.display === 'none' || document.hidden) return;
    let p = '';
    try {
      p = problem();
      if (g()) {
        updateStatus();
        if (!panel.classList.contains('min')) { pages[current].update(); applyGates(pages[current].gates); }
      }
    } catch (e) { p = p || 'Game data is changing (the game may have ended). Retrying…'; }
    put(alertTxt, p);
    const d = p ? '' : 'none';
    if (alertEl.style.display !== d) alertEl.style.display = d;
  };
  function show(name) {
    current = name;
    const i = names.indexOf(name);
    tabBtns.forEach((b, j) => b.classList.toggle('on', j === i));
    pill.style.transform = `translateX(${i * 100}%)`;
    body.replaceChildren(...pages[name].nodes);
    body.scrollTop = 0;
    clamp();
    refresh();
    save();
  }
  const timer = setInterval(refresh, 1000);
  cleanups.push(() => clearInterval(timer));

  // ---------- window chrome ----------
  const KEY = 'staxHubUI';
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ tab: current, min: panel.classList.contains('min'), x: panel.style.left, y: panel.style.top })); } catch (e) {}
  }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}

  const clamp = () => {
    if (!panel.style.left) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(innerWidth - r.width, r.left)) + 'px';
    const top = Math.max(0, Math.min(innerHeight - 48, r.top));
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(120, innerHeight - top - 16) + 'px';
  };
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('.ic') || e.button > 0) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.right = 'auto';
    panel.classList.add('drag');
    let raf = 0, lx = 0, ly = 0;
    const move = ev => {
      lx = ev.clientX; ly = ev.clientY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; panel.style.left = lx - dx + 'px'; panel.style.top = ly - dy + 'px'; });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); raf = 0;
      panel.classList.remove('drag'); clamp(); save();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  addEventListener('resize', clamp);
  cleanups.push(() => removeEventListener('resize', clamp));

  minBtn.onclick = () => { panel.classList.toggle('min'); save(); refresh(); };
  head.ondblclick = e => { if (!e.target.closest('.ic')) minBtn.onclick(); };

  const onKey = e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Insert' || (e.key === '`' && !typing)) {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
      refresh();
    }
  };
  addEventListener('keydown', onKey);
  cleanups.push(() => removeEventListener('keydown', onKey));

  panel.append(head, tabs, alertEl, body, toastEl);
  document.head.append(style);
  document.body.append(panel);
  if (saved.x) { panel.style.left = saved.x; panel.style.top = saved.y; panel.style.right = 'auto'; clamp(); }
  if (saved.min) panel.classList.add('min');
  show(pages[saved.tab] ? saved.tab : 'Money');

  const destroy = () => {
    cleanups.forEach(f => f());
    clearTimeout(toastTimer);
    panel.remove();
    style.remove();
    delete window.__staxHub;
  };
  closeBtn.onclick = destroy;
  window.__staxHub = { destroy, store: s };
})();
