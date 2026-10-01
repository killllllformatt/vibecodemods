# Trust No One — hub section blueprint

> **For Claude Design.** You're building the UI for the Trust No One section of the vibecodemods
> Gimkit hub. **The logic already exists and is live-verified** in [`tno-reveal.js`](tno-reveal.js).
> You build the panel on top of its API (§3). You don't touch the protocol. Everything below marked
> ✅ was checked in real 4-player games (last on 2026-10-01).

**Contents:** 1 · What you're building · 2 · Look & feel · 3 · Data API · 4 · Game lifecycle ·
5 · Header · 6 · Tabs · 7 · Edge cases · 8 · Delivery · 9 · Open questions · 10 · Reference

---

## 1. What you're building

A floating panel injected into a Gimkit **Trust No One** game (the Among Us-style mode). Five tabs:

| Tab | One-liner |
|---|---|
| **Roles** (default) | Every player's real role. The server sends this to every client. |
| **Actions** | Mission Control automation: pick a target, run investigations / sabotage / donate once or on auto. Plus auto-vote. |
| **Answers** | Correct-answer highlight, auto-answer with a speed control, your stats. |
| **Log** | Running feed of investigation results, notes, ejections. |
| **Settings** | Interval, opacity, reset position. |

Above the tabs is an always-visible **header strip** with role, ⚡ energy and the counts (§5).

---

## 2. Look & feel: match the STAX hub exactly

