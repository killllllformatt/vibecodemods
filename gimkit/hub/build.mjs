// Builds the vibecodemods/ Gimkit hub.  Run: node build.mjs
//
//   shared/hub-shell.css + shared/hub-shell.js   the reusable panel (any vibecodemods hub)
//   gimkit/hub/modes/*.js                        one file per Gimkit mode, picked up automatically
//
// Output:
//   dist/gimkit-hub.js   readable bundle: paste into the console to test
//   bookmarklet.txt      the full hub as one javascript: URL (Gimkit's CSP blocks loading from
//                        github.io, so the bookmark carries all of the code)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const VERSION = '0.1.0';
const GLOBAL = '__vcmGimkit';
const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), 'utf8');

const css = read('../../shared/hub-shell.css').trim();
const shell = read('../../shared/hub-shell.js').replace(/^\/\* @HUB_CSS@ \*\/.*$/m, () => `const VCM_HUB_CSS = ${JSON.stringify(css)};`);
if (!shell.includes('const VCM_HUB_CSS')) throw new Error('CSS placeholder missing in hub-shell.js');
const modes = readdirSync(here('./modes/')).filter((f) => f.endsWith('.js')).sort();
if (!modes.length) throw new Error('no modes in modes/');

const bundle = `// vibecodemods/ Gimkit hub v${VERSION} — built by build.mjs, don't edit. Modes: ${modes.join(', ')}
(() => {
// Clicking the bookmark again turns the hub off.
if (window.${GLOBAL}) { window.${GLOBAL}.destroy(); return; }
const VCM_VERSION = ${JSON.stringify(VERSION)};
${shell}
${modes.map((f) => `// ---- modes/${f}\n` + read('./modes/' + f)).join('\n')}
window.${GLOBAL} = createHub({
  global: ${JSON.stringify(GLOBAL)},
  site: 'Gimkit',
  version: VCM_VERSION,
  modes: VCM_MODES,
  unsupportedText: 'Join a Gimkit game, then click the bookmark again.',
});
})();
`;
new Function(bundle); // syntax check
mkdirSync(here('./dist/'), { recursive: true });
writeFileSync(here('./dist/gimkit-hub.js'), bundle);

// Same light minify + escaping as the STAX build: drop comment-only lines and indentation, keep
// newlines (ASI-safe), trim trailing comments that contain no quotes.
const code = bundle.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//'))
  .map((l) => l.replace(/\s+\/\/ [^'"`]*$/, ''))
  .join('\n');
new Function(code);
const ESC = /[%\n\r#"<>`]|[^\x20-\x7e]/gu;
const href = 'javascript:' + code.replace(ESC, encodeURIComponent);
if (decodeURIComponent(href.slice(11)) !== code) throw new Error('bookmarklet encoding is not reversible');
writeFileSync(here('./bookmarklet.txt'), href);
console.log(`built v${VERSION}: ${modes.length} mode(s), bundle ${bundle.length} B, bookmarklet ${href.length} B`);
