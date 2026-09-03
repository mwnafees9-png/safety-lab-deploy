/*
 * tests/lib/layout_scan.js — static scanner for the container-property defect class.
 *
 * Waqas, 19 Aug 2026, after the node-properties drawer took four rounds to fix:
 *   "well you asked the question veere, lets audit all the panels and see what happens"
 *
 * The question was: what does this container do when the content is twice as tall, or
 * twice as wide? Every defect in that drawer was a container property that was correct
 * at one content size and wrong at another, and NONE of them was reachable by a
 * behavioural test. This module makes them reachable by reading the markup instead.
 *
 * WHAT IT LOOKS FOR
 *
 *   NOWRAP_100    A `display:flex` row with no `flex-wrap:wrap` that contains a child
 *                 asking for a full-width line (`flex: … 100%` or `width:100%`).
 *                 In a nowrap row a 100% basis CANNOT break to its own line — the child
 *                 stays on the line and shrinks. This is the ribbon bug, three times.
 *
 *   NOWRAP_CROWD  A nowrap flex row with 5+ flex children. 5 cells in a 760px panel is
 *                 ~150px each: labels wrap to three lines, selects truncate ("Basic
 *                 Event" -> "Bas").
 *
 *   ABS_IN_SCROLL An absolutely-positioned element pinned `top:0; bottom:0` (or
 *                 `height:100%`) whose containing block is a scroll container. It spans
 *                 the FIRST screenful only, so it scrolls away — the drag-handle bug.
 *
 *   CLIP          `max-height` with no `overflow` on the same element: content past the
 *                 cap is unreachable, with no scrollbar to tell you it is there.
 *
 *   CHAIN         A bounded scroll container with no `overscroll-behavior`. When it hits
 *                 either end the wheel carries into whatever is behind it and the two
 *                 move as one. Reported for any scroller that is positioned or capped —
 *                 a full-page scroller chaining to the page is correct, not a bug.
 *
 * CLASS AWARENESS. The first cut only read inline `style=` attributes and therefore saw
 * almost nothing: this app styles its panels with classes. The scanner now builds an
 * index from safety_lab.css and resolves each element's declarations as
 * (tag rules -> class rules -> id rules -> inline), which is enough cascade fidelity for
 * container properties. Selectors are matched on their LAST simple component, so
 * `#node-config-panel .cfg-stack` reaches a `.cfg-stack` element. A selector whose last
 * component is a bare tag behind a combinator (`.cfg-stack > div`) is deliberately NOT
 * applied to every div — it would poison the whole index.
 *
 * The HTML parser is a tolerant tag-stack walker, not a spec parser. It only needs
 * nesting, classes, ids and inline styles, which is all these checks read. It also runs
 * over HTML built inside JS template literals (`${…}` holes are blanked first), because
 * most of this app's panels are rendered from JS rather than from index.html.
 */
'use strict';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

// ---------------------------------------------------------------- inline styles
function parseStyle(styleStr) {
  const out = {};
  if (!styleStr) return out;
  styleStr.split(';').forEach(part => {
    const i = part.indexOf(':');
    if (i < 0) return;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim().toLowerCase().replace(/\s*!important\s*$/, '');
    if (k) out[k] = v;
  });
  return out;
}

// A `flex` shorthand's third component is the basis. `flex: 1 1 100%` -> '100%'.
// `flex: 2` -> basis 0%. `flex: 1 1 140px` -> '140px'.
function flexBasis(decls) {
  if (decls['flex-basis']) return decls['flex-basis'];
  const f = decls['flex'];
  if (!f) return null;
  const parts = f.split(/\s+/);
  if (parts.length >= 3) return parts[2];
  if (parts.length === 2) return /^\d+(\.\d+)?$/.test(parts[1]) ? '0%' : parts[1];
  if (parts.length === 1) {
    if (/^\d+(\.\d+)?$/.test(parts[0])) return '0%';
    if (parts[0] === 'none' || parts[0] === 'auto' || parts[0] === 'initial') return 'auto';
    return parts[0];
  }
  return null;
}

