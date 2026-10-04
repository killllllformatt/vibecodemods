// vibecodemods/ Gimkit hub v0.1.0 — built by build.mjs, don't edit. Modes: tno.js
(() => {
// Clicking the bookmark again turns the hub off.
if (window.__vcmGimkit) { window.__vcmGimkit.destroy(); return; }
const VCM_VERSION = "0.1.0";
// vibecodemods/ hub shell — the mode-agnostic panel every vibecodemods hub is built on.
//
// What the shell owns: the panel frame (look from shared/hub-shell.css), drag (mouse + touch),
// minimize, close, the ` (backtick) show/hide key, the tab bar, the toast, one-time banners, the
// first-use acknowledgement, the Connecting / Not supported screens and the Settings tab (panel
// opacity, reset position, about). It also hands every mode a small component kit (`ui`).
//
// What a mode owns: detecting itself, its engine, its header strip, its tabs and its settings.
// A mode is one plain object pushed onto VCM_MODES (see the contract below and README.md), so a
// new mode = a new file in modes/. A new hub = this file + its own mode files + a tiny main.js.
//
// No keybinds beyond the backtick, no looping animations (Chromebooks): only the STAX
// transitions (tab pill, toggles, button press, toast) run, and nothing updates while the panel is
// minimized or hidden.
//
// Mode contract (all fields optional except id, name, detect, tabs):
//   id, name                     'tno', 'Trust No One' (name shows in the header chip)
//   css                          mode-only CSS; write `[data-mode="<id>"]` scoped rules
//   install(hub)                 start the engine once at boot (every mode, active or not);
//                                register teardown with hub.onDestroy(fn)
//   detect()                     'yes' (this is the game) | 'maybe' (could be, e.g. lobby)
//                                | 'wait' (still connecting) | 'no'
//   waiting()                    while detect() says 'wait': { status, icon, title, text } to show
//                                instead of the Connecting skeleton (e.g. "Enter the game code"), or null
//   status()                     { dot: 'live'|'warn'|'idle'|'done'|'', text, tone: ''|'dim'|'warn',
//                                  who }  who = your in-game name, shown dim after the text
//   strip(ui)                    -> { node, update() }  header strip numbers
//   mini()                       -> text shown next to the dot while minimized
//   ack                          first-use text, shown once over tabs marked pub:true
//   tabs: [{ id, label, pub, pubNote, build(ui, hub) -> { nodes:[...], update() } }]
//   settings(ui, hub)            -> { nodes:[...], update() }  appended to the shell Settings tab
//   tick()                       called every UI refresh while this mode is active (banners etc.)
const VCM_MODES = [];

const VCM_HUB_CSS = "#vcm-hub{--bg:#06060a;--s1:rgba(255,255,255,.035);--s2:rgba(255,255,255,.06);--s3:rgba(255,255,255,.11);--ln:rgba(255,255,255,.07);--ln2:rgba(255,255,255,.13);\r\n--fg:#f3f2f8;--dim:#8d8b9c;--acc:#a58bff;--acc2:#58c7ff;--grad:linear-gradient(90deg,#8b6cff,#58c7ff);--on:#08070d;--red:#ff7a70;\r\n--tone-a:#ff7a70;--tone-b:#56d364;--accent-warm:#ffb547;\r\nposition:fixed;top:72px;right:16px;width:336px;max-height:calc(100vh - 88px);display:flex;flex-direction:column;z-index:2147483647;will-change:transform;\r\nbackground:radial-gradient(110% 70% at 100% 0%,rgba(124,92,255,.24),transparent 60%),radial-gradient(80% 55% at 0% 8%,rgba(56,170,255,.12),transparent 65%),radial-gradient(90% 50% at 40% 105%,rgba(214,76,190,.09),transparent 70%),var(--bg);\r\ncolor:var(--fg);border:1px solid var(--ln2);border-radius:14px;color-scheme:dark;font:13px/1.45 ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",sans-serif;-webkit-font-smoothing:antialiased;\r\nbox-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 18px 40px -12px rgba(0,0,0,.65),0 2px 6px rgba(0,0,0,.3);user-select:none;-webkit-user-select:none;contain:layout paint style;overflow:hidden;text-align:left}\r\n#vcm-hub *{box-sizing:border-box;margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;line-height:inherit;box-shadow:none;outline:0;text-decoration:none;list-style:none}\r\n#vcm-hub b,#vcm-hub strong{font-weight:600}\r\n#vcm-hub button{cursor:pointer;text-align:inherit}\r\n#vcm-hub::before{content:\"\";position:absolute;inset:0;pointer-events:none;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220' fill='none' stroke='white'%3E%3Cg stroke-opacity='.08'%3E%3Ccircle cx='318' cy='-6' r='64'/%3E%3Ccircle cx='318' cy='-6' r='112'/%3E%3Ccircle cx='318' cy='-6' r='166'/%3E%3Cpath d='M318 -6 L150 220'/%3E%3C/g%3E%3Cg stroke-opacity='.16'%3E%3Cpath d='M168 30 L204 14 L232 40 L270 26'/%3E%3Cpath d='M204 14 L196 58'/%3E%3C/g%3E%3Cg fill='white' stroke='none' fill-opacity='.55'%3E%3Ccircle cx='168' cy='30' r='1.3'/%3E%3Ccircle cx='204' cy='14' r='1.8'/%3E%3Ccircle cx='232' cy='40' r='1.3'/%3E%3Ccircle cx='270' cy='26' r='1.1'/%3E%3Ccircle cx='196' cy='58' r='1'/%3E%3Ccircle cx='120' cy='12' r='.9'/%3E%3Ccircle cx='290' cy='96' r='.9'/%3E%3C/g%3E%3C/svg%3E\") no-repeat right top/320px auto}\r\n#vcm-hub>*{position:relative}\r\n#vcm-hub svg{width:14px;height:14px;flex:0 0 auto;display:block;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}\r\n\r\n/* header */\r\n#vcm-hub .hd{display:flex;align-items:center;gap:8px;padding:8px 6px 4px 14px;cursor:grab;touch-action:none}\r\n#vcm-hub.drag .hd{cursor:grabbing}\r\n#vcm-hub .wm{position:relative;flex:0 0 auto;white-space:nowrap;padding:0 0 3px 12px;font:400 15px/1.15 \"Avenir Next\",\"Century Gothic\",Futura,ui-sans-serif,system-ui,sans-serif;letter-spacing:-.015em;color:#fff}\r\n#vcm-hub .wm::before{content:\"\";position:absolute;left:0;top:0;width:30px;height:20px;pointer-events:none;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20' fill='white'%3E%3Cpath d='M7.5 2.4C7.8 4.8 8.3 5.3 10.1 5.6 8.3 5.9 7.8 6.4 7.5 8.8 7.2 6.4 6.7 5.9 4.9 5.6 6.7 5.3 7.2 4.8 7.5 2.4z'/%3E%3Cpath d='M4.1 7.8C1.6 10 1.2 13.2 4.5 14.8 7.5 16.2 13 16.4 23.8 14.4 13.5 15.6 8 15.4 5.2 14 2.6 12.8 2.4 10.2 4.1 7.8z'/%3E%3C/svg%3E\") no-repeat 0 0/30px 20px}\r\n#vcm-hub .wm strong{font-weight:700}\r\n#vcm-hub .wm em{font-style:normal;color:var(--dim)}\r\n#vcm-hub .chip{flex:0 1 auto;min-width:0;max-width:128px;padding:2px 8px;border-radius:999px;background:var(--s2);border:1px solid var(--ln);font-size:11px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n#vcm-hub .sp{flex:1}\r\n#vcm-hub .ic{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;color:var(--dim);flex:0 0 auto;transition:background .12s,color .12s}\r\n#vcm-hub .ic:hover{background:var(--s2);color:var(--fg)}\r\n#vcm-hub .mini{display:none}\r\n\r\n/* status + header strip (strip = mode slot) */\r\n#vcm-hub .meta{display:flex;align-items:center;gap:12px;min-height:26px;padding:0 14px 10px}\r\n#vcm-hub .st{display:flex;align-items:center;gap:7px;min-width:0;flex:0 1 auto;font-size:11.5px;white-space:nowrap;overflow:hidden}\r\n#vcm-hub .st b{overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}\r\n#vcm-hub .st.dim b{color:var(--dim);font-weight:500}\r\n#vcm-hub .st.warn b{color:#ffb3ab}\r\n#vcm-hub .dot{width:6px;height:6px;border-radius:50%;background:var(--s3);flex:0 0 auto}\r\n#vcm-hub .dot.live{background:#b9a6ff;box-shadow:0 0 0 3px rgba(165,139,255,.2)}\r\n#vcm-hub .dot.warn{background:var(--red);box-shadow:0 0 0 3px rgba(236,124,90,.16)}\r\n#vcm-hub .dot.done{background:var(--acc2);box-shadow:0 0 0 3px rgba(88,199,255,.18)}\r\n#vcm-hub .dot.idle{background:var(--dim)}\r\n#vcm-hub .strip{margin-left:auto;display:flex;align-items:center;gap:10px;flex:0 0 auto;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}\r\n#vcm-hub .strip>span{display:flex;align-items:center;gap:4px}\r\n#vcm-hub .strip i{font-style:normal;font-size:10px}\r\n#vcm-hub .ta{color:var(--tone-a)}#vcm-hub .tb{color:var(--tone-b)}#vcm-hub .tw{color:var(--accent-warm)}#vcm-hub .tn{color:var(--dim)}\r\n#vcm-hub .spin{width:11px;height:11px;border-radius:50%;border:1.5px solid var(--s3);border-top-color:var(--acc);flex:0 0 auto}\r\n\r\n/* tabs: 3, 4 or 5 (data-n on .tabs, data-i on .pill; JS may set --n/--i inline instead) */\r\n#vcm-hub .tabs{--n:5;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);margin:0 10px;padding:3px;background:rgba(0,0,0,.35);border:1px solid var(--ln);border-radius:10px}\r\n#vcm-hub .tabs[data-n=\"3\"]{--n:3}#vcm-hub .tabs[data-n=\"4\"]{--n:4}\r\n#vcm-hub .tabs button{position:relative;z-index:1;min-height:36px;padding:0 2px;font-size:12px;font-weight:560;color:var(--dim);border-radius:7px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}\r\n#vcm-hub .tabs button:hover,#vcm-hub .tabs button.on{color:var(--fg)}\r\n#vcm-hub .tabs button.pub::after{content:\"\";position:absolute;top:7px;right:7px;width:5px;height:5px;border-radius:50%;background:var(--red)}\r\n#vcm-hub .tabs.off{opacity:.4;pointer-events:none}\r\n#vcm-hub .pill{--i:0;position:absolute!important;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/var(--n));transform:translateX(calc(var(--i)*100%));background:var(--s3);border-radius:7px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.35);transition:transform .22s cubic-bezier(.3,.7,.2,1)}\r\n#vcm-hub .pill[data-i=\"1\"]{--i:1}#vcm-hub .pill[data-i=\"2\"]{--i:2}#vcm-hub .pill[data-i=\"3\"]{--i:3}#vcm-hub .pill[data-i=\"4\"]{--i:4}\r\n\r\n#vcm-hub .body{overflow-y:auto;padding:12px 12px 14px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--s3) transparent}\r\n#vcm-hub.min .meta,#vcm-hub.min .tabs,#vcm-hub.min .body,#vcm-hub.min .toast,#vcm-hub.min .banner,#vcm-hub.min .chip{display:none}\r\n#vcm-hub.min .hd{padding-bottom:8px}\r\n#vcm-hub.min .mini{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}\r\n\r\n\r\n/* cards, labels, rows */\r\n#vcm-hub .card{background:var(--s1);border:1px solid var(--ln);border-radius:11px;padding:12px}\r\n#vcm-hub .card.list{padding:0}\r\n#vcm-hub .card.list>:first-child{border-radius:10px 10px 0 0}\r\n#vcm-hub .card.list>:last-child{border-radius:0 0 10px 10px}\r\n#vcm-hub .card.list>:only-child{border-radius:10px}\r\n#vcm-hub .card.scroll{max-height:184px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--s3) transparent}\r\n#vcm-hub .k{color:var(--dim)}\r\n#vcm-hub .cap{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}\r\n#vcm-hub .big{font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.1;margin:4px 0 10px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n#vcm-hub .big small{font-size:14px;font-weight:500;color:var(--dim);margin-left:4px;letter-spacing:0}\r\n#vcm-hub .kv{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0 0}\r\n#vcm-hub .card>.kv:first-child{padding-top:0}\r\n#vcm-hub .kv+.kv{border-top:1px solid var(--ln);margin-top:8px}\r\n#vcm-hub .kv .v{font-weight:600;font-variant-numeric:tabular-nums;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\r\n#vcm-hub .lbl{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dim);margin:6px 2px 0}\r\n#vcm-hub .lblrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 2px 0}\r\n#vcm-hub .lblrow .lbl{margin:0}\r\n#vcm-hub .row{display:flex;gap:6px}\r\n#vcm-hub .row>.btn{flex:1}\r\n#vcm-hub .col{display:flex;flex-direction:column;gap:6px}\r\n#vcm-hub .note{color:var(--dim);font-size:12px;padding:0 2px;text-wrap:pretty}\r\n#vcm-hub .tx{text-wrap:pretty}\r\n\r\n/* buttons */\r\n#vcm-hub .btn{min-height:36px;padding:8px 12px;border-radius:9px;background:var(--s2);border:1px solid var(--ln);font-weight:560;text-align:center;white-space:nowrap;transition:background .12s,border-color .12s,transform .08s}\r\n#vcm-hub .btn:hover{background:var(--s3);border-color:var(--ln2)}\r\n#vcm-hub .btn:active,#vcm-hub .mb:active{transform:scale(.98)}\r\n#vcm-hub .btn.pri{background:#fff;border-color:transparent;color:var(--on);font-weight:650;box-shadow:0 0 0 1px rgba(255,255,255,.2),0 6px 18px -6px rgba(140,110,255,.55)}\r\n#vcm-hub .btn.pri:hover{background:#e9e4ff}\r\n#vcm-hub .btn:disabled,#vcm-hub .mb:disabled,#vcm-hub select:disabled,#vcm-hub .sel:disabled{opacity:.45;cursor:not-allowed;transform:none}\r\n#vcm-hub .btn:disabled:hover{background:var(--s2);border-color:var(--ln)}\r\n#vcm-hub .btn.pri:disabled:hover{background:#fff}\r\n#vcm-hub .why{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);padding:0 2px}\r\n#vcm-hub .why::before{content:\"\";width:5px;height:5px;border-radius:50%;background:var(--red);flex:0 0 auto}\r\n#vcm-hub .why.soft::before{background:var(--dim)}\r\n#vcm-hub .why:empty{display:none}\r\n#vcm-hub .ic:focus-visible,#vcm-hub .btn:focus-visible,#vcm-hub .mb:focus-visible,#vcm-hub .tabs button:focus-visible,#vcm-hub .seg button:focus-visible,#vcm-hub .sel:focus-visible{box-shadow:0 0 0 2px var(--acc)}\r\n\r\n/* segmented control */\r\n#vcm-hub .seg{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);padding:3px;background:rgba(0,0,0,.35);border:1px solid var(--ln);border-radius:10px}\r\n#vcm-hub .seg button{min-height:36px;border-radius:7px;font-size:12px;font-weight:560;color:var(--dim);text-align:center;transition:color .12s,background .12s}\r\n#vcm-hub .seg button:hover{color:var(--fg)}\r\n#vcm-hub .seg button.on{background:var(--s3);color:var(--fg);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 2px rgba(0,0,0,.35)}\r\n#vcm-hub .seg button:disabled{opacity:.4;cursor:not-allowed}\r\n#vcm-hub .segcap{font-size:11.5px;color:var(--dim);padding:0 2px;text-wrap:pretty}\r\n\r\n/* select / picker (.sel = button picker; native select shares the look) */\r\n#vcm-hub select,#vcm-hub .sel{width:100%;min-width:0;min-height:36px;display:flex;align-items:center;padding:0 30px 0 10px;border-radius:9px;border:1px solid var(--ln2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-appearance:none;appearance:none;transition:border-color .12s,box-shadow .12s;\r\nbackground:rgba(0,0,0,.45) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238d8b9c' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M5 6.5l3 3 3-3'/%3E%3C/svg%3E\") no-repeat right 9px center/14px}\r\n#vcm-hub .sel:hover{border-color:rgba(255,255,255,.22)}\r\n#vcm-hub .sel.open,#vcm-hub select:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(165,139,255,.18)}\r\n#vcm-hub .sel.ph{color:var(--dim)}\r\n#vcm-hub option{background:#12111a;color:#f3f2f8}\r\n#vcm-hub .menu{padding:4px;border-radius:10px;background:#12111a;border:1px solid var(--ln2);box-shadow:0 12px 24px -8px rgba(0,0,0,.6)}\r\n#vcm-hub .menu>div{min-height:34px;display:flex;align-items:center;gap:8px;padding:0 9px;border-radius:7px}\r\n#vcm-hub .menu>.on{background:var(--s3)}\r\n#vcm-hub .menu>.x{color:var(--dim)}\r\n#vcm-hub .menu>.x span{opacity:.55}\r\n#vcm-hub .menu small{margin-left:auto;font-size:11px;color:var(--dim)}\r\n\r\n/* slider */\r\n#vcm-hub .sl{display:flex;align-items:center;gap:12px;padding:4px 12px}\r\n#vcm-hub .sl>b{flex:0 0 auto}\r\n#vcm-hub .rng{position:relative;flex:1;min-width:0;height:36px}\r\n#vcm-hub .rng i{position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;border-radius:2px;background:var(--s3);overflow:hidden}\r\n#vcm-hub .rng i b{display:block;height:100%;background:var(--grad)}\r\n#vcm-hub .rng u{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(165,139,255,.18),0 1px 3px rgba(0,0,0,.4)}\r\n#vcm-hub .rng input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}\r\n#vcm-hub .sl.dis b,#vcm-hub .sl.dis .rng,#vcm-hub .sl.dis .val{opacity:.45}\r\n#vcm-hub .val{flex:0 0 auto;min-width:46px;padding:4px 6px;border-radius:7px;background:rgba(0,0,0,.4);border:1px solid var(--ln);font-size:12px;font-weight:600;text-align:center;font-variant-numeric:tabular-nums}\r\n\r\n/* stat tiles (3 default, .s5 = five) */\r\n#vcm-hub .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}\r\n#vcm-hub .stat{background:var(--s1);border:1px solid var(--ln);border-radius:11px;padding:10px 10px 11px;min-width:0}\r\n#vcm-hub .stat .k{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n#vcm-hub .stat .v{font-size:17px;font-weight:650;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap}\r\n#vcm-hub .stat .v small{font-size:11px;font-weight:500;color:var(--dim);margin-left:2px}\r\n#vcm-hub .stats.s5{grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}\r\n#vcm-hub .stats.s5 .stat{padding:8px 6px 9px;text-align:center}\r\n#vcm-hub .stats.s5 .k{font-size:10px}\r\n#vcm-hub .stats.s5 .v{font-size:15px}\r\n#vcm-hub .bar{height:3px;border-radius:2px;background:var(--s3);margin-top:9px;overflow:hidden}\r\n#vcm-hub .bar i{display:block;height:100%;background:var(--grad);transform-origin:left;transform:scaleX(0);transition:transform .35s ease}\r\n\r\n/* toggles: .sw = full row, .tg = bare switch. Ship with a hidden checkbox; .on mirrors :checked */\r\n#vcm-hub .sw{position:relative;display:flex;align-items:center;gap:12px;padding:10px 12px;min-height:44px;cursor:pointer}\r\n#vcm-hub .sw+.sw{border-top:1px solid var(--ln)}\r\n#vcm-hub .sw>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}\r\n#vcm-hub .sw small,#vcm-hub .ar small{font-size:11.5px;color:var(--dim)}\r\n#vcm-hub .sw input,#vcm-hub .tg input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}\r\n#vcm-hub .tg{position:relative;display:grid;place-items:center;min-width:36px;min-height:36px;flex:0 0 auto;cursor:pointer}\r\n#vcm-hub .sw i,#vcm-hub .tg i{flex:0 0 auto;position:relative;width:34px;height:20px;border-radius:10px;background:var(--s3);transition:background .15s,box-shadow .15s}\r\n#vcm-hub .sw i::before,#vcm-hub .tg i::before{content:\"\";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#cfd2c3;transition:transform .16s cubic-bezier(.3,.7,.2,1),background .15s}\r\n#vcm-hub .sw input:checked+i,#vcm-hub .sw.on i,#vcm-hub .tg input:checked+i,#vcm-hub .tg.on i{background:var(--grad)}\r\n#vcm-hub .sw input:checked+i::before,#vcm-hub .sw.on i::before,#vcm-hub .tg input:checked+i::before,#vcm-hub .tg.on i::before{transform:translateX(14px);background:#fff}\r\n#vcm-hub .tg.wait i{background:rgba(165,139,255,.14);box-shadow:inset 0 0 0 1.5px var(--acc)}\r\n#vcm-hub .tg.wait i::before{transform:translateX(14px);background:var(--acc)}\r\n#vcm-hub .sw input:focus-visible+i,#vcm-hub .tg input:focus-visible+i{box-shadow:0 0 0 2px var(--acc)}\r\n#vcm-hub .sw.dis{cursor:not-allowed}\r\n#vcm-hub .sw.dis b,#vcm-hub .sw.dis i{opacity:.45}\r\n#vcm-hub .sw.hot{background:rgba(165,139,255,.08);border:1px solid rgba(165,139,255,.38);border-radius:11px;box-shadow:0 0 0 3px rgba(165,139,255,.08)}\r\n#vcm-hub .sw.hot small{color:#cdbfff}\r\n\r\n/* action row: off / .on / .wait (on, waiting) / .fired / .dis (with .why sub-line) */\r\n#vcm-hub .ar{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;min-height:52px;transition:background .3s}\r\n#vcm-hub .ar+.ar{border-top:1px solid var(--ln)}\r\n#vcm-hub .ar .nm{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}\r\n#vcm-hub .ar .t{display:flex;align-items:center;gap:6px;min-width:0}\r\n#vcm-hub .ar .t>b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\r\n#vcm-hub .ar .sub{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n#vcm-hub .cost{flex:0 0 auto;font-size:11px;font-weight:650;color:var(--accent-warm);font-variant-numeric:tabular-nums}\r\n#vcm-hub .badge{flex:0 0 auto;padding:1px 5px;border-radius:5px;background:var(--s3);font-size:10px;font-weight:700;line-height:1.4}\r\n#vcm-hub .badge.warm{background:rgba(255,181,71,.15);color:var(--accent-warm)}\r\n#vcm-hub .mb{flex:0 0 auto;min-height:36px;padding:0 11px;border-radius:8px;background:var(--s2);border:1px solid var(--ln);font-size:12px;font-weight:600;white-space:nowrap;transition:background .12s,border-color .12s,transform .08s}\r\n#vcm-hub .mb:hover{background:var(--s3);border-color:var(--ln2)}\r\n#vcm-hub .ar.on .sub{color:var(--fg)}\r\n#vcm-hub .ar.wait{background:rgba(165,139,255,.06)}\r\n#vcm-hub .ar.wait .sub{color:#c4b5ff}\r\n#vcm-hub .ar.wait .sub::before{content:\"\";width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--acc);flex:0 0 auto}\r\n#vcm-hub .ar.fired{background:linear-gradient(90deg,rgba(88,199,255,.13),rgba(88,199,255,.02) 80%)}\r\n#vcm-hub .ar.fired .sub{color:var(--acc2)}\r\n#vcm-hub .ar.fired .sub::before{content:\"\\2713\";font-weight:700}\r\n#vcm-hub .ar.fired .mb{border-color:rgba(88,199,255,.4);color:var(--acc2)}\r\n#vcm-hub .ar.dis .t,#vcm-hub .ar.dis .mb,#vcm-hub .ar.dis .tg{opacity:.45}\r\n#vcm-hub .ar.dis .mb,#vcm-hub .ar.dis .tg{pointer-events:none}\r\n#vcm-hub .next{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dim);padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\r\n#vcm-hub .next b{color:var(--fg)}\r\n#vcm-hub .next::before{content:\"\\203A\";color:var(--acc);font-weight:700}\r\n\r\n/* list row with tags + row treatments */\r\n#vcm-hub .li{display:flex;align-items:center;gap:9px;min-height:36px;padding:4px 12px}\r\n#vcm-hub .li+.li{border-top:1px solid var(--ln)}\r\n#vcm-hub .av{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:var(--s3);font-size:10.5px;font-weight:700;color:var(--fg)}\r\n#vcm-hub .li .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:560}\r\n#vcm-hub .li .n em,#vcm-hub .ar .t em{font-style:normal;font-weight:500;color:var(--dim)}\r\n#vcm-hub .tags{display:flex;gap:4px;flex:0 0 auto}\r\n#vcm-hub .tag{padding:2px 6px;border-radius:5px;background:var(--s2);font-size:10.5px;font-weight:600;line-height:1.3;color:var(--dim);white-space:nowrap}\r\n#vcm-hub .tag.a{color:var(--tone-a);background:color-mix(in srgb,var(--tone-a) 14%,transparent)}\r\n#vcm-hub .tag.b{color:var(--tone-b);background:color-mix(in srgb,var(--tone-b) 13%,transparent)}\r\n#vcm-hub .tag.w{color:var(--accent-warm);background:color-mix(in srgb,var(--accent-warm) 14%,transparent)}\r\n#vcm-hub .is-you{background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--ln2)}\r\n#vcm-hub .is-out{opacity:.45}\r\n#vcm-hub .is-out .n{text-decoration:line-through}\r\n\r\n/* log feed (newest first); .cf = confirms the entry below it */\r\n#vcm-hub .lg{display:flex;align-items:baseline;gap:8px;padding:8px 12px;font-size:12.5px}\r\n#vcm-hub .lg+.lg{border-top:1px solid var(--ln)}\r\n#vcm-hub .lg time{flex:0 0 34px;font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums}\r\n#vcm-hub .lg .kd{flex:0 0 14px;text-align:center;font-size:11px}\r\n#vcm-hub .lg .tx{flex:1;min-width:0}\r\n#vcm-hub .lg.cf+.lg{border-top:0;padding-top:0}\r\n#vcm-hub .lg.cf+.lg time{visibility:hidden}\r\n#vcm-hub .lg.cf+.lg .tx{color:var(--dim)}\r\n#vcm-hub .cfm{font-size:10.5px;font-weight:600;color:var(--tone-b);white-space:nowrap}\r\n\r\n/* feedback */\r\n#vcm-hub .warn{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:rgba(236,124,90,.09);border:1px solid rgba(236,124,90,.22);color:#f2c4b1;font-size:12px}\r\n#vcm-hub .warn svg{margin-top:1px;color:var(--red)}\r\n#vcm-hub .warn b{color:#ffd9cc}\r\n#vcm-hub .banner{display:flex;align-items:flex-start;gap:6px;margin:0 10px 8px;padding:9px 4px 9px 12px;border-radius:10px;background:rgba(165,139,255,.09);border:1px solid rgba(165,139,255,.26)}\r\n#vcm-hub .banner>span{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;padding-top:1px}\r\n#vcm-hub .banner small{font-size:11.5px;color:#c9c0e6;text-wrap:pretty}\r\n#vcm-hub .banner .ic{width:36px;height:36px;margin:-8px 0}\r\n#vcm-hub .empty{display:flex;flex-direction:column;align-items:center;gap:3px;padding:20px 14px;text-align:center;color:var(--dim);font-size:12px;text-wrap:pretty}\r\n#vcm-hub .empty .e{font-size:20px;margin-bottom:4px}\r\n#vcm-hub .empty b{color:var(--fg);font-size:13px}\r\n#vcm-hub .sk{display:block;height:9px;border-radius:5px;background:var(--s3)}\r\n#vcm-hub .sk.c{width:22px;height:22px;border-radius:50%;flex:0 0 auto}\r\n#vcm-hub .hint{display:flex;align-items:center;gap:8px;padding:2px;font-size:12px;color:var(--dim)}\r\n#vcm-hub .hint::before{content:\"\";width:6px;height:6px;border-radius:50%;background:var(--dim)}\r\n#vcm-hub .livechip{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:rgba(165,139,255,.12);border:1px solid rgba(165,139,255,.28);font-size:11px;font-weight:600;color:#d6cbff;font-variant-numeric:tabular-nums;white-space:nowrap}\r\n#vcm-hub .livechip::before{content:\"\";width:6px;height:6px;border-radius:50%;background:#b9a6ff}\r\n#vcm-hub .pubnote{display:flex;align-items:center;gap:7px;padding:0 2px;font-size:11.5px;color:#f2c4b1}\r\n#vcm-hub .pubnote::before{content:\"\";width:5px;height:5px;border-radius:50%;background:var(--red)}\r\n#vcm-hub kbd{display:inline-grid;place-items:center;min-width:24px;height:22px;padding:0 6px;border-radius:6px;background:var(--s2);border:1px solid var(--ln2);border-bottom-width:2px;font:600 12px/1 ui-monospace,Menlo,Consolas,monospace}\r\n#vcm-hub .toast{position:absolute!important;z-index:2;left:50%;bottom:14px;max-width:calc(100% - 28px);transform:translate(-50%,8px);opacity:0;pointer-events:none;background:var(--fg);color:var(--bg);font-weight:600;font-size:12px;padding:7px 13px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 8px 20px rgba(0,0,0,.45);transition:opacity .18s,transform .18s}\r\n#vcm-hub .toast.show{opacity:1;transform:translate(-50%,0)}\r\n#vcm-hub .ack .tx{margin:6px 0 12px}\r\n#vcm-hub .ack .btn{width:100%}\r\n#vcm-hub .frozen{opacity:.5;pointer-events:none}\r\n\r\n@media (pointer:coarse){\r\n#vcm-hub .btn,#vcm-hub .sel,#vcm-hub select,#vcm-hub .mb,#vcm-hub .tabs button,#vcm-hub .seg button{min-height:44px}\r\n#vcm-hub .ic{width:42px;height:42px}#vcm-hub .tg{min-width:44px;min-height:44px}#vcm-hub .li{min-height:44px}#vcm-hub .sw{min-height:52px}#vcm-hub .ar{min-height:58px}\r\n}\r\n@media (max-width:480px){#vcm-hub{left:8px!important;right:8px!important;top:8px!important;width:auto;max-height:calc(100vh - 16px)} }\r\n@media (prefers-reduced-motion:reduce){#vcm-hub *,#vcm-hub *::before,#vcm-hub *::after{transition:none!important} }\r\n/* action row layout: full-width name, then cost + badges + status (wraps instead of cutting off) */\n#vcm-hub .ar .an{font-weight:600;line-height:1.3;text-wrap:pretty}\n#vcm-hub .ar .am{display:flex;align-items:center;flex-wrap:wrap;gap:2px 6px;min-width:0}\n#vcm-hub .ar .am .sub{white-space:normal;overflow:visible;min-width:0}\n#vcm-hub .ar.dis .an,#vcm-hub .ar.dis .am>.cost,#vcm-hub .ar.dis .am>.badge{opacity:.45}\n/* status line: \"In game · <your name>\" — the name gives way first on a narrow line */\n/* name sits on its own small line under the status (dot | status / name), so it never gets squeezed */\n#vcm-hub .st:has(.who:not(:empty)){display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:7px;row-gap:0;align-items:center;line-height:1.25}\n#vcm-hub .st .who{grid-column:2;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--dim);font-size:10.5px;font-weight:500}\n#vcm-hub .st .who:empty{display:none}\n#vcm-hub .ar .cost:empty{display:none}\n#vcm-hub .ar{gap:6px}\n#vcm-hub .ar .mb{padding:0 9px;font-size:11.5px}";

function createHub(opts) {
  const ROOT = 'vcm-hub';
  const KEY = opts.storageKey || 'vcm-hub-ui';
  const cleanups = [];
  let alive = true;

  // ---------- saved UI state (per viewer, best effort) ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  saved.tab = saved.tab || {};
  saved.acked = saved.acked || {};
  saved.dismissed = saved.dismissed || {};
  if (typeof saved.opacity !== 'number') saved.opacity = 1;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  // ---------- component kit ----------
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'cls') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k === 'style') n.style.cssText = props[k];
      else if (k === 'data') Object.assign(n.dataset, props[k]);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
      else if (k in n) n[k] = props[k];
      else n.setAttribute(k, props[k]);
    }
    n.append(...kids.flat().filter((x) => x != null && x !== false));
    return n;
  };
  const svg = (d) => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 16 16">${d}</svg>`; return t.content.firstChild; };
  const ICON = {
    min: '<path d="M4 8h8"/>', restore: '<path d="M4 6.5l4 4 4-4"/>', close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
    warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11.3v.2"/>',
  };
  // Write-only-if-changed helpers: render runs on a timer, so these keep the DOM still (an open
  // <select> or a hovered button is never rebuilt under the pointer).
  const put = (n, t) => { t = t == null ? '' : String(t); if (n.textContent !== t) n.textContent = t; };
  const cls = (n, c, on) => { if (n.classList.contains(c) !== !!on) n.classList.toggle(c, !!on); };
  const show = (n, on) => { const v = on ? '' : 'none'; if (n.style.display !== v) n.style.display = v; };
  const prop = (n, k, v) => { if (n[k] !== v) n[k] = v; };
  const setKids = (n, kids) => { const a = kids.filter(Boolean); if (a.length !== n.childNodes.length || a.some((k, i) => n.childNodes[i] !== k)) n.replaceChildren(...a); };

  // Keyed list reconcile: rows are created once per key and moved, never rebuilt.
  function keyed(container, items, keyOf, create, update) {
    const map = container._rows || (container._rows = new Map());
    const want = new Set();
    items.forEach((it, i) => {
      const k = keyOf(it, i);
      want.add(k);
      let row = map.get(k);
      if (!row) { row = create(it); map.set(k, row); }
      update(row, it, i);
      const node = row.node || row;
      if (container.children[i] !== node) container.insertBefore(node, container.children[i] || null);
    });
    for (const [k, row] of map) if (!want.has(k)) { (row.node || row).remove(); map.delete(k); }
  }

  const card = (...kids) => el('div', { cls: 'card' }, ...kids);
  const listCard = (...kids) => el('div', { cls: 'card list' }, ...kids);
  const lbl = (text) => el('div', { cls: 'lbl', text });
  const lblrow = (label, right) => el('div', { cls: 'lblrow' }, typeof label === 'string' ? lbl(label) : label, right);
  const note = (text) => el('div', { cls: 'note', text });
  const why = (text, soft) => el('div', { cls: 'why' + (soft ? ' soft' : ''), text: text || '' });
  const btn = (text, fn, pri) => el('button', { type: 'button', cls: 'btn' + (pri ? ' pri' : ''), text, onclick: fn });
  const kv = (k, v) => { const vn = typeof v === 'object' && v ? v : el('span', { cls: 'v', text: v == null ? '—' : v }); return { node: el('div', { cls: 'kv' }, el('span', { cls: 'k', text: k }), vn), v: vn }; };
  const empty = (icon, title, text) => {
    const t = el('b', { text: title }), s = el('span', { text: text || '' });
    return { node: el('div', { cls: 'empty' }, el('span', { cls: 'e', text: icon }), t, s), set(title2, text2, icon2) { put(t, title2); put(s, text2); if (icon2) put(this.node.firstChild, icon2); } };
  };
  const warnBox = (html) => { const s = el('span'); s.innerHTML = html; return { node: el('div', { cls: 'warn' }, svg(ICON.warn), s), set(h) { if (s._h !== h) { s.innerHTML = h; s._h = h; } } }; };
  const skeleton = (rows = 4) => listCard(...Array.from({ length: rows }, (_, i) =>
    el('div', { cls: 'li' }, el('i', { cls: 'sk c' }), el('i', { cls: 'sk', style: `width:${[44, 58, 36, 50][i % 4]}%` }))));
  const livechip = () => el('span', { cls: 'livechip' });
  const hint = () => el('div', { cls: 'hint' });
  const pubnote = (text) => el('div', { cls: 'pubnote', text });

  // Toggle row: full-width switch with title + sub-line. get/set read and write the setting.
  function toggleRow({ title, sub, get, set }) {
    const cb = el('input', { type: 'checkbox', onchange: () => { set(cb.checked); hub.refresh(); } });
    const t = el('b', { text: title }), s = el('small', { text: sub || '' });
    const node = el('label', { cls: 'sw' }, el('span', {}, t, s), cb, el('i'));
    return {
      node, input: cb,
      update({ sub: sub2, disabled, reason, hot } = {}) {
        prop(cb, 'checked', !!get());
        prop(cb, 'disabled', !!disabled);
        cls(node, 'dis', !!disabled);
        cls(node, 'hot', !!hot);
        cls(s, 'why', !!reason);
        put(s, reason || sub2 || sub || '');
      },
    };
  }
  // Bare switch (used inside action rows). state: '' | 'on' | 'wait'
  function bareToggle(onChange) {
    const cb = el('input', { type: 'checkbox', onchange: () => { onChange(cb.checked); hub.refresh(); } });
    const node = el('label', { cls: 'tg' }, cb, el('i'));
    return { node, input: cb, update(on, wait, disabled) { prop(cb, 'checked', !!on); prop(cb, 'disabled', !!disabled); cls(node, 'wait', !!wait); } };
  }
  // Segmented control: options [{ value, label }]
  function seg(options, get, set) {
    const btns = options.map((o) => el('button', { type: 'button', text: o.label, onclick: () => { set(o.value); hub.refresh(); } }));
    const node = el('div', { cls: 'seg' }, btns);
    return { node, update(disabled) { const v = get(); btns.forEach((b, i) => { cls(b, 'on', options[i].value === v); prop(b, 'disabled', !!disabled); }); } };
  }
  // Slider: hidden native range over the designed track (works with touch + keyboard).
  function slider({ title, min, max, step = 1, get, set, fmt = (v) => v }) {
    const fill = el('b'), knob = el('u'), val = el('span', { cls: 'val' });
    const input = el('input', { type: 'range', min, max, step, oninput: () => { set(+input.value); paint(); }, onchange: () => hub.refresh() });
    const paint = () => {
      const v = get(), f = Math.max(0, Math.min(1, (v - min) / (max - min))) * 100 + '%';
      if (fill.style.width !== f) { fill.style.width = f; knob.style.left = f; }
      if (+input.value !== v) input.value = v;
      put(val, fmt(v));
    };
    const node = el('div', { cls: 'sl' }, el('b', { text: title }), el('div', { cls: 'rng' }, el('i', {}, fill), knob, input), val);
    return { node, update(disabled) { paint(); prop(input, 'disabled', !!disabled); cls(node, 'dis', !!disabled); } };
  }
  // Native select with the designed look; options are reconciled in place so an open menu survives.
  function select({ placeholder, get, set }) {
    const node = el('select', { onchange: () => { set(node.value); hub.refresh(); } });
    const ph = el('option', { value: '', text: placeholder || '—' });
    node.append(ph);
    return {
      node,
      update(options, disabled) { // options: [{ value, label, disabled }]
        keyed({ get children() { return [...node.options].slice(1); }, insertBefore: (n, ref) => node.insertBefore(n, ref || null), _rows: node._rows || (node._rows = new Map()) },
          options, (o) => o.value, (o) => el('option', { value: o.value }),
          (opt, o) => { put(opt, o.label); prop(opt, 'disabled', !!o.disabled); });
        const v = get() || '';
        if (node.value !== v) node.value = options.some((o) => o.value === v) ? v : '';
        cls(node, 'ph', !node.value);
        prop(node, 'disabled', !!disabled);
      },
    };
  }
  // Stat tiles: n = 3 or 5. set(i, value, small)
  function stats(labels) {
    const tiles = labels.map((k) => { const v = el('div', { cls: 'v' }); return { v, node: el('div', { cls: 'stat' }, el('div', { cls: 'k', text: k }), v) }; });
    const node = el('div', { cls: 'stats' + (labels.length === 5 ? ' s5' : '') }, tiles.map((t) => t.node));
    return { node, set(i, value, small) { const h = String(value) + (small ? `<small>${small}</small>` : ''); if (tiles[i].v._h !== h) { tiles[i].v.innerHTML = h; tiles[i].v._h = h; } } };
  }
  // Action row: name, cost, badges, sub-line, a "do once" button and an Auto switch.
  // update({ name, cost, badges:[{text, warm}], state:''|'on'|'wait'|'fired'|'dis', sub, subWhy,
  //          special, useLabel, useDisabled, auto, autoDisabled })
  function actionRow({ onUse, onAuto }) {
    // The name gets the full width (never cut off); cost + badges + status share the line below.
    const name = el('b', { cls: 'an' }), cost = el('span', { cls: 'cost' }), badges = el('span', { style: 'display:contents' });
    const sub = el('small', { cls: 'sub' });
    const use = el('button', { type: 'button', cls: 'mb', onclick: () => { onUse(); hub.refresh(); } });
    const tg = bareToggle(onAuto);
    const node = el('div', { cls: 'ar' }, el('div', { cls: 'nm' }, name, el('div', { cls: 'am' }, cost, badges, sub)), use, tg.node);
    return {
      node,
      update(o) {
        put(name, o.name);
        put(cost, o.cost == null ? '' : o.cost);
        const bk = JSON.stringify(o.badges || []);
        if (badges._k !== bk) { badges._k = bk; badges.replaceChildren(...(o.badges || []).map((b) => el('span', { cls: 'badge' + (b.warm ? ' warm' : ''), text: b.text, title: b.title || '' }))); }
        for (const s of ['on', 'wait', 'fired', 'dis']) cls(node, s, o.state === s);
        cls(node, 'special', !!o.special);
        cls(sub, 'why', !!o.subWhy);
        cls(sub, 'soft', o.subWhy === 'soft');
        put(sub, o.sub || '');
        put(use, o.useLabel || 'Use');
        prop(use, 'disabled', !!o.useDisabled);
        tg.update(o.auto, o.state === 'wait', o.autoDisabled);
      },
    };
  }
  // List row: leading avatar/icon, name (+ dim suffix), tags [{ text, tone:'a'|'b'|'w'|'' }].
  function listRow() {
    const av = el('span', { cls: 'av' }), nm = el('span', { cls: 'n' }), nmT = document.createTextNode(''), nmS = el('em');
    nm.append(nmT, nmS);
    const tags = el('span', { cls: 'tags' });
    const node = el('div', { cls: 'li' }, av, nm, tags);
    return {
      node,
      update(o) {
        put(av, o.icon || '');
        if (av.className !== 'av ' + (o.iconCls || '')) av.className = 'av ' + (o.iconCls || '');
        if (nmT.data !== o.name) nmT.data = o.name;
        put(nmS, o.suffix ? ' ' + o.suffix : '');
        cls(node, 'is-you', !!o.you);
        cls(node, 'is-out', !!o.out);
        const tk = JSON.stringify(o.tags || []);
        if (tags._k !== tk) { tags._k = tk; tags.replaceChildren(...(o.tags || []).map((t) => el('span', { cls: 'tag' + (t.tone ? ' ' + t.tone : ''), text: t.text }))); }
      },
    };
  }
  // Log feed, newest first. entries: [{ t, kind, text, confirms }] — `confirms` = this entry
  // confirms the one just below it. kinds: { kind: { icon, tone } }
  function logFeed(kinds, emptyText) {
    const list = listCard();
    const none = empty('📜', emptyText || 'Nothing yet', '');
    const fmt = (t) => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
    return {
      node: list,
      update(entries) {
        if (!entries.length) { setKids(list, [none.node]); return; }
        if (list.firstChild === none.node) none.node.remove();
        keyed(list, entries, (e) => e, (e) => {
          const k = kinds[e.kind] || { icon: '·' };
          return el('div', { cls: 'lg' }, el('time', { text: fmt(e.t) }), el('span', { cls: 'kd ' + (k.tone || ''), text: k.icon }), el('span', { cls: 'tx', text: e.text }));
        }, (row, e) => {
          cls(row, 'cf', !!e.confirms);
          const has = row.lastChild.className === 'cfm';
          if (e.confirms && !has) row.append(el('span', { cls: 'cfm', text: 'confirms ↓' }));
          if (!e.confirms && has) row.lastChild.remove();
        });
      },
    };
  }

  const ui = {
    el, svg, ICON, put, cls, show, prop, setKids, keyed,
    card, listCard, lbl, lblrow, note, why, btn, kv, empty, warnBox, skeleton, livechip, hint, pubnote,
    toggleRow, bareToggle, seg, slider, select, stats, actionRow, listRow, logFeed,
  };

  // ---------- panel chrome ----------
  const style = el('style', { text: (VCM_HUB_CSS + '\n' + opts.modes.map((m) => m.css || '').join('\n')) });
  const panel = el('div', { id: ROOT });
  const chip = el('span', { cls: 'chip' });
  const miniDot = el('i', { cls: 'dot' }), miniTxt = el('span');
  const mini = el('span', { cls: 'mini' }, miniDot, miniTxt);
  const minBtn = el('button', { type: 'button', cls: 'ic', title: 'Minimize (` hides)', 'aria-label': 'Minimize' }, svg(ICON.min));
  const closeBtn = el('button', { type: 'button', cls: 'ic', title: 'Turn off', 'aria-label': 'Close' }, svg(ICON.close));
  const head = el('div', { cls: 'hd' },
    el('div', { cls: 'wm' }, el('strong', { text: 'vibecode' }), 'mods', el('em', { text: '/' })),
    chip, el('span', { cls: 'sp' }), mini, minBtn, closeBtn);
  const stDot = el('i', { cls: 'dot' }), stTxt = el('b'), stWho = el('span', { cls: 'who' });
  const st = el('span', { cls: 'st' }, stDot, stTxt, stWho);
  const stripSlot = el('span', { cls: 'strip' });
  const meta = el('div', { cls: 'meta' }, st, stripSlot);
  const bannerSlot = el('div', { style: 'display:contents' });
  const pill = el('i', { cls: 'pill' });
  const tabsEl = el('div', { cls: 'tabs' });
  const body = el('div', { cls: 'body' });
  const toastEl = el('div', { cls: 'toast' });
  panel.append(head, meta, bannerSlot, tabsEl, body, toastEl);

  let toastTimer = 0;
  function toast(msg) {
    put(toastEl, msg);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // One-time dismissible banner (remembered per id).
  const banners = new Map();
  function banner(id, title, text) {
    if (saved.dismissed[id] || banners.has(id)) return;
    const b = el('div', { cls: 'banner' },
      el('span', {}, el('b', { text: title }), el('small', { text: text || '' })),
      el('button', { type: 'button', cls: 'ic', 'aria-label': 'Dismiss', onclick: () => { saved.dismissed[id] = 1; save(); b.remove(); } }, svg(ICON.close)));
    banners.set(id, b);
    bannerSlot.append(b);
  }

  // ---------- modes, tabs, screens ----------
  const hub = { ui, toast, banner, refresh: () => refresh(), onDestroy: (f) => cleanups.push(f), saved, save, opts };
  let active = null;      // active mode object
  let screen = '';        // 'mode' | 'wait' | 'no'
  let built = null;       // { mode, tabs:[{def, page}], settings }
  let current = '';       // current tab id

  const settingsDef = { id: 'settings', label: 'Settings', build: buildSettings };
  function buildSettings() {
    const op = slider({ title: 'Opacity', min: 40, max: 100, step: 5, get: () => Math.round(saved.opacity * 100), set: (v) => { saved.opacity = v / 100; applyOpacity(); save(); }, fmt: (v) => v + '%' });
    const kbd = el('span', { cls: 'v' }, el('kbd', { text: '`' }));
    const modeV = kv('Mode', '—');
    const modePart = active && active.settings ? active.settings(ui, hub) : null;
    const nodes = [
      lbl('Panel'), listCard(op.node),
      el('div', { cls: 'row' }, btn('Reset position', () => { delete saved.x; delete saved.y; panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.maxHeight = ''; save(); toast('Back in the corner'); })),
      lbl('Show / hide'),
      card(kv('Keyboard', kbd).node, kv('Touch or mouse', 'tap – in the header').node, kv('Turn off', 'click the bookmark again').node),
    ];
    if (modePart) nodes.push(lbl(active.name), ...modePart.nodes);
    nodes.push(lbl('About'), card(kv('Version', opts.version || '—').node, modeV.node));
    return { nodes, update() { op.update(); put(modeV.v, active ? active.name : '—'); if (modePart && modePart.update) modePart.update(); } };
  }

  function buildMode(mode) {
    panel.dataset.mode = mode.id;
    const defs = mode.tabs.concat(settingsDef);
    const tabs = defs.map((def) => ({ def, page: null, btn: el('button', { type: 'button', text: def.label, onclick: () => showTab(def.id) }) }));
    tabs.forEach((t) => cls(t.btn, 'pub', !!t.def.pub));
    tabsEl.replaceChildren(pill, ...tabs.map((t) => t.btn));
    tabsEl.style.setProperty('--n', tabs.length);
    pill.style.setProperty('--n', tabs.length);
    stripSlot.replaceChildren();
    const strip = mode.strip ? mode.strip(ui, hub) : null;
    if (strip) stripSlot.append(strip.node);
    built = { mode, tabs, strip };
    put(chip, mode.name);
    showTab(saved.tab[mode.id] && defs.some((d) => d.id === saved.tab[mode.id]) ? saved.tab[mode.id] : defs[0].id);
  }

  // First-use acknowledgement over the tabs that others can notice (pub).
  function ackPage(mode) {
    return { nodes: [el('div', { cls: 'card ack' }, el('div', { cls: 'cap', text: 'Before you start' }), el('p', { cls: 'tx', text: mode.ack }),
      btn('I understand', () => { saved.acked[mode.id] = 1; save(); const id = current; current = ''; showTab(id); }, true))], update() {} };
  }

  function showTab(id) {
    if (!built) return;
    const i = Math.max(0, built.tabs.findIndex((t) => t.def.id === id));
    const t = built.tabs[i];
    current = t.def.id;
    built.tabs.forEach((x, j) => cls(x.btn, 'on', j === i));
    pill.style.setProperty('--i', i);
    let page;
    if (t.def.pub && built.mode.ack && !saved.acked[built.mode.id]) page = t.ack || (t.ack = ackPage(built.mode));
    else {
      if (!t.page || t.page.isAck) t.page = t.def.id === 'settings' ? buildSettings() : t.def.build(ui, hub);
      page = t.page;
      if (t.def.pub && t.def.pubNote && !page._pub) { page._pub = 1; page.nodes.unshift(pubnote(t.def.pubNote)); }
    }
    body.replaceChildren(...page.nodes);
    body.scrollTop = 0;
    saved.tab[built.mode.id] = current;
    save();
    clamp();
    refresh();
  }

  // Shell screens: connecting (skeleton) and not supported (list of modes this hub knows).
  // Connecting = skeleton; a mode's waiting() info (e.g. "Enter the game code") replaces it.
  const waitSkel = skeleton(4), waitNote = note('Connecting to the game… this can take up to 25 seconds.');
  const waitInfo = empty('', '', '');
  const waitInfoCard = listCard(waitInfo.node);
  const waitPage = [waitInfoCard, waitSkel, waitNote];
  let waitMsg = null;
  const noCard = card(el('div', { cls: 'cap', text: 'Not supported here' }), el('p', { cls: 'tx', style: 'margin-top:6px', text: opts.unsupportedText || 'Open a supported game and click the bookmark again.' }));
  const noPage = [noCard, lbl('Works in'), listCard(...opts.modes.map((m) => el('div', { cls: 'li' }, el('span', { cls: 'av', text: m.icon || '🎮' }), el('span', { cls: 'n', text: m.name })))), note('More modes coming soon.')];
  function showScreen(kind) {
    if (screen === kind) return;
    screen = kind;
    built = null;
    current = '';
    delete panel.dataset.mode;
    stripSlot.replaceChildren();
    // Preview the first mode's tabs, disabled, so the panel doesn't jump when the game connects.
    const labels = ((opts.modes[0] && opts.modes[0].tabs) || []).map((t) => t.label).concat('Settings');
    tabsEl.replaceChildren(pill, ...labels.map((x) => el('button', { type: 'button', text: x })));
    tabsEl.style.setProperty('--n', labels.length); pill.style.setProperty('--n', labels.length); pill.style.setProperty('--i', 0);
    cls(tabsEl, 'off', true);
    show(tabsEl, kind === 'wait');
    put(chip, opts.site || 'Hub');
    body.replaceChildren(...(kind === 'wait' ? waitPage : noPage));
  }

  function pickMode() {
    let best = null, rank = 0;
    const order = { yes: 3, maybe: 2, wait: 1 };
    for (const m of opts.modes) {
      let d = 'no';
      try { d = m.detect(); } catch (e) {}
      if ((order[d] || 0) > rank) { rank = order[d]; best = { m, d }; }
    }
    return best;
  }

  function refresh() {
    if (!alive) return;
    const pick = pickMode();
    if (!pick) { showScreen('no'); active = null; }
    else if (pick.d === 'wait' && !(active && screen === 'mode' && active === pick.m)) { showScreen('wait'); active = null; }
    else if (active !== pick.m || screen !== 'mode') { active = pick.m; screen = 'mode'; cls(tabsEl, 'off', false); show(tabsEl, true); buildMode(active); }

    // still joining (code / name screen): the mode says what to do next
    waitMsg = null;
    if (screen === 'wait' && pick && pick.m.waiting) try { waitMsg = pick.m.waiting(); } catch (e) {}
    if (screen === 'wait') {
      show(waitInfoCard, !!waitMsg); show(waitSkel, !waitMsg); show(waitNote, !waitMsg);
      if (waitMsg) waitInfo.set(waitMsg.title, waitMsg.text, waitMsg.icon);
    }

    // status line + minimized readout
    let s = { dot: 'idle', text: screen === 'wait' ? (waitMsg && waitMsg.status) || 'Connecting…' : 'Not supported here', tone: screen === 'no' ? 'warn' : 'dim' };
    if (screen === 'no') s.dot = 'warn';
    if (screen === 'mode' && active.status) try { s = active.status() || s; } catch (e) {}
    stDot.className = 'dot' + (s.dot ? ' ' + s.dot : '');
    st.className = 'st' + (s.tone ? ' ' + s.tone : '');
    put(stTxt, s.text);
    put(stWho, s.who || '');
    stWho.title = s.who || '';
    miniDot.className = stDot.className;
    let mt = '';
    if (screen === 'mode' && active.mini) try { mt = active.mini() || ''; } catch (e) {}
    put(miniTxt, mt);

    const hidden = panel.style.display === 'none' || panel.classList.contains('min');
    if (hidden || screen !== 'mode' || !built) return;
    try { if (active.tick) active.tick(); } catch (e) {}
    try { if (built.strip) built.strip.update(); } catch (e) {}
    const t = built.tabs.find((x) => x.def.id === current);
    const page = t && (t.def.pub && built.mode.ack && !saved.acked[built.mode.id] ? null : t.page);
    try { if (page && page.update) page.update(); } catch (e) { if (opts.debug) console.warn(e); }
  }

  // ---------- window behaviour (same as STAX) ----------
  const applyOpacity = () => { panel.style.opacity = saved.opacity < 1 ? String(saved.opacity) : ''; };
  const clamp = () => {
    if (!panel.style.left) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(innerWidth - r.width, r.left)) + 'px';
    const top = Math.max(0, Math.min(innerHeight - 48, r.top));
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.max(120, innerHeight - top - 16) + 'px';
  };
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ic') || e.button > 0) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.style.right = 'auto';
    panel.classList.add('drag');
    let raf = 0, lx = 0, ly = 0;
    const move = (ev) => {
      lx = ev.clientX; ly = ev.clientY;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; panel.style.left = lx - dx + 'px'; panel.style.top = ly - dy + 'px'; });
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf); raf = 0;
      panel.classList.remove('drag'); clamp();
      saved.x = panel.style.left; saved.y = panel.style.top; save();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  addEventListener('resize', clamp);
  cleanups.push(() => removeEventListener('resize', clamp));

  const setMin = (on) => {
    cls(panel, 'min', on);
    minBtn.replaceChildren(svg(on ? ICON.restore : ICON.min));
    minBtn.setAttribute('aria-label', on ? 'Restore' : 'Minimize');
    saved.min = on; save(); refresh();
  };
  minBtn.onclick = () => setMin(!panel.classList.contains('min'));
  head.ondblclick = (e) => { if (!e.target.closest('.ic')) minBtn.onclick(); };

  // ` shows/hides. The only key the hub uses — Chromebooks have no Insert or F-keys.
  const onKey = (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '`' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
      refresh();
    }
  };
  addEventListener('keydown', onKey);
  cleanups.push(() => removeEventListener('keydown', onKey));

  // ---------- boot ----------
  for (const m of opts.modes) {
    try { if (m.install) m.install(hub); } catch (e) { console.warn('[vibecodemods] mode', m.id, 'failed to start', e); }
  }
  (document.head || document.documentElement).append(style);
  document.documentElement.append(panel);
  if (saved.x) { panel.style.left = saved.x; panel.style.top = saved.y; panel.style.right = 'auto'; clamp(); }
  applyOpacity();
  if (saved.min) setMin(true);
  refresh();
  const timer = setInterval(refresh, opts.refreshMs || 500);
  cleanups.push(() => clearInterval(timer));

  function destroy() {
    if (!alive) return;
    alive = false;
    cleanups.splice(0).reverse().forEach((f) => { try { f(); } catch (e) {} });
    clearTimeout(toastTimer);
    panel.remove();
    style.remove();
    if (window[opts.global] === api) delete window[opts.global];
  }
  closeBtn.onclick = destroy;
  const api = { destroy, hub, modes: opts.modes, get active() { return active; } };
  return api;
}

