/* report_comments.js (SLReportComments v1.0, 10 Nov 2026): Microsoft Office style live comments on every report.
 *
 * Waqas, 10 Nov 2026: "I want microsoft office style live commenting on every single report which the AI can ingest and
 * address"; "fix with AI option on the comments". The reports: the PRA, ZSA and CMA (the shared report frame,
 * cca_report.js) and the SSPP, HF plan and RAM plan (plan_autopilot.js).
 *
 * What a person does:
 *   select words in a report preview, press Comment (the button by the selection), type, and the comment sits in the
 *   margin beside those words, which are highlighted; reply in the thread, resolve it (it hides, "Show resolved" brings it
 *   back) or reopen it; everyone with the project open sees comments arrive as they are made (the comment store,
 *   reviewCommentsData, is broadcast live and saved with the project, as every review comment already is).
 * Fix with AI (on every thread):
 *   the AI reads the thread, the words commented on and the report section they are in.
 *   - When the words are in a part a person writes (a PRA, ZSA or CMA part, or a plan's "How this will be done"), the AI
 *     proposes the part rewritten to address the comment; the proposal shows in the thread with Accept and Reject.
 *     Accept writes it into the report and resolves the thread with a reply saying what changed and who accepted it.
 *   - When the words are worked out by the tool (from answers, the model or the fault trees), the AI never rewrites them:
 *     it replies with what would have to change (the answer, the record or the model) and where. The thread stays open.
 * In Word, every open comment is a margin comment on the paragraph it was made on, with its replies.
 *
 * Data: reviewCommentsData entries with target { kind: 'report', id: '<doc>§<section>', anchor: { quote, before, after,
 * part } }. <doc>: 'zsa', 'pra', 'cma', 'plan:<sspp|hfp|ramp>' (the plan) or 'plan:<key>:status' (its status report). part: '<cca key>|<section>|<part id>' or
 * 'plan|<plan>|<section>' when the words are in a written part. A proposal is a reply with aiFix { text, part, state }.
 * window.SLReportComments + module.exports (tests).
 */
