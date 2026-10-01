// Builds every Gimkit mod folder (bookmarklet.txt + install.html + index.html) and the Gimkit
// landing page (gimkit/index.html) from the per-mod sources + the MODS config below.
// Run: node build.mjs   (from the gimkit/ folder)
import { readFileSync, writeFileSync } from 'node:fs';

// ---- the mods, in display order ----
const MODS = [
  {
    slug: 'trust-no-one',
    src: 'tno-reveal.js',
    name: 'Trust No One',
    code: 'TNO',
    tagline: 'See every player’s real role (impostor vs detective) and the correct answer.',
    where: 'a Trust No One game',
    toggle: 'persist', // just adds the panel; no re-click teardown
    features: [
      ['Role reveal', 'Live list of who’s an impostor 🔪 and who’s a detective 🔍, updated after every ejection.'],
      ['Answer helper', 'Outlines the correct answer in green so you never miss a question.'],
      ['Auto-answer', 'Press F8 to toggle: answers correctly and clicks Continue on its own.'],
      ['You marker', 'Highlights your own row so you instantly know your role.'],
    ],
    usage: [
      'Hide or show the panel with <kbd>Insert</kbd>.',
      'The list appears top-right within a few seconds of joining or injecting mid-game.',
      'Toggle auto-answer with <kbd>F8</kbd> (off by default).',
    ],
    warn: 'Read-only reveal — it reads what the server already sent to your browser and sends nothing back. Auto-answer does click for you, which is visible in your own score.',
  },
  {
    slug: 'esp',
    src: 'esp.js',
    name: 'Creative ESP',
    code: 'ESP',
    tagline: 'Boxes, names, tracers and distance for every player in 2D (top-down / platformer) modes.',
    where: 'any 2D Gimkit game (Creative, Snowy Survival, etc.)',
    toggle: 'reclick', // re-run bookmarklet to remove
    features: [
      ['Player boxes', 'A team-colored box around every player on the map.'],
      ['Tracers', 'A line from you to each player so you can see them through walls.'],
      ['Names + distance', 'Each player’s name and how far away they are.'],
      ['Team colors', 'Enemies red, allies green, neutral gold.'],
    ],
    usage: [
      'Hide or show the overlay with <kbd>Insert</kbd>.',
      'Click the bookmark again to remove the overlay completely.',
      'Run it after the game has actually started (the overlay needs a live frame).',
    ],
    warn: 'Read-only overlay — it only draws what your own client already knows and sends no packets.',
  },
  {
    slug: 'snowy-survival',
    src: 'snowy-esp.js',
    name: 'Snowy Survival ESP',
    code: 'SNO',
    tagline: 'Zombie/human tracker for Snowy Survival: who’s infected, health bars and a live roster.',
    where: 'a Snowy Survival game',
    toggle: 'reclick',
    features: [
      ['Infection ESP', 'Zombies purple, humans green, downed players grey — boxes and tracers.'],
      ['Health bars', 'Health + shield bar over every player.'],
      ['Badges', '🧟 / 🏃 marks each player, plus a shield icon during spawn immunity.'],
      ['Roster panel', 'Live counts and a sorted who’s-who list, with you outlined.'],
    ],
    usage: [
      'Hide or show the overlay with <kbd>Insert</kbd>.',
      'Click the bookmark again to remove it.',
      'Join or host a Snowy Survival game first, then click the bookmark.',
    ],
    warn: 'Read-only overlay — reads positions/health your client already receives and sends nothing.',
  },
];

