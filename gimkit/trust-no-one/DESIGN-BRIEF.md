# Trust No One panel: design brief

> **For Claude Design: you design, Claude Code builds.** All the logic is written and live-tested
> ([`tno-reveal.js`](tno-reveal.js)). Your job is the **look**: layout, components, every state below,
> and the copy. Deliver static **HTML + CSS** mock-ups (one file is fine) showing each state. No
> JavaScript or wiring needed. Claude Code connects your markup to the data afterwards.
>
> Everything here was checked in real, muted 4–5 player games on 2026-10-01.

**Contents:** 1 · The product · 2 · Look & feel · 3 · Panel anatomy · 4 · Header · 5 · Tabs ·
6 · States to design · 7 · Data you can show · 8 · Constraints · 9 · Reference

---

## 1. The product

A floating mod panel that appears on top of a **Gimkit Trust No One** game (the Among Us-style
classroom quiz mode) when the student clicks a **bookmarklet**. It:
- **reveals every player's real role** (impostor or crewmate),
- **highlights the correct answer** in the game and can **auto-answer**,
- **automates Mission Control** (investigations, sabotage, donations) on a chosen target, and auto-votes,
- keeps a **log** of what happened.

Users are students, often on **school Chromebooks**: small screens, slow hardware, **no F-keys**.

---

## 2. Look & feel: same family as the STAX hub

