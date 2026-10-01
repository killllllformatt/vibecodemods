// Gimkit Snowy Survival ESP — read-only overlay for the "snowInfection" mode.
// Pulls smoothed positions from the Phaser scene (characterManager) and identity/team/health
// from the authoritative MobX store (room.state.characters). Draws boxes + tracers colored by
// infection status, and a live roster of who's a zombie vs human. No packets sent.
// Toggle panel: Insert. Re-click bookmarklet to remove.
(() => {
  if (window.__sesp) { window.__sesp.destroy(); return; }

  const P = window.Phaser;
  if (!P || !P.Scenes || !P.Scenes.Systems) { alert('Snowy ESP: Phaser not found. Run inside a live game.'); return; }

  const cleanups = [];
  const deref = v => (v && typeof v === 'object' && 'value_' in v) ? v.value_ : v;

  // ---- acquire the Phaser "game" scene (Systems.step fires each frame with this=Systems) ----
  let scene = null;
  const sProto = P.Scenes.Systems.prototype, origStep = sProto.step;
  sProto.step = function (...a) { try { if (this.scene && this.scene.characterManager) scene = this.scene; } catch {} return origStep.apply(this, a); };
  cleanups.push(() => { sProto.step = origStep; });
  setTimeout(() => { sProto.step = origStep; }, 3000);

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

  // ---- config + colors ----
  const cfg = { boxes: true, tracers: true, names: true, health: true, list: true, immune: true, hidden: false };
  const COL = { zombie: '#c353ff', human: '#39d353', me: '#4db6ff', neutral: '#f4c430', dead: '#666' };

  // team "2" = zombie, "1" = human (snowInfection). Fall back gracefully pre-assignment.
  const teamKind = tid => tid === '2' ? 'zombie' : tid === '1' ? 'human' : 'neutral';

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
      let c = null; store.network.room.state.characters.forEach((v, i) => { if (i === id) c = v; });
      if (!c) return null;
      const h = c.health || {};
      return { team: deref(c.teamId), name: c.name, hp: Math.round(deref(h.health) ?? 0), shield: Math.round(deref(h.shield) ?? 0),
        maxHp: deref(h.maxHealth) ?? 100, immune: !!deref(h.spawnImmunityActive), alive: c.isActive !== false && (deref(h.lives) !== 0) };
    } catch { return null; }
  };

  const myId = () => { try { return store.network.authId; } catch { return null; } };

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
      const s = w2s(bx, by); if (!isFinite(s.x)) continue;
      const info = authInfo(ch.id) || {};
      const kind = teamKind(info.team);
      const color = !info.alive ? COL.dead : COL[kind];

      const bw = 30, bh = 46;
      if (cfg.boxes) { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh); }
      if (cfg.tracers) { ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = kind === 'zombie' ? 0.85 : 0.55; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.globalAlpha = 1; }
      // health bar
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

  // ---- panel: toggles + live roster ----
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'fixed', top: '10px', left: '10px', zIndex: 2147483647, width: '210px',
    background: '#12141aee', color: '#e9ecf1', font: '12px system-ui,sans-serif', padding: '8px 10px', borderRadius: '8px',
    border: '1px solid #c353ff', userSelect: 'none', backdropFilter: 'blur(3px)' });
  const head = document.createElement('div'); head.innerHTML = '<b style="color:#c353ff">Snowy ESP</b> <span style="opacity:.55">Insert=hide</span>'; panel.appendChild(head);
  const toggles = document.createElement('div'); toggles.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px;margin:5px 0'; panel.appendChild(toggles);
  for (const [label, key] of [['Boxes', 'boxes'], ['Tracers', 'tracers'], ['Names', 'names'], ['Health', 'health'], ['List', 'list']]) {
    const l = document.createElement('label'); l.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cfg[key]; cb.style.accentColor = '#c353ff'; cb.onchange = () => cfg[key] = cb.checked;
    l.appendChild(cb); l.appendChild(Object.assign(document.createElement('span'), { textContent: label })); toggles.appendChild(l);
  }
  const counts = document.createElement('div'); counts.style.cssText = 'font-weight:700;margin:2px 0'; panel.appendChild(counts);
  const roster = document.createElement('div'); roster.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:320px;overflow:auto'; panel.appendChild(roster);
  document.body.appendChild(panel);

  const refresh = () => {
    if (!store) { store = findStore(); }
    roster.style.display = cfg.list ? 'flex' : 'none';
    let zombies = 0, humans = 0;
    const rows = [];
    try {
      const mine = myId();
      store.network.room.state.characters.forEach((c, id) => {
        const info = authInfo(id); if (!info) return;
        const kind = teamKind(info.team);
        if (kind === 'zombie') zombies++; else if (kind === 'human') humans++;
        rows.push({ id, self: id === mine, name: info.name, kind, hp: info.hp + info.shield, alive: info.alive, immune: info.immune });
      });
    } catch {}
    counts.textContent = `🧟 ${zombies}   🏃 ${humans}`;
    rows.sort((a, b) => (a.kind === b.kind ? b.hp - a.hp : a.kind === 'zombie' ? -1 : 1));
    roster.replaceChildren(...rows.map(r => {
      const d = document.createElement('div');
      d.style.cssText = `display:flex;justify-content:space-between;gap:6px;padding:1px 3px;border-radius:3px;${r.self ? 'outline:1px solid #4db6ff;' : ''}`;
      const c = r.kind === 'zombie' ? COL.zombie : r.kind === 'human' ? COL.human : COL.neutral;
      const tag = r.kind === 'zombie' ? '🧟' : r.kind === 'human' ? '🏃' : '•';
      d.innerHTML = `<span style="color:${c};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tag} ${r.name || '?'}${r.self ? ' (you)' : ''}${r.immune ? ' ⛨' : ''}</span><span style="opacity:.7">${r.alive ? r.hp : '☠'}</span>`;
      return d;
    }));
  };
  refresh(); const rt = setInterval(refresh, 400); cleanups.push(() => clearInterval(rt));

  const onKey = e => { if (e.key === 'Insert') { cfg.hidden = !cfg.hidden; panel.style.opacity = cfg.hidden ? .4 : 1; } };
  addEventListener('keydown', onKey); cleanups.push(() => removeEventListener('keydown', onKey));

  window.__sesp = { cfg, get scene() { return scene; }, get store() { return store; }, destroy() { cleanups.forEach(f => { try { f(); } catch {} }); canvas.remove(); panel.remove(); delete window.__sesp; } };
})();
