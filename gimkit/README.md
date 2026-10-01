# Gimkit — code stash

Working code for Gimkit game-mode mods, collected here so we don't rebuild it from scratch.
**This is not a user-facing hub.** No install pages, no bookmarklets, no build step — just the
scripts and the notes needed to turn them into a real section later. Gimkit is big; modes will be
merged into one mode-detecting menu eventually, built from this code.

## What's here

| Mode | File | What it does |
| --- | --- | --- |
| Trust No One | [`trust-no-one/tno-reveal.js`](trust-no-one/tno-reveal.js) | Reveals every player's real role (impostor vs detective), highlights the correct answer, optional F8 auto-answer. |
| Snowy Survival | [`snowy-survival/snowy-esp.js`](snowy-survival/snowy-esp.js) | Zombie/human infection ESP: boxes + tracers by infection status, health/shield bars, live roster. |

Each file is a self-contained IIFE. To run: paste it inline into the page console (the live site's
CSP blocks loading from `127.0.0.1`, so inline is the reliable path). Both toggle their panel with
**Insert**. Wrapping into a bookmarklet is a later step — don't add that machinery back here.

## Build knowledge (so future-me can extend / merge these)

**Trust No One = classic mode = Blueboat, NOT Colyseus/Phaser.**
- Socket: `wss://<x>.gimkitconnect.com/blueboat/?EIO=3` (socket.io v2). Binary frame = `0x04` +
  msgpack `{type:2, data:[event, payload], nsp:"/"}`.
- Server broadcasts **`IMPOSTER_MODE_PEOPLE`** (every player's real role) to ALL clients, and
  re-sends it on request. Own role arrives once as STATE_UPDATE `IMPOSTER_MODE_PERSON`.
- Outgoing: `{type:2, data:["blueboat_SEND_MESSAGE", {room, key[, data]}], options:{compress:true}, nsp:"/"}`.
  Request the roster with key `IMPOSTER_MODE_REQUEST_PEOPLE` and **no `data` field** (match the game).
- Incoming hook with no socket handle: override `MessageEvent.prototype.data` getter (`this.target`
  is the WebSocket) — catches the already-open lobby socket on a mid-game inject.
- `room` id = React `joinDetails.roomId` (full child+sibling fiber DFS, not just the `.return` chain).
  Own name = React `user.name` (same DFS); the `user` object has no id matching the roster, so
  self-match is by name only.
- Idle screens send no frames; the socket (`ws`) is only captured on the next engine.io ping (~25s)
  or any outgoing frame. No reachable socket.io instance in React (module closure).
- Answers: current question object (fiber hook) carries `answers[].correct` client-side. Buttons
  ignore synthetic DOM clicks — call the React `memoizedProps.onClick` instead.

**Snowy Survival = Creative mode = Colyseus + Phaser (different stack entirely).**
- Acquire the running scene by wrapping `Phaser.Scenes.Systems.prototype.step` (fires each frame
  with `this`=a scene's Systems); the scene with `.characterManager` is the game scene. Restore after.
- Smoothed render positions: `scene.characterManager.characters` (Map; `.body.x/y`).
- Authoritative identity/team/health: MobX store `room.state.characters` (reach the store by fiber
  BFS for an object with `.network.room && .me && .world`; deref ObservableValues via `value_`).
- teamKind: `'2'`=zombie, `'1'`=human. Read-only — Gimkit gameplay is server-authoritative
  (teleport/speed/team/item writes all rejected), so these stay ESP/HUD only.

Full protocol capture, exploit probes, and history: see the `project_gimkit_mod` memory.
