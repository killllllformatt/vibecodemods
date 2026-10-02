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
//   humans in different colours. Drag it anywhere; slider = size (names appear when it's big). Optional
//   box showing your screen. Look by Claude Design (Minimap.dc.html), knobs in __snowy.minimap.theme;
//   raw data for a custom UI = __snowy.api.minimap().
// - Aimbot (when cursed): every throw goes to the target, led for movement; Auto-fire throws by itself
//   whenever someone is in range with no wall in the way.
//   Rapid fire = hold the mouse to throw every 160 ms (the launcher normally needs a click per throw).
//   ♾ Ammo = when you're low on snowballs, answer questions at full speed in the background.
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
  const cfg = { cursed: true, humans: true, boxes: true, tracers: true, names: true, health: true, list: true, highlight: true, autoAnswer: false, spin: false, shrek: false, shrekAll: false, minimap: true, screenBox: false, aimbot: false, autoFire: false, aimLeadMs: 0, aimWaitTurns: false, rapidFire: false, ammoRefill: false, hidden: false };
  const COL = { zombie: '#c353ff', human: '#39d353', neutral: '#f4c430', dead: '#666' };

  // team "2" = cursed, "1" = human in snowInfection. Lobby / other modes / unassigned → neutral.
  const teamKind = tid => {
    if (phase() !== 'game' || !isSnowy()) return 'neutral';
    return tid === '2' ? 'zombie' : tid === '1' ? 'human' : 'neutral';
  };
  const showKind = kind => kind === 'zombie' ? cfg.cursed : kind === 'human' ? cfg.humans : (cfg.cursed || cfg.humans);

  // ---- overlay canvas ----
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: 2147483644, pointerEvents: 'none' });  // under the minimap
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
    drawAim(w2s);
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
  // Look = Claude Design's spec (Minimap.dc.html). Sizes in CSS px.
  const mmTheme = {
    size: 240,               // default longest side of the map (slider changes it; remembered per browser)
    minSize: 160, maxSize: 900,
    labelsFrom: 400,         // show names once the map is at least this big
    bigFrom: 480,            // switch to the larger dot style from this size
    corner: 'bottom-right',  // where it starts before you drag it (top-right = Gimkit's buttons + energy)
    margin: 12, radius: 10, clipRadius: 4, bigClipRadius: 6,
    frame: 'rgba(18,20,26,.92)', frameBorder: '#c353ff', framePad: 6, opacity: 1,
    shadow: '0 4px 14px rgba(0,0,0,.35)',
    background: '#eef3f7',
    terrain: { 'Snowy Grass': '#cfe0d2', 'Light Scraps': '#cfd2d6', 'Dark Scraps': '#5e6168', 'Sand': '#f1dcae',
      'Dry Grass': '#eab676', 'Dirt': '#b08862', 'Water': '#6bb6ea', 'Frozen Lake': '#b6dcf2' },
    terrainFallback: '#dde3e8',
    wall: '#3b4250', wallAlpha: 1, soft: '#a3afbd', tree: '#8fa394', fenceWidth: 1.25,
    view: 'rgba(16,19,26,.75)', viewInner: 'rgba(255,255,255,.7)', viewWidth: 1, bigViewWidth: 1.5,
    dot: { me: '#4db6ff', zombie: '#c353ff', human: '#39d353', neutral: '#f4c430', dead: '#8a8f98' },
    dotRadius: 3.5, crowdRadius: 3, crowdAbove: 30, bigDotRadius: 5,
    dotOutline: 'rgba(16,19,26,.85)', ink: '#10131a',
    deadFill: 'rgba(138,143,152,.3)',
    immuneRing: '#ffffff', immuneLining: 'rgba(16,19,26,.7)',
    meHalo: 'rgba(255,255,255,.4)', meHairline: 'rgba(16,19,26,.75)', meRing: '#ffffff',
    // your dot = blue fill + rings outward: ink, white, team colour, hairline, halo (outer radius of each)
    meRings: { r: 5, ink: 1, white: 2.5, team: 4.5, hair: 5.5, halo: 9.5 },
    bigMeRings: { r: 6.5, ink: 1.5, white: 3.5, team: 6, hair: 7, halo: 13 },
    labelFont: '600 11px system-ui,sans-serif', meLabelFont: '700 11px system-ui,sans-serif', labelHalo: 'rgba(255,255,255,.95)',
    labelColor: { me: '#0a4a78', zombie: '#5b1590', human: '#14572a', neutral: '#6b4f00', dead: '#4f545c' },
  };
  // Prop classes (by propId) for the wall layer: soft obstacles and trees get their own colour, fences are thin lines.
  const propClass = id => {
    const s = String(id || '').toLowerCase();
    if (s.includes('fence')) return 'fence';
    if (s.includes('tree')) return 'tree';
    if (/snow-pile|snow pile|igloo|ice|snowman/.test(s)) return 'soft';
    return 'wall';
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

  // ---- renderer (design: Minimap.dc.html) ----
  // One map: drag it anywhere, size slider in its bottom strip. DOM for the frame/strip (rewritten
  // only when the text changes), one canvas for the map. Terrain + walls are pre-rendered per size;
  // per frame only dots (and the optional screen box) are drawn. Dots are NOT clipped to the map: the
  // canvas extends into the frame padding so a player on the outer fence stays whole.
  const Z_MAP = 2147483645;   // ESP overlay sits under it; the mod panel above it
  const mkEl = (tag, css, html) => { const el = document.createElement(tag); if (css) el.style.cssText = css; if (html != null) el.innerHTML = html; return el; };
  const swatch = (c, s = 7) => `<span style="width:${s}px;height:${s}px;border-radius:50%;background:${c};flex:none"></span>`;
  const T = mmTheme;

  // size + position are a per-browser convenience; everything works if storage is blocked
  const PREF = 'vcm-snowy-minimap';
  const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } })();
  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch {} };
  let mapSize = Math.max(T.minSize, Math.min(T.maxSize, +pref.size || T.size));

  const mmFrame = mkEl('div', `position:fixed;z-index:${Z_MAP};display:none;box-sizing:border-box;cursor:grab;user-select:none;touch-action:none`);
  const mmBox = mkEl('div', 'position:relative');
  const mmCv = mkEl('canvas', 'position:absolute;display:block;pointer-events:none');
  const mmStrip = mkEl('div', 'display:flex;align-items:center;gap:9px;margin-top:5px;height:14px;padding:0 2px;font:600 10px/14px system-ui,sans-serif;color:#d6d9e0;white-space:nowrap');
  const mmInfo = mkEl('span', 'display:flex;align-items:center;gap:9px;min-width:0;overflow:hidden');
  const mmSlider = mkEl('input', 'flex:1;min-width:50px;max-width:140px;height:12px;margin:0 0 0 auto;accent-color:#c353ff;cursor:pointer');
  Object.assign(mmSlider, { type: 'range', min: T.minSize, max: T.maxSize, step: 10, value: mapSize, title: 'Map size' });
  mmStrip.append(mmInfo, mmSlider); mmBox.appendChild(mmCv); mmFrame.append(mmBox, mmStrip);
  document.body.appendChild(mmFrame);
  cleanups.push(() => mmFrame.remove());
  // While resizing, the map grows/shrinks from its bottom-right corner, so the slider (right end of the
  // strip) stays under the cursor instead of running away from it.
  let anchor = null;
  const setAnchor = () => { if (!anchor) { const r = mmFrame.getBoundingClientRect(); anchor = { right: r.right, bottom: r.bottom }; } };
  mmSlider.addEventListener('pointerdown', setAnchor);
  mmSlider.addEventListener('input', () => { setAnchor(); mapSize = +mmSlider.value; pref.size = mapSize; savePref(); });
  // give the keyboard back to the game (arrow keys would otherwise move the slider, not you)
  const releaseSlider = () => setTimeout(() => { mmSlider.blur(); if (anchor) { anchor = null; pref.pos = pos; savePref(); } }, 0);
  mmSlider.addEventListener('pointerup', releaseSlider); mmSlider.addEventListener('change', releaseSlider);

  // dragging: anywhere on the frame except the slider. Position is the frame's top-left, kept on screen.
  let pos = pref.pos && isFinite(pref.pos.x) ? { x: pref.pos.x, y: pref.pos.y } : null;
  let drag = null;
  mmFrame.addEventListener('pointerdown', ev => {
    if (ev.target === mmSlider || ev.button !== 0) return;
    const r = mmFrame.getBoundingClientRect();
    drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, id: ev.pointerId };
    try { mmFrame.setPointerCapture(ev.pointerId); } catch {}
    mmFrame.style.cursor = 'grabbing'; ev.preventDefault(); ev.stopPropagation();
  });
  mmFrame.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    pos = { x: ev.clientX - drag.dx, y: ev.clientY - drag.dy }; ev.preventDefault(); ev.stopPropagation();
  });
  const endDrag = ev => { if (!drag) return; drag = null; mmFrame.style.cursor = 'grab'; pref.pos = pos; savePref(); ev.stopPropagation(); };
  mmFrame.addEventListener('pointerup', endDrag); mmFrame.addEventListener('pointercancel', endDrag);
  // keep the game from reacting to clicks/drags on the map
  for (const t of ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu']) mmFrame.addEventListener(t, ev => ev.stopPropagation());

  const terrainColor = name => T.terrain[name] || T.terrainFallback;
  const layers = new Map();   // `${sig}|${w}x${h}` -> canvas
  const buildLayer = (e, W, H, dpr) => {
    const k = W / e.w;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = T.background; g.fillRect(0, 0, W, H);
    for (const t of mm.terrain) { g.fillStyle = terrainColor(t.terrain); g.fillRect(Math.floor((t.x - e.x) * k), Math.floor((t.y - e.y) * k), Math.ceil(t.w * k) + 1, Math.ceil(t.h * k) + 1); }
    const P = (x, y) => [(x - e.x) * k, (y - e.y) * k];
    g.globalAlpha = T.wallAlpha; g.lineCap = 'round';
    for (const w of mm.walls) {
      const cls = propClass(w.propId), col = cls === 'soft' ? T.soft : cls === 'tree' ? T.tree : T.wall;
      g.fillStyle = col; g.strokeStyle = col;
      if (w.type === 'rect' && cls === 'fence') {
        // a fence is a line along its long axis
        const p = w.points, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [a, b] = w.w >= w.h ? [mid(p[0], p[3]), mid(p[1], p[2])] : [mid(p[0], p[1]), mid(p[3], p[2])];
        g.lineWidth = Math.max(T.fenceWidth * dpr, Math.min(w.w, w.h) * k);
        g.beginPath(); g.moveTo(...P(a[0], a[1])); g.lineTo(...P(b[0], b[1])); g.stroke();
      } else if (w.type === 'rect') { g.beginPath(); w.points.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](...P(x, y))); g.closePath(); g.fill(); }
      else if (w.type === 'circle') { g.beginPath(); g.arc(...P(w.x, w.y), Math.max(dpr * 0.75, w.r * k), 0, Math.PI * 2); g.fill(); }
      else { g.lineWidth = Math.max(dpr, w.r * 2 * k); g.beginPath(); g.moveTo(...P(w.a[0], w.a[1])); g.lineTo(...P(w.b[0], w.b[1])); g.stroke(); }
    }
    g.globalAlpha = 1;
    return c;
  };
  // Pre-rendering is per size, so dragging the slider would rebuild every step: build at the nearest
  // 80px bucket at or above the size and let drawImage scale down a little.
  const layerFor = (e, mapW, mapH, dpr) => {
    const bucket = Math.ceil(Math.max(mapW, mapH) / 80) * 80, s = bucket / Math.max(mapW, mapH);
    const W = Math.round(mapW * s * dpr), H = Math.round(mapH * s * dpr), key = mm.sig + '|' + W + 'x' + H;
    let c = layers.get(key);
    if (!c) { if (layers.size > 6) layers.clear(); c = buildLayer(e, W, H, dpr * s); layers.set(key, c); }
    return c;
  };

  const myTeamKind = data => { const me = data.me; return me ? (me.alive === false ? 'dead' : teamKind(me.team)) : 'neutral'; };
  const circle = (g, x, y, r, fill) => { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };

  // Draw the map + dots into canvas `cv` whose (pad,pad) is the map's top-left.
  const drawMap = (cv, data, mapW, mapH, pad) => {
    const e = data.extent, dpr = devicePixelRatio || 1, longest = Math.max(mapW, mapH);
    const big = longest >= T.bigFrom;
    const cw = mapW + pad * 2, ch = mapH + pad * 2;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.style.left = -pad + 'px'; cv.style.top = -pad + 'px';
    }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const k = mapW / e.w;
    const toMap = (x, y) => [pad + (x - e.x) * k, pad + (y - e.y) * k];
    // terrain + screen box, clipped to the map's rounded rect
    const cr = big ? T.bigClipRadius : T.clipRadius;
    g.save();
    g.beginPath(); g.roundRect ? g.roundRect(pad, pad, mapW, mapH, cr) : g.rect(pad, pad, mapW, mapH); g.clip();
    g.drawImage(layerFor(e, mapW, mapH, dpr), pad, pad, mapW, mapH);
    if (cfg.screenBox && data.view) {
      const vw = Math.min(mapW, data.view.w * k), vh = Math.min(mapH, data.view.h * k);
      let [vx, vy] = toMap(data.view.x, data.view.y);
      vx = Math.max(pad, Math.min(pad + mapW - vw, vx)); vy = Math.max(pad, Math.min(pad + mapH - vh, vy));
      const lw = big ? T.bigViewWidth : T.viewWidth;
      g.lineWidth = lw; g.strokeStyle = T.view; g.strokeRect(vx + lw / 2, vy + lw / 2, vw - lw, vh - lw);
      g.lineWidth = 1; g.strokeStyle = T.viewInner; g.strokeRect(vx + lw + 0.5, vy + lw + 0.5, vw - lw * 2 - 1, vh - lw * 2 - 1);
    }
    g.restore();

    // dots: knocked out, humans/lobby, cursed, then you on top
    const order = { dead: 0, neutral: 1, human: 1, zombie: 2, me: 3 };
    const dots = data.players.slice().sort((a, b) => order[a.kind] - order[b.kind]);
    const crowd = !big && dots.length > T.crowdAbove;
    const baseR = big ? T.bigDotRadius : crowd ? T.crowdRadius : T.dotRadius;
    const teamCol = T.dot[myTeamKind(data)] || T.dot.neutral;
    const showLabels = longest >= T.labelsFrom;
    const labels = [];
    for (const p of dots) {
      const [x, y] = toMap(p.x, p.y);
      let r;
      if (p.self) {
        const R = big ? T.bigMeRings : T.meRings; r = R.r;
        circle(g, x, y, r + R.halo, T.meHalo); circle(g, x, y, r + R.hair, T.meHairline); circle(g, x, y, r + R.team, teamCol);
        circle(g, x, y, r + R.white, T.meRing); circle(g, x, y, r + R.ink, T.ink); circle(g, x, y, r, T.dot.me);
      } else {
        r = p.kind === 'dead' ? (big ? 4.5 : 3) : baseR;
        if (p.immune) {   // dashed white ring with a dark lining inside and out
          const lw = big ? 2 : 1.5, R = r + (big ? 4.5 : 3.5) - lw / 2;
          g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.setLineDash([]); g.lineWidth = lw + 2; g.strokeStyle = T.immuneLining; g.stroke();
          g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.setLineDash([2, 2]); g.lineWidth = lw; g.strokeStyle = T.immuneRing; g.stroke(); g.setLineDash([]);
        }
        if (p.kind === 'dead') {
          circle(g, x, y, r, T.deadFill);
          const lw = big ? 2 : 1.5; g.beginPath(); g.arc(x, y, r - lw / 2, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = T.dot.dead; g.stroke();
        } else {
          circle(g, x, y, r + (big ? 1.5 : 1), T.dotOutline); circle(g, x, y, r, T.dot[p.kind] || T.dot.neutral);
        }
      }
      if (showLabels) labels.push({ p, x, y, r, gap: p.self ? 9 : 5 });
    }
    // names after all dots so a crowd never covers them; flip left near the east edge
    for (const L of labels) {
      const { p, x, y } = L, flip = x - pad > mapW * 0.86, dx = L.r + L.gap;
      g.font = p.self ? T.meLabelFont : T.labelFont; g.textBaseline = 'middle'; g.textAlign = flip ? 'right' : 'left';
      const name = p.self ? p.name + ' (you)' : p.name, tx = flip ? x - dx : x + dx;
      g.lineJoin = 'round'; g.lineWidth = 3.5; g.strokeStyle = T.labelHalo; g.strokeText(name, tx, y);
      g.fillStyle = T.labelColor[p.self ? 'me' : p.kind] || T.labelColor.neutral; g.fillText(name, tx, y);
    }
  };

  // strip: counts (+ "You're cursed" / "Waiting for host"); only touch the DOM when the text changes
  let stripKey = '';
  const updateStrip = (data, wide) => {
    const lobby = data.phase !== 'game';
    const cursed = !lobby && data.snowy && myTeamKind(data) === 'zombie';
    let html;
    if (lobby || !data.snowy) html = `<span style="display:flex;align-items:center;gap:4px">${swatch(T.dot.neutral)}${data.players.length} ${lobby ? 'in lobby' : 'players'}</span>` +
      (lobby && wide ? '<span style="color:#8b90a0">Waiting for host</span>' : '');
    else html = `<span style="display:flex;align-items:center;gap:4px">${swatch(T.dot.zombie)}${data.counts.zombie}${wide ? ' cursed' : ''}</span>` +
      `<span style="display:flex;align-items:center;gap:4px">${swatch(T.dot.human)}${data.counts.human}${wide ? (data.counts.human === 1 ? ' human' : ' humans') : ''}</span>` +
      (cursed ? '<span style="font:700 9px/14px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#12141a;background:#c353ff;border-radius:3px;padding:0 5px">You\'re cursed</span>' : '');
    if (html !== stripKey) { mmInfo.innerHTML = html; stripKey = html; }
  };

  const mmDraw = () => {
    const data = !cfg.hidden && cfg.minimap ? minimapData() : null;
    if (!data) { mmFrame.style.display = 'none'; return; }
    const e = data.extent, pad = T.framePad;
    // never bigger than the window
    const fitK = Math.min((innerWidth - T.margin * 2 - pad * 2 - 2) / e.w, (innerHeight - T.margin * 2 - pad * 2 - 2 - 19) / e.h);
    const k = Math.max(0.005, Math.min(mapSize / Math.max(e.w, e.h), fitK));
    const mapW = Math.round(e.w * k), mapH = Math.round(e.h * k);
    const fw = mapW + pad * 2 + 2, fh = mapH + pad * 2 + 2 + 19;
    if (!pos) {   // first show: start in the configured corner
      const [v, h] = T.corner.split('-');
      pos = { x: h === 'left' ? T.margin : innerWidth - T.margin - fw, y: v === 'top' ? T.margin : innerHeight - T.margin - fh };
    }
    if (anchor) pos = { x: anchor.right - fw, y: anchor.bottom - fh };
    // keep fully on screen (window resized, map grew, or a saved spot from a bigger screen)
    pos.x = Math.max(0, Math.min(innerWidth - fw, pos.x)); pos.y = Math.max(0, Math.min(innerHeight - fh, pos.y));
    Object.assign(mmFrame.style, { display: 'block', left: pos.x + 'px', top: pos.y + 'px', width: fw + 'px', padding: pad + 'px',
      background: T.frame, border: '1px solid ' + T.frameBorder, borderRadius: T.radius + 'px', boxShadow: T.shadow, opacity: T.opacity });
    mmBox.style.width = mapW + 'px'; mmBox.style.height = mapH + 'px';
    if (+mmSlider.value !== mapSize) mmSlider.value = mapSize;
    drawMap(mmCv, data, mapW, mapH, pad);
    updateStrip(data, mapW >= 320);
  };
  let mmT = 0;
  const mmLoop = () => { try { mmDraw(); } catch {} mmT = requestAnimationFrame(mmLoop); };
  mmT = requestAnimationFrame(mmLoop);
  cleanups.push(() => cancelAnimationFrame(mmT));

  // ---- aimbot ----
  // Throwing = one client message FIRE {angle, x, y}; the angle is chosen by the client (from your
  // character's centre toward the mouse) and the server just simulates the snowball from there. So:
  //   - Aimbot: rewrite the angle of every FIRE you send (and AIMING, so your launcher visibly points
  //     at the target) to hit the chosen target — click anywhere.
  //   - Auto-fire: call the game's own fire() at the target, which keeps every client rule (held
  //     launcher, ammo, cooldown) and simply does nothing until the cooldown has passed.
  // Prediction: targets are read from the server state (≈150 ms ahead of the drawn sprites), their
  // velocity from recent server updates, and the throw is led so snowball and player meet.
  // Snowball numbers measured live: ~1000 px range, ~670 px/s, spawns ~95 px from your centre,
  // centre = 20 px above the physics body. Range/speed are re-learned from your own throws.
  const AIM = { centerUp: 20, startDist: 95, speed: 670, range: 1000, hitRadius: 22, fenceExtra: 12 };
  // hitRadius = snowball radius (0.225 units). Measured: throws skimming an ice barrier hit; a fence stopped
  // one ~30px out (fences block a bit more than their walking outline), hence fenceExtra.
  const aim = { target: null, point: null, angle: null, shots: 0, hits: 0, mine: new Set(), why: '' };
  const tracks = new Map();   // id -> [{t,x,y}] recent server positions
  const sampleTracks = r => {
    const now = performance.now();
    r.state.characters.forEach((c, id) => {
      let a = tracks.get(id); if (!a) tracks.set(id, a = []);
      const l = a[a.length - 1];
      if (!l || l.x !== c.x || l.y !== c.y) a.push({ t: now, x: c.x, y: c.y });
      while (a.length > 2 && now - a[0].t > 600) a.shift();
    });
  };
  // Server updates arrive every ~83 ms with noisy steps, so average over a window. `win` in ms.
  const velocityOf = (id, win = 300) => {
    const a = tracks.get(id), now = performance.now();
    if (!a || a.length < 2 || now - a[a.length - 1].t > 250) return { x: 0, y: 0 };   // no recent update = standing still
    const l = a[a.length - 1]; let f = a[0];
    for (const s of a) if (l.t - s.t <= win) { f = s; break; }
    if (f === l) f = a[a.length - 2];
    const dt = (l.t - f.t) / 1000;
    return dt < 0.05 ? { x: 0, y: 0 } : { x: (l.x - f.x) / dt, y: (l.y - f.y) / dt };
  };
  // Turning / stopping / starting = the lead will be wrong (measured: every miss in a zig-zag test was a
  // throw during a direction change). Compare the last 250 ms with the last 600 ms; updates are noisy
  // (single steps read 160–620 px/s for a 310 px/s walker), so only clear turns/stops count.
  const steady = id => {
    const s = velocityOf(id, 250), l = velocityOf(id, 600), ss = Math.hypot(s.x, s.y), ls = Math.hypot(l.x, l.y);
    if (ss < 60 && ls < 60) return true;                    // standing still
    if (ss < 60 || ls < 60) return false;                   // just stopped or just started
    const cos = (s.x * l.x + s.y * l.y) / (ss * ls);
    return cos > 0.5 && ss / ls > 0.4 && ss / ls < 2.5;
  };

  // geometry for line of sight against the minimap's wall shapes
  const segPt2 = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx - p.x, y = a.y + t * dy - p.y; return x * x + y * y;
  };
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const segsCross = (a, b, c, d) => (cross(a, b, c) > 0) !== (cross(a, b, d) > 0) && (cross(c, d, a) > 0) !== (cross(c, d, b) > 0);
  const segSeg = (a, b, c, d) => segsCross(a, b, c, d) ? 0 : Math.sqrt(Math.min(segPt2(a, c, d), segPt2(b, c, d), segPt2(c, a, b), segPt2(d, a, b)));
  const inPoly = (p, P) => { let inside = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
  const blocked = (A, B, pr0 = AIM.hitRadius) => {
    const minX = Math.min(A.x, B.x) - 500, maxX = Math.max(A.x, B.x) + 500, minY = Math.min(A.y, B.y) - 500, maxY = Math.max(A.y, B.y) + 500;
    for (const w of mm.walls) {
      if (w.x < minX || w.x > maxX || w.y < minY || w.y > maxY) continue;
      const pr = pr0 && propClass(w.propId) === 'fence' ? pr0 + AIM.fenceExtra : pr0;
      if (w.type === 'circle') { if (segPt2({ x: w.x, y: w.y }, A, B) < (w.r + pr) ** 2) return true; }
      else if (w.type === 'capsule') { if (segSeg(A, B, { x: w.a[0], y: w.a[1] }, { x: w.b[0], y: w.b[1] }) < w.r + pr) return true; }
      else {
        const P = w.points.map(([x, y]) => ({ x, y }));
        if (inPoly(A, w.points) || inPoly(B, w.points)) return true;
        for (let i = 0; i < 4; i++) { const d = segSeg(A, B, P[i], P[(i + 1) % 4]); if (d === 0 || d < pr) return true; }
      }
    }
    return false;
  };

  const reserveOf = itemId => { try { return deref(store.me.inventory.slots.get(itemId).amount) || 0; } catch { return 0; } };
  const heldWeapon = () => {
    try {
      const n = deref(store.me.inventory.activeInteractiveSlot); if (!n) return null;
      const s = deref(store.me.inventory.interactiveSlots).get(String(n));
      if (!s || !deref(s.itemId)) return null;
      return { itemId: deref(s.itemId), clip: deref(s.currentClip), clipSize: deref(s.clipSize), waiting: !!deref(s.waiting), reserve: reserveOf('snowballs') };
    } catch { return null; }
  };
  const myCentre = () => {
    try { const me = [...scene.characterManager.characters.values()].find(c => c.isMain); return me ? { x: me.body.x, y: me.body.y - AIM.centerUp } : null; } catch { return null; }
  };
  const mouseWorld = () => { try { const p = scene.input.activePointer; return scene.cameras.main.getWorldPoint(p.x, p.y); } catch { return null; } };

  // Lead the target: where will it be when the snowball arrives? (fixed-point iteration)
  // Players stop at walls: never predict through one (a runner pinned against a fence stays there).
  const clampToWalls = (P, pt) => {
    if (!blocked(P, pt, 6)) return pt;   // thin: a runner sliding along a fence must still be led
    let lo = 0, hi = 1;
    for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (blocked(P, { x: P.x + (pt.x - P.x) * m, y: P.y + (pt.y - P.y) * m }, 6)) hi = m; else lo = m; }
    return { x: P.x + (pt.x - P.x) * lo, y: P.y + (pt.y - P.y) * lo };
  };
  const intercept = (C, P, V) => {
    const lag = (cfg.aimLeadMs || 0) / 1000;
    let t = 0, pt = P;
    for (let i = 0; i < 5; i++) {
      pt = { x: P.x + V.x * (t + lag), y: P.y + V.y * (t + lag) };
      t = Math.max(0, (Math.hypot(pt.x - C.x, pt.y - C.y) - AIM.startDist) / AIM.speed);
    }
    return (V.x || V.y) ? clampToWalls(P, pt) : pt;
  };

  // Pick the target each frame. Auto-fire: the nearest one you can hit. Otherwise: the one closest to
  // the direction of your mouse, so you choose by pointing roughly at someone.
  const aimTick = () => {
    aim.target = aim.point = aim.angle = null;
    if (!(cfg.aimbot || cfg.autoFire) || !store || !scene) { aim.why = ''; return; }
    const r = room(); if (!r) return;
    sampleTracks(r);
    if (phase() !== 'game') { aim.why = 'waiting for the game'; return; }
    const w = heldWeapon(); if (!w) { aim.why = 'hold your launcher'; return; }
    if (!refreshStatic()) return;
    const C = myCentre(); if (!C) return;
    const mine = myId(); let myTeam = null; try { myTeam = deref(r.state.characters.get(mine).teamId); } catch {}
    const mouse = mouseWorld(), mouseAng = mouse ? Math.atan2(mouse.y - C.y, mouse.x - C.x) : 0;
    let best = null, bestScore = Infinity, anyInRange = false;
    r.state.characters.forEach((c, id) => {
      if (id === mine || c.type === 'sentry' || c.isActive === false) return;
      const h = c.health || {};
      if (deref(h.lives) === 0 || deref(h.spawnImmunityActive) || deref(c.teamId) === myTeam) return;
      const pt = intercept(C, { x: c.x, y: c.y - AIM.centerUp }, velocityOf(id));
      const d = Math.hypot(pt.x - C.x, pt.y - C.y);
      if (d - AIM.startDist > AIM.range * 0.97) return;
      anyInRange = true;
      const ang = Math.atan2(pt.y - C.y, pt.x - C.x);
      // Two legs, like the server: centre → spawn point must not cross a wall (thin line; otherwise the
      // throw is dropped), then the snowball's flight needs clearance (it's a ball, and stops ~30px from fences).
      const S = { x: C.x + Math.cos(ang) * AIM.startDist, y: C.y + Math.sin(ang) * AIM.startDist };
      if (blocked(C, S, 0) || blocked(S, pt)) return;
      let score = d;
      if (!cfg.autoFire && mouse) { let da = Math.abs(ang - mouseAng) % (2 * Math.PI); if (da > Math.PI) da = 2 * Math.PI - da; score = da; }
      if (score < bestScore) { bestScore = score; best = { id, pt, ang, name: c.name, steady: steady(id) }; }
    });
    if (!best) { aim.why = anyInRange ? 'no clear shot' : 'nobody in range'; return; }
    aim.target = best.id; aim.point = best.pt; aim.angle = best.ang; aim.why = '→ ' + best.name;
    if (!best.steady) aim.why += ' (turning)';
    // auto-fire waits out direction changes: snowballs are scarce (you only earn them by answering)
    if (cfg.autoFire && (best.steady || !cfg.aimWaitTurns) && w.clip > 0 && deref(store.me.currentAction) !== 'deviceUI') {
      try { scene.worldManager.projectiles.fire({ worldX: best.pt.x, worldY: best.pt.y }, false); } catch {}
    }
  };
  let aimRaf = 0;
  const aimLoop = () => { try { aimTick(); } catch {} aimRaf = requestAnimationFrame(aimLoop); };
  aimRaf = requestAnimationFrame(aimLoop);
  cleanups.push(() => cancelAnimationFrame(aimRaf));

  // Outgoing hook (installed once the room is known; removed on destroy): retarget FIRE + AIMING.
  let hookedRoom = null, origSend = null, offProj = null;
  const installAimHook = () => {
    const r = room(); if (!r || r === hookedRoom) return;
    if (hookedRoom && origSend) hookedRoom.send = origSend;
    if (offProj) { try { offProj(); } catch {} offProj = null; }
    hookedRoom = r; origSend = r.send;
    r.send = function (type, payload, ...rest) {
      try {
        if ((type === 'FIRE' || type === 'AIMING') && cfg.aimbot && aim.angle != null && payload && typeof payload === 'object') payload = { ...payload, angle: aim.angle };
        if (type === 'FIRE') aim.shots++;
      } catch {}
      return origSend.call(this, type, payload, ...rest);
    };
    // own snowballs: learn range/speed, count hits
    try {
      offProj = r.onMessage('PROJECTILE_CHANGES', d => {
        try {
          for (const p of d.added || []) {
            if (p.ownerId !== myId()) continue;
            aim.mine.add(p.id); if (aim.mine.size > 200) aim.mine.delete(aim.mine.values().next().value);
            const range = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y) * 100, dur = (p.endTime - p.startTime) / 1000;
            if (range > 100 && dur > 0.1) { AIM.range = range; AIM.speed = range / dur; }
          }
          // hit = {id, x, y, hits:[{characterId, damage}]} (no characterId = it hit a wall)
          for (const h of d.hit || []) if (h && aim.mine.has(h.id) && (h.hits || []).some(x => x.characterId && x.characterId !== myId())) aim.hits++;
        } catch {}
      });
    } catch {}
  };
  const aimHookT = setInterval(() => { try { installAimHook(); } catch {} }, 500);

  // Rapid fire. Every snowball launcher has a 160 ms cooldown but allowAutoFire:false, so holding the
  // mouse throws once and you must click for each throw. Flipping allowAutoFire in OUR copy of the item
  // options makes the game's own hold-to-fire loop throw every 160 ms, the rate the server accepts
  // (measured). Spamming raw FIREs faster (what older mods do) gets throttled to slower than normal.
  const autoFireSaved = new Map();   // weapon.shared object -> original allowAutoFire
  const weaponShareds = () => {
    const out = []; try { const io = store.worldOptions.itemOptions; each(io, o => { const sh = o && o.weapon && o.weapon.shared; if (sh) out.push(sh); }); } catch {}
    return out;
  };
  const applyRapid = on => {
    if (on) { for (const sh of weaponShareds()) if (!autoFireSaved.has(sh)) { autoFireSaved.set(sh, sh.allowAutoFire); sh.allowAutoFire = true; } }
    else { autoFireSaved.forEach((v, sh) => { try { sh.allowAutoFire = v; } catch {} }); autoFireSaved.clear(); }
  };
  // Auto-reload: an empty clip with snowballs left reloads by itself (same message as pressing R).
  let lastReload = 0;
  const gunTick = () => {
    if (!store) return;
    applyRapid(!!cfg.rapidFire);
    if (!(cfg.aimbot || cfg.autoFire || cfg.rapidFire || cfg.ammoRefill)) return;
    const w = heldWeapon(), r = room();
    if (w && r && w.clip === 0 && !w.waiting && w.reserve > 0 && Date.now() - lastReload > 1500) { lastReload = Date.now(); r.send('RELOAD'); }
  };
  const gunT = setInterval(() => { try { gunTick(); } catch {} }, 300);
  cleanups.push(() => { clearInterval(gunT); applyRapid(false); });
  cleanups.push(() => { clearInterval(aimHookT); if (hookedRoom && origSend) hookedRoom.send = origSend; if (offProj) try { offProj(); } catch {} });

  // drawn by the ESP overlay: ring on the target, small cross on the lead point
  const drawAim = w2s => {
    if (!aim.target || !aim.point) return;
    try {
      const ch = scene.characterManager.characters.get(aim.target);
      const lead = w2s(aim.point.x, aim.point.y);
      ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2;
      if (ch) { const c = w2s(ch.body.x, ch.body.y - AIM.centerUp); ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(lead.x, lead.y); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(lead.x - 7, lead.y); ctx.lineTo(lead.x + 7, lead.y); ctx.moveTo(lead.x, lead.y - 7); ctx.lineTo(lead.x, lead.y + 7); ctx.stroke();
    } catch {}
  };

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
  // ♾ Ammo: snowballs only come from answering (6 per correct), but the server takes answers as fast as
  // they come (measured 9.7/s, 0 wrong = ~58 snowballs/s). When you run low, answer at full speed until
  // you're stocked. Note: your correct-answer count on the teacher's screen climbs fast while it runs.
  const REFILL_LOW = 40, REFILL_FULL = 150;
  const refill = { on: false, gained: 0 };
  const ammoTick = () => {
    if (!cfg.ammoRefill || !store || phase() !== 'game') { refill.on = false; return; }
    const w = heldWeapon(); if (!w) { refill.on = false; return; }
    const total = w.clip + w.reserve;
    if (!refill.on && total < REFILL_LOW) refill.on = true;
    if (refill.on && w.reserve >= REFILL_FULL) refill.on = false;
    if (!refill.on || questionScreenOpen()) return;
    const r = room(), devId = mainDevice(); if (!r || !devId) return;
    const qid = currentQid(devId); if (!qid) return;
    if (qid === ans.lastQid && Date.now() - ans.lastAt < 3000) return;   // wait for the server to move on
    const answer = answerPayload(questionsOf(devId).find(x => x._id === qid)); if (answer == null) return;
    r.send('MESSAGE_FOR_DEVICE', { key: 'answered', deviceId: devId, data: { answer } });
    ans.lastQid = qid; ans.lastAt = Date.now(); ans.sent++; refill.gained++;
  };
  const ammoT = setInterval(() => { try { ammoTick(); } catch {} }, 60);
  cleanups.push(() => clearInterval(ammoT));
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
  group('Map', [['🗺 Minimap', 'minimap'], ['Screen box', 'screenBox']]);
  const syncMapRow = () => { boxes.minimap.parentElement.style.color = cfg.minimap ? '' : '#8b90a0'; };
  syncMapRow(); boxes.minimap.addEventListener('change', syncMapRow);
  group('Aim (when cursed)', [['🎯 Aimbot', 'aimbot'], ['Auto-fire', 'autoFire'], ['⚡ Rapid fire', 'rapidFire'], ['♾ Ammo', 'ammoRefill']]);
  const aimStat = document.createElement('div'); aimStat.style.cssText = 'opacity:.7;margin:0 0 2px;display:none'; panel.appendChild(aimStat);
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
    aimStat.style.display = cfg.aimbot || cfg.autoFire || cfg.rapidFire || cfg.ammoRefill ? 'block' : 'none';
    const gw = heldWeapon();
    aimStat.textContent = `🎯 ${aim.why || '…'} · ${aim.shots} thrown${aim.hits ? ', ' + aim.hits + ' hit' : ''}` +
      (gw ? ` · ❄ ${gw.clip}+${gw.reserve}` : '') + (refill.on ? ' · refilling…' : '');
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

  const onKey = e => {
    if (e.key === 'Insert') { cfg.hidden = !cfg.hidden; panel.style.opacity = cfg.hidden ? .4 : 1; }
  };
  addEventListener('keydown', onKey); cleanups.push(() => removeEventListener('keydown', onKey));

  window.__snowy = {
    cfg, ans,
    minimap: { theme: mmTheme, data: () => minimapData() },
    get scene() { return scene; }, get store() { return store; },
    api: { aim: () => ({ ...aim, AIM }), los: (A, B, pr) => blocked(A, B, pr), phase, isSnowy, openQuestion, questionScreenOpen, mainDevice, currentQid, myStats, teamKind, pickImage, textures, minimap: () => minimapData() },
    destroy() { cleanups.forEach(f => { try { f(); } catch {} }); canvas.remove(); panel.remove(); delete window.__snowy; },
  };
})();
