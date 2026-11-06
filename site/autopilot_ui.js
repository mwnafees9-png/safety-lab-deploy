// autopilot_ui.js (SLAutopilotUI v1.0, 4 Nov 2026): the shared look of the ZSA and PRA Autopilots.
//
// Waqas: "think about it similarly to how we built the planning auto pilot", "the interface should be so intuitive my
// 10 year old daughter should be able to do it". The tool works the analysis out from the model first; a person answers
// only the real choices, one question per screen, with a picture of the aircraft that lights up what the question is
// about, big answer buttons, and under each answer what picking it changes. Built like the CMA four-step flow
// (cma_flow.js): a rail on the left, the step on the right, status worked out, never typed.
//
// This module only draws. The ZSA (zsa_autopilot.js) and PRA (pra_autopilot.js) modules own the analysis, the
// questions and the answers.
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var CSS = ''
        + '.slap{font-size:14px;line-height:1.45}'
        + '.slap-card{background:var(--color-surface-1,#fff);border:1px solid var(--color-border,#e3e5e8);border-left:4px solid #1A6EF2;border-radius:10px;padding:16px 18px;margin:10px 0 16px}'
        + '.slap-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}'
        + '.slap-title{font-size:17px;font-weight:700;margin:0}'
        + '.slap-sub{font-size:13px;color:var(--color-text-secondary,#5b6270)}'
        + '.slap-grid{display:grid;grid-template-columns:270px minmax(0,1fr);gap:18px;align-items:start}'
        + '@media (max-width:900px){.slap-grid{grid-template-columns:1fr}}'
        + '.slap-rail{max-height:640px;overflow:auto;padding-right:4px}'
        + '.slap-rail button{font:inherit;text-align:left;width:100%;display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;margin:0 0 2px;padding:9px 11px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:pointer;color:inherit}'
        + '.slap-rail button.on{border-color:rgba(26,110,242,.35);background:rgba(26,110,242,.06)}'
        + '.slap-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;flex:none;background:#ECECEA;color:#101216}'
        + '.slap-dot.done{background:#1F7A33;color:#fff}.slap-dot.open{background:#B26A00;color:#fff}.slap-dot.on{background:#1A6EF2;color:#fff}'
        + '.slap-rail button>span:last-child{flex:1;min-width:0}.slap-rl{display:block;font-weight:600;font-size:13px}.slap-rs{display:block;font-size:12px;color:var(--color-text-secondary,#5b6270)}'
        + '.slap-q{font-size:19px;font-weight:700;margin:6px 0 4px;line-height:1.3}'
        + '.slap-why{font-size:13.5px;color:var(--color-text-secondary,#5b6270);margin:0 0 12px}'
        + '.slap-opts{display:flex;flex-direction:column;gap:10px;margin:12px 0}'
        + '.slap-opt{font:inherit;text-align:left;display:block;width:100%;padding:13px 16px;border-radius:12px;border:2px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}'
        + '.slap-opt:hover{border-color:#1A6EF2}'
        + '.slap-opt.picked{border-color:#1A6EF2;background:rgba(26,110,242,.07)}'
        + '.slap-ol{display:block;font-size:15.5px;font-weight:700}'
        + '.slap-oi{display:block;font-size:12.5px;margin-top:4px;color:var(--color-text-secondary,#5b6270)}'
        + '.slap-oi b{color:var(--color-text-primary,#101216)}'
        + '.slap-btn{font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer;min-height:36px}'
        + '.slap-btn.p{background:#1A6EF2;border-color:#1A6EF2;color:#fff}'
        + '.slap-btn:disabled{opacity:.45;cursor:default}'
        + '.slap-nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}'
        + '.slap-pic{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px}'
        + '.slap-pic svg{background:#f6f8fb;border:1px solid var(--color-border,#e3e5e8);border-radius:8px;max-width:100%;height:auto}'
        + '.slap-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--color-text-secondary,#5b6270);margin:2px 0 8px}'
        + '.slap-legend i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}'
        + '.slap-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}'
        + '.slap-pill.ok{background:rgba(31,122,51,.12);color:#1F6B30}.slap-pill.open{background:rgba(178,106,0,.13);color:#7A4800}.slap-pill.todo{background:#ECECEA;color:#3a3f47}.slap-pill.info{background:rgba(26,110,242,.12);color:#0A4FB8}'
        + '.slap-tbl{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}'
        + '.slap-tbl th,.slap-tbl td{border-top:1px solid var(--color-border,#e3e5e8);padding:6px 8px;text-align:left;vertical-align:top}'
        + '.slap-tbl th{font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-secondary,#5b6270)}'
        + '.slap-note{font-size:12.5px;color:var(--color-text-secondary,#5b6270)}'
        + '.slap-progress{height:8px;border-radius:99px;background:#ECECEA;overflow:hidden;margin:4px 0 2px;min-width:180px;flex:1}'
        + '.slap-progress>i{display:block;height:100%;background:#1F7A33}';
    function style() {
        if (typeof document === 'undefined' || document.getElementById('slap-style')) return;
        var st = document.createElement('style'); st.id = 'slap-style'; st.textContent = CSS; document.head.appendChild(st);
    }

    // ---- the picture: a top view and a side view of the aircraft ----------------------------------------------
    // shapes: { outline: [{min,max}] (the zones, drawn faint, they make the aircraft's shape), zone: {min,max} (lit),
    // marks: [{min,max,color,label}] (the things the question is about), volumes: [{kind:'sector'|'sphere'|'box', ...}] }
    // Millimeters, x aft, y right, z up.
    function picture(shapes, opts) {
        opts = opts || {};
        var all = [].concat(shapes.outline || [], shapes.zone ? [shapes.zone] : [], shapes.marks || []);
        if (!all.length) return '';
        var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        all.forEach(function (b) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b.min[i]); hi[i] = Math.max(hi[i], b.max[i]); } });
        var W = opts.width || 560, pad = 10;
        var legendHtml = opts.legend ? '<div class="slap-legend">' + opts.legend.map(function (l) { return '<span><i style="background:' + l[0] + '"></i>' + E(l[1]) + '</span>'; }).join('') + '</div>' : '';
        function view(ax, ay, flipY, title, width) {
            var W0 = W; if (width) W = width;
            var r = _view(ax, ay, flipY, title); W = W0; return r;
        }
        function _view(ax, ay, flipY, title) {
            var sx = (W - 2 * pad) / Math.max(1, hi[ax] - lo[ax]);
            sx = Math.min(sx, 260 / Math.max(1, hi[ay] - lo[ay]));   // no view taller than about 300 px
            var Hh = Math.max(60, Math.round((hi[ay] - lo[ay]) * sx) + 2 * pad + 16);
            var X = function (v) { return pad + (v - lo[ax]) * sx; }, Y = function (v) { return flipY ? (Hh - pad - (v - lo[ay]) * sx) : (pad + 16 + (v - lo[ay]) * sx); };
            var rect = function (b, fill, stroke, sw, extra) {
                var x0 = X(b.min[ax]), x1 = X(b.max[ax]), y0 = Y(b.min[ay]), y1 = Y(b.max[ay]);
                return '<rect x="' + Math.min(x0, x1).toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + Math.max(1.5, Math.abs(x1 - x0)).toFixed(1) + '" height="' + Math.max(1.5, Math.abs(y1 - y0)).toFixed(1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (extra || '') + '/>';
            };
            var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '" role="img" aria-label="' + E(title) + '"><text x="' + pad + '" y="13" font-size="11" fill="#5b6270" font-family="system-ui,sans-serif">' + E(title) + '</text>';
            (shapes.outline || []).forEach(function (b) { s += rect(b, 'rgba(120,130,150,.10)', 'rgba(120,130,150,.45)', 0.6); });
            (shapes.volumes || []).forEach(function (v) {
                if (v.kind === 'box') s += rect(v, 'rgba(220,38,38,.10)', 'rgba(220,38,38,.6)', 1, ' stroke-dasharray="4 3"');
                else if (v.kind === 'sphere') s += '<circle cx="' + X(v.center[ax]).toFixed(1) + '" cy="' + Y(v.center[ay]).toFixed(1) + '" r="' + (v.radius * sx).toFixed(1) + '" fill="rgba(220,38,38,.10)" stroke="rgba(220,38,38,.6)" stroke-dasharray="4 3"/>';
                else if (v.kind === 'sector') {   // a burst plane seen edge on (top and side views): a narrow wedge either side of the rotor
                    var c = v.center, h = Math.tan((v.spreadDeg || 15) * Math.PI / 180) * v.range;
                    var pts = [[c[ax], c[ay]], [c[ax] + (ax === 0 ? h : 0), c[ay] + (ay === 0 ? h : v.range)], [c[ax] - (ax === 0 ? h : 0), c[ay] + (ay === 0 ? -h : v.range)]];
                    var pts2 = [[c[ax], c[ay]], [c[ax] + (ax === 0 ? h : 0), c[ay] - (ay === 0 ? h : v.range)], [c[ax] - (ax === 0 ? h : 0), c[ay] - (ay === 0 ? -h : v.range)]];
                    [pts, pts2].forEach(function (P) { s += '<polygon points="' + P.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '" fill="rgba(220,38,38,.12)" stroke="rgba(220,38,38,.55)" stroke-dasharray="4 3"/>'; });
                }
            });
            if (shapes.zone) s += rect(shapes.zone, 'rgba(26,110,242,.16)', '#1A6EF2', 1.6);
            (shapes.marks || []).forEach(function (m) { s += rect(m, m.color || '#DC2626', '#101216', 0.8, m.label ? '><title>' + E(m.label) + '</title></rect' : ''); });
            return s + '</svg>';
        }
        if (opts.focus) {   // the whole aircraft small, then the zone close up from above and from the side
            var whole = view(0, 1, false, 'Where it is', 260);
            var f = opts.focus, g = [0, 1, 2].map(function (i) { return Math.max(400, (f.max[i] - f.min[i]) * 0.12); });
            lo = f.min.map(function (v, i) { return v - g[i]; }); hi = f.max.map(function (v, i) { return v + g[i]; });
            shapes = Object.assign({}, shapes, { outline: (shapes.outline || []).filter(function (b) { return b.max[0] > lo[0] && b.min[0] < hi[0] && b.max[1] > lo[1] && b.min[1] < hi[1]; }) });
            return '<div class="slap-pic">' + whole + view(0, 1, false, 'Close up, from above', 420) + view(0, 2, true, 'Close up, from the side', 420) + '</div>' + legendHtml;
        }
        return '<div class="slap-pic">' + view(0, 1, false, 'Seen from above') + view(0, 2, true, 'Seen from the side') + '</div>' +
            (opts.legend ? '<div class="slap-legend">' + opts.legend.map(function (l) { return '<span><i style="background:' + l[0] + '"></i>' + E(l[1]) + '</span>'; }).join('') + '</div>' : '');
    }

    // 6 Nov 2026 (report_ai.js rebuild): the same picture as ONE standalone svg for a report figure (Word, PDF):
    // the views stacked top to bottom, no HTML wrapper and no legend div. Returns { svg, w, h } or null.
    function figure(shapes, opts) {
        var html = picture(shapes, opts); if (!html) return null;
        var views = html.match(/<svg[\s\S]*?<\/svg>/g) || []; if (!views.length) return null;
        var y = 0, w = 0, body = '';
        views.forEach(function (v) {
            var vw = +((v.match(/width="(\d+)"/) || [])[1] || 0), vh = +((v.match(/height="(\d+)"/) || [])[1] || 0);
            body += v.replace(/^<svg /, '<svg x="0" y="' + y + '" '); y += vh + 6; w = Math.max(w, vw);
        });
        var h = Math.max(1, y - 6);
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '"><rect width="100%" height="100%" fill="#ffffff"/>' + body + '</svg>', w: w, h: h };
    }

    // ---- a question: big buttons, what each answer changes -------------------------------------------------
    // q: { id, text, why, options: [{ id, label, impact }], picked, act } ; act(qid, optionId) is the onclick call
    function question(q, act) {
        return '<div class="slap-q">' + E(q.text) + '</div>' + (q.why ? '<div class="slap-why">' + q.why + '</div>' : '') +
            '<div class="slap-opts" role="radiogroup">' + q.options.map(function (o) {
                return '<button type="button" role="radio" aria-checked="' + (q.picked === o.id) + '" class="slap-opt' + (q.picked === o.id ? ' picked' : '') + '" data-slap-q="' + E(q.id) + '" data-slap-o="' + E(o.id) + '" onclick="' + act + '(' + E(JSON.stringify(q.id)) + ',' + E(JSON.stringify(o.id)) + ')">' +
                    '<span class="slap-ol">' + (q.picked === o.id ? '✓ ' : '') + E(o.label) + '</span>' + (o.impact ? '<span class="slap-oi"><b>What this changes:</b> ' + E(o.impact) + '</span>' : '') + '</button>';
            }).join('') + '</div>';
    }
    function pill(kind, text) { return '<span class="slap-pill ' + kind + '">' + E(text) + '</span>'; }
    function rail(items, act) {
        // items: [{ key, label, sub, state: 'done'|'open'|'todo', on }]
        return '<div class="slap-rail">' + items.map(function (it, i) {
            return '<button type="button" class="' + (it.on ? 'on' : '') + '" data-slap-rail="' + E(it.key) + '" onclick="' + act + '(' + E(JSON.stringify(it.key)) + ')">' +
                '<span class="slap-dot ' + (it.on ? 'on' : it.state) + '">' + (it.state === 'done' && !it.on ? '✓' : (it.state === 'open' && !it.on ? '!' : (i + 1))) + '</span>' +
                '<span><span class="slap-rl">' + E(it.label) + '</span><span class="slap-rs">' + E(it.sub || '') + '</span></span></button>';
        }).join('') + '</div>';
    }
    function progress(done, total) { var f = total ? Math.round(100 * done / total) : 0; return '<div class="slap-progress" title="' + done + ' of ' + total + '"><i style="width:' + f + '%"></i></div>'; }
    // 4 Nov 2026 (Waqas: "the button should still be there, in case users want to import newer models"): the import
    // buttons on both Autopilots, the CAD page's own import (a new revision of the model, or a zone list)
    function importCad() { try { if (typeof root.switchTab === 'function') root.switchTab('cad'); } catch (_) {} try { if (typeof root.cadImportStep === 'function') root.cadImportStep(); } catch (_) {} }
    function importZones() { try { if (typeof root.switchTab === 'function') root.switchTab('cad'); } catch (_) {} try { if (typeof root.cadImportZones === 'function') root.cadImportZones(); } catch (_) {} }
    function openCad() { try { if (typeof root.switchTab === 'function') root.switchTab('cad'); } catch (_) {} }
    function importButtons(hasModel) {
        return '<button type="button" class="slap-btn' + (hasModel ? '' : ' p') + '" data-slap-import="cad" onclick="SLAutopilotUI.importCad()">' + (hasModel ? 'Import a newer CAD model' : 'Import a CAD model (STEP or IGES)') + '</button>' +
            '<button type="button" class="slap-btn" data-slap-import="zones" onclick="SLAutopilotUI.importZones()">Import a zone list</button>' +
            '<button type="button" class="slap-btn" data-slap-import="page" onclick="SLAutopilotUI.openCad()">Open the CAD Model page</button>';
    }
    // what an Autopilot shows with no CAD model yet: what to do, with the buttons; the Aeolus demo adds its own
    function emptyCard(title, what) {
        var adding = !!(root.SLHl1Cad && root.SLHl1Cad.isAeolus && root.SLHl1Cad.isAeolus());
        if (adding) { try { root.SLHl1Cad.ensure(); } catch (_) {} }
        return '<div class="slap slap-card" data-slap-empty="1"><div class="slap-head"><span class="slap-title">' + E(title) + '</span></div>' +
            '<div class="slap-why">' + (adding ? 'Adding the Aeolus HL-1 3D model to this project...' : E(what) + ' Import the CAD model and the zone list first. The table below still works by hand.') + '</div>' +
            '<div class="slap-nav">' + importButtons(false) + '</div></div>';
    }
    // who answered: the signed-in person (4 Nov 2026: it read "Engineer" for a signed-in user)
    function who() {
        try { var ss = (typeof _supabaseSession !== 'undefined' && _supabaseSession) || root._supabaseSession, u0 = ss && ss.user; if (u0 && u0.email) { var md = u0.user_metadata || {}; return md.full_name || md.name || u0.email; } } catch (_) {}
        try { var me = root.SLAvatar && root.SLAvatar.me && root.SLAvatar.me(); if (me && me.name && me.name !== 'Someone') return me.name; } catch (_) {}
        try { if (typeof root._signoffReviewerName === 'function') { var n = root._signoffReviewerName(); if (n) return n; } } catch (_) {}
        try { var u = root.__slUser; if (u && (u.name || u.email)) return u.name || u.email; } catch (_) {}
        return 'Engineer';
    }
    function save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    // a printable report in a new window (the person prints or saves it as PDF from there)
    function openReport(title, html) {
        var w = null; try { w = root.open('', '_blank'); } catch (_) {}
        var doc = '<!doctype html><html><head><meta charset="utf-8"><title>' + E(title) + '</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#101216}h1{font-size:22px}h2{font-size:17px;margin-top:26px;border-bottom:1px solid #ddd;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top;font-size:12.5px}th{background:#f4f5f7}.ok{color:#1F6B30;font-weight:600}.open{color:#7A4800;font-weight:600}.muted{color:#5b6270}svg{background:#f6f8fb;border:1px solid #ddd;border-radius:6px}</style></head><body>' + html + '</body></html>';
        if (w && w.document) { w.document.open(); w.document.write(doc); w.document.close(); return true; }
        try { var b = new Blob([doc], { type: 'text/html' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = title.replace(/[^\w-]+/g, '_') + '.html'; a.click(); } catch (_) {}
        return false;
    }
    root.SLAutopilotUI = { VERSION: VERSION, E: E, importCad: importCad, importZones: importZones, openCad: openCad, importButtons: importButtons, emptyCard: emptyCard, style: style, picture: picture, figure: figure, question: question, pill: pill, rail: rail, progress: progress, who: who, save: save, openReport: openReport };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLAutopilotUI;
})(typeof window !== 'undefined' ? window : globalThis);
