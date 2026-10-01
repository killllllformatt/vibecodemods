# Gimkit mods

One browser mod per Gimkit game mode. Each lives in its own folder with a source `.js`, a
generated bookmarklet, and an install page.

| Mode | Folder | What it does |
| --- | --- | --- |
| Trust No One | [`trust-no-one/`](trust-no-one/) | Reveals every player's real role (impostor vs detective) + highlights the correct answer; optional F8 auto-answer. Reads the roster the Blueboat server already broadcasts to all clients (`IMPOSTER_MODE_PEOPLE`); re-asks on each phase so ejections stay current. |
| Creative ESP | [`esp/`](esp/) | Boxes, names, tracers and distance for every player in 2D (top-down / platformer) modes. Reads the client's own Phaser `characterManager`. |
| Snowy Survival ESP | [`snowy-survival/`](snowy-survival/) | Zombie/human infection tracker with health bars and a live roster. Positions from Phaser, identity/team/health from the MobX store. |

All three are **read-only** overlays — they draw/decode what the client already receives and send
nothing back (the one exception is Trust No One's optional auto-answer, which clicks for you).
Gimkit's gameplay is server-authoritative: teleport, speed, team/infection and item writes are all
rejected, so there are no such cheats here.

## Building

```
node build.mjs
```

Reads each mod's source and the `MODS` config, then writes every folder's `bookmarklet.txt`,
`install.html` and `index.html`, plus the Gimkit landing `index.html`. Edit the source `.js` (or
`MODS`) and re-run — don't hand-edit the generated files. The logo is embedded as base64 so each
install page works as a standalone file.

## Roadmap

The modes are separate bookmarklets today; the plan is to merge them into one menu that detects the
current mode and loads the right tools.
