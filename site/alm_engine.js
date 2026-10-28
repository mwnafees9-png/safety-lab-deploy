// ============================================================================
// alm_engine.js, v1.0, 28 Oct 2026: the live connection to Polarion and Codebeamer, on the Connections framework.
//
// Waqas: live two-way links with "Jama, Polarion, DOORS Next, Codebeamer, Cameo" and GENESYS, one owner per linked
// item, "never update[d] automatically without their engineering teams consent". Jama has its own bridge
// (live_bridge.js). Every other tool runs on this one engine, through a small driver per tool that knows only that
// tool's REST API. The engine does the rest, the same way for every tool:
//
//   what is linked     Mapping, "Choose what is linked": the tool's documents (Polarion) or trackers (Codebeamer),
//                      each said to hold functions, requirements or assumptions, for the aircraft or one system.
//   coming in          a check reads what was chosen and stages every difference as a line (added, changed, moved,
//                      renamed, removed). Nothing enters the analysis until an engineer accepts the line and signs
//                      (connections.js). Functions keep their tree: a work item's parent in the tool is its parent
//                      function here. An item gone from the tool is flagged, never deleted.
//   going out          items an admin made Safety Lab the owner of, and failure conditions and safety requirements
//                      made in Safety Lab when Mapping says to send them: created in the chosen document or tracker,
//                      linked to their function (or failure condition), kept in step. Before every write the item is
//                      read again; if someone changed it in the tool since, it is held back, never overwritten.
//   never              a delete in the tool; calculated results, signatures and history crossing.
//
// IDENTITY. Rows remember their item as fnSource / reqSource / asmSource:
//   { tool: 'polarion' | 'codebeamer', remoteId (string), key, container, funcRemoteId, parentRemoteId, lastChange,
//     by, at, funcOnly?, missingInSource? }
// Matching is by the tool's own item id, never by name. Ids are strings (Polarion's are 'FCS-12').
//
// WHERE THE REQUEST GOES. The login never lives in the page. On the desktop the main process holds it in the OS
// keychain and makes the call (slabBridge.tool); on a Safety Lab server the server's vault holds it and the server
// makes the call (/v1/ai/bridge?tool=). A browser-only session has nowhere safe to keep it, so these tools need the
// desktop app or a Safety Lab server. Each of the three places checks the same fence (almRequestProblem below):
// https, the saved address only, the tool's own REST paths, and for writes only create, change, link and comment.
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : globalThis;

    // ------------------------------------------------------------------ the fence (kept identical in bridge_main.js
    // and the AI proxy's worker.js; tests compare them)
    var ALM_RULES = {
        polarion: {
            root: /\/polarion\/rest\/v1\/(.*)$/,
            write: {
                POST: [/^projects\/[^\/]+\/workitems$/, /^projects\/[^\/]+\/workitems\/[^\/]+\/actions\/moveToDocument$/, /^projects\/[^\/]+\/workitems\/[^\/]+\/linkedworkitems$/, /^projects\/[^\/]+\/workitems\/[^\/]+\/comments$/],
                PATCH: [/^projects\/[^\/]+\/workitems\/[^\/]+$/]
            },
            read: { POST: [] }, query: [], headers: []
        },
        codebeamer: {
            root: /\/api\/v3\/(.*)$/,
            write: {
                POST: [/^trackers\/\d+\/items$/, /^associations$/],
                PUT: [/^items\/\d+\/fields$/]
            },
            read: { POST: [/^items\/query$/] }, query: [], headers: []
        },
        // DOORS Next (OSLC RM and the module structure API): create a requirement through the project's creation
        // factory, change one (never a module itself), and add an entry to a module's structure
        doors: {
            root: /^\/(?:rm|dng)[\w-]*\/(.*)$/,
            write: {
                POST: [/^requirementFactory$/],
                PUT: [/^resources\/(?!MD_)[\w-]+$/, /^resources\/MD_[\w-]+\/structure$/]
            },
            read: { POST: [] }, query: ['projectURL', 'oslc_config.context'],
            headers: ['oslc-core-version', 'accept', 'content-type', 'configuration-context', 'doorsrp-request-type', 'vvc.configuration', 'if-match']
        },
        // Cameo (Teamwork Cloud): read elements one by one or in batches; create an element and change one
        cameo: {
            root: /^\/osmc\/(.*)$/,
            write: {
                POST: [/^resources\/[\w-]+\/branches\/[\w-]+\/elements\/[\w-]+$/],
                PATCH: [/^resources\/[\w-]+\/branches\/[\w-]+\/elements\/[\w-]+$/]
            },
            read: { POST: [/^resources\/[\w-]+\/branches\/[\w-]+\/elements$/, /^resources\/[\w-]+\/branches\/[\w-]+\/revisions\/\d+\/elements$/] },
            query: [], headers: ['accept', 'content-type']
        }
    };
    // '' when the request may go, or the reason it may not. savedHost: the host saved with the login. headers: the
    // extra request headers the page asks for (only the tool's own protocol headers pass).
    function almRequestProblem(tool, method, rawUrl, savedHost, headers) {
        var R = Object.prototype.hasOwnProperty.call(ALM_RULES, tool) ? ALM_RULES[tool] : null; if (!R) return 'not a connected tool';
        var m = String(method || '').toUpperCase();
        var u; try { u = new URL(String(rawUrl)); } catch (_) { return 'not a valid address'; }
        if (u.protocol !== 'https:') return 'the address must be https';
        if (!savedHost || u.hostname.toLowerCase() !== String(savedHost).toLowerCase()) return 'only the saved address can be reached';
        var mm = R.root.exec(u.pathname); if (!mm) return 'only the tool\u2019s REST API is reached';
        var hk = Object.keys(headers || {}).map(function (k) { return String(k).toLowerCase(); }).filter(function (k) { return R.headers.indexOf(k) < 0; });
        if (hk.length) return 'the header ' + hk[0] + ' is not sent to this tool';
        var rest = mm[1];
        if (m === 'GET') return '';
        var keys = []; u.searchParams.forEach(function (v, k) { keys.push(k); });
        if (keys.some(function (k) { return R.query.indexOf(k) < 0; })) return 'no query string on a write';
        var ok = (R.read[m] || []).concat(R.write[m] || []).some(function (re) { return re.test(rest); });
        if (ok) return '';
        if (m === 'DELETE') return 'Safety Lab never deletes anything in a connected tool';
        return 'Safety Lab only reads, creates, changes, links and comments on items in the tool';
    }

    // ------------------------------------------------------------------ small helpers
    function S(v) { return v == null ? '' : String(v).trim(); }
    function arrOf(a) { return Array.isArray(a) ? a : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _toast(m, t, ms) { try { if (typeof showToast === 'function') showToast(m, t || 'info', ms || 4200); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _report(e, where) { try { if (W.SLErrorWatch) W.SLErrorWatch.report(e, 'alm_engine' + (where ? ': ' + where : '')); } catch (_) {} }
    // the framework's own background write (connections.js): never a "change to confirm"
    function _bg(fn) { try { var C = W.SLConnections; if (C && typeof C.background === 'function') return C.background(fn); } catch (_) {} try { var A = W.SLChangeAck; if (A && typeof A.background === 'function') return A.background(fn); } catch (_) {} return fn(); }
    function _now() { return new Date().toISOString(); }
    function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function _newId() { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return Date.now().toString() + Math.random().toString(36).slice(2, 7); }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig && typeof projectConfig === 'object') ? projectConfig : null; } catch (_) { return null; } }
    function _sysList() { try { return ((typeof systemsData !== 'undefined' ? systemsData : []) || []).filter(Boolean); } catch (_) { return []; } }
    function _sysById(id) { return _sysList().filter(function (s) { return String(s.id) === String(id); })[0] || null; }
    function _isDesktop() { try { return !!(W.slabBridge && typeof W.slabBridge.tool === 'function'); } catch (_) { return false; } }
    function _desktopOld() { try { return !!(W.slabBridge && typeof W.slabBridge.get === 'function' && typeof W.slabBridge.tool !== 'function'); } catch (_) { return false; } }
    function _store() { try { return W.SecretStore || null; } catch (_) { return null; } }
    function _door() { if (_isDesktop() || _desktopOld()) return 'desktop'; var st = _store(); return st ? st.door() : 'session'; }
    function _levelLimit() { try { return (typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit) ? (Number(SLFuncTree.levelLimit()) || 0) : 0; } catch (_) { return 0; } }
    function _host(baseUrl) { try { return new URL(String(baseUrl)).hostname.toLowerCase(); } catch (_) { return ''; } }

    // Rich text from a tool, as Safety Lab's plain cells. A picture leaves a marker; table cells stay apart.
    function plain(html) {
        var t = String(html == null ? '' : html);
        t = t.replace(/<\s*(script|style)\b[\s\S]*?<\/\s*\1\s*>/gi, '');
        t = t.replace(/<\s*(img|svg|object|embed|canvas)\b[^>]*>/gi, ' [image or diagram] ').replace(/<\/\s*svg\s*>/gi, '');
        t = t.replace(/<\/\s*(td|th)\s*>/gi, ' | ').replace(/<\s*li\b[^>]*>/gi, '\n- ');
        t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '');
        var ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
        t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, function (m, k) {
            var kl = k.toLowerCase();
            if (kl[0] === '#') { var n = kl[1] === 'x' ? parseInt(kl.slice(2), 16) : parseInt(kl.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
            return Object.prototype.hasOwnProperty.call(ent, kl) ? ent[kl] : m;
        });
        return t.split('\n').map(function (l) { return l.replace(/[ \t ]+/g, ' ').trim().replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim(); }).filter(function (l) { return l && l !== '-'; }).join('\n');
    }
    // Codebeamer wiki text, as plain text (bold, italics, links and headings marks dropped)
    function wikiPlain(w) {
        var t = String(w == null ? '' : w);
        t = t.replace(/\[\{[^}]*\}\]/g, ' [image or diagram] ');
        t = t.replace(/\[([^\]|]*)\|[^\]]*\]/g, '$1').replace(/\[([^\]]*)\]/g, '$1');
        t = t.replace(/__([^_]+)__/g, '$1').replace(/''([^']+)''/g, '$1').replace(/^!{1,3}\s*/gm, '').replace(/^\*+\s*/gm, '- ').replace(/^#+\s*/gm, '- ');
        t = t.replace(/\\\\/g, '\n');
        return t.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).filter(Boolean).join('\n');
    }
    function _html(s) { return _esc(s).replace(/\n/g, '<br>'); }

    // ================================================================== XML and RDF (DOORS Next speaks RDF/XML)
    // A small namespace-aware XML reader: elements with their namespace, local name, attributes (by namespace URI +
    // local name), text, child elements and the raw text between their tags (an rdf:parseType="Literal" value).
    var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    function _xmlUnesc(t) {
        return String(t).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, k) {
            var kl = k.toLowerCase();
            if (kl[0] === '#') { var n = kl[1] === 'x' ? parseInt(kl.slice(2), 16) : parseInt(kl.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
            return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[kl];
        });
    }
    function parseXml(text) {
        var src = String(text || ''), i = 0, n = src.length;
        var root = { children: [], ns: {} }, stack = [root];
        var tagRe = /<([^\s\/>]+)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
        while (i < n) {
            var lt = src.indexOf('<', i);
            var top = stack[stack.length - 1];
            if (lt < 0) { if (top.el) top.el.text += _xmlUnesc(src.slice(i)); break; }
            if (lt > i && top.el) top.el.text += _xmlUnesc(src.slice(i, lt));
            if (src.startsWith('<!--', lt)) { var ce = src.indexOf('-->', lt + 4); i = ce < 0 ? n : ce + 3; continue; }
            if (src.startsWith('<![CDATA[', lt)) { var de = src.indexOf(']]>', lt + 9); if (top.el) top.el.text += src.slice(lt + 9, de < 0 ? n : de); i = de < 0 ? n : de + 3; continue; }
            if (src.startsWith('<?', lt)) { var pe = src.indexOf('?>', lt + 2); i = pe < 0 ? n : pe + 2; continue; }
            if (src.startsWith('<!', lt)) { var be = src.indexOf('>', lt + 2); i = be < 0 ? n : be + 1; continue; }
            if (src[lt + 1] === '/') {
                var ge = src.indexOf('>', lt); var fr = stack.pop(); if (fr && fr.el) fr.el.inner = src.slice(fr.start, lt);
                if (!stack.length) stack.push(root);
                i = ge < 0 ? n : ge + 1; continue;
            }
            tagRe.lastIndex = lt;
            var m = tagRe.exec(src);
            if (!m) { i = lt + 1; continue; }
            var scope = Object.assign({}, top.ns), raw = {}, ar = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g, am;
            while ((am = ar.exec(m[2]))) { var v = _xmlUnesc(am[3] != null ? am[3] : am[4]); raw[am[1]] = v; if (am[1] === 'xmlns') scope[''] = v; else if (am[1].indexOf('xmlns:') === 0) scope[am[1].slice(6)] = v; }
            var q = m[1], c = q.indexOf(':'), pre = c > 0 ? q.slice(0, c) : '', loc = c > 0 ? q.slice(c + 1) : q;
            var el = { qname: q, ns: scope[pre] || '', local: loc, attrs: {}, text: '', inner: '', children: [] };
            Object.keys(raw).forEach(function (k) { if (k === 'xmlns' || k.indexOf('xmlns:') === 0) return; var c2 = k.indexOf(':'); el.attrs[(c2 > 0 ? (scope[k.slice(0, c2)] || '') : '') + (c2 > 0 ? k.slice(c2 + 1) : k)] = raw[k]; });
            (top.el ? top.el.children : root.children).push(el);
            i = tagRe.lastIndex;
            if (m[3] !== '/') stack.push({ el: el, ns: scope, start: i });
        }
        return root.children[0] || null;
    }
    // RDF/XML as nodes: { about, types[], props: { predicateURI: [ { res } | { lit, xml } | { list: [about] } ] } }.
    // Nested descriptions become their own nodes (blank ones get a made-up id).
    function rdfParse(text) {
        var doc = parseXml(text), nodes = {}, blank = 0;
        function node(el) {
            var about = el.attrs[RDF + 'about'] != null ? el.attrs[RDF + 'about'] : (el.attrs[RDF + 'nodeID'] != null ? '_:' + el.attrs[RDF + 'nodeID'] : '_:b' + (++blank));
            var nd = nodes[about] || (nodes[about] = { about: about, types: [], props: {} });
            if (!(el.ns === RDF && el.local === 'Description')) nd.types.push(el.ns + el.local);
            el.children.forEach(function (p) {
                var pred = p.ns + p.local, val;
                if (pred === RDF + 'type' && p.attrs[RDF + 'resource']) { nd.types.push(p.attrs[RDF + 'resource']); return; }
                if (p.attrs[RDF + 'resource'] != null) val = { res: p.attrs[RDF + 'resource'] };
                else if (p.attrs[RDF + 'parseType'] === 'Literal') val = { lit: plain(p.inner), xml: p.inner };
                else if (p.attrs[RDF + 'parseType'] === 'Collection') val = { list: p.children.map(node) };
                else if (p.children.length) val = { res: node(p.children[0]) };
                else val = { lit: p.text.trim() };
                (nd.props[pred] = nd.props[pred] || []).push(val);
            });
            return about;
        }
        if (doc) { if (doc.ns === RDF && doc.local === 'RDF') doc.children.forEach(node); else node(doc); }
        var all = Object.keys(nodes).map(function (k) { return nodes[k]; });
        return {
            nodes: nodes, all: all,
            ofType: function (t) { return all.filter(function (x) { return x.types.indexOf(t) >= 0; }); },
            withProp: function (pr) { return all.filter(function (x) { return x.props[pr]; }); }
        };
    }
    function rv(nd, pred) { var v = nd && nd.props[pred] && nd.props[pred][0]; return v ? (v.res != null ? v.res : (v.lit != null ? v.lit : '')) : ''; }
    function rvs(nd, pred) { return ((nd && nd.props[pred]) || []).map(function (v) { return v.res != null ? v.res : v.lit; }); }
    function _xesc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // ================================================================== the function tree (pure)
    // items: [{ id, key, name, text, modified, parentId, sort }] of one tool, ids as strings. A parentId that is not a
    // function item read this time makes the item a top function.
    function buildTree(items) {
        var fns = arrOf(items).filter(Boolean);
        var byId = new Map(fns.map(function (n) { return [String(n.id), n]; }));
        var par = new Map(), kids = new Map();
        fns.forEach(function (n) {
            var p = n.parentId == null ? null : String(n.parentId);
            if (p != null && (!byId.has(p) || p === String(n.id))) p = null;
            par.set(String(n.id), p);
            if (p != null) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n); }
        });
        // a loop in the parents (a tool should never allow one) is cut where it is found: that item becomes a top
        fns.forEach(function (n) {
            var seen = new Set([String(n.id)]), cur = par.get(String(n.id)), g = 0;
            while (cur != null && g++ < 10000) {
                if (seen.has(cur)) { var p0 = par.get(String(n.id)); par.set(String(n.id), null); var ks = kids.get(p0) || []; kids.set(p0, ks.filter(function (k) { return k !== n; })); break; }
                seen.add(cur); cur = par.get(cur);
            }
        });
        var sk = function (n) { return n.sort != null ? n.sort : 0; };
        kids.forEach(function (list) { list.sort(function (a, b) { return sk(a) - sk(b); }); });
        function topOf(n) { var cur = n, g = 0; while (cur && par.get(String(cur.id)) != null && g++ < 10000) cur = byId.get(par.get(String(cur.id))); return cur; }
        function depthOf(n) { var d = 0, cur = n, g = 0; while (cur && par.get(String(cur.id)) != null && g++ < 10000) { d++; cur = byId.get(par.get(String(cur.id))); } return d; }
        var tops = fns.filter(function (n) { return par.get(String(n.id)) == null; }).sort(function (a, b) { return sk(a) - sk(b); });
        var order = [], placed = new Set();
        (function walk(list) { list.forEach(function (n) { if (placed.has(String(n.id))) return; placed.add(String(n.id)); order.push(n); walk(kids.get(String(n.id)) || []); }); })(tops);
        return { byId: byId, parentId: par, kids: kids, tops: tops, order: order, topOf: topOf, depthOf: depthOf };
    }

    // What would change in the aircraft functions. Pure. read: the containers read in full this time (only rows from
    // those can be called missing). Same arrays as jama_tree.js: fresh, changed, moved, fnChanged, missing.
    function diffTree(tool, tree, rows, read, opts) {
        var lim = Number(opts && opts.levelLimit) || 0;
        var mine = arrOf(rows).filter(function (r) { return r && r.fnSource && r.fnSource.tool === tool; });
        var nodeBy = new Map(), onlyBy = new Map(), byTop = new Map();
        mine.forEach(function (r) {
            var s = r.fnSource, id = String(s.remoteId);
            if (s.funcOnly) onlyBy.set(id, r); else nodeBy.set(id, r);
            var t = String(s.funcOnly ? s.remoteId : s.funcRemoteId);
            if (!byTop.has(t)) byTop.set(t, []);
            byTop.get(t).push(r);
        });
        var fresh = [], changed = [], moved = [], fnChanged = [], missing = [], tooDeep = [], unchanged = 0;
        tree.order.forEach(function (n) {
            var id = String(n.id), top = tree.topOf(n), isTop = tree.parentId.get(id) == null;
            if (isTop) {
                var hasKids = (tree.kids.get(id) || []).length > 0, its = byTop.get(id) || [], ref = its[0], only = onlyBy.get(id);
                if (ref && (S(ref.funcName) !== S(n.name) || S(ref.funcDef) !== S(n.text))) fnChanged.push({ item: n, rows: its, fields: [S(ref.funcName) !== S(n.name) ? 'name' : null, S(ref.funcDef) !== S(n.text) ? 'description' : null].filter(Boolean) });
                if (!hasKids && !only && !its.length) fresh.push({ item: n, top: n, parent: null, funcOnly: true, depth: 0 });
                else if (only && only.fnSource.missingInSource && !hasKids) changed.push({ row: only, item: n, fields: ['back in the tool'] });
                else if (only && hasKids && !only.fnSource.missingInSource) missing.push({ row: only, why: 'this function now has functions under it in the tool, so its function-only row is no longer needed (flagged for you to remove)' });
                return;
            }
            var pid = tree.parentId.get(id), pn = tree.byId.get(pid);
            var wantParent = (pn && String(pn.id) !== String(top.id)) ? String(pn.id) : null;
            var ex = nodeBy.get(id), depth = tree.depthOf(n);
            if (lim && depth + 1 > lim) { tooDeep.push({ item: n, level: depth + 1, row: ex || null }); return; }
            if (!ex) { fresh.push({ item: n, top: top, parent: wantParent != null ? tree.byId.get(wantParent) : null, funcOnly: false, depth: depth }); return; }
            var fields = [];
            if (S(ex.subName) !== S(n.name)) fields.push('name');
            if (S(ex.subDef) !== S(n.text)) fields.push('description');
            if (S(ex.fnSource.key) && S(ex.fnSource.key) !== S(n.key)) fields.push('key ' + S(ex.fnSource.key) + ' is now ' + S(n.key));
            if (ex.fnSource.missingInSource) fields.push('back in the tool');
            var wasP = ex.fnSource.parentRemoteId == null ? null : String(ex.fnSource.parentRemoteId);
            var wasT = ex.fnSource.funcRemoteId == null ? null : String(ex.fnSource.funcRemoteId);
            var isMoved = wasP !== wantParent || wasT !== String(top.id);
            if (fields.length) changed.push({ row: ex, item: n, fields: fields });
            if (isMoved) moved.push({ row: ex, item: n, top: top, parent: wantParent != null ? tree.byId.get(wantParent) : null, depth: depth, fromParent: wasP, fromTop: wasT });
            if (!fields.length && !isMoved) unchanged++;
        });
        mine.forEach(function (r) {
            var s = r.fnSource, id = String(s.remoteId);
            if (s.missingInSource || !read.has(String(s.container || ''))) return;
            if (s.funcOnly) {
                var n = tree.byId.get(id);
                if (!n) missing.push({ row: r, why: 'no longer in the tool' });
                else if (tree.parentId.get(id) != null) missing.push({ row: r, why: 'no longer a top function in the tool (it now sits under ' + S(tree.topOf(n).key) + ')' });
                return;
            }
            if (!tree.byId.has(id)) missing.push({ row: r, why: 'no longer in the tool' });
            else if (tree.parentId.get(id) == null) missing.push({ row: r, why: 'now a top function in the tool; its own function row is staged as new' });
        });
        mine.forEach(function (r) {
            var s = r.fnSource; if (s.funcOnly) return;
            var id = String(s.remoteId), n = tree.byId.get(id);
            if (n && tree.parentId.get(id) == null && !(tree.kids.get(id) || []).length && !onlyBy.has(id) && !fresh.some(function (f) { return String(f.item.id) === id; })) fresh.push({ item: n, top: n, parent: null, funcOnly: true, depth: 0 });
        });
        fresh.sort(function (a, b) { return a.depth - b.depth; });
        moved.sort(function (a, b) { return a.depth - b.depth; });
        return { fresh: fresh, changed: changed, moved: moved, fnChanged: fnChanged, missing: missing, tooDeep: tooDeep, unchanged: unchanged, total: tree.order.length };
    }

    // Write the chosen parts of a tree diff into the aircraft function rows. Mutates rows. Signed.
    function applyTree(tool, diff, rows, o) {
        var by = S(o && o.signedBy); if (!by) return { ok: false, err: 'A signature is required.' };
        if (!Array.isArray(rows)) return { ok: false, err: 'The function store is not available.' };
        var at = (o && o.at) || _now(), newId = (o && o.newId) || _newId, label = (o && o.label) || tool;
        var usedSub = new Set(rows.map(function (r) { return r ? S(r.subId) : ''; }).filter(Boolean));
        var usedFn = new Set(rows.map(function (r) { return r ? S(r.funcId) : ''; }).filter(Boolean));
        function uniq(id, used, rid) { var v = S(id) || (label + '-' + rid); if (!used.has(v)) { used.add(v); return v; } v = v + '#' + rid; var k = 2; while (used.has(v)) v = S(id) + '#' + rid + '-' + (k++); used.add(v); return v; }
        var nodeRow = new Map(), fnOf = new Map();
        rows.forEach(function (r) {
            if (!r || !r.fnSource || r.fnSource.tool !== tool) return;
            var s = r.fnSource;
            if (!s.funcOnly) nodeRow.set(String(s.remoteId), r);
            var t = String(s.funcOnly ? s.remoteId : s.funcRemoteId);
            if (!fnOf.has(t) && S(r.funcId)) fnOf.set(t, { funcId: S(r.funcId), funcName: r.funcName, funcDef: r.funcDef });
        });
        function fnFor(top) { var k = String(top.id); if (!fnOf.has(k)) fnOf.set(k, { funcId: uniq(top.key, usedFn, top.id), funcName: top.name, funcDef: top.text }); return fnOf.get(k); }
        function src(item, top, parent, extra) {
            return Object.assign({ tool: tool, remoteId: String(item.id), key: S(item.key), container: S(item.container), funcRemoteId: top ? String(top.id) : null, parentRemoteId: parent ? String(parent.id) : null, lastChange: S(item.modified), by: by, at: at }, extra || {});
        }
        var out = { ok: true, added: 0, updated: 0, moved: 0, flagged: 0, fnUpdated: 0 };
        arrOf(diff.fnChanged).forEach(function (x) {
            var f = fnFor(x.item); f.funcName = x.item.name; f.funcDef = x.item.text;
            rows.forEach(function (r) {
                if (!r || !r.fnSource || r.fnSource.tool !== tool) return;
                var t = String(r.fnSource.funcOnly ? r.fnSource.remoteId : r.fnSource.funcRemoteId);
                if (t !== String(x.item.id)) return;
                r.funcName = x.item.name; r.funcDef = x.item.text; r.fnSource.by = by; r.fnSource.at = at; out.fnUpdated++;
            });
        });
        arrOf(diff.fresh).forEach(function (x) {
            var f = fnFor(x.top), row;
            if (x.funcOnly) row = { internalId: newId(), funcId: f.funcId, funcName: f.funcName, funcDef: f.funcDef, subId: '', subName: '', subDef: '', fnSource: src(x.item, x.item, null, { funcOnly: true }) };
            else {
                var pRow = x.parent ? nodeRow.get(String(x.parent.id)) : null;
                row = { internalId: newId(), funcId: f.funcId, funcName: f.funcName, funcDef: f.funcDef, subId: uniq(x.item.key, usedSub, x.item.id), subName: x.item.name, subDef: x.item.text, fnSource: src(x.item, x.top, x.parent) };
                if (pRow && S(pRow.subId)) row.parentSubId = S(pRow.subId);
                nodeRow.set(String(x.item.id), row);
            }
            rows.push(row); out.added++;
        });
        arrOf(diff.changed).forEach(function (x) {
            var r = x.row, it = x.item;
            if (!r.fnSource.funcOnly) { r.subName = it.name; r.subDef = it.text; }
            r.fnSource.key = S(it.key); r.fnSource.lastChange = S(it.modified); r.fnSource.by = by; r.fnSource.at = at; r.fnSource.container = S(it.container) || r.fnSource.container;
            delete r.fnSource.missingInSource; out.updated++;
        });
        arrOf(diff.moved).forEach(function (x) {
            var r = x.row, f = fnFor(x.top), pRow = x.parent ? nodeRow.get(String(x.parent.id)) : null;
            r.funcId = f.funcId; r.funcName = f.funcName; r.funcDef = f.funcDef;
            if (pRow && S(pRow.subId) && pRow !== r) r.parentSubId = S(pRow.subId); else delete r.parentSubId;
            r.fnSource.funcRemoteId = String(x.top.id); r.fnSource.parentRemoteId = x.parent ? String(x.parent.id) : null;
            r.fnSource.lastChange = S(x.item.modified); r.fnSource.by = by; r.fnSource.at = at; out.moved++;
        });
        arrOf(diff.missing).forEach(function (x) { x.row.fnSource.missingInSource = true; x.row.fnSource.missingWhy = x.why || ''; x.row.fnSource.flaggedAt = at; x.row.fnSource.flaggedBy = by; out.flagged++; });
        return out;
    }

    // A flat list (requirements, assumptions, a system's functions). Pure.
    var FLAT = {
        req: { src: 'reqSource', same: function (r, it) { var f = []; if (S(r.text) !== S(it.text || it.name)) f.push('text'); return f; } },
        asm: { src: 'asmSource', same: function (r, it) { var f = []; if (S(r.text) !== S(it.text || it.name)) f.push('text'); return f; } },
        sfn: { src: 'fnSource', same: function (r, it) { var f = []; if (S(r.funcName) !== S(it.name)) f.push('name'); if (S(r.funcDef) !== S(it.text)) f.push('description'); return f; } }
    };
    function diffFlat(tool, kind, items, rows, read) {
        var K = FLAT[kind], by = new Map();
        arrOf(rows).forEach(function (r) { var s = r && r[K.src]; if (s && s.tool === tool && s.remoteId != null) by.set(String(s.remoteId), r); });
        var fresh = [], changed = [], missing = [], seen = new Set(), unchanged = 0;
        arrOf(items).forEach(function (it) {
            var r = by.get(String(it.id));
            if (!r) { fresh.push({ item: it }); return; }
            seen.add(String(it.id));
            var f = K.same(r, it);
            if (S(r[K.src].key) && S(r[K.src].key) !== S(it.key)) f.push('key ' + S(r[K.src].key) + ' is now ' + S(it.key));
            if (r[K.src].missingInSource) f.push('back in the tool');
            if (f.length) changed.push({ row: r, item: it, fields: f }); else unchanged++;
        });
        by.forEach(function (r, id) { var s = r[K.src]; if (!seen.has(id) && !s.missingInSource && read.has(String(s.container || ''))) missing.push({ row: r, why: 'no longer in the tool' }); });
        return { fresh: fresh, changed: changed, missing: missing, unchanged: unchanged, total: arrOf(items).length };
    }
    function applyFlat(tool, kind, diff, store, o) {
        var by = S(o && o.signedBy); if (!by) return { ok: false, err: 'A signature is required.' };
        if (!Array.isArray(store)) return { ok: false, err: 'That store is not available.' };
        var at = (o && o.at) || _now(), newId = (o && o.newId) || _newId, K = FLAT[kind], label = (o && o.label) || tool;
        var stamp = function (it) { return { tool: tool, remoteId: String(it.id), key: S(it.key), container: S(it.container), lastChange: S(it.modified), by: by, at: at }; };
        var out = { ok: true, added: 0, updated: 0, flagged: 0 };
        arrOf(diff.fresh).forEach(function (x) {
            var it = x.item, row;
            if (kind === 'req') row = { internalId: newId(), id: S(it.key), traceId: S(it.key), level: o.level || 'aircraft', type: 'Imported', text: S(it.text || it.name), rat: '', reqSource: Object.assign(stamp(it), { reqifId: S(it.key) }) };
            else if (kind === 'asm') row = { internalId: newId(), asmId: S(it.key), origin: label, text: S(it.text || it.name), state: 'Proposed', valStrategy: '', valArtifact: '', verArtifact: '', asmSource: stamp(it) };
            else row = { internalId: newId(), funcId: S(it.key), funcName: S(it.name), funcDef: S(it.text), fnSource: stamp(it) };
            store.push(row); out.added++;
        });
        arrOf(diff.changed).forEach(function (x) {
            var r = x.row, it = x.item;
            if (kind === 'req' || kind === 'asm') r.text = S(it.text || it.name);
            else { r.funcName = S(it.name); r.funcDef = S(it.text); }   // the ID stays: FCIM, FHA and traces point at it
            Object.assign(r[K.src], stamp(it)); delete r[K.src].missingInSource; out.updated++;
        });
        arrOf(diff.missing).forEach(function (x) { var s = x.row[K.src]; s.missingInSource = true; s.missingWhy = x.why || ''; s.flaggedAt = at; s.flaggedBy = by; out.flagged++; });
        return out;
    }

    // ================================================================== drivers
    // A driver knows one tool's REST API and nothing else. req(method, url, body) is the engine's transport.
    var DRIVERS = {};

    // ---- Polarion (REST API v1, JSON:API). Documents hold the items; a work item's parent is its "parent" link.
    DRIVERS.polarion = {
        id: 'polarion', label: 'Polarion', short: 'Polarion', container: 'document', containers: 'documents',
        sendFields: [{ key: 'type', label: 'Polarion work item type', placeholder: 'requirement' }],
        auths: [['bearer', 'Personal access token']],
        hint: 'The Polarion address (for example https://polarion.example.com) and the project id. A personal access token is made in Polarion under My Account, Personal Access Token. Your Polarion administrator must have turned the REST API on.',
        api: function (c) { var b = String(c.baseUrl || '').replace(/\/+$/, ''); return /\/polarion\/rest\/v1$/.test(b) ? b : (/\/polarion$/.test(b) ? b + '/rest/v1' : b + '/polarion/rest/v1'); },
        enc: function (s) { return encodeURIComponent(String(s)); },
        async test(c, req) { var j = await req('GET', this.api(c) + '/projects/' + this.enc(c.project) + '?fields%5Bprojects%5D=name'); return S(j && j.data && j.data.attributes && j.data.attributes.name) || S(c.project); },
        async projects(c, req) {
            var out = [], n = 1;
            for (var g = 0; g < 50; g++) {
                var j = await req('GET', this.api(c) + '/projects?page%5Bsize%5D=100&page%5Bnumber%5D=' + n + '&fields%5Bprojects%5D=name');
                arrOf(j && j.data).forEach(function (p) { out.push({ id: S(p.id), name: S(p.attributes && p.attributes.name) || S(p.id) }); });
                if (!(j && j.links && j.links.next) || !arrOf(j && j.data).length) break; n++;
            }
            return out;
        },
        async listContainers(c, req) {
            var out = [], n = 1;
            for (var g = 0; g < 100; g++) {
                var j = await req('GET', this.api(c) + '/projects/' + this.enc(c.project) + '/documents?page%5Bsize%5D=100&page%5Bnumber%5D=' + n + '&fields%5Bdocuments%5D=title,moduleName');
                arrOf(j && j.data).forEach(function (d) { var id = S(d.id), parts = id.split('/'); out.push({ id: id, name: S(d.attributes && (d.attributes.title || d.attributes.moduleName)) || parts.slice(2).join('/'), where: parts[1] === '_default' ? '' : parts[1] }); });
                if (!(j && j.links && j.links.next) || !arrOf(j && j.data).length) break; n++;
            }
            return out;
        },
        // every work item in the document, in document order, with its parent
        async read(c, req, container) {
            var api = this.api(c), self = this, p = String(container).split('/');
            if (p.length < 3) throw new Error('Polarion document ' + container + ' is not a project/space/document id.');
            var docPath = '/projects/' + self.enc(p[0]) + '/spaces/' + self.enc(p[1]) + '/documents/' + self.enc(p.slice(2).join('/'));
            var ids = [], n = 1;
            for (var g = 0; g < 400; g++) {
                var j = await req('GET', api + docPath + '/parts?page%5Bsize%5D=100&page%5Bnumber%5D=' + n + '&fields%5Bdocument_parts%5D=type,workItem');
                arrOf(j && j.data).forEach(function (pt) { var w = pt && pt.relationships && pt.relationships.workItem && pt.relationships.workItem.data; if (w && w.id) ids.push(String(w.id).split('/').pop()); });
                if (!(j && j.links && j.links.next) || !arrOf(j && j.data).length) break; n++;
            }
            var order = new Map(ids.map(function (id, i) { return [id, i]; }));
            var out = [], warn = [];
            for (var i = 0; i < ids.length; i += 50) {
                var chunk = ids.slice(i, i + 50);
                var q = 'id:(' + chunk.join(' ') + ')';
                var got = [];
                for (var n2 = 1, g2 = 0; g2 < 20; g2++, n2++) {
                    var j2 = await req('GET', api + '/projects/' + self.enc(c.project) + '/workitems?page%5Bsize%5D=100&page%5Bnumber%5D=' + n2 + '&query=' + encodeURIComponent(q) + '&fields%5Bworkitems%5D=title,description,updated,type,linkedWorkItems');
                    arrOf(j2 && j2.data).forEach(function (w) { got.push(w); });
                    if (!(j2 && j2.links && j2.links.next) || !arrOf(j2 && j2.data).length) break;
                }
                got.forEach(function (w) {
                    var a = w.attributes || {}, id = S(w.id).split('/').pop();
                    var lw = w.relationships && w.relationships.linkedWorkItems;
                    var parent = null;
                    arrOf(lw && lw.data).forEach(function (l) { var s = String(l.id || '').split('/'); if (s.length >= 5 && s[2] === 'parent' && order.has(s[4])) parent = parent || s[4]; });
                    var d = a.description || {};
                    out.push({ id: id, key: id, name: S(a.title), text: d.type === 'text/plain' ? S(d.value) : plain(d.value || ''), modified: S(a.updated), parentId: parent, sort: order.get(id), type: S(a.type), container: container });
                });
            }
            if (out.length < ids.length) warn.push((ids.length - out.length) + ' work item(s) in Polarion document ' + container + ' could not be read (they may be in another project, or this login cannot see them).');
            out.sort(function (a, b) { return a.sort - b.sort; });
            return { items: out, warnings: warn };
        },
        async seen(c, req, id) {
            var j = await req('GET', this.api(c) + '/projects/' + this.enc(c.project) + '/workitems/' + this.enc(id) + '?fields%5Bworkitems%5D=title,description,updated');
            var a = (j && j.data && j.data.attributes) || null; if (!a) return null;
            var d = a.description || {};
            return { id: String(id), name: S(a.title), text: d.type === 'text/plain' ? S(d.value) : plain(d.value || ''), modified: S(a.updated) };
        },
        async update(c, req, id, f) {
            await req('PATCH', this.api(c) + '/projects/' + this.enc(c.project) + '/workitems/' + this.enc(id), { data: { type: 'workitems', id: c.project + '/' + id, attributes: { title: f.name, description: { type: 'text/html', value: f.html } } } });
        },
        async create(c, req, container, type, f) {
            var api = this.api(c);
            var made = await req('POST', api + '/projects/' + this.enc(c.project) + '/workitems', { data: [{ type: 'workitems', attributes: { type: type || 'requirement', title: f.name, description: { type: 'text/html', value: f.html } } }] });
            var d = arrOf(made && made.data)[0]; var id = d && S(d.id).split('/').pop();
            if (!id) throw new Error('Polarion did not say which work item it made.');
            // a new work item starts outside every document; it is moved into the chosen one
            try { await req('POST', api + '/projects/' + this.enc(c.project) + '/workitems/' + this.enc(id) + '/actions/moveToDocument', { targetDocument: container }); }
            catch (e) { throw new Error('Made ' + id + ' in Polarion, but it could not be put in document ' + container + ' (' + ((e && e.message) || e) + ').'); }
            return { id: id, key: id };
        },
        async link(c, req, fromId, toId) {
            await req('POST', this.api(c) + '/projects/' + this.enc(c.project) + '/workitems/' + this.enc(toId) + '/linkedworkitems', { data: [{ type: 'linkedworkitems', attributes: { role: c.linkRole || 'relates_to' }, relationships: { workItem: { data: { type: 'workitems', id: c.project + '/' + fromId } } } }] });
        },
        async comment(c, req, id, text) {
            await req('POST', this.api(c) + '/projects/' + this.enc(c.project) + '/workitems/' + this.enc(id) + '/comments', { data: [{ type: 'workitem_comments', attributes: { text: { type: 'text/plain', value: text } } }] });
        }
    };

    // ---- Codebeamer (Swagger REST API v3). Trackers hold the items; an item's parent is its tracker parent.
    DRIVERS.codebeamer = {
        id: 'codebeamer', label: 'Codebeamer', short: 'Codebeamer', container: 'tracker', containers: 'trackers',
        auths: [['basic', 'Username and password'], ['bearer', 'Access token']],
        hint: 'The Codebeamer address (for example https://codebeamer.example.com/cb) and the project id (a number, in the project’s address). Sign in with your Codebeamer username and password, or an access token if your company uses single sign-on.',
        api: function (c) { var b = String(c.baseUrl || '').replace(/\/+$/, ''); return /\/api\/v3$/.test(b) ? b : b + '/api/v3'; },
        async test(c, req) { var j = await req('GET', this.api(c) + '/projects/' + encodeURIComponent(c.project)); return S(j && j.name) || S(c.project); },
        async projects(c, req) { var j = await req('GET', this.api(c) + '/projects'); return arrOf(j).map(function (p) { return { id: S(p.id), name: S(p.name) || S(p.id) }; }); },
        async listContainers(c, req) { var j = await req('GET', this.api(c) + '/projects/' + encodeURIComponent(c.project) + '/trackers'); return arrOf(j).map(function (t) { return { id: S(t.id), name: S(t.name) || S(t.id), where: S(t.type && t.type.name) }; }); },
        _text: function (it) { var f = S(it.descriptionFormat).toLowerCase(); return f === 'html' ? plain(it.description) : (f === 'wiki' ? wikiPlain(it.description) : S(it.description)); },
        async _keyName(c, req, tracker) {
            c._keys = c._keys || {};
            if (c._keys[tracker] === undefined) { try { var t = await req('GET', this.api(c) + '/trackers/' + encodeURIComponent(tracker)); c._keys[tracker] = S(t && t.keyName); } catch (_) { c._keys[tracker] = ''; } }
            return c._keys[tracker];
        },
        async read(c, req, container) {
            var api = this.api(c), self = this, out = [], page = 1, total = Infinity;
            var kn = await self._keyName(c, req, container);
            for (var g = 0; g < 400 && out.length < total; g++) {
                var j = await req('POST', api + '/items/query', { page: page, pageSize: 500, queryString: 'tracker.id IN (' + Number(container) + ')' });
                var list = arrOf(j && j.items);
                total = Number(j && j.total); if (!isFinite(total)) total = out.length + list.length;
                list.forEach(function (it, i) {
                    var id = S(it.id);
                    out.push({ id: id, key: kn ? kn + '-' + id : '#' + id, name: S(it.name), text: self._text(it), modified: S(it.modifiedAt), version: it.version, parentId: it.parent && it.parent.id != null ? S(it.parent.id) : null, sort: it.ordinal != null ? Number(it.ordinal) : (page - 1) * 500 + i, container: String(container) });
                });
                if (!list.length) break; page++;
            }
            // a parent in another tracker is not a function here
            var ids = new Set(out.map(function (x) { return x.id; }));
            out.forEach(function (x) { if (x.parentId != null && !ids.has(x.parentId)) x.parentId = null; });
            return { items: out, warnings: [] };
        },
        async seen(c, req, id) {
            var j = await req('GET', this.api(c) + '/items/' + encodeURIComponent(id));
            if (!j || j.id == null) return null;
            return { id: String(id), name: S(j.name), text: this._text(j), modified: S(j.modifiedAt), tracker: S(j.tracker && j.tracker.id) };
        },
        async _fields(c, req, tracker) {
            c._fields = c._fields || {};
            if (!c._fields[tracker]) {
                var name = { fieldId: 3, name: 'Summary' }, desc = { fieldId: 80, name: 'Description' };
                try {
                    var list = arrOf(await req('GET', this.api(c) + '/trackers/' + encodeURIComponent(tracker) + '/fields'));
                    list.forEach(function (f) { var n = S(f.name).toLowerCase(); if (n === 'summary' || n === 'name') name = { fieldId: Number(f.id), name: S(f.name) }; if (n === 'description') desc = { fieldId: Number(f.id), name: S(f.name) }; });
                } catch (_) {}
                c._fields[tracker] = { name: name, desc: desc };
            }
            return c._fields[tracker];
        },
        async update(c, req, id, f, tracker) {
            if (!tracker) { var s = await this.seen(c, req, id); tracker = s && s.tracker; }
            var fl = await this._fields(c, req, tracker);
            await req('PUT', this.api(c) + '/items/' + encodeURIComponent(id) + '/fields', { fieldValues: [
                { fieldId: fl.name.fieldId, name: fl.name.name, type: 'TextFieldValue', value: f.name },
                { fieldId: fl.desc.fieldId, name: fl.desc.name, type: 'WikiTextFieldValue', value: f.text } ] });
        },
        async create(c, req, container, type, f) {
            var made = await req('POST', this.api(c) + '/trackers/' + encodeURIComponent(container) + '/items', { name: f.name, description: f.text, descriptionFormat: 'PlainText' });
            if (!made || made.id == null) throw new Error('Codebeamer did not say which item it made.');
            var kn = await this._keyName(c, req, container);
            return { id: S(made.id), key: kn ? kn + '-' + made.id : '#' + made.id };
        },
        async link(c, req, fromId, toId) {
            var api = this.api(c);
            if (c._assoc == null) {
                c._assoc = 0;
                try { var ts = arrOf(await req('GET', api + '/associations/types')); var pick = ts.filter(function (t) { return /^related/i.test(S(t.name)); })[0] || ts.filter(function (t) { return /^depends/i.test(S(t.name)); })[0]; c._assoc = pick ? Number(pick.id) : 0; } catch (_) {}
            }
            await req('POST', api + '/associations', { from: { id: Number(fromId), type: 'TrackerItemReference' }, to: { id: Number(toId), type: 'TrackerItemReference' }, type: { id: c._assoc || 1 }, description: 'Linked by Safety Lab', descriptionFormat: 'PlainText' });
        },
        // Codebeamer keeps who changed what in the item's own history; its REST API has no plain comment call, so the
        // signer and reason go into Safety Lab's History only
        comment: null
    };

    // ---- DOORS Next (OSLC RM 2.0 and the DOORS Next module structure API). PILOT: reading is on; sending switches on
    // once it has been proven against a real DOORS Next server. Modules hold the items; the structure API gives their
    // order and nesting. Every request carries the project's stream (configuration) when one was chosen.
    var DCT = 'http://purl.org/dc/terms/', OSLC = 'http://open-services.net/ns/core#', ORM = 'http://open-services.net/ns/rm#', JRM = 'http://jazz.net/ns/rm#';
    var NAV = 'http://jazz.net/ns/rm/navigation#', DNGM = 'http://jazz.net/ns/rm/dng/module#', OCFG = 'http://open-services.net/ns/config#', OAUTO = 'http://open-services.net/ns/auto#';
    DRIVERS.doors = {
        id: 'doors', label: 'DOORS Next', short: 'DOORS Next', container: 'module', containers: 'modules', pilotSend: true, projectByName: true, needsOpts: true,
        sendFields: [{ key: 'type', label: 'Artifact type (its type address; empty for the project\u2019s first)', placeholder: 'https://.../rm/types/...' }, { key: 'folder', label: 'Folder for new items (its address)', placeholder: 'https://.../rm/folders/...' }],
        auths: [['password', 'Username and password'], ['apppass', 'Username and application password (single sign-on)']],
        hint: 'The DOORS Next address including its context root (for example https://dng.example.com:9443/rm) and the project area’s name. Sign in with your Jazz username and password; if your company signs in through single sign-on, make an application password on the Jazz Authorization Server and use that.',
        extra: [
            { key: 'authHost', label: 'Sign-in server, if your company’s is separate (for example jas.example.com)', placeholder: 'leave empty when it is the same server', login: true },
            { key: 'stream', label: 'Stream (configuration)', list: 'streams', empty: 'The project’s default stream' }
        ],
        api: function (c) { var b = String(c.baseUrl || '').replace(/\/+$/, ''); try { var u = new URL(b); if (!u.pathname || u.pathname === '/') return b + '/rm'; } catch (_) {} return b; },
        H: function (c, extra) { var h = { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' }; if (c.stream) h['Configuration-Context'] = c.stream; return Object.assign(h, extra || {}); },
        HM: function (c, accept) { var h = { 'DoorsRP-Request-Type': 'public 2.0', 'Accept': accept || 'application/rdf+xml' }; if (c.stream) h['vvc.configuration'] = c.stream; return h; },
        async rdf(c, req, url, hdr) { var r = await req('GET', url, undefined, { raw: true, headers: hdr || this.H(c) }); return { g: rdfParse(r.text), etag: r.etag, text: r.text }; },
        async projects(c, req) {
            var root = await this.rdf(c, req, this.api(c) + '/rootservices', { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' });
            var cat = '';
            root.g.all.forEach(function (n) { var v = rv(n, 'http://open-services.net/xmlns/rm/1.0/rmServiceProviders'); if (v && !cat) cat = v; });
            if (!cat) throw new Error('This DOORS Next does not name its project catalog in rootservices; check the address (it ends in the context root, usually /rm).');
            var g = (await this.rdf(c, req, cat, { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' })).g;
            return g.ofType(OSLC + 'ServiceProvider').map(function (sp) { return { id: sp.about, name: rv(sp, DCT + 'title') || sp.about, projectURL: rv(sp, OSLC + 'details') }; });
        },
        async _prov(c, req) {
            if (c._prov) return c._prov;
            var want = S(c.project), list = await this.projects(c, req);
            var hit = list.filter(function (p) { return p.id === want || p.name === want || p.projectURL === want; })[0];
            if (!hit) throw new Error('No DOORS Next project area called ' + want + ' that this login can open.');
            return (c._prov = hit);
        },
        async _svc(c, req) {
            if (c._svc) return c._svc;
            var pv = await this._prov(c, req), g = (await this.rdf(c, req, pv.id)).g, out = { query: '', folders: '', factory: '', shapes: [], component: '' };
            g.ofType(OSLC + 'QueryCapability').forEach(function (q) {
                var rt = rvs(q, OSLC + 'resourceType'), t = rv(q, DCT + 'title'), qb = rv(q, OSLC + 'queryBase');
                if (!out.query && rt.indexOf(ORM + 'Requirement') >= 0) out.query = qb;
                if (!out.folders && /folder/i.test(t)) out.folders = qb;
            });
            g.ofType(OSLC + 'CreationFactory').forEach(function (f) {
                if (out.factory || rvs(f, OSLC + 'resourceType').indexOf(ORM + 'Requirement') < 0) return;
                out.factory = rv(f, OSLC + 'creation'); out.shapes = rvs(f, OSLC + 'resourceShape'); out.component = rv(f, OCFG + 'component');
            });
            if (!out.query) throw new Error('DOORS Next did not offer a requirement query for this project.');
            return (c._svc = out);
        },
        async test(c, req) { var pv = await this._prov(c, req); await this._svc(c, req); return pv.name; },
        async streams(c, req) {
            var sv = await this._svc(c, req); if (!sv.component) return [];
            var g = (await this.rdf(c, req, sv.component + '/configurations', { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' })).g, ids = [];
            g.all.forEach(function (n) { rvs(n, 'http://www.w3.org/2000/01/rdf-schema#member').forEach(function (u) { if (/\/stream\//.test(u)) ids.push(u); }); });
            var out = [];
            for (var i = 0; i < ids.length && i < 100; i++) { var sg = (await this.rdf(c, req, ids[i], { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' })).g; var nd = sg.nodes[ids[i]] || sg.all[0]; out.push({ id: ids[i], name: rv(nd, DCT + 'title') || ids[i] }); }
            return out;
        },
        // an OSLC query, every page of it
        async _query(c, req, where, select) {
            var sv = await this._svc(c, req), out = [];
            var url = sv.query + (sv.query.indexOf('?') >= 0 ? '&' : '?') + 'oslc.prefix=' + encodeURIComponent('rdf=<' + RDF + '>,dcterms=<' + DCT + '>') +
                '&oslc.where=' + encodeURIComponent(where) + '&oslc.select=' + encodeURIComponent(select) + '&oslc.paging=true&oslc.pageSize=200';
            for (var g = 0; g < 200 && url; g++) {
                var r = (await this.rdf(c, req, url)).g, next = '';
                r.all.forEach(function (n) { rvs(n, 'http://www.w3.org/2000/01/rdf-schema#member').forEach(function (m) { if (r.nodes[m]) out.push(r.nodes[m]); }); var nx = rv(n, OSLC + 'nextPage'); if (nx) next = nx; });
                url = next && next !== url ? next : '';
            }
            return out;
        },
        async listContainers(c, req) {
            var mods = await this._query(c, req, 'rdf:type=<' + JRM + 'Module>', 'dcterms:title,dcterms:identifier');
            return mods.map(function (m) { return { id: m.about.split('?')[0], name: rv(m, DCT + 'title') || m.about, where: rv(m, DCT + 'identifier') }; });
        },
        _art: function (g, url) { var base = url.split('?')[0]; return g.nodes[url] || g.all.filter(function (n) { return n.about.split('?')[0] === base; })[0] || null; },
        _item: function (nd, url) {
            var desc = nd.props[DCT + 'description'] ? rv(nd, DCT + 'description') : rv(nd, JRM + 'primaryText');
            return { id: url.split('?')[0], key: rv(nd, DCT + 'identifier') || url.split('/').pop(), name: rv(nd, DCT + 'title'), text: desc, modified: rv(nd, DCT + 'modified') };
        },
        async read(c, req, module) {
            var self = this, mg = (await this.rdf(c, req, module, this.HM(c))).g, st = '';
            mg.all.forEach(function (n) { var v = rv(n, DNGM + 'structure'); if (v && !st) st = v; });
            if (!st) st = module.replace(/\/+$/, '') + '/structure';
            var sr = await req('GET', st, undefined, { raw: true, headers: this.HM(c, 'application/json') });
            var arr; try { arr = JSON.parse(sr.text); } catch (_) { throw new Error('DOORS Next answered the module structure of ' + module + ' in a form Safety Lab cannot read.'); }
            var by = {}; arrOf(arr).forEach(function (b) { if (b && b.uri) by[b.uri] = b; });
            var rootB = arrOf(arr).filter(function (b) { return b && (String(b.isStructureRoot) === 'true' || b.uri === st); })[0];
            if (!rootB) throw new Error('The module structure of ' + module + ' has no root.');
            var flat = [], seenB = {};
            (function walk(list, parentArt, depth) {
                arrOf(list).forEach(function (u) {
                    var b = by[u]; if (!b || seenB[u] || depth > 60) return; seenB[u] = 1;
                    var art = b.boundArtifact && b.boundArtifact !== RDF + 'nil' ? String(b.boundArtifact) : '';
                    if (art) flat.push({ art: art, parent: parentArt, heading: b.isHeading === true || String(b.isHeading) === 'true', sort: flat.length });
                    walk(b.childBindings, art || parentArt, depth + 1);
                });
            })(rootB.childBindings, null, 0);
            var items = [], warn = [], failed = 0;
            for (var i = 0; i < flat.length; i++) {
                var f = flat[i];
                try {
                    var ag = (await this.rdf(c, req, f.art)).g, nd = this._art(ag, f.art);
                    if (!nd) { failed++; continue; }
                    var it = this._item(nd, f.art); it.parentId = f.parent ? f.parent.split('?')[0] : null; it.sort = f.sort; it.heading = f.heading; it.container = module;
                    items.push(it);
                } catch (e) { failed++; if (warn.length < 3) warn.push('Could not read ' + f.art + ' in module ' + module + ': ' + ((e && e.message) || e)); }
            }
            if (failed) warn.push(failed + ' item(s) of module ' + module + ' could not be read; nothing from this module is flagged as missing this time.');
            return { items: items, warnings: warn, partial: failed > 0 };
        },
        async seen(c, req, url) { var r = await this.rdf(c, req, url), nd = this._art(r.g, url); if (!nd) return null; var it = this._item(nd, url); it.etag = r.etag; return it; },
        // change a literal in a resource's RDF/XML, leaving everything else exactly as the server sent it
        _setLit: function (xml, ns, local, valueXml, literal) {
            var pm = new RegExp('xmlns:([\\w.-]+)="' + ns.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '"').exec(xml), pre = pm ? pm[1] : '';
            var el = literal ? '<' + (pre || 'slx') + ':' + local + (pre ? '' : ' xmlns:slx="' + ns + '"') + ' rdf:parseType="Literal">' + valueXml + '</' + (pre || 'slx') + ':' + local + '>'
                             : '<' + (pre || 'slx') + ':' + local + (pre ? '' : ' xmlns:slx="' + ns + '"') + '>' + valueXml + '</' + (pre || 'slx') + ':' + local + '>';
            if (pre) {
                var re = new RegExp('<' + pre + ':' + local + '\\b[^>]*?(\\/>|>[\\s\\S]*?<\\/' + pre + ':' + local + '>)');
                if (re.test(xml)) return xml.replace(re, function () { return el; });
            }
            var end = xml.indexOf('</rdf:Description>');
            return end < 0 ? xml : xml.slice(0, end) + el + xml.slice(end);
        },
        _xhtml: function (text) { return '<div xmlns="http://www.w3.org/1999/xhtml">' + String(text || '').split('\n').map(_xesc).join('<br/>') + '</div>'; },
        async update(c, req, url, f) {
            var r = await req('GET', url, undefined, { raw: true, headers: this.H(c) });
            if (!r.etag) throw new Error('DOORS Next did not give a version (ETag) for ' + url + ', so it is not changed.');
            var x = this._setLit(r.text, DCT, 'title', _xesc(f.name), true);
            x = this._setLit(x, DCT, 'description', this._xhtml(f.text), true);
            var w = await req('PUT', url, x, { raw: true, headers: this.H(c, { 'Content-Type': 'application/rdf+xml', 'If-Match': r.etag }) });
            if (w.status === 412 || w.status === 409) throw new Error('changed in DOORS Next while Safety Lab was sending; check it, then send again');
        },
        async create(c, req, module, shape, f, s) {
            var sv = await this._svc(c, req);
            if (!sv.factory) throw new Error('DOORS Next offered no way to create a requirement in this project.');
            var body = '<rdf:RDF xmlns:rdf="' + RDF + '" xmlns:dcterms="' + DCT + '" xmlns:oslc="' + OSLC + '" xmlns:oslc_rm="' + ORM + '" xmlns:nav="' + NAV + '">' +
                '<rdf:Description rdf:about=""><rdf:type rdf:resource="' + ORM + 'Requirement"/>' +
                '<dcterms:title rdf:parseType="Literal">' + _xesc(f.name) + '</dcterms:title>' +
                '<dcterms:description rdf:parseType="Literal">' + this._xhtml(f.text) + '</dcterms:description>' +
                ((shape || sv.shapes[0]) ? '<oslc:instanceShape rdf:resource="' + _xesc(shape || sv.shapes[0]) + '"/>' : '') +
                (s && s.folder ? '<nav:parent rdf:resource="' + _xesc(s.folder) + '"/>' : '') + '</rdf:Description></rdf:RDF>';
            var made = await req('POST', sv.factory, body, { raw: true, headers: this.H(c, { 'Content-Type': 'application/rdf+xml' }) });
            if (made.status !== 201 || !made.location) throw new Error('DOORS Next did not say which requirement it made.');
            var it = await this.seen(c, req, made.location), out = { id: made.location.split('?')[0], key: (it && it.key) || '' };
            // into the module: the module structure, with one more entry at the end
            try {
                var mg = (await this.rdf(c, req, module, this.HM(c))).g, st = '';
                mg.all.forEach(function (n) { var v = rv(n, DNGM + 'structure'); if (v && !st) st = v; });
                if (!st) st = module.replace(/\/+$/, '') + '/structure';
                var sr = await req('GET', st, undefined, { raw: true, headers: this.HM(c, 'application/json') });
                var arr = JSON.parse(sr.text), rootB = arrOf(arr).filter(function (b) { return b && (String(b.isStructureRoot) === 'true' || b.uri === st); })[0];
                if (!rootB || !sr.etag) throw new Error('the module structure could not be read');
                var temp = st + '#1';
                arr.push({ uri: temp, type: 'dng_module:Binding', component: rootB.component || sv.component, isHeading: false, module: module, boundArtifact: out.id, childBindings: [] });
                rootB.childBindings = arrOf(rootB.childBindings).concat([temp]);
                var pu = await req('PUT', st, JSON.stringify(arr), { raw: true, okStatus: [202], headers: Object.assign(this.HM(c, 'application/json'), { 'Content-Type': 'application/json', 'If-Match': sr.etag }) });
                if (pu.status === 412) throw new Error('someone changed the module at the same moment');
                if (pu.status === 202 && pu.location) {
                    var done = false;
                    for (var k = 0; k < 30 && !done; k++) {
                        await _sleep(1000 * (W.SLAlm && W.SLAlm._waitScale != null ? W.SLAlm._waitScale : 1));
                        var tg = (await this.rdf(c, req, pu.location, { 'Accept': 'application/rdf+xml', 'OSLC-Core-Version': '2.0' })).g, tk = tg.all.filter(function (n) { return n.props[OAUTO + 'state']; })[0];
                        var state = rv(tk, OAUTO + 'state'), verdict = rv(tk, OAUTO + 'verdict');
                        if (state && !/inProgress$/.test(state)) { if (/error$|unavailable$/.test(verdict)) throw new Error('DOORS Next could not add it to the module'); done = true; }
                    }
                    if (!done) throw new Error('DOORS Next was still adding it to the module after 30 seconds');
                }
            } catch (e) { out.warning = 'made in DOORS Next (' + (out.key || out.id) + '), but not placed in the module: ' + ((e && e.message) || e) + '. Place it in the module in DOORS Next.'; }
            return out;
        },
        // a link from Safety Lab's own new item to the item it belongs to ("Link To"), kept on Safety Lab's item
        async link(c, req, fromUrl, toUrl) {
            var r = await req('GET', toUrl, undefined, { raw: true, headers: this.H(c) });
            var end = r.text.indexOf('</rdf:Description>'); if (end < 0 || !r.etag) throw new Error('the item could not be read for the link');
            var x = r.text.slice(0, end) + '<sllink:Link xmlns:sllink="http://www.ibm.com/xmlns/rdm/types/" rdf:resource="' + _xesc(fromUrl) + '"/>' + r.text.slice(end);
            var w = await req('PUT', toUrl, x, { raw: true, headers: this.H(c, { 'Content-Type': 'application/rdf+xml', 'If-Match': r.etag }) });
            if (w.status === 412) throw new Error('changed in DOORS Next while the link was being added');
        },
        comment: null      // DOORS Next has no public way to write a comment; the signer and reason are in History
    };

    // ---- Cameo (Teamwork Cloud REST API). PILOT: reading is on. Sending (only ever to elements Safety Lab made, never
    // to elements your engineers made in Cameo) switches on once it has been proven against a real Teamwork Cloud.
    DRIVERS.cameo = {
        id: 'cameo', label: 'Cameo (Teamwork Cloud)', short: 'Cameo', container: 'package', containers: 'packages', pilotSend: true, canOwn: false, needsOpts: true,
        auths: [['basic', 'Username and password']],
        hint: 'The Teamwork Cloud address (for example https://twc.example.com:8111) and the project. Sign in with your Teamwork Cloud username and password. Safety Lab reads the packages you choose; it never changes an element your engineers made in Cameo.',
        extra: [{ key: 'branch', label: 'Branch', list: 'branches', empty: 'trunk' }],
        api: function (c) { return String(c.baseUrl || '').replace(/\/+$/, '').replace(/\/osmc$/, '') + '/osmc'; },
        J: { 'Accept': 'application/ld+json' },
        _title: function (o) { return S(o && (o['dcterms:title'] || o.title || o.name || (o['kerml:esiData'] && o['kerml:esiData'].name))); },
        _idOf: function (v) { v = S(v && (v['@id'] != null ? v['@id'] : v)); return v.replace(/^#/, '').split('/').pop(); },
        async projects(c, req) {
            var j = await req('GET', this.api(c) + '/resources?includeBody=true', undefined, { headers: this.J }), out = [], seen = {}, self = this;
            (function walk(o) {
                if (Array.isArray(o)) { o.forEach(walk); return; }
                if (!o || typeof o !== 'object') return;
                var id = S(o.ID || o['kerml:resourceID'] || (o['@id'] && /^[0-9a-f-]{36}$/i.test(self._idOf(o['@id'])) ? self._idOf(o['@id']) : ''));
                var t = self._title(o);
                if (id && t && !seen[id]) { seen[id] = 1; out.push({ id: id, name: t.replace(/\.MASTER$/, '') }); }
                Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
            })(j);
            return out;
        },
        async branches(c, req) {
            var j = await req('GET', this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches', undefined, { headers: this.J }), self = this;
            var ids = []; (function walk(o) { if (Array.isArray(o)) { o.forEach(walk); return; } if (o && typeof o === 'object') { arrOf(o['ldp:contains']).forEach(function (x) { ids.push(self._idOf(x)); }); } })(j);
            var out = [];
            for (var i = 0; i < ids.length && i < 50; i++) { var b = await this._branch(c, req, ids[i]); out.push({ id: ids[i], name: b.title || ids[i] }); }
            return out;
        },
        async _branch(c, req, id) {
            var j = await req('GET', this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(id), undefined, { headers: this.J });
            var out = { title: '', latest: null };
            arrOf(Array.isArray(j) ? j : [j]).forEach(function (o) { if (o && o.latestRevision != null) { out.latest = Number(o.latestRevision); out.title = S(o['dcterms:title']); } });
            return out;
        },
        async _branchId(c, req) {
            if (c._br) return c._br;
            if (c.branch) return (c._br = c.branch);
            var list = await this.branches(c, req), pick = list.filter(function (b) { return /^(trunk|master|main)$/i.test(b.name); })[0] || list[0];
            if (!pick) throw new Error('This Teamwork Cloud project has no branch this login can see.');
            return (c._br = pick.id);
        },
        async test(c, req) {
            var j = await req('GET', this.api(c) + '/resources/' + encodeURIComponent(c.project), undefined, { headers: this.J }), t = '', self = this;
            (function walk(o) { if (Array.isArray(o)) { o.forEach(walk); return; } if (o && typeof o === 'object' && !t) t = self._title(o); })(j);
            await this._branchId(c, req);
            return (t || S(c.project)).replace(/\.MASTER$/, '');
        },
        _norm: function (id, parts) {
            var el = arrOf(parts).filter(function (x) { return x && x['kerml:esiData']; })[0]; if (!el) return null;
            var e = el['kerml:esiData'] || {}, ty = el['@type'], self = this;
            ty = (Array.isArray(ty) ? ty.filter(function (t) { return !/^ldp:/.test(t); })[0] : ty) || '';
            var ids = function (v) { return arrOf(Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : [])).map(function (x) { return self._idOf(x); }).filter(Boolean); };
            return { id: id, type: S(ty), name: S(e.name != null ? e.name : el['kerml:name']), owner: ids(e.owner || el['kerml:owner'])[0] || null, owned: ids(e.ownedElement || el['kerml:ownedElement']),
                     comments: ids(e.ownedComment), body: S(e.body), modified: S(el['kerml:modifiedTime']) };
        },
        async _batch(c, req, ids) {
            var br = await this._branchId(c, req), out = {}, self = this;
            for (var i = 0; i < ids.length; i += 200) {
                var j = await req('POST', this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(br) + '/elements', ids.slice(i, i + 200), { headers: { 'Accept': 'application/ld+json', 'Content-Type': 'application/json' } });
                Object.keys(j || {}).forEach(function (k) { var n = self._norm(k, j[k]); if (n) out[k] = n; });
            }
            return out;
        },
        async _roots(c, req) {
            var br = await this._branchId(c, req), b = await this._branch(c, req, br);
            if (b.latest == null) throw new Error('Teamwork Cloud did not say which revision of the branch is the latest.');
            var j = await req('GET', this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(br) + '/revisions/' + b.latest, undefined, { headers: this.J }), out = [];
            arrOf(Array.isArray(j) ? j : [j]).forEach(function (o) { arrOf(o && o.rootObjectIDs).forEach(function (x) { out.push(S(x)); }); });
            return out;
        },
        _isPkg: function (t) { return /(^|:)(Package|Model|Profile)$/.test(t); },
        async listContainers(c, req) {
            var roots = await this._roots(c, req), out = [], queue = roots.map(function (r) { return { id: r, path: '' }; }), fetched = 0;
            while (queue.length && fetched < 5000) {
                var layer = queue.splice(0, 200), got = await this._batch(c, req, layer.map(function (q) { return q.id; })); fetched += layer.length;
                var self = this;
                layer.forEach(function (q) {
                    var n = got[q.id]; if (!n || !self._isPkg(n.type)) return;
                    var path = q.path ? q.path + ' / ' + n.name : n.name;
                    if (q.path) out.push({ id: n.id, name: n.name, where: q.path });
                    if (path.split(' / ').length < 8) n.owned.forEach(function (k) { queue.push({ id: k, path: path }); });
                });
            }
            return out;
        },
        ETYPES: [['Activity', 'Activities'], ['Class', 'Blocks and classes'], ['Requirement', 'SysML requirements'], ['Any', 'Any named element']],
        pickExtra: { key: 'etype', label: 'Cameo elements', options: function () { return DRIVERS.cameo.ETYPES; }, def: { fn: 'Activity', req: 'Requirement', asm: 'Requirement' } },
        async read(c, req, pkg, pick) {
            var et = (pick && pick.etype) || ({ fn: 'Activity', req: 'Requirement', asm: 'Requirement' })[(pick && pick.kind) || 'req'];
            var all = {}, queue = [pkg], n0 = 0;
            while (queue.length && n0 < 30000) {
                var layer = queue.splice(0, 200), got = await this._batch(c, req, layer); n0 += layer.length;
                layer.forEach(function (id) { var n = got[id]; if (!n) return; all[id] = n; n.owned.forEach(function (k) { if (!all[k]) queue.push(k); }); });
            }
            var want = function (n) {
                if (n.id === pkg || !n.name) return false;
                if (et === 'Activity') return /(^|:)Activity$/.test(n.type);
                if (et === 'Class' || et === 'Requirement') return /(^|:)Class$/.test(n.type);
                return !/(^|:)(Comment|Package|Model|Profile)$/.test(n.type) && !!n.name;
            };
            var picked = Object.keys(all).map(function (k) { return all[k]; }).filter(want);
            var br = await this._branchId(c, req), base = this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(br) + '/elements/';
            var reqText = {};
            if (et === 'Requirement') {
                var keep = [];
                for (var i = 0; i < picked.length; i++) {
                    var e = picked[i], sj = await req('GET', base + e.id + '/stereotypes', undefined, { headers: this.J }), sid = '';
                    arrOf(Array.isArray(sj) ? sj : [sj]).forEach(function (o) { arrOf(o && o['uml:stereotypes']).concat(o && o['uml:stereotypes'] && !Array.isArray(o['uml:stereotypes']) ? [o['uml:stereotypes']] : []).forEach(function (st) { if (/requirement/i.test(S(st['uml:stereotypeName'])) && !sid) sid = S(st['uml:stereotypeId']); }); });
                    if (!sid) continue;
                    var tj = await req('GET', base + e.id + '/stereotypes/' + encodeURIComponent(sid) + '/tags', undefined, { headers: this.J }), tags = {};
                    arrOf(Array.isArray(tj) ? tj : [tj]).forEach(function (o) { var vs = o && o['uml:values']; arrOf(Array.isArray(vs) ? vs : (vs ? [vs] : [])).forEach(function (v) { tags[S(v['uml:tagName']).toLowerCase()] = Array.isArray(v['uml:tagValue']) ? v['uml:tagValue'].join('\n') : S(v['uml:tagValue']); }); });
                    reqText[e.id] = tags; keep.push(e);
                }
                picked = keep;
            }
            // documentation: the element's own comments
            var cids = []; picked.forEach(function (e) { e.comments.forEach(function (k) { if (!all[k]) cids.push(k); }); });
            if (cids.length) { var cg = await this._batch(c, req, cids); Object.keys(cg).forEach(function (k) { all[k] = cg[k]; }); }
            var set = {}; picked.forEach(function (e) { set[e.id] = 1; });
            var items = picked.map(function (e, i) {
                var doc = e.comments.map(function (k) { return all[k] ? plain(all[k].body) : ''; }).filter(Boolean).join('\n');
                var tg = reqText[e.id] || {};
                var par = e.owner, g = 0; while (par && !set[par] && all[par] && g++ < 200) par = all[par].owner;
                return { id: e.id, key: S(tg.id) || e.name, name: e.name, text: S(tg.text) ? plain(tg.text) : doc, modified: e.modified, parentId: par && set[par] ? par : null, sort: i, container: pkg };
            });
            return { items: items, warnings: n0 >= 30000 ? ['Read the first 30,000 elements under package ' + pkg + ' only; nothing from it is flagged as missing this time.'] : [], partial: n0 >= 30000 };
        },
        async seen(c, req, id) {
            var got = await this._batch(c, req, [id]), n = got[id]; if (!n) return null;
            var cg = n.comments.length ? await this._batch(c, req, n.comments) : {};
            return { id: id, name: n.name, text: n.comments.map(function (k) { return cg[k] ? plain(cg[k].body) : ''; }).filter(Boolean).join('\n'), modified: n.modified, comments: n.comments };
        },
        // PILOT (not switched on): Safety Lab's own elements only
        async update(c, req, id, f) {
            var br = await this._branchId(c, req), base = this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(br) + '/elements/';
            await req('PATCH', base + id, { 'kerml:esiData': { name: f.name }, 'kerml:comment': 'Safety Lab' }, { headers: { 'Accept': 'application/ld+json', 'Content-Type': 'application/ld+json' } });
            var s0 = await this.seen(c, req, id);
            if (s0 && s0.comments[0]) await req('PATCH', base + s0.comments[0], { 'kerml:esiData': { body: f.text }, 'kerml:comment': 'Safety Lab' }, { headers: { 'Accept': 'application/ld+json', 'Content-Type': 'application/ld+json' } });
        },
        async create(c, req, pkg, type, f) {
            var br = await this._branchId(c, req), base = this.api(c) + '/resources/' + encodeURIComponent(c.project) + '/branches/' + encodeURIComponent(br) + '/elements/';
            var id = (W.crypto && W.crypto.randomUUID) ? W.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); });
            await req('POST', base + id, { '@type': 'uml:Class', 'kerml:esiData': { name: f.name, owningPackage: { '@id': pkg }, owner: [{ '@id': pkg }] }, 'kerml:comment': 'Safety Lab' }, { headers: { 'Accept': 'application/ld+json', 'Content-Type': 'application/ld+json' } });
            return { id: id, key: f.name };
        },
        link: null, comment: null
    };

    // ================================================================== one connected tool
    function makeTool(drv) {
        var tid = drv.id;
        var WATCH = 'safetyLab.alm.' + tid + '.watch';
        var state = { diff: null, seen: new Map(), checkedAt: '', warnings: [], checking: false, progress: '' };

        // ---- config: a project setting, shared by everyone on the project. The login stays on each person's computer.
        function cfg() {
            var pc = _pc(); var c = pc && pc.almTools && pc.almTools[tid];
            return JSON.parse(JSON.stringify(c && typeof c === 'object' ? c : {}));
        }
        function cfgSave(c, why) {
            var pc = _pc(); if (!pc) return false;
            var o = Object.assign({}, c || {}); delete o.token; delete o._keys; delete o._fields; delete o._assoc;
            // a setting and its History line: background work for the change confirmation, never a change to confirm
            _bg(function () { if (!pc.almTools || typeof pc.almTools !== 'object') pc.almTools = {}; pc.almTools[tid] = o; if (why && W.SLConnections) W.SLConnections.log({ tool: tid, what: 'connect', text: why, result: 'done' }); _save(); });
            return true;
        }
        var _rt = {};   // per session look-ups (key names, field ids) that are not settings
        function rcfg() { return Object.assign(_rt, cfg()); }
        function configured() { var c = cfg(); return !!(c.baseUrl && c.project); }
        function watch() { try { return localStorage.getItem(WATCH) === '1'; } catch (_) { return false; } }

        // ---- the login
        var _deskHas = null;
        async function refreshHas() {
            if (_isDesktop() && W.slabSecrets && typeof W.slabSecrets.status === 'function') {
                try { var r = await W.slabSecrets.status(); _deskHas = ((r && r.secrets) || []).some(function (e) { return e && e.kind === tid; }); } catch (_) { _deskHas = false; }
            }
            return hasLogin();
        }
        function hasLogin() {
            if (_isDesktop()) return !!_deskHas;
            var st = _store(); return !!(st && st.door() === 'vault' && st.has(tid + '_token'));
        }
        function doorProblem() {
            if (_desktopOld()) return 'This version of the desktop app cannot reach ' + drv.label + '. Update the app.';
            if (_isDesktop() && drv.needsOpts && !(W.slabBridge && W.slabBridge.toolOpts === true)) return 'This version of the desktop app cannot reach ' + drv.label + ' yet. Update the app.';
            if (_isDesktop()) return '';
            var st = _store();
            if (st && st.door() === 'vault') return '';
            return drv.label + ' connects through the Safety Lab desktop app or your company’s Safety Lab server, which keep the login in the computer’s keychain or the server’s vault. A browser-only session has nowhere safe to keep it.';
        }
        async function saveLogin(baseUrl, auth, user, token, authHost) {
            var p = doorProblem(); if (p) return { ok: false, err: p };
            var meta = { baseHost: _host(baseUrl), user: user || '', auth: auth };
            if (authHost) meta.authHost = String(authHost).toLowerCase();
            if (!meta.baseHost) return { ok: false, err: 'The address is not a valid https address.' };
            if (_isDesktop()) {
                var r = await W.slabSecrets.save(tid, { user: user || '', token: token }, meta);
                if (!(r && r.ok)) return { ok: false, err: (r && r.error) || 'The keychain refused the login.' };
                await refreshHas(); return { ok: true, where: 'this computer’s keychain' };
            }
            var r2 = await _store().save(tid + '_token', token, meta);
            if (!(r2 && r2.ok)) return { ok: false, err: (r2 && r2.error) || 'The server refused the login.' };
            return { ok: true, where: 'your Safety Lab server’s vault' };
        }

        // ---- the transport: one request, through the desktop or the server, retried when the tool says "slow down"
        // opts.headers: the tool's own protocol headers (DOORS Next and Cameo; the fence names which may pass).
        // opts.raw: the body is sent as given (RDF/XML, JSON-LD) and the answer comes back whole, as
        // { status, text, etag, location }, whatever its status, so the driver can read an ETag, a Location, or a 412.
        async function req(method, url, body, opts) {
            var c = cfg(), o = opts || {}, hdr = o.headers || {};
            var bad = almRequestProblem(tid, method, url, _host(c.baseUrl), hdr); if (bad) throw new Error('Not sent: ' + bad + '.');
            var p = doorProblem(); if (p) throw new Error(p);
            var scale = (W.SLAlm && W.SLAlm._waitScale != null ? W.SLAlm._waitScale : 1);
            for (var tries = 0; ; tries++) {
                var status = 0, data = null, err = '', wait = 0, env = null;
                if (_isDesktop()) {
                    var r = await W.slabBridge.tool(tid, method, url, body, { headers: hdr, raw: !!o.raw });
                    if (o.raw && r && r.raw) env = r;
                    else if (r && r.ok) return r.data;
                    else { status = (r && r.status) || 0; err = (r && r.error) || 'the request failed'; wait = Number(r && r.retryAfter) || 0; }
                } else {
                    var st = _store(), jwt = st.sessionJwt();
                    if (!jwt) throw new Error('Sign in again to use the connection.');
                    var base = (W.SLConfig && W.SLConfig.aiEndpoint) || '';
                    if (!base) throw new Error('This install has no Safety Lab server address configured, so the connection has nowhere to go through.');
                    var init = { method: method, headers: { 'Authorization': 'Bearer ' + jwt, 'Accept': 'application/json' } };
                    if (Object.keys(hdr).length) init.headers['X-Slab-Tool-Headers'] = JSON.stringify(hdr);
                    if (method !== 'GET') { init.headers['Content-Type'] = o.raw ? 'text/plain' : 'application/json'; init.body = o.raw ? String(body == null ? '' : body) : JSON.stringify(body === undefined ? null : body); }
                    var res = await fetch(String(base).replace(/\/+$/, '') + '/bridge?tool=' + encodeURIComponent(tid) + (o.raw ? '&raw=1' : '') + '&target=' + encodeURIComponent(url), init);
                    var txt = ''; try { txt = await res.text(); } catch (_) {}
                    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = null; }
                    if (o.raw && res.ok && data && data.raw) env = data;
                    else if (res.ok && !o.raw) return data;
                    else {
                        status = res.status; wait = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 0;
                        err = (data && data.error && (data.error.message || data.error)) || ('HTTP ' + res.status + ' from ' + drv.label);
                    }
                }
                if (env) {
                    var es = Number(env.status) || 0;
                    if (es === 429 && tries < 3) { await _sleep(Math.min(60, Math.max(2, Number(env.retryAfter) || 10)) * 1000 * scale); continue; }
                    if ((es >= 200 && es < 300) || es === 409 || es === 412 || (o.okStatus && o.okStatus.indexOf(es) >= 0)) return { status: es, text: String(env.text || ''), etag: env.etag || '', location: env.location || '' };
                    var e0 = new Error('HTTP ' + es + ' from ' + drv.label + ' at ' + _where(url) + (env.text ? ': ' + _clipText(env.text) : '')); e0.status = es; throw e0;
                }
                if (status === 429 && tries < 3) { await _sleep(Math.min(60, Math.max(2, wait || 10)) * 1000 * scale); continue; }
                var e = new Error(String(err)); e.status = status; throw e;
            }
        }
        function _where(u) { try { return new URL(u).pathname; } catch (_) { return 'that address'; } }
        function _clipText(t) { var x = plain(String(t)).replace(/\s+/g, ' ').trim(); return x.length > 200 ? x.slice(0, 197) + '...' : x; }

        // ---- reading and staging
        function picks() { return arrOf(cfg().picks).filter(function (p) { return p && p.container && /^(fn|req|asm)$/.test(p.kind); }); }
        function _scopeName(sc) { return sc === 'ac' ? 'Aircraft' : ((_sysById(sc) || {}).name || sc); }
        function _store4(scope, kind, make) {
            if (scope === 'ac') return kind === 'fn' ? (typeof acFunctionsData !== 'undefined' ? acFunctionsData : null) : (kind === 'req' ? (typeof acReqData !== 'undefined' ? acReqData : null) : (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : null));
            var s = _sysById(scope); if (!s) return null;
            var k = kind === 'fn' ? 'functions' : (kind === 'req' ? 'req' : 'asm');
            if (!Array.isArray(s[k])) { if (!make) return null; s[k] = []; }
            return s[k];
        }
        async function check(silent) {
            if (state.checking) return state.diff;
            if (!configured()) throw new Error('Connect ' + drv.label + ' first.');
            var dp = doorProblem(); if (dp) throw new Error(dp);
            if (!hasLogin()) await refreshHas();
            if (!hasLogin()) throw new Error('No ' + drv.label + ' login is saved for you on this ' + (_isDesktop() ? 'computer' : 'server') + ': open Connection settings and sign in.');
            state.checking = true;
            try {
                var c = rcfg(), pk = picks(), warn = [], groups = {}, read = {};
                state.seen = new Map();
                for (var i = 0; i < pk.length; i++) {
                    var p = pk[i], sc = p.scope && p.scope !== 'ac' ? String(p.scope) : 'ac';
                    if (sc !== 'ac' && !_sysById(sc)) { warn.push(drv.label + ' ' + drv.container + ' ' + (p.containerName || p.container) + ' is for a system that is no longer in this project; not read.'); continue; }
                    state.progress = 'Reading ' + (p.containerName || p.container) + '...'; _render();
                    var r;
                    try { r = await drv.read(c, req, p.container, p); }
                    catch (e) { warn.push('Could not read ' + drv.container + ' ' + (p.containerName || p.container) + ': ' + ((e && e.message) || e) + '. Nothing from it is flagged as missing.'); continue; }
                    arrOf(r.warnings).forEach(function (w) { warn.push(w); });
                    var g = sc + '|' + p.kind;
                    (groups[g] = groups[g] || []);
                    // a heading in a module is only a function (in a functions module); elsewhere it is looked through
                    r.items.forEach(function (it) { if (it.heading && p.kind !== 'fn') return; it.container = String(p.container); groups[g].push(it); state.seen.set(String(it.id), it); });
                    read[g] = read[g] || new Set();
                    if (!r.partial) read[g].add(String(p.container));   // only a container read in full can say an item is gone
                }
                var d = { tool: tid, scopes: {}, warnings: warn, checkedAt: _now() };
                state.groups = groups; state.read = read;
                Object.keys(groups).forEach(function (g) {
                    var sc = g.split('|')[0], k = g.split('|')[1], store = _store4(sc, k) || [];
                    var x;
                    if (k === 'fn' && sc === 'ac') {
                        x = diffTree(tid, buildTree(groups[g]), store, read[g], { levelLimit: _levelLimit() });
                        if (x.tooDeep.length) warn.push(x.tooDeep.length + ' function(s) from ' + drv.label + ' sit below this project’s level limit and are not staged: ' + x.tooDeep.slice(0, 5).map(function (t) { return t.item.key; }).join(', ') + (x.tooDeep.length > 5 ? ' and more' : '') + '.');
                    } else x = diffFlat(tid, k === 'fn' ? 'sfn' : k, groups[g], store, read[g]);
                    (d.scopes[sc] = d.scopes[sc] || {})[k] = x;
                });
                // a group with no pick left (it was unticked): nothing read, nothing flagged
                state.diff = d; state.checkedAt = d.checkedAt; state.warnings = warn; state.progress = '';
                try { if (W.SLConnections) W.SLConnections.checked(tid, changes(), silent); } catch (e) { _report(e, 'checked'); }
                try { if (typeof W.jrnl === 'function') W.jrnl('bridge-check', drv.label + ' checked: ' + state.seen.size + ' item(s), ' + changes().length + ' change(s) waiting.'); } catch (_) {}
                if (!silent) { var n = changes().length; _toast(n ? drv.label + ': ' + n + ' change(s) waiting in Incoming changes.' : drv.label + ': everything in step.', n ? 'info' : 'success'); }
                return d;
            } finally { state.checking = false; state.progress = ''; _render(); }
        }

        // ---- the lines (connections.js)
        var CARR = { fnChanged: 'renamed', fresh: 'added', changed: 'changed', moved: 'moved', missing: 'removed' };
        function _src(row) { return row ? (row.fnSource || row.reqSource || row.asmSource || null) : null; }
        function _row(arr, e) { if (arr === 'fnChanged') return (e.rows && e.rows[0]) || null; return e.row || null; }
        function _rid(arr, e) { if (e.item && e.item.id != null) return String(e.item.id); var s = _src(_row(arr, e)); return s ? String(s.remoteId) : ''; }
        function _key(scope, k, arr, e) { return [tid, scope, k, arr, _rid(arr, e) || ('row:' + ((_row(arr, e) || {}).internalId || '')), arr === 'missing' ? 'gone' : S(e.item && e.item.modified)].join('|'); }
        function _slId(k, arr, e, row) {
            var it = e.item;
            if (k === 'fn') return S((row && (row.subId || row.funcId)) || (it && it.key));
            if (k === 'req') return S((row && row.id) || (it && it.key));
            return S((row && row.asmId) || (it && it.key));
        }
        function _ba(k, arr, e, row, flatSys) {
            var it = e.item;
            if (arr === 'fnChanged') return { before: { name: S(row && row.funcName), description: S(row && row.funcDef) }, after: { name: S(it.name), description: S(it.text) } };
            if (arr === 'moved') return { before: { place: [S(row.funcId), S(row.parentSubId)].filter(Boolean).join(' > ') }, after: { place: [e.top && e.top.key, e.parent && e.parent.key].filter(Boolean).join(' > ') } };
            if (arr === 'fresh') return { before: {}, after: (k === 'req' || k === 'asm') ? { text: S(it.text || it.name) } : { name: S(it.name), description: S(it.text) } };
            if (arr === 'missing') return { before: { name: S(row && (row.subName || row.funcName || row.text)) }, after: {} };
            if (k === 'fn' && !flatSys) return { before: { name: S(row.subName), description: S(row.subDef) }, after: { name: S(it.name), description: S(it.text) } };
            if (k === 'fn') return { before: { name: S(row.funcName), description: S(row.funcDef) }, after: { name: S(it.name), description: S(it.text) } };
            return { before: { text: S(row && row.text) }, after: { text: S(it.text || it.name) } };
        }
        function changes() {
            var d = state.diff, out = []; if (!d) return out;
            Object.keys(d.scopes).forEach(function (sc) {
                Object.keys(d.scopes[sc]).forEach(function (k) {
                    var x = d.scopes[sc][k];
                    Object.keys(CARR).forEach(function (arr) {
                        arrOf(x[arr]).forEach(function (e) {
                            var row = _row(arr, e), s0 = _src(row), ba = _ba(k, arr, e, row, sc !== 'ac');
                            out.push({ key: _key(sc, k, arr, e), tool: tid, scope: sc, scopeName: _scopeName(sc), kind: k, change: CARR[arr], arr: arr, remoteId: _rid(arr, e),
                                       extKey: S((e.item && e.item.key) || (s0 && s0.key)), name: S((e.item && e.item.name) || (row && (row.subName || row.funcName || row.text))), slId: _slId(k, arr, e, row),
                                       fields: arrOf(e.fields).slice(), why: e.why || '', before: ba.before, after: ba.after });
                        });
                    });
                });
            });
            return out;
        }
        function applyKeys(keys, signer) {
            var d = state.diff; if (!d) return { ok: false, err: 'Nothing from ' + drv.label + ' is staged: check it first.' };
            var by = S(signer); if (!by) return { ok: false, err: 'A signature is required.' };
            var want = new Set(arrOf(keys).map(String)), at = _now();
            // a new function needs its new parents: they come in with it
            Object.keys(d.scopes).forEach(function (sc) {
                var x = d.scopes[sc].fn; if (!x || sc !== 'ac') return;
                var fr = new Map(arrOf(x.fresh).map(function (e) { return [String(e.item.id), e]; }));
                var pull = function (e) { var p = e.parent, g = 0; while (p && fr.has(String(p.id)) && g++ < 1000) { var pe = fr.get(String(p.id)); want.add(_key(sc, 'fn', 'fresh', pe)); p = pe.parent; } };
                arrOf(x.fresh).forEach(function (e) { if (want.has(_key(sc, 'fn', 'fresh', e))) pull(e); });
                arrOf(x.moved).forEach(function (e) { if (want.has(_key(sc, 'fn', 'moved', e))) pull(e); });
            });
            var out = { ok: true, added: 0, updated: 0, flagged: 0, moved: 0, sys: {}, refused: [] };
            Object.keys(d.scopes).forEach(function (sc) {
                Object.keys(d.scopes[sc]).forEach(function (k) {
                    var x = d.scopes[sc][k], y = {};
                    Object.keys(CARR).forEach(function (arr) { if (Array.isArray(x[arr])) y[arr] = x[arr].filter(function (e) { return want.has(_key(sc, k, arr, e)); }); });
                    var any = Object.keys(y).some(function (a) { return y[a].length; }); if (!any) return;
                    var store = _store4(sc, k, true);
                    var r = (k === 'fn' && sc === 'ac') ? applyTree(tid, y, store, { signedBy: by, at: at, newId: _newId, label: drv.short })
                        : applyFlat(tid, k === 'fn' ? 'sfn' : k, y, store, { signedBy: by, at: at, newId: _newId, label: drv.label, level: sc === 'ac' ? 'aircraft' : 'system' });
                    if (!r.ok) { out.ok = false; out.err = r.err; return; }
                    out.added += r.added || 0; out.updated += r.updated || 0; out.flagged += r.flagged || 0; out.moved += r.moved || 0;
                    if (sc !== 'ac') out.sys[sc] = r;
                });
            });
            if (!out.ok) return out;
            ['renderACFunctions', 'renderACReq', 'renderACAssumptions', 'renderSysFunctions', 'renderSysReq', 'renderSysAssumptions'].forEach(function (fn) { try { if (typeof W[fn] === 'function') W[fn](); } catch (_) {} });
            try { if (typeof W.jrnl === 'function') W.jrnl('bridge-sync', drv.label + ' changes signed in: ' + out.added + ' new, ' + out.updated + ' updated, ' + out.moved + ' moved, ' + out.flagged + ' flagged. Signed ' + by); } catch (_) {}
            _save();
            // what is still staged, against the rows as they are now
            restage();
            return out;
        }
        function restage() {
            var d = state.diff; if (!d) return;
            var groups = state.groups || {}, read = state.read || {};
            var nd = { tool: tid, scopes: {}, warnings: d.warnings, checkedAt: d.checkedAt };
            Object.keys(d.scopes).forEach(function (sc) {
                Object.keys(d.scopes[sc]).forEach(function (k) {
                    var g = sc + '|' + k, store = _store4(sc, k) || [];
                    var rd = read[g] || new Set();
                    var x = (k === 'fn' && sc === 'ac') ? diffTree(tid, buildTree(groups[g] || []), store, rd, { levelLimit: _levelLimit() }) : diffFlat(tid, k === 'fn' ? 'sfn' : k, groups[g] || [], store, rd);
                    (nd.scopes[sc] = nd.scopes[sc] || {})[k] = x;
                });
            });
            state.diff = nd;
        }

        // ---- every Safety Lab row linked to this tool
        function linkedRows() {
            var out = [];
            var add = function (rows, kind, scope, srcKey, idOf, nameOf) { arrOf(rows).forEach(function (r) { var s = r && r[srcKey]; if (s && s.tool === tid && s.remoteId != null) out.push({ tool: tid, remoteId: String(s.remoteId), extKey: S(s.key), kind: kind, scope: scope, slId: idOf(r), name: nameOf(r), row: r, missing: !!s.missingInSource }); }); };
            add(typeof acFunctionsData !== 'undefined' ? acFunctionsData : [], 'fn', 'ac', 'fnSource', function (r) { return S(r.subId || r.funcId); }, function (r) { return S(r.subName || r.funcName); });
            add(typeof acReqData !== 'undefined' ? acReqData : [], 'req', 'ac', 'reqSource', function (r) { return S(r.id); }, function (r) { return S(r.text); });
            add(typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : [], 'asm', 'ac', 'asmSource', function (r) { return S(r.asmId); }, function (r) { return S(r.text); });
            add(typeof acFhaData !== 'undefined' ? acFhaData : [], 'fc', 'ac', 'fcSource', function (r) { return S(r.fcId); }, function (r) { return S(r.fcDesc); });
            _sysList().forEach(function (s) {
                var sc = String(s.id);
                add(s.functions, 'fn', sc, 'fnSource', function (r) { return S(r.funcId); }, function (r) { return S(r.funcName); });
                add(s.req, 'req', sc, 'reqSource', function (r) { return S(r.id); }, function (r) { return S(r.text); });
                add(s.asm, 'asm', sc, 'asmSource', function (r) { return S(r.asmId); }, function (r) { return S(r.text); });
            });
            // what Safety Lab made and sent: linked too, and Safety Lab owns it
            var sent = function (rows, kind, idOf, nameOf) { arrOf(rows).forEach(function (r) { var l = r && r.sendLinks && r.sendLinks[tid]; if (l && l.remoteId != null) out.push({ tool: tid, remoteId: String(l.remoteId), extKey: S(l.key), kind: kind, scope: 'ac', slId: idOf(r), name: nameOf(r), row: r, missing: false, made: true }); }); };
            sent(typeof acFhaData !== 'undefined' ? acFhaData : [], 'fc', function (r) { return S(r.fcId); }, function (r) { return S(r.fcDesc); });
            sent(typeof acReqData !== 'undefined' ? acReqData : [], 'req', function (r) { return S(r.id); }, function (r) { return S(r.text); });
            return out;
        }

        // ---- going out (Ready to send)
        function sendCfg() { var c = cfg(); return (c.send && typeof c.send === 'object') ? c.send : {}; }
        function _fp(o) { try { return JSON.stringify(o); } catch (_) { return ''; } }
        var OWN_NOTE = 'Safety Lab owns this item. Change it in Safety Lab; edits made here are not taken in.';
        function _fcFields(r) {
            var parts = [['Function', r.subId], ['Flight phases', Array.isArray(r.phases) ? r.phases.join(', ') : r.phases], ['Effect on the aircraft', r.effAc], ['Effect on the crew', r.effCrew], ['Effect on occupants', r.effPax], ['Severity (the engineer’s classification)', [r.severity, r.severityRationale].filter(Boolean).join(': ')]];
            var have = parts.filter(function (p) { return S(p[1]); });
            return { name: ((S(r.fcId) ? r.fcId + ' ' : '') + S(r.fcDesc)).slice(0, 230),
                     html: have.map(function (p) { return '<p><b>' + _esc(p[0]) + ':</b> ' + _html(p[1]) + '</p>'; }).join('') + '<p><i>' + OWN_NOTE + '</i></p>',
                     text: have.map(function (p) { return p[0] + ': ' + S(p[1]); }).join('\n') + '\n' + OWN_NOTE };
        }
        function _reqFields(r) {
            return { name: ((S(r.id) ? r.id + ' ' : '') + S(r.text)).slice(0, 250),
                     html: '<p>' + _html(r.text) + '</p>' + (r.rat ? '<p><b>Rationale:</b> ' + _html(r.rat) + '</p>' : '') + '<p><i>' + OWN_NOTE + '</i></p>',
                     text: S(r.text) + (r.rat ? '\nRationale: ' + S(r.rat) : '') + '\n' + OWN_NOTE };
        }
        // a pilot tool (DOORS Next, Cameo) sends nothing until sending has been proven on a real server; SLAlm._proveSend
        // switches it on for that proof (from the console, by Safety Lab), never from the page
        function sendOn() { return !drv.pilotSend || !!(W.SLAlm && W.SLAlm._proveSend && W.SLAlm._proveSend[tid]); }
        function outgoing() {
            var out = [], C = W.SLConnections; if (!C || !configured() || !sendOn()) return out;
            // 1. items from the tool that Safety Lab now owns: Safety Lab's words, where they differ from the tool's copy
            linkedRows().forEach(function (x) {
                if (x.made || x.missing || C.ownerOf(tid, x.remoteId) !== 'sl') return;
                var it = state.seen.get(String(x.remoteId)); if (!it) return;
                var s = x.row.fnSource, want;
                if (x.kind === 'fn') want = (s && s.funcOnly) || x.scope !== 'ac' ? { name: S(x.row.funcName), text: S(x.row.funcDef) } : { name: S(x.row.subName), text: S(x.row.subDef) };
                else if (x.kind === 'req' || x.kind === 'asm') want = { name: S(it.name), text: S(x.row.text) };
                else return;
                var diff = []; if (want.name !== S(it.name)) diff.push('name'); if (want.text !== S(it.text)) diff.push('description');
                if (!diff.length) return;
                out.push({ key: tid + '|own|' + x.remoteId + '|' + _fp(want).length + ':' + _fp(want).slice(0, 40), tool: tid, change: 'changed', kind: x.kind, slId: x.slId, name: x.name, remoteId: x.remoteId, seen: it.modified,
                           after: Object.assign(diff.indexOf('name') >= 0 ? { name: want.name } : {}, diff.indexOf('description') >= 0 ? { description: want.text } : {}),
                           there: drv.short + ' ' + (it.key || x.remoteId) + ': ' + diff.join(' and ') + ' differ', _want: want, _row: x.row, _src: x.kind, _tracker: it.container });
            });
            // 2. failure conditions and requirements made in Safety Lab, when Mapping says to send them
            var sc = sendCfg();
            [['fc', typeof acFhaData !== 'undefined' ? acFhaData : [], _fcFields, function (r) { return !r.fcSource && S(r.fcDesc); }],
             ['req', typeof acReqData !== 'undefined' ? acReqData : [], _reqFields, function (r) { return !r.reqSource && S(r.text); }]].forEach(function (k) {
                var s = sc[k[0]]; if (!s || !s.on) return;
                arrOf(k[1]).forEach(function (r) {
                    if (!r || !k[3](r)) return;
                    var f = k[2](r), fp = _fp(f), link = r.sendLinks && r.sendLinks[tid];
                    if (link && link.fp === fp) return;
                    out.push({ key: tid + '|' + k[0] + '|' + (r.internalId || r.fcId || r.id) + '|' + (link ? 'chg' : 'new') + '|' + fp.length + ':' + fp.slice(-24), tool: tid, change: link ? 'changed' : 'new', kind: k[0],
                               slId: S(k[0] === 'fc' ? r.fcId : r.id), name: k[0] === 'fc' ? r.fcDesc : r.text, remoteId: link ? link.remoteId : null,
                               after: link ? { name: f.name } : { name: f.name, into: drv.container + ' ' + (s.containerName || s.container || '(choose it in Mapping)') + (s.type ? ', type ' + s.type : '') },
                               there: link ? (drv.short + ' ' + (link.key || link.remoteId) + ', sent ' + String(link.at || '').slice(0, 10) + ' by ' + (link.by || '')) : 'Not in ' + drv.short + ' yet', _fields: f, _fp: fp, _row: r, _send: k[0] });
                });
            });
            return out;
        }
        async function send(lines, signer, reason) {
            if (!configured()) return { ok: false, err: 'Connect ' + drv.label + ' first.' };
            if (!sendOn()) return { ok: false, err: 'Sending to ' + drv.label + ' is not switched on yet: it is switched on once it has been proven on a real ' + drv.label + ' server.' };
            var c = rcfg(), sc = sendCfg(), res = { ok: true, sent: 0, held: [], failed: [], items: [] };
            var note = 'Sent from Safety Lab by ' + signer + (reason ? ': ' + reason : '') + '.';
            var cmt = async function (id) { if (drv.comment) { try { await drv.comment(c, req, id, note); } catch (_) {} } };
            var order = function (l) { return l._send === 'fc' ? 0 : (l._send === 'req' ? 1 : 2); };
            lines = arrOf(lines).slice().sort(function (a, b) { return order(a) - order(b); });
            for (var i = 0; i < lines.length; i++) {
                var l = lines[i], label = (l.slId ? l.slId + ' ' : '') + String(l.name || '').slice(0, 60);
                try {
                    if (l._src) {
                        var now = await drv.seen(c, req, l.remoteId);
                        if (!now) { res.failed.push(label + ': ' + drv.short + ' no longer has this item'); continue; }
                        if (S(now.modified) !== S(l.seen)) { res.held.push(label + ' (changed in ' + drv.short + ' since the last check: check ' + drv.short + ', then send again)'); continue; }
                        await drv.update(c, req, l.remoteId, { name: l._want.name, html: '<p>' + _html(l._want.text) + '</p>', text: l._want.text }, l._tracker || now.tracker);
                        await cmt(l.remoteId);
                        var after = await drv.seen(c, req, l.remoteId);   // after every write of ours, so the next check does not take it for someone else's
                        var src = l._row && (l._row.fnSource || l._row.reqSource || l._row.asmSource);
                        _bg(function () { if (src && after) { src.lastChange = after.modified; src.sentBy = signer; src.sentAt = _now(); } });
                        var it0 = state.seen.get(String(l.remoteId)); if (it0 && after) { it0.name = after.name; it0.text = after.text; it0.modified = after.modified; }
                        res.sent++; res.items.push(label); continue;
                    }
                    var s = sc[l._send] || {}, link = l._row.sendLinks && l._row.sendLinks[tid];
                    if (link) {
                        var now2 = await drv.seen(c, req, link.remoteId);
                        if (!now2) { res.failed.push(label + ': ' + drv.short + ' no longer has this item'); continue; }
                        if (link.modified && S(now2.modified) !== S(link.modified)) { var lk = link; res.held.push(label + ' (someone changed it in ' + drv.short + ' since Safety Lab last sent it; Safety Lab owns it, so send again to overwrite, after checking what they changed)'); _bg(function () { lk.modified = now2.modified; }); continue; }
                        await drv.update(c, req, link.remoteId, l._fields, now2.tracker || s.container);
                        await cmt(link.remoteId);
                        var after2 = await drv.seen(c, req, link.remoteId), lk2 = link;
                        _bg(function () { lk2.fp = l._fp; lk2.at = _now(); lk2.by = signer; lk2.modified = after2 && after2.modified; });
                        res.sent++; res.items.push(label); continue;
                    }
                    if (!s.container) { res.failed.push(label + ': choose the ' + drv.label + ' ' + drv.container + ' to send to in Mapping first'); continue; }
                    var made = await drv.create(c, req, s.container, s.type, l._fields, s);
                    var after3 = await drv.seen(c, req, made.id), row = l._row;
                    _bg(function () { if (!row.sendLinks || typeof row.sendLinks !== 'object') row.sendLinks = {}; row.sendLinks[tid] = { remoteId: String(made.id), key: made.key || '', fp: l._fp, at: _now(), by: signer, modified: after3 && after3.modified }; });
                    // trace: a failure condition to its function's item; a requirement to the failure condition it traces to
                    var from = null;
                    if (l._send === 'fc') { var fn = arrOf(typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).filter(function (x) { return x && S(x.subId || x.funcId) === S(row.subId) && x.fnSource && x.fnSource.tool === tid; })[0]; if (fn) from = fn.fnSource.remoteId; }
                    if (l._send === 'req') { var fc = arrOf(typeof acFhaData !== 'undefined' ? acFhaData : []).filter(function (x) { return x && S(x.fcId) === S(row.traceId); })[0]; var fl = fc && fc.sendLinks && fc.sendLinks[tid]; if (fl) from = fl.remoteId; }
                    if (from != null && drv.link) { try { await drv.link(c, req, from, made.id); } catch (e) { res.failed.push(label + ': made in ' + drv.short + ', but the link to its ' + (l._send === 'fc' ? 'function' : 'failure condition') + ' failed (' + ((e && e.message) || e) + ')'); } }
                    await cmt(made.id);
                    // the link and the comment changed it again: what Safety Lab now knows the tool holds
                    try { var fin = await drv.seen(c, req, made.id); if (fin) _bg(function () { row.sendLinks[tid].modified = fin.modified; }); } catch (_) {}
                    if (made.warning) res.failed.push(label + ': ' + made.warning);
                    res.sent++; res.items.push(label + ' (new: ' + (made.key || made.id) + ')');
                } catch (e) { res.failed.push(label + ': ' + ((e && e.message) || e)); }
            }
            _bg(function () { _save(); });
            try { if (typeof W.jrnl === 'function') W.jrnl('bridge-send', drv.label + ': sent ' + res.sent + (res.held.length ? ', held back ' + res.held.length : '') + (res.failed.length ? ', failed ' + res.failed.length : '') + '. Signed ' + signer); } catch (_) {}
            if (res.failed.length && !res.sent) res.ok = false;
            return res;
        }

        // ---- the screens: connection settings, what is linked, what is sent
        function _render() { try { if (W.SLConnections) W.SLConnections.render(); } catch (_) {} try { var pg = document.getElementById('alm-progress-' + tid); if (pg) pg.textContent = state.progress; } catch (_) {} }
        function _modal(id, html) {
            var d = document, old = d.getElementById(id); if (old) old.remove();
            var ov = d.createElement('div'); ov.id = id; ov.className = 'cx-pop'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
            ov.innerHTML = '<div class="cx-pop-card">' + html + '</div>';
            d.body.appendChild(ov);
            try { var f = ov.querySelector('input,select,button'); if (f) f.focus(); } catch (_) {}
            return ov;
        }
        function _close(id) { var p = document.getElementById(id); if (p) p.remove(); }
        function _btn(label, js, primary) { return '<button type="button" class="ckpt-m-btn' + (primary ? ' ckpt-m-btn-primary' : '') + '" onclick="' + js + '">' + label + '</button>'; }
        var NS = 'SLAlm.ui(\'' + tid + '\')';
        async function setupUi() {
            var c = cfg(), p = doorProblem();
            await refreshHas();
            var auth = c.auth || drv.auths[0][0];
            var ex = (drv.extra || []).map(function (f) {
                return '<div class="cx-row cx-gap"><label class="cx-lab cx-grow">' + _esc(f.label) + '<input type="text" id="alm-x-' + f.key + '" value="' + _esc(c[f.key] || '') + '" placeholder="' + _esc(f.placeholder || f.empty || '') + '"></label>' + (f.list ? _btn('List', NS + '.listExtra(\'' + f.key + '\')') : '') + '</div><div id="alm-xl-' + f.key + '"></div>';
            }).join('');
            var html = '<h3>' + _esc(drv.label) + ': connection</h3><p class="cx-dim">' + _esc(drv.hint) + '</p>' +
                (p ? '<div class="cx-warn">' + _esc(p) + '</div>' : '') +
                '<div class="cx-pop-list"><label class="cx-lab">Address<input type="url" id="alm-url" value="' + _esc(c.baseUrl || '') + '" placeholder="https://"></label>' +
                '<div class="cx-row cx-gap"><label class="cx-lab cx-grow">Project<input type="text" id="alm-proj" value="' + _esc(c.project || '') + '"></label>' + _btn('List projects', NS + '.listProjects()') + '</div><div id="alm-projects"></div>' + ex +
                '<label class="cx-lab">Sign in with<select id="alm-auth" onchange="' + NS + '.authChanged()">' + drv.auths.map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === auth ? ' selected' : '') + '>' + _esc(a[1]) + '</option>'; }).join('') + '</select></label>' +
                '<label class="cx-lab" id="alm-user-w"' + (_needsUser(auth) ? '' : ' style="display:none"') + '>Username<input type="text" id="alm-user" autocomplete="username" value="' + _esc(c.user || '') + '"></label>' +
                '<label class="cx-lab"><span id="alm-tok-l">' + _secretWord(auth, true) + '</span><input type="password" id="alm-tok" autocomplete="off" placeholder="' + (hasLogin() ? 'saved; type a new one to replace it' : '') + '"></label>' +
                '<label class="cx-radio"><input type="checkbox" id="alm-watch"' + (watch() ? ' checked' : '') + '> Check ' + _esc(drv.label) + ' when this project opens (this computer)</label>' +
                '<div class="cx-dim">The login is kept ' + (_isDesktop() ? 'in this computer’s keychain' : 'in your Safety Lab server’s vault') + ' and is never part of the project. Everyone on the project shares the address, the project and what is linked.</div></div>' +
                '<div class="cx-err" role="alert" id="alm-err"></div>' +
                '<div class="cx-row cx-gap cx-pop-foot">' + _btn('Save and test', NS + '.saveSetup()', true) + (configured() ? _btn('Choose what is linked', NS + '.browse()') : '') + '<span class="cx-right">' + _btn('Close', 'SLAlm.close(\'alm-setup\')') + '</span></div>';
            _modal('alm-setup', html);
        }
        function _needsUser(a) { return a !== 'bearer'; }
        function _secretWord(a, cap) { var w = a === 'bearer' ? 'token' : (a === 'apppass' ? 'application password' : 'password'); return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w; }
        function _val(id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; }
        function _err(id, t) { var e = document.getElementById(id); if (e) e.textContent = t || ''; }
        var ui = {
            authChanged: function () { var a = _val('alm-auth'); var w = document.getElementById('alm-user-w'); if (w) w.style.display = _needsUser(a) ? '' : 'none'; var l = document.getElementById('alm-tok-l'); if (l) l.textContent = _secretWord(a, true); },
            listExtra: async function (key) {
                var f = (drv.extra || []).filter(function (x) { return x.key === key; })[0]; if (!f || !f.list || !drv[f.list]) return;
                if (!configured() || !hasLogin()) { _err('alm-err', 'Save the address and the login first (Save and test), then list them.'); return; }
                try {
                    var list = await drv[f.list](rcfg(), req), box = document.getElementById('alm-xl-' + key); if (!box) return;
                    box.innerHTML = list.length ? '<label class="cx-lab">Choose<select onchange="document.getElementById(\'alm-x-' + key + '\').value=this.value"><option value="">' + _esc(f.empty || 'Choose') + '</option>' + list.map(function (o) { return '<option value="' + _esc(o.id) + '">' + _esc(o.name) + '</option>'; }).join('') + '</select></label>' : '<div class="cx-dim">None that this login can see.</div>';
                } catch (e) { _err('alm-err', (e && e.message) || String(e)); }
            },
            listProjects: async function () {
                var url = _val('alm-url'); if (!/^https:\/\//i.test(url)) { _err('alm-err', 'Type the https address first.'); return; }
                var c = cfg(); if (_host(c.baseUrl) !== _host(url) || !hasLogin()) { _err('alm-err', 'Save the address and the login first (Save and test), then list the projects.'); return; }
                try {
                    var list = await drv.projects(rcfg(), req);
                    var box = document.getElementById('alm-projects'); if (!box) return;
                    box.innerHTML = list.length ? '<label class="cx-lab">Projects you can open<select onchange="document.getElementById(\'alm-proj\').value=this.value">' + '<option value="">Choose</option>' + list.map(function (p) { return '<option value="' + _esc(drv.projectByName ? p.name : p.id) + '">' + _esc(p.name + (p.name !== p.id && String(p.id).length < 40 ? ' (' + p.id + ')' : '')) + '</option>'; }).join('') + '</select></label>' : '<div class="cx-dim">This login can open no projects.</div>';
                } catch (e) { _err('alm-err', (e && e.message) || String(e)); }
            },
            saveSetup: async function () {
                var url = _val('alm-url').replace(/\/+$/, ''), proj = _val('alm-proj'), auth = _val('alm-auth') || drv.auths[0][0], user = _val('alm-user'), tok = (document.getElementById('alm-tok') || {}).value || '';
                if (!/^https:\/\/[^\/\s]+/i.test(url)) { _err('alm-err', 'The address must start with https://'); return; }
                if (!proj) { _err('alm-err', 'Type the project.'); return; }
                if (_needsUser(auth) && !user) { _err('alm-err', 'Type the username.'); return; }
                var c = cfg(), hostChanged = _host(c.baseUrl) !== _host(url), xv = {};
                (drv.extra || []).forEach(function (f) { xv[f.key] = _val('alm-x-' + f.key); });
                var loginChanged = hostChanged || auth !== (c.auth || drv.auths[0][0]) || (drv.extra || []).some(function (f) { return f.login && (xv[f.key] || '') !== (c[f.key] || ''); });
                if (xv.authHost && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(xv.authHost)) { _err('alm-err', 'The sign-in server is a host name only, like jas.example.com.'); return; }
                if (!tok && (loginChanged || !hasLogin())) { _err('alm-err', 'Type the ' + _secretWord(auth) + '.'); return; }
                _err('alm-err', 'Saving...');
                if (tok) { var r = await saveLogin(url, auth, user, tok, xv.authHost || ''); if (!r.ok) { _err('alm-err', r.err); return; } }
                var first = !configured();
                c.baseUrl = url; c.project = proj; c.auth = auth; c.user = _needsUser(auth) ? user : '';
                (drv.extra || []).forEach(function (f) { if (xv[f.key]) c[f.key] = xv[f.key]; else delete c[f.key]; });
                _rt = {};   // look-ups made for the old settings
                cfgSave(c, (first ? 'Connected ' : 'Changed the connection to ') + drv.label + ': ' + _host(url) + ', project ' + proj);
                try { localStorage.setItem(WATCH, (document.getElementById('alm-watch') || {}).checked ? '1' : '0'); } catch (_) {}
                _err('alm-err', 'Testing...');
                try { var nm = await drv.test(rcfg(), req); _err('alm-err', ''); _toast('Connected to ' + drv.label + ': ' + nm + '.', 'success'); _close('alm-setup'); _render(); if (!picks().length) browseUi().catch(function (e) { _report(e, 'browse'); }); }
                catch (e) { _err('alm-err', 'Saved, but the test failed: ' + ((e && e.message) || e)); _render(); }
            },
            browse: function () { _close('alm-setup'); browseUi().catch(function (e) { _report(e, 'browse'); }); },
            savePicks: function () {
                var rows = Array.prototype.slice.call(document.querySelectorAll('#alm-browse .alm-pick'));
                var pk = [];
                rows.forEach(function (tr) {
                    var on = tr.querySelector('.alm-on'); if (!on || !on.checked) return;
                    var one = { container: tr.getAttribute('data-id'), containerName: tr.getAttribute('data-name'), kind: (tr.querySelector('.alm-kind') || {}).value || 'req', scope: (tr.querySelector('.alm-scope') || {}).value || 'ac' };
                    var xs = tr.querySelector('.alm-px'); if (xs && xs.value && drv.pickExtra) one[drv.pickExtra.key] = xs.value;
                    pk.push(one);
                });
                var c = cfg(), before = JSON.stringify(arrOf(c.picks)); c.picks = pk;
                if (before !== JSON.stringify(pk)) cfgSave(c, 'Chose what is linked from ' + drv.label + ': ' + (pk.length ? pk.map(function (p) { return (p.containerName || p.container) + ' as ' + ({ fn: 'functions', req: 'requirements', asm: 'assumptions' })[p.kind] + ' (' + _scopeName(p.scope) + ')'; }).join('; ') : 'nothing'));
                _close('alm-browse'); _render();
                if (pk.length) check(false).catch(function (e) { _toast(drv.label + ': ' + ((e && e.message) || e), 'error', 6000); });
            },
            sendCfg: function (k, f, v) {
                var c = cfg(); c.send = (c.send && typeof c.send === 'object') ? c.send : {}; c.send[k] = Object.assign({}, c.send[k] || {});
                if (f === 'on') c.send[k].on = !!v;
                else if (f === 'container') { var o = String(v || '').split('\u0001'); c.send[k].container = o[0] || ''; c.send[k].containerName = o[1] || o[0] || ''; }
                else c.send[k][f] = String(v || '').trim();
                cfgSave(c, 'Changed what Safety Lab sends to ' + drv.label + ' (' + (k === 'fc' ? 'failure conditions' : 'safety requirements') + ')');
                _render();
            },
            loadContainers: async function () { try { _containers = await drv.listContainers(rcfg(), req); _render(); } catch (e) { _toast(drv.label + ': ' + ((e && e.message) || e), 'error', 6000); } }
        };
        var _containers = null;
        async function browseUi() {
            if (!configured()) { await setupUi(); return; }
            _modal('alm-browse', '<h3>' + _esc(drv.label) + ': choose what is linked</h3><p class="cx-dim">Reading the ' + drv.containers + ' in ' + _esc(cfg().project) + '...</p>');
            var list;
            try { list = await drv.listContainers(rcfg(), req); _containers = list; }
            catch (e) { _modal('alm-browse', '<h3>' + _esc(drv.label) + '</h3><div class="cx-err">' + _esc((e && e.message) || e) + '</div><div class="cx-row">' + _btn('Connection settings', 'SLAlm.close(\'alm-browse\');SLConnections.setup(\'' + tid + '\')') + '<span class="cx-right">' + _btn('Close', 'SLAlm.close(\'alm-browse\')') + '</span></div>'); return; }
            var pk = {}; picks().forEach(function (p) { pk[String(p.container)] = p; });
            var sys = _sysList();
            var scopeSel = function (cur) { return '<select class="alm-scope" aria-label="For">' + '<option value="ac"' + (cur === 'ac' ? ' selected' : '') + '>Aircraft</option>' + sys.map(function (s) { return '<option value="' + _esc(s.id) + '"' + (String(cur) === String(s.id) ? ' selected' : '') + '>' + _esc(s.name || s.id) + '</option>'; }).join('') + '</select>'; };
            var kindSel = function (cur) { return '<select class="alm-kind" aria-label="Holds">' + [['fn', 'Functions'], ['req', 'Requirements'], ['asm', 'Assumptions']].map(function (k) { return '<option value="' + k[0] + '"' + (cur === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>'; };
            var px = drv.pickExtra || null;
            var pxSel = function (p) { if (!px) return ''; var cur = (p && p[px.key]) || ''; return '<td><select class="alm-px" aria-label="' + _esc(px.label) + '"><option value="">Default for what it holds</option>' + px.options().map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + _esc(o[1]) + '</option>'; }).join('') + '</select></td>'; };
            var html = '<h3>' + _esc(drv.label) + ': choose what is linked</h3><p class="cx-dim">Tick each ' + drv.container + ' Safety Lab should follow, say what it holds and whether it is for the aircraft or a system. ' + _esc(drv.label) + ' owns what comes in: it is locked in Safety Lab, and its changes wait in Incoming changes for an engineer to sign. In a functions ' + drv.container + ', an item’s parent in ' + _esc(drv.short) + ' is its parent function here.</p>' +
                '<div class="cx-pop-list"><table class="cx-table"><thead><tr><th></th><th>' + _esc(drv.label) + ' ' + drv.container + '</th><th>Holds</th>' + (px ? '<th>' + _esc(px.label) + '</th>' : '') + '<th>For</th></tr></thead><tbody>' +
                (list.length ? list.map(function (x) { var p = pk[String(x.id)]; return '<tr class="alm-pick" data-id="' + _esc(x.id) + '" data-name="' + _esc(x.name) + '"><td><input type="checkbox" class="alm-on" aria-label="Link"' + (p ? ' checked' : '') + '></td><td><b>' + _esc(x.name) + '</b>' + (x.where ? ' <span class="cx-dim">' + _esc(x.where) + '</span>' : '') + '<div class="cx-dim">' + _esc(x.id) + '</div></td><td>' + kindSel(p ? p.kind : 'req') + '</td>' + pxSel(p) + '<td>' + scopeSel(p ? (p.scope || 'ac') : 'ac') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="cx-dim">This project has no ' + drv.containers + ' this login can see.</td></tr>') +
                '</tbody></table></div><div class="cx-row cx-gap cx-pop-foot">' + _btn('Save and check', NS + '.savePicks()', true) + '<span class="cx-right">' + _btn('Close', 'SLAlm.close(\'alm-browse\')') + '</span></div>';
            _modal('alm-browse', html);
        }
        function sendSettingsHtml() {
            var sc = sendCfg();
            var opts = function (k) {
                var cur = (sc[k] || {}).container || '';
                var list = _containers || [];
                if (!list.length) return '<input type="text" class="cx-num" style="width:220px" value="' + _esc(cur) + '" placeholder="' + drv.container + ' id" onchange="' + NS + '.sendCfg(\'' + k + '\', \'container\', this.value)"> ' + _btn('List ' + drv.containers, NS + '.loadContainers()');
                return '<select onchange="' + NS + '.sendCfg(\'' + k + '\', \'container\', this.value)"><option value="">Choose</option>' + list.map(function (x) { return '<option value="' + _esc(x.id + '\u0001' + x.name) + '"' + (String(x.id) === String(cur) ? ' selected' : '') + '>' + _esc(x.name) + '</option>'; }).join('') + '</select>';
            };
            var sf = drv.sendFields || [];
            var row = function (k, label) { var c = sc[k] || {};
                return '<tr><td><label class="cx-radio"><input type="checkbox"' + (c.on ? ' checked' : '') + ' onchange="' + NS + '.sendCfg(\'' + k + '\', \'on\', this.checked)"> ' + label + '</label></td><td>' + opts(k) + '</td>' +
                    sf.map(function (f) { return '<td><input type="text" class="cx-num" style="width:220px" value="' + _esc(c[f.key] || '') + '" placeholder="' + _esc(f.placeholder || '') + '" onchange="' + NS + '.sendCfg(\'' + k + '\', \'' + f.key + '\', this.value)"></td>'; }).join('') + '</tr>'; };
            return '<div class="cx-sub"><b>What Safety Lab sends to ' + _esc(drv.label) + '</b>' +
                (sendOn() ? '' : '<div class="cx-warn">Pilot: reading from ' + _esc(drv.label) + ' is on. Sending is switched on once it has been proven on a real ' + _esc(drv.label) + ' server; until then nothing is written to ' + _esc(drv.short) + '.' + (drv.canOwn === false ? ' Safety Lab never changes an element your engineers made in ' + _esc(drv.short) + '; it only ever sends its own.' : '') + '</div>') +
                '<div class="cx-dim">Failure conditions and safety requirements made in Safety Lab go to the ' + drv.container + ' you choose here, linked to the function (or failure condition) they belong to. Safety Lab owns them: they are edited in Safety Lab and sent again from Ready to send. Only the title and the description are written; the engineer\u2019s severity classification is in the description. Calculated results (probabilities, allocated budgets, DALs), signatures and history are never sent.</div>' +
                '<table class="cx-table"><thead><tr><th>Send</th><th>' + _esc(drv.label) + ' ' + drv.container + '</th>' + sf.map(function (f) { return '<th>' + _esc(f.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + row('fc', 'Failure conditions (aircraft FHA)') + row('req', 'Safety requirements (aircraft)') + '</tbody></table></div>';
        }

        var api = {
            id: tid, driver: drv, cfg: cfg, cfgSave: cfgSave, configured: configured, check: check, changes: changes, applyKeys: applyKeys, linkedRows: linkedRows,
            outgoing: outgoing, send: send, setup: setupUi, browse: browseUi, sendSettingsHtml: sendSettingsHtml, ui: ui, req: req, saveLogin: saveLogin, hasLogin: hasLogin, refreshHas: refreshHas,
            state: function () { return state; }, _stage: restage
        };
        if (W.SLConnections && typeof W.SLConnections.register === 'function') {
            W.SLConnections.register(tid, {
                label: drv.label, configured: configured,
                where: function () { var c = cfg(); return _host(c.baseUrl) + (c.project ? ' · project ' + c.project : ''); },
                checkedAt: function () { return state.checkedAt; },
                held: function () { return false; },
                warnings: function () { return state.warnings.slice(); },
                changes: changes, check: function (silent) { return check(!!silent); },
                autoCheck: function () { return watch() && hasLogin(); },
                applyKeys: applyKeys, setup: function () { setupUi().catch(function (e) { _report(e, 'setup'); }); }, browse: function () { browseUi().catch(function (e) { _report(e, 'browse'); }); },
                linkedRows: linkedRows, outgoing: outgoing, send: send, sendSettingsHtml: sendSettingsHtml,
                canOwn: drv.canOwn !== false, pilot: function () { return !sendOn(); }
            });
        }
        refreshHas().catch(function (e) { _report(e, 'login status'); });
        return api;
    }

    var tools = {};
    Object.keys(DRIVERS).forEach(function (k) { tools[k] = makeTool(DRIVERS[k]); });
    W.SLAlm = {
        RULES: ALM_RULES, almRequestProblem: almRequestProblem, plain: plain, wikiPlain: wikiPlain, parseXml: parseXml, rdfParse: rdfParse,
        buildTree: buildTree, diffTree: diffTree, applyTree: applyTree, diffFlat: diffFlat, applyFlat: applyFlat,
        drivers: DRIVERS, tools: tools, tool: function (id) { return tools[id] || null; },
        ui: function (id) { return (tools[id] && tools[id].ui) || {}; },
        close: function (id) { var p = document.getElementById(id); if (p) p.remove(); }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = W.SLAlm;
})();
