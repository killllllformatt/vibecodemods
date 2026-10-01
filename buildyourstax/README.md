# vibecodemods/ STAX

A bookmarklet mod menu for [buildyourstax.com](https://buildyourstax.com) (the NGPF STAX investing game). One bookmark drops a floating panel into the game that lets you add cash, unlock every investment and achievement, control life events, see which real stocks the fake companies track, and manage the lobby.

**[→ Install page](https://killllllformatt.github.io/vibecodemods/buildyourstax/)** — drag the button to your bookmarks bar (or copy the code, for Chromebooks/phones).

## Tabs

| Tab | What it does |
|-----|--------------|
| **Money** | Add cash: +10K / +100K / +1M or any custom amount. |
| **Game** | Unlock every investment type and achievement; pause/resume the clock. |
| **Events** | Auto-skip bad life events, auto-claim good ones, or trigger any good event. |
| **Intel** | Shows which real-world stock each made-up company replays, and the real year. |
| **Lobby** | Rename yourself; rewrite another player's (or the computer's) name **and** score on everyone's leaderboard; force-start the game. |

Hide/show the panel with `` ` `` (backtick) or `Insert`. Drag the title bar to move it; double-click it to shrink. Click the bookmark again to close.

> Lobby actions (pausing, force-starting, renaming, re-scoring) are broadcast to everyone in a group game, including the teacher's screen.

## Developing

Everything is authored in `stax-hub.js`. The build minifies it into the bookmarklet and the install page:

```bash
node build.mjs
```

This regenerates `bookmarklet.txt`, `bookmarklet-offline.txt`, `install.html`, and `index.html` (the GitHub Pages entry point). Don't hand-edit those — edit `stax-hub.js` and rebuild.

**Auto-update:** the installed bookmark (`bookmarklet.txt`) is a ~370-char loader that fetches `stax-hub.js` from GitHub Pages on every click, so pushing to `main` updates every user — no re-install. Pages caches for up to ~10 min after a deploy; the loader's `?t=` timestamp bypasses the browser cache. `bookmarklet-offline.txt` is the old fully self-contained build, offered on the install page for networks that block github.io.

## How it works

The game is Vue 2 + Vuex + socket.io. The hub finds the running store via any element's `__vue__.$root.$store` and drives the game through its own mutations, actions, and socket events — no patching of game code. Score/name changes for other players ride the game's own `update-score` socket frame, which the server broadcasts without checking who sent it.

---

*Not affiliated with NGPF or STAX.*