function wantsOwnLine(decls) {
  const b = flexBasis(decls);
  if (b === '100%') return true;
  if (decls['width'] === '100%' && (b === null || b === 'auto' || b === '0%')) return true;
  return false;
}

function isScrollY(decls) {
  const o = decls['overflow'], oy = decls['overflow-y'];
  return o === 'auto' || o === 'scroll' || oy === 'auto' || oy === 'scroll';
}

function hasOverscroll(decls) {
  return decls['overscroll-behavior'] !== undefined ||
         decls['overscroll-behavior-y'] !== undefined;
}

// ---------------------------------------------------------------- CSS rules
function parseCss(css) {
  const rules = [];
  // Strip comments so a commented-out declaration cannot satisfy a check.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const selGroup = m[1].trim().replace(/\s+/g, ' ');
    if (!selGroup || selGroup.startsWith('@')) continue;
    const decls = parseStyle(m[2]);
    selGroup.split(',').forEach(sel => {
      sel = sel.trim();
      if (sel) rules.push({ selector: sel, decls: decls, raw: m[2] });
    });
  }
  return rules;
}

// The last simple-selector component of a compound selector, e.g.
//   '#node-config-panel.is-modal .cfg-drawer-head .row-action-menu' -> '.row-action-menu'
//   '.cfg-stack > div'                                              -> 'div' (behind a combinator)
function lastComponent(sel) {
  const parts = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return { comp: parts[parts.length - 1] || '', depth: parts.length };
}

// CSS specificity, the usual (ids, classes/attrs/pseudo-classes, types). Used to order
// the merge: a later-but-weaker rule must not overwrite an earlier stronger one. Getting
// this wrong produced a false ABS_IN_SCROLL on the drawer's drag handle, where the plain
// `.node-drawer-resize` rule appears after — and was wrongly beating —
// `#node-config-panel.is-modal .node-drawer-resize`.
function specificity(sel) {
  const ids = (sel.match(/#[A-Za-z0-9_-]+/g) || []).length;
  const cls = (sel.match(/\.[A-Za-z0-9_-]+|\[[^\]]*\]|:[a-z-]+/g) || []).length;
  const typ = (sel.match(/(^|[\s>+~])[a-zA-Z][a-zA-Z0-9-]*/g) || []).length;
  return ids * 10000 + cls * 100 + typ;
}

// key -> merged declarations, for keys of the form '.cls' and '#id'.
function buildCssIndex(rules) {
  const idx = { cls: {}, id: {}, attr: buildAttrRules(rules) };
  const scored = rules.map((r, i) => ({ r: r, spec: specificity(r.selector), i: i }))
    .sort((a, b) => (a.spec - b.spec) || (a.i - b.i));
  scored.forEach(({ r }) => {
    if (r.selector.indexOf('::') !== -1 || /:hover|:focus|:active|:not\(/.test(r.selector)) return;
    const { comp } = lastComponent(r.selector);
    // Match every class / id token in the last component, so '.a.b' feeds both.
    const tokens = comp.match(/[.#][A-Za-z0-9_-]+/g);
    if (!tokens) return;                       // bare tag behind a combinator — skip
    tokens.forEach(t => {
      const bucket = t[0] === '#' ? idx.id : idx.cls;
      const key = t.slice(1);
      bucket[key] = Object.assign({}, bucket[key] || {}, r.decls);
    });
  });
  return idx;
}

// Rules written as `[style*="…"] { … }`. The app uses these as an escape hatch to reach
// elements that carry an inline style (there are 21 inline scrollers in index.html alone,
// and more get written every month). Matching them properly is the difference between the
// scanner reporting a real gap and reporting a fix it simply could not see.
function buildAttrRules(rules) {
  const out = [];
  rules.forEach(r => {
    const needles = [];
    const re = /\[style\*=("([^"]*)"|'([^']*)')\]/g;
    let m, only = r.selector.replace(/,/g, ' ');
    while ((m = re.exec(r.selector)) !== null) needles.push((m[2] !== undefined ? m[2] : m[3]).toLowerCase());
    if (!needles.length) return;
    // Only honour selectors that are NOTHING BUT style-substring matches, so a rule like
    // `.foo [style*="x"] span` is not applied to every element that happens to match.
    only = only.replace(re, '').trim();
    if (only) return;
    out.push({ needles: needles, decls: r.decls });
  });
  return out;
}

// Resolved declarations for a node: class rules, then id rules, then inline.
function styleFor(node, idx) {
  let out = {};
  if (idx) {
    (idx.attr || []).forEach(a => {
      if (a.needles.some(nd => (node.styleRaw || '').indexOf(nd) !== -1)) {
        out = Object.assign(out, a.decls);
      }
    });
    (node.cls || '').trim().split(/\s+/).filter(Boolean).forEach(c => {
      if (idx.cls[c]) out = Object.assign(out, idx.cls[c]);
    });
    if (node.id && idx.id[node.id]) out = Object.assign(out, idx.id[node.id]);
  }
  return Object.assign(out, node.inline);
}

// ---------------------------------------------------------------- tolerant HTML tree
function parseHtml(src, originLabel) {
  const nodes = [];
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || '';
    const selfClose = m[4] === '/' || VOID_TAGS.has(tag);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const styleM = /style\s*=\s*"([^"]*)"/i.exec(attrStr) || /style\s*=\s*'([^']*)'/i.exec(attrStr);
    const idM = /id\s*=\s*"([^"]*)"/i.exec(attrStr);
    const clsM = /class\s*=\s*"([^"]*)"/i.exec(attrStr);
    const node = {
      tag,
      id: idM ? idM[1] : null,
      cls: clsM ? clsM[1] : '',
      styleRaw: (styleM ? styleM[1] : '').toLowerCase(),
      inline: parseStyle(styleM ? styleM[1] : ''),
      parent: stack.length ? stack[stack.length - 1] : null,
      children: [],
      line: src.slice(0, m.index).split('\n').length,
      origin: originLabel
    };
    if (node.parent) node.parent.children.push(node);
    nodes.push(node);
    if (!selfClose) stack.push(node);
  }
  return nodes;
}

