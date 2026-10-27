#!/usr/bin/env python3
"""27 Oct 2026 (customer report): one number line per fault tree node; every other note moves behind a small
warning pill at the bottom of the canvas (click it for the list, click a line to highlight the nodes) and
into the node properties box.

Run from the repo root: python3 tools/patch_fta_warn_pill_20261027.py
Needs site/fta_warn_pill.js and tools/fta_warn_helpers_20261027.js. Refuses if any anchor is missing.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)

def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

if not os.path.exists(S('fta_warn_pill.js')): sys.exit('site/fta_warn_pill.js is missing')

# ---------------------------------------------------------------- helpers_modules.js
h = rd(S('helpers_modules.js'))
if 'function ftaNodeWarnings(' in h: sys.exit('helpers_modules.js already patched')
a = h.find('// Phase 56.42 — Companion to formatNodeMetrics.')
b = h.find('function syncACFHACondition()')
if a < 0 or b < 0 or b < a: sys.exit('helpers anchors missing')
h = h[:a] + rd(os.path.join(ROOT, 'tools', 'fta_warn_helpers_20261027.js')).rstrip() + '\n\n' + h[b:]
wr(S('helpers_modules.js'), h)

# ---------------------------------------------------------------- fta_view_modules.js
v = rd(S('fta_view_modules.js'))
# 1) the Actual text element and the feasibility mark are no longer drawn on the node
a = v.find("        // Phase 56.42 — Actual line for top-down + shared events. The inline-metrics\n        // foreignObject")
b = v.find("        // Backlog #4 — ◇ mark on qualitative development-error events")
if a < 0 or b < 0 or b < a: sys.exit('view enter anchors missing')
v = v[:a] + ("        // 27 Oct 2026 (customer report): the node carries ONE line, P and its per flight hour value. The\n"
             "        // Actual line and the feasibility ⚠ drawn here sat under the gate symbol, the DAL badge and the\n"
             "        // input-mode dropdown (drawn later, on top). Every note now lives behind the warning pill at the\n"
             "        // bottom of the canvas and in the node properties box (fta_warn_pill.js, ftaNodeWarnings).\n\n") + v[b:]
a = v.find("        // Phase 56.42 \\u2014 Actual line for top-down + shared events. Populated by")
b = v.find("        // Backlog #4 — ◇ marker sync on qualitative development-error events.")
if a < 0 or b < 0 or b < a: sys.exit('view update anchors missing')
v = v[:a] + v[b:]
# 2) the number line is sized to fit on one line
v = sub1(v, "            if (!this._ftaEditing) this.value = formatNodeMetrics(d);\n",
         "            if (!this._ftaEditing) this.value = formatNodeMetrics(d);\n"
         "            _ftaFitMetricLine(this);\n", 'metrics value')
v = sub1(v, "function updateD3() {\n",
         "// 27 Oct 2026 (customer report): the number line under a node (\"P=6.00E-10 · ≈2.00E-10/FH\") always fits\n"
         "// on one line inside the node: the font shrinks from 11.5px until the text fits the field, never below\n"
         "// 7px. Measured with the field's own font, so a different number or a different font still fits.\n"
         "function _ftaFitMetricLine(el) {\n"
         "    try {\n"
         "        const BASE = 11.5, MIN = 7;\n"
         "        const text = String(el.value || '');\n"
         "        if (!text) { el.style.setProperty('font-size', BASE + 'px', 'important'); return; }\n"
         "        const c = _ftaFitMetricLine._ctx || (_ftaFitMetricLine._ctx = document.createElement('canvas').getContext('2d'));\n"
         "        const cs = getComputedStyle(el);\n"
         "        c.font = (cs.fontWeight || '600') + ' ' + BASE + 'px ' + (cs.fontFamily || 'monospace');\n"
         "        const spacing = parseFloat(cs.letterSpacing) || 0;\n"
         "        const width = c.measureText(text).width + spacing * text.length;\n"
         "        const avail = Math.max(60, (el.clientWidth || 160) - 6);\n"
         "        const size = width > avail ? Math.max(MIN, Math.floor((BASE * avail / width) * 10) / 10) : BASE;\n"
         "        el.style.setProperty('font-size', size + 'px', 'important');\n"
         "        el.title = text;\n"
         "    } catch (_) {}\n"
         "}\n\n"
         "function updateD3() {\n", 'updateD3 head')
# 3) the pill refreshes after every render (and keeps its highlight through the class reset above)
v = sub1(v, "        try { if (_FE) _FE.afterRender(root, _allDesc, isDark); } catch (_) {}\n",
         "        try { if (_FE) _FE.afterRender(root, _allDesc, isDark); } catch (_) {}\n"
         "        // 27 Oct 2026 (customer report): the tree's warning pill on the canvas, and its node highlight.\n"
         "        try { if (typeof SLFtaWarn !== 'undefined') SLFtaWarn.afterRender(rootNode, _allDesc); } catch (_) {}\n", 'afterRender')
v = sub1(v, "            try { if (typeof SLFtaEdit !== 'undefined') SLFtaEdit.afterRender(null, [], document.body.classList.contains('theme-dark')); } catch (_) {}\n            return;\n",
         "            try { if (typeof SLFtaEdit !== 'undefined') SLFtaEdit.afterRender(null, [], document.body.classList.contains('theme-dark')); } catch (_) {}\n"
         "            try { if (typeof SLFtaWarn !== 'undefined') SLFtaWarn.afterRender(null, []); } catch (_) {}\n            return;\n", 'empty page')
# 4) the properties box lists the node's notes in full
v = sub1(v, "    try { if (typeof slRenderNodeIdentity === 'function') slRenderNodeIdentity(); } catch (_) {}\n",
         "    try { if (typeof slRenderNodeIdentity === 'function') slRenderNodeIdentity(); } catch (_) {}\n"
         "    // 27 Oct 2026 (customer report): this node's warnings and notes, in full (the canvas shows only its numbers).\n"
         "    try { if (typeof SLFtaWarn !== 'undefined') SLFtaWarn.fillPanel(dataNode); } catch (_) {}\n", 'selectNode')
wr(S('fta_view_modules.js'), v)

# ---------------------------------------------------------------- index.html
x = rd(S('index.html'))
x = sub1(x, '                        <div id="config-identity-host" style="margin-bottom:14px;"></div>\n',
         '                        <!-- 27 Oct 2026 (customer report): this node\'s warnings and notes in full, from SLFtaWarn.fillPanel (fta_warn_pill.js). -->\n'
         '                        <div id="config-node-warnings" class="cfg-node-warnings" style="display:none;"></div>\n'
         '                        <div id="config-identity-host" style="margin-bottom:14px;"></div>\n', 'panel host')
x = sub1(x, '                        <div class="canvas-floating-actions">\n',
         '                        <div class="canvas-floating-actions">\n'
         '                            <!-- 27 Oct 2026 (customer report): the tree\'s warning pill; a click lists the warnings, a line highlights its nodes (fta_warn_pill.js). -->\n'
         '                            <div id="fta-warn-pill" class="fta-warn-pill" style="display:none;"></div>\n', 'pill host')
x = sub1(x, '    <script src="fta_canvas_edit.js?v=1.1" defer></script>\n',
         '    <script src="fta_canvas_edit.js?v=1.1" defer></script>\n'
         '    <!-- 27 Oct 2026 (customer report): fta_warn_pill.js (SLFtaWarn): the fault tree canvas\'s warning pill and the properties box warnings. After fta_view_modules.js. -->\n'
         '    <script src="fta_warn_pill.js?v=1.0" defer></script>\n', 'script tag')
def bump(s, name):
    m = re.search(re.escape(name) + r'\?v=(\d+)\.(\d+)', s)
    if not m: sys.exit('no version for ' + name)
    return s.replace(m.group(0), '%s?v=%s.%d' % (name, m.group(1), int(m.group(2)) + 1), 1)
for nm in ('fta_view_modules.js', 'helpers_modules.js', 'safety_lab.css'):
    x = bump(x, nm)
wr(S('index.html'), x)

# ---------------------------------------------------------------- safety_lab.css
c = rd(S('safety_lab.css'))
if 'fta-warn-pill' in c: sys.exit('css already patched')
c += r'''
/* 27 Oct 2026 (customer report): the fault tree's warning pill at the bottom of the canvas (fta_warn_pill.js). */
.fta-warn-pill { position: relative; }
#fta-warn-pill .fwp-btn { height: 30px !important; min-width: 0 !important; padding: 0 12px !important; margin: 0 !important; border-radius: 999px !important; font: inherit; font-size: 12.5px !important; font-weight: 700 !important; cursor: pointer; border: 1px solid rgba(245, 158, 11, .6) !important; background: #fff7e6 !important; color: #b45309 !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .12) !important; white-space: nowrap; }
#fta-warn-pill .fwp-btn.fwp-only-info { border-color: var(--color-border-hair, #d0d5dd) !important; background: var(--color-surface-1, #fff) !important; color: var(--color-text-secondary, #555) !important; }
#fta-warn-pill .fwp-btn[aria-expanded="true"] { box-shadow: 0 0 0 3px rgba(245, 158, 11, .3) !important; }
.fta-warn-pill .fwp-list { position: absolute; bottom: 38px; left: 0; width: 460px; max-width: calc(100vw - 48px); max-height: 260px; overflow-y: auto; overscroll-behavior: contain; flex-direction: column; gap: 2px; padding: 6px; background: var(--color-surface-1, #fff); border: 1px solid var(--color-border-hair, #d0d5dd); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); z-index: 120; cursor: default; }
.fta-warn-pill .fwp-hint { font-size: 11px; color: var(--color-text-tertiary, #888); padding: 2px 6px 4px; }
#fta-warn-pill .fwp-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; height: auto !important; min-height: 0 !important; margin: 0 !important; text-align: left; background: transparent !important; border: 1px solid transparent !important; border-radius: 6px !important; padding: 5px 6px !important; font: inherit; font-size: 12px !important; font-weight: 500 !important; line-height: 1.4; color: var(--color-text-primary, #1d1d1f) !important; box-shadow: none !important; cursor: pointer; }
#fta-warn-pill .fwp-row:hover { background: var(--color-surface-2, rgba(0,0,0,.05)) !important; }
#fta-warn-pill .fwp-row.is-active { border-color: #f59e0b !important; background: rgba(245, 158, 11, .14) !important; }
.fta-warn-pill .fwp-glyph { width: 14px; text-align: center; font-weight: 700; flex: 0 0 auto; }
.fta-warn-pill .fwp-warn .fwp-glyph { color: #b45309; }
.fta-warn-pill .fwp-info .fwp-glyph { color: var(--color-text-secondary, #555); }
.fta-warn-pill .fwp-title { flex: 1 1 auto; min-width: 0; white-space: normal; overflow-wrap: anywhere; }
.fta-warn-pill .fwp-who { flex: 0 0 auto; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-tertiary, #888); }
body.theme-dark #fta-warn-pill .fwp-btn.fwp-has-warn { background: #5c3a06 !important; color: #fde68a !important; border-color: rgba(245, 158, 11, .7) !important; }
.node.fta-warn-hit > path { stroke: #f59e0b !important; stroke-width: 4px !important; filter: drop-shadow(0 0 6px rgba(245, 158, 11, .85)); }
.node.fta-warn-hit .inline-desc { outline: 3px solid #f59e0b; outline-offset: 1px; box-shadow: 0 0 10px rgba(245, 158, 11, .7); }
/* the number line sits on the canvas color so the dot grid never runs through the digits */
#fta-svg .inline-metrics { background: var(--canvas-bg, #fff); border-radius: 4px; }
.cfg-node-warnings { margin: 0 0 12px; display: flex; flex-direction: column; gap: 4px; }
.cfg-node-warnings .cnw-item { display: flex; gap: 8px; font-size: 12px; line-height: 1.5; padding: 6px 8px; border-radius: 6px; overflow-wrap: anywhere; }
.cfg-node-warnings .cnw-warn { background: rgba(245, 158, 11, .12); color: var(--color-warning, #b45309); }
.cfg-node-warnings .cnw-info { background: var(--color-surface-2, rgba(0,0,0,.04)); color: var(--color-text-secondary, #555); }
.cfg-node-warnings .cnw-glyph { font-weight: 700; flex: 0 0 auto; }
'''
wr(S('safety_lab.css'), c)
print('patched: helpers_modules.js, fta_view_modules.js, index.html, safety_lab.css')
