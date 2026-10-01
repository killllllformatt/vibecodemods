# Trust No One — hub section blueprint

Hand-off spec for **Claude Design** to build the Trust No One section of the unified Gimkit hub.
We are not building the UI here. All behavior already exists and is live-verified in
[`tno-reveal.js`](tno-reveal.js) — that file is the logic library; every control below maps to a
function or state field in it. Claude Design wires the UI to those and does not re-derive the
protocol. Make it look **identical to the STAX hub** (`../../buildyourstax/`).

## Shell — identical to the STAX hub
- Floating, draggable panel (mouse + touch), default top-right; tab bar on top, one pane below.
- Compact / Chromebook-friendly. **No function-key or any keybind for features** — Chromebooks
  lack F-keys. Only show/hide reuses the STAX hub's existing toggle key (backtick / Insert). Every
  feature is an on-screen control, never a keybind.
- Minimize button; active tab + panel position persisted in `localStorage` (`tnoHubUI`).
- Only the open tab refreshes (~1s), only while visible.
- Risky/visible actions carry a **danger label** (as STAX does).

## Always-visible header strip
`game code · role (🔪 impostor / 🔍 crewmate / 👻 eliminated) · ⚡ energy · impostors left · investigations left · meetings left`
Sources: game code = `new URLSearchParams(location.search).get('gc')` (the join URL keeps `?gc=` in
game; it is NOT in React/player state — `gameValues.gameCode` is null on a player, so use the URL
and fall back to "—" if absent). Then `myRole()`, `balanceVal()`, roster count, `invLeft()`,
`meetLeft()`, `amEliminated()`. Energy ⚡ is a prominent live counter (also shown on the Actions tab).

> **Confirmed on a cold mid-game inject:** full roster with every true role, who's "you", and
> ejected/clear flags all resolve (roster via `IMPOSTER_MODE_REQUEST_PEOPLE`, room via
> `joinDetails.roomId`), plus the game code from the URL. The socket is captured on the next
> outgoing frame / engine.io ping (≤~25s) if the inject lands on a totally idle screen.

## Tabs: Roles · Actions · Answers · Log · Settings

### 1. Roles  *(reveal — default tab)*
Live roster: every player's true role (🔪 impostor / 🔍 crewmate), **you** outlined, `ejected` /
`clear` tags, impostors-left count. Read-only. Source: `S.people`, `S.me`.

### 2. Actions  *(Mission Control — danger-labeled)*
**Target dropdown** (roster, excludes self) → `S.target`.

**Full action catalog is always shown (both roles), with your role's actions pushed to the top and
the other role's rows greyed out and non-clickable.** When eliminated, grey out **all** crewmate +
impostor rows and surface **Donate** at the top. Live availability comes from `shopItems()`
(role/alive-aware); the static catalog is:

| Role | Action (id) | ⚡ | Target? |
|---|---|---|---|
| Crewmate | Private Investigation (`privateInvestigation`) | 7 | ◎ yes |
| Crewmate | Public Investigation (`publicInvestigation`) | 15 | ◎ yes |
| Crewmate | Note Look (`noteViewer`) | 7 | ◎ yes |
| Crewmate | Meeting (`meeting`) | 10 | no |
| Impostor | Investigation Remover (`investigationRemover`) | 10 | ◎ yes |
| Impostor | Fake Investigation (`fakeInvestigation`) | 6 | ◎ yes |
| Impostor | Unclear (`clearListRemover`) | 15 | ◎ yes |
| Impostor | Disguise (`blendIn`) | 15 | no |
| Eliminated | Donate (`donate`) | — | ◎ yes (whole balance) |

> **Meeting is crewmate-only** — impostors have no meeting action, so it never enables for them.

Each enabled row: **Do once** button + **Auto** toggle, with ⚡ cost and ◎ when it needs a target.
Plus one special toggle tied to the same target:
- **Auto-vote target** — during meetings, repeatedly vote the target off (`IMPOSTER_MODE_VOTE` =
  target id). Lets you pile all pressure on one player.

Sources: `purchase(item, on)`, `S.on{}` (armed set), `autoActionTick()`; add a thin vote sender.

#### Behaviors / fallbacks (all must be handled)
- **Target ejected → target auto-resets to "nobody"**; targeted autos pause until a new target is
  picked (no firing at a dead/empty target).
- **Warnings, not silent no-ops:** trying a targeted/role-wrong/eliminated-invalid action shows a
  short warning (e.g. "you're eliminated — only Donate is available", "pick a live target first").
- **Cheapest-first priority (make it visible):** when several Auto toggles are on, the cheapest
  affordable one fires first each cycle — so a cheap action will starve pricier ones. Surface the
  active priority order to the user so this isn't a surprise.
- **Eliminated → Donate is special:** auto-donate fires on **any** energy gain (donate the whole
  balance the moment `balance > 0`), not on the normal ~4s throttle.
- **No-target actions (Meeting, Disguise):** never gated on a target; gate only on their own rules
  (Meeting: crewmate + `meetingsLeft > 0` + ⚡10; Disguise: impostor + ⚡15) and warn if unmet.
- Any row you can't afford, or whose limit is 0, is greyed (the server drops it anyway).
- Energy ⚡ counter shown on this tab next to the actions.

### 3. Answers  *(danger-labeled — changes your visible score)*
- **Correct-answer highlight**: on/off → `highlightTick()` (reads `answers[].correct`).
- **Auto-answer**: on/off, **on-screen toggle only, no keybind** (replaces the current F8 toggle;
  wire to `S.auto` but drop the F8 listener).
- **Auto-answer speed**: a speed control so you can see/choose how fast you're answering. Changing
  speed mid-run must apply cleanly (restart the timer safely) — Claude Design owns that detail.

### 4. Log  *(running intel feed)*
Scrolling feed: investigation results (yours + public), players cleared, notes you peeked,
ejections, meeting outcomes. Sources (incoming frames already decoded): `SUCCESS_MODAL_INFO`,
`ACTIVITY_FEED_MESSAGE` / `NOTIFICATION`, roster diffs. Add a small capture buffer when wired.

### 5. Settings
Show/hide key reminder (reuse STAX's), auto-action interval (default ~4s), panel opacity, reset
position, danger-actions acknowledgement. Mirrors STAX's lightweight settings.

## Thin additions to `tno-reveal.js` when wiring (logic, not UI)
- Vote sender + **Auto-vote** arming (`IMPOSTER_MODE_VOTE`, target id).
- Auto-clear `S.target` when the chosen target becomes `votedOff`.
- Engine: order armed+affordable actions **cheapest-first**; exempt eliminated **Donate** from the
  throttle (fire whenever `balance > 0`).
- **Do-once** calls (thin wrappers over `purchase()`), separate from the Auto toggles.
- Parameterize the auto-answer interval (speed control); drop the F8 keybind.
- Render the full both-role catalog (static table above) and grey rows not in live `shopItems()`.

## What stays as-is
`tno-reveal.js` is unchanged for now (verified). Gimkit stays a code stash — no install page /
bookmarklet here until the unified hub. See [`../README.md`](../README.md) for the protocol notes.