(function (root) {
  'use strict';
  var VERSION = '1.0';
  var KIND = 'report', SEP = '§';
  function S(v) { return String(v == null ? '' : v); }
  function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function J(v) { return E(JSON.stringify(v)); }
  function R() { return root.Review || (typeof Review !== 'undefined' ? Review : null); }   // eslint-disable-line no-undef
  function all() { try { var d = (root.SLEnv && root.SLEnv.get) ? root.SLEnv.get('reviewCommentsData') : undefined; if (Array.isArray(d)) return d; } catch (_) {} try { return Array.isArray(reviewCommentsData) ? reviewCommentsData : []; } catch (_) { return []; } }   // eslint-disable-line no-undef
  function who() { try { if (root.SLAutopilotUI && root.SLAutopilotUI.who) return root.SLAutopilotUI.who(); } catch (_) {} try { var r = R(); if (r && r.getReviewerName && r.getReviewerName()) return r.getReviewerName(); } catch (_) {} return 'Reviewer'; }
  function norm(t) { return S(t).replace(/\s+/g, ' ').trim(); }
  function changed() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} try { root.dispatchEvent(new CustomEvent('slab-report-comments')); } catch (_) {} }
  var ui = { open: null, resolved: {}, busy: null, msg: null, draft: null, showQs: {} };

  // ---- the store ----------------------------------------------------------------------------------------------------
  function targetId(doc, sec) { return S(doc) + SEP + S(sec || 'front'); }
  function parseId(id) { var i = S(id).indexOf(SEP); return i < 0 ? { doc: S(id), sec: 'front' } : { doc: S(id).slice(0, i), sec: S(id).slice(i + 1) }; }
  function threads(doc, opts) {
    opts = opts || {};
    var list = all(), roots = list.filter(function (c) { return c && c.target && c.target.kind === KIND && !c.parentId && parseId(c.target.id).doc === S(doc); });
    if (!opts.resolved) roots = roots.filter(function (c) { return c.status !== 'resolved'; });
    return roots.map(function (r) { return { root: r, replies: list.filter(function (c) { return c && c.parentId === r.commentId; }).sort(function (a, b) { return a.timestamp - b.timestamp; }) }; });
  }
  function add(doc, sec, anchor, text) {
    var Rv = R(); text = norm(text); if (!Rv || !text) return null;
    var c = Rv.addComment({ kind: KIND, id: targetId(doc, sec), anchor: anchor || null }, text, null, { authorName: who() });
    if (c && anchor && !c.target.anchor) c.target.anchor = anchor;   // an older Review keeps only kind and id
    changed(); return c;
  }
  function reply(rootId, text, opts) { var Rv = R(); text = norm(text); if (!Rv || !text) return null; var root0 = Rv.getById(rootId); if (!root0) return null; var c = Rv.addComment(root0.target, text, rootId, Object.assign({ authorName: who() }, opts || {})); changed(); return c; }
  function resolve(rootId, note) { var Rv = R(); if (!Rv) return false; var ok = Rv.resolveComment(rootId, note || ''); changed(); return ok; }
  function reopen(rootId) { var Rv = R(); if (!Rv) return false; var ok = Rv.reopenComment(rootId); changed(); return ok; }
  function remove(rootId) { var Rv = R(); if (!Rv) return false; var ok = Rv.deleteComment(rootId); changed(); return ok; }

  // ---- where a report preview is, and what it is ---------------------------------------------------------------------
  // a preview element: [data-ccdoc] inside #ccr-host-<key>, or [data-pladoc] for a plan (its kind 'plan' only)
  function docOf(pv) {
    if (!pv) return null;
    if (pv.hasAttribute('data-ccdoc')) { var h = pv.closest('[id^="ccr-host-"]'); return h ? h.id.replace('ccr-host-', '') : null; }
    // the plans (SSPP, HF plan, RAM plan) and their status reports, each its own document
    if (pv.hasAttribute('data-pladoc')) { var P = root.SLPlanAuto; var k = P && P.state && P.state.open; if (!k) return null; return pv.getAttribute('data-plakind') === 'status' ? 'plan:' + k + ':status' : 'plan:' + k; }
    return null;
  }
  function secOfNode(n, pv) {
    var el = n && (n.nodeType === 1 ? n : n.parentElement);
    var s = el && el.closest ? el.closest('[data-ccsec]') : null;
    if (s && pv.contains(s)) return s.getAttribute('data-ccsec');
    // a plan: the nearest section heading before the node
    if (pv.hasAttribute('data-pladoc')) { var hs = pv.querySelectorAll('h3.pla-dh'), last = null; for (var i = 0; i < hs.length; i++) { if (hs[i].compareDocumentPosition(el) & 4) last = hs[i]; } return last ? norm(last.textContent).replace(/^\d+\.\s*/, '') : 'front'; }
    return 'front';
  }
  function partOfNode(n) {
    var el = n && (n.nodeType === 1 ? n : n.parentElement); if (!el || !el.closest) return null;
    var a = el.closest('[data-cc-authp]'); if (a) return a.getAttribute('data-cc-authp');
    var b = el.closest('[data-pla-authp]'); if (b) return 'plan|' + b.getAttribute('data-pla-authp');
    return null;
  }
  function sectionText(pv, sec) {
    var s = pv.querySelector('[data-ccsec="' + S(sec).replace(/"/g, '\\"') + '"]');
    if (s) return norm(s.innerText || s.textContent).slice(0, 20000);
    return norm(pv.innerText || pv.textContent).slice(0, 20000);
  }

  // ---- highlighting the words a comment is on ----------------------------------------------------------------------
  function textNodes(el) { var out = [], w = (el.ownerDocument || document).createTreeWalker(el, 4, { acceptNode: function (n) { var p = n.parentElement; if (!p || p.closest('.rc-rail,.rc-pop,.ccr-auth,.pla-auth,script,style,textarea,button,select')) return 2; return 1; } }); var n; while ((n = w.nextNode())) out.push(n); return out; }
  // find the anchor's words in the preview (the section first), using the words around it when they repeat
  function locate(pv, anchor, sec) {
    if (!anchor || !anchor.quote) return null;
    var scope = (sec && pv.querySelector('[data-ccsec="' + S(sec).replace(/"/g, '\\"') + '"]')) || pv;
    var nodes = textNodes(scope), full = '', map = [];
    nodes.forEach(function (n) { map.push({ n: n, at: full.length }); full += n.nodeValue; });
    var q = anchor.quote, at = -1, from = 0, best = -1;
    while ((at = full.indexOf(q, from)) >= 0) {
      var ok = (!anchor.before || full.slice(Math.max(0, at - anchor.before.length), at) === anchor.before) && (!anchor.after || full.slice(at + q.length, at + q.length + anchor.after.length) === anchor.after);
      if (ok) { best = at; break; } if (best < 0) best = at; from = at + 1;
    }
    if (best < 0) return null;
    var end = best + q.length, range = (pv.ownerDocument || document).createRange(), sN = null, eN = null;
    for (var i = 0; i < map.length; i++) { var m = map[i], len = m.n.nodeValue.length; if (!sN && best < m.at + len) { range.setStart(m.n, best - m.at); sN = m; } if (sN && end <= m.at + len) { range.setEnd(m.n, end - m.at); eN = m; break; } }
    return sN && eN ? range : null;
  }
  function mark(range, id, cls) {
    // wrap each text node piece in the range (a range across paragraphs is wrapped piece by piece)
    var doc = range.startContainer.ownerDocument, nodes = textNodes(range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).filter(function (n) { return range.intersectsNode(n); }), first = null;
    nodes.forEach(function (n) {
      var s = n === range.startContainer ? range.startOffset : 0, e = n === range.endContainer ? range.endOffset : n.nodeValue.length; if (e <= s) return;
      var mid = n.splitText(s); mid.splitText(e - s);
      var m = doc.createElement('mark'); m.className = 'rc-mark ' + (cls || ''); m.setAttribute('data-rc', id); m.textContent = mid.nodeValue; mid.parentNode.replaceChild(m, mid);
      if (!first) first = m;
    });
    return first;
  }

  // ---- the rail and the cards ----------------------------------------------------------------------------------------
  function rel(t) { try { var r = R(); if (r && r.relTime) return r.relTime(t); } catch (_) {} return new Date(t).toLocaleString(); }
  function cardHtml(doc, t, unplaced) {
    var r = t.root, id = r.commentId, res = r.status === 'resolved', a = (r.target && r.target.anchor) || {}, busy = ui.busy === id;
    var btn = function (verb, label, extra) { return '<button type="button" class="rc-b" data-rc-act="' + verb + '" onclick="SLReportComments.act(' + J(verb) + ',' + J(doc) + ',' + J(id) + ',this)"' + (extra || '') + '>' + E(label) + '</button>'; };
    var h = '<div class="rc-card' + (res ? ' rc-res' : '') + (ui.open === id ? ' rc-open' : '') + '" data-rc-card="' + E(id) + '" onclick="SLReportComments.focus(' + J(id) + ')">';
    h += '<div class="rc-q">' + (unplaced ? '<span class="rc-gone">The words this was on have changed: </span>' : '') + '"' + E(S(a.quote).slice(0, 140)) + (S(a.quote).length > 140 ? '...' : '') + '"</div>';
    h += '<div class="rc-c"><b>' + E(r.authorName) + '</b> <span class="rc-t">' + E(rel(r.timestamp)) + '</span><div>' + E(r.text) + '</div></div>';
    t.replies.forEach(function (c) {
      h += '<div class="rc-c rc-r' + (c.aiGenerated ? ' rc-ai' : '') + '"><b>' + E(c.aiGenerated ? 'AI' + (c.filedBy ? ' (asked by ' + c.filedBy + ')' : '') : c.authorName) + '</b> <span class="rc-t">' + E(rel(c.timestamp)) + '</span><div>' + E(c.text) + '</div>';
      if (c.aiFix && c.aiFix.state === 'proposed' && !res) h += '<div class="rc-fix"><div class="rc-fixh">Proposed text for the part (not in the report until accepted):</div><div class="rc-fixt">' + E(c.aiFix.text).replace(/\n/g, '<br>') + '</div><div class="rc-bar">' + btn('accept', 'Accept', ' data-rc-reply="' + E(c.commentId) + '"').replace('this)"', 'this,' + J(c.commentId) + ')"') + btn('reject', 'Reject').replace('this)"', 'this,' + J(c.commentId) + ')"') + '</div></div>';
      if (c.aiFix && c.aiFix.state !== 'proposed') h += '<div class="rc-t">' + (c.aiFix.state === 'accepted' ? 'Accepted' : 'Rejected') + (c.aiFix.by ? ' by ' + E(c.aiFix.by) : '') + '</div>';
      h += '</div>';
    });
    if (ui.msg && ui.msg.id === id) h += '<div class="rc-msg' + (ui.msg.err ? ' rc-err' : '') + '">' + E(ui.msg.text) + '</div>';
    if (!res) h += '<div class="rc-replyrow"><textarea rows="1" placeholder="Reply" data-rc-replytext="' + E(id) + '" onclick="event.stopPropagation()"></textarea></div>';
    h += '<div class="rc-bar">' + (res ? btn('reopen', 'Reopen') : btn('reply', 'Reply') + btn('resolve', 'Resolve') + (busy ? '<span class="rc-t">The AI is working on this...</span>' : btn('fix', 'Fix with AI'))) + btn('delete', 'Delete') + '</div>';
    return h + '</div>';
  }
  // Waqas: "make sure the comment box does not take up more than half of the report pane": the margin is at most 300px and
  // never more than 45% of the pane; "once the comment bubble pops up the questionaire bubble should collapse": the
  // questions beside the report fold away while comments show (Show the questions brings them back).
  var STYLE = '.rc-on{position:relative}.rc-on.rc-wide{padding-right:min(300px,45%)!important}'
    + '.rc-rail{position:absolute;top:0;right:6px;width:calc(min(300px,45%) - 14px);z-index:3;pointer-events:none}.rc-rail .rc-card{pointer-events:auto}'
    + '.ccr-cols.rc-qcollapsed,.pla-cols.rc-qcollapsed{grid-template-columns:minmax(0,1fr)!important}.ccr-cols.rc-qcollapsed>.ccr-left,.pla-cols.rc-qcollapsed>.pla-left{display:none!important}'
    + '.rc-card{position:absolute;left:0;right:0;background:var(--color-surface-1,#fff);border:1px solid var(--color-border,#d4d7dd);border-left:3px solid #E8A33D;border-radius:8px;padding:8px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 2px 8px rgba(10,31,68,.08);color:var(--color-text-primary,#101216)}'
    + '.rc-card.rc-open{border-left-color:#1A6EF2;box-shadow:0 4px 14px rgba(10,31,68,.18);z-index:4}.rc-card.rc-res{border-left-color:#1F7A33;opacity:.85}.rc-q{font-style:italic;margin-bottom:5px;color:var(--color-text-primary,#101216)}.rc-gone{font-style:normal;font-weight:600;color:#9A3412}'
    + '.rc-c{margin:4px 0}.rc-r{margin-left:10px;padding-left:7px;border-left:2px solid var(--color-border,#e3e5e8)}.rc-ai{border-left-color:#7C3AED}.rc-t{font-size:11.5px;color:var(--color-text-primary,#3b4250)}'
    + '.rc-bar{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.rc-b{font:inherit;font-size:12px;padding:3px 8px;border-radius:6px;border:1px solid var(--color-border,#c7cbd1);background:var(--color-surface-2,#f6f7f9);color:inherit;cursor:pointer}'
    + '.rc-replyrow textarea,.rc-new textarea{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;border:1px solid var(--color-border,#c7cbd1);border-radius:6px;padding:5px;background:var(--color-surface-1,#fff);color:inherit;margin-top:5px}'
    + '.rc-fix{margin-top:6px;padding:6px;border:1px dashed #7C3AED;border-radius:6px}.rc-fixh{font-weight:600}.rc-msg{margin-top:5px}.rc-err{color:#B42318;font-weight:600}'
    + 'mark.rc-mark{background:rgba(232,163,61,.28);color:inherit;border-bottom:2px solid #E8A33D;padding:0;cursor:pointer}mark.rc-mark.rc-sel{background:rgba(26,110,242,.22);border-bottom-color:#1A6EF2}'
    + '.rc-pop{position:absolute;z-index:6}.rc-pop button{font:inherit;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:7px;border:none;background:#1A6EF2;color:#fff;cursor:pointer;box-shadow:0 3px 10px rgba(10,31,68,.25)}'
    + '.rc-head{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:0 0 6px;padding:4px 0}.rc-head .rc-b{background:var(--color-surface-1,#fff)}'
    + 'body.theme-dark .rc-card{background:#1B1F26;border-color:#2E333C;color:#E8EAED}body.theme-dark .rc-q,body.theme-dark .rc-t{color:#C9CED6}body.theme-dark .rc-err{color:#FF8A80}body.theme-dark .rc-gone{color:#F2925F}';
  function style(d) { if (d.getElementById('rc-style')) return; var st = d.createElement('style'); st.id = 'rc-style'; st.textContent = STYLE; (d.head || d.documentElement).appendChild(st); }

  // decorate(pv): called by the report frame and the plan page after every redraw of a preview
  function decorate(pv) {
    if (!pv || typeof document === 'undefined') return false;
    var doc = docOf(pv); if (!doc) return false;
    var d = pv.ownerDocument; style(d);
    pv.classList.add('rc-on'); pv.setAttribute('data-rc-doc', doc);
    var old = pv.querySelector(':scope > .rc-rail'); if (old) old.remove();
    // the marks of the last pass come off first (a redraw of the comments alone keeps the report's own text)
    pv.querySelectorAll('mark.rc-mark').forEach(function (m) { var p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    var pop0 = pv.querySelector('.rc-pop'); if (pop0) pop0.remove();
    var oldH = pv.querySelector(':scope > .rc-head'); if (oldH) oldH.remove();
    var showRes = !!ui.resolved[doc], ts = threads(doc, { resolved: showRes }), nres = threads(doc, { resolved: true }).filter(function (t) { return t.root.status === 'resolved'; }).length;
    var head = d.createElement('div'); head.className = 'rc-head';
    head.innerHTML = '<span class="rc-t">Select words in the report to comment on them.</span>' + (nres ? '<button type="button" class="rc-b" onclick="SLReportComments.toggleResolved(' + J(doc) + ')">' + (showRes ? 'Hide resolved' : 'Show resolved (' + nres + ')') + '</button>' : '');
    pv.insertBefore(head, pv.firstChild);
    var any = ts.length > 0 || !!(ui.draft && ui.draft.doc === doc);
    pv.classList.toggle('rc-wide', any);
    // the questions beside the report fold away while comments show, until the person brings them back
    var cols = pv.closest ? pv.closest('.ccr-cols, .pla-cols') : null, fold = any && !ui.showQs[doc];
    if (cols) cols.classList.toggle('rc-qcollapsed', fold);
    // the switch sits in the bar above the report (always in view), else at the top of the report
    if (cols) {
      var bar = cols.querySelector('.ccr-bar, .pla-vt'), oldQ = cols.querySelector('[data-rc-qs]'); if (oldQ) oldQ.remove();
      if (any) { var qb = '<button type="button" class="rc-b" data-rc-qs="1" onclick="SLReportComments.toggleQs(' + J(doc) + ')">' + (fold ? 'Show the questions' : 'Hide the questions') + '</button>'; if (bar) bar.insertAdjacentHTML('afterbegin', qb); else head.insertAdjacentHTML('afterbegin', qb + '<span style="flex:1"></span>'); }
    }
    var rail = d.createElement('div'); rail.className = 'rc-rail'; pv.appendChild(rail);
    var placed = [];
    ts.forEach(function (t) {
      var a = t.root.target.anchor, sec = parseId(t.root.target.id).sec, rg = locate(pv, a, sec), m = rg ? mark(rg, t.root.commentId, ui.open === t.root.commentId ? 'rc-sel' : '') : null;
      placed.push({ t: t, m: m });
    });
    var html = '';
    placed.forEach(function (p) { html += cardHtml(doc, p.t, !p.m); });
    if (ui.draft && ui.draft.doc === doc) html += '<div class="rc-card rc-open rc-new" data-rc-new="1"><div class="rc-q">"' + E(ui.draft.anchor.quote.slice(0, 140)) + '"</div><textarea rows="3" data-rc-newtext="1" placeholder="Your comment"></textarea><div class="rc-bar"><button type="button" class="rc-b" data-rc-act="post" onclick="SLReportComments.post()">Comment</button><button type="button" class="rc-b" onclick="SLReportComments.cancel()">Cancel</button></div></div>';
    rail.innerHTML = html;
    // line each card up with its words, never overlapping the one above
    var top0 = 40, y = 0, pvTop = pv.getBoundingClientRect().top - pv.scrollTop;
    var at = function (el) { return el ? el.getBoundingClientRect().top - pvTop : top0; };
    var cards = rail.querySelectorAll('.rc-card');
    placed.forEach(function (p, i) { var c = cards[i]; var want = p.m ? at(p.m) : top0; var top = Math.max(want, y); c.style.top = top + 'px'; y = top + c.offsetHeight + 8; });
    if (ui.draft && ui.draft.doc === doc) { var nc = rail.querySelector('[data-rc-new]'); var dm = pv.querySelector('mark.rc-mark.rc-draft'); nc.style.top = Math.max(dm ? at(dm) : top0, y) + 'px'; var ta = nc.querySelector('textarea'); try { ta.focus(); } catch (_) {} }
    if (ui.draft && ui.draft.doc === doc && !pv.querySelector('mark.rc-draft')) { var r0 = locate(pv, ui.draft.anchor, ui.draft.sec); if (r0) { mark(r0, 'draft', 'rc-draft rc-sel'); var nc2 = rail.querySelector('[data-rc-new]'), dm2 = pv.querySelector('mark.rc-draft'); if (nc2 && dm2) nc2.style.top = Math.max(at(dm2), y) + 'px'; } }
    rail.style.height = y + 'px';
    if (!any) rail.remove();   // nothing to show: no margin at all
    pv.querySelectorAll('mark.rc-mark').forEach(function (m) { m.onclick = function (ev) { ev.stopPropagation(); var id = m.getAttribute('data-rc'); if (id && id !== 'draft') focus(id); }; });
    bindSelection(pv);
    return true;
  }
  function redrawAll() { if (typeof document === 'undefined') return; document.querySelectorAll('[data-rc-doc]').forEach(function (pv) { decorate(pv); }); }

  // ---- selecting words and commenting ----------------------------------------------------------------------------
  function selectionAnchor(pv) {
    var sel = (pv.ownerDocument.defaultView || root).getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var rg = sel.getRangeAt(0); if (!pv.contains(rg.commonAncestorContainer)) return null;
    var quote = S(rg.toString()); if (norm(quote).length < 2) return null;
    if (quote.length > 600) quote = quote.slice(0, 600);
    var sec = secOfNode(rg.startContainer, pv), part = partOfNode(rg.startContainer);
    // the words around it, so a quote that repeats finds its own place again
    var scope = (pv.querySelector('[data-ccsec="' + S(sec).replace(/"/g, '\\"') + '"]')) || pv, full = '', startAt = -1;
    textNodes(scope).forEach(function (n) { if (n === rg.startContainer) startAt = full.length + rg.startOffset; full += n.nodeValue; });
    var before = startAt >= 0 ? full.slice(Math.max(0, startAt - 24), startAt) : '', after = startAt >= 0 ? full.slice(startAt + quote.length, startAt + quote.length + 24) : '';
    return { anchor: { quote: quote, before: before, after: after, part: part }, sec: sec, rect: rg.getBoundingClientRect() };
  }
  function bindSelection(pv) {
    if (pv._rcBound) return; pv._rcBound = true;
    pv.addEventListener('mouseup', function () {
      setTimeout(function () {
        var d = pv.ownerDocument, old = d.querySelector('.rc-pop'); if (old) old.remove();
        var s = selectionAnchor(pv); if (!s) return;
        var pop = d.createElement('div'); pop.className = 'rc-pop'; pop.innerHTML = '<button type="button" data-rc-act="comment">Comment</button>';
        var pr = pv.getBoundingClientRect(); pop.style.top = (s.rect.bottom - pr.top + pv.scrollTop + 4) + 'px'; pop.style.left = Math.max(0, s.rect.left - pr.left) + 'px';
        pv.appendChild(pop);
        pop.querySelector('button').addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); ui.draft = { doc: docOf(pv), sec: s.sec, anchor: s.anchor }; ui.showQs[ui.draft.doc] = false; pop.remove(); try { (d.defaultView || root).getSelection().removeAllRanges(); } catch (_) {} decorate(pv); });
      }, 10);
    });
  }
  function post() {
    var dr = ui.draft; if (!dr || typeof document === 'undefined') return null;
    var ta = document.querySelector('[data-rc-newtext]'), text = ta ? ta.value : '';
    if (!norm(text)) return null;
    var c = add(dr.doc, dr.sec, dr.anchor, text); ui.draft = null; ui.open = c ? c.commentId : null; redrawAll(); return c;
  }
  function cancel() { ui.draft = null; redrawAll(); }
  function focus(id) { ui.open = id; redrawAll(); }
  function toggleResolved(doc) { ui.resolved[doc] = !ui.resolved[doc]; redrawAll(); }
  function toggleQs(doc) { ui.showQs[doc] = !ui.showQs[doc]; redrawAll(); }

  // ---- Fix with AI --------------------------------------------------------------------------------------------------
  // the written part a comment is on: its text now and how to save it
  function partApi(part) {
    var p = S(part).split('|');
    if (p[0] === 'plan') { var P = root.SLPlanAuto; if (!P) return null; var r = P.authOf(p[1], p.slice(2).join('|')); return { text: (r && r.text) || '', save: function (t) { return P.authSave(p[1], p.slice(2).join('|'), t, 'ai'); }, label: 'the part "' + P.AUTH_TITLE + '" of section "' + p.slice(2).join('|') + '"' }; }
    var C = root.SLCcaReport && root.SLCcaReport.get(p[0]); if (!C || !C.authored) return null;
    var aid = p[p.length - 1], sid = p.slice(1, -1).join('|'), rr = C.authored(sid, aid);
    return { text: (rr && rr.text) || '', save: function (t) { return C.authSave(sid, aid, t, 'ai'); }, label: 'the written part "' + aid + '"' };
  }
  function aiText(res) { return S((res && (res.text || (res.raw && res.raw.content && res.raw.content[0] && res.raw.content[0].text))) || '').trim(); }
  function parseAi(t) { var m = /\{[\s\S]*\}/.exec(S(t)); if (!m) return null; try { return JSON.parse(m[0]); } catch (_) { return null; } }
  async function fix(doc, rootId, pv) {
    var Rv = R(), r0 = Rv && Rv.getById(rootId); if (!r0) throw new Error('That comment is no longer in the project.');
    var AI = root.SafetyLabAI; if (!AI || typeof AI.complete !== 'function') throw new Error('The AI is not set up in this project. Answer the comment yourself, or set the AI up in Settings.');
    var a = r0.target.anchor || {}, sec = parseId(r0.target.id).sec, thread = threads(doc, { resolved: true }).find(function (t) { return t.root.commentId === rootId; });
    var part = a.part ? partApi(a.part) : null;
    pv = pv || (typeof document !== 'undefined' ? document.querySelector('[data-rc-doc="' + doc + '"]') : null);
    var secText = pv ? sectionText(pv, sec) : '';
    var lines = ['THE COMMENT THREAD:', '- ' + r0.authorName + ': ' + r0.text].concat((thread ? thread.replies : []).map(function (c) { return '- ' + (c.aiGenerated ? 'AI' : c.authorName) + ': ' + c.text; }));
    lines.push('', 'THE WORDS COMMENTED ON:', '"' + S(a.quote) + '"', '', 'THE REPORT SECTION THEY ARE IN, AS IT STANDS:', secText || '(not available)');
    if (part) lines.push('', 'THE WORDS ARE IN A PART A PERSON WRITES (' + part.label + '). ITS FULL TEXT NOW:', part.text || '(empty)');
    var system = 'You address review comments on a certification document in Safety Lab Aero. ' + (part
      ? 'The commented words are in a part a person writes. Rewrite that whole part so it addresses the comment, keeping everything in it that the comment does not question. Use only facts in the report section given; never invent a number, ID, severity or requirement. American English, no em dashes, plain words, prose paragraphs only. Answer with JSON only: {"action":"edit","text":"<the whole part rewritten>","reply":"<one or two sentences saying what you changed>"}. If the comment cannot be addressed by rewriting the part (it asks about something the tool works out), answer {"action":"reply","reply":"<what would have to change, and where>"}.'
      : 'The commented words are worked out by the tool (from the answers, the project records, the model or the fault trees): you must not rewrite them. Say plainly what would have to change for the comment to be addressed (which answer, record, model or input, and where in the tool), or answer the question if the comment is a question, using only the facts given. American English, no em dashes, plain words. Answer with JSON only: {"action":"reply","reply":"<your reply>"}.');
    var res = await AI.complete({ feature: 'report.comment.fix', system: system, messages: [{ role: 'user', content: lines.join('\n').slice(0, 60000) }], max_tokens: 1800 });
    var out = parseAi(aiText(res));
    if (!out || !out.action) { var t0 = aiText(res); if (!t0) throw new Error('The AI returned nothing. Try again.'); out = { action: 'reply', reply: t0 }; }
    var opts = { aiGenerated: true, aiModel: (res && res.model) || null, filedBy: who(), authorName: 'AI' };
    if (out.action === 'edit' && part && S(out.text).trim()) {
      var c = reply(rootId, S(out.reply || 'Proposed a rewrite of the part to address this comment.'), opts);
      if (c) { c.aiFix = { text: S(out.text).trim(), part: a.part, state: 'proposed', at: Date.now() }; changed(); }
      return { kind: 'edit', reply: c };
    }
    var c2 = reply(rootId, S(out.reply || 'No change proposed.'), opts);
    return { kind: 'reply', reply: c2 };
  }
  function acceptFix(rootId, replyId) {
    var Rv = R(), c = Rv && Rv.getById(replyId); if (!c || !c.aiFix || c.aiFix.state !== 'proposed') return false;
    var api = partApi(c.aiFix.part); if (!api) throw new Error('The part this proposal is for is no longer in the report.');
    api.save(c.aiFix.text);
    c.aiFix.state = 'accepted'; c.aiFix.by = who(); c.aiFix.at2 = Date.now();
    reply(rootId, 'Accepted the AI\'s rewrite of ' + api.label + ' into the report.');
    resolve(rootId, 'Addressed: the AI\'s rewrite accepted by ' + who() + '.');
    return true;
  }
  function rejectFix(rootId, replyId) { var Rv = R(), c = Rv && Rv.getById(replyId); if (!c || !c.aiFix) return false; c.aiFix.state = 'rejected'; c.aiFix.by = who(); reply(rootId, 'Rejected the AI\'s proposal.'); return true; }

  // ---- the buttons ---------------------------------------------------------------------------------------------------
  function rerenderOwner(doc) {
    try { if (/^plan:/.test(doc)) { if (root.SLPlanAuto) root.SLPlanAuto.render(); } else if (root.SLCcaReport && root.SLCcaReport.get(doc) && root.SLCcaReport.get(doc).render) root.SLCcaReport.get(doc).render(); } catch (_) {}
    redrawAll();
  }
  function act(verb, doc, id, el, replyId) {
    try { if (el && el.closest) { var cd = el.closest('[data-rc-card]'); if (cd && typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation(); } } catch (_) {}   // eslint-disable-line no-restricted-globals
    ui.msg = null; ui.open = id;
    try {
      if (verb === 'reply') { var ta = typeof document !== 'undefined' ? document.querySelector('[data-rc-replytext="' + id + '"]') : null; if (ta && norm(ta.value)) reply(id, ta.value); }
      else if (verb === 'resolve') resolve(id, 'Resolved by ' + who() + '.');
      else if (verb === 'reopen') reopen(id);
      else if (verb === 'delete') { remove(id); ui.open = null; }
      else if (verb === 'accept') { acceptFix(id, replyId); rerenderOwner(doc); return; }
      else if (verb === 'reject') rejectFix(id, replyId);
      else if (verb === 'fix') { ui.busy = id; redrawAll(); fix(doc, id).then(function () { ui.busy = null; redrawAll(); }, function (e) { ui.busy = null; ui.msg = { id: id, text: (e && e.message) || String(e), err: true }; redrawAll(); }); return; }
    } catch (e) { ui.msg = { id: id, text: (e && e.message) || String(e), err: true }; }
    redrawAll();
  }

  // ---- Word: margin comments ------------------------------------------------------------------------------------------
  // annotate(model, doc): each open thread whose words are in a paragraph of the model becomes a margin comment on it
  function annotate(model, doc) {
    if (!model || !Array.isArray(model.blocks)) return model;
    var ts = threads(doc), comments = [], n = 0;
    ts.forEach(function (t) {
      var q = norm((t.root.target.anchor || {}).quote); if (!q) return;
      var b = model.blocks.find(function (x) { return x && x.k === 'p' && norm(x.text).indexOf(q) >= 0; }) || model.blocks.find(function (x) { return x && x.k === 'p' && q.length > 30 && norm(x.text).indexOf(q.slice(0, 30)) >= 0; });
      if (!b) return;
      var id = n++;
      (b.commentIds = b.commentIds || []).push(id);
      comments.push({ id: id, author: t.root.authorName, date: new Date(t.root.timestamp), lines: [t.root.text].concat(t.replies.map(function (c) { return (c.aiGenerated ? 'AI' : c.authorName) + ': ' + c.text; })) });
    });
    if (comments.length) model.comments = comments;
    return model;
  }

  // live: a comment from anyone (here or broadcast from another person) redraws the previews
  if (typeof root.addEventListener === 'function') {
    try { root.addEventListener('slab-report-comments', function () {}); } catch (_) {}
    var sig = '';
    setInterval(function () { try { if (typeof document === 'undefined' || !document.querySelector('[data-rc-doc]')) return; var s0 = all().filter(function (c) { return c && c.target && c.target.kind === KIND; }).map(function (c) { return c.commentId + c.status + (c.aiFix ? c.aiFix.state : ''); }).join(','); if (s0 !== sig) { var first = sig === ''; sig = s0; if (!first && !ui.draft) redrawAll(); } } catch (_) {} }, 1500);
  }
  var api = { VERSION: VERSION, KIND: KIND, targetId: targetId, parseId: parseId, threads: threads, add: add, reply: reply, resolve: resolve, reopen: reopen, remove: remove, decorate: decorate, redrawAll: redrawAll, locate: locate,
              post: post, cancel: cancel, focus: focus, toggleResolved: toggleResolved, toggleQs: toggleQs, fix: fix, acceptFix: acceptFix, rejectFix: rejectFix, act: act, annotate: annotate, partApi: partApi, state: ui };
  try { root.SLReportComments = api; } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
