// Gimkit ESP / tracers — read-only overlay for 2D (top-down/platformer) modes.
// Reads the client's own replicated character state (scene.characterManager) and draws
// boxes, names, and tracer lines on a canvas above the game. No packets sent; nothing
// server-authoritative is touched. Toggle: Insert. Re-click bookmarklet to remove.
(() => {
  if (window.__esp) { window.__esp.destroy(); return; }

  const P = window.Phaser;
  if (!P || !P.Scenes || !P.Scenes.Systems) { alert('Gimkit ESP: Phaser not found. Run this inside a live 2D game.'); return; }

  // The runtime game object isn't on window and window.Phaser.Game isn't the running class,
  // but Phaser.Scenes.Systems.prototype.step IS called every frame with `this` = a scene's
  // Systems. Wrap it briefly to capture the live "game" scene, then restore.
  let scene = null;
  const proto = P.Scenes.Systems.prototype;
  const origStep = proto.step;
  proto.step = function (...a) {
    try { if (this.scene && this.scene.characterManager) scene = this.scene; } catch {}
    return origStep.apply(this, a);
  };
  setTimeout(() => { proto.step = origStep; }, 1500); // stop capturing once we have it

  // ---------- overlay ----------
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: 2147483646, pointerEvents: 'none' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const cfg = { boxes: true, tracers: true, names: true, distance: true, devices: false, hidden: false };

  const fitCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fitCanvas();
  addEventListener('resize', fitCanvas);

  const worldToScreen = (cam, wx, wy) => {
    const wv = cam.worldView;
    return { x: (wx - wv.x) / wv.width * cam.width, y: (wy - wv.y) / wv.height * cam.height };
  };

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (cfg.hidden || !scene) return;
    let cam, chars, me;
    try {
      cam = scene.cameras.main;
      chars = [...scene.characterManager.characters.values()];
      me = chars.find(c => c.isMain);
    } catch { return; }
    if (!cam) return;

    // camera renders into a viewport that may be offset; use camera width/height in CSS px.
    const scaleX = innerWidth / cam.width, scaleY = innerHeight / cam.height;
    const w2s = (wx, wy) => { const p = worldToScreen(cam, wx, wy); return { x: p.x * scaleX, y: p.y * scaleY }; };

    const myTeam = me && me.teamId;
    const cx = innerWidth / 2, cy = innerHeight / 2;

    for (const ch of chars) {
      if (ch.isMain) continue;
      let bx, by;
      try { bx = ch.body.x; by = ch.body.y; } catch { continue; }
      if (bx == null) continue;
      const s = w2s(bx, by);
      if (!isFinite(s.x) || !isFinite(s.y)) continue;

      const ally = ch.teamId != null && myTeam != null && ch.teamId === myTeam;
      const color = ch.type !== 'player' ? '#f4c430' : ally ? '#39d353' : '#ff4d4d';

      // box (approx character footprint ~40x56 world px at zoom)
      const bw = 34 * scaleX * (cam.zoom || 1) * 0 + 30, bh = 46; // fixed-ish screen box
      if (cfg.boxes) {
        ctx.lineWidth = 2; ctx.strokeStyle = color;
        ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh);
      }
      if (cfg.tracers) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (cfg.names || cfg.distance) {
        let label = '';
        if (cfg.names) { try { label = ch.nametag.name || ch.type; } catch { label = ch.type || '?'; } }
        if (cfg.distance && me) { const d = Math.round(Math.hypot(bx - me.body.x, by - me.body.y)); label += (label ? '  ' : '') + d; }
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(s.x - tw / 2 - 4, s.y - bh - 18, tw + 8, 16);
        ctx.fillStyle = color; ctx.fillText(label, s.x, s.y - bh - 5);
      }
    }

    // device/item ESP (optional) — worldManager.devices
    if (cfg.devices) {
      try {
        const devs = scene.worldManager && scene.worldManager.devices;
        const list = devs && (devs.all || devs.list || (devs.values ? [...devs.values()] : Object.values(devs)));
        if (Array.isArray(list)) for (const d of list.slice(0, 400)) {
          const wx = d.x ?? (d.position && d.position.x), wy = d.y ?? (d.position && d.position.y);
          if (wx == null) continue;
          const s = w2s(wx, wy);
          if (!isFinite(s.x)) continue;
          ctx.fillStyle = 'rgba(80,180,255,0.9)';
          ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 7); ctx.fill();
        }
      } catch {}
    }
  };

  let raf;
  const loop = () => { draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);

  // ---------- tiny control panel ----------
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'fixed', top: '10px', left: '10px', zIndex: 2147483647,
    background: '#16181dcc', color: '#e9ecf1', font: '12px system-ui,sans-serif', padding: '8px 10px',
    borderRadius: '8px', border: '1px solid #39d353', userSelect: 'none', backdropFilter: 'blur(3px)' });
  panel.innerHTML = '<b style="color:#39d353">Gimkit ESP</b> <span style="opacity:.6">(Insert=hide)</span><br>';
  const mkToggle = (label, key) => {
    const id = 'esp_' + key;
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;justify-content:space-between;gap:10px;cursor:pointer;padding:2px 0';
    wrap.innerHTML = `<span>${label}</span>`;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cfg[key]; cb.style.accentColor = '#39d353';
    cb.onchange = () => cfg[key] = cb.checked;
    wrap.appendChild(cb); panel.appendChild(wrap);
  };
  mkToggle('Boxes', 'boxes'); mkToggle('Tracers', 'tracers'); mkToggle('Names', 'names');
  mkToggle('Distance', 'distance'); mkToggle('Items/devices', 'devices');
  const status = document.createElement('div'); status.style.cssText = 'opacity:.6;margin-top:4px'; panel.appendChild(status);
  document.body.appendChild(panel);

  const onKey = e => { if (e.key === 'Insert') { cfg.hidden = !cfg.hidden; panel.style.opacity = cfg.hidden ? .4 : 1; } };
  addEventListener('keydown', onKey);

  const statusTimer = setInterval(() => {
    let n = 0; try { n = scene ? scene.characterManager.characters.size - 1 : 0; } catch {}
    status.textContent = scene ? `tracking ${Math.max(0, n)} other player(s)` : 'searching for game…';
  }, 500);

  window.__esp = {
    cfg,
    destroy() {
      cancelAnimationFrame(raf); clearInterval(statusTimer);
      removeEventListener('resize', fitCanvas); removeEventListener('keydown', onKey);
      proto.step = origStep; canvas.remove(); panel.remove(); delete window.__esp;
    },
    get scene() { return scene; }
  };
})();