Reference: [`design/reference-stax-hub.png`](design/reference-stax-hub.png). Source CSS is in
[`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js) (`// ---------- UI ----------`).
Lift the CSS from there rather than re-creating it.

**Tokens (verbatim from STAX):**
```css
--bg:#06060a; --s1:rgba(255,255,255,.035); --s2:rgba(255,255,255,.06); --s3:rgba(255,255,255,.11);
--ln:rgba(255,255,255,.07); --ln2:rgba(255,255,255,.13);
--fg:#f3f2f8; --dim:#8d8b9c; --acc:#a58bff; --acc2:#58c7ff;
--grad:linear-gradient(90deg,#8b6cff,#58c7ff); --on:#08070d; --red:#ff7a70;
font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
panel: width 336px; radius 14px; z-index 2147483647; hard CSS reset on all children (Gimkit's CSS leaks)
```
**Components to reuse:** the `.hd` drag header with the vibecodemods wordmark, the 5-column `.tabs` with
a sliding `.pill`, `.card`, `.kv` rows, `.btn` / `.btn.pri`, `.lbl` section captions, the toast, and the
`.dot.live` / `.dot.warn` status dot.

**TNO-specific colours** (keep these meanings everywhere):
| Meaning | Colour |
|---|---|
| Impostor 🔪 | `--red` `#ff7a70` |
| Crewmate 🔍 | green `#56d364` |
| You | outline `--ln2` + "(you)" in `--dim` |
| Ejected | 45% opacity + strikethrough |
| Eliminated (you) 👻 | `--dim` |
| Correct-answer highlight (in-game) | `4px solid #56d364`, offset `-6px` (already implemented) |

**Shell rules (same as STAX):**
- Draggable by the header (mouse + touch). Minimize button; double-click the header also minimizes.
- **Default position: top-right but pushed below Gimkit's top bar (`top: 72px; right: 12px`).** At
  `top:12px` the panel covers Gimkit's own ⚡ counter. See [`design/tno-in-game-current-tool.png`](design/tno-in-game-current-tool.png).
- Persist active tab + position in `localStorage` key `tnoHubUI` (try/catch every access).
- **No feature keybinds.** Chromebooks have no F-keys. The only key is show/hide: backtick or Insert, same as STAX.
- Only the open tab refreshes (~1 s), and only while the panel is visible and not minimized.
- Danger-labelled sections, as STAX does, for anything other players can notice: Actions and Answers.
- Low-end friendly: no web fonts, images, blur or libraries; only animate transform/opacity/colour.

---

## 3. Data API: everything the UI reads and calls

`tno-reveal.js` installs `window.__tnoReveal` (call it `R`). **Never re-derive the protocol.** If you
need something that isn't here, add a thin getter to `R.api` in the script.

### State (plain fields, read any time)
| Field | Type | Meaning |
|---|---|---|
| `R.people` | `[{id, name, role:'imposter'\|'detective', votedOff, markedAsClear, canNeverBeClear}]` | Full roster with true roles. Empty until the server sends it (§7). |
| `R.me` | `{id, name, role, votedOff, currentVote, notes, blendingIn, ...}` or `null` | You. `byName:true` when resolved by the name fallback. |
| `R.status` | string | Last phase seen on the wire (prefer `R.api.phase()`). |
| `R.gameStatus` | `''` \| `'gameplay'` \| `'results'` | `'results'` = **game over** (§4). |
| `R.target` | player id or `''` | Selected target. **Auto-clears to `''` when that player is ejected.** |
| `R.on` | `{[shopItemId]: true}` | Which Auto toggles are armed. The engine reads this. |
| `R.auto` | bool | Auto-answer on/off. |

### Getters (`R.api.*`, functions, cheap enough to call each refresh)
| Getter | Returns |
|---|---|
| `phase()` | `'intro'`, `'questions'`, `'discussion'`, `'voting'`, `'votingResult'` (§4) |
| `connected()` | true once the socket and room are known (can take ≤25 s on a cold inject) |
| `role()` | `'imposter'`, `'detective'` or `'?'` |
| `eliminated()` | bool, you were voted out |
| `balance()` | ⚡ energy (number) |
| `investigationsLeft()` | shared investigation pool (starts at 40 with 4 players) |
| `meetingsLeft()` | shared meeting pool (starts at 2). **Host-called meetings use it up too.** |
| `impostorsLeft()` | live impostor count from the roster |
| `shopItems()` | **Authoritative list of what you can buy right now:** `[{id, name, cost, description, icon, background}]`. Role-aware, alive/dead-aware, and respects the teacher's meeting setting. |
| `stats()` | `{correct, incorrect, total, accuracy (0–1), streak}` or `null`. Includes questions answered before the inject. |
| `currentQuestion()` | `{text, answers:[{text, correct, ...}]}` or `null` |
| `gameCode()` | code from the URL `?gc=` or `null`. **Usually `null`** (see §5). |

### Actions
| Call | Effect |
|---|---|
| `R.purchase(itemId, targetId?)` | One Mission Control action. Leave out `targetId` for `meeting` / `blendIn`. Returns false if not connected. |
| `R.vote(targetId)` | Meeting vote. Only valid while `phase()==='voting'`. Re-sending changes your vote. |
| `R.requestPeople()` | Ask the server to resend the roster (already done automatically on every phase change). |

The script's built-in engine (`autoActionTick`, every 250 ms with its own 4 s throttle) already fires
armed actions. Set `R.on[id] = true/false` and `R.target`; don't build a second engine. Change the
engine's ordering in the script (see §6.2).

**The current tiny panel in the script** (`render()` / `panel`) is the old debug UI. When the hub
wraps this file, delete that block and the F8 listener. Keep everything above `// --- panel ---`.

---

## 4. Game lifecycle (all ✅ observed)

```
 lobby            liftoff           meeting called (student or host)
 ──────► intro ──────────► questions ──► discussion ──► voting ──► votingResult ──┐
                              ▲                                                    │
                              └──────────────── host continues ◄───────────────────┘
                                                                     │ last impostor out, or
                                                                     ▼ impostors ≥ crew
                                                  R.gameStatus = 'results'  (game over)
```
- `phase()` comes from `imposter.status`. **Game over is a separate signal:** `GAME_STATUS: 'results'`.
  At game over, `phase()` stays stuck on its last value (`'votingResult'`), so always check
  `R.gameStatus === 'results'` first.
- Winner isn't sent to players as data. Derive it: `impostorsLeft()===0` → "Crewmates win", otherwise "Impostors win".
- The roster is re-requested automatically on every phase change. Ejections only show up that way.
- `meetingsLeft()` drops by one at `votingResult`, not when the meeting is called.

---

## 5. Header strip (always visible)

`● status · 🔪/🔍/👻 role · ⚡ energy · impostors left · investigations left · meetings left`

| Field | intro (lobby) | questions / meeting | You're eliminated | Game over |
|---|---|---|---|---|
| Status dot + label | "Waiting to start" | "In game" / "Meeting" / "Voting" | "👻 Eliminated" | "Game over: Crewmates/Impostors win" |
| Role | "revealed at liftoff" | ✅ | 👻 + original role | ✅ |
| ⚡ energy | — | ✅ (big, live) | ✅ (for donating) | — |
| Impostors / investigations / meetings left | — | ✅ | ✅ | frozen |
| Players | — | total + alive (`!votedOff`) | ✅ | ✅ |

- **Game code: optional, low priority.** It's only available when the player joined by a link with
  `?gc=`. Typing the code at gimkit.com/join leaves it nowhere in player state (✅ searched React props,
  MobX, local/session storage). Show it if `gameCode()` returns one; otherwise leave the slot out (don't show "—").
- Starting energy: impostors start at **⚡10**, crewmates at **⚡0** (✅ two games).

---

## 6. Tabs

### 6.1 Roles (default tab)
- One row per player, **impostors first**: icon, name, "(you)", tags `ejected` / `clear`.
- Counter above the list: "N impostors left".
- Empty state: "Connecting…" when `!connected()`, "Waiting for liftoff…" during `intro`.
- Read-only. Sources: `R.people`, `R.me`.

### 6.2 Actions (Mission Control, danger-labelled)
**Target picker**: roster minus you, ejected players disabled. **First option is "— nobody —"**,
and it's selected by default and after an ejection (the script already resets `R.target`).

**Full catalog, always shown.** Your role's rows on top, the other role's rows greyed below. Enabled
or greyed is decided **only** by "is this id in `shopItems()`?". Costs come from `shopItems()` too, so
no hardcoding.

| Role | Action (id) | ⚡ | Target |
|---|---|---|---|
| Crewmate | Private Investigation (`privateInvestigation`) | 7 | ◎ |
| Crewmate | Public Investigation (`publicInvestigation`) | 15 | ◎ |
| Crewmate | Note Look (`noteViewer`) | 7 | ◎ |
| Crewmate | Meeting (`meeting`) | 10 | none. **Missing from the shop when the teacher turns student meetings off.** |
| Impostor | Investigation Remover (`investigationRemover`) | 10 | ◎ |
| Impostor | Fake Investigation (`fakeInvestigation`) | 6 | ◎ |
| Impostor | Unclear (`clearListRemover`) | 15 | ◎ |
| Impostor | Disguise (`blendIn`) | 15 | none |
| Eliminated | Donate (`donate`) | all your ⚡ | ◎. When eliminated, this is the **only** shop item. |

Each enabled row has **Do once** (`R.purchase`) and an **Auto** toggle (`R.on[id]`), plus the ⚡ cost
and ◎ if it needs a target. Rows you can't afford, or whose pool is at 0, are dimmed but still
toggleable: arming a row you can't afford yet is fine, and it fires once you can.

**Why a row is greyed: always say which.** Pick the first reason that applies:
1. "You're eliminated: only Donate is available"
2. "Impostor-only" / "Crewmate-only"
3. **"Your teacher turned off student meetings"** (Meeting, crewmate, alive, `meeting` not in `shopItems()`)
4. "No meetings left" / "No investigations left"
5. "Need ⚡N more"
6. "Pick a target first" (targeted rows while `R.target===''`)

**Auto-vote target** toggle (same target): in `voting`, cast `R.vote(R.target)` **once** at the start of
voting, and again only if the target changes. Don't spam it.

**Engine changes to make in the script** (logic, small):
- **Order:** round-robin across armed rows, not cheapest-first. Cheapest-first lets Fake
  Investigation (⚡6) starve Unclear/Disguise (⚡15) forever. Show "next up: X" under the list.
- **Eliminated Donate:** fire as soon as `balance() > 0`, outside the 4 s throttle.
- **Pause during meetings:** don't fire purchases while `phase()` is `discussion`, `voting` or
  `votingResult`, or after `gameStatus==='results'`.

**Respect the teacher's meeting setting.** The server doesn't check it: a `meeting` purchase sent while
student meetings are off **still starts a meeting and charges ⚡10** (✅ tested). The game only hides the
button. The hub must **not** offer a way around this. Grey the row with reason #3, and keep the engine
driven by `shopItems()` (it already is), so Auto never fires a meeting the teacher disabled.

### 6.3 Answers (danger-labelled: changes your visible score)
- **Highlight correct answer**: on/off (default on). Already implemented (`highlightTick`).
- **Auto-answer**: on/off **on-screen only** (`R.auto`). The F8 key goes away.
- **Speed**: preset buttons, e.g. Slow ~4 s · Normal ~2 s · Fast ~1 s, **with ±30% random jitter** by
  default. Perfectly even timing is the most noticeable thing on a teacher's leaderboard. Changing
  speed mid-run must restart the timer cleanly. Today the script hardcodes ~0.45 s between steps, so
  parameterize that.
- **Your stats** card from `stats()`: `✓ correct · ✗ incorrect · total · accuracy% · 🔥 streak`.
  ✅ Verified 10/0/10/100%/10 after 10 s of auto-answer.

### 6.4 Log
Newest-first feed, capped (~100 entries). Each entry gets a time and an icon. Sources are incoming
frames the script already decodes. Add a small `R.log` ring buffer in `onFrame`:
- `SUCCESS_MODAL_INFO`: investigation results ("Inconclusive" is common on Normal reliability), and
  Note Look results (`{title:"X's notes:", description}`).
- Roster diffs: "Bravo was ejected (impostor)", "Alpha marked clear".
- Phase changes: "Meeting called", "Voting started", "Game over: Impostors win".
- Your own actions: "You ran Private Investigation on Bravo (⚡7)". Log it as *sent*, and mark it
  *confirmed* only when the balance actually drops. Under-funded purchases are silently dropped.

### 6.5 Settings
Show/hide key reminder · auto-action interval (default 4 s) · auto-answer default speed · panel
opacity · reset position · "I understand others can see these actions" acknowledgement (gates Actions
and Answers the first time, like STAX).

---

## 7. Edge cases (every row needs handling)

| Situation | What happens | Hub behaviour |
|---|---|---|
| Not on a TNO game | no roster, no stores | Show "Not in a Trust No One game" instead of an empty panel |
| Cold inject on an idle screen | socket captured on next ping (≤25 s) | "Connecting…", don't render an empty roster as final |
| Lobby (`intro`) | no roles, empty shop, counts unset | "Waiting for liftoff". Actions and Answers disabled |
| **Teacher turned off student-called meetings** | ✅ `meeting` missing from crewmate `shopItems()`, **but `meetingsLeft()` still says 2** (host can still call meetings) | Grey Meeting with "Your teacher turned off student meetings". **Don't** decide this from `meetingsLeft()`. No bypass (see §6.2) |
| Host calls a meeting while student meetings are off | ✅ normal `discussion → voting → votingResult`, uses up `meetingsLeft` | Same as any meeting. Auto-vote works (✅) |
| Target ejected | ✅ script resets `R.target` to `''` | Picker shows "— nobody —", targeted autos pause, toast "Bravo was ejected, pick a new target" |
| You get ejected | ✅ shop becomes `[donate]` only | Header 👻, all other rows greyed with reason #1, Donate moves to the top |
| Meeting / voting phase | purchases mid-meeting not useful | Engine paused (§6.2), Auto-vote active |
| Game over | ✅ `R.gameStatus==='results'`, `phase()` stuck at `votingResult` | "Game over: <winner>", freeze all controls |
| Host reloads or leaves mid-game | ✅ host link dies ("link invalid"), players stay frozen in `votingResult` | After ~60 s with no phase change during `votingResult`, show "Game may have stalled (host left?)" |
| "Play Again" in the same tab | script runs once per page (`if (window.__tnoReveal) return`) | Old roster shows until the next phase change. Clear `R.people` / `R.me` / `R.target` when `phase()` goes back to `intro` |
| Duplicate names | `R.me` resolves by id from the server; name fallback only if unique | Leave "(you)" off rather than guess |
| Join-in-late | roster resolves once assigned | Normal |
| Fewer players than impostor setting | impostor count clamps | Always count from the roster, never the setting |
| Under-funded / invalid purchase | server drops it silently | Never assume success; confirm through balance change (§6.4) |
| Tied vote | not verified (one attempt ejected someone, but a vote may not have landed) | Don't predict outcomes; just read the roster afterwards |

---

## 8. Delivery: how this gets onto the page

**Gimkit's CSP blocks the STAX-style self-updating loader.** STAX's bookmark pulls the latest code
from GitHub Pages. Gimkit's `script-src` and `connect-src` only allow Gimkit/Google/Stripe/PostHog
hosts, so a `<script src=…github.io>` or a fetch-and-eval is refused. Options:
1. **Full-code bookmarklet** (like STAX's offline build): works everywhere, no auto-update. Needs a
   build step (minify → `javascript:` URL) like `buildyourstax/build.mjs`.
2. **Tampermonkey userscript** (`@match *://*.gimkit.com/*`, `@updateURL` → raw GitHub): auto-updates,
   because extensions aren't bound by page CSP. Same pattern as the JKLM solver. Needs an extension,
   which school Chromebooks often block.

Recommendation: ship both from one source, the way STAX ships loader + offline. Run the script
**before liftoff** when possible. It catches the role frame directly, though a mid-game inject also
works through `requestPeople`.

---

## 9. Open questions (not blocking)
- Tie-vote outcome.
- Full list of `SUCCESS_MODAL_INFO` shapes (only investigation and Note Look seen).
- Whether `ACTIVITY_FEED_MESSAGE` / `NOTIFICATION` appear in TNO (not seen in 3 games).

## 10. Reference
- Logic: [`tno-reveal.js`](tno-reveal.js) (`window.__tnoReveal`, §3)
- Protocol notes: [`../README.md`](../README.md)
- Look: [`design/reference-stax-hub.png`](design/reference-stax-hub.png), [`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js)
- Current debug panel in a live game: [`design/tno-in-game-current-tool.png`](design/tno-in-game-current-tool.png)
