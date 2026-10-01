# Gimkit — code stash

Working code for Gimkit game-mode mods, collected here so we don't rebuild it from scratch.
**This is not a user-facing hub.** No install pages, no bookmarklets, no build step — just the
scripts and the notes needed to turn them into a real section later. Gimkit is big; modes will be
merged into one mode-detecting menu eventually, built from this code.

## What's here

| Mode | File | What it does |
| --- | --- | --- |
| Trust No One | [`trust-no-one/tno-reveal.js`](trust-no-one/tno-reveal.js) | Reveals every player's real role (impostor vs detective), highlights the correct answer, optional F8 auto-answer, and auto-runs Mission Control actions (investigate / note look / meeting / impostor sabotage / donate) on a chosen target when you can afford them. |
| Snowy Survival | [`snowy-survival/snowy-esp.js`](snowy-survival/snowy-esp.js) | Zombie/human infection ESP: boxes + tracers by infection status, health/shield bars, live roster. |

Each file is a self-contained IIFE. To run: paste it inline into the page console (the live site's
CSP blocks loading from `127.0.0.1`, so inline is the reliable path). Both toggle their panel with
**Insert**. Wrapping into a bookmarklet is a later step — don't add that machinery back here.

Trust No One also has [`trust-no-one/HUB-BLUEPRINT.md`](trust-no-one/HUB-BLUEPRINT.md) — the
tab/feature spec for Claude Design to build its section of the unified hub (STAX-hub look). The
`.js` is the logic; the blueprint is the UI hand-off.

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
  ignore synthetic DOM clicks — call the React `memoizedProps.onClick` instead. (Answer text in the
  data sometimes has a trailing space — trim both sides when matching to the DOM span.)

  _Mission Control economy (all live-verified 2026-09-30):_
  - Every action is ONE frame: `IMPOSTER_MODE_PURCHASE {item, on?}` (`on` = target id; omitted for
    no-target actions). A vote is its own frame: `IMPOSTER_MODE_VOTE` = the target id (bare string).
  - Crewmate shop ids/costs: `privateInvestigation` ⚡7, `publicInvestigation` ⚡15,
    `noteViewer` ⚡7 (reads the target's notes → result in `SUCCESS_MODAL_INFO`), `meeting` ⚡10 (no target).
  - Impostor shop ids/costs: `investigationRemover` ⚡10, `fakeInvestigation` ⚡6, `clearListRemover`
    ("Unclear") ⚡15, `blendIn` ("Disguise") ⚡15 (no target). Read the live list instead of hardcoding
    per role: MobX `imposter.shopItems` (`[{id,name,cost,...}]`), balance = `balance.balance`, limits
    = `imposter.investigationsLeft` / `imposter.meetingsLeft`, eliminated = `imposter.me.votedOff`.
    Reach the stores by fiber DFS for props with `imposter && balance && navigation`; deref via `value_`.
  - When voted out, the shop becomes just `donate` — `IMPOSTER_MODE_PURCHASE {item:"donate", on}`
    moves your WHOLE current balance to the target.
  - **Server-authoritative on energy (so no free actions / no bypass):** a purchase you can't afford
    is silently dropped (no deduct, no result); a donation only ever moves the energy you really have
    (donating at ⚡0 transfers 0 — no infinite). So automation just gates on `balance >= cost` and
    fires the frame; the server is the backstop.

  _Lifecycle + server gaps (live-verified 2026-10-01):_
  - Phases (`imposter.status` / `IMPOSTER_MODE_STATUS`): `intro` → `questions` → `discussion` → `voting`
    → `votingResult` → back to `questions`. **Game over is a separate frame:** `GAME_STATUS: "results"`
    (the phase stays on `votingResult`). Impostors start at ⚡10, crewmates at ⚡0.
  - **Student-Called Meetings OFF only hides the button.** `meeting` drops out of the crewmate shop list,
    but an `IMPOSTER_MODE_PURCHASE {item:"meeting"}` frame still starts a meeting and charges ⚡10. The
    hub deliberately respects the teacher's setting (no bypass). `meetingsLeft` still counts while
    it's off, because host-called meetings use the same pool.
  - Game code isn't in player state when joined by typing the code (only in `?gc=` link joins).
  - **Delivery:** gimkit.com CSP (`script-src`/`connect-src`) excludes github.io, so the STAX
    self-updating Pages loader can't work here. Use a full-code bookmarklet or a Tampermonkey userscript.

**Snowy Survival = Creative mode = Colyseus + Phaser (different stack entirely).**
- Acquire the running scene by wrapping `Phaser.Scenes.Systems.prototype.step` (fires each frame
  with `this`=a scene's Systems); the scene with `.characterManager` is the game scene. Restore after.
- Smoothed render positions: `scene.characterManager.characters` (Map; `.body.x/y`).
- Authoritative identity/team/health: MobX store `room.state.characters` (reach the store by fiber
  BFS for an object with `.network.room && .me && .world`; deref ObservableValues via `value_`).
- teamKind: `'2'`=zombie, `'1'`=human. Read-only — Gimkit gameplay is server-authoritative
  (teleport/speed/team/item writes all rejected), so these stay ESP/HUD only.

Full protocol capture, exploit probes, and history: see the `project_gimkit_mod` memory.
