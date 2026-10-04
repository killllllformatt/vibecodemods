# vibecodemods/ Gimkit hub

One bookmarklet, one panel, every Gimkit mode we support. Trust No One is the first mode.

```
shared/hub-shell.css      the panel look (from the Claude Design mock-up). Shared by every hub.
shared/hub-shell.js       the panel itself: frame, drag, minimize, ` key, tabs, toast, banners,
                          first-use screen, Connecting / Not supported screens, Settings tab,
                          and the component kit (`ui`) modes build their tabs from.
gimkit/hub/modes/*.js     one file per Gimkit mode. Picked up by the build automatically.
gimkit/hub/build.mjs      node build.mjs → dist/gimkit-hub.js (paste to test) + bookmarklet.txt
```

Install: make a bookmark whose URL is the contents of `bookmarklet.txt`. Click it on gimkit.com to
open the hub. Click it again to turn it off. Gimkit's CSP blocks loading scripts from github.io, so
the bookmark carries the whole hub; there's no self-updating loader like STAX has.

## Adding a Gimkit mode

1. Copy `modes/tno.js` as a starting point. A mode is one object pushed onto `VCM_MODES`. The full
   contract is at the top of `shared/hub-shell.js`.
2. `detect()`: return `'yes'` once you know it's your mode. The fastest signal is the game's own
   options, readable the moment you're in a game (lobby included):
   `gameOptions.specialGameType` (`['IMPOSTER']` = Trust No One). Return `'wait'` while joining
   and `'no'` when it's clearly another mode.
3. `tabs`: build each tab with the `ui` kit (`toggleRow`, `actionRow`, `listRow`, `select`, `seg`,
   `slider`, `stats`, `logFeed`, `card`, `lbl`, `empty`, `warnBox`…). Build nodes once and update
   them in `update()`; the kit only writes to the DOM when something changed.
4. Mode-only CSS goes in `css`, scoped under `[data-mode="<id>"]`. Mode colours are the variables
   `--tone-a`, `--tone-b` and `--accent-warm`.
5. `node build.mjs`.

## Starting a different hub (another site)

Reuse `shared/`: copy `build.mjs`, change `GLOBAL`, `site` and the `modes/` folder. Everything else
comes from the shell.

## Rules (Chromebooks)

- No keybinds except ` to show or hide. Everything else is a visible button or toggle.
- No looping animations. Only the STAX transitions run (tab pill, toggles, button press, toast).
- Nothing updates while the panel is minimized or hidden. The mode engines keep running.
- Controls are at least 36 px tall (44 px on touch screens).

## Join-flow states (verified live 2026-10-04)

| Screen | How it's detected | Hub shows |
|---|---|---|
| Game code | `/join`, input placeholder "Game Code" | "Enter a game code" |
| Name | input placeholder "Your Name" | "Choose your name" |
| Nickname generator on | read-only text input + "Your nickname" | "Nickname picked for you" |
| Lobby | `gameValues.gameStatus === 'join'` | "In the lobby · waiting for the host" |
| In game | `gameStatus 'gameplay'` | mode tabs |

If Gimkit skips naming and puts you straight in the lobby, the hub goes straight to the Lobby state.
