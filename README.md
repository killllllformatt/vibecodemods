# vibecodemods/

Browser mods for the games and sites we use. Each site gets its own folder; the root [landing page](https://killllllformatt.github.io/vibecodemods/) links to all of them.

## Mods

| Site | Folder | Install |
|------|--------|---------|
| [buildyourstax.com](https://buildyourstax.com) — STAX investing game | [`buildyourstax/`](buildyourstax/) | [Install page](https://killllllformatt.github.io/vibecodemods/buildyourstax/) |

_More sites get added as their own folders here._

## Layout

```
/                     landing page (index.html) — links to each mod
buildyourstax/        STAX bookmarklet hub
  stax-hub.js           source (edit this)
  build.mjs             node build.mjs → bookmarklet.txt + install.html + index.html
  install.html          install / drag page (served at /buildyourstax/)
  assets/               logo
```

Each mod folder has its own README with the details. Hosted with GitHub Pages from `main`.