// ---- modes/tno.js
// Gimkit "Trust No One" (impostor mode) — engine + hub tabs.
//
// Engine (unchanged logic from trust-no-one/tno-reveal.js, live-verified 2026-10-04):
// 1) Role reveal: the Blueboat server sends IMPOSTER_MODE_PEOPLE (every player's real role) to ALL
//    clients and re-sends it whenever a client asks with IMPOSTER_MODE_REQUEST_PEOPLE. We ask on
//    inject and on every phase change, so mid-game injects work and ejections stay current.
// 2) Answer highlight: the current question object ships with `correct` flags on its answers.
// 3) Auto-answer (a toggle in the Answers tab): clicks the correct answer, then Continue; when the
//    question screen is away it falls back to sending QUESTION_ANSWERED directly.
// 4) Mission Control automation: every action is one IMPOSTER_MODE_PURCHASE {item, on?} frame. The
//    server tracks ⚡ itself (unaffordable = silently dropped), so we only fire what you can afford.
//    Teacher turned student meetings off → crewmates still get a "Forced meeting".
//
// Mode = classic (Blueboat), NOT Colyseus/Phaser: wss://<x>.gimkitconnect.com/blueboat (socket.io v2),
// binary frames = 0x04 + msgpack {type:2, data:[event, payload], nsp:"/"}.
// Debug handle: window.__vcmGimkit.modes[i].S (engine state) and .api (read getters).
VCM_MODES.push((() => {
  const S = {
    people: [], me: null, status: '', gameStatus: '', ws: null, room: null,
    auto: false,         // auto-answer
    highlight: true,     // green outline on the correct answer
    target: '',          // selected target player id
    on: {},              // { <shopItemId>: true } = that auto-action is armed
    lastAction: 0,
    actionEveryMs: 4000, // auto-action pace
    rr: 0,               // round-robin cursor over armed actions
    autoVote: false,
    votedFor: '',
    answerMs: 2000,      // auto-answer base delay per question
    jitter: 0.3,         // ±30% random spread on that delay
    log: [],             // newest-first: {t, kind, text}
    fired: {},           // { <itemId>: time the last purchase was sent } (UI "just fired")
    mode: 'unknown',     // 'tno' | 'other' | 'unknown'
    sawTno: false,
    phaseSince: Date.now(),
    startedAt: Date.now(),
    sendHooked: false,
    answerMode: '',      // '' | 'click' | 'direct'
    directAnswers: 0,
    onLog: null,         // UI hook: called with each new log entry
  };
  let alive = true;
  const cleanups = [];

  // Settings survive Play Again (it reloads the page). The target isn't saved — ids change per game.
  const PREF_KEY = 'vcm-tno-settings';
  const PREF_FIELDS = ['auto', 'highlight', 'on', 'autoVote', 'answerMs', 'jitter', 'actionEveryMs'];
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (saved) PREF_FIELDS.forEach((k) => { if (k in saved) S[k] = saved[k]; });
  } catch (e) {}
  let savedPrefs = '';
  function savePrefs() {
    const v = JSON.stringify(Object.fromEntries(PREF_FIELDS.map((k) => [k, S[k]])));
    if (v !== savedPrefs) { savedPrefs = v; try { localStorage.setItem(PREF_KEY, v); } catch (e) {} }
  }
  const LOG_MAX = 100;
  const addLog = (kind, text) => {
    const e = { t: Date.now(), kind, text };
    S.log.unshift(e);
    if (S.log.length > LOG_MAX) S.log.length = LOG_MAX;
    if (S.onLog) try { S.onLog(e); } catch (x) {}
  };
  const nameOf = (id) => (S.people.find((p) => p.id === id) || {}).name || 'someone';

  // --- minimal msgpack ---
  const td = new TextDecoder();
  const te = new TextEncoder();
  function decode(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let o = 0;
    const str = (n) => { const s = td.decode(u8.subarray(o, o + n)); o += n; return s; };
    const arr = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(read()); return a; };
    const map = (n) => { const m = {}; for (let i = 0; i < n; i++) { const k = read(); m[k] = read(); } return m; };
    const bin = (n) => { const b = u8.slice(o, o + n); o += n; return b; };
    const ext = (n) => { o += 1 + n; return undefined; };
    function read() {
      const b = u8[o++];
      if (b < 0x80) return b;
      if (b < 0x90) return map(b & 0x0f);
      if (b < 0xa0) return arr(b & 0x0f);
      if (b < 0xc0) return str(b & 0x1f);
      if (b >= 0xe0) return b - 0x100;
      let v;
      switch (b) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: v = u8[o]; o += 1; return bin(v);
        case 0xc5: v = dv.getUint16(o); o += 2; return bin(v);
        case 0xc6: v = dv.getUint32(o); o += 4; return bin(v);
        case 0xc7: v = u8[o]; o += 1; return ext(v);
        case 0xc8: v = dv.getUint16(o); o += 2; return ext(v);
        case 0xc9: v = dv.getUint32(o); o += 4; return ext(v);
        case 0xca: v = dv.getFloat32(o); o += 4; return v;
        case 0xcb: v = dv.getFloat64(o); o += 8; return v;
        case 0xcc: v = u8[o]; o += 1; return v;
        case 0xcd: v = dv.getUint16(o); o += 2; return v;
        case 0xce: v = dv.getUint32(o); o += 4; return v;
        case 0xcf: v = Number(dv.getBigUint64(o)); o += 8; return v;
        case 0xd0: v = dv.getInt8(o); o += 1; return v;
        case 0xd1: v = dv.getInt16(o); o += 2; return v;
        case 0xd2: v = dv.getInt32(o); o += 4; return v;
        case 0xd3: v = Number(dv.getBigInt64(o)); o += 8; return v;
        case 0xd4: return ext(1);
        case 0xd5: return ext(2);
        case 0xd6: return ext(4);
        case 0xd7: return ext(8);
        case 0xd8: return ext(16);
        case 0xd9: v = u8[o]; o += 1; return str(v);
        case 0xda: v = dv.getUint16(o); o += 2; return str(v);
        case 0xdb: v = dv.getUint32(o); o += 4; return str(v);
        case 0xdc: v = dv.getUint16(o); o += 2; return arr(v);
        case 0xdd: v = dv.getUint32(o); o += 4; return arr(v);
        case 0xde: v = dv.getUint16(o); o += 2; return map(v);
        case 0xdf: v = dv.getUint32(o); o += 4; return map(v);
      }
      throw new Error('msgpack byte 0x' + b.toString(16));
    }
    return read();
  }
  // Encoder covering what Blueboat client frames use (undefined = fixext1 type 0, like notepack).
  function encode(v, out = []) {
    if (v === undefined) out.push(0xd4, 0, 0);
    else if (v === null) out.push(0xc0);
    else if (v === true) out.push(0xc3);
    else if (v === false) out.push(0xc2);
    else if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= 0 && v < 0x80) out.push(v);
      else { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); out.push(0xcb, ...new Uint8Array(b.buffer)); }
    } else if (typeof v === 'string') {
      const s = te.encode(v);
      if (s.length < 32) out.push(0xa0 | s.length);
      else if (s.length < 256) out.push(0xd9, s.length);
      else out.push(0xda, s.length >> 8, s.length & 0xff);
      out.push(...s);
    } else if (Array.isArray(v)) {
      out.push(0x90 | v.length);
      v.forEach((x) => encode(x, out));
    } else {
      const ks = Object.keys(v);
      out.push(0x80 | ks.length);
      ks.forEach((k) => { encode(k, out); encode(v[k], out); });
    }
    return out;
  }

  function sendToRoom(key, data) {
    if (!alive || !S.ws || S.ws.readyState !== 1 || !S.room) return false;
    // The game omits `data` when there is no payload (e.g. REQUEST_PEOPLE) — match that exactly.
    const inner = data === undefined ? { room: S.room, key } : { room: S.room, key, data };
    const pkt = { type: 2, data: ['blueboat_SEND_MESSAGE', inner], options: { compress: true }, nsp: '/' };
    S.ws.send(new Uint8Array([0x04, ...encode(pkt)]));
    return true;
  }
  const requestPeople = () => sendToRoom('IMPOSTER_MODE_REQUEST_PEOPLE', undefined);
  const purchase = (item, on) => {
    const ok = sendToRoom('IMPOSTER_MODE_PURCHASE', on === undefined ? { item } : { item, on });
    const it = actionItems().find((x) => x.id === item);
    if (ok) { S.fired[item] = Date.now(); addLog('sent', `You sent ${it ? it.name : item}${on ? ' on ' + nameOf(on) : ''}`); }
    return ok;
  };
  const vote = (id) => { const ok = sendToRoom('IMPOSTER_MODE_VOTE', id); if (ok) addLog('vote', `You voted for ${nameOf(id)}`); return ok; };

  function onFrame(ws, ab) {
    const u8 = new Uint8Array(ab);
    if (u8[0] !== 0x04) return;
    let pkt;
    try { pkt = decode(u8.subarray(1)); } catch (e) { return; }
    if (!pkt || !Array.isArray(pkt.data)) return;
    const [event, msg] = pkt.data;
    if (typeof event === 'string' && event.startsWith('message-')) {
      const firstSighting = !S.room;
      S.ws = ws;
      S.room = event.slice(8);
      if (firstSighting && !S.people.length) setTimeout(requestPeople, 200);
    }
    if (!msg || !msg.key) return;
    // Other classic modes answer a roster request with an EMPTY list — that doesn't count as TNO.
    const tnoKey = /^IMPOSTER_MODE_/.test(msg.key) && !(msg.key === 'IMPOSTER_MODE_PEOPLE' && !(Array.isArray(msg.data) && msg.data.length));
    if (tnoKey || (msg.data && /^IMPOSTER_MODE_/.test(msg.data.type || ''))) { S.sawTno = true; S.mode = 'tno'; }
    if (msg.key === 'TOAST' && msg.data && msg.data.message) addLog(msg.data.type === 'success' ? 'result' : 'warn', msg.data.message);
    if (msg.key === 'SUCCESS_MODAL_INFO' && msg.data) addLog('result', [msg.data.title, msg.data.description].filter(Boolean).join(' '));
    if (msg.key === 'IMPOSTER_MODE_PEOPLE' && Array.isArray(msg.data)) {
      for (const p of msg.data) {
        const old = S.people.find((o) => o.id === p.id);
        if (!old) continue;
        if (p.votedOff && !old.votedOff) addLog('eject', `${p.name} was ejected (${p.role === 'imposter' ? 'impostor' : 'crewmate'})`);
        if (p.markedAsClear && !old.markedAsClear) addLog('clear', `${p.name} was marked clear`);
      }
      S.people = msg.data;
      const t = S.people.find((p) => p.id === S.target);
      if (S.target && (!t || t.votedOff)) { addLog('target', `${t ? t.name : 'Your target'} was ejected. Pick a new target`); S.target = ''; }
      resolveSelf();
    } else if (msg.key === 'STATE_UPDATE' && msg.data) {
      if (msg.data.type === 'IMPOSTER_MODE_PERSON') S.me = msg.data.value;
      else if (msg.data.type === 'GAME_QUESTIONS' && Array.isArray(msg.data.value)) msg.data.value.forEach(cacheQ);
      else if (msg.data.type === 'GAME_STATUS') {
        S.gameStatus = msg.data.value;
        if (S.gameStatus === 'results') addLog('phase', 'Game over: ' + winner());
      } else if (msg.data.type === 'IMPOSTER_MODE_STATUS' && msg.data.value !== S.status) {
        S.status = msg.data.value;
        S.phaseSince = Date.now();
        const label = { questions: 'Back to questions', discussion: 'Meeting called', voting: 'Voting started', votingResult: 'Voting finished' }[S.status];
        if (label) addLog('phase', label);
        setTimeout(requestPeople, 300);
        setTimeout(requestPeople, 3000);
      }
    }
  }

  // --- hooks (installed at boot so the lobby socket and liftoff roster are caught) ---
  function installHooks() {
    // Incoming without the socket instance: consumers read MessageEvent.data; `this.target` is the WS.
    const desc = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
    const seen = new WeakSet();
    const ourGet = function () {
      const d = desc.get.call(this);
      if (!alive) return d;
      try {
        if (this.target instanceof WebSocket && d instanceof ArrayBuffer && !seen.has(this)) {
          seen.add(this);
          onFrame(this.target, d);
        }
      } catch (e) {}
      return d;
    };
    Object.defineProperty(MessageEvent.prototype, 'data', { configurable: true, enumerable: desc.enumerable, get: ourGet });
    // Restore only if nobody hooked on top of us since; otherwise stay a pass-through (alive=false).
    cleanups.push(() => {
      const cur = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data');
      if (cur && cur.get === ourGet) Object.defineProperty(MessageEvent.prototype, 'data', desc);
    });
    // Learn the socket from the next outgoing frame too (pings every ~25s on idle screens). Another
    // script may lock WebSocket.prototype.send; then we run incoming-only (still works).
    const origSend = WebSocket.prototype.send;
    const ourSend = function () {
      if (alive && !S.ws && /gimkitconnect/.test(this.url)) { S.ws = this; bootstrap(); }
      return origSend.apply(this, arguments);
    };
    try { WebSocket.prototype.send = ourSend; } catch (e) {}
    S.sendHooked = WebSocket.prototype.send === ourSend;
    cleanups.push(() => { if (WebSocket.prototype.send === ourSend) try { WebSocket.prototype.send = origSend; } catch (e) {} });
  }

  // --- React helpers ---
  function fiberOf(el) { const k = Object.keys(el).find((k) => k.startsWith('__reactFiber$')); return k && el[k]; }
  function reactRoot() {
    const el = [...document.querySelectorAll('body *')].find((e) => !e.closest('#vcm-hub') && fiberOf(e));
    let f = el && fiberOf(el);
    while (f && f.return) f = f.return;
    return f;
  }
  // Walk the WHOLE fiber tree — joinDetails/user/the MobX stores live on side branches.
  function dfs(visit) {
    let steps = 0;
    (function rec(f, depth) {
      if (!f || depth > 600 || steps > 9000) return;
      steps++;
      if (visit(f)) return;
      rec(f.child, depth + 1);
      rec(f.sibling, depth);
    })(reactRoot(), 0);
  }
  function roomFromReact() {
    let found = null;
    dfs((f) => { const jd = f.memoizedProps && f.memoizedProps.joinDetails; if (jd && typeof jd.roomId === 'string') { found = jd.roomId; return true; } });
    return found;
  }
  function ownName() {
    let found = null;
    dfs((f) => { const u = f.memoizedProps && f.memoizedProps.user; if (u && typeof u.name === 'string') { found = u.name; return true; } });
    return found;
  }
  let _myName = '', _myNameAt = 0;
  function myName() {
    if (S.me && S.me.name) return S.me.name;
    if (!_myName && Date.now() - _myNameAt > 3000) { _myNameAt = Date.now(); _myName = ownName() || ''; }
    return _myName;
  }
  // Prefer IMPOSTER_MODE_PERSON (by id); fall back to a unique display-name match.
  function resolveSelf() {
    if (S.me && S.me.id) return;
    const nm = ownName();
    if (!nm) return;
    const matches = S.people.filter((p) => p.name === nm);
    if (matches.length === 1) S.me = { id: matches[0].id, name: nm, role: matches[0].role, byName: true };
  }

  // --- MobX store access ---
  const deref = (v) => (v && typeof v === 'object' && 'value_' in v) ? v.value_ : v;
  let _stores = null;
  let _storesMiss = 0;
  function stores() {
    if (_stores && _stores.imposter) return _stores;
    if (Date.now() - _storesMiss < 2000) return null; // not in a game yet: don't walk React every tick
    _storesMiss = Date.now();
    dfs((f) => { const p = f.memoizedProps; if (p && typeof p === 'object' && p.imposter && p.balance && p.navigation) { _stores = p; return true; } });
    return _stores;
  }
  const balanceVal = () => { const s = stores(); return s ? (deref(s.balance.balance) || 0) : 0; };
  const invLeft = () => { const s = stores(); return s ? (deref(s.imposter.investigationsLeft) ?? 0) : 0; };
  const meetLeft = () => { const s = stores(); return s ? (deref(s.imposter.meetingsLeft) ?? 0) : 0; };
  const myRole = () => { const s = stores(); const me = s && deref(s.imposter.me); return (me && me.role) || (S.me && S.me.role) || '?'; };
  const amEliminated = () => { const s = stores(); const me = s && deref(s.imposter.me); return !!(me && me.votedOff); };
  function shopItems() {
    const s = stores();
    if (!s) return [];
    const si = s.imposter.shopItems;
    return Array.isArray(si) ? si : (si && si.slice ? [...si] : []);
  }
  // Student meetings off only drops Meeting from the shop list; the server still accepts it.
  const FORCED_MEETING = { id: 'meeting', name: 'Forced meeting', cost: 10, forced: true };
  const canForceMeeting = () => {
    const items = shopItems();
    return items.length > 0 && !amEliminated() && myRole() === 'detective' && !items.some((i) => i.id === 'meeting');
  };
  const actionItems = () => (canForceMeeting() ? shopItems().concat(FORCED_MEETING) : shopItems());
  const NO_TARGET = new Set(['meeting', 'blendIn']);
  const USES_INVESTIGATION = new Set(['privateInvestigation', 'publicInvestigation']);

  function bootstrap() {
    if (!S.room) S.room = roomFromReact();
    if (S.ws && S.room && !S.people.length && S.mode !== 'other') requestPeople();
  }
  let liveSince = 0;
  // 'join' = lobby, 'gameplay', 'results'. The socket value wins; the store has it on a late inject.
  const gameStatusNow = () => { if (S.gameStatus) return S.gameStatus; const s = stores(); return (s && s.gameValues && deref(s.gameValues.gameStatus)) || ''; };
  const gameLive = () => gameStatusNow() === 'gameplay';
  // The game's own options name the mode: specialGameType ['IMPOSTER'] = Trust No One. Readable the
  // moment you're in a game (lobby included), before any socket traffic. Verified live 2026-10-04.
  function specialType() {
    const s = stores(); const go = s && deref(s.gameOptions);
    if (!go || !go.type) return null; // options not loaded yet
    const t = deref(go.specialGameType);
    return t ? (Array.isArray(t) ? [...t] : Object.values(t)).map(String) : [];
  }
  // Which pre-game screen is showing: 'code' (enter the game code), 'name' (type a name),
  // 'nickname' (teacher turned on the nickname generator: read-only name + Join), or '' (none).
  // Some setups skip naming and drop you straight into the lobby; that path just never shows 'name'.
  function preGameScreen() {
    if (S.ws || gameStatusNow()) return '';
    const inputs = [...document.querySelectorAll('input')].filter((e) => !e.closest('#vcm-hub') && e.offsetParent !== null);
    if (inputs.some((e) => /game code/i.test(e.placeholder))) return 'code';
    if (inputs.some((e) => /name/i.test(e.placeholder))) return 'name';
    if (inputs.some((e) => e.readOnly && e.type === 'text') && /nickname/i.test(document.body.innerText)) return 'nickname';
    return '';
  }
  function detectMode() {
    if (S.mode === 'tno') return;
    const st = specialType();
    if (S.sawTno || shopItems().length || (st && st.includes('IMPOSTER'))) { S.mode = 'tno'; return; }
    if (st) { S.mode = 'other'; return; }
    if (!gameLive() || !S.ws) { liveSince = 0; return; }
    if (!liveSince) liveSince = Date.now();
    if (Date.now() - liveSince > 8000) S.mode = 'other';
  }
  function winner() { return S.people.some((p) => p.role === 'imposter' && !p.votedOff) ? 'Impostors win' : 'Crewmates win'; }

  // --- answers ---
  function currentQuestion() {
    const start = document.querySelector('span.notranslate');
    if (!start) return null;
    let f = fiberOf(start), i = 0;
    while (f && i < 80) {
      let h = f.memoizedState, j = 0;
      while (h && j < 60) {
        const v = h.memoizedState;
        if (Array.isArray(v) && v[0] && Array.isArray(v[0].answers) && v[0].text !== undefined) return v[0];
        h = h.next; j++;
      }
      f = f.return; i++;
    }
    return null;
  }
  // Answer/continue buttons ignore synthetic DOM clicks; call the React onClick prop instead.
  function reactClick(el) {
    let f = fiberOf(el), i = 0;
    while (f && i < 15) {
      const p = f.memoizedProps;
      if (p && typeof p.onClick === 'function') { p.onClick({ preventDefault() {}, stopPropagation() {} }); return true; }
      f = f.return; i++;
    }
    return false;
  }
  const leaf = (t) => [...document.querySelectorAll('button,div,span')].find((e) => e.children.length === 0 && e.textContent.trim() === t && !e.closest('#vcm-hub'));
  const answerSpan = (t) => [...document.querySelectorAll('span.notranslate')].find((e) => e.textContent.trim() === String(t).trim());
  function answerBox(span) {
    for (let el = span; el && el !== document.body; el = el.parentElement) {
      const p = fiberOf(el) && fiberOf(el).memoizedProps;
      if (p && typeof p.onClick === 'function') return el;
    }
    return span;
  }

  let marked = null;
  function highlightTick() {
    let box = null;
    if (S.highlight) {
      const q = currentQuestion();
      const c = q && q.answers.find((a) => a.correct);
      const span = c && answerSpan(c.text);
      box = span && answerBox(span);
    }
    if (box === marked) return;
    if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; }
    marked = box || null;
    if (marked) { marked.style.outline = '4px solid #56d364'; marked.style.outlineOffset = '-6px'; }
  }
  cleanups.push(() => { if (marked) { marked.style.outline = ''; marked.style.outlineOffset = ''; marked = null; } });
  let nextAnswerAt = 0;
  const jittered = () => S.answerMs * (1 + (Math.random() * 2 - 1) * S.jitter);

  // Direct-answer fallback (question screen away): send QUESTION_ANSWERED ourselves at the same pace.
  const qCache = new Map();
  const cacheQ = (q) => { if (q && q._id && Array.isArray(q.answers) && q.answers.some((a) => a.correct)) qCache.set(q._id, q); };
  const phaseNow = () => { const s = stores(); return (s && deref(s.imposter.status)) || S.status; };
  const questionCount = () => { const s = stores(); const l = s && s.questions && deref(s.questions.questionList); return (l && l.length) || qCache.size; };
  let offScreenSince = 0, directCursor = -1;
  function nextDirectQuestion() {
    const s = stores();
    const list = (s && s.questions && deref(s.questions.questionList)) || [];
    const ids = list.length ? list : [...qCache.keys()];
    if (directCursor < 0) directCursor = (s && s.questions && deref(s.questions.currentQuestionIndex)) || 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[(directCursor + i) % ids.length];
      if (qCache.has(id)) { directCursor = (directCursor + i + 1) % ids.length; return qCache.get(id); }
    }
    return null;
  }
  function directAnswer() {
    const q = nextDirectQuestion();
    const c = q && q.answers.find((a) => a.correct);
    if (!c) return false;
    const ok = sendToRoom('QUESTION_ANSWERED', { questionId: q._id, answer: q.type === 'text' ? c.text : c._id });
    if (ok) S.directAnswers++;
    return ok;
  }
  function autoTick() {
    const q = currentQuestion();
    cacheQ(q);
    if (!S.auto) { offScreenSince = 0; S.answerMode = ''; return; }
    const now = Date.now();
    const cont = leaf('Continue');
    const c = q && q.answers.find((a) => a.correct);
    const span = c && answerSpan(c.text);
    if (cont || span) { offScreenSince = 0; directCursor = -1; S.answerMode = 'click'; }
    else if (!offScreenSince) offScreenSince = now;
    if (now < nextAnswerAt) return;
    if (cont) { reactClick(cont); nextAnswerAt = now + jittered(); return; }
    if (span) { reactClick(span); nextAnswerAt = now + 350 + Math.random() * 300; return; }
    if (offScreenSince && now - offScreenSince > 2500 && phaseNow() === 'questions' && S.gameStatus !== 'results') {
      if (directAnswer()) { S.answerMode = 'direct'; nextAnswerAt = now + jittered(); }
    }
  }

  // --- Mission Control engine ---
  const CREW_ITEMS = ['privateInvestigation', 'publicInvestigation', 'noteViewer', 'meeting'];
  const IMP_ITEMS = ['investigationRemover', 'fakeInvestigation', 'clearListRemover', 'blendIn'];
  function blockReason(id) {
    const items = actionItems();
    const it = items.find((x) => x.id === id);
    if (S.gameStatus === 'results') return 'Game over';
    if (!it) {
      if (amEliminated()) return "You're eliminated: only Donate is available";
      if (id === 'donate') return "Only after you're voted out";
      if (CREW_ITEMS.includes(id) && myRole() === 'imposter') return 'Crewmate-only';
      if (IMP_ITEMS.includes(id) && myRole() === 'detective') return 'Impostor-only';
      return 'Not available right now';
    }
    if (id === 'meeting' && meetLeft() <= 0) return 'No meetings left';
    if (USES_INVESTIGATION.has(id) && invLeft() <= 0) return 'No investigations left';
    const bal = balanceVal();
    if (id === 'donate' && bal <= 0) return 'Nothing to donate yet';
    if (id !== 'donate' && bal < (it.cost || 0)) return `Need ⚡${(it.cost || 0) - bal} more`;
    if (!NO_TARGET.has(id) && !targetLive()) return 'Pick a target first';
    return '';
  }
  function targetLive() {
    const t = S.people.find((p) => p.id === S.target);
    return !!(t && !t.votedOff && !(S.me && S.me.id === t.id));
  }
  function queue() {
    const armed = actionItems().filter((it) => it && S.on[it.id]);
    if (!armed.length) return [];
    const k = S.rr % armed.length;
    return armed.slice(k).concat(armed.slice(0, k));
  }
  function doOnce(id) {
    const r = blockReason(id);
    if (r) { addLog('warn', r); return r; }
    if (NO_TARGET.has(id)) purchase(id); else purchase(id, S.target);
    return '';
  }
  function autoActionTick() {
    if (!S.ws || S.ws.readyState !== 1 || !S.room || S.gameStatus === 'results') return;
    const now = Date.now();
    if (S.on.donate && amEliminated() && !blockReason('donate')) { purchase('donate', S.target); S.lastAction = now; return; }
    if (now - S.lastAction < S.actionEveryMs) return;
    const armed = actionItems().filter((it) => it && S.on[it.id]);
    for (let i = 0; i < armed.length; i++) {
      const idx = (S.rr + i) % armed.length;
      const it = armed[idx];
      if (blockReason(it.id)) continue;
      if (NO_TARGET.has(it.id)) purchase(it.id); else purchase(it.id, S.target);
      S.rr = idx + 1;
      S.lastAction = now;
      return;
    }
  }
  function autoVoteTick() {
    if (S.status !== 'voting') { S.votedFor = ''; return; }
    if (!S.autoVote || !targetLive() || amEliminated() || S.votedFor === S.target) return;
    if (vote(S.target)) S.votedFor = S.target;
  }

  const stats = () => {
    const s = stores(); if (!s || !s.questions) return null;
    const c = deref(s.questions.questionsAnsweredCorrectly) || 0, w = deref(s.questions.questionsAnsweredIncorrectly) || 0;
    return { correct: c, incorrect: w, total: c + w, accuracy: c + w ? c / (c + w) : 0, streak: deref(s.balance.streakAmount) || 0 };
  };
  const api = {
    balance: balanceVal, investigationsLeft: invLeft, meetingsLeft: meetLeft, role: myRole,
    eliminated: amEliminated, shopItems, stats, currentQuestion, questionCount,
    impostorsLeft: () => S.people.filter((p) => p.role === 'imposter' && !p.votedOff).length,
    phase: phaseNow,
    gameCode: () => { const s = stores(); return new URLSearchParams(location.search).get('gc') || (s && s.gameValues && deref(s.gameValues.gameCode)) || null; },
    connected: () => !!(S.ws && S.ws.readyState === 1 && S.room),
    live: gameLive,
    mode: () => S.mode,
    answerMode: () => S.answerMode,
    directAnswers: () => S.directAnswers,
    knownQuestions: () => qCache.size,
    gameOver: () => S.gameStatus === 'results',
    lobby: () => gameStatusNow() === 'join',
    preGameScreen,
    winner,
    stalled: () => S.status === 'votingResult' && S.gameStatus !== 'results' && Date.now() - S.phaseSince > 60000,
    votingFor: () => (S.status === 'voting' ? Math.round((Date.now() - S.phaseSince) / 1000) : 0),
    studentMeetingsOff: canForceMeeting,
    actionItems, blockReason, queue, targetLive,
    otherScripts: () => [
      window.stores && window.stores.assignment && 'Gimkit Cheat (TheLazySquid)',
      !/\[native code\]/.test(String(Object.freeze)) && 'gimkit cheats (MOD MENU)',
    ].filter(Boolean),
  };

  // =================================================================== hub UI
  const CATALOGUE = {
    detective: [
      { id: 'privateInvestigation', name: 'Private Investigation', cost: 7 },
      { id: 'publicInvestigation', name: 'Public Investigation', cost: 15 },
      { id: 'noteViewer', name: 'Note Look', cost: 7 },
      { id: 'meeting', name: 'Meeting', cost: 10 },
    ],
    imposter: [
      { id: 'investigationRemover', name: 'Investigation Remover', cost: 10 },
      { id: 'fakeInvestigation', name: 'Fake Investigation', cost: 6 },
      { id: 'clearListRemover', name: 'Unclear', cost: 15 },
      { id: 'blendIn', name: 'Disguise', cost: 15 },
    ],
  };
  const DONATE = { id: 'donate', name: 'Donate', cost: null };
  // A blocked row that you can still arm (Auto waits for it) vs one that can't happen at all.
  const SOFT = /^(Need ⚡|Pick a target|Nothing to donate)/;
  const isTno = () => S.mode === 'tno';
  // Lobby = the game hasn't started. In a running game with no roster yet (fresh mid-game inject) we
  // still show the game UI; only the roster-dependent bits wait for it.
  const inLobby = () => { const g = gameStatusNow(); return g === 'join' || (!g && !S.people.length); };
  const fmtClock = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function rosterRows() {
    // Impostors first; duplicate names get a dim "#2"; "(you)" only when we know which one is you.
    const sorted = S.people.slice().sort((a, b) => (a.role === 'imposter' ? 0 : 1) - (b.role === 'imposter' ? 0 : 1) || (a.votedOff ? 1 : 0) - (b.votedOff ? 1 : 0));
    const seenNames = {};
    return sorted.map((p) => {
      const n = (seenNames[p.name] = (seenNames[p.name] || 0) + 1);
      return { p, dup: S.people.filter((x) => x.name === p.name).length > 1 ? n : 0 };
    });
  }

  const mode = {
    id: 'tno',
    name: 'Trust No One',
    icon: '🔪',
    ack: 'Actions and answers are visible to other players and the teacher.',
    css: `
[data-mode="tno"]{--tone-a:#ff7a70;--tone-b:#56d364;--accent-warm:#ffb547}
[data-mode="tno"] .av.imp{background:color-mix(in srgb,var(--tone-a) 16%,transparent)}
[data-mode="tno"] .av.crew{background:color-mix(in srgb,var(--tone-b) 14%,transparent)}
[data-mode="tno"] .av.out{background:var(--s2)}
[data-mode="tno"] .ar.special{background:linear-gradient(90deg,rgba(255,181,71,.11),rgba(255,181,71,.015) 80%)}
[data-mode="tno"] .ar.special .t>b{color:#ffe2b3}
[data-mode="tno"] .big.energy{color:var(--accent-warm)}
[data-mode="tno"] .role{display:flex;align-items:center;gap:8px;font-weight:600}`,

    install(hub) {
      if (window.__tnoReveal && window.__tnoReveal.destroy) window.__tnoReveal.destroy(); // the old stand-alone tool
      installHooks();
      let ticks = 0;
      const loop = setInterval(() => {
        try {
          highlightTick();
          autoTick();
          autoActionTick();
          autoVoteTick();
          detectMode();
          ticks++;
          if (!S.people.length && S.mode !== 'other' && ticks % 8 === 0) bootstrap();
          if (S.people.length && !S.me) resolveSelf();
          savePrefs();
        } catch (e) {}
      }, 250);
      cleanups.push(() => clearInterval(loop));
      S.onLog = (e) => { if (e.kind === 'target') hub.toast(e.text); };
      bootstrap();
      hub.onDestroy(() => { alive = false; cleanups.splice(0).forEach((f) => { try { f(); } catch (e) {} }); });
    },

    detect() {
      if (!/(^|\.)gimkit\.com$/.test(location.hostname)) return 'no';
      if (S.mode === 'other') return 'no';
      if (preGameScreen()) { S.startedAt = Date.now(); return 'wait'; } // still joining; the 30 s clock starts after
      if (S.mode === 'tno') return 'yes';
      if (S.ws || stores()) return 'maybe'; // in a game, mode not known yet
      return Date.now() - S.startedAt > 30000 ? 'no' : 'wait';
    },

    // Shown by the shell in place of the Connecting skeleton while you're still joining.
    waiting() {
      const scr = preGameScreen();
      if (scr === 'code') return { status: 'Enter a game code', icon: '🔢', title: 'Enter the game code', text: "It's on your teacher's screen. The hub connects by itself once you're in." };
      if (scr === 'name') return { status: 'Choose your name', icon: '✏️', title: 'Pick your name', text: 'Press Join and the hub connects by itself.' };
      if (scr === 'nickname') return { status: 'Nickname picked for you', icon: '🎲', title: 'Random nicknames are on', text: 'Keep this one or re-roll it, then press Join.' };
      return null;
    },

    // Status line + your in-game name (from the roster once we know which row is you, else the
    // name Gimkit shows you; looked up once, then cached).
    status() {
      const s = this.phaseStatus();
      if (s && (S.ws || gameStatusNow())) s.who = myName();
      return s;
    },
    phaseStatus() {
      if (S.gameStatus === 'results') return { dot: 'done', text: 'Game over · ' + winner() };
      if (gameStatusNow() === 'join') return { dot: 'idle', text: 'In the lobby · waiting for the host', tone: 'dim' };
      if (!isTno()) return S.ws || gameStatusNow() ? { dot: 'idle', text: 'Waiting to start', tone: 'dim' } : { dot: 'idle', text: 'Connecting…', tone: 'dim' };
      if (api.stalled()) return { dot: 'warn', text: 'Stalled', tone: 'warn' };
      if (amEliminated()) return { dot: 'idle', text: '👻 Eliminated', tone: 'dim' };
      const ph = phaseNow();
      if (ph === 'discussion') return { dot: 'live', text: 'Meeting' };
      if (ph === 'voting') return { dot: 'live', text: 'Voting · ' + fmtClock(api.votingFor()) };
      if (ph === 'votingResult') return { dot: 'live', text: 'Results' };
      return { dot: 'live', text: 'In game' };
    },

    mini() { return isTno() ? '⚡ ' + balanceVal() : ''; },

    strip(ui) {
      const { el, put, show } = ui;
      const role = el('span'), energy = el('span', { cls: 'tw' }), imps = el('span', { title: 'Impostors left' }),
        inv = el('span', { title: 'Investigations left (shared)' }), meet = el('span', { title: 'Meetings left' });
      const node = el('span', { style: 'display:contents' }, role, energy, imps, inv, meet);
      return {
        node,
        update() {
          const on = isTno() && (S.people.length > 0 || gameLive());
          [role, energy, imps, inv, meet].forEach((n) => show(n, on));
          if (!on) return;
          const r = myRole(), dead = amEliminated();
          put(role, dead ? '👻' : r === 'imposter' ? '🔪' : r === 'detective' ? '🔍' : '?');
          role.className = r === 'imposter' ? 'ta' : r === 'detective' ? 'tb' : 'tn';
          role.title = r === 'imposter' ? 'You: Impostor' : r === 'detective' ? 'You: Crewmate' : '';
          put(energy, '⚡ ' + balanceVal());
          show(imps, !dead && S.people.length > 0); show(inv, !dead); show(meet, !dead);
          put(imps, '🔪' + api.impostorsLeft());
          put(inv, '🔎' + invLeft());
          put(meet, '📣' + meetLeft());
        },
      };
    },

    tick() {
      const others = api.otherScripts();
      if (others.length) this._hub.banner('tno-other-' + others[0], 'Another Gimkit cheat is running', `(${others.join(', ')}) Turn off its auto-answer so answers aren't sent twice.`);
    },

    tabs: [
      // ---------------------------------------------------------------- Roles
      {
        id: 'roles', label: 'Roles',
        build(ui) {
          const { el, put, show, keyed } = ui;
          const you = el('div', { cls: 'card' });
          const youRole = el('div', { cls: 'role' });
          you.append(el('div', { cls: 'cap', text: 'You are' }), youRole);
          const leftN = el('b'), count = ui.lbl('Players');
          const head = ui.lblrow(count, el('span', { cls: 'note' }, leftN, ' impostors left'));
          const list = ui.listCard();
          const wait = ui.empty('🚀', 'Waiting for liftoff', 'Roles appear when the game starts.');
          const conn = ui.skeleton(4);
          const waitCard = ui.listCard(wait.node);
          return {
            nodes: [you, head, list, waitCard, conn],
            update() {
              const have = S.people.length > 0;
              show(you, have); show(head, have); show(list, have);
              const lob = gameStatusNow() === 'join' || (!gameStatusNow() && !!S.ws);
              show(waitCard, !have && lob); show(conn, !have && !lob);
              if (!have) return;
              const r = myRole(), dead = amEliminated();
              put(youRole, (dead ? '👻 ' : '') + (r === 'imposter' ? '🔪 Impostor' : r === 'detective' ? '🔍 Crewmate' : 'Not sure yet'));
              youRole.className = 'role ' + (r === 'imposter' ? 'ta' : r === 'detective' ? 'tb' : 'tn');
              put(count, 'Players · ' + S.people.length);
              put(leftN, api.impostorsLeft());
              keyed(list, rosterRows(), (x) => x.p.id, () => ui.listRow(), (row, { p, dup }) => {
                const imp = p.role === 'imposter', self = !!(S.me && S.me.id === p.id);
                const tags = [];
                if (p.votedOff) tags.push({ text: 'Ejected' });
                if (p.markedAsClear) tags.push({ text: 'Clear', tone: 'b' });
                if (S.target === p.id) tags.push({ text: 'Target', tone: 'w' });
                row.update({
                  icon: imp ? '🔪' : '🔍', iconCls: p.votedOff ? 'out' : imp ? 'imp' : 'crew',
                  name: p.name, suffix: [dup ? '#' + dup : '', self ? '(you)' : ''].filter(Boolean).join(' '),
                  tags, you: self, out: p.votedOff,
                });
              });
            },
          };
        },
      },
      // ---------------------------------------------------------------- Actions
      {
        id: 'actions', label: 'Actions', pub: true, pubNote: 'Other players can notice these',
        build(ui) {
          const { el, put, show, keyed } = ui;
          const bal = el('div', { cls: 'big energy' });
          const pick = ui.select({ placeholder: '— nobody —', get: () => S.target, set: (v) => { S.target = v; } });
          const pickWhy = ui.why('', true);
          const top = ui.card(el('div', { cls: 'cap', text: 'Energy' }), bal, el('div', { cls: 'col' }, ui.lbl('Target'), pick.node, pickWhy));
          top.querySelector('.lbl').style.margin = '0 2px';
          const lobby = ui.listCard(ui.empty('🚀', 'Waiting for liftoff', 'Actions unlock when the game starts.').node);
          const over = ui.warnBox('');
          const next = el('div', { cls: 'next' });
          const lblMine = ui.lbl('Your actions'), mine = ui.listCard();
          const lblOther = ui.lbl('Other role'), other = ui.listCard();
          const hint = ui.hint();
          const vote = ui.toggleRow({ title: 'Auto-vote the target', sub: 'During meetings: votes once, re-votes only if you change target', get: () => S.autoVote, set: (v) => { S.autoVote = v; } });
          const voteCard = ui.listCard(vote.node);
          const rowFor = (it) => ui.actionRow({
            onUse: () => { const r = doOnce(it.id); if (r) mode._hub.toast(r); },
            onAuto: (on) => { S.on[it.id] = on; },
          });
          const rowState = (it) => {
            const live = actionItems().find((x) => x.id === it.id) || (it.id === 'meeting' && canForceMeeting() ? FORCED_MEETING : null);
            const meta = live || it;
            const r = blockReason(it.id);
            const hard = !!r && !SOFT.test(r);
            const armed = !!S.on[it.id];
            const recent = S.fired[it.id] && Date.now() - S.fired[it.id] < 3000;
            const forced = !!(live && live.forced);
            const target = !NO_TARGET.has(it.id);
            const badges = [];
            if (target) badges.push({ text: '◎', title: 'Needs a target' });
            if (forced) badges.push({ text: '⚑', warm: true, title: 'Teacher turned these off' });
            let state = '', sub = 'Off', subWhy = '';
            if (hard) { state = 'dis'; sub = r; subWhy = 'soft'; }
            else if (recent) { state = 'fired'; sub = 'Sent · just now'; }
            else if (armed && r) { state = 'wait'; sub = 'Armed · ' + r[0].toLowerCase() + r.slice(1); }
            else if (armed) { state = 'on'; sub = 'Auto on · ready'; }
            else if (r) { sub = r; subWhy = 'hard'; }
            else if (forced) sub = 'Teacher turned meetings off';
            else if (it.id === 'donate') sub = 'Give all your ⚡ to the target';
            return {
              name: meta.name, cost: meta.cost == null ? '' : '⚡' + meta.cost, badges, state, sub, subWhy, special: forced,
              useLabel: recent ? 'Sent' : 'Do once', useDisabled: !!r, auto: armed, autoDisabled: hard && !armed,
            };
          };
          return {
            nodes: [lobby, top, over.node, next, lblMine, mine, lblOther, other, hint, voteCard],
            update() {
              const lob = inLobby();
              show(lobby, lob);
              [top, lblMine, mine, lblOther, other, voteCard].forEach((n) => show(n, !lob));
              const gameOver = S.gameStatus === 'results';
              show(over.node, gameOver || api.stalled());
              if (gameOver) over.set(`<b>Game over · ${winner()}.</b> Actions are frozen; the Log still has everything.`);
              else if (api.stalled()) over.set(`<b>Nothing's moved for a minute.</b> The host may have left. If it doesn't move soon, the game is probably over.`);
              if (lob) { show(next, false); show(hint, false); return; }
              put(bal, '⚡ ' + balanceVal());
              const targets = S.people.filter((p) => !(S.me && S.me.id === p.id)).map((p) => ({ value: p.id, label: p.name + (p.votedOff ? ' (ejected)' : ''), disabled: p.votedOff }));
              pick.update(targets, gameOver);
              put(pickWhy, S.target ? '' : 'Pick who your targeted actions aim at');
              // Your role's rows first; when eliminated, Donate moves to the top and the rest grey out.
              const r = myRole(), dead = amEliminated();
              const myList = r === 'imposter' ? CATALOGUE.imposter : CATALOGUE.detective;
              const otherList = r === 'imposter' ? CATALOGUE.detective : CATALOGUE.imposter;
              const mineItems = dead ? [DONATE, ...myList] : myList;
              const otherItems = dead ? otherList : [...otherList, DONATE];
              put(lblMine, dead ? 'Eliminated · you can still donate' : 'Your actions');
              put(lblOther, dead ? 'Other role' : 'Other role & later');
              const fill = (box, items) => keyed(box, items, (it) => it.id, rowFor, (row, it) => row.update(rowState(it)));
              fill(mine, mineItems);
              fill(other, otherItems);
              const q = queue();
              show(next, q.length > 1 && !gameOver);
              if (q.length > 1) { next.replaceChildren('Next up: ', el('b', { text: q[0].name })); }
              const voting = phaseNow() === 'voting';
              vote.update({ hot: voting && !dead, disabled: dead || gameOver, reason: dead ? "You're eliminated" : '' });
              show(hint, voting && api.votingFor() >= 30);
              put(hint, 'Waiting for everyone to vote or the host to end voting');
            },
          };
        },
      },
      // ---------------------------------------------------------------- Answers
      {
        id: 'answers', label: 'Answers', pub: true, pubNote: 'Changes your score, which others can see',
        build(ui) {
          const { el, put, show } = ui;
          const hl = ui.toggleRow({ title: 'Highlight correct answer', sub: 'Green outline in the game', get: () => S.highlight, set: (v) => { S.highlight = v; } });
          const au = ui.toggleRow({ title: 'Auto-answer', sub: 'Keeps answering even when you leave the question screen', get: () => S.auto, set: (v) => { S.auto = v; } });
          const chip = ui.livechip();
          const known = el('div', { cls: 'note' });
          const bg = el('div', { cls: 'col' }, el('div', { cls: 'row', style: 'align-items:center' }, chip), known);
          const SPEEDS = [{ value: 4000, label: 'Slow' }, { value: 2000, label: 'Normal' }, { value: 1000, label: 'Fast' }];
          const speed = ui.seg(SPEEDS, () => S.answerMs, (v) => { S.answerMs = v; });
          const cap = el('div', { cls: 'segcap' });
          const st = ui.stats(['✓ Right', '✗ Wrong', 'Total', 'Accuracy', '🔥 Streak']);
          return {
            nodes: [ui.listCard(hl.node, au.node), bg, ui.lbl('Speed'), el('div', { cls: 'col' }, speed.node, cap), ui.lbl('Your stats'), st.node],
            update() {
              hl.update();
              au.update();
              const direct = S.auto && S.answerMode === 'direct';
              show(bg, direct);
              if (direct) {
                put(chip, 'Answering in background · ' + S.directAnswers + ' sent');
                put(known, `Knows ${api.knownQuestions()} of ${questionCount()} questions`);
              }
              speed.update();
              put(cap, `≈${S.answerMs / 1000} s per question, with a little random spread`);
              const s = stats() || { correct: 0, incorrect: 0, total: 0, accuracy: 0, streak: 0 };
              st.set(0, s.correct); st.set(1, s.incorrect); st.set(2, s.total);
              st.set(3, Math.round(s.accuracy * 100), '%'); st.set(4, s.streak);
            },
          };
        },
      },
      // ---------------------------------------------------------------- Log
      {
        id: 'log', label: 'Log',
        build(ui) {
          const feed = ui.logFeed({
            sent: { icon: '↳' }, result: { icon: '✓', tone: 'tb' }, vote: { icon: '☑', tone: 'tn' },
            phase: { icon: '◆', tone: 'tn' }, eject: { icon: '▲', tone: 'ta' }, clear: { icon: '○', tone: 'tb' },
            target: { icon: '◎', tone: 'tw' }, warn: { icon: '!', tone: 'ta' },
          }, 'Nothing yet');
          let seen = null, len = -1;
          return {
            nodes: [feed.node],
            update() {
              if (S.log[0] === seen && S.log.length === len) return;
              seen = S.log[0]; len = S.log.length;
              // A game result right after (above) our own "sent" confirms it.
              feed.update(S.log.map((e, i) => {
                const below = S.log[i + 1];
                return Object.assign(e, { confirms: e.kind === 'result' && below && below.kind === 'sent' && e.t - below.t < 6000 });
              }));
            },
          };
        },
      },
    ],

    settings(ui) {
      const { el, put, show } = ui;
      const pace = ui.slider({ title: 'Auto pace', min: 2, max: 10, step: 1, get: () => Math.round(S.actionEveryMs / 1000), set: (v) => { S.actionEveryMs = v * 1000; }, fmt: (v) => v + ' s' });
      const code = ui.kv('Game code', '');
      const codeCard = ui.card(code.node);
      return {
        nodes: [ui.listCard(pace.node), ui.note('One auto action every few seconds. Slower looks more natural.'), codeCard,
          ui.note('After Play Again, click the bookmark again. Your settings come back (not the target).')],
        update() {
          pace.update();
          const gc = api.gameCode();
          show(codeCard, !!gc);
          put(code.v, gc || '');
        },
      };
    },

    S, api,
  };
  // The shell passes `hub` to install(); keep it for tick()/toasts.
  const install = mode.install;
  mode.install = function (hub) { mode._hub = hub; return install.call(mode, hub); };
  return mode;
})());

window.__vcmGimkit = createHub({
  global: "__vcmGimkit",
  site: 'Gimkit',
  version: VCM_VERSION,
  modes: VCM_MODES,
  unsupportedText: 'Join a Gimkit game, then click the bookmark again.',
});
})();
