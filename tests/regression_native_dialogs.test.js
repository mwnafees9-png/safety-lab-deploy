#!/usr/bin/env node
/*
 * Regression — no native dialogs (13 Sep 2026, R19 step 3).
 *
 * WHAT THE SWEEP FOUND. 264 native alert/confirm/prompt sites in 56 files. alert() had been swapped
 * at runtime for a toast whose color was guessed from keywords (a long explanation vanished after a
 * few seconds); confirm() and prompt() were the browser's gray boxes, and on the desktop app (Electron)
 * prompt() returns null without asking, so every prompt-driven flow silently did nothing there.
 *
 * PINNED:
 *   N1  zero call sites of the native alert( / confirm( / prompt( in site/*.js (comments and string
 *       literals excepted; the one guard in safety_lab.js that re-routes a stray native alert excepted)
 *   N2  the "typeof slConfirm === 'function' ? slConfirm(...) : confirm(...)" fallback shape is gone —
 *       the app dialogs are core scripts, always present at click time
 *   N3  slAlert exists on the dialog engine: one OK button, no cancel; resolves true on OK, Enter,
 *       Escape and a click outside; multi-line text is kept; slConfirm/slPrompt still resolve as before
 *   N4  the window.alert guard routes to slAlert and never throws
 *   N5  every rewritten confirm/prompt site awaits the answer: no `slConfirm(` / `slPrompt(` call whose
 *       result is neither awaited, returned, assigned, nor given a .then (the bug a mechanical rewrite makes:
 *       `if (!slConfirm(x)) return;` — a Promise is always truthy)
 *   N6  mutation: a native confirm( put back in a module turns N1 red
 *
 * Run: node tests/regression_native_dialogs.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const FILES = fs.readdirSync(SITE).filter(f => f.endsWith('.js')).sort();

// ---- a small scanner that skips comments and string/template literals -----------------------------
function stripCommentsAndStrings(src) {
  // Replaces the inside of comments and string literals with spaces (keeps offsets and line numbers).
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') { // keep template expressions, they are code
          let depth = 0; do { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; out += src[i]; i++; } while (i < n && depth > 0); continue;
        }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += q; i++; continue;
    }
    // a regex literal after ( , = : [ ! & | ? { } ; or line start — skip it so `/alert(/` inside a regex is not a call
    if (c === '/' && /(^|[(,=:\[!&|?{};\n]|\breturn|\btypeof|\bcase)\s*$/.test(out.slice(-12))) {
      out += ' '; i++;
      while (i < n && src[i] !== '/' && src[i] !== '\n') { if (src[i] === '\\') { out += '  '; i += 2; continue; } if (src[i] === '[') { while (i < n && src[i] !== ']') { out += ' '; i++; } } out += ' '; i++; }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
function nativeSites(f) {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8'), code = stripCommentsAndStrings(src);
  const re = /(^|[^A-Za-z0-9_.$])(window\.)?(alert|confirm|prompt)\s*\(/g; const hits = []; let m;
  while ((m = re.exec(code))) {
    const at = m.index + m[1].length, line = code.slice(0, at).split('\n').length;
    const lineText = src.split('\n')[line - 1] || '';
    // the one allowed native use: the guard's own definition `window.alert = function` is an assignment, not a call — it has no "(" after alert; nothing else is exempt
    hits.push(f + ':' + line + '  ' + lineText.trim().slice(0, 90));
  }
  return hits;
}
function orphanDialogCalls(f) {
  // a slConfirm(/slPrompt( call whose promise is dropped on the floor or used as a boolean
  const src = fs.readFileSync(path.join(SITE, f), 'utf8'), code = stripCommentsAndStrings(src);
  const re = /(^|[^A-Za-z0-9_.$])(window\.)?(slConfirm|slPrompt)\s*\(/g; const hits = []; let m;
  while ((m = re.exec(code))) {
    const at = m.index + m[1].length;
    const pre = code.slice(Math.max(0, at - 80), at);
    // find the end of the call
    let i = code.indexOf('(', at) + 1, d = 1; while (i < code.length && d) { if (code[i] === '(') d++; else if (code[i] === ')') d--; i++; }
    const post = code.slice(i, i + 40);
    const line = code.slice(0, at).split('\n').length;
    const usedAsBool = /(if|while)\s*\(\s*!?\s*$/.test(pre) || /(&&|\|\|)\s*!?\s*$/.test(pre) || /^\s*\?/.test(post) || /!\s*$/.test(pre);
    const awaited = /await\s+$/.test(pre) || /return\s+$/.test(pre) || /[=:(,]\s*$/.test(pre) || /^\s*\.then\s*\(/.test(post) || /^\s*\.finally\s*\(/.test(post) || /=>\s*$/.test(pre);
    const bareStatement = /^\s*;/.test(post) && !awaited;   // slConfirm(x); with nothing done with the answer
    const isDefinition = /function\s+$/.test(pre) || /window\.sl(Confirm|Prompt)\s*=\s*$/.test(pre);
    if (isDefinition) continue;
    if (usedAsBool || (bareStatement && m[3] === 'slConfirm') || (bareStatement && m[3] === 'slPrompt')) hits.push(f + ':' + line + '  ' + (src.split('\n')[line - 1] || '').trim().slice(0, 90));
  }
  return hits;
}

console.log('[N1] zero native alert/confirm/prompt call sites in site/*.js');
{
  let all = [];
  for (const f of FILES) all = all.concat(nativeSites(f));
  check('no file calls alert(, confirm( or prompt( (' + FILES.length + ' files scanned)', all.length === 0, '\n      ' + all.slice(0, 40).join('\n      ') + (all.length > 40 ? '\n      … ' + (all.length - 40) + ' more' : ''));
}

console.log('\n[N2] the native fallback shape is gone');
{
  let hits = [];
  for (const f of FILES) {
    const raw = fs.readFileSync(path.join(SITE, f), 'utf8');   // raw: the stripper blanks the 'function' string
    const m = raw.match(/typeof\s+sl(Confirm|Prompt|Alert)\s*===?\s*'function'\s*\?/g);
    if (m) hits.push(f + ' ×' + m.length);
  }
  check("no `typeof slConfirm === 'function' ? … : confirm(…)` fallbacks remain", hits.length === 0, hits.join(', '));
}

// ---- N3: the engine, run for real against a tiny DOM ---------------------------------------------
function makeDom() {
  const els = {}; const listeners = [];
  function el(tag) {
    const e = { tag, id: '', className: '', style: {}, attrs: {}, children: [], _h: {}, innerHTML: '', value: '',
      classList: { add(c) { e.className += ' ' + c; }, remove() {}, contains() { return false; } },
      setAttribute(k, v) { e.attrs[k] = v; }, getAttribute(k) { return e.attrs[k]; }, appendChild(c) { e.children.push(c); return c; },
      addEventListener(k, fn) { (e._h[k] = e._h[k] || []).push(fn); }, focus() {}, select() {},
      querySelector(sel) { return e._q(sel); }, _q(sel) {
        // resolve from the last innerHTML: we parse just enough (buttons by class, the input by id)
        const html = e.innerHTML;
        if (sel === '.sl-dialog-ok') return html.indexOf('sl-dialog-ok') >= 0 ? (e._ok = e._ok || el('button')) : null;
        if (sel === '.sl-dialog-cancel') return html.indexOf('sl-dialog-cancel') >= 0 ? (e._cancel = e._cancel || el('button')) : null;
        if (sel === '#sl-dialog-input') return html.indexOf('sl-dialog-input') >= 0 ? (e._input = e._input || el('input')) : null;
        return null;
      },
      fire(k, ev) { (e._h[k] || []).forEach(fn => fn(ev || {})); } };
    return e;
  }
  const document = {
    getElementById(id) { return els[id] || null; },
    createElement(tag) { const e = el(tag); return e; },
    body: { appendChild(e) { els[e.id] = e; return e; } },
    addEventListener(k, fn) { listeners.push([k, fn]); }, removeEventListener() {},
    _key(key) { listeners.slice().forEach(([k, fn]) => { if (k === 'keydown') fn({ key, preventDefault() {}, stopImmediatePropagation() {} }); }); },
  };
  return { document, els };
}
function bootEngine() {
  const src = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');
  const start = src.indexOf('var _slDialogBusy = false'); const end = src.indexOf('function _ftaGoToSearchHit');
  if (start < 0 || end < 0) return null;
  const sup = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');
  const ps = sup.indexOf('function slPrompt(message, def, opts)'); const pe = sup.indexOf('function switchTab', ps);
  if (ps < 0 || pe < 0) return null;
  const chunk = src.slice(start, end) + '\n' + sup.slice(ps, pe);
  const dom = makeDom();
  const ctx = { document: dom.document, window: {}, requestAnimationFrame: fn => fn(), setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, Promise, console,
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.createContext(ctx); vm.runInContext(chunk + '\nthis.__api = { slConfirm, slPrompt, slAlert, _slDialog, _slDialogQueue };', ctx);
  return { api: ctx.__api, dom, ctx };
}

console.log('\n[N3] slAlert on the dialog engine');
(async () => {
  const b = bootEngine();
  check('the engine chunk (from _slDialog to the next function) was found and boots', !!b);
  if (b) {
    const ov = () => b.dom.els['sl-dialog-overlay'];
    let p = b.api.slAlert('Line one\nLine two', { title: 'Heads up' });
    let o = ov();
    check('alert renders a title, the message with the line break kept, an OK button and NO cancel button',
      o && /Heads up/.test(o.innerHTML) && /Line one<br>Line two/.test(o.innerHTML) && /sl-dialog-ok/.test(o.innerHTML) && !/sl-dialog-cancel/.test(o.innerHTML), o && o.innerHTML.slice(0, 300));
    o._q('.sl-dialog-ok').fire('click');
    check('OK resolves true', (await p) === true);
    p = b.api.slAlert('again'); b.dom.document._key('Escape');
    check('Escape on a notice also resolves true (dismissing is reading)', (await p) === true);
    p = b.api.slAlert('again'); o = ov(); (o._h.click || []).forEach(fn => fn({ target: o }));
    check('a click outside resolves true', (await p) === true);
    p = b.api.slConfirm('sure?'); o = ov();
    check('confirm still renders both buttons', /sl-dialog-cancel/.test(o.innerHTML) && /sl-dialog-ok/.test(o.innerHTML));
    o._q('.sl-dialog-cancel').fire('click');
    check('confirm Cancel still resolves false', (await p) === false);
    p = b.api.slConfirm('sure?'); o = ov(); o._q('.sl-dialog-ok').fire('click');
    check('confirm OK still resolves true', (await p) === true);
    p = b.api.slPrompt('name?', 'abc'); o = ov(); o._q('#sl-dialog-input').value = 'typed'; b.dom.document._key('Enter');
    check('prompt Enter resolves the typed text', (await p) === 'typed');
    p = b.api.slPrompt('name?', 'abc'); b.dom.document._key('Escape');
    check('prompt Escape resolves null', (await p) === null);
    check('slAlert escapes HTML in the message', (b.api.slAlert('<b>x</b>'), /&lt;b&gt;x&lt;\/b&gt;/.test(ov().innerHTML)));
    // drain that one, then the queue: two dialogs asked back to back are answered in order, neither is lost
    ov()._q('.sl-dialog-ok').fire('click'); await new Promise(r => setImmediate(r));
    const p1 = b.api.slAlert('first'), p2 = b.api.slConfirm('second');
    check('the second dialog waits while the first is open', /first/.test(ov().innerHTML) && !/second/.test(ov().innerHTML) && b.api._slDialogQueue() === 2, ov().innerHTML.slice(0, 120) + ' queue ' + b.api._slDialogQueue());
    ov()._q('.sl-dialog-ok').fire('click');
    check('the first resolves', (await p1) === true);
    await new Promise(r => setImmediate(r));
    check('then the second is shown', /second/.test(ov().innerHTML) && /sl-dialog-cancel/.test(ov().innerHTML), ov().innerHTML.slice(0, 120));
    ov()._q('.sl-dialog-cancel').fire('click');
    check('and resolves with its own answer', (await p2) === false && b.api._slDialogQueue() === 0);
  }

  console.log('\n[N4] the window.alert guard');
  {
    const src = fs.readFileSync(path.join(SITE, 'safety_lab.js'), 'utf8');
    const s = src.indexOf('window._origAlert = window.alert;'); const e = src.indexOf('};', s) + 2;
    const chunk = src.slice(s, e);
    const calls = []; const ctx = { window: { alert: () => { throw new Error('native reached'); } }, console: { warn() {} }, slAlert: m => calls.push(m), showToast() {} };
    vm.createContext(ctx); let threw = false; try { vm.runInContext(chunk, ctx); ctx.window.alert('stray'); ctx.window.alert(null); } catch (_) { threw = true; }
    check('a stray native alert is routed to slAlert (never the browser box) and never throws', !threw && calls.length === 2 && calls[0] === 'stray' && calls[1] === '', JSON.stringify(calls));
    check('the old keyword-guessing toast override is gone', !/if\(\/error\|invalid\|fail\/i\.test\(m\)\) type = 'error'/.test(src));
  }

  console.log('\n[N5] every app-dialog call uses its answer');
  {
    let all = [];
    for (const f of FILES) all = all.concat(orphanDialogCalls(f));
    check('no slConfirm/slPrompt result is used as a plain boolean or dropped', all.length === 0, '\n      ' + all.slice(0, 30).join('\n      '));
  }

  console.log('\n[N6] mutation');
  {
    const tmp = path.join(SITE, '__mut_native.js');
    fs.writeFileSync(tmp, "function x() { if (!confirm('sure?')) return; }\n");
    try { check('a native confirm( put back in a module is caught by N1', nativeSites('__mut_native.js').length === 1); } finally { fs.unlinkSync(tmp); }
    const codeOnly = stripCommentsAndStrings("// alert(1)\nconst s = 'alert(2)';\nconst t = `prompt(${3})`;\nconst r = /confirm(/;\n");
    check('the scanner ignores comments, strings, template text and regex literals', !/(alert|prompt|confirm)\(/.test(codeOnly), JSON.stringify(codeOnly));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
