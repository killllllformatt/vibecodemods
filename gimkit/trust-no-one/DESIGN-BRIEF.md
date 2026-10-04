# vibecodemods/ Gimkit hub · Trust No One: design brief

> **For Claude Design: you design, Claude Code builds.** Every feature below is already written and
> live-tested in real, muted 4–5 player games (most recently 2026-10-04). Your job is the **look**:
> layout, components, every state, and the copy. Deliver static **HTML + CSS** mock-ups (one file is
> fine). No JavaScript or wiring needed; Claude Code connects your markup to the live data afterwards.
>
> **Match the STAX hub.** This is the second vibecodemods hub and must look like the same product
> family as the first one. See §2.

**Contents:** 1 · The product · 2 · Look & feel (STAX) · 3 · Build it as a shell + a mode ·
4 · Chromebook rules · 5 · Panel anatomy · 6 · Tabs · 7 · States to design · 8 · Data you can show ·
9 · Constraints · 10 · Deliverable · 11 · Reference

---

## 1. The product

A floating mod panel that appears on top of a **Gimkit Trust No One** game (the Among Us-style
classroom quiz mode) when a student clicks a **bookmarklet**. It:
- **reveals every player's real role** (impostor or crewmate),
- **highlights the correct answer** and can **auto-answer**, even in the background while you're on
  another screen,
- **automates Mission Control** (investigations, sabotage, meetings, donations) on a chosen target,
  and can auto-vote,
- keeps a **log** of what happened.

Users are students, mostly on **school Chromebooks** (see §4).

---

## 2. Look & feel: same family as the STAX hub