Match the existing vibecodemods STAX panel. See [`design/reference-stax-hub.png`](design/reference-stax-hub.png).
Its CSS lives in [`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js) under `// ---------- UI ----------`.

**Tokens (verbatim from STAX):**
```css
--bg:#06060a; --s1:rgba(255,255,255,.035); --s2:rgba(255,255,255,.06); --s3:rgba(255,255,255,.11);
--ln:rgba(255,255,255,.07); --ln2:rgba(255,255,255,.13);
--fg:#f3f2f8; --dim:#8d8b9c; --acc:#a58bff; --acc2:#58c7ff;
--grad:linear-gradient(90deg,#8b6cff,#58c7ff); --on:#08070d; --red:#ff7a70;
font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
panel: 336px wide, radius 14px, dark radial-gradient background, 1px --ln2 border
```
**STAX components to reuse:** drag header with the vibecodemods wordmark, 5-tab bar with a sliding pill,
`.card`, key/value rows, `.btn` / `.btn.pri` (white primary), small uppercase section labels, toast,
status dot (`live` purple / `warn` red).

**TNO colour meanings (use them consistently):**
| Meaning | Colour |
|---|---|
| Impostor 🔪 | `--red` `#ff7a70` |
| Crewmate 🔍 | green `#56d364` |
| You | subtle outline + "(you)" in `--dim` |
| Ejected | 45% opacity + strikethrough |
| You are eliminated 👻 | `--dim` |
| Energy ⚡ | Gimkit uses an orange-yellow bolt; pick one accent and keep it |

**Tone:** short, plain, a bit playful. No jargon ("socket", "frame", "API").

---

## 3. Panel anatomy

```
┌───────────────────────────────── 336px ┐
│ vibecodemods/  ● In game          – ✕  │  ← drag header (minimize, close)
│ 🔍 Crewmate   ⚡ 23   🔪 2 left        │  ← header strip (§4)
│ 🔎 31 investigations · 📣 1 meeting     │
├────────────────────────────────────────┤
│ [Roles] Actions  Answers  Log  Settings│  ← tabs
├────────────────────────────────────────┤
│                                        │
│   tab content (scrolls)                │
│                                        │
└────────────────────────────────────────┘
```
- **Default position:** top-right, **72px from the top** (Gimkit's top bar and its own ⚡ counter sit
  above that; see [`design/tno-in-game-current-tool.png`](design/tno-in-game-current-tool.png)).
- Draggable by the header (mouse + touch). **Minimized** = header only.
- Show/hide key is **backtick or Insert**. Clicking the bookmarklet again fully removes the tool (click once more to reload it). Put the
  key hint in Settings, not in the header.
- Max height = viewport − 88px. Tab content scrolls inside.

---

## 4. Header strip

Always visible under the drag header. Content depends on the state:

| State | Status dot + label | Role | Numbers shown |
|---|---|---|---|
| Not a TNO game | ● warn "Not a Trust No One game" | none | none |
| Connecting | ● dim "Connecting…" | none | none |
| Lobby | ● dim "Waiting to start" | "revealed at liftoff" | none |
| In game | ● live "In game" | 🔪 Impostor / 🔍 Crewmate | ⚡ energy (prominent) · 🔪 impostors left · 🔎 investigations left · 📣 meetings left |
| Meeting | ● live "Meeting" | as above | as above |
| Voting | ● live "Voting · 0:42" (time since voting started, counting up) | as above | as above |
| Voting results | ● live "Results" | as above | as above |
| Stalled | ● warn "Game may have stalled (host left?)" | as above | as above |
| You're eliminated | ● dim "👻 Eliminated" | 👻 + your role | ⚡ only (for donating) |
| Game over | ● dim "Game over · Impostors win" / "Crewmates win" | as above | frozen |

**Game code:** usually unknown (only present when joined via a link). Show it small in Settings
when available, and leave the slot out otherwise. Never show an empty "—".

---

## 5. Tabs

### 5.1 Roles (default tab)
- One row per player, **impostors first**: role icon, name, tags.
- Tags: `you`, `ejected`, `clear`. Duplicate names are allowed in Gimkit, so the row must still look
  right when two players are both "Alpha". "(you)" is only shown when we're sure.
- Above the list: "**2** impostors left".
- Empty states: "Connecting…" · "Waiting for liftoff: roles appear when the game starts".

### 5.2 Actions (danger-labelled: other players can notice these)
**Top:** ⚡ balance (large) + **target picker**: "Target: — nobody —" / player names. Ejected players
are disabled, and you aren't listed.

**Action list: always the full catalog.** Your role's rows first, the other role's greyed below.
Each row has a name, ⚡ cost, a ◎ badge if it needs a target, a **Do once** button and an **Auto** toggle.

| Crewmate | ⚡ | ◎ | | Impostor | ⚡ | ◎ |
|---|---|---|---|---|---|---|
| Private Investigation | 7 | ◎ | | Investigation Remover | 10 | ◎ |
| Public Investigation | 15 | ◎ | | Fake Investigation | 6 | ◎ |
| Note Look | 7 | ◎ | | Unclear | 15 | ◎ |
| Meeting | 10 | | | Disguise | 15 | |

**Forced meeting:** when the teacher turns off student meetings, the Meeting row stays usable and is
renamed **"Forced meeting"** (⚡10, crewmates only; the server still accepts it). Give it a small
⚑ "teacher turned these off" badge. It still uses the shared meetings-left pool, and a failed vote on
the *last* meeting hands the impostors the win, so a "last meeting" note on the row is worth designing.

When **you're eliminated**, every row above is greyed and a single **Donate** row moves to the top
("Give all your ⚡ to the target"), with an Auto toggle. Auto-donate gives everything the moment any
energy arrives.

**Greyed rows always say why.** Design a small reason line under the row name. These are the exact strings:
- "You're eliminated: only Donate is available"
- "Only after you're voted out" (Donate while alive)
- "Crewmate-only" / "Impostor-only"
- "No meetings left" / "No investigations left"
- "Need ⚡4 more" (number varies)
- "Pick a target first"
- "Nothing to donate yet"
- "Game over"

A row can be **armed (Auto on) but waiting** (e.g. not enough ⚡ yet). Design that as distinct from both
"off" and "firing".

**"Next up"**: when 2+ Auto toggles are on, the engine takes turns between them. Show a small line
like "Next up: Fake Investigation".

**Auto-vote target**: one toggle below the list: "Auto-vote the target during meetings". When on,
it votes once per meeting and re-votes only if you change target.

**Toasts** (STAX style) for: "Bravo was ejected. Pick a new target" (target auto-reset), and
warnings when Do once is pressed on a blocked row (same strings as above).

### 5.3 Answers (danger-labelled: changes your visible score)
- **Highlight correct answer**: toggle (default on). The in-game highlight itself is a green outline,
  already built, so you don't need to design it.
- **Auto-answer**: toggle.
- **Speed**: 3 segmented presets, **Slow · Normal · Fast** (≈4 s / 2 s / 1 s per question). Each has a
  little random spread, so timing never looks robotic. Show "≈2 s per question".
- **Your stats** card: ✓ correct · ✗ incorrect · total · accuracy % · 🔥 streak. These include
  questions answered before the panel was opened.

### 5.4 Log
Newest-first feed (max 100). Each entry has a time ("12:41"), a small kind icon and text. Kinds and
example texts the code produces:
| Kind | Example |
|---|---|
| sent | "You sent Fake Investigation on Bravo" |
| result | "Fake investigation ran on Bravo!" (server confirmation) |
| vote | "You voted for Charlie" |
| phase | "Meeting called" · "Voting started" · "Voting finished" · "Back to questions" · "Game over: Impostors win" |
| eject | "Charlie was ejected (impostor)" |
| clear | "Delta was marked clear" |
| target | "Target Charlie is gone. Pick a new one" |
| warn | "Need ⚡4 more" |

Design the "sent → result" pairing so it's clear the result confirms the action. Empty state: "Nothing yet".

### 5.5 Settings
- Auto-action pace: one action every **4 s** (slider 2–10 s)
- Default auto-answer speed (Slow / Normal / Fast)
- Panel opacity (slider)
- Reset panel position (button)
- Show/hide key reminder: `` ` `` or Insert. Click the bookmark again to turn the tool off completely.
- Game code (only when known)
- First-use acknowledgement, the same pattern as STAX: "Actions and answers are visible to other
  players and the teacher." [I understand]. It gates the Actions and Answers tabs once.

---

## 6. States to design (one mock each)

| # | State | What the panel shows |
|---|---|---|
| 1 | **Not a TNO game** (bookmark clicked in another Gimkit mode) | Header warn + one card: "This only works in Trust No One." Tabs hidden or all disabled. |
| 2 | **Connecting** (up to ~25 s after clicking mid-game) | Spinner/skeleton rows + "Connecting to the game…" |
| 3 | **Lobby** | Roles: "Waiting for liftoff". Actions/Answers disabled with that reason. |
| 4 | **In game, crewmate** | Full panel, crewmate rows active |
| 5 | **In game, impostor** | Impostor rows active, crewmate rows greyed |
| 6 | **Teacher turned off student meetings** | Crewmate panel; Meeting row shows as **Forced meeting** (⚡10) with the ⚑ badge, still fully usable. Impostors never get it (the server ignores theirs). |
| 7 | **Meeting / Voting** | Header "Meeting"/"Voting · 0:42"; auto-vote toggle emphasised. Actions still work during meetings. |
| 8 | **Voting has no timer** | After ~30 s in Voting, add a hint: "Waiting for everyone to vote or the host to end voting" |
| 9 | **You're eliminated** | Header 👻; Donate on top; everything else greyed |
| 10 | **Target ejected** | Picker back on "— nobody —" + toast |
| 11 | **Game over** | Header result; all controls frozen/greyed; Log still scrollable |
| 12 | **Stalled** (stuck on results ≥60 s) | Header warn "Game may have stalled (host left?)" |
| 13 | **Another cheat script detected** | One-time dismissible banner: "Another Gimkit cheat is running (gimkit cheats MOD MENU). Turn off its auto-answer so answers aren't sent twice." |
| 14 | **Play Again** | Gimkit reloads the page, so the panel disappears. Nothing to design; Settings can carry the hint "After Play Again, click the bookmark again." |
| 15 | **Minimized** | Header only, with status dot + ⚡ |
| 16 | **First use** | Acknowledgement card over Actions/Answers |

---

## 7. Data you can show (reference only, already built)

Use these field names in your mock-ups (e.g. as `data-*` hooks or comments) so Claude Code can wire
them directly. All values below are live.

| Data | Example | Notes |
|---|---|---|
| status / phase | `intro` · `questions` · `discussion` · `voting` · `votingResult` | Lobby, playing, meeting, voting, results |
| mode | `tno` · `other` · `unknown` | `other` → state 1 |
| connected | true/false | false → state 2 |
| gameOver, winner | true, "Impostors win" | |
| stalled | true/false | state 12 |
| votingFor | 42 (seconds) | header timer + state 8 |
| role | `imposter` · `detective` | detective = crewmate |
| eliminated | true/false | |
| balance | 23 | ⚡ |
| impostorsLeft / investigationsLeft / meetingsLeft | 2 / 31 / 1 | investigations are shared by everyone |
| people[] | `{name, role, votedOff, markedAsClear}` | + which one is you (may be unknown) |
| target | player id or none | |
| shop rows | `{id, name, cost, forced?}` (from `api.actionItems()`) + `blockReason` string + armed (Auto) on/off | §5.2 strings; `forced:true` = forced meeting |
| queue | ordered armed actions | "Next up" |
| autoVote | on/off | |
| auto-answer, speed | on/off, ms | |
| stats | `{correct, incorrect, total, accuracy, streak}` | |
| log[] | `{t, kind, text}` | §5.4 kinds |
| otherScripts | `["gimkit cheats (MOD MENU)"]` | state 13 |
| gameCode | "40986" or null | usually null |

---

## 8. Constraints

- **Delivered as a bookmarklet.** The whole panel (CSS included) ships inside one bookmark URL. Keep
  CSS lean: **no web fonts, no images, no icon libraries**. Use emoji or small inline SVG for icons.
- **Low-end Chromebooks:** no blur/backdrop-filter. Only animate transform/opacity/colour, and respect
  reduced-motion.
- Runs inside Gimkit's page, so assume hostile CSS: everything scoped under one root id with a hard
  reset (as STAX does).
- No keybinds for features, only show/hide.
- Fits a 1366×768 Chromebook screen without covering the question text: 336px wide, scrolls internally.

---

## 9. Reference
- Look: [`design/reference-stax-hub.png`](design/reference-stax-hub.png) · STAX CSS in [`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js)
- Current debug panel in a real game: [`design/tno-in-game-current-tool.png`](design/tno-in-game-current-tool.png)
- Logic (for Claude Code, not needed for design): [`tno-reveal.js`](tno-reveal.js) · protocol notes in [`../README.md`](../README.md)
