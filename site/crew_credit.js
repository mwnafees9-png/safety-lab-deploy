// ============================================================================
// crew_credit.js — v1.0 — Q4 + Q5 + Q6 (27 Sep 2026): what the crew is being
// asked to carry, and whether the analysis has earned that credit.
//
// Read before building (27 Sep 2026, downloaded and read in full): FAA AC
// 25.1322-1 §7 and §8, FAA AC 25.1309-1B §5.3.5, §5.4 and §6.3.3.2, 14 CFR
// §25.1322(b), §33.75, §35.15, EASA CS-E 510 + AMC E 510, CS-P 15 / CS-P 150 +
// AMC P 150. Own words throughout; clause numbers and titles only for EASA text.
//
//   Q4  Alert independence. A failure condition that relies on an alert owes the
//       common mode question "can the alert fail from the same cause as the
//       malfunction it announces?" (AC 25.1322-1 §7b and §7d(3); AC 25.1309-1B
//       §5.4.2; CS-E 510(d) / CS-P 150(d) on those bases). The CMA questionnaire
//       carries it as a standing item (cma_walkthrough.js, group "Crew alerting",
//       id al-common). Until it is dispositioned in the scope's questionnaire it
//       is an open item on the Golden Thread and on the wall (INV-61). Second
//       consequence of §5.4.2: for a Catastrophic or Hazardous condition that
//       relies on an alert, the loss of that annunciation is a failure condition
//       in its own right (Major unless shown otherwise); the tool says so when no
//       such row exists in the FHA.
//   Q5  Crew response. A condition rests on crew action when a credited HF task
//       is linked to it or an FCIM aware/unaware pair takes credit for awareness.
//       AC 25.1309-1B §5.3.5.1 asks for three verifications; they become three
//       recorded facts per crew-credited condition: (1) an alert with a class
//       (Warning / Caution / Advisory, §25.1322(b)) covering the condition;
//       (2) an assumed response time and its basis on the credited task (the HF
//       lane's task time; no regulation gives a number, §5.3.5.3); (3) a recorded
//       way the crew recognizes it (the alert's sensory modality). §5.4.3: a
//       condition needing immediate action gets a Warning, so a Hazardous or
//       Catastrophic condition credited with a recovery task and only an Advisory
//       is flagged. §6.3.3.2: crew action is not a substitute for design, so a
//       Hazardous or Catastrophic condition whose ONLY defense is crew action
//       (no AND gate on any linked tree, no non-HF safety requirement traced) is
//       flagged. INV-62.
//   Q6  Engine and propeller anchors. When the cert basis is Part 33 / CS-E or
//       Part 35 / CS-P the FHA form shows the effect classes beside the severity
//       select: Minor / Major / Hazardous engine effect (§33.75(g), CS-E 510(g)),
//       Hazardous / Major propeller effect (§35.15(g), CS-P 15), with the note
//       that Catastrophic is an aircraft-level class (AMC E 510 (3)(a), AMC P 150
//       (3)(a)). §33.75 / §35.15 items are public domain; EASA cited by clause.
//
// Reads through SLEnv (rule 5) with direct-identifier fallback. No eval.
// window.SLCrewCredit + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    var AND_FAMILY = { AND: 1, INHIBIT: 1, PAND: 1, SPARE: 1 };
    var HIGH = { Catastrophic: 1, Hazardous: 1 };
    var PRIORITY_RANK = { Warning: 3, Caution: 2, Advisory: 1 };
    var ALERT_ITEM = 'al-common';   // the standing CMA questionnaire item (cma_walkthrough.js)

    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'acFhaData': return (typeof acFhaData !== 'undefined') ? acFhaData : root.acFhaData;
                case 'acAssumptionsData': return (typeof acAssumptionsData !== 'undefined') ? acAssumptionsData : root.acAssumptionsData;
                case 'acReqData': return (typeof acReqData !== 'undefined') ? acReqData : root.acReqData;
                case 'acFcimData': return (typeof acFcimData !== 'undefined') ? acFcimData : root.acFcimData;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
                case 'ftaPages': return (typeof ftaPages !== 'undefined') ? ftaPages : root.ftaPages;
                case 'projectConfig': return (typeof projectConfig !== 'undefined') ? projectConfig : root.projectConfig;
                case 'activeSystemId': return (typeof activeSystemId !== 'undefined') ? activeSystemId : root.activeSystemId;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _blank(s) { return !String(s == null ? '' : s).trim(); }
    function _pc() { var p = _g('projectConfig'); return (p && typeof p === 'object') ? p : {}; }
    function _list(v) { if (Array.isArray(v)) return v.map(String).map(function (s) { return s.trim(); }).filter(Boolean); return String(v == null ? '' : v).split(',').map(function (s) { return s.trim(); }).filter(Boolean); }

    // ---- stores ------------------------------------------------------------------
    function stores() {
        var out = [{ scope: 'ac', label: 'Aircraft', cmaCtx: 'aircraft', fhas: _arr(_g('acFhaData')), asms: _arr(_g('acAssumptionsData')), reqs: _arr(_g('acReqData')), fcim: _arr(_g('acFcimData')), sys: null }];
        _arr(_g('systemsData')).forEach(function (s) {
            if (!s || s.id == null) return;
            out.push({ scope: 'sys-' + s.id, label: s.name || String(s.id), cmaCtx: 'sys-' + s.id, fhas: _arr(s.fha), asms: _arr(s.asm), reqs: _arr(s.req), fcim: _arr(s.fcim), sys: s });
        });
        return out;
    }
    function storeOf(fha) {
        var hit = null;
        stores().some(function (st) { return st.fhas.some(function (f) { if (f === fha) { hit = st; return true; } return false; }); });
        return hit;
    }
    function fcLabel(f) { return f ? (f.fcId || ('#' + f.internalId)) : ''; }
    function isHigh(f) { return !!(f && HIGH[String(f.severity || '')]); }

    // ---- crew alerting inventory (hf_analyses.js: projectConfig.hf.alerts.rows) -------
    function alerts() {
        var hf = _pc().hf; var rows = (hf && hf.alerts && Array.isArray(hf.alerts.rows)) ? hf.alerts.rows : [];
        return rows.filter(Boolean).map(function (r) {
            return { alertId: String(r.alertId || ''), name: String(r.name || ''), priority: String(r.priority || ''), modality: String(r.modality || ''), fcIds: _list(r.fcIds), notes: String(r.notes || '') };
        });
    }
    function alertsFor(fcId) { var id = String(fcId || ''); return id ? alerts().filter(function (a) { return a.fcIds.indexOf(id) >= 0; }) : []; }
    function bestPriority(list) { var best = ''; list.forEach(function (a) { if ((PRIORITY_RANK[a.priority] || 0) > (PRIORITY_RANK[best] || 0)) best = a.priority; }); return best; }

    // ---- crew task credits (HF-typed assumptions linked to the condition) ---------------
    function isHfAsm(a) {
        if (!a) return false;
        if (a.hf && typeof a.hf === 'object') return true;
        var t = String(a.type || '').toLowerCase();
        return t === 'hf' || t.indexOf('human') >= 0 || t.indexOf('crew') >= 0;
    }
    function crewTasks(st, fha) {
        var ids = _arr(fha && fha.assumptionIds).map(String);
        return st.asms.filter(function (a) { return a && ids.indexOf(String(a.asmId)) >= 0 && isHfAsm(a); }).map(function (a) {
            var h = a.hf || {};
            var t = (h.taskTimeS != null && h.taskTimeS !== '' && !isNaN(+h.taskTimeS)) ? +h.taskTimeS : null;
            return { asm: a, asmId: String(a.asmId), direction: String(h.direction || 'recovery').toLowerCase(), crewmember: String(h.crewmember || ''),
                     taskTimeS: t, basis: String(h.taskTimeBasis || ''), state: String(a.state || ''), text: String(a.text || a.statement || '') };
        });
    }
    // FCIM aware/unaware pair where the AWARE half governs: credit for annunciation.
    function fcimCredit(st, fha) {
        var id = String(fha && fha.fcId || ''); if (!id) return [];
        return st.fcim.filter(function (r) {
            if (!r) return false;
            var cites = [r.tlId, r.plId, r.mId].map(function (x) { return String(x || ''); }).indexOf(id) >= 0;
            return cites && r.pairId && r.pairGoverns === 'aware';
        });
    }
    // ---- other defenses ----------------------------------------------------------------
    function treesFor(fha) {
        return _arr(_g('ftaPages')).filter(function (p) {
            var links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            return links.map(String).indexOf(String(fha.internalId)) >= 0;
        });
    }
    function hasAndGate(node, seen) {
        seen = seen || { n: 0 };
        if (!node || seen.n++ > 20000) return false;
        var kids = node.children || node._children || [];
        if (node.type === 'gate' && AND_FAMILY[String(node.gateType || '').toUpperCase()] && kids.length >= 2) return true;
        for (var i = 0; i < kids.length; i++) if (hasAndGate(kids[i], seen)) return true;
        return false;
    }
    function _isHfReq(r) {
        var g = String(r.reqSource && r.reqSource.generator || '');
        return String(r.analysis || '') === 'Human Factors' || /^(hf-|fcim-monitor|usoc-info)/.test(g) || String(r.type || '') === 'Operational';
    }
    function designReqs(st, fha) {
        return st.reqs.filter(function (r) {
            if (!r || r.deleted || r.status === 'archived' || (r.reqSource && r.reqSource.obsolete)) return false;
            if (String(r.type || '') !== 'Safety') return false;
            if (_isHfReq(r)) return false;
            if (fha.subId && r.traceId && String(r.traceId) === String(fha.subId)) return true;
            var src = r.reqSource || {};
            if (src.context && fha.fcId && String(src.context.fcId || '') === String(fha.fcId)) return true;
            if (src.sourceId && /:fha:/.test(String(src.sourceId)) && String(src.sourceId).indexOf(':' + fha.internalId) >= 0) return true;
            return false;
        });
    }
    // ---- CMA standing item (Q4) ----------------------------------------------------
    function alertItemAnswered(st) {
        var w = _pc().cmaWalk; if (!w || !w[st.cmaCtx]) return null;
        var d = w[st.cmaCtx].disp || {};
        return d[ALERT_ITEM] ? String(d[ALERT_ITEM]) : null;   // 'na' | 'concern' | 'mitigated' | null (unanswered)
    }
    function lossOfAnnunciationRow(st, fha) {
        var own = fha && fha.internalId;
        return st.fhas.find(function (f) {
            if (!f || f === fha || (own != null && String(f.internalId) === String(own))) return false;
            var s = String(f.fcDesc || '') + ' ' + String(f.fcId || '');
            return /\b(loss|failure|absence)\s+of\s+(the\s+)?([\w-]+\s+){0,3}(alert|alerting|annunciation|warning|caution|indication|advisory)\b/i.test(s)
                || /\b(alert|annunciation|warning|indication)\s+(not\s+(provided|presented|given)|fails?|lost|missing)\b/i.test(s)
                || /\b(unannunciated|silent failure|no alert|no warning|no annunciation)\b/i.test(s);
        }) || null;
    }

    // ---- the assessment, per failure condition ---------------------------------------
    function assess(st, fha) {
        st = st || storeOf(fha);
        var out = { fcId: fcLabel(fha), severity: String(fha && fha.severity || ''), high: isHigh(fha), tasks: [], alerts: [], fcim: [], reliesOnCrew: false, reliesOnAlert: false, findings: [] };
        if (!st || !fha) return out;
        out.tasks = crewTasks(st, fha);
        out.fcim = fcimCredit(st, fha);
        out.alerts = alertsFor(fha.fcId);
        out.reliesOnCrew = out.tasks.length > 0 || out.fcim.length > 0;
        out.reliesOnAlert = out.alerts.length > 0 || out.fcim.length > 0 || out.tasks.some(function (t) { return t.direction === 'recovery'; });
        var F = out.findings, id = out.fcId;
        var classed = out.alerts.filter(function (a) { return PRIORITY_RANK[a.priority]; });
        if (out.reliesOnCrew) {
            // Q5 (1): an alert with a class covering the condition
            if (!classed.length) F.push({ code: 'no-alert-class', kind: 'gap', text: id + ' rests on crew action but no alert with a class (Warning / Caution / Advisory) covers it (AC 25.1309-1B §5.3.5.1.1, §25.1322(b))' });
            // Q5 (2): response time and basis on every credited task
            out.tasks.forEach(function (t) {
                if (t.taskTimeS == null) F.push({ code: 'no-response-time', kind: 'gap', text: id + ': credited task ' + t.asmId + ' has no assumed response time (AC 25.1309-1B §5.3.5.1.3)' });
                else if (_blank(t.basis)) F.push({ code: 'no-time-basis', kind: 'warn', text: id + ': credited task ' + t.asmId + ' assumes ' + t.taskTimeS + ' s with no stated basis (AC 25.1309-1B §5.3.5.2)' });
            });
            // Q5 (3): how the crew recognizes it
            if (classed.length && !classed.some(function (a) { return !_blank(a.modality); })) F.push({ code: 'no-recognition', kind: 'warn', text: id + ': the alert(s) covering it record no sensory modality, so how the crew recognizes the condition is not stated (AC 25.1309-1B §5.3.5.1.2)' });
            // Q5 (4): immediate action deserves a Warning
            if (out.high && out.tasks.some(function (t) { return t.direction === 'recovery'; }) && classed.length && bestPriority(classed) === 'Advisory')
                F.push({ code: 'advisory-only', kind: 'gap', text: id + ' (' + out.severity + ') is credited with a crew recovery task but its only alert is an Advisory; a condition needing crew action gets a Warning or Caution (AC 25.1309-1B §5.4.3, §25.1322(b))' });
            // Q5 (5): crew action as the only defense
            if (out.high) {
                var redundancy = treesFor(fha).some(function (p) { return hasAndGate(p.root); });
                var design = designReqs(st, fha);
                if (!redundancy && !design.length) F.push({ code: 'only-defense', kind: 'gap', text: id + ' (' + out.severity + '): crew action is the only defense on record (no AND gate on a linked tree, no non-HF safety requirement traced); crew action is not a substitute for design (AC 25.1309-1B §6.3.3.2)' });
                out.onlyDefense = !redundancy && !design.length;
            }
        }
        if (out.reliesOnAlert) {
            // Q4 (1): the standing CMA question
            var ans = alertItemAnswered(st);
            if (!ans) F.push({ code: 'alert-cma-open', kind: 'warn', text: id + ' relies on an alert and the common mode question "can the alert fail from the same cause as the malfunction?" is unanswered in the ' + st.label + ' CMA questionnaire (AC 25.1322-1 §7b, §7d(3))' });
            out.alertCma = ans;
            // Q4 (2): loss of annunciation is itself a failure condition
            if (out.high) {
                var loa = lossOfAnnunciationRow(st, fha);
                out.lossOfAnnunciation = loa ? fcLabel(loa) : null;
                if (!loa) F.push({ code: 'no-loss-of-annunciation-fc', kind: 'warn', text: id + ' (' + out.severity + ') relies on an alert but the FHA has no failure condition for the loss of that annunciation (Major unless shown otherwise, AC 25.1309-1B §5.4.2)' });
            }
        }
        return out;
    }
    function assessAll() {
        var out = [];
        stores().forEach(function (st) { st.fhas.forEach(function (f) { if (f) { var a = assess(st, f); a.scope = st.scope; a.label = st.label; a.fha = f; out.push(a); } }); });
        return out;
    }
    function findings(codes) {
        var out = [];
        assessAll().forEach(function (a) { a.findings.forEach(function (f) { if (!codes || codes.indexOf(f.code) >= 0) out.push({ scope: a.scope, label: a.label, fcId: a.fcId, code: f.code, kind: f.kind, text: a.label + ': ' + f.text }); }); });
        return out;
    }
    var Q4_CODES = ['alert-cma-open', 'no-loss-of-annunciation-fc'];
    var Q5_CODES = ['no-alert-class', 'no-response-time', 'no-time-basis', 'no-recognition', 'advisory-only', 'only-defense'];
    var INV_ALERT = { id: 'INV-61', sev: 'advisory',
        name: 'Every failure condition that relies on an alert has the alert-independence question answered in the CMA, and (Cat/Haz) a loss-of-annunciation condition (AC 25.1322-1 §7, AC 25.1309-1B §5.4.2)',
        run: function () { var n = assessAll().filter(function (a) { return a.reliesOnAlert; }).length; var f = findings(Q4_CODES); return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; } };
    var INV_CREW = { id: 'INV-62', sev: 'advisory',
        name: 'Every failure condition that rests on crew action records the alert class, the assumed response time and how the crew recognizes it; Cat/Haz never rests on crew action alone (AC 25.1309-1B §5.3.5, §5.4.3, §6.3.3.2)',
        run: function () { var n = assessAll().filter(function (a) { return a.reliesOnCrew; }).length; var f = findings(Q5_CODES); return { checked: n, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV_ALERT); root.invRegister(INV_CREW); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- Golden Thread stage -------------------------------------------------------
    function threadStage(fha) {
        if (!fha) return '';
        var st = storeOf(fha); if (!st) return '';
        var a = assess(st, fha);
        if (!a.reliesOnCrew && !a.reliesOnAlert) return '';
        var lines = [];
        if (a.tasks.length) lines.push('Crew tasks credited: ' + a.tasks.map(function (t) { return '<b>' + _esc(t.asmId) + '</b> (' + _esc(t.direction) + (t.crewmember ? ', ' + _esc(t.crewmember) : '') + (t.taskTimeS != null ? ', ' + t.taskTimeS + ' s' : ', no time') + ')'; }).join(' · '));
        if (a.fcim.length) lines.push('FCIM awareness credit: ' + a.fcim.map(function (r) { return '<b>' + _esc(r.pairId) + '</b>'; }).join(' · '));
        lines.push(a.alerts.length ? 'Alerts: ' + a.alerts.map(function (x) { return '<b>' + _esc(x.alertId) + '</b> ' + _esc(x.priority || 'no class') + (x.modality ? ' / ' + _esc(x.modality) : ''); }).join(' · ') : 'Alerts: none recorded for this condition');
        if (a.reliesOnAlert) lines.push('Alert independence (CMA): ' + (a.alertCma ? '<b>' + _esc(a.alertCma) + '</b>' : '<span style="color:#9A6200;font-weight:600;">unanswered</span> <a href="#" onclick="SLCrewCredit.openCma(\'' + _esc(st.scope) + '\');return false;" style="font-weight:600;">answer in the CMA questionnaire</a>'));
        if (a.high && a.reliesOnAlert) lines.push('Loss of annunciation condition: ' + (a.lossOfAnnunciation ? '<b>' + _esc(a.lossOfAnnunciation) + '</b>' : '<span style="color:#9A6200;font-weight:600;">none in the FHA</span>'));
        a.findings.forEach(function (f) { lines.push('<span style="color:' + (f.kind === 'gap' ? '#8E2A2A' : '#9A6200') + ';font-weight:600;">&#9679;</span> ' + _esc(f.text)); });
        var gaps = a.findings.filter(function (f) { return f.kind === 'gap'; }).length, warns = a.findings.length - gaps;
        var status = gaps ? 'gap' : (warns ? 'warn' : 'ok');
        var body = lines.join('<br>') + '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">' + (a.findings.length ? gaps + ' gap' + (gaps === 1 ? '' : 's') + ', ' + warns + ' to check' : 'alert class, response time, recognition and independence all on record') + '.</div>';
        return (typeof _gtStage === 'function') ? _gtStage('Crew credit', body, status) : '';
    }
    function _wrapThread() {
        var orig = root._renderGoldenThread;
        if (typeof orig !== 'function' || orig._ccWrapped) return false;
        var w = function (fha) {
            var html = orig.apply(this, arguments);
            try {
                var stage = threadStage(fha);
                if (stage) {
                    var i = html.indexOf('>Verification</span>');
                    var at = i >= 0 ? html.lastIndexOf('<div style="border:1px solid var(--color-border-hair)', i) : -1;
                    html = at >= 0 ? html.slice(0, at) + stage + html.slice(at) : html + stage;
                }
            } catch (_) {}
            return html;
        };
        w._ccWrapped = true; root._renderGoldenThread = w; return true;
    }
    function openCma(scope) {
        try {
            if (scope === 'ac' && typeof root.cmaWalkthrough === 'function') return root.cmaWalkthrough('aircraft', 'Aircraft');
            if (/^sys-/.test(String(scope)) && typeof root.cmaWalkthroughSys === 'function') return root.cmaWalkthroughSys(String(scope).slice(4));
        } catch (_) {}
    }

    // ---- FHA row badge ---------------------------------------------------------------
    function badgeHtml(a) {
        if (!a || !a.findings.length) return '';
        var gaps = a.findings.filter(function (f) { return f.kind === 'gap'; }).length;
        var title = a.findings.map(function (f) { return f.text; }).join('\n');
        return '<span data-cc-badge="1" title="' + _esc(title) + '" style="display:inline-block;margin-left:6px;padding:1px 7px;font-size:10px;font-weight:700;border-radius:9px;border:1px solid ' + (gaps ? '#8E2A2A' : '#9A6200') + ';color:' + (gaps ? '#8E2A2A' : '#9A6200') + ';background:var(--color-surface-2);white-space:nowrap;">crew credit ' + a.findings.length + '</span>';
    }
    function decorateFhaTable(scope) {
        var d = root.document; if (!d) return 0;
        var tbody = d.getElementById(scope === 'ac' ? 'ac-fha-body' : 'sys-fha-body'); if (!tbody) return 0;
        var st = null;
        if (scope === 'ac') st = stores()[0];
        else { var a = _g('activeSystemId'); stores().some(function (s) { if (s.scope === 'sys-' + a) { st = s; return true; } return false; }); }
        if (!st) return 0;
        var byFc = {};
        st.fhas.forEach(function (f) { if (!f || !f.fcId) return; var r = assess(st, f); var k = String(f.fcId); if (!byFc[k]) byFc[k] = { findings: [] }; r.findings.forEach(function (x) { if (!byFc[k].findings.some(function (y) { return y.code === x.code && y.text === x.text; })) byFc[k].findings.push(x); }); });
        var n = 0;
        Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr) {
            if (tr.getAttribute('data-cc') === '1') return;
            var cells = tr.querySelectorAll('td'); if (cells.length < 7) return;
            var fcId = String(cells[2].textContent || '').trim().split(/\s+/)[0];
            var hit = byFc[fcId];
            if (hit && hit.findings.length) cells[6].insertAdjacentHTML('beforeend', badgeHtml({ findings: hit.findings }));
            tr.setAttribute('data-cc', '1'); n++;
        });
        return n;
    }

    // ---- Q6 anchors ------------------------------------------------------------------
    function basisFamily(reg) {
        var k = String(reg == null ? (_pc().regulation || '') : reg);
        if (/^Part 33\b/i.test(k) || /^CS-E\b/i.test(k)) return 'engine';
        if (/^Part 35\b/i.test(k) || /^CS-P\b/i.test(k)) return 'propeller';
        return '';
    }
    var ENGINE_ANCHORS = {
        title: 'Engine effect classes, 14 CFR §33.75(g) / CS-E 510(g)',
        note: 'An engine analysis uses three levels. Catastrophic is an aircraft-level class; the installer reclassifies at aircraft level (AMC E 510 (3)(a)). Objectives: Hazardous not more than extremely remote, Major not more than remote (§33.75(a)(3)-(4), CS-E 510(a)(3)-(4)).',
        rows: [
            { sev: 'Minor', head: 'Minor engine effect, §33.75(g)(1) / CS-E 510(g)(1)', items: ['only consequence is partial or complete loss of thrust or power, and the engine services that go with it'] },
            { sev: 'Major', head: 'Major engine effect, §33.75(g)(3) / CS-E 510(g)(3)', items: ['an effect between the minor and the hazardous lists (AMC E 510 (3)(e) gives typical examples)'] },
            { sev: 'Hazardous', head: 'Hazardous engine effects, §33.75(g)(2) / CS-E 510(g)(2)', items: ['non-containment of high-energy debris', 'toxic products in the cabin bleed air enough to incapacitate crew or passengers', 'significant thrust opposite to the commanded direction', 'uncontrolled fire', 'engine mount failure leading to separation', 'release of the propeller by the engine', 'complete inability to shut the engine down'] }
        ]
    };
    var PROP_ANCHORS = {
        title: 'Propeller effect classes, 14 CFR §35.15(g) / CS-P 15 (terminology), analysis per §35.15 / CS-P 150',
        note: 'A propeller analysis uses two levels above minor. Catastrophic is an aircraft-level class (AMC P 150 (3)(a)). Objectives: Hazardous not more than extremely remote (§35.15(a)(3), CS-P 150(a)(3)); Major not more than remote under CS-P 150(a)(4), no Major objective in §35.15.',
        rows: [
            { sev: 'Major', head: 'Major propeller effects (variable pitch), §35.15(g)(2) / CS-P 15', items: ['inability to feather', 'inability to change pitch when commanded', 'uncommanded pitch change', 'uncontrollable torque or speed fluctuation'] },
            { sev: 'Hazardous', head: 'Hazardous propeller effects, §35.15(g)(1) / CS-P 15', items: ['development of excessive drag', 'significant thrust opposite to the commanded direction', 'release of the propeller or a major portion of it', 'a failure that results in excessive unbalance'] }
        ]
    };
    function anchorsFor(reg) { var f = basisFamily(reg); return f === 'engine' ? ENGINE_ANCHORS : (f === 'propeller' ? PROP_ANCHORS : null); }
    function anchorsHtml(reg) {
        var a = anchorsFor(reg); if (!a) return '';
        return '<div style="font-size:11px;line-height:1.45;color:var(--color-text-secondary);border:1px solid var(--color-border-hair);border-left:3px solid var(--color-accent);border-radius:var(--r-md);padding:6px 10px;margin:4px 0 8px;">'
            + '<div style="font-weight:700;color:var(--color-text-primary);">Severity anchors: ' + _esc(a.title) + '</div>'
            + a.rows.map(function (r) { return '<div style="margin-top:3px;"><b>' + _esc(r.sev) + '</b> = ' + _esc(r.head) + ': ' + r.items.map(_esc).join('; ') + '.</div>'; }).join('')
            + '<div style="margin-top:3px;font-style:italic;">' + _esc(a.note) + '</div></div>';
    }
    function renderAnchors() {
        var d = root.document; if (!d) return 0;
        var n = 0;
        ['ac-fha-sev', 'sys-fha-sev'].forEach(function (id) {
            var sel = d.getElementById(id); if (!sel || !sel.parentNode) return;
            var hostId = 'cc-anchors-' + id;
            var host = d.getElementById(hostId);
            var html = anchorsHtml();
            if (!html) { if (host) host.innerHTML = ''; return; }
            if (!host) { host = d.createElement('div'); host.id = hostId; sel.parentNode.insertBefore(host, sel.nextSibling); }
            host.innerHTML = html; n++;
        });
        return n;
    }

    // ---- hooks -------------------------------------------------------------------------
    var _observed = {};
    function _observe(id, fn) {
        var d = root.document; if (!d || typeof root.MutationObserver !== 'function' || _observed[id]) return false;
        var tb = d.getElementById(id); if (!tb) return false;
        var pending = false;
        var mo = new root.MutationObserver(function () { if (pending) return; pending = true; setTimeout(function () { pending = false; try { fn(); } catch (_) {} }, 0); });
        mo.observe(tb, { childList: true }); _observed[id] = mo; return true;
    }
    function _wrapRender(name, fn) {
        var orig = root[name];
        if (typeof orig !== 'function' || orig._ccWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { fn(); } catch (_) {} return r; };
        w._ccWrapped = true; root[name] = w; return true;
    }
    function watchTables() {
        return [_observe('ac-fha-body', function () { decorateFhaTable('ac'); }), _observe('sys-fha-body', function () { decorateFhaTable('sys'); })].every(Boolean);
    }
    (function hook(tries) {
        var ok = [_wrapThread(), watchTables(),
                  _wrapRender('renderACFHA', function () { decorateFhaTable('ac'); renderAnchors(); }),
                  _wrapRender('renderSysFHA', function () { decorateFhaTable('sys'); renderAnchors(); })];
        try { renderAnchors(); } catch (_) {}
        if (ok.some(function (x) { return !x; }) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);

    var api = { AND_FAMILY: AND_FAMILY, PRIORITY_RANK: PRIORITY_RANK, ALERT_ITEM: ALERT_ITEM, Q4_CODES: Q4_CODES, Q5_CODES: Q5_CODES,
                stores: stores, storeOf: storeOf, alerts: alerts, alertsFor: alertsFor, bestPriority: bestPriority, isHfAsm: isHfAsm, crewTasks: crewTasks, fcimCredit: fcimCredit,
                treesFor: treesFor, hasAndGate: hasAndGate, designReqs: designReqs, alertItemAnswered: alertItemAnswered, lossOfAnnunciationRow: lossOfAnnunciationRow,
                assess: assess, assessAll: assessAll, findings: findings, INV_ALERT: INV_ALERT, INV_CREW: INV_CREW,
                threadStage: threadStage, openCma: openCma, badgeHtml: badgeHtml, decorateFhaTable: decorateFhaTable,
                basisFamily: basisFamily, anchorsFor: anchorsFor, anchorsHtml: anchorsHtml, renderAnchors: renderAnchors, ENGINE_ANCHORS: ENGINE_ANCHORS, PROP_ANCHORS: PROP_ANCHORS,
                watchTables: watchTables, _observe: _observe, _wrapThread: _wrapThread, _wrapRender: _wrapRender };
    try { root.SLCrewCredit = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
