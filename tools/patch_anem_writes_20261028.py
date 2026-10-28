#!/usr/bin/env python3
"""28 Oct 2026: ANEM does the analysis but does not populate it (customer report: "it did the correct analysis
with perfect reasoning just did not populate the actual FHA"; "no lines created at all").

What was wrong, found in the code and proven with a stand-in AI on a three-tier project:
  1. ANEM's chat decides for itself whether to write rows. Its rules lean it toward answering in words
     ("only emit actions the engineer asked for", "never set severity as fact", "ask rather than guess"), so a
     request to draft an FHA row came back as a written analysis with no rows, and nothing said so.
  2. ANEM only saw part of the project: the first 80 functions, 90 FHA and FCIM rows, 60 requirements, 28
     functions per system, 80 nodes per fault tree, names cut at 40 to 70 characters, the last 14 messages,
     6 figures and 200,000 characters of an attached document. The project's own source documents were not in
     the chat at all. Waqas: "there should be no cutoff at all".
  3. ANEM could not see or answer review comments. Waqas: "ANEM should also be able to respond to review
     comments and address them".

The fix:
  1. A request to draft rows goes to that analysis' own drafting engine (the same one the page's Draft button
     runs, with the method, the source documents and the coverage checks), as one `draft` action naming the
     functions, failure conditions or comments. Every row comes back as a card with Accept.
  2. Safety net: a turn that asked for a change and wrote nothing says so in the chat, with a button that
     asks ANEM to write it.
  3. No cutoff anywhere in what ANEM sees: every row of every table, full text, the whole conversation, every
     figure and the whole attached document, plus the project's source documents. If the whole thing is more
     than the AI can read at once, nothing is cut to fit: ANEM says so in plain words.
  4. Review comments: ANEM sees every comment; `reply_comment` answers one (marked as ANEM, never closes it);
     "Ask ANEM" on each open comment and "Address all with ANEM" on the open-comments list run the comment
     engine, which replies to every comment and proposes the change a comment asks for as a card to accept.
  The FCIM's drafting engine also takes the functions by id now (the FHA's already did).

Run from the repo root: python3 tools/patch_anem_writes_20261028.py   (refuses on any missing anchor)
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

a = rd(S('ai_assistant.js'))
if '_chatDraft(' in a: sys.exit('already applied')

# ---------------------------------------------------------------- 1. history: the whole conversation
a = sub1(a, "    const _CHAT_MAXTURNS = 14;  // rolling history window sent to the model\n",
         "    // 28 Oct 2026 (Waqas: \"there should be no cutoff at all\"): the whole conversation is sent, not the last 14 messages.\n", 'maxturns')
a = sub1(a, "const msgs = _chatHistory.slice(-_CHAT_MAXTURNS).map(", "const msgs = _chatHistory.map(", 'history')

# ---------------------------------------------------------------- 2. the project as ANEM sees it: everything
i0 = a.index('    function _chatProjectState() {')
i1 = a.index('    function _chatSystemPrompt() {')
reg = a[i0:i1]
n_slice = len(re.findall(r'\.slice\(0, \d+\)', reg))
reg = re.sub(r'\.slice\(0, \d+\)', '', reg)
n_clip = len(re.findall(r'_chatClip\(', reg))
reg = re.sub(r'_chatClip\(((?:[^()]|\([^()]*\))*?), \d+\)', r'_chatFull(\1)', reg)
if '_chatClip(' in reg: sys.exit('a clip survived in the project state')
if n_slice < 20 or n_clip < 20: sys.exit('project state shape changed (%d slices, %d clips)' % (n_slice, n_clip))
reg = sub1(reg, "const nodes = []; let _nc = 0;", "const nodes = [];", 'nodecount')
reg = sub1(reg, "if (!n || _nc > 80) return; _nc++;", "if (!n) return;", 'nodecap')
reg = sub1(reg, "fn: _chatFull(f.subName), of: _chatFull(f.funcName) };",
           "fn: _chatFull(f.subName), def: _chatFull(f.subDef), of: _chatFull(f.funcName), ofDef: _chatFull(f.funcDef) };", 'funcdefs')
reg = sub1(reg, "            systems:     (s.systemsData || []).map(function (sy) { return {",
           "            // 28 Oct 2026: every review comment, so ANEM can answer and address them (reply_comment, draft comments)\n"
           "            comments:    (Array.isArray(s.reviewCommentsData) ? s.reviewCommentsData : []).filter(Boolean).map(function (c) { return { id: c.commentId, on: c.target ? (c.target.kind + ' ' + c.target.id) : '', sys: (c.target && c.target.systemId) || undefined, by: c.authorName || '', anem: c.aiGenerated ? true : undefined, replyTo: c.parentId || undefined, status: c.status || 'open', text: _chatFull(c.text) }; }),\n"
           "            systems:     (s.systemsData || []).map(function (sy) { return {", 'comments')
a = a[:i0] + reg + a[i1:]
a = sub1(a, "    // Compact, ID-bearing snapshot so the model can reference and edit existing\n    // artifacts by their REAL ids (_id = internalId; domain ids echoed too). Capped.\n",
         "    // Compact, ID-bearing snapshot so the model can reference and edit existing\n    // artifacts by their REAL ids (_id = internalId; domain ids echoed too).\n"
         "    // 28 Oct 2026 (Waqas: \"there should be no cutoff at all\"): nothing is left out. It used to stop at the first 80\n"
         "    // functions, 90 FHA and FCIM rows, 60 requirements, 28 functions per system and 80 nodes per tree, and cut\n"
         "    // names at 40 to 70 characters: on a three-tier project ANEM could not see two thirds of the functions.\n"
         "    function _chatFull(v) { return String(v == null ? '' : v); }\n", 'state head')

# ---------------------------------------------------------------- 3. the prompt: state note, documents
a = sub1(a, "and never break an existing CCF grouping or independence claim.';\n        const text = [head, '', stateNote, JSON.stringify(_chatProjectState())].join('\\n');",
         "and never break an existing CCF grouping or independence claim. Nothing is left out: every row of every table is listed, in full. comments[] holds every review comment; \"on\" names the row it is on as \"<kind> <id>\" (acFha / sysFha = the FHA row with that fcId, acFcim / sysFcim = the FCIM row of that function, acFunc / sysFunc = that function, acReq / sysReq = that requirement, acAsm / sysAsm = that assumption, pra / zsa / cma / fmea = that row), replyTo = the comment it answers.';\n"
         "        // 28 Oct 2026: the plain chat also reads the project's source documents (the analysis lanes always did). A batch\n"
         "        // gets them from _assembleAnalysisContext, so they are added here for the chat only, never twice.\n"
         "        let _docs = '';\n"
         "        if (lane === undefined || lane === 'chat.edit') { try { _docs = _projectDocContext('chat.edit', {}) || ''; } catch (_) { _docs = ''; } }\n"
         "        const text0 = [head, '', stateNote, JSON.stringify(_chatProjectState())].join('\\n');\n"
         "        const text = _docs ? (text0 + '\\n\\n' + _docs) : text0;", 'statenote')
a = sub1(a, "        return { text: text, breaks: [head.length + 2, text.length + 2] };\n    }\n\n    // ---- live action executor",
         "        return { text: text, breaks: _docs ? [head.length + 2, text0.length + 2, text.length + 2] : [head.length + 2, text.length + 2] };\n    }\n\n    // ---- live action executor", 'breaks')

# ---------------------------------------------------------------- 4. the rules: write, do not describe
a = sub1(a, "            '- Human-in-the-loop: edits apply live but the engineer can Undo any turn.",
         "            '- WRITE, DO NOT DESCRIBE: when the engineer asks you to draft, add, create, fill or populate rows of an analysis (FHA, FCIM, fault trees, requirements, FMEA, PRA, ZSA, CMA, MAC, configuration items), emit ONE draft action naming the analysis and exactly what it covers (subIds for functions, condIds for FCIM failure conditions, fcIds for FHA failure conditions). That engine carries the full method, the source documents and the coverage checks, and returns every row as a card for the engineer to accept. NEVER put drafted rows, failure conditions, effects or severities in \"reply\" without the action that writes them; \"reply\" says in a sentence or two what you started. Use the add_* actions only for one row the engineer dictated, and update for a change to an existing row.',\n"
         "            '- REVIEW COMMENTS: state.comments lists every review comment. When the engineer asks you to answer, deal with or address comments, emit draft {analysis:\"comments\", commentIds:[...]} (no commentIds = every open comment). To answer one comment directly in this conversation, use reply_comment. You never resolve or close a comment: the reviewer or the engineer does.',\n"
         "            '- Human-in-the-loop: edits apply live but the engineer can Undo any turn.", 'rules')
a = sub1(a, "            'ADD:',\n",
         "            'DRAFT (a whole piece of analysis, through its own drafting engine; the rows come back as cards with Accept):',\n"
         "            '- draft {analysis(\"fha\"|\"fcim\"|\"fault_tree\"|\"requirements\"|\"fmea\"|\"pra\"|\"zsa\"|\"cma\"|\"mac\"|\"items\"|\"comments\"), scope(\"aircraft\"|\"system\"), systemId?, subIds?:[function subIds], condIds?:[FCIM failure condition ids], fcIds?:[FHA failure condition ids, for fault trees], commentIds?:[review comment ids], level?(\"item\"|\"functional\", FMEA)}  — omit the id lists to let the engineer pick in the engine\\'s own list. An FHA row classifies an FCIM failure condition: for an FHA, name the functions (subIds) or their FCIM conditions (condIds).',\n"
         "            '- reply_comment {commentId, text}  — answer ONE review comment (an id from state.comments): what you changed and why, the answer to its question, or why you disagree. Filed under the comment, marked as yours. Never closes it.',\n"
         "            'ADD:',\n", 'catalog')

# ---------------------------------------------------------------- 5. cards
a = sub1(a, "        update: [['table', 'Table'], ['_id', 'Row'], ['fields', 'Changes']],",
         "        update: [['table', 'Table'], ['_id', 'Row'], ['fields', 'Changes']],\n"
         "        reply_comment: [['commentId', 'Comment'], ['text', 'Reply']],\n"
         "        draft: [['analysis', 'Analysis'], ['scope', 'Scope'], ['systemId', 'System'], ['subIds', 'Functions'], ['condIds', 'Failure conditions'], ['fcIds', 'FHA failure conditions'], ['commentIds', 'Comments']],", 'cards')

# ---------------------------------------------------------------- 6. the executor
a = sub1(a, "if (a && a.op !== 'add_mac' && typeof window",
         "if (a && a.op !== 'add_mac' && a.op !== 'reply_comment' && typeof window", 'preflight')
# (a reply is conversation: it may name an id the reviewer got wrong to say so; it writes nothing to the analysis)
a = sub1(a, "                    case 'add_function': results.push(_chatAddFunction(a, model)); break;",
         "                    case 'add_function': results.push(_chatAddFunction(a, model)); break;\n"
         "                    case 'draft': results.push(_chatDraft(a)); break;                       // 28 Oct 2026\n"
         "                    case 'reply_comment': results.push(_chatReplyComment(a, model)); break; // 28 Oct 2026", 'switch')

HELPERS = r"""    // ---- 28 Oct 2026: the chat hands a whole piece of analysis to its own drafting engine -------------------
    // Customer report: "it did the correct analysis with perfect reasoning just did not populate the actual FHA".
    // The engine is the one the page's Draft button runs: its method, the source documents, the coverage checks,
    // and every row as a card with Accept. It runs on its own after the chat turn; its panel opens when it is done.
    function _chatIdList(v) { return (Array.isArray(v) ? v : ((v == null || v === '') ? [] : [v])).map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean); }
    function _chatDraft(a) {
        if (_chatExecFeature) return { ok: false, blocked: true, error: 'a draft is started from the chat, not from inside another draft' };
        const an = String((a && a.analysis) || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        const subIds = _chatIdList(a.subIds), condIds = _chatIdList(a.condIds), fcIds = _chatIdList(a.fcIds), commentIds = _chatIdList(a.commentIds);
        const sysScope = a.scope === 'system' || !!String(a.systemId || '').trim();
        const s = snapshot();
        const start = function (label, run, what) {
            Promise.resolve().then(run).catch(function (e) { try { _toast('ANEM could not start the ' + label + ': ' + ((e && e.message) || e), 'warning', 9000); } catch (_) {} });
            return { ok: true, summary: 'Drafting the ' + label + (what ? (' for ' + what) : '') + '. The rows open for review, each with Accept.' };
        };
        const names = function (ids) { return ids.length <= 6 ? ids.join(', ') : (ids.slice(0, 6).join(', ') + ' and ' + (ids.length - 6) + ' more'); };
        let sy = null;
        if (sysScope && /^(fha|sfha|fcim)$/.test(an)) {
            sy = _chatSysByIdOrName(a.systemId);
            if (!sy) return { ok: false, error: 'no system ' + (a.systemId || '(none named)') + ' in the project' };
        }
        const pickSys = function (funcs) {   // a system's functions, narrowed to the ones named
            if (!subIds.length) return funcs;
            const want = {}; subIds.forEach(function (k) { want[k] = 1; });
            return (funcs || []).filter(function (f) { return f && (want[String(f.subId || '')] || want[String(f.funcId || '')] || want[String(f.internalId || '')]); });
        };
        switch (an) {
            case 'fha': case 'afha': case 'sfha': {
                if (sy) {
                    const funcs = pickSys(_funcsNeedingFhaForSystem(sy));
                    if (!funcs.length) return { ok: false, error: subIds.length ? ('none of ' + names(subIds) + ' is a function of ' + (sy.name || sy.id) + ' without an SFHA row') : ('every function in ' + (sy.name || sy.id) + ' already has an SFHA row') };
                    return start('SFHA', function () { return populateFha({ systemId: sy.id, systemName: sy.name || sy.id, funcs: funcs }); }, (sy.name || sy.id) + ' (' + funcs.length + ' function' + (funcs.length === 1 ? '' : 's') + ')');
                }
                const ex = (s.acExtractedFCs || []).filter(function (e) { return e && e.id && e.desc; });
                if (condIds.length) {
                    const have = {}; ex.forEach(function (e) { have[String(e.id).toLowerCase()] = e.id; });
                    const miss = condIds.filter(function (k) { return !have[k.toLowerCase()]; });
                    if (miss.length) return { ok: false, error: 'no FCIM failure condition ' + names(miss) + ' in the project' };
                    const ids = condIds.map(function (k) { return have[k.toLowerCase()]; });
                    return start('FHA', function () { return populateFha({ condIds: ids }); }, ids.length + ' failure condition' + (ids.length === 1 ? '' : 's') + ' (' + names(ids) + ')');
                }
                if (subIds.length) {
                    const fnIds = {}; (s.acFunctionsData || []).forEach(function (f) { if (f && f.subId) fnIds[String(f.subId)] = 1; });
                    const unknown = subIds.filter(function (k) { return !fnIds[k]; });
                    if (unknown.length) return { ok: false, error: 'no aircraft function ' + names(unknown) + ' in the project' };
                    if (ex.length) {
                        const want = {}; subIds.forEach(function (k) { want[k] = 1; });
                        const ids = ex.filter(function (e) { return want[String(e.subId || '')]; }).map(function (e) { return e.id; });
                        const without = subIds.filter(function (k) { return !ex.some(function (e) { return String(e.subId || '') === k; }); });
                        if (!ids.length) return { ok: false, error: names(subIds) + (subIds.length === 1 ? ' has' : ' have') + ' no failure conditions in the FCIM yet. The FHA classifies what the FCIM identifies: draft the FCIM first' };
                        const r = start('FHA', function () { return populateFha({ condIds: ids }); }, names(subIds) + ' (' + ids.length + ' failure condition' + (ids.length === 1 ? '' : 's') + ' from the FCIM)');
                        if (without.length) r.warn = [names(without) + (without.length === 1 ? ' has' : ' have') + ' no failure conditions in the FCIM yet, so no FHA row is drafted for ' + (without.length === 1 ? 'it' : 'them')];
                        return r;
                    }
                    if ((s.acFcimData || []).filter(Boolean).length) return { ok: false, error: 'the FCIM identifies no failure conditions yet (every cell is marked not applicable or not assessed). The FHA classifies what the FCIM identifies: draft or write the FCIM cells first' };
                    return start('FHA', function () { return populateFha({ funcIds: subIds }); }, names(subIds));
                }
                return start('FHA', function () { return populateFha({}); }, '');
            }
            case 'fcim': {
                if (sy) {
                    const funcs = pickSys(_funcsNeedingFcimForSystem(sy));
                    if (!funcs.length) return { ok: false, error: subIds.length ? ('none of ' + names(subIds) + ' is a function of ' + (sy.name || sy.id) + ' without an FCIM row') : ('every function in ' + (sy.name || sy.id) + ' already has an FCIM row') };
                    return start('system FCIM', function () { return populateFcim({ systemId: sy.id, systemName: sy.name || sy.id, funcs: funcs }); }, (sy.name || sy.id) + ' (' + funcs.length + ' function' + (funcs.length === 1 ? '' : 's') + ')');
                }
                if (subIds.length) {
                    const leaves = {}; (_leafUnits() || []).forEach(function (f) { if (f && f.subId) leaves[String(f.subId)] = 1; });
                    const bad = subIds.filter(function (k) { return !leaves[k]; });
                    if (bad.length) return { ok: false, error: names(bad) + (bad.length === 1 ? ' is not a function at the bottom of its branch' : ' are not functions at the bottom of their branches') + ' (or not in the project). The FCIM is drafted for the lowest functions: name those' };
                    return start('FCIM', function () { return populateFcim({ funcIds: subIds }); }, names(subIds));
                }
                return start('FCIM', function () { return populateFcim({}); }, '');
            }
            case 'fault_tree': case 'fault_trees': case 'fta': case 'trees': {
                if (fcIds.length) {
                    const gaps = _fcsNeedingTree();
                    const want = {}; fcIds.forEach(function (k) { want[k] = 1; });
                    const sel = gaps.filter(function (f) { return f && want[String(f.fcId)]; });
                    const left = fcIds.filter(function (k) { return !sel.some(function (f) { return String(f.fcId) === k; }); });
                    if (!sel.length) return { ok: false, error: names(fcIds) + ': no FHA failure condition without a fault tree by that id' };
                    const r = start('fault trees', function () { return synthesizeTree({ fcs: sel }); }, names(sel.map(function (f) { return f.fcId; })));
                    if (left.length) r.warn = [names(left) + ': already has a fault tree, or no FHA failure condition by that id'];
                    return r;
                }
                return start('fault trees', function () { return synthesizeTree({}); }, '');
            }
            case 'requirements': case 'requirement': case 'req': return start('safety requirements', function () { return recommendRequirements(); }, '');
            case 'fmea': return start('FMEA', function () { return draftFmea({ level: a.level === 'functional' ? 'functional' : 'item' }); }, '');
            case 'pra': return start('particular risk analysis', function () { return draftPra(); }, '');
            case 'zsa': return start('zonal safety analysis', function () { return draftZsa(); }, '');
            case 'cma': return start('common mode analysis', function () { return draftCma(); }, '');
            case 'mac': return start('MAC rules', function () { return draftMac({}); }, '');
            case 'items': case 'configuration_items': return start('configuration items', function () { return draftItems({}); }, '');
            case 'comments': case 'review_comments': {
                if (commentIds.length && typeof Review !== 'undefined') {
                    const miss = commentIds.filter(function (k) { return !Review.getById(k); });
                    if (miss.length) return { ok: false, error: 'no review comment ' + names(miss) + ' in the project' };
                }
                const r = start('answers to the review comments', function () { return addressComments({ commentIds: commentIds }); }, commentIds.length ? names(commentIds) : 'every open comment');
                return r;
            }
        }
        return { ok: false, error: 'draft: "' + (a.analysis || '') + '" is not an analysis ANEM can draft (fha, fcim, fault_tree, requirements, fmea, pra, zsa, cma, mac, items, comments)' };
    }
    // ---- 28 Oct 2026: ANEM answers a review comment. Filed under it, marked as ANEM's; it never closes it. --------
    function _chatReplyComment(a, model) {
        if (typeof Review === 'undefined') return { ok: false, error: 'review comments are not available here' };
        const c = Review.getById(String((a && a.commentId) || '').trim());
        if (!c) return { ok: false, error: 'no review comment ' + ((a && a.commentId) || '(none named)') + ' in the project' };
        const text = String((a && a.text) || '').trim();
        if (!text) return { ok: false, blocked: true, error: 'not written: a reply with nothing in it' };
        let by = ''; try { by = Review.getReviewerName() || ''; } catch (_) {}
        const made = Review.addComment(c.target, text, c.commentId, { authorName: 'ANEM', aiGenerated: true, aiModel: model || null, filedBy: by });
        if (!made) return { ok: false, error: 'the reply could not be filed' };
        try { if (typeof renderReviewPanelBody === 'function') renderReviewPanelBody(); } catch (_) {}
        try { if (typeof _refreshCommentTriggersFor === 'function') _refreshCommentTriggersFor(c.target); } catch (_) {}
        try { if (typeof _refreshReviewSummaryIfOpen === 'function') _refreshReviewSummaryIfOpen(); } catch (_) {}
        return { ok: true, summary: 'Replied to ' + (c.authorName || 'the') + '\u2019s comment on ' + (c.target ? (c.target.kind + ' ' + c.target.id) : 'the row') + ' (left open for the reviewer)' };
    }
    // ---- 28 Oct 2026: the comment engine. Every comment gets a reply; a change a comment asks for comes back as a
    // card to accept. Units are the comments; a comment is covered when it has its reply.
    const _COMMENTS_DIRECTIVE = 'Address the engineering REVIEW COMMENTS listed for this turn (ids, the row each is on, who wrote it, its words and the thread so far). For EACH comment: (1) if it asks for a change you can make from the project and its documents, emit the edit(s) that make it (update {table, _id, fields} on the row it is on, using the _id from CURRENT PROJECT STATE, or the add_* action it asks for) AND one reply_comment {commentId, text} saying in plain words what you changed and why; (2) if it is a question, or you disagree, or the change needs information that is not in the project, emit ONLY a reply_comment that answers it, gives your reasons, or names exactly what is needed. Every comment gets exactly one reply_comment. Never resolve or close a comment. Every edit follows the rules for that row type.';
    function _commentThreadText(c) {
        const chain = [];
        try { let p = c.parentId ? Review.getById(c.parentId) : null; while (p && chain.length < 1000) { chain.unshift(p); p = p.parentId ? Review.getById(p.parentId) : null; } } catch (_) {}
        return chain.map(function (p) { return (p.authorName || 'Reviewer') + ': "' + String(p.text || '') + '"'; }).join(' / ');
    }
    async function addressComments(opts) {
        opts = opts || {};
        if (typeof Review === 'undefined') { _toast('Review comments are not available here.', 'warning'); return; }
        const want = _chatIdList(opts.commentIds);
        let units;
        if (want.length) {
            const miss = want.filter(function (k) { return !Review.getById(k); });
            if (miss.length) throw new Error('no review comment ' + miss.join(', ') + ' in the project');
            units = want.map(function (k) { return Review.getById(k); });
        } else {
            units = Review.allOpen().filter(function (c) { return c && !c.aiGenerated; });
        }
        if (!units.length) { _toast('There are no open review comments to address.', 'info'); return; }
        return _anemBatch(_COMMENTS_DIRECTIVE, {
            title: '\u2728 ANEM \u00b7 review comments', analysis: 'review.comments',
            chunk: {
                units: units, size: 4, noun: 'review comment',
                keyOf:     function (c) { return c.commentId; },
                label:     function (c) {
                    const t = c.target || {};
                    const th = _commentThreadText(c);
                    return c.commentId + ' on ' + (t.kind || '') + ' ' + (t.id || '') + (t.systemId ? (' in system ' + t.systemId) : '') + ', by ' + (c.authorName || 'Reviewer') + ': "' + String(c.text || '') + '"' + (th ? (' (earlier in the thread: ' + th + ')') : '');
                },
                coveredBy: function (x) { return (x && x.op === 'reply_comment') ? String(x.commentId || '') : null; }
            }
        });
    }
"""
a = sub1(a, "    function _chatAddSystem(a, model) {", HELPERS + "    function _chatAddSystem(a, model) {", 'helpers')

# ---------------------------------------------------------------- 7. the FCIM engine takes functions by id
a = sub1(a, "            _openScopePicker(_fns, {\n                title: '✨ AI-drafted FCIM · which functions?',",
         "            // 28 Oct 2026: ANEM's chat names the functions (opts.funcIds); the same drafting runs on exactly those, no list\n"
         "            const _selC = _pickByIds(_fns, opts.funcIds, function (f) { return f.subId; });\n"
         "            (_selC ? function (cfg0, cb) { cb(_selC); } : function (cfg0, cb) { _openScopePicker(_fns, cfg0, cb); })({\n"
         "                title: '✨ AI-drafted FCIM · which functions?',", 'fcim ids')

# ---------------------------------------------------------------- 8. public entry
a = sub1(a, "        populateFha: _captureGuard('populateFha', populateFha),",
         "        populateFha: _captureGuard('populateFha', populateFha),\n"
         "        addressComments: _captureGuard('addressComments', addressComments),   // 28 Oct 2026: ANEM answers and addresses review comments", 'api')

# ---------------------------------------------------------------- 9. the chat turn: plain error for too big; the safety net
a = sub1(a, "            _chatHistory.push({ role: 'assistant', content: '⚠ ' + ((e && e.message) || e) }); _chatActivity.push(null);",
         "            // 28 Oct 2026: nothing is cut to fit. When the whole project and conversation are more than the AI can read\n"
         "            // at once, say so in plain words instead of the provider's error.\n"
         "            const _em = String((e && e.message) || e);\n"
         "            const _big = /prompt is too long|too many (input )?tokens|maximum context|context (length|window)|exceeds? .*(context|token)/i.test(_em);\n"
         "            _chatHistory.push({ role: 'assistant', content: '⚠ ' + (_big ? ('This conversation, the project and its documents together are more than the AI can read in one go, so nothing was sent and nothing was cut to make it fit. Clear the conversation to start a fresh one, or remove an attachment. (' + _em + ')') : _em) }); _chatActivity.push(null);", 'error')
a = sub1(a, "        _chatActivity.push({ results: results, assumptions: asmp.map(function (a) { return a && a.text; }).filter(Boolean), choices: (parsed && Array.isArray(parsed.choices)) ? parsed.choices : [] });",
         "        // 28 Oct 2026 (customer report: \"no lines created at all\"): a turn that asked for a change and wrote nothing\n"
         "        // says so, with a button that asks ANEM to write it. Not when ANEM asked a question back (choices).\n"
         "        const _choicesOut = (parsed && Array.isArray(parsed.choices)) ? parsed.choices : [];\n"
         "        const _noEdits = !!parsed && !actions.length && !_choicesOut.length && !_heldImg && _CHAT_WRITE_ASK.test(text);\n"
         "        _chatActivity.push({ results: results, assumptions: asmp.map(function (a) { return a && a.text; }).filter(Boolean), choices: _choicesOut, noEdits: _noEdits });", 'activity')
a = sub1(a, "    async function _chatSend(text) {\n",
         "    // 28 Oct 2026: words that ask ANEM to change the project (the safety net in _chatSend).\n"
         "    const _CHAT_WRITE_ASK = /\\b(draft|add|create|populate|fill|generate|write|insert|build|update|fix|change|correct|address|apply|delete|remove|rename|replace|link|trace)\\b/i;\n"
         "    const _CHAT_WRITE_NOW = 'Add what you just described to the analysis now: emit the actions that write it (a draft action for a whole analysis, update for an existing row). Do not repeat the analysis in the reply.';\n"
         "    async function _chatSend(text) {\n", 'ask re')
a = sub1(a, "                if (act && act.assumptions && act.assumptions.length) {\n                    html += '<div style=\"margin-top:8px;font-size:12px;color:' + pal.sub",
         "                if (act && act.noEdits) {   // 28 Oct 2026: the safety net\n"
         "                    html += '<div class=\"anem-noedits\" style=\"margin-top:9px;font-size:12.5px;background:' + pal.warnBg + ';color:' + pal.warnFg + ';padding:6px 9px;border-radius:6px;\">\u26a0 Nothing was added to the analysis this turn: ANEM answered in words only.</div>';\n"
         "                    if (i === _chatHistory.length - 1 && !_chatBusy) html += '<button class=\"anem-choice anem-write-now\" data-choice=\"' + _esc(_CHAT_WRITE_NOW) + '\" style=\"margin-top:7px;padding:7px 13px;border:1.5px solid ' + _ANEM_B + ';border-radius:16px;background:transparent;color:' + pal.botFg + ';font:inherit;font-size:13px;font-weight:700;cursor:pointer;\">Add it to the analysis</button>';\n"
         "                }\n"
         "                if (act && act.assumptions && act.assumptions.length) {\n                    html += '<div style=\"margin-top:8px;font-size:12px;color:' + pal.sub", 'render')

# ---------------------------------------------------------------- 10. attachments: all of it
a = sub1(a, "((res && res.images) || []).slice(0, 6).forEach(function (im) {", "((res && res.images) || []).forEach(function (im) {", 'figures')
a = sub1(a, "_chatAttachments.push({ kind: 'doc', name: nm, text: String(txt || '').slice(0, 200000) });", "_chatAttachments.push({ kind: 'doc', name: nm, text: String(txt || '') });", 'doctext')
wr(S('ai_assistant.js'), a)

# ---------------------------------------------------------------- 11. found while testing
# The project snapshot every AI feature reads had no review comments in it.
a = rd(S('ai_assistant.js'))
a = sub1(a, "            projectSourceDocs: safe(() => projectSourceDocs, []),   // NEW: persisted AI source documents (upload-once, consumed by every feature)\n",
         "            projectSourceDocs: safe(() => projectSourceDocs, []),   // NEW: persisted AI source documents (upload-once, consumed by every feature)\n"
         "            reviewCommentsData: safe(() => reviewCommentsData, []),   // 28 Oct 2026: ANEM sees and answers review comments\n", 'snapshot')
# The coverage banner said "every flight phase assessed" on lanes that have no phases (FCIM, comments): only the
# FHA checks phases, so only a check that ran may say so.
a = sub1(a, "drafted' + (gaps.length ? '' : ', every flight phase assessed') + '.'",
         "drafted' + ((Array.isArray(cov.phaseGaps) && !gaps.length) ? ', every flight phase assessed' : '') + '.'", 'banner')
wr(S('ai_assistant.js'), a)

# ---------------------------------------------------------------- review comments: who wrote it
r = rd(S('assurance_modules.js'))
r = sub1(r, """    function addComment(target, text, parentId) {
        text = (text || '').toString().trim();
        if (!text) return null;
        const author = (activeReviewerName || '').trim() || 'Reviewer';""", """    // 28 Oct 2026: opts { authorName, aiGenerated, aiModel, filedBy } for a reply ANEM files (marked as ANEM's, never
    // as the engineer's); the comment is filed and broadcast once, with those fields already on it.
    function addComment(target, text, parentId, opts) {
        text = (text || '').toString().trim();
        if (!text) return null;
        opts = opts || {};
        const author = (opts.authorName || '').toString().trim() || (activeReviewerName || '').trim() || 'Reviewer';""", 'addComment')
r = sub1(r, """            resolvedBy: null,
            resolutionNote: ''
        };
        reviewCommentsData.push(c);""", """            resolvedBy: null,
            resolutionNote: ''
        };
        if (opts.aiGenerated) { c.aiGenerated = true; c.aiModel = opts.aiModel || null; c.filedBy = (opts.filedBy || '').toString(); }
        reviewCommentsData.push(c);""", 'aiFields')
wr(S('assurance_modules.js'), r)

# ---------------------------------------------------------------- Ask ANEM on a comment; Address all
m = rd(S('misc_fn_modules.js'))
m = sub1(m, """    actions += '<button class="review-action-btn danger" onclick="deleteReviewComment(\\'' + esc(c.commentId) + '\\')">Delete</button>';
""", """    actions += '<button class="review-action-btn danger" onclick="deleteReviewComment(\\'' + esc(c.commentId) + '\\')">Delete</button>';
    // 28 Oct 2026: ANEM answers the comment and proposes the change it asks for, as a card to accept. Never closes it.
    if (c.status === 'open' && !c.aiGenerated && typeof window !== 'undefined' && window.SafetyLabAI && typeof window.SafetyLabAI.addressComments === 'function') {
        actions += '<button class="review-action-btn anem-ask" title="ANEM replies to this comment, and proposes the change it asks for as a card for you to accept. It never closes the comment." onclick="askAnemOnComment(\\'' + esc(c.commentId) + '\\')">Ask ANEM</button>';
    }
""", 'askBtn')
m = sub1(m, "function _renderReviewComment(c, depth) {", """// 28 Oct 2026: "Ask ANEM" on one comment, "Address all with ANEM" on the open-comments list.
function askAnemOnComment(commentId) {
    try {
        const p = window.SafetyLabAI.addressComments(commentId ? { commentIds: [commentId] } : {});
        if (p && typeof p.catch === 'function') p.catch(function (e) { if (typeof showToast === 'function') showToast('ANEM could not start: ' + ((e && e.message) || e), 'warning', 8000); });
    } catch (e) { if (typeof showToast === 'function') showToast('ANEM could not start: ' + ((e && e.message) || e), 'warning', 8000); }
}
function _renderReviewComment(c, depth) {""", 'askFn')
wr(S('misc_fn_modules.js'), m)

h = rd(S('helpers_modules.js'))
h = sub1(h, """    return '<div class="dash-worklist-card"><h4>Open review comments<span class="dash-worklist-count ' + sevClass + '">' + n + '</span></h4>' + inner + '</div>';""",
         """    // 28 Oct 2026: ANEM replies to every open comment and proposes the changes they ask for, as cards to accept.
    const anemAll = (n && typeof window !== 'undefined' && window.SafetyLabAI && typeof window.SafetyLabAI.addressComments === 'function')
        ? '<button type="button" class="review-action-btn anem-ask-all" style="margin:0 0 8px;" title="ANEM replies to every open comment and proposes the change each asks for as a card for you to accept. It never closes a comment." onclick="askAnemOnComment(null)">Address all with ANEM</button>' : '';
    return '<div class="dash-worklist-card"><h4>Open review comments<span class="dash-worklist-count ' + sevClass + '">' + n + '</span></h4>' + anemAll + inner + '</div>';""", 'allBtn')
wr(S('helpers_modules.js'), h)
print('ok')