Reference: [`design/reference-stax-hub.png`](design/reference-stax-hub.png). STAX's full CSS is in
[`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js) under `// ---------- UI ----------`.
Reuse it; don't reinvent it.

**Tokens (verbatim from STAX):**
```css
--bg:#06060a; --s1:rgba(255,255,255,.035); --s2:rgba(255,255,255,.06); --s3:rgba(255,255,255,.11);
--ln:rgba(255,255,255,.07); --ln2:rgba(255,255,255,.13);
--fg:#f3f2f8; --dim:#8d8b9c; --acc:#a58bff; --acc2:#58c7ff;
--grad:linear-gradient(90deg,#8b6cff,#58c7ff); --on:#08070d; --red:#ff7a70;
font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
panel: 336px wide, radius 14px, dark radial-gradient background, 1px --ln2 border
```
**STAX pieces to reuse:** the drag header with the `vibecodemods/` wordmark, the tab bar with the
sliding pill, `.card`, key/value rows, `.btn` / `.btn.pri` (white primary), small uppercase section
labels, toggles with a sub-line, the toast, the status dot (`live` purple / `warn` red), the
minimized state, and the first-use acknowledgement.

**Premium, not loud.** Same restraint as STAX: dark glass-like layers (without real blur), soft
purple/blue glow, tabular numbers, quiet secondary text. Polish comes from spacing, hierarchy and
small details, not extra colour.

**Trust No One colour meanings (use them consistently):**
| Meaning | Colour |
|---|---|
| Impostor 🔪 | `--red` `#ff7a70` |
| Crewmate 🔍 | green `#56d364` |
| You | subtle outline + "(you)" in `--dim` |
| Ejected | 45% opacity + strikethrough |
| You're eliminated 👻 | `--dim` |
| Energy ⚡ | pick one warm accent (Gimkit uses orange-yellow) and use it everywhere ⚡ appears |

**Tone:** short, plain, a bit playful. No jargon ("socket", "frame", "API", "packet").

---

## 3. Build it as a shell + a mode (important)

Later, every Gimkit mode we support will live in **one big vibecodemods/ Gimkit hub**: the same
panel, with the content swapping depending on the mode you're playing. Trust No One is the first mode.
So design it in two layers, and keep them clearly separate in your HTML/CSS:

**A. The hub shell (mode-agnostic, reused by every future mode)**
- Panel frame, drag header, wordmark, minimize/close buttons, status dot + status label
- A **mode chip** in the header: "Trust No One" (later: other mode names). Design it so a longer
  name still fits.
- The **header strip** slot (each mode fills it with its own key numbers)
- **Tab bar** that works with **3, 4 or 5 tabs** (modes will differ)
- Shared components: card, section label, key/value row, toggle row, segmented control, select,
  slider, primary/secondary buttons, action row (§6.2), list row with tags, log feed, stat tiles,
  toast, banner, empty state, loading skeleton, disabled-with-reason line
- Hub-level screens: **first-use acknowledgement**, **minimized**, **"this mode isn't supported yet"**,
  **connecting**
- **Hub settings** (shared by all modes): panel opacity, reset position, how to show/hide, about/version

**B. The Trust No One mode** (everything specific to this game)
- Its header-strip numbers, its tabs (§6), its colours (§2), its mode settings

**Rules so future modes slot in cleanly:**
- Shell CSS uses **generic class names** (`.card`, `.row`, `.act`, `.tag`…), never TNO-specific ones.
  Mode-only styles sit under a mode scope (e.g. `[data-mode="tno"] …`) and mode colours are CSS
  variables (`--role-imp`, `--role-crew`, `--energy`), so another mode can define its own.
- No layout that only works because TNO happens to have 5 tabs or a role. The shell must still look
  right with a different strip and different tabs.
- Put the shell CSS and the TNO CSS in **two clearly separated sections** (or two `<style>` blocks)
  of your file.

---

## 4. Chromebook rules (non-negotiable)

STAX works on school Chromebooks and this must too.
- **No feature keybinds at all.** Everything is a visible, clickable/tappable control. (The current
  debug panel's F8 auto-answer goes away; auto-answer is a toggle in the Answers tab.)
- **No Insert, no F-keys.** Chromebook keyboards don't have them. Show/hide = the header's
  **minimize button**, or the **`` ` `` (backtick)** key as a bonus shortcut. Clicking the bookmark
  again turns the tool off completely.
- **Touchscreens and touchpads:** every control at least **36 px** tall (bigger on `pointer:coarse`,
  like STAX does), dragging works with touch, and nothing relies on hover or right-click.
- **Small screens:** 1366×768 and 1280×800 with browser chrome, often at 110–125% zoom. The panel
  scrolls inside itself and never runs off-screen.
- **Slow hardware:** see §9.
- Install is done the STAX way (drag to the bookmarks bar, or copy the code on managed
  Chromebooks). You don't need to design the install page in this pass.

---

## 5. Panel anatomy

```
┌──────────────────────────────────────── 336px ┐
│ vibecodemods/  [Trust No One]  ● In game  – ✕ │  ← shell: drag header, mode chip, status, minimize, close
│ 🔍 Crewmate    ⚡ 23    🔪 2 left              │  ← TNO header strip (§5.1)
│ 🔎 31 investigations · 📣 1 meeting            │
├───────────────────────────────────────────────┤
│ [Roles]  Actions  Answers  Log  Settings      │  ← tab bar (shell), tabs from the mode
├───────────────────────────────────────────────┤
│   tab content (scrolls)                       │
└───────────────────────────────────────────────┘
```
- **Default position:** top-right, **72 px from the top**. Gimkit's top bar and its own ⚡ counter
  sit in that corner (the current debug panel covers the ⚡ counter in the screenshot, so don't
  repeat that). Draggable by the header with mouse or touch.
- **Minimized** = header only, still showing the status dot and ⚡.
- Max height = viewport − 88 px; tab content scrolls inside.

### 5.1 Header strip (TNO)
| State | Status dot + label | Role | Numbers |
|---|---|---|---|
| Not a TNO game | ● warn "Not a Trust No One game" | none | none |
| Connecting | ● dim "Connecting…" | none | none |
| Lobby | ● dim "Waiting to start" | "revealed at liftoff" | none |
| In game | ● live "In game" | 🔪 Impostor / 🔍 Crewmate | ⚡ energy (prominent) · 🔪 impostors left · 🔎 investigations left · 📣 meetings left |
| Meeting | ● live "Meeting" | as above | as above |
| Voting | ● live "Voting · 0:42" (counting up) | as above | as above |
| Voting results | ● live "Results" | as above | as above |
| Stalled | ● warn "Game may have stalled (host left?)" | as above | as above |
| Eliminated | ● dim "👻 Eliminated" | 👻 + your role | ⚡ only (for donating) |
| Game over | ● dim "Game over · Impostors win" / "Crewmates win" | as above | frozen |

---

## 6. Tabs (TNO)

### 6.1 Roles (default)
- One row per player, **impostors first**: role icon, name, tags (`you`, `ejected`, `clear`).
- Duplicate names are allowed in Gimkit; two "Alpha" rows must still look right. "(you)" appears
  only when we're sure which one is you.
- Above the list: "**2** impostors left".
- Empty states: "Connecting…" · "Waiting for liftoff: roles appear when the game starts".
- Classes can have **10–30+ players**, so the list must stay compact and scannable.

### 6.2 Actions (danger-labelled: other players can notice these)
**Top:** ⚡ balance (large) + **target picker** ("— nobody —" / player names; ejected players
disabled; you aren't listed).

**Action list = always the full catalogue.** Your role's rows first, the other role's greyed below.
Each row: name, ⚡ cost, a ◎ badge if it needs a target, a **Do once** button and an **Auto** toggle.

| Crewmate | ⚡ | ◎ | | Impostor | ⚡ | ◎ |
|---|---|---|---|---|---|---|
| Private Investigation | 7 | ◎ | | Investigation Remover | 10 | ◎ |
| Public Investigation | 15 | ◎ | | Fake Investigation | 6 | ◎ |
| Note Look | 7 | ◎ | | Unclear | 15 | ◎ |
| Meeting | 10 | | | Disguise | 15 | |

- **Forced meeting:** if the teacher turned off student meetings, the Meeting row becomes
  **"Forced meeting"** (still ⚡10, still usable, crewmates only) with a small ⚑ "teacher turned these
  off" badge.
- **Eliminated:** every row above greys out and one **Donate** row moves to the top ("Give all your
  ⚡ to the target") with an Auto toggle.
- **Greyed rows always say why**, on a small line under the name. Exact strings:
  "You're eliminated: only Donate is available" · "Only after you're voted out" ·
  "Crewmate-only" / "Impostor-only" · "No meetings left" / "No investigations left" ·
  "Need ⚡4 more" (number varies) · "Pick a target first" · "Nothing to donate yet" · "Game over"
- A row can be **armed but waiting** (Auto on, not enough ⚡ yet). Make that look different from both
  "off" and "just fired".
- **"Next up"**: with 2+ Autos on, the tool takes turns. Show "Next up: Fake Investigation".
- **Auto-vote**: one toggle under the list: "Auto-vote the target during meetings" (votes once per
  meeting, re-votes only if you change target).

### 6.3 Answers (danger-labelled: changes your visible score)
- **Highlight correct answer**: toggle (default on). The green in-game outline already exists.
- **Auto-answer**: toggle.
- **Background answering:** when auto-answer is on and you leave the question screen (Mission
  Control, notes, a meeting), it keeps answering for you in the background. Show a small live tag
  like "Answering in background · 7 sent". When the tool was opened mid-game it only knows the
  questions it has seen so far; a subtle "knows 12 of 50 questions" line is enough.
- **Speed**: segmented **Slow · Normal · Fast** (≈4 s / 2 s / 1 s per question, each with a little
  random spread). Show "≈2 s per question".
- **Your stats** card: ✓ correct · ✗ incorrect · total · accuracy % · 🔥 streak.

### 6.4 Log
Newest-first feed (max 100). Each entry: time ("12:41"), a small kind icon, text.
| Kind | Example |
|---|---|
| sent | "You sent Fake Investigation on Bravo" |
| result | "Fake investigation ran on Bravo!" (the game confirming) |
| vote | "You voted for Charlie" |
| phase | "Meeting called" · "Voting started" · "Voting finished" · "Back to questions" · "Game over: Impostors win" |
| eject | "Charlie was ejected (impostor)" |
| clear | "Delta was marked clear" |
| target | "Target Charlie is gone. Pick a new one" |
| warn | "Need ⚡4 more" |

Make it clear a "result" confirms the "sent" before it. Empty state: "Nothing yet".

### 6.5 Settings
Split into **Hub** (shell, shared by future modes) and **Trust No One** (mode):
- Hub: panel opacity (slider) · reset panel position · "Hide: the – button or the `` ` `` key. Turn off:
  click the bookmark again." · about/version
- Trust No One: auto-action pace, one action every **4 s** (slider 2–10 s) · default answer speed
  · game code (only when known; usually it isn't, so leave the slot out rather than showing "—")
- Note: "After Play Again, click the bookmark again. Your settings come back." (Toggles, auto-answer
  and speed are saved; the target isn't.)

---

## 7. States to design (one mock each)

| # | State | What the panel shows |
|---|---|---|
| 1 | **First use** (shell) | STAX-style acknowledgement over Actions/Answers: "Actions and answers are visible to other players and the teacher." [I understand]. Shown once. |
| 2 | **Not a supported mode** (shell) | Header warn + one card: "This works in Trust No One." (Leave room for a short list of modes later.) Tabs hidden or disabled. |
| 3 | **Connecting** (shell, up to ~25 s when opened mid-game) | Skeleton rows + "Connecting to the game…" |
| 4 | **Lobby** | Roles: "Waiting for liftoff". Actions/Answers disabled with that reason. |
| 5 | **In game, crewmate** | Full panel, crewmate rows active |
| 6 | **In game, impostor** | Impostor rows active, crewmate rows greyed |
| 7 | **Forced meeting** | Crewmate Actions tab with the "Forced meeting" row + ⚑ badge |
| 8 | **Meeting / Voting** | Header "Meeting" / "Voting · 0:42"; auto-vote toggle emphasised. Actions still work. |
| 9 | **Voting with no end** | After ~30 s of voting, a hint: "Waiting for everyone to vote or the host to end voting" |
| 10 | **Background answering** | Answers tab with the live "Answering in background" tag |
| 11 | **Eliminated** | Header 👻; Donate on top; everything else greyed |
| 12 | **Target ejected** | Picker back on "— nobody —" + toast "Bravo was ejected. Pick a new target" |
| 13 | **Game over** | Header result; controls frozen/greyed; Log still scrollable |
| 14 | **Stalled** (stuck on results ≥60 s) | Header warn "Game may have stalled (host left?)" |
| 15 | **Another cheat script detected** | One-time dismissible banner: "Another Gimkit cheat is running (gimkit cheats MOD MENU). Turn off its auto-answer so answers aren't sent twice." |
| 16 | **Minimized** (shell) | Header only, status dot + ⚡ |
| 17 | **Big class** | Roles tab with ~25 players, scrolling |
| 18 | **Touch / small screen** | One mock at 1280×800 with `pointer:coarse` sizing |

---

## 8. Data you can show (reference; all of it already exists)

Use these names in your mock-ups (as `data-*` hooks or comments) so Claude Code can wire them directly.

| Data | Example |
|---|---|
| phase | `intro` · `questions` · `discussion` · `voting` · `votingResult` |
| mode / connected | `tno` · `other` · `unknown` / true · false |
| gameOver, winner, stalled | true, "Impostors win", false |
| votingFor | 42 (seconds) |
| role / eliminated | `imposter` · `detective` (= crewmate) / true · false |
| balance | 23 (⚡) |
| impostorsLeft / investigationsLeft / meetingsLeft | 2 / 31 / 1 (investigations are shared by everyone) |
| people[] | `{name, role, votedOff, markedAsClear}` + which one is you (may be unknown) |
| target | player or none |
| action rows | `{name, cost, forced?}` + why-greyed string + Auto on/off + "next up" |
| autoVote, auto-answer, speed | on/off, on/off, ms |
| answerMode / directAnswers / knownQuestions | `click` · `direct` / 7 / 50 |
| stats | `{correct, incorrect, total, accuracy, streak}` |
| log[] | `{time, kind, text}` |
| otherScripts | `["gimkit cheats (MOD MENU)"]` |
| gameCode | "40986" or none (usually none) |

---

## 9. Constraints

- **Delivered as a bookmarklet**: the whole panel, CSS included, ships inside one bookmark. Keep
  the CSS lean: **no web fonts, no images, no icon libraries** (Gimkit's page blocks most external
  loads anyway). Use emoji or small inline SVG.
- **Low-end Chromebooks:** no blur/backdrop-filter, no heavy shadows stacked on scrolling content.
  Animate only transform/opacity/colour, and respect `prefers-reduced-motion`. Nothing should need
  to animate while the panel is minimized.
- **Runs inside Gimkit's page**, so assume hostile CSS: scope everything under one root id with a
  hard reset, exactly like STAX.
- Fits a 1366×768 screen without covering the question text: 336 px wide, scrolls internally.

---

## 10. Deliverable

One HTML file containing:
1. **A component sheet** for the shell (every shared component and its states: default, hover,
   pressed, disabled-with-reason, armed, firing).
2. **Every state in §7**, laid out side by side.
3. CSS split into **shell** and **TNO mode** sections (§3), using the STAX tokens plus the TNO
   colour variables.

---

## 11. Reference

- STAX look: [`design/reference-stax-hub.png`](design/reference-stax-hub.png) · STAX CSS in [`../../buildyourstax/stax-hub.js`](../../buildyourstax/stax-hub.js)
- Today's plain debug panel in a real game (what this replaces): [`design/tno-in-game-current-tool.png`](design/tno-in-game-current-tool.png)
- Logic (for Claude Code, not needed for design): [`tno-reveal.js`](tno-reveal.js)
