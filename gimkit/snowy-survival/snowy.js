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
// - Minimap: the whole map in a corner (terrain + walls) with every player as a dot: you, cursed and
//   humans in different colours, plus your camera view. M = big map. Styled by __snowy.minimap.theme;
//   raw data for a custom UI = __snowy.api.minimap().
// - Fun (client-side only — nobody else sees it): spinbot, Shrek skin (you or everyone), or any
//   image you pick as your skin.
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
  const cfg = { cursed: true, humans: true, boxes: true, tracers: true, names: true, health: true, list: true, highlight: true, autoAnswer: false, spin: false, shrek: false, shrekAll: false, minimap: true, mapBig: false, hidden: false };
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
  // Where a character really is on screen. The camera lags behind you and stops at map edges, so
  // the screen centre is NOT your character — always project world → screen. When a character is on
  // camera use its rendered sprite (spine, anchored at the feet); off camera the sprite isn't updated,
  // so fall back to the physics body (which sits ~13px above the feet).
  const FEET_BELOW_BODY = 13, CHAR_H = 70, CHAR_W = 52;  // world px
  const feetOf = ch => {
    const sp = ch.spine && (ch.spine.spine || ch.spine);
    if (sp && sp.visible && ch.culling && ch.culling.isInCamera && isFinite(sp.x)) return { x: sp.x, y: sp.y };
    return { x: ch.body.x, y: ch.body.y + FEET_BELOW_BODY };
  };
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cfg.hidden || !scene) return;
    let cam, chars, me;
    try { cam = scene.cameras.main; chars = [...scene.characterManager.characters.values()]; me = chars.find(c => c.isMain); } catch { return; }
    if (!cam || !cam.worldView.width) return;
    const wv = cam.worldView;
    // Map through the game canvas's real box (handles zoom, letterboxing, non-fullscreen layouts).
    const rect = (scene.sys.game.canvas || canvas).getBoundingClientRect();
    const kx = rect.width / wv.width, ky = rect.height / wv.height;
    const w2s = (wx, wy) => ({ x: rect.left + (wx - wv.x) * kx, y: rect.top + (wy - wv.y) * ky });
    const centreOf = ch => { const f = feetOf(ch); return w2s(f.x, f.y - CHAR_H / 2); };
    const origin = me ? centreOf(me) : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const bw = CHAR_W * kx, bh = CHAR_H * ky;

    for (const ch of chars) {
      if (ch.isMain) continue;
      try { if (ch.body.x == null) continue; } catch { continue; }
      const info = authInfo(ch.id) || {};
      const kind = teamKind(info.team);
      if (!showKind(kind)) continue;
      const c = centreOf(ch); if (!isFinite(c.x)) continue;
      const top = c.y - bh / 2;
      const color = info.alive === false ? COL.dead : COL[kind];

      if (cfg.boxes) { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.strokeRect(c.x - bw / 2, top, bw, bh); }
      if (cfg.tracers) { ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = kind === 'zombie' ? 0.85 : 0.55; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.globalAlpha = 1; }
      if (cfg.health && info.maxHp) {
        const frac = Math.max(0, Math.min(1, (info.hp + info.shield) / (info.maxHp)));
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(c.x - bw / 2, top - 6, bw, 4);
        ctx.fillStyle = info.shield > 0 ? '#5bd1ff' : '#ff5b5b'; ctx.fillRect(c.x - bw / 2, top - 6, bw * frac, 4);
      }
      if (cfg.names) {
        let label = (info.name || ch.type || '?');
        if (kind === 'zombie') label = '🧟 ' + label; else if (kind === 'human') label = '🏃 ' + label;
        if (info.immune) label += ' ⛨';
        if (me) label += '  ' + Math.round(Math.hypot(ch.body.x - me.body.x, ch.body.y - me.body.y));
        ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(c.x - tw / 2 - 4, top - 24, tw + 8, 15);
        ctx.fillStyle = color; ctx.fillText(label, c.x, top - 12);
      }
    }
  };
  // Draw right after Phaser renders each frame, so camera and sprite positions are the ones on screen
  // (a separate rAF can run before the game's update and draw a frame behind → lines wobble).
  // rAF fallback until the scene is found / if the event isn't available.
  let raf, synced = false;
  const onPost = () => draw();
  const loop = () => {
    if (!synced && scene && scene.sys && scene.sys.game && scene.sys.game.events) {
      scene.sys.game.events.on('postrender', onPost); synced = true;
      cleanups.push(() => { try { scene.sys.game.events.off('postrender', onPost); } catch {} });
    }
    if (!synced) draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  cleanups.push(() => cancelAnimationFrame(raf));

  // ---- fun (client-side only: changes what YOU see, never sent to the server) ----
  // Runs on Phaser's prerender (after the game positions sprites, before it draws), so our tweaks
  // win every frame. Skins are an image laid over the character's sprite, which is hidden.
  const SHREK_URL = 'https://upload.wikimedia.org/wikipedia/en/4/4d/Shrek_%28character%29.png'; // CORS-enabled
  const SKIN_H = 95;          // world px, a bit taller than a normal character
  const SPIN_DEG = 14;        // per frame
  const textures = {};        // key -> 'loading' | 'ready' | 'failed'
  const loadTexture = (key, src) => {
    if (!scene || textures[key] === 'ready' || textures[key] === 'loading') return;
    textures[key] = 'loading';
    const img = new Image(); img.crossOrigin = 'anonymous';   // WebGL can't use cross-origin images without CORS
    img.onload = () => { try { if (scene.textures.exists(key)) scene.textures.remove(key); scene.textures.addImage(key, img); textures[key] = 'ready'; } catch { textures[key] = 'failed'; } };
    img.onerror = () => { textures[key] = 'failed'; };
    img.src = src;
  };
  let customKey = null;       // set when you pick your own image
  const skinFor = ch => {
    if (ch.isMain) { if (customKey) return customKey; if (cfg.shrek || cfg.shrekAll) return 'vcm-shrek'; return null; }
    return cfg.shrekAll ? 'vcm-shrek' : null;
  };
  const overlays = new Map(); // character id -> {img, key, sp}
  let spinAngle = 0, spunSprite = null;
  const spriteOf = ch => ch && ch.spine && (ch.spine.spine || ch.spine);
  const dropOverlay = (id) => {
    const o = overlays.get(id); if (!o) return;
    try { o.img.destroy(); } catch {}
    try { o.sp.setVisible(true); } catch {}   // the game re-hides it next frame if it's off camera
    overlays.delete(id);
  };
  const funTick = () => {
    if (!scene) return;
    let chars; try { chars = [...scene.characterManager.characters.values()]; } catch { return; }
    if (cfg.shrek || cfg.shrekAll) loadTexture('vcm-shrek', SHREK_URL);
    const alive = new Set();
    for (const ch of chars) {
      const sp = spriteOf(ch); if (!sp) continue;
      const key = skinFor(ch);
      const onCam = ch.isMain || (ch.culling && ch.culling.isInCamera);
      if (!key || textures[key] !== 'ready' || !onCam) { if (overlays.has(ch.id)) dropOverlay(ch.id); continue; }
      alive.add(ch.id);
      let o = overlays.get(ch.id);
      if (o && o.key !== key) { dropOverlay(ch.id); o = null; }
      if (!o) {
        const img = scene.add.image(sp.x, sp.y, key).setOrigin(0.5, 0.5);   // centre pivot so spinning looks like spinning
        img.setScale(SKIN_H / img.height);
        o = { img, key, sp }; overlays.set(ch.id, o);
      }
      sp.setVisible(false);
      o.img.setPosition(sp.x, sp.y - SKIN_H / 2).setDepth(sp.depth + 0.5);   // sprite is anchored at the feet
      o.img.setFlipX(sp.scaleX < 0);            // face the way you're walking
      o.img.setAngle(ch.isMain && cfg.spin ? spinAngle : 0);
    }
    for (const id of [...overlays.keys()]) if (!alive.has(id)) dropOverlay(id);
    // Spinbot: rotate your own sprite (or your skin, above).
    const me = chars.find(c => c.isMain), mySp = spriteOf(me);
    if (cfg.spin && mySp) { spinAngle = (spinAngle + SPIN_DEG) % 360; mySp.angle = spinAngle; spunSprite = mySp; }
    else if (spunSprite) { spunSprite.angle = 0; spunSprite = null; spinAngle = 0; }
  };
  let funHooked = false;
  const onPre = () => { try { funTick(); } catch {} };
  const funHook = setInterval(() => {
    if (funHooked || !scene || !scene.sys || !scene.sys.game) return;
    scene.sys.game.events.on('prerender', onPre); funHooked = true;
  }, 300);
  cleanups.push(() => {
    clearInterval(funHook);
    try { scene.sys.game.events.off('prerender', onPre); } catch {}
    for (const id of [...overlays.keys()]) dropOverlay(id);
    if (spunSprite) spunSprite.angle = 0;
  });
  // Pick any image from your computer as your skin (read locally as a data: URL — no upload).
  const pickImage = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const key = 'vcm-custom-' + Date.now(); loadTexture(key, rd.result); customKey = key; };
      rd.readAsDataURL(f);
    };
    inp.click();
  };

  // ---- minimap ----
  // Whole map in a corner, everyone as a dot. Two halves:
  //   1. DATA (minimapData): map frame, terrain, walls, players, your camera view — all in world px.
  //      Exposed as __snowy.api.minimap() so a custom UI can draw it any way it likes.
  //   2. DRAW (mmDraw): a canvas renderer styled entirely by __snowy.minimap.theme.
  // Map frame = the camera's scroll limits, i.e. exactly the area the game lets you see in this phase
  // (lobby and game have different frames). The world itself is a 250×250 grid of 64px tiles, most of
  // it empty or holding off-map logic devices, so the raw world size would make the map tiny.
  const TILE = 64;
  const mmTheme = {
    size: 190,               // longest side of the small map, CSS px
    bigSize: 560,            // longest side when expanded (M)
    corner: 'bottom-right',  // bottom-right | bottom-left | top-right | top-left  (top-right = Gimkit's buttons + energy)
    margin: 12,
    radius: 10,
    frame: 'rgba(18,20,26,.88)', frameBorder: '#c353ff', framePad: 6,
    opacity: 1,
    background: '#e9f1f6',   // the snow under everything (map's backgroundTerrain is "Snow")
    terrain: { 'Snowy Grass': '#c9dccb', 'Light Scraps': '#c4c6c9', 'Dark Scraps': '#55575b', 'Sand': '#efd39b',
      'Dry Grass': '#e6a65a', 'Dirt': '#a77b52', 'Water': '#5fb0ea', 'Frozen Lake': '#a9d8f3' },
    terrainFallback: '#d4d8dc',
    wall: '#4b5360', wallAlpha: 0.9,
    view: 'rgba(255,255,255,.9)', viewWidth: 1, showView: true,
    dot: { me: '#4db6ff', zombie: '#c353ff', human: '#39d353', neutral: '#f4c430', dead: '#777' },
    dotRadius: 3.5, meRadius: 5, dotOutline: 'rgba(0,0,0,.75)', meRing: '#ffffff',
    immuneRing: '#ffffff',   // spawn-immune players get a thin ring
    labels: false,           // names next to dots (always on in the big map)
    labelFont: '600 10px system-ui,sans-serif', labelColor: '#10131a', labelHalo: 'rgba(255,255,255,.85)',
  };

  const mm = { layer: null, layerKey: '', walls: [], terrain: [], extent: null, sigAt: 0, sig: '' };
  const mapExtent = () => {
    try { const c = scene.cameras.main, b = c.getBounds(); if (c.useBounds && b && b.width > 0 && b.height > 0) return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch {}
    return mm.extent;  // no bounds right now (e.g. a cutscene): keep the last frame
  };
  const inExtent = (e, x, y, pad = 0) => x >= e.x - pad && x <= e.x + e.w + pad && y >= e.y - pad && y <= e.y + e.h + pad;

  // Terrain: one entry per tile in the frame. Higher depth draws on top. `solid` = can't walk on it.
  const readTerrain = e => {
    const out = [];
    try {
      store.world.terrain.tiles.forEach(t => {
        const x = t.x * TILE, y = t.y * TILE;
        if (x + TILE < e.x || y + TILE < e.y || x > e.x + e.w || y > e.y + e.h) return;
        out.push({ x, y, w: TILE, h: TILE, terrain: t.terrain, solid: !!t.collides, depth: t.depth || 0 });
      });
    } catch {}
    return out.sort((a, b) => a.depth - b.depth);
  };

  // Walls: the top-down colliders of every visible prop with collisions on, placed exactly like the game
  // does (checked against live physics bodies): collider offsets are relative to the IMAGE CENTRE,
  // in source-image px, times the prop's scale. Capsule "halfHeight" in the prop data is the full
  // straight length, so it's halved here.
  const propVisible = d => { const v = d.state && deref(d.state.visible); return v == null ? d.options.visibleOnGameStart !== false : !!v; };
  const readWalls = e => {
    const out = [];
    let devs = []; try { devs = scene.worldManager.devices.allDevices || []; } catch {}
    for (const d of devs) {
      try {
        if (!d || !d.options || !d.propOption || d.options.UseColliders === false || !propVisible(d)) continue;
        const po = d.propOption, def = po.colliders && po.colliders.topDown; if (!def) continue;
        const s = (po.scale || 1) * (d.options.Scale || 1), flip = d.options.FlipX ? -1 : 1;
        const ang = (d.options.Angle || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
        const img = po.image || {};
        const cx0 = (0.5 - (po.originX ?? 0.5)) * (img.width || 0) * s, cy0 = (0.5 - (po.originY ?? 0.5)) * (img.height || 0) * s;
        const place = (ox, oy) => { const lx = (cx0 + ox * s) * flip, ly = cy0 + oy * s; return { x: d.x + lx * ca - ly * sa, y: d.y + lx * sa + ly * ca }; };
        if (!inExtent(e, d.x, d.y, 600)) continue;
        for (const r of def.rectangle || []) {
          const c = place(r.x, r.y), a = ang + flip * (r.angle || 0) * Math.PI / 180;
          const hw = r.width * s / 2, hh = r.height * s / 2, c2 = Math.cos(a), s2 = Math.sin(a);
          out.push({ type: 'rect', propId: d.options.propId, x: c.x, y: c.y, w: hw * 2, h: hh * 2, angle: a,
            points: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => [c.x + px * c2 - py * s2, c.y + px * s2 + py * c2]) });
        }
        for (const r of def.circle || []) { const c = place(r.x, r.y); out.push({ type: 'circle', propId: d.options.propId, x: c.x, y: c.y, r: r.radius * s }); }
        for (const r of def.capsule || []) {
          const c = place(r.x, r.y), a = ang + flip * (r.angle || 0) * Math.PI / 180, half = (r.halfHeight || 0) * s / 2;
          // segment runs along the capsule's local Y axis (angle 90 = lying flat)
          const dx = -Math.sin(a) * half, dy = Math.cos(a) * half;
          out.push({ type: 'capsule', propId: d.options.propId, x: c.x, y: c.y, r: r.radius * s, angle: a, a: [c.x - dx, c.y - dy], b: [c.x + dx, c.y + dy] });
        }
      } catch {}
    }
    return out;
  };

  // Rebuild the static layer only when something that shapes it changes: frame, terrain edits, or a
  // prop appearing/disappearing (barriers that open mid-game). Checked every 2s; cheap otherwise.
  const staticSig = e => {
    let vis = 0; try { for (const d of scene.worldManager.devices.allDevices) if (d.propOption && propVisible(d)) vis++; } catch {}
    let tid = ''; try { tid = deref(store.world.terrain.currentTerrainUpdateId); } catch {}
    return [e.x, e.y, e.w, e.h].map(Math.round).join(',') + '|' + tid + '|' + store.world.terrain.tiles.size + '|' + vis;
  };
  const refreshStatic = () => {
    const e = mapExtent(); if (!e || !store) return false;
    if (Date.now() - mm.sigAt < 2000 && mm.extent) return true;
    mm.sigAt = Date.now();
    const sig = staticSig(e);
    if (sig === mm.sig) return true;
    mm.sig = sig; mm.extent = e; mm.terrain = readTerrain(e); mm.walls = readWalls(e); mm.layer = null;
    return true;
  };

  const mmKind = (id, info) => {
    if (id === myId()) return 'me';
    if (info && info.alive === false) return 'dead';
    return teamKind(info && info.team);
  };
  // Live dots. Smoothed position from the scene when the character exists there, else the server's.
  const readPlayers = () => {
    const out = [], seen = new Set();
    let chars = []; try { chars = [...scene.characterManager.characters.values()]; } catch {}
    for (const ch of chars) {
      try {
        if (ch.type && ch.type !== 'player') continue;
        const info = authInfo(ch.id) || {};
        out.push({ id: ch.id, name: info.name || '?', x: ch.body.x, y: ch.body.y, kind: mmKind(ch.id, info), team: info.team,
          hp: info.hp, shield: info.shield, immune: !!info.immune, alive: info.alive !== false, self: ch.id === myId() });
        seen.add(ch.id);
      } catch {}
    }
    try {
      room().state.characters.forEach((c, id) => {
        if (seen.has(id) || c.type === 'sentry') return;
        const info = authInfo(id) || {};
        out.push({ id, name: info.name || '?', x: c.x, y: c.y, kind: mmKind(id, info), team: info.team,
          hp: info.hp, shield: info.shield, immune: !!info.immune, alive: info.alive !== false, self: id === myId() });
      });
    } catch {}
    return out.filter(p => isFinite(p.x) && isFinite(p.y));
  };

  // Everything a custom minimap UI needs, in world px. Static parts are cached; safe to call per frame.
  const minimapData = () => {
    if (!scene || !store || !refreshStatic()) return null;
    let view = null; try { const wv = scene.cameras.main.worldView; view = { x: wv.x, y: wv.y, w: wv.width, h: wv.height }; } catch {}
    const players = readPlayers();
    const counts = { zombie: 0, human: 0, neutral: 0, dead: 0 };
    for (const p of players) { const k = p.self ? mmKind('', { team: p.team, alive: p.alive }) : p.kind; if (k in counts) counts[k]++; }
    return { phase: phase(), snowy: isSnowy(), extent: mm.extent, background: mmTheme.background, terrain: mm.terrain, walls: mm.walls,
      players, me: players.find(p => p.self) || null, view, counts };
  };

  // ---- default renderer ----
  const mmCanvas = document.createElement('canvas');
  Object.assign(mmCanvas.style, { position: 'fixed', zIndex: 2147483645, pointerEvents: 'none', display: 'none' });
  document.body.appendChild(mmCanvas);
  cleanups.push(() => mmCanvas.remove());
  const mctx = mmCanvas.getContext('2d');
  const terrainColor = name => mmTheme.terrain[name] || mmTheme.terrainFallback;

  // Static layer = background + terrain + walls, drawn once at the big size and scaled down.
  const buildLayer = (e, px) => {
    const k = px / Math.max(e.w, e.h);
    const c = document.createElement('canvas'); c.width = Math.ceil(e.w * k); c.height = Math.ceil(e.h * k);
    const g = c.getContext('2d');
    g.fillStyle = mmTheme.background; g.fillRect(0, 0, c.width, c.height);
    for (const t of mm.terrain) { g.fillStyle = terrainColor(t.terrain); g.fillRect(Math.floor((t.x - e.x) * k), Math.floor((t.y - e.y) * k), Math.ceil(t.w * k) + 1, Math.ceil(t.h * k) + 1); }
    g.globalAlpha = mmTheme.wallAlpha; g.fillStyle = mmTheme.wall; g.strokeStyle = mmTheme.wall; g.lineCap = 'round';
    for (const w of mm.walls) {
      if (w.type === 'rect') { g.beginPath(); w.points.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo']((x - e.x) * k, (y - e.y) * k)); g.closePath(); g.fill(); }
      else if (w.type === 'circle') { g.beginPath(); g.arc((w.x - e.x) * k, (w.y - e.y) * k, Math.max(1, w.r * k), 0, Math.PI * 2); g.fill(); }
      else { g.lineWidth = Math.max(1.5, w.r * 2 * k); g.beginPath(); g.moveTo((w.a[0] - e.x) * k, (w.a[1] - e.y) * k); g.lineTo((w.b[0] - e.x) * k, (w.b[1] - e.y) * k); g.stroke(); }
    }
    g.globalAlpha = 1;
    return c;
  };

  const mmDraw = () => {
    const T = mmTheme;
    if (!cfg.minimap || cfg.hidden) { mmCanvas.style.display = 'none'; return; }
    const data = minimapData();
    if (!data) { mmCanvas.style.display = 'none'; return; }
    const e = data.extent, big = cfg.mapBig;
    const side = big ? T.bigSize : T.size;
    const k = side / Math.max(e.w, e.h), mw = e.w * k, mh = e.h * k, pad = T.framePad;
    const cw = mw + pad * 2, ch = mh + pad * 2, dpr = devicePixelRatio || 1;
    if (mmCanvas.width !== Math.round(cw * dpr) || mmCanvas.height !== Math.round(ch * dpr)) {
      mmCanvas.width = Math.round(cw * dpr); mmCanvas.height = Math.round(ch * dpr);
      mmCanvas.style.width = cw + 'px'; mmCanvas.style.height = ch + 'px';
    }
    const corner = big ? 'center' : T.corner;
    Object.assign(mmCanvas.style, { display: 'block', opacity: T.opacity, top: '', bottom: '', left: '', right: '', transform: '' });
    if (corner === 'center') Object.assign(mmCanvas.style, { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' });
    else { const [v, h] = corner.split('-'); mmCanvas.style[v] = T.margin + 'px'; mmCanvas.style[h] = T.margin + 'px'; }

    const layerKey = mm.sig + '|' + JSON.stringify([T.background, T.terrain, T.terrainFallback, T.wall, T.wallAlpha, T.bigSize]);
    if (!mm.layer || mm.layerKey !== layerKey) { mm.layer = buildLayer(e, Math.max(T.bigSize, T.size) * dpr); mm.layerKey = layerKey; }

    const g = mctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(0.5, 0.5, cw - 1, ch - 1, T.radius); g.fillStyle = T.frame; g.fill(); g.lineWidth = 1; g.strokeStyle = T.frameBorder; g.stroke();
    g.save(); rr(pad, pad, mw, mh, Math.max(0, T.radius - pad / 2)); g.clip();
    g.drawImage(mm.layer, pad, pad, mw, mh);
    const toMap = (x, y) => [pad + (x - e.x) * k, pad + (y - e.y) * k];
    if (T.showView && data.view) { const [vx, vy] = toMap(data.view.x, data.view.y); g.lineWidth = T.viewWidth; g.strokeStyle = T.view; g.strokeRect(vx, vy, data.view.w * k, data.view.h * k); }
    // others first, you on top; cursed above humans so a chaser is never hidden under a crowd
    const order = { dead: 0, neutral: 1, human: 2, zombie: 3, me: 4 };
    const dots = data.players.slice().sort((a, b) => order[a.kind] - order[b.kind]);
    const showLabels = big || T.labels;
    for (const p of dots) {
      const [x, y] = toMap(p.x, p.y), r = p.self ? T.meRadius : T.dotRadius;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = T.dot[p.kind] || T.dot.neutral; g.fill();
      g.lineWidth = p.self ? 2 : 1; g.strokeStyle = p.self ? T.meRing : T.dotOutline; g.stroke();
      if (p.immune && !p.self) { g.beginPath(); g.arc(x, y, r + 2.5, 0, Math.PI * 2); g.lineWidth = 1; g.strokeStyle = T.immuneRing; g.stroke(); }
      if (showLabels) {
        g.font = T.labelFont; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = T.labelHalo; g.strokeText(p.name, x + r + 3, y); g.fillStyle = T.labelColor; g.fillText(p.name, x + r + 3, y);
      }
    }
    g.restore();
  };
  let mmT = 0;
  const mmLoop = () => { try { mmDraw(); } catch {} mmT = requestAnimationFrame(mmLoop); };
  mmT = requestAnimationFrame(mmLoop);
  cleanups.push(() => cancelAnimationFrame(mmT));

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
  const boxes = {};
  const group = (title, items) => {
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'opacity:.55;font-size:10.5px;margin-top:6px'; panel.appendChild(t);
    const box = document.createElement('div'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px 10px;margin:2px 0'; panel.appendChild(box);
    for (const [label, key] of items) {
      const l = document.createElement('label'); l.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cfg[key]; cb.style.accentColor = '#c353ff'; boxes[key] = cb;
      cb.onchange = () => { cfg[key] = cb.checked; if (key === 'highlight' && !cb.checked) unmark(); };
      l.appendChild(cb); l.appendChild(Object.assign(document.createElement('span'), { textContent: label })); box.appendChild(l);
    }
  };
  group('ESP', [['🧟 Cursed', 'cursed'], ['🏃 Humans', 'humans']]);
  group('Draw', [['Boxes', 'boxes'], ['Tracers', 'tracers'], ['Names', 'names'], ['Health', 'health'], ['List', 'list']]);
  group('Map', [['🗺 Minimap', 'minimap'], ['Big map (M)', 'mapBig']]);
  group('Answers', [['Highlight', 'highlight'], ['Auto-answer', 'autoAnswer']]);
  group('Fun (only you see it)', [['🌀 Spin', 'spin'], ['🟢 Shrek', 'shrek'], ['Everyone is Shrek', 'shrekAll']]);
  const funRow = document.createElement('div'); funRow.style.cssText = 'display:flex;gap:6px;margin:2px 0 4px';
  const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn;
    b.style.cssText = 'flex:1;padding:3px 6px;border-radius:5px;border:1px solid #c353ff;background:transparent;color:#e9ecf1;font:11px system-ui;cursor:pointer'; return b; };
  funRow.append(mkBtn('Custom skin…', pickImage), mkBtn('Clear skin', () => { customKey = null; }));
  panel.appendChild(funRow);
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

  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  const onKey = e => {
    if (e.key === 'Insert') { cfg.hidden = !cfg.hidden; panel.style.opacity = cfg.hidden ? .4 : 1; }
    else if ((e.key === 'm' || e.key === 'M') && !typing(e) && cfg.minimap) { cfg.mapBig = !cfg.mapBig; boxes.mapBig.checked = cfg.mapBig; }
  };
  addEventListener('keydown', onKey); cleanups.push(() => removeEventListener('keydown', onKey));

  window.__snowy = {
    cfg, ans,
    minimap: { theme: mmTheme, data: () => minimapData() },
    get scene() { return scene; }, get store() { return store; },
    api: { phase, isSnowy, openQuestion, questionScreenOpen, mainDevice, currentQid, myStats, teamKind, pickImage, textures, minimap: () => minimapData() },
    destroy() { cleanups.forEach(f => { try { f(); } catch {} }); canvas.remove(); panel.remove(); delete window.__snowy; },
  };
})();