function label(n) {
  const bits = [];
  if (n.id) bits.push('#' + n.id);
  if (n.cls) bits.push('.' + n.cls.trim().split(/\s+/).join('.'));
  if (!bits.length) bits.push('<' + n.tag + '>');
  return bits.join('');
}

// ---------------------------------------------------------------- the checks
function scanTree(nodes, findings, idx) {
  const resolved = new Map();
  const dOf = n => {
    if (!resolved.has(n)) resolved.set(n, styleFor(n, idx));
    return resolved.get(n);
  };

  nodes.forEach(n => {
    const d = dOf(n);

    // --- flex rows -------------------------------------------------------
    // A row shown by JS (`style.display='flex'`) is authored as display:none but still
    // carries its flex properties, so treat that as a flex row too.
    const looksFlex = d['display'] === 'flex' || d['display'] === 'inline-flex' ||
      (d['display'] === 'none' && (d['flex-wrap'] !== undefined || d['gap'] !== undefined));
    if (looksFlex) {
      const column = (d['flex-direction'] || '').indexOf('column') === 0;
      const wraps = (d['flex-wrap'] || '').indexOf('wrap') === 0;
      const kids = n.children;
      if (!wraps && !column) {
        const hundred = kids.filter(c => wantsOwnLine(dOf(c)));
        if (hundred.length) {
          findings.push({
            code: 'NOWRAP_100', origin: n.origin, line: n.line, where: label(n),
            detail: hundred.length + ' child(ren) ask for a full-width line (' +
              hundred.map(label).join(', ') + ') but the row has no flex-wrap, so they ' +
              'cannot break — they shrink on the same line instead'
          });
        }
        const flexKids = kids.filter(c => {
          const cd = dOf(c);
          return cd['flex'] !== undefined || cd['flex-basis'] !== undefined;
        });
        if (flexKids.length >= 5 && !hundred.length) {
          findings.push({
            code: 'NOWRAP_CROWD', origin: n.origin, line: n.line, where: label(n),
            detail: flexKids.length + ' flex cells share one nowrap row — labels wrap and ' +
              'controls truncate below about ' + (flexKids.length * 180) + 'px of width'
          });
        }
      }
    }

    // --- max-height with no way out --------------------------------------
    // A capped shell that DELEGATES scrolling to a descendant is correct, and is the
    // normal modal shape (head / scrolling body / footer). Only flag a cap with no
    // scroller anywhere beneath it.
    const delegatesScroll = (function has(x) {
      return x.children.some(c => isScrollY(dOf(c)) || has(c));
    })(n);
    if (d['max-height'] && d['max-height'] !== 'none' && !isScrollY(d) && !delegatesScroll &&
        d['overflow'] !== 'visible' && d['overflow'] !== 'hidden' &&
        n.tag !== 'img' && n.tag !== 'svg' && n.tag !== 'textarea') {
      findings.push({
        code: 'CLIP', origin: n.origin, line: n.line, where: label(n),
        detail: 'max-height:' + d['max-height'] + ' with no overflow — content past the cap ' +
          'is unreachable and nothing tells the user it exists'
      });
    }

    // --- absolutely pinned inside something that scrolls -------------------
    if (d['position'] === 'absolute' &&
        ((d['top'] !== undefined && d['bottom'] !== undefined) || d['height'] === '100%')) {
      let p = n.parent, host = null;
      while (p) {
        const pd = dOf(p);
        if (isScrollY(pd)) { host = p; break; }
        const pos = pd['position'];
        if (pos === 'relative' || pos === 'absolute' || pos === 'fixed' || pos === 'sticky') break;
        p = p.parent;
      }
      if (host) {
        findings.push({
          code: 'ABS_IN_SCROLL', origin: n.origin, line: n.line, where: label(n),
          detail: 'pinned top/bottom inside the scroll container ' + label(host) +
            ' — it spans the first screenful only and scrolls out of reach'
        });
      }
    }

    // --- a scroll child of a flex line that cannot actually shrink -----------
    // The classic flexbox trap: a flex item's default min-height is `auto`, i.e. its
    // content size. So `flex: 1; overflow-y: auto` inside a column does NOT scroll —
    // the item refuses to shrink below its content and the CAPPED ANCESTOR overflows
    // instead, silently. It looks right until the content gets tall. Needs min-height: 0.
    if (isScrollY(d) && n.parent) {
      const pd = dOf(n.parent);
      const parentIsFlex = pd['display'] === 'flex' || pd['display'] === 'inline-flex';
      const parentIsColumn = (pd['flex-direction'] || '').indexOf('column') === 0;
      const isItem = d['flex'] !== undefined || d['flex-basis'] !== undefined || d['flex-grow'] !== undefined;
      const canShrink = d['min-height'] === '0' || d['min-height'] === '0px' ||
                        d['overflow'] === 'hidden' || d['height'] !== undefined;
      const parentBounded = pd['max-height'] !== undefined || pd['height'] !== undefined ||
                            pd['position'] === 'fixed' || pd['position'] === 'absolute';
      if (parentIsFlex && parentIsColumn && isItem && !canShrink && parentBounded) {
        findings.push({
          code: 'FLEX_MINH', origin: n.origin, line: n.line, where: label(n),
          detail: 'scrolls inside the flex column ' + label(n.parent) + ' but has no ' +
            'min-height:0 — a flex item will not shrink below its content, so this never ' +
            'scrolls and the capped parent overflows instead'
        });
      }
    }

    // --- bounded scrollers that chain ---------------------------------------
    if (isScrollY(d) && !hasOverscroll(d)) {
      const bounded = d['position'] === 'fixed' || d['position'] === 'absolute' ||
        d['position'] === 'sticky' ||
        (d['max-height'] !== undefined && d['max-height'] !== 'none') ||
        (d['height'] !== undefined && d['height'] !== 'auto' && d['height'] !== '100%');
      if (bounded) {
        findings.push({
          code: 'CHAIN', origin: n.origin, line: n.line, where: label(n),
          detail: 'a bounded scroller with no overscroll-behavior — at either end the wheel ' +
            'carries into whatever is behind it, so the two scroll as one'
        });
      }
    }
  });
}

