# Gimkit — code stash

Working code for Gimkit game-mode mods, collected here so we don't rebuild it from scratch.
**This is not a user-facing hub.** No install pages, no bookmarklets, no build step — just the
scripts and the notes needed to turn them into a real section later. Gimkit is big; modes will be
merged into one mode-detecting menu eventually, built from this code.

## What's here

| Mode | File | What it does |
| --- | --- | --- |
| Trust No One | [`trust-no-one/tno-reveal.js`](trust-no-one/tno-reveal.js) | Reveals every player's real role (impostor vs detective), highlights the correct answer, optional F8 auto-answer, and auto-runs Mission Control actions (investigate / note look / meeting / impostor sabotage / donate) on a chosen target when you can afford them. |
| Snowy Survival | [`snowy-survival/snowy.js`](snowy-survival/snowy.js) | Separate cursed / human ESP (boxes, tracers, names, health; neutral colour in the lobby), live roster, correct-answer highlight (only while the question screen is open), auto-answer that never opens the question screen, an aimbot for when you're cursed (every throw redirected to a led target; optional auto-fire that waits out direction changes), and a draggable, resizable minimap (whole arena, walls, everyone as team-coloured dots; design brief: [`MINIMAP-DESIGN-BRIEF.md`](snowy-survival/MINIMAP-DESIGN-BRIEF.md)). |

Each file is a self-contained IIFE. To run: paste it inline into the page console (the live site's
CSP blocks loading from `127.0.0.1`, so inline is the reliable path). Both toggle their panel with
**Insert**. Wrapping into a bookmarklet is a later step — don't add that machinery back here.

Trust No One also has [`trust-no-one/DESIGN-BRIEF.md`](trust-no-one/DESIGN-BRIEF.md): the
design-only hand-off for Claude Design (screens, states, copy, STAX look). Claude Design designs; all
code lives in the `.js` (its `window.__tnoReveal.api` is the data contract the brief lists).

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
    (the phase stays on whatever it was). Impostors start at ⚡10, crewmates at ⚡0.
  - **Student-Called Meetings OFF only hides the button.** `meeting` drops out of the crewmate shop list,
    but an `IMPOSTER_MODE_PURCHASE {item:"meeting"}` frame still starts a meeting and charges ⚡10. The
    hub deliberately respects the teacher's setting (no bypass). `meetingsLeft` still counts while
    it's off, because host-called meetings use the same pool.
  - Game code isn't in player state when joined by typing the code (only in `?gc=` link joins).
  - **Delivery = full-code bookmarklet.** gimkit.com CSP (`script-src`/`connect-src`) excludes
    github.io, so the STAX self-updating Pages loader can't work here.
  - **Answers aren't deduped server-side.** `QUESTION_ANSWERED {questionId, answer:<answerId>}` is
    credited (+1 correct, +⚡1, streak) every time it's sent, even for the same question, and the
    server advances its own question index while the UI stays on the old question. So two scripts
    answering = both counted. `GAME_QUESTIONS` (all questions + `correct`) is sent at JOIN, before a
    bookmarklet can run; afterwards only the current question is in React (`[question, setter]`
    useState hook), plus `questions.questionList` (ids) and `currentQuestionIndex` in MobX.
  - Purchases work during `discussion` and `voting` too (charged + confirmed). Results arrive as
    key `TOAST` `{message, type:"success", blockedSound}`. Fake investigations also use up the shared
    investigation pool.
  - Voting has **no timer**: it waits for every vote or the host's "End Voting Early". A 2–2 tie
    (confirmed votes) still ejected one tied player (1 sample; rule unknown).
  - Host "Play Again" **reloads every player's page** (new code, auto-rejoin), so injected scripts
    are gone. Host page reload = "link invalid", and players freeze on `votingResult`.
  - Duplicate player names are allowed. Student-hosted games cap at **5 players**. Starting needs
    ≥ 2 players per impostor (3 impostors on 5 players never starts; no clamp).
  - Other classic modes (e.g. Tycoon) answer `IMPOSTER_MODE_REQUEST_PEOPLE` with an **empty**
    `IMPOSTER_MODE_PEOPLE []`, so empty rosters must not count as "this is TNO".
  - Coexisting scripts: Greasyfork "gimkit cheats (MOD MENU)" locks `WebSocket.prototype.send` with a
    setter that silently ignores new values (no throw, even in strict mode), so a late send-hook doesn't
    take; the MessageEvent hook still works. Detect it by a non-native `Object.freeze`; detect
    TheLazySquid GimkitCheat by `window.stores.assignment`. Gimkit itself does NOT freeze WebSocket today.

**Snowy Survival = Creative mode = Colyseus + Phaser (different stack entirely).**
- Acquire the running scene by wrapping `Phaser.Scenes.Systems.prototype.step` (fires each frame
  with `this`=a scene's Systems); the scene with `.characterManager` is the game scene. Restore after.
- Smoothed render positions: `scene.characterManager.characters` (Map; `.body.x/y`).
- Authoritative identity/team/health: MobX store `room.state.characters` (reach the store by fiber
  BFS for an object with `.network.room && .me && .world`; deref ObservableValues via `value_`).
- teamKind: `'2'`=zombie, `'1'`=human. Read-only — Gimkit gameplay is server-authoritative
  (teleport/speed/team/item writes all rejected), so these stay ESP/HUD only.
- **Answers leak (live-verified 2026-10-01):** every `gimkitLiveQuestion` device's state carries
  `GLOBAL_questions` (JSON, all questions with `answers[].correct`) and `PLAYER_<authId>_currentQuestionId`.
  Answer = `room.send('MESSAGE_FOR_DEVICE', {key:'answered', deviceId, data:{answer:<answerId>}})`. It
  works with no question screen open (+1000 energy as a human, +6 snowballs once cursed). Unlike TNO,
  a repeat or stale answer is judged against the CURRENT question and counts as **wrong**, so answer
  each question exactly once. Answering behind an open question screen leaves that screen stale, which
  is why auto-answer pauses while one is open. Main question device = the one with no fixed
  `textShownWhenAnsweringCorrectly`; a second "+1 Bait" device exists. The open screen's question
  is `me.deviceUI.current.props.currentQuestionId`; answer tiles are `span.notranslate`. Match them
  exactly, because decoys like "Hawai" vs "Hawaii" exist.
- Device interactions: call the device's own `interactiveZones.onInteraction()` (from
  `store.phaser.scene.worldManager.devices.allDevices`). The snowball vending machine sends
  `MESSAGE_FOR_DEVICE {key:'purchase', deviceId}` and works from **anywhere on the map** (bought 32
  snowballs for ⚡5000 at 2385 px). `me.properties.isZombie` is a shared flag, NOT "I'm cursed"; use `teamId`.
- Mode marker: `JSON.parse(room.state.mapSettings).musicUrl` contains `/modes/snowInfection/`. No game
  clock. A refresh-rejoin briefly leaves a ghost duplicate and comes back cursed.
- Not verified: knockouts and infection by snowball. The cursed headless test player always shows a
  client-side "couldn't reconnect" overlay that blocks firing, even though its socket keeps working.

Full protocol capture, exploit probes, and history: see the `project_gimkit_mod` memory.