// ---- shared helpers ----
function toBookmarklet(src) {
  // Light minify: drop comment-only lines, indentation and blank lines. Newlines are kept so ASI
  // and trailing `//` comments stay safe; trailing comments are trimmed only when quote-free.
  const code = src.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'))
    .map(l => l.replace(/\s+\/\/ [^'"`]*$/, ''))
    .join('\n');
  new Function(code); // syntax check
  // Browsers percent-decode a javascript: URL once; escape only what breaks URL parsing.
  const href = 'javascript:' + code.replace(/[%\n\r#"<>`]|[^\x20-\x7e]/gu, encodeURIComponent);
  if (decodeURIComponent(href.slice(11)) !== code) throw new Error('bookmarklet encoding not reversible');
  return { code, href, srcLen: src.length };
}

const logo = 'data:image/png;base64,' +
  readFileSync(new URL('../buildyourstax/assets/vibecodemods-logo.png', import.meta.url)).toString('base64');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = `<style>
:root{--bg:#06060a;--s1:rgba(255,255,255,.035);--s2:rgba(255,255,255,.06);--ln:rgba(255,255,255,.08);--ln2:rgba(255,255,255,.14);
--fg:#f3f2f8;--dim:#8d8b9c;--acc:#a58bff;--grad:linear-gradient(90deg,#8b6cff,#58c7ff);color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:radial-gradient(70% 45% at 85% 0%,rgba(124,92,255,.22),transparent 65%),radial-gradient(55% 40% at 0% 10%,rgba(56,170,255,.1),transparent 70%),var(--bg);
color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding:56px 16px 64px}
main{max-width:620px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
.logo{width:min(300px,70%);height:auto;display:block}
a.back{color:var(--dim);text-decoration:none;font-size:13px}
a.back:hover{color:var(--fg)}
h1{font-size:34px;line-height:1.1;letter-spacing:-.03em;font-weight:700}
h1 span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--dim);font-size:16px;margin-top:10px;max-width:54ch}
h2{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
.drop{border:1px dashed var(--ln2);border-radius:16px;padding:28px 20px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;background:var(--s1)}
.bm{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border-radius:12px;background:#fff;color:#08070d;font-weight:700;font-size:16px;text-decoration:none;cursor:grab;
box-shadow:0 0 0 1px rgba(255,255,255,.2),0 10px 30px -8px rgba(140,110,255,.7);transition:transform .12s}
.bm:hover{transform:translateY(-1px)}
.bm:active{cursor:grabbing}
.bm svg{width:18px;height:18px}
.drop small{color:var(--dim);font-size:13px}
.card{background:var(--s1);border:1px solid var(--ln);border-radius:14px;padding:18px 20px}
ol{padding-left:22px;display:flex;flex-direction:column;gap:8px}
li::marker{color:var(--acc);font-weight:700}
kbd{background:var(--s2);border:1px solid var(--ln2);border-bottom-width:2px;border-radius:5px;padding:0 6px;font:13px ui-monospace,Consolas,monospace;color:var(--fg);white-space:nowrap}
.k{color:var(--dim)}
.row{display:flex;gap:8px;margin-top:12px}
.copy{flex:0 0 auto;padding:10px 16px;border-radius:10px;background:var(--s2);border:1px solid var(--ln2);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
.copy:hover{background:rgba(255,255,255,.1)}
.code{flex:1;min-width:0;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.45);border:1px solid var(--ln);color:var(--dim);font:12px ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.feat div{background:var(--s1);border:1px solid var(--ln);border-radius:12px;padding:14px}
.feat b{display:block;margin-bottom:2px}
.feat span{color:var(--dim);font-size:13px}
.warn{border-color:rgba(236,124,90,.25);background:rgba(236,124,90,.07);color:#f2c4b1;font-size:14px}
.mods{display:flex;flex-direction:column;gap:12px}
.mod{display:flex;align-items:center;gap:16px;text-decoration:none;color:inherit;background:var(--s1);border:1px solid var(--ln);border-radius:16px;padding:18px 20px;transition:border-color .15s,transform .12s,background .15s}
a.mod:hover{border-color:var(--ln2);background:var(--s2);transform:translateY(-1px)}
.mod .tag{flex:0 0 auto;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:15px;letter-spacing:-.02em;background:var(--grad);color:#08070d;box-shadow:0 6px 18px -8px rgba(140,110,255,.7)}
.mod .body{flex:1;min-width:0}
.mod .body b{display:block;font-size:16px}
.mod .body span{color:var(--dim);font-size:13.5px}
.mod .go{flex:0 0 auto;color:var(--dim);font-size:20px;transition:transform .12s,color .12s}
a.mod:hover .go{color:var(--fg);transform:translateX(2px)}
.soon{opacity:.55;cursor:default;border-style:dashed}
.soon:hover{transform:none;background:var(--s1);border-color:var(--ln)}
.soon .tag{background:var(--s2);color:var(--dim);box-shadow:none}
footer{color:var(--dim);font-size:12px;text-align:center}
footer a{color:var(--dim)}
</style>`;

const DRAG_SVG = '<svg viewBox="0 0 30 20" fill="currentColor"><path d="M7.5 2.4C7.8 4.8 8.3 5.3 10.1 5.6 8.3 5.9 7.8 6.4 7.5 8.8 7.2 6.4 6.7 5.9 4.9 5.6 6.7 5.3 7.2 4.8 7.5 2.4z"/><path d="M4.1 7.8C1.6 10 1.2 13.2 4.5 14.8 7.5 16.2 13 16.4 23.8 14.4 13.5 15.6 8 15.4 5.2 14 2.6 12.8 2.4 10.2 4.1 7.8z"/></svg>';

function installHtml(mod, href) {
  const feats = mod.features.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('\n');
  const uses = mod.usage.map(u => `<li>${u}</li>`).join('\n');
  const closeStep = mod.toggle === 'reclick'
    ? '<li>Click the bookmark again to remove it completely.</li>'
    : '<li>Reload the page to clear it.</li>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vibecodemods/ ${esc(mod.name)}</title>
<meta name="description" content="${attr(mod.name)} for Gimkit: drag it to your bookmarks bar.">
${STYLE}
</head>
<body>
<main>
<header>
<img class="logo" src="${logo}" alt="vibecodemods/">
<p style="margin-top:10px"><a class="back" href="../">← all Gimkit mods</a></p>
</header>

<section>
<h1>${esc(mod.name)} <span>for Gimkit</span></h1>
<p class="lead">${esc(mod.tagline)}</p>
</section>

<section class="drop">
<a class="bm" href="${attr(href)}" title="Drag me to your bookmarks bar" onclick="event.preventDefault();alert('Drag this button to your bookmarks bar, then click the bookmark while you\\'re in ${attr(mod.where)}.')">
${DRAG_SVG}
${esc(mod.name)}</a>
<small>↑ Drag this button onto your bookmarks bar</small>
</section>

<section>
<h2>Install</h2>
<div class="card">
<ol>
<li>Show your bookmarks bar: <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>B</kbd> <span class="k">(<kbd>⌘</kbd> <kbd>Shift</kbd> <kbd>B</kbd> on Mac)</span>.</li>
<li>Drag the <b>${esc(mod.name)}</b> button above onto the bar.</li>
<li>Open Gimkit and start or join ${esc(mod.where)}.</li>
<li>Click the bookmark.</li>
</ol>
</div>
</section>

<section>
<h2>Can't drag it? (school Chromebooks, phones)</h2>
<div class="card">
<ol>
<li>Copy the code below.</li>
<li>Bookmark any page (<kbd>Ctrl</kbd> <kbd>D</kbd>), then edit that bookmark.</li>
<li>Name it <b>${esc(mod.name)}</b> and paste the code into the <b>URL</b> box.</li>
</ol>
<div class="row"><div class="code" id="code"></div><button class="copy" id="copy" type="button">Copy code</button></div>
</div>
</section>

<section>
<h2>Using it</h2>
<div class="card">
<ol>
${uses}
${closeStep}
</ol>
</div>
</section>

<section>
<h2>What's inside</h2>
<div class="feat">
${feats}
</div>
</section>

<div class="card warn">${esc(mod.warn)}</div>

<footer>vibecodemods/ · not affiliated with Gimkit</footer>
</main>
<script>
const href = document.querySelector('.bm').getAttribute('href');
document.getElementById('code').textContent = href.slice(0, 120) + '…';
document.getElementById('copy').onclick = async e => {
  try { await navigator.clipboard.writeText(href); }
  catch (err) { const t = document.createElement('textarea'); t.value = href; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  e.target.textContent = 'Copied!';
  setTimeout(() => e.target.textContent = 'Copy code', 1800);
};
</script>
</body>
</html>
`;
}

function landingHtml(built) {
  const rows = built.map(m =>
    `<a class="mod" href="${m.slug}/">
<div class="tag">${esc(m.code)}</div>
<div class="body"><b>${esc(m.name)}</b><span>${esc(m.tagline)}</span></div>
<div class="go">→</div>
</a>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vibecodemods/ Gimkit</title>
<meta name="description" content="Browser mods for Gimkit game modes.">
${STYLE}
</head>
<body>
<main>
<header>
<img class="logo" src="../buildyourstax/assets/vibecodemods-logo.png" alt="vibecodemods/">
<p style="margin-top:10px"><a class="back" href="../">← all mods</a></p>
</header>
<section>
<h1>Gimkit <span>mods</span></h1>
<p class="lead">One mod per game mode. More get added here as they’re built — eventually they’ll merge into a single menu.</p>
</section>
<section>
<h2>Game modes</h2>
<div class="mods">
${rows}
<div class="mod soon">
<div class="tag">+</div>
<div class="body"><b>More modes coming</b><span>Each new mode gets its own folder here.</span></div>
</div>
</div>
</section>
<footer>vibecodemods/ · <a href="https://github.com/killllllformatt/vibecodemods">source on GitHub</a> · not affiliated with Gimkit</footer>
</main>
</body>
</html>
`;
}

// ---- build ----
const built = [];
for (const mod of MODS) {
  const src = readFileSync(new URL(`./${mod.slug}/${mod.src}`, import.meta.url), 'utf8');
  const { href, srcLen } = toBookmarklet(src);
  const html = installHtml(mod, href);
  writeFileSync(new URL(`./${mod.slug}/bookmarklet.txt`, import.meta.url), href);
  writeFileSync(new URL(`./${mod.slug}/install.html`, import.meta.url), html);
  writeFileSync(new URL(`./${mod.slug}/index.html`, import.meta.url), html); // Pages entry
  built.push(mod);
  console.log(`${mod.slug}: ${href.length} chars (source ${srcLen})`);
}
writeFileSync(new URL('./index.html', import.meta.url), landingHtml(built));
console.log(`landing: gimkit/index.html with ${built.length} mods`);