function scanCssRules(rules, findings, idx) {
  // Does ANY rule in the sheet give this selector's element the property? A fix is
  // routinely written as its own grouped rule rather than edited into the original
  // declaration block, and a per-rule check would report it as still missing.
  const covered = (sel, prop) => {
    if (!idx) return false;
    const { comp } = lastComponent(sel);
    const tokens = comp.match(/[.#][A-Za-z0-9_-]+/g) || [];
    return tokens.some(t => {
      const bucket = t[0] === '#' ? idx.id : idx.cls;
      const d = bucket[t.slice(1)];
      return !!(d && (d[prop] !== undefined || d[prop + '-y'] !== undefined));
    });
  };
  rules.forEach(r => {
    const d = r.decls;
    const sel = r.selector;
    if (sel.indexOf('::') !== -1 || /^@/.test(sel)) return;

    // A `display:flex` shell with a cap is the standard modal shape — head, scrolling
    // body, footer — and delegates its scrolling to a child we cannot see from a rule.
    const flexShell = d['display'] === 'flex' || d['display'] === 'inline-flex';
    if (d['max-height'] && d['max-height'] !== 'none' && !isScrollY(d) && !flexShell &&
        d['overflow'] !== 'visible' && d['overflow'] !== 'hidden') {
      findings.push({ code: 'CLIP', origin: 'safety_lab.css', line: 0, where: sel,
        detail: 'max-height:' + d['max-height'] + ' with no overflow — content past the cap is unreachable' });
    }

    if (isScrollY(d) && !hasOverscroll(d) && !covered(sel, 'overscroll-behavior')) {
      const bounded = d['position'] === 'fixed' || d['position'] === 'absolute' ||
        d['position'] === 'sticky' ||
        (d['max-height'] !== undefined && d['max-height'] !== 'none') ||
        (d['height'] !== undefined && d['height'] !== 'auto' && d['height'] !== '100%');
      if (bounded) {
        findings.push({ code: 'CHAIN', origin: 'safety_lab.css', line: 0, where: sel,
          detail: 'a bounded scroller with no overscroll-behavior — the wheel chains into ' +
            'whatever is behind it at either end' });
      }
    }
  });
}

// ---------------------------------------------------------------- entry points
function scanHtmlSource(src, originLabel, idx) {
  const findings = [];
  scanTree(parseHtml(src, originLabel), findings, idx);
  return findings;
}

// Pull HTML out of JS template literals so JS-rendered panels are covered too.
function scanJsSource(src, originLabel, idx) {
  const findings = [];
  const lits = src.match(/`(?:\\[\s\S]|[^`\\])*`/g) || [];
  lits.forEach(lit => {
    if (lit.indexOf('<div') === -1 && lit.indexOf('<section') === -1) return;
    const html = lit.slice(1, -1).replace(/\$\{[^{}]*\}/g, '_');
    scanTree(parseHtml(html, originLabel), findings, idx);
  });
  return findings;
}

function scanCssSource(src) {
  const findings = [];
  const rules = parseCss(src);
  scanCssRules(rules, findings, buildCssIndex(rules));
  return findings;
}

module.exports = {
  specificity, buildAttrRules, parseStyle, flexBasis, wantsOwnLine, isScrollY, hasOverscroll, parseHtml, parseCss,
  buildCssIndex, styleFor, lastComponent, scanHtmlSource, scanJsSource, scanCssSource,
  scanCssRules, label
};
