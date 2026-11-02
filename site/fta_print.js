/* fta_print.js v1.0 (31 Oct 2026): fault trees printed legibly in reports (customer checklist item 22).
 *
 * Every tree prints on landscape sheets with its text at 7.5 pt (never under 7 pt), drawn from the tree's own data,
 * not from whatever happens to be on the canvas. A tree that does not fit one sheet is split: first at its own
 * transfer gates (each transfer names the tree it continues in and that tree's sheet), then at the widest branch
 * that does not fit, which continues on its own sheet behind an off-sheet connector ("Continued on sheet N"); a gate
 * with more inputs than a sheet holds carries its later inputs on a continuation sheet, labelled as such. Nothing
 * is ever scaled down to fit.
 * Sheet: 720 x 500 pt drawing area (a landscape letter page with half-inch margins and a caption line above).
 * API: SLFtaPrint.plan(pages) -> [{ pageId, title, sheet, of, number, svg, w, h, caption }]; png(sheet) -> dataURL.
 */
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var SHEET_W = 720, SHEET_H = 500, PAD = 8;
    var FS = 7.5, FS_ID = 7.5, MIN_FS = 7;            // pt; the tests hold every text at or above MIN_FS
    var CARD_W = 108, SLOT = 116, CARD_H = 52, SYM = 22, GAP_Y = 20;
    var PITCH = CARD_H + 6 + SYM + GAP_Y;             // 100
    var MAX_W = Math.floor((SHEET_W - 2 * PAD) / SLOT);                        // 5 slots... recomputed below
    MAX_W = Math.max(2, Math.floor((SHEET_W - 2 * PAD + (SLOT - CARD_W)) / SLOT)); // 6
    var MAX_L = Math.max(2, Math.floor((SHEET_H - 2 * PAD - (CARD_H + 6 + SYM)) / PITCH) + 1);   // 5
    var CHARS = Math.floor((CARD_W - 8) / (FS * 0.55));                       // characters per line of a card

    function S(v) { return String(v == null ? '' : v); }
    function X(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _kids(n) { return (n && Array.isArray(n.children) ? n.children : (n && Array.isArray(n._children) ? n._children : [])); }
    function _pages() { try { var e = root.SLEnv; if (e && e.get) { var v = e.get('ftaPages'); if (Array.isArray(v)) return v; } } catch (_) {} try { return Array.isArray(root.ftaPages) ? root.ftaPages : []; } catch (_) { return []; } }
    function _num(x) { var v = Number(x); if (!(v > 0) || !isFinite(v)) return ''; var s = v.toExponential(1).toUpperCase(); return s; }
    function _wrap(text, max, lines) {
        var words = S(text).replace(/\s+/g, ' ').trim().split(' '), out = [], cur = '';
        words.forEach(function (w) {
            while (w.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, max - 1) + '-'); w = w.slice(max - 1); }
            if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { out.push(cur); cur = w; }
        });
        if (cur) out.push(cur);
        if (out.length > lines) { out = out.slice(0, lines); out[lines - 1] = out[lines - 1].replace(/.{0,2}$/, '') + '…'; }
        return out;
    }
    function _isTransfer(n) { return !!n && n.type === 'gate' && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }

    // ---- planning one sheet: what is on it, what continues elsewhere --------------------------------------------
    // job: { node, inputs (optional subset of node's inputs for a continuation), from (sheet ref), label }
    function _planSheet(job) {
        var rootN = job.node, cut = new Set(), chunks = [];   // chunks: { node, inputs }
        var kidsOf = function (n) {
            if (n === rootN && job.inputs) return job.inputs;
            if (cut.has(n) || _isTransfer(n)) return [];
            var ch = chunks.find(function (c) { return c.node === n; });
            return ch ? ch.keep.concat([ch.connector]) : _kids(n);
        };
        var guard = 0;
        while (guard++ < 400) {
            var info = new Map();
            (function m(n, d) {
                var ks = kidsOf(n), w = 0, dep = d;
                ks.forEach(function (k) { var r = m(k, d + 1); w += r.w; dep = Math.max(dep, r.d); });
                var r = { w: Math.max(1, w), d: dep, depth: d, kids: ks.length };
                info.set(n, r); return r;
            })(rootN, 1);
            var top = info.get(rootN);
            if (top.d > MAX_L) {
                info.forEach(function (r, n) { if (r.depth === MAX_L && r.kids && n !== rootN && !n.__connector) cut.add(n); });
                continue;
            }
            if (top.w <= MAX_W) break;
            var best = null, bw = 1;
            info.forEach(function (r, n) { if (n === rootN || n.__connector || !r.kids) return; if (r.w > bw || (r.w === bw && best && r.depth < info.get(best).depth)) { best = n; bw = r.w; } });
            if (best) { cut.add(best); continue; }
            // only leaves left under one gate with too many inputs: its later inputs continue on another sheet
            var wide = null, wk = 0;
            info.forEach(function (r, n) { if (r.kids > wk && !n.__connector && !chunks.some(function (c) { return c.node === n; })) { wide = n; wk = r.kids; } });
            if (!wide || wk <= 1) break;
            var all = kidsOf(wide).filter(function (k) { return !k.__connector; });
            var keep = all.slice(0, Math.max(1, MAX_W - 1)), rest = all.slice(keep.length);
            var startIx = (wide === rootN && job.inputs ? (job.firstIx || 1) : 1);
            var conn = { __connector: true, id: 'conn-' + (wide.id || '') + '-' + (startIx + keep.length), name: 'Inputs ' + (startIx + keep.length) + ' to ' + (startIx + all.length - 1) + ' of ' + S(wide.displayId || wide.name), type: 'connector' };
            var prev = chunks.findIndex(function (c) { return c.node === wide; }); if (prev >= 0) chunks.splice(prev, 1);
            if (wide === rootN && job.inputs) { job.inputs = keep.concat([conn]); }
            else chunks.push({ node: wide, keep: keep, connector: conn });
            conn.__cont = { node: wide, inputs: rest, firstIx: startIx + keep.length };
        }
        // lay out: leaves in order take slots, a parent sits over its first and last input
        var slots = 0, place = [], maxDepth = 1;
        (function lay(n, d, parent) {
            var ks = kidsOf(n), rec = { n: n, d: d, parent: parent, x: 0, cut: cut.has(n) };
            place.push(rec); maxDepth = Math.max(maxDepth, d);
            if (!ks.length) { rec.x = slots++; return rec; }
            var cs = ks.map(function (k) { return lay(k, d + 1, rec); });
            rec.x = (cs[0].x + cs[cs.length - 1].x) / 2; rec.kids = cs;
            return rec;
        })(rootN, 1, null);
        var conts = [];
        place.forEach(function (p) {
            if (p.cut) conts.push({ rec: p, job: { node: p.n } });
            if (p.n.__connector) conts.push({ rec: p, job: { node: p.n.__cont.node, inputs: p.n.__cont.inputs, firstIx: p.n.__cont.firstIx, label: p.n.name } });
        });
        return { job: job, place: place, slots: slots, depth: maxDepth, conts: conts };
    }

    // ---- drawing one sheet ------------------------------------------------------------------------------------
    function _symbol(n, cx, y) {
        var s = '', w = 26, h = SYM, l = cx - w / 2, r = cx + w / 2, b = y + h;
        var st = 'fill="#fff" stroke="#1f2937" stroke-width="1"';
        if (n.__connector || n.__cutRef) return '<path d="M' + cx + ' ' + y + ' L' + r + ' ' + b + ' L' + l + ' ' + b + ' Z" ' + st + '/>';
        if (n.type !== 'gate') {
            if (n.type === 'undeveloped') return '<path d="M' + cx + ' ' + y + ' L' + r + ' ' + (y + h / 2) + ' L' + cx + ' ' + b + ' L' + l + ' ' + (y + h / 2) + ' Z" ' + st + '/>';
            if (n.type === 'house') return '<path d="M' + cx + ' ' + y + ' L' + r + ' ' + (y + h * 0.4) + ' L' + r + ' ' + b + ' L' + l + ' ' + b + ' L' + l + ' ' + (y + h * 0.4) + ' Z" ' + st + '/>';
            if (n.type === 'conditional') return '<ellipse cx="' + cx + '" cy="' + (y + h / 2) + '" rx="' + (w / 2 + 3) + '" ry="' + (h / 2 - 2) + '" ' + st + '/>';
            return '<circle cx="' + cx + '" cy="' + (y + h / 2) + '" r="' + (h / 2) + '" ' + st + '/>';
        }
        var g = S(n.gateType).toUpperCase();
        if (g === 'TRANSFER') return '<path d="M' + cx + ' ' + y + ' L' + r + ' ' + b + ' L' + l + ' ' + b + ' Z" ' + st + '/>';
        if (g === 'AND' || g === 'PAND' || g === 'SEQ' || g === 'SPARE') {
            s = '<path d="M' + l + ' ' + b + ' L' + l + ' ' + (y + h * 0.45) + ' A' + (w / 2) + ' ' + (h * 0.45) + ' 0 0 1 ' + r + ' ' + (y + h * 0.45) + ' L' + r + ' ' + b + ' Z" ' + st + '/>';
            if (g !== 'AND') s += '<text x="' + cx + '" y="' + (b - 4) + '" font-size="' + MIN_FS + '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">' + X(g) + '</text>';
            return s;
        }
        if (g === 'INHIBIT') return '<path d="M' + (l + 5) + ' ' + y + ' L' + (r - 5) + ' ' + y + ' L' + r + ' ' + (y + h / 2) + ' L' + (r - 5) + ' ' + b + ' L' + (l + 5) + ' ' + b + ' L' + l + ' ' + (y + h / 2) + ' Z" ' + st + '/>';
        // OR and its family (XOR, k of n, NOT, FDEP): the shield
        s = '<path d="M' + l + ' ' + b + ' Q' + cx + ' ' + (b - 7) + ' ' + r + ' ' + b + ' Q' + r + ' ' + (y + 6) + ' ' + cx + ' ' + y + ' Q' + l + ' ' + (y + 6) + ' ' + l + ' ' + b + ' Z" ' + st + '/>';
        if (g === 'XOR') s += '<path d="M' + l + ' ' + (b + 3) + ' Q' + cx + ' ' + (b - 4) + ' ' + r + ' ' + (b + 3) + '" fill="none" stroke="#1f2937" stroke-width="1"/>';
        var lab = g === 'VOTING' ? ((n.votingK || 2) + '/' + _kids(n).length) : (g === 'OR' ? '' : g);
        if (lab) s += '<text x="' + cx + '" y="' + (b - 5) + '" font-size="' + MIN_FS + '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">' + X(lab) + '</text>';
        return s;
    }
    function _card(n, x, y, extra) {
        var t = '<rect x="' + (x - CARD_W / 2) + '" y="' + y + '" width="' + CARD_W + '" height="' + CARD_H + '" rx="2" fill="#fff" stroke="#1f2937" stroke-width="1"/>';
        var font = ' font-family="Helvetica, Arial, sans-serif"';
        var id = n.__connector ? 'Continued' : S(n.displayId || '');
        var lines = _wrap(n.name || '', CHARS, extra ? 2 : 3);
        var ty = y + 9;
        t += '<text x="' + x + '" y="' + ty + '" font-size="' + FS_ID + '" font-weight="bold" text-anchor="middle"' + font + '>' + X(id) + '</text>';
        lines.forEach(function (ln, i) { t += '<text x="' + x + '" y="' + (ty + 9 * (i + 1)) + '" font-size="' + FS + '" text-anchor="middle"' + font + '>' + X(ln) + '</text>'; });
        var foot = extra || '';
        if (!foot && !n.__connector && n._circular) foot = 'No result: circular transfer';   // 1 Nov 2026 (item 45, fta_loops.js)
        if (!foot && !n.__connector) {
            if (n.type !== 'gate' && (n.inputMode || '') === 'lambda' && Number(n.lambda) > 0) foot = 'λ = ' + _num(n.lambda) + ' /h';
            else if (Number(n.probability) > 0) foot = 'P = ' + _num(n.probability);
        }
        if (foot) t += '<text x="' + x + '" y="' + (y + CARD_H - 4) + '" font-size="' + FS + '" text-anchor="middle"' + font + (extra ? ' font-weight="bold"' : '') + '>' + X(foot) + '</text>';
        return t;
    }
    function _draw(plan, refOf) {
        var used = plan.slots * SLOT - (SLOT - CARD_W);
        var ox = PAD + (SHEET_W - 2 * PAD - used) / 2 + CARD_W / 2, oy = PAD;
        var X0 = function (p) { return ox + p.x * SLOT; }, Y0 = function (p) { return oy + (p.d - 1) * PITCH; };
        var out = '';
        plan.place.forEach(function (p) {
            if (!p.kids) return;
            var px = X0(p), pb = Y0(p) + CARD_H + 6 + SYM, mid = pb + GAP_Y / 2;
            out += '<path d="M' + px + ' ' + pb + ' L' + px + ' ' + mid + '" stroke="#1f2937" stroke-width="1" fill="none"/>';
            if (p.kids.length > 1) out += '<path d="M' + X0(p.kids[0]) + ' ' + mid + ' L' + X0(p.kids[p.kids.length - 1]) + ' ' + mid + '" stroke="#1f2937" stroke-width="1" fill="none"/>';
            p.kids.forEach(function (k) { out += '<path d="M' + X0(k) + ' ' + mid + ' L' + X0(k) + ' ' + Y0(k) + '" stroke="#1f2937" stroke-width="1" fill="none"/>'; });
        });
        plan.place.forEach(function (p) {
            var x = X0(p), y = Y0(p), extra = '', n = p.n;
            var ref = refOf(p);
            if (ref) extra = ref;
            out += _card(n, x, y, extra);
            out += '<path d="M' + x + ' ' + (y + CARD_H) + ' L' + x + ' ' + (y + CARD_H + 6) + '" stroke="#1f2937" stroke-width="1"/>';
            out += _symbol(p.cut ? Object.assign({ __cutRef: true }, n) : n, x, y + CARD_H + 6);
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + SHEET_W + '" height="' + SHEET_H + '" viewBox="0 0 ' + SHEET_W + ' ' + SHEET_H + '"><rect width="100%" height="100%" fill="#fff"/>' + out + '</svg>';
    }

    // ---- every sheet of every tree, numbered; transfers and connectors name the sheet they continue on --------
    function plan(pages, opts) {
        opts = opts || {};
        var list = (pages || []).filter(function (p) { return p && p.root; });
        var startNo = opts.firstNumber || 1;
        var sheets = [], firstSheetOfPage = {};
        list.forEach(function (pg) {
            var queue = [{ node: pg.root }], mine = [];
            while (queue.length && mine.length < 500) {
                var job = queue.shift(), pl = _planSheet(job);
                pl.page = pg; mine.push(pl);
                pl.conts.forEach(function (c) { c.child = { node: c.job.node, inputs: c.job.inputs, firstIx: c.job.firstIx, label: c.job.label, fromPlan: pl }; queue.push(c.child); c.childJob = c.child; });
            }
            mine.forEach(function (pl, i) { pl.ix = i; });
            // map each continuation to the plan made from it
            mine.forEach(function (pl) { pl.conts.forEach(function (c) { c.target = mine.find(function (q) { return q.job === c.childJob; }); }); });
            firstSheetOfPage[pg.id] = sheets.length;
            mine.forEach(function (pl) { sheets.push(pl); });
        });
        sheets.forEach(function (pl, i) { pl.number = startNo + i; });
        var pageName = function (id) { var p = _pages().find(function (x) { return x && x.id === id; }) || list.find(function (x) { return x.id === id; }); return p ? S(p.name || p.id) : S(id); };
        return sheets.map(function (pl) {
            var pgSheets = sheets.filter(function (q) { return q.page === pl.page; });
            var refOf = function (p) {
                var c = pl.conts.find(function (k) { return k.rec === p; });
                if (c && c.target) return 'Continued on sheet ' + c.target.number;
                if (_isTransfer(p.n)) {
                    var to = p.n.transferOutTo || p.n.linkedPageId;
                    if (to && firstSheetOfPage[to] != null) return 'Transfer: sheet ' + sheets[firstSheetOfPage[to]].number;
                    if (to) return 'Transfer: ' + pageName(to).slice(0, CHARS);
                }
                if (p.d === 1 && pl.job.fromPlan) return 'From sheet ' + pl.job.fromPlan.number;
                return '';
            };
            var title = S(pl.page.name || pl.page.id);
            var cap = title + (pgSheets.length > 1 ? ', sheet ' + (pgSheets.indexOf(pl) + 1) + ' of ' + pgSheets.length : '') + (pl.job.label ? ' (' + pl.job.label + ')' : '');
            return { pageId: pl.page.id, title: title, sheet: pgSheets.indexOf(pl) + 1, of: pgSheets.length, number: pl.number, caption: cap,
                     svg: _draw(pl, refOf), w: SHEET_W, h: SHEET_H, nodes: pl.place.length, depth: pl.depth, slots: pl.slots,
                     ids: pl.place.filter(function (p) { return !p.n.__connector && !(p.d === 1 && pl.job.fromPlan); }).map(function (p) { return S(p.n.id); }) };
        });
    }
    // every node of a tree appears on some sheet (connectors aside): the tests hold this
    function coverage(page) {
        var want = new Set(); (function w(n) { if (!n) return; want.add(n); if (!_isTransfer(n)) _kids(n).forEach(w); })(page.root);
        return want.size;
    }
    function png(sheet, scale) {
        scale = scale || 3;
        return new Promise(function (res, rej) {
            try {
                var blob = new Blob([sheet.svg], { type: 'image/svg+xml;charset=utf-8' }), url = URL.createObjectURL(blob), img = new Image();
                img.onload = function () {
                    try {
                        var c = document.createElement('canvas'); c.width = sheet.w * scale; c.height = sheet.h * scale;
                        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
                        URL.revokeObjectURL(url); res(c.toDataURL('image/png'));
                    } catch (e) { rej(e); }
                };
                img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('the tree drawing could not be rendered')); };
                img.src = url;
            } catch (e) { rej(e); }
        });
    }
    var api = { VERSION: VERSION, plan: plan, png: png, coverage: coverage, SHEET_W: SHEET_W, SHEET_H: SHEET_H, MIN_FS: MIN_FS, MAX_W: MAX_W, MAX_L: MAX_L };
    try { root.SLFtaPrint = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
