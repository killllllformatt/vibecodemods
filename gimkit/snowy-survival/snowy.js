// Gimkit Snowy Survival helper ("snowInfection" mode): cursed/human ESP + correct-answer highlight +
// auto-answer.
//
// - ESP: smoothed positions from the Phaser scene (characterManager), identity/team/health from the
//   authoritative MobX store (room.state.characters). Separate toggles for cursed (team "2") and
//   humans (team "1"); before teams exist (lobby) everyone is drawn in a neutral colour.
// - Answers: every question-device ships GLOBAL_questions (all questions WITH answers[].correct) in
//   its device state, and PLAYER_<authId>_currentQuestionId says which one you're on.
//   Highlight: outlines the correct tile, only while that device's question screen is open.
//   Auto-answer: sends MESSAGE_FOR_DEVICE {key:'answered', deviceId, data:{answer}} straight to the
//   server — no question screen needed. Each question is answered ONCE: the server counts an answer
//   to a question you've already moved past as WRONG, so we never resend until it advances.
// Insert = hide/show panel. Click the bookmarklet again to remove everything.
(() => {
  if (window.__snowy) { window.__snowy.destroy(); return; }

  const P = window.Phaser;
  if (!P || !P.Scenes || !P.Scenes.Systems) { alert('Snowy: no 2D game found. Open this inside a Snowy Survival game.'); return; }

  const cleanups = [];
  const deref = v => (v && typeof v === 'object' && 'value_' in v) ? v.value_ : v;
  const each = (m, f) => { if (!m) return; if (typeof m.forEach === 'function') m.forEach(f); else Object.entries(m).forEach(([k, v]) => f(v, k)); };
  const getProp = (m, k) => (m && typeof m.get === 'function') ? deref(m.get(k)) : m ? deref(m[k]) : undefined;

  // ---- acquire the Phaser "game" scene (Systems.step fires each frame with this=Systems) ----
  let scene = null;
  const sProto = P.Scenes.Systems.prototype, origStep = sProto.step;
  sProto.step = function (...a) { try { if (this.scene && this.scene.characterManager) scene = this.scene; } catch {} return origStep.apply(this, a); };
  cleanups.push(() => { sProto.step = origStep; });
  setTimeout(() => { if (scene) sProto.step = origStep; }, 3000);

  // ---- acquire the MobX store (obj with .network.room + .me + .world) via fiber scan ----
  const findStore = () => {
    const isStore = v => { try { return v && typeof v === 'object' && v.network && v.network.room && v.me && v.world; } catch { return false; } };
    let host = null;
    for (const el of document.querySelectorAll('*')) { for (const kk in el) { if (kk.startsWith('__reactFiber$')) { host = el; break; } } if (host) break; }
    if (!host) return null;
    const seen = new Set(), q = [];
    for (const kk in host) if (kk.startsWith('__reactFiber$')) q.push(host[kk]);
    let steps = 0;
    while (q.length && steps < 60000) {
      const f = q.shift(); steps++; if (!f || seen.has(f)) continue; seen.add(f);
      for (const bag of ['memoizedProps', 'memoizedState', 'stateNode']) {
        const b = f[bag];
        if (b && typeof b === 'object') { if (isStore(b)) return b; for (const key of Object.keys(b).slice(0, 40)) { try { if (isStore(b[key])) return b[key]; } catch {} } }
      }
      if (f.child) q.push(f.child); if (f.sibling) q.push(f.sibling); if (f.return && !seen.has(f.return)) q.push(f.return);
      let h = f.memoizedState, hi = 0;
      while (h && typeof h === 'object' && hi < 25) { try { const ms = h.memoizedState; if (isStore(ms)) return ms; if (ms && typeof ms === 'object') for (const key of Object.keys(ms).slice(0, 25)) { if (isStore(ms[key])) return ms[key]; } } catch {} h = h.next; hi++; }
    }
    return null;
  };
  let store = findStore();

  const room = () => store && store.network && store.network.room;
  const myId = () => { try { return store.network.authId; } catch { return null; } };
  const phase = () => { try { return room().state.session.phase; } catch { return ''; } }; // 'preGame' | 'game'
  // Snowy Survival = the snowInfection preset; its music path is the most reliable marker.
  const isSnowy = () => { try { return /\/modes\/snowInfection\//.test(JSON.parse(room().state.mapSettings).musicUrl || ''); } catch { return false; } };

  // ---- config + colors ----
  const cfg = { cursed: true, humans: true, boxes: true, tracers: true, names: true, health: true, list: true, highlight: true, autoAnswer: false, hidden: false };
  const COL = { zombie: '#c353ff', human: '#39d353', neutral: '#f4c430', dead: '#666' };

  // team "2" = cursed, "1" = human in snowInfection. Lobby / other modes / unassigned → neutral.
  const teamKind = tid => {
    if (phase() !== 'game' || !isSnowy()) return 'neutral';
    return tid === '2' ? 'zombie' : tid === '1' ? 'human' : 'neutral';
  };
  const showKind = kind => kind === 'zombie' ? cfg.cursed : kind === 'human' ? cfg.humans : (cfg.cursed || cfg.humans);

  // ---- overlay canvas ----
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: 2147483646, pointerEvents: 'none' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const fit = () => { const d = devicePixelRatio || 1; canvas.width = innerWidth * d; canvas.height = innerHeight * d; canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; ctx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit); cleanups.push(() => removeEventListener('resize', fit));

  // ---- authoritative lookup: id -> {team, hp, maxHp, name, immune, alive} from store ----
  const authInfo = id => {
    try {
      const c = room().state.characters.get(id);
      if (!c) return null;
      const h = c.health || {};
      return { team: deref(c.teamId), name: c.name, hp: Math.round(deref(h.health) ?? 0), shield: Math.round(deref(h.shield) ?? 0),
        maxHp: deref(h.maxHealth) ?? 100, immune: !!deref(h.spawnImmunityActive), alive: c.isActive !== false && (deref(h.lives) !== 0) };
    } catch { return null; }
  };

  // ---- draw ----
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cfg.hidden || !scene) return;
    let cam, chars, me;
    try { cam = scene.cameras.main; chars = [...scene.characterManager.characters.values()]; me = chars.find(c => c.isMain); } catch { return; }
    if (!cam) return;
    const wv = cam.worldView;
    const sx = innerWidth / cam.width, sy = innerHeight / cam.height;
    const w2s = (wx, wy) => ({ x: (wx - wv.x) / wv.width * cam.width * sx, y: (wy - wv.y) / wv.height * cam.height * sy });
    const cx = innerWidth / 2, cy = innerHeight / 2;

    for (const ch of chars) {
      if (ch.isMain) continue;
      let bx, by; try { bx = ch.body.x; by = ch.body.y; } catch { continue; }
      if (bx == null) continue;
      const info = authInfo(ch.id) || {};
      const kind = teamKind(info.team);
      if (!showKind(kind)) continue;
      const s = w2s(bx, by); if (!isFinite(s.x)) continue;
      const color = info.alive === false ? COL.dead : COL[kind];

      const bw = 30, bh = 46;
      if (cfg.boxes) { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh); }
      if (cfg.tracers) { ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = kind === 'zombie' ? 0.85 : 0.55; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.globalAlpha = 1; }
      if (cfg.health && info.maxHp) {
        const frac = Math.max(0, Math.min(1, (info.hp + info.shield) / (info.maxHp)));
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(s.x - bw / 2, s.y - bh - 6, bw, 4);
        ctx.fillStyle = info.shield > 0 ? '#5bd1ff' : '#ff5b5b'; ctx.fillRect(s.x - bw / 2, s.y - bh - 6, bw * frac, 4);
      }
      if (cfg.names) {
        let label = (info.name || ch.type || '?');
        if (kind === 'zombie') label = '🧟 ' + label; else if (kind === 'human') label = '🏃 ' + label;
        if (info.immune) label += ' ⛨';
        if (me) label += '  ' + Math.round(Math.hypot(bx - me.body.x, by - me.body.y));
        ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(s.x - tw / 2 - 4, s.y - bh - 24, tw + 8, 15);
        ctx.fillStyle = color; ctx.fillText(label, s.x, s.y - bh - 12);
      }
    }
  };
  let raf; const loop = () => { draw(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop);
  cleanups.push(() => cancelAnimationFrame(raf));

  // ---- questions ----
  // Question devices: gimkitLiveQuestion. The main one gives the per-role reward (+energy as a human,
  // +snowballs once cursed) and has no fixed "correct" text; side ones (e.g. "+1 Bait") do.
  const qCache = new Map(); // deviceId -> {raw, list}
  const questionsOf = devId => {
    const st = store.world.devices.states.get(devId);
    const raw = st && getProp(st.properties || st, 'GLOBAL_questions');
    if (!raw) return [];
    const c = qCache.get(devId);
    if (c && c.raw === raw) return c.list;
    let list = []; try { list = JSON.parse(raw); } catch {}
    qCache.set(devId, { raw, list });
    return list;
  };
  const questionDevices = () => {
    const out = [];
    each(store.world.devices.devices, (d, id) => { if (d && d.deviceOption && d.deviceOption.id === 'gimkitLiveQuestion') out.push({ id, d }); });
    return out;
  };
  const mainDevice = () => {
    const qd = questionDevices();
    const main = qd.find(x => !(x.d.options && x.d.options.textShownWhenAnsweringCorrectly));
    return (main || qd[0] || {}).id || null;
  };
  const currentQid = devId => {
    const st = store.world.devices.states.get(devId);
    return st ? getProp(st.properties || st, `PLAYER_${myId()}_currentQuestionId`) : null;
  };
  const answerPayload = q => {
    if (!q || !Array.isArray(q.answers)) return null;
    if (q.type === 'text') return q.answers[0] && q.answers[0].text;   // typed-answer questions
    const c = q.answers.find(a => a.correct);
    return c && c._id;
  };

  // Is any question screen open (even before its question resolves)?
  const questionScreenOpen = () => {
    try {
      if (deref(store.me.currentAction) !== 'deviceUI') return false;
      const cur = deref(store.me.deviceUI.current);
      const dev = cur && cur.deviceId && store.world.devices.devices.get(cur.deviceId);
      return !!(dev && dev.deviceOption && dev.deviceOption.id === 'gimkitLiveQuestion');
    } catch { return false; }
  };
  // The question screen that's open right now, if any: {devId, q}.
  const openQuestion = () => {
    try {
      if (deref(store.me.currentAction) !== 'deviceUI') return null;
      const cur = deref(store.me.deviceUI.current);
      const devId = cur && cur.deviceId;
      const dev = devId && store.world.devices.devices.get(devId);
      if (!dev || !dev.deviceOption || dev.deviceOption.id !== 'gimkitLiveQuestion') return null;
      const qid = (cur.props && cur.props.currentQuestionId) || currentQid(devId);
      const q = questionsOf(devId).find(x => x._id === qid);
      return q ? { devId, q } : null;
    } catch { return null; }
  };

  // Highlight: outline the correct tile while (and only while) its question screen is on screen.
  let marked = null;
  const unmark = () => { if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; marked.style.boxShadow = ''; } marked = null; };
  cleanups.push(unmark);
  const tileFor = q => {
    const texts = q.answers.map(a => String(a.text || '').trim()).filter(Boolean);
    const correct = q.answers.filter(a => a.correct).map(a => String(a.text || '').trim()).filter(Boolean);
    if (!correct.length) return null;  // image-only answers: nothing to match
    const spans = [...document.querySelectorAll('span.notranslate')].filter(e => texts.includes(e.textContent.trim()));
    const hit = spans.find(e => correct.includes(e.textContent.trim()));   // exact match ("Hawai" ≠ "Hawaii")
    if (!hit) return null;
    // Lowest common ancestor of all answer spans = the answer grid; the tile is the grid's child.
    let grid = spans.length > 1 ? spans[0].parentElement : hit.parentElement;
    while (grid && !spans.every(s => grid.contains(s))) grid = grid.parentElement;
    let tile = hit;
    while (tile.parentElement && tile.parentElement !== grid) tile = tile.parentElement;
    return tile;
  };
  const highlightTick = () => {
    const oq = cfg.highlight && store ? openQuestion() : null;
    const tile = oq ? tileFor(oq.q) : null;
    if (tile === marked && (!marked || marked.isConnected)) return;
    unmark();
    if (tile) { tile.style.outline = '4px solid #56d364'; tile.style.outlineOffset = '-6px'; tile.style.boxShadow = 'inset 0 0 0 9999px rgba(86,211,100,.12)'; marked = tile; }
  };

  // Auto-answer: one answer per question, straight to the server. Paused while a question screen is
  // open: answering behind it advances the server but leaves the screen on the old question, and a
  // click on that stale screen would be judged against the new one (= wrong). Reopening the screen
  // always loads the current question, so pausing keeps screen, highlight and server in step.
  const ans = { lastQid: '', lastAt: 0, sent: 0, paused: false };
  const autoAnswerTick = () => {
    if (!cfg.autoAnswer || !store || phase() !== 'game') return;
    if (questionScreenOpen()) { ans.paused = true; return; }
    ans.paused = false;
    const r = room(); if (!r) return;
    const devId = mainDevice(); if (!devId) return;
    const qid = currentQid(devId); if (!qid) return;
    // Same question still current: the server hasn't processed our answer yet. Wait — a resend that
    // lands after it advances would be judged against the NEXT question and count as wrong.
    if (qid === ans.lastQid && Date.now() - ans.lastAt < 8000) return;
    const q = questionsOf(devId).find(x => x._id === qid);
    const answer = answerPayload(q); if (answer == null) return;
    r.send('MESSAGE_FOR_DEVICE', { key: 'answered', deviceId: devId, data: { answer } });
    ans.lastQid = qid; ans.lastAt = Date.now(); ans.sent++;
  };
  let nextAnswerAt = 0;
  const qt = setInterval(() => {
    try {
      if (!store) store = findStore();
      highlightTick();
      if (Date.now() >= nextAnswerAt) { autoAnswerTick(); nextAnswerAt = Date.now() + 900 + Math.random() * 600; }
    } catch {}
  }, 150);
  cleanups.push(() => clearInterval(qt));

  const myStats = () => {
    try { const p = store.me.properties; return { correct: getProp(p, 'Correct Questions') || 0, incorrect: getProp(p, 'Incorrect Questions') || 0 }; } catch { return { correct: 0, incorrect: 0 }; }
  };

  // ---- panel: toggles + live roster ----
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'fixed', top: '10px', left: '10px', zIndex: 2147483647, width: '220px',
    background: '#12141aee', color: '#e9ecf1', font: '12px system-ui,sans-serif', padding: '8px 10px', borderRadius: '8px',
    border: '1px solid #c353ff', userSelect: 'none' });
  const head = document.createElement('div'); head.innerHTML = '<b style="color:#c353ff">Snowy</b> <span style="opacity:.55">Insert=hide</span>'; panel.appendChild(head);
  const note = document.createElement('div'); note.style.cssText = 'color:#f4c430;margin-top:3px;display:none'; panel.appendChild(note);
  const group = (title, items) => {
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'opacity:.55;font-size:10.5px;margin-top:6px'; panel.appendChild(t);
    const box = document.createElement('div'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px;margin:2px 0'; panel.appendChild(box);
    for (const [label, key] of items) {
      const l = document.createElement('label'); l.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cfg[key]; cb.style.accentColor = '#c353ff';
      cb.onchange = () => { cfg[key] = cb.checked; if (key === 'highlight' && !cb.checked) unmark(); };
      l.appendChild(cb); l.appendChild(Object.assign(document.createElement('span'), { textContent: label })); box.appendChild(l);
    }
  };
  group('ESP', [['🧟 Cursed', 'cursed'], ['🏃 Humans', 'humans']]);
  group('Draw', [['Boxes', 'boxes'], ['Tracers', 'tracers'], ['Names', 'names'], ['Health', 'health'], ['List', 'list']]);
  group('Answers', [['Highlight', 'highlight'], ['Auto-answer', 'autoAnswer']]);
  const stat = document.createElement('div'); stat.style.cssText = 'opacity:.7;margin:3px 0'; panel.appendChild(stat);
  const counts = document.createElement('div'); counts.style.cssText = 'font-weight:700;margin:2px 0'; panel.appendChild(counts);
  const roster = document.createElement('div'); roster.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:300px;overflow:auto'; panel.appendChild(roster);
  document.body.appendChild(panel);

  const refresh = () => {
    if (!store) { store = findStore(); }
    roster.style.display = cfg.list ? 'flex' : 'none';
    const snowy = store ? isSnowy() : true;
    note.style.display = snowy ? 'none' : 'block';
    note.textContent = 'Not Snowy Survival: everyone is shown in neutral.';
    const s = myStats(); stat.textContent = `✓ ${s.correct}  ✗ ${s.incorrect}${cfg.autoAnswer ? (ans.paused ? '  · auto paused (question open)' : '  · auto-answer on') : ''}`;
    let zombies = 0, humans = 0;
    const rows = [];
    try {
      const mine = myId();
      room().state.characters.forEach((c, id) => {
        const info = authInfo(id); if (!info) return;
        const kind = teamKind(info.team);
        if (kind === 'zombie') zombies++; else if (kind === 'human') humans++;
        rows.push({ id, self: id === mine, name: info.name, kind, hp: info.hp + info.shield, alive: info.alive, immune: info.immune });
      });
    } catch {}
    counts.textContent = phase() === 'game' && snowy ? `🧟 ${zombies}   🏃 ${humans}` : `Lobby · ${rows.length} players`;
    rows.sort((a, b) => (a.kind === b.kind ? b.hp - a.hp : a.kind === 'zombie' ? -1 : 1));
    roster.replaceChildren(...rows.map(r => {
      const d = document.createElement('div');
      d.style.cssText = `display:flex;justify-content:space-between;gap:6px;padding:1px 3px;border-radius:3px;${r.self ? 'outline:1px solid #4db6ff;' : ''}`;
      const c = r.kind === 'zombie' ? COL.zombie : r.kind === 'human' ? COL.human : COL.neutral;
      const tag = r.kind === 'zombie' ? '🧟' : r.kind === 'human' ? '🏃' : '•';
      const name = document.createElement('span'); name.style.cssText = `color:${c};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
      name.textContent = `${tag} ${r.name || '?'}${r.self ? ' (you)' : ''}${r.immune ? ' ⛨' : ''}`;
      const hp = document.createElement('span'); hp.style.opacity = '.7'; hp.textContent = r.alive ? r.hp : '☠';
      d.append(name, hp);
      return d;
    }));
  };
  refresh(); const rt = setInterval(refresh, 400); cleanups.push(() => clearInterval(rt));

  const onKey = e => { if (e.key === 'Insert') { cfg.hidden = !cfg.hidden; panel.style.opacity = cfg.hidden ? .4 : 1; } };
  addEventListener('keydown', onKey); cleanups.push(() => removeEventListener('keydown', onKey));

  window.__snowy = {
    cfg, ans,
    get scene() { return scene; }, get store() { return store; },
    api: { phase, isSnowy, openQuestion, questionScreenOpen, mainDevice, currentQid, myStats, teamKind },
    destroy() { cleanups.forEach(f => { try { f(); } catch {} }); canvas.remove(); panel.remove(); delete window.__snowy; },
  };
})();
