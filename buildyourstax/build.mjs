// Builds bookmarklet.txt and install.html from stax-hub.js.  Run: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./stax-hub.js', import.meta.url), 'utf8');

// Light minify: drop comment-only lines, indentation and blank lines. Newlines are kept, so
// ASI and any trailing `//` comments stay safe; trailing comments are trimmed when they
// contain no quotes (so we never cut into a string).
const code = src.split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('//'))
  .map(l => l.replace(/\s+\/\/ [^'"`]*$/, ''))
  .join('\n');

new Function(code); // syntax check — throws if the minify broke something

// Browsers percent-decode a javascript: URL once before running it, so only escape what would
// break or be altered by URL parsing: % itself, newlines, # (fragment), " < > ` (attribute and
// URL-parser trouble), and non-ASCII. Plain spaces are left as-is (~40% smaller).
const ESC = /[%\n\r#"<>`]|[^\x20-\x7e]/gu;
const href = 'javascript:' + code.replace(ESC, encodeURIComponent);
if (decodeURIComponent(href.slice(11)) !== code) throw new Error('bookmarklet encoding is not reversible');
writeFileSync(new URL('./bookmarklet-offline.txt', import.meta.url), href);

// The bookmark users install is a tiny loader that pulls the latest stax-hub.js from GitHub Pages
// on every click, so pushing a change updates everyone with no re-install. The timestamp skips
// Pages' 10-minute cache. The full self-contained build above stays as an offline fallback for
// networks that block github.io.
const HUB_URL = 'https://killllllformatt.github.io/vibecodemods/buildyourstax/stax-hub.js';
const loader = `(()=>{const s=document.createElement('script');s.src='${HUB_URL}?t='+Date.now();s.onload=()=>s.remove();s.onerror=()=>{s.remove();alert('vibecodemods: could not download STAX Hub. Check your connection, or use the offline version from the install page.')};document.head.appendChild(s)})()`;
new Function(loader);
const escapeHref = c => c.replace(ESC, encodeURIComponent);
const loaderHref = 'javascript:' + escapeHref(loader);
writeFileSync(new URL('./bookmarklet.txt', import.meta.url), loaderHref);

// logo is embedded so install.html works as a single file (shared, downloaded, or on Pages)
const logo = 'data:image/png;base64,' + readFileSync(new URL('./assets/vibecodemods-logo.png', import.meta.url)).toString('base64');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vibecodemods/ STAX</title>
<meta name="description" content="STAX mod menu for buildyourstax.com: drag it to your bookmarks bar.">
<style>
:root{--bg:#06060a;--s1:rgba(255,255,255,.035);--s2:rgba(255,255,255,.06);--ln:rgba(255,255,255,.08);--ln2:rgba(255,255,255,.14);
--fg:#f3f2f8;--dim:#8d8b9c;--acc:#a58bff;--grad:linear-gradient(90deg,#8b6cff,#58c7ff);color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:radial-gradient(70% 45% at 85% 0%,rgba(124,92,255,.22),transparent 65%),radial-gradient(55% 40% at 0% 10%,rgba(56,170,255,.1),transparent 70%),var(--bg);
color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding:56px 16px 64px}
main{max-width:620px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
.logo{width:min(360px,80%);height:auto;display:block}
h1{font-size:34px;line-height:1.1;letter-spacing:-.03em;font-weight:700}
h1 span{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--dim);font-size:16px;margin-top:10px;max-width:52ch}
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
footer{color:var(--dim);font-size:12px;text-align:center}
</style>
</head>
<body>
<main>
<header>
<img class="logo" src="${logo}" alt="vibecodemods/">
</header>

<section>
<h1>STAX <span>mod menu</span></h1>
<p class="lead">A floating panel for <a href="https://buildyourstax.com" style="color:var(--fg)">buildyourstax.com</a>. Add cash, unlock everything, control life events and more, all from one bookmark.</p>
</section>

<section class="drop">
<a class="bm" href="${attr(loaderHref)}" title="Drag me to your bookmarks bar" onclick="event.preventDefault();alert('Drag this button to your bookmarks bar, then click the bookmark while you\\'re in a STAX game.')">
<svg viewBox="0 0 30 20" fill="currentColor"><path d="M7.5 2.4C7.8 4.8 8.3 5.3 10.1 5.6 8.3 5.9 7.8 6.4 7.5 8.8 7.2 6.4 6.7 5.9 4.9 5.6 6.7 5.3 7.2 4.8 7.5 2.4z"/><path d="M4.1 7.8C1.6 10 1.2 13.2 4.5 14.8 7.5 16.2 13 16.4 23.8 14.4 13.5 15.6 8 15.4 5.2 14 2.6 12.8 2.4 10.2 4.1 7.8z"/></svg>
STAX Hub</a>
<small>↑ Drag this button onto your bookmarks bar. It updates itself, so you only install it once.</small>
</section>

<section>
<h2>Install</h2>
<div class="card">
<ol>
<li>Show your bookmarks bar: <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>B</kbd> <span class="k">(<kbd>⌘</kbd> <kbd>Shift</kbd> <kbd>B</kbd> on Mac)</span>.</li>
<li>Drag the <b>STAX Hub</b> button above onto the bar.</li>
<li>Open <b>buildyourstax.com</b> and start or join a game.</li>
<li>Click the bookmark. The menu appears in the top-right corner.</li>
</ol>
</div>
</section>

<section>
<h2>Can't drag it? (school Chromebooks, phones)</h2>
<div class="card">
<ol>
<li>Copy the code below.</li>
<li>Bookmark any page (<kbd>Ctrl</kbd> <kbd>D</kbd>), then edit that bookmark.</li>
<li>Name it <b>STAX Hub</b> and paste the code into the <b>URL</b> box.</li>
</ol>
<div class="row"><div class="code" id="code"></div><button class="copy" id="copy" type="button">Copy code</button></div>
</div>
</section>

<section>
<h2>Blocked network? Offline version</h2>
<div class="card">
<p>If the bookmark says it couldn't download (some school filters block github.io), use this self-contained version instead. It works without downloading anything, but won't update itself.</p>
<div class="row"><div class="code" id="code2"></div><button class="copy" id="copy2" type="button">Copy offline code</button></div>
</div>
</section>

<section>
<h2>Using it</h2>
<div class="card">
<ol>
<li>Hide or show the menu with <kbd>\`</kbd> (backtick) or <kbd>Insert</kbd>.</li>
<li>Drag the title bar to move it. Double-click it (or press <kbd>–</kbd>) to shrink it.</li>
<li>Click the bookmark again to close it completely.</li>
<li>If the game reloads, click the bookmark twice to reconnect.</li>
</ol>
</div>
</section>

<section>
<h2>What's inside</h2>
<div class="feat">
<div><b>Money</b><span>Add cash: +10K, +100K, +1M or any amount.</span></div>
<div><b>Game</b><span>Unlock every investment and achievement. Pause or resume time.</span></div>
<div><b>Events</b><span>Auto-skip bad events, auto-claim good ones, trigger any good event.</span></div>
<div><b>Intel</b><span>See which real stocks the made-up companies copy, and the real year.</span></div>
<div><b>Lobby</b><span>Rename yourself; rewrite another player's or the computer's name and score; force-start the game.</span></div>
</div>
</section>

<div class="card warn">Lobby actions (pausing, force-starting, renaming) show up on everyone's screen in a group game, including the teacher's.</div>

<footer>vibecodemods/ · not affiliated with NGPF or STAX</footer>
</main>
<script>
const wire = (codeId, btnId, href) => {
  const label = document.getElementById(btnId).textContent;
  document.getElementById(codeId).textContent = href.slice(0, 120) + (href.length > 120 ? '…' : '');
  document.getElementById(btnId).onclick = async e => {
    try { await navigator.clipboard.writeText(href); }
    catch (err) { const t = document.createElement('textarea'); t.value = href; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    e.target.textContent = 'Copied!';
    setTimeout(() => e.target.textContent = label, 1800);
  };
};
wire('code', 'copy', document.querySelector('.bm').getAttribute('href'));
wire('code2', 'copy2', ${JSON.stringify(href)});
</script>
</body>
</html>
`;
writeFileSync(new URL('./install.html', import.meta.url), html);
writeFileSync(new URL('./index.html', import.meta.url), html); // GitHub Pages entry point
console.log(`loader: ${loaderHref.length} chars, offline: ${href.length} chars (source ${src.length})`);
