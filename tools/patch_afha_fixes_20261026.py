#!/usr/bin/env python3
# 26 Oct 2026: three AFHA drafting fixes found on the live Aeolus run (empty turns counted as returned, rows with no
# failure condition accepted as blank rows, bold tags shown as text in review panel notes). Applied once; kept for the record.
p = 'site/ai_assistant.js'; s = open(p).read()
R = [
# ---- 1. an empty turn is not a returned turn: retried, then reported as not completed
("""                    _results[_ci] = { ok: true, a: await _anemRun(_mkMessages(_extra), _sysExtra, _chunk ? _CHUNK_TURN_TOKENS : undefined, 0, _sysBreaks, _batchLane), tries: _try };   // 5 Sep — analysis batches at temperature 0
                    if (_try > 1) _retried++;
                    return;""",
"""                    const _a = await _anemRun(_mkMessages(_extra), _sysExtra, _chunk ? _CHUNK_TURN_TOKENS : undefined, 0, _sysBreaks, _batchLane);   // 5 Sep — analysis batches at temperature 0
                    // 26 Oct 2026 (live Aeolus AFHA run): a turn that came back with no rows for its slice was
                    // counted as returned, never tried again, and the run said every turn was done. A slice of
                    // work that comes back empty is not done: it is tried again like a failed turn, and if it is
                    // still empty it is reported as not completed (its reply, if any, is kept for the notes).
                    if (_slice && _emptyTurn(_a)) { const _ee = new Error('the reply came back with no rows for its ' + _slice.length + ' ' + String(_chunk.noun || 'item') + (_slice.length === 1 ? '' : 's')); _ee.emptyTurn = true; _ee.a = _a; throw _ee; }
                    _results[_ci] = { ok: true, a: _a, tries: _try };
                    if (_try > 1) _retried++;
                    return;"""),
("""        const _results = new Array(_slices.length);
        const _runSlice = async function (_ci) {""",
"""        const _results = new Array(_slices.length);
        // 26 Oct 2026: a turn with no actions at all (unreadable, or readable with nothing in it)
        const _emptyTurn = function (a) { const pp = a && a.parsed; return !(pp && Array.isArray(pp.actions) && pp.actions.length); };
        let _emptyTurns = 0;
        const _runSlice = async function (_ci) {"""),
("""                if (e && e.isInsufficient) {
                    if (!_declined) _declined = { parsed: e.parsed, insufficient: e.insufficient };
                    continue;   // one slice declining must not discard the slices that worked
                }
                if (!_hardErr) _hardErr = e;
                continue;""",
"""                if (e && e.isInsufficient) {
                    if (!_declined) _declined = { parsed: e.parsed, insufficient: e.insufficient };
                    continue;   // one slice declining must not discard the slices that worked
                }
                if (e && e.emptyTurn) {   // 26 Oct 2026: empty after every try; its cause is kept
                    _emptyTurns++;
                    const _ea = e.a || {};
                    if (!_ea.parsed) { _unparsed++; if (!_rawTail) _rawTail = String((_ea.rr && _ea.rr.text) || '').replace(/\\s+/g, ' ').trim().slice(0, 240); }
                    else if (_ea.parsed.reply) _replies.push(String(_ea.parsed.reply));
                }
                if (!_hardErr) _hardErr = e;
                continue;"""),
("""        if (!actions.length) {
            if (_declined) { _anemNoActionsPanel(cfg, _declined.parsed, _declined.insufficient, _rerun); return; }""",
"""        if (!actions.length) {
            if (_declined) { _anemNoActionsPanel(cfg, _declined.parsed, _declined.insufficient, _rerun); return; }
            if (_emptyTurns && !_permanentErr && _emptyTurns === _slices.length - _slicesRun) {   // 26 Oct 2026: every turn came back empty
                _anemNoActionsPanel(cfg, { reply: 'Nothing drafted: ' + _emptyTurns + ' of ' + _slices.length + ' turn(s) came back with no rows after ' + _TURN_TRIES + ' tries each.' + (_unparsed ? (' ' + _unparsed + ' of them were not the JSON asked for' + (_rawTail ? '; the reply began: "' + _rawTail + '"' : '') + '.') : '') + (_replies.length ? ' What the model said: ' + _replies.join(' ') : ' The model gave no reason.'), actions: [], choices: [] }, null, _rerun);
                return;
            }"""),
("""                + ((_slices.length - _slicesRun) ? (' — ' + (_slices.length - _slicesRun) + ' still failed'""",
"""                + (_emptyTurns ? (', ' + _emptyTurns + ' came back empty after ' + _TURN_TRIES + ' tries') : '')
                + ((_slices.length - _slicesRun) ? (' — ' + (_slices.length - _slicesRun) + ' still failed'"""),
# ---- 2a. a drafted FHA row that names no failure condition never reaches the review panel
("""        const parsed = { reply: _replies.join(' '), actions: actions, assumptions: _batchAsms };""",
"""        // 26 Oct 2026 (live Aeolus AFHA: FC-002, FC-003 and FC-004 landed as empty rows). A drafted FHA row with no
        // failure condition text and no condition id to find it by is not a row: it is left out here, and the
        // panel says how many, so the coverage note names the conditions still to draft. A row that carries a
        // condition id is kept: on accept its text comes from the FCIM (_applyFhaSuggestion).
        let _noCond = 0;
        for (let _i = actions.length - 1; _i >= 0; _i--) {
            const _x = actions[_i];
            if (_x && (_x.op === 'add_fha') && !String(_x.fcDesc || '').trim() && !String(_x.srcCondId || '').trim()) { actions.splice(_i, 1); _noCond++; }
        }
        if (_noCond) { try { console.info('[AI] ' + _noCond + ' drafted FHA row(s) named no failure condition and were left out'); } catch (_) {} }
        const parsed = { reply: _replies.join(' '), actions: actions, assumptions: _batchAsms };"""),
("""                return 'Advisory drafts from the unified AI engine. Severities are proposed for your confirmation. Accept applies through the same executor + safeguards as the live assistant.'
                     + (_jc ? (' <b style="color:#7A5300;">' + _jc + ' row' + (_jc === 1 ? '' : 's') + ' classified by JUDGMENT on limited information — each is flagged and its assumption is filed on accept.</b>') : '');""",
"""                return 'Advisory drafts from the unified AI engine. Severities are proposed for your confirmation. Accept applies through the same executor + safeguards as the live assistant.'
                     + (_jc ? (' **' + _jc + ' row' + (_jc === 1 ? '' : 's') + ' classified by JUDGMENT on limited information: each is flagged and its assumption is filed on accept.**') : '')
                     + (_noCond ? (' **' + _noCond + ' drafted row' + (_noCond === 1 ? '' : 's') + ' named no failure condition and ' + (_noCond === 1 ? 'was' : 'were') + ' left out; draft those conditions again.**') : '');"""),
# ---- 2b. the one writer refuses a row with no failure condition
("""            } catch (_) { _srcHit = null; }
            // 3 Sep 2026 — THE TOP STEP IS JOINT (Waqas)""",
"""            } catch (_) { _srcHit = null; }
            // 26 Oct 2026 (live Aeolus AFHA: three empty rows, FC-002 to FC-004). A row is a failure condition: with
            // no condition text, and no condition id that finds it in the FCIM, nothing is written. With the id,
            // the FCIM's own words are the condition (the drafter was told to echo them word for word anyway).
            const _condText = String((s && s.fcDesc) || '').replace(/\\s+/g, ' ').trim() || (_srcHit ? String(_srcHit.desc || '').replace(/\\s+/g, ' ').trim() : '');
            if (!_condText) { _applyFhaSuggestion._last = { action: 'nocondition' }; _toast('Not applied: the drafted row names no failure condition.', 'warning'); return false; }
            s = Object.assign({}, s, { fcDesc: _condText });
            // 3 Sep 2026 — THE TOP STEP IS JOINT (Waqas)"""),
("""                        if (ok === 'protected') results.push({ ok: false, blocked: true, error: 'row for ' + (a.srcCondId || _chatClip(a.fcDesc, 30)) + ' (same phases) was edited by hand — not overwritten; newer draft noted on it' });""",
"""                        if (ok === 'protected') results.push({ ok: false, blocked: true, error: 'row for ' + (a.srcCondId || _chatClip(a.fcDesc, 30)) + ' (same phases) was edited by hand — not overwritten; newer draft noted on it' });
                        else if (!ok && _applyFhaSuggestion._last && _applyFhaSuggestion._last.action === 'nocondition') results.push({ ok: false, blocked: true, error: 'the drafted row names no failure condition (no text, and no condition id found in the FCIM), so nothing was written' });   // 26 Oct 2026"""),
("""    function _applyFhaSuggestion(s) {
        try {
            const sysScoped = !!(s && s._systemId);""",
"""    function _applyFhaSuggestion(s) {
        _applyFhaSuggestion._last = null;   // 26 Oct 2026: what the last call did, never a stale answer from an earlier one
        try {
            const sysScoped = !!(s && s._systemId);"""),
# ---- 3. panel notes: plain text, with **bold** as the only markup; never raw tags
("""            '<div class="aifh-disclaimer">' + _esc(cfg.disclaimer || '') + '</div>' +""",
"""            '<div class="aifh-disclaimer">' + _noteHtml(cfg.disclaimer) + '</div>' +"""),
("""    function _modelNotesBlock(notes) {""",
"""    // 26 Oct 2026 (live Aeolus AFHA): a panel's note is plain text, escaped like everything else, and **these
    // words** is the one emphasis it takes. Three panels put <b> tags in their notes, which the escaping then
    // showed as text ("<b style=...>").
    function _noteHtml(t) { return _esc(String(t || '')).replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>'); }
    function _modelNotesBlock(notes) {"""),
("""Accept writes a <b>Proposed</b> Human Factors assumption""", """Accept writes a **Proposed** Human Factors assumption"""),
("""are deliberately <b>left empty</b> — those are measured""", """are deliberately **left empty**, as those are measured"""),
("""'Advisory design improvements rooted in the standard — <b>not</b> compliance findings""", """'Advisory design improvements rooted in the standard, **not** compliance findings"""),
]
for a, b in R:
    assert s.count(a) == 1, a[:100]
    s = s.replace(a, b)
open(p, 'w').write(s); print('ok')
