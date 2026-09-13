// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
/* ============================================================================
 * node_identity_ui.js — v1.0 — the "what is this node?" editor.
 * ----------------------------------------------------------------------------
 * Waqas, 19 Aug 2026: "user clicks add gate/add event, we give them a pop modal in
 * that modal a drop down 1 select system, 2 select system function, 3 failure
 * condition" ... and "the same modal that pops up on node creation should be embedded
 * in the side gate/event property panel for future modifications".
 *
 * ONE renderer, TWO mounts. `slNodeIdentityHtml()` builds the block; the drawer embeds
 * it and the creation dialog hosts the identical markup. Two implementations of the
 * same form would drift within a week, and the drawer copy is ALSO the migration tool
 * for every free-text node already in the model — without it the feature only works on
 * projects nobody has started yet.
 *
 * RULES THIS ENCODES (each one a decision made in discussion, not a preference):
 *   · SYSTEMS ARE PICKED, NEVER TYPED, and on an aircraft failure-condition tree the
 *     list is limited to that FC's interdependence contributors. "Instead of giving a
 *     20 system list we will be providing a shorter more targeted list." With twenty
 *     the failure mode is picking the adjacent wrong one, and a wrong system is a
 *     wrong requirement bucket, silently. With three the wrong ones are not on screen.
 *   · THE ESCAPE HATCH LIVES IN THE DROPDOWN, as a permanent last entry. A short list
 *     with a hidden escape is a funnel: people force the nearest wrong pick rather
 *     than go looking.
 *   · CREATING COSTS THE SAME AS PICKING. Every "+ new …" is one click in the same
 *     control. If creating is the slow path, engineers pick the nearest-fitting wrong
 *     entry and the tool manufactures agreement between trees that do not agree.
 *   · NOTHING BLOCKS. An incomplete coordinate is shown as a finding and blocks
 *     CLOSURE, never the modelling. You cannot think and fill in dropdowns at once.
 *   · THE NAME IS DERIVED. Display text comes from what the node points at, read-only,
 *     with a deliberate override that is marked as one — otherwise labels drift from
 *     the conditions they name and we are back to two descriptions of one thing.
 *
 * Validation, ownership and derived text all come from SLNodeIdentity; this file is
 * presentation and wiring only, so the rules have exactly one home.
 * ==========================================================================*/
(function () {
  'use strict';

  var NEW = '__new__', MORE = '__more__';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  // 19 Aug — THIS LINE WAS THE BUG. The app's state lives in top-level `let`
  // declarations, which are in the GLOBAL LEXICAL ENVIRONMENT and are NOT properties of
  // `window`. `window.selectedNodeData` was undefined on every call, so render() wrote
  // an empty string and the whole editor was invisible with no error anywhere. Reads go
  // through SLEnv, a classic script that closes over the bare identifiers.
  function g(name) {
    try { if (window.SLEnv) return window.SLEnv.get(name); } catch (_) {}
    try { return window[name]; } catch (_) { return undefined; }
  }
  function activePage() {
    var pages = g('ftaPages') || [];
    var id = g('activeFTAPageId');
    return pages.find(function (p) { return p.id === id; }) || null;
  }

  // ------------------------------------------------------------------ lookups
  function allSystems() { return (g('systemsData') || []).map(function (s) { return { id: s.id, name: s.name || s.id }; }); }

  // The targeted list. On a system tree the system is fixed. On an aircraft tree it is
  // the union of interdependence contributors across the page's linked failure
  // conditions, plus anything already used elsewhere in this tree (ordered first,
  // because it is the likeliest next pick).
  function systemsForPage(page, rootNode) {
    var all = allSystems();
    if (!page) return { list: all, locked: null, source: 'all' };
    if (page.systemId) {
      var one = all.filter(function (s) { return s.id === page.systemId; });
      return { list: one.length ? one : all, locked: page.systemId, source: 'system-tree' };
    }
    var ids = [];
    var linked = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length)
      ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
    var acFha = g('acFhaData') || [], idpContributors = g('idpContributors');
    if (typeof idpContributors === 'function') {
      linked.forEach(function (lid) {
        var fc = acFha.find(function (f) { return String(f.internalId) === String(lid); });
        if (!fc) return;
        (idpContributors(fc) || []).forEach(function (sid) { if (ids.indexOf(sid) === -1) ids.push(sid); });
      });
    }
    if (!ids.length) return { list: all, locked: null, source: linked.length ? 'no-contributors' : 'no-linked-fc' };
    var used = {};
    (function walk(n) { if (!n) return; var i = n.identity; if (i && i.systemId) used[i.systemId] = 1;
      (n.children || n._children || []).forEach(walk); })(rootNode);
    var list = ids.map(function (id) { return all.find(function (s) { return s.id === id; }) || { id: id, name: id }; });
    list.sort(function (a, b) { return (used[b.id] ? 1 : 0) - (used[a.id] ? 1 : 0); });
    return { list: list, locked: null, source: 'interdependence' };
  }

  function functionsOf(systemId) {
    var s = (g('systemsData') || []).find(function (x) { return x.id === systemId; });
    return ((s && s.functions) || []).map(function (f) {
      return { id: f.funcId || String(f.internalId), name: f.funcName || f.funcId || ('function ' + f.internalId) };
    });
  }
  function fcsOf(systemId) {
    var s = (g('systemsData') || []).find(function (x) { return x.id === systemId; });
    return ((s && s.fha) || []).map(function (r) {
      return { id: r.fcId || String(r.internalId), name: (r.fcId ? r.fcId + ' — ' : '') + (r.fcDesc || ''), severity: r.severity || '' };
    });
  }
  function itemsOf(systemId) {
    return (g('itemsData') || []).filter(function (i) { return !systemId || !i.systemId || i.systemId === systemId; })
      .map(function (i) { return { id: i.itemId || i.id || String(i.internalId), name: i.name || i.itemId || i.id }; });
  }
  function resources() {
    return (g('resourcesData') || []).map(function (r) {
      return { id: r.resId || String(r.internalId), name: r.name || r.resId,
               providedBy: (r.providedBy || []).slice() };
    });
  }
  function labelFor(kind, id) {
    if (!id) return null;
    var sys = g('systemsData') || [];
    if (kind === 'function') {
      for (var i = 0; i < sys.length; i++) {
        var f = (sys[i].functions || []).find(function (x) { return (x.funcId || String(x.internalId)) === id; });
        if (f) return f.funcName || f.funcId;
      }
      var ac = (g('acFunctionsData') || []).find(function (x) { return (x.subId || x.funcId) === id; });
      return ac ? (ac.subName || ac.funcName) : null;
    }
    if (kind === 'failureCondition') {
      for (var j = 0; j < sys.length; j++) {
        var r = (sys[j].fha || []).find(function (x) { return (x.fcId || String(x.internalId)) === id; });
        if (r) return r.fcDesc || r.fcId;
      }
      var a = (g('acFhaData') || []).find(function (x) { return (x.fcId || String(x.internalId)) === id; });
      return a ? (a.fcDesc || a.fcId) : null;
    }
    if (kind === 'item') { var it = itemsOf(null).find(function (x) { return x.id === id; }); return it ? it.name : null; }
    if (kind === 'resource') { var rr = resources().find(function (x) { return x.id === id; }); return rr ? rr.name : null; }
    if (kind === 'effect') return id;   // free text until FMES effect groups are modelled
    return null;
  }

  function ctxFor(node) {
    var page = activePage();
    var parents = new Map();
    if (page && page.root) (function walk(n) {
      (n.children || n._children || []).forEach(function (c) { parents.set(c, n); walk(c); });
    })(page.root);
    return {
      parentOf: function (n) { return parents.get(n) || null; },
      pageOf: function () { return page || {}; },
      transferTarget: function (n) {
        if (!n || !n.linkedPageId) return null;
        return (g('ftaPages') || []).find(function (p) { return p.id === n.linkedPageId; }) || null;
      },
      label: labelFor
    };
  }

  // ------------------------------------------------------------------ markup
  function sel(id, value, options, onchange, extra) {
    return '<select id="' + id + '" class="state-select" style="width:100%;margin-bottom:0;' + (extra || '') +
      '" onchange="' + onchange + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(value == null ? '' : value) ? ' selected' : '') +
          (o.disabled ? ' disabled' : '') + '>' + esc(o.name) + '</option>';
      }).join('') + '</select>';
  }
  function field(label, inner, hint) {
    return '<div style="margin-bottom:10px;"><label style="display:block;margin-bottom:4px;">' + esc(label) + '</label>' +
      inner + (hint ? '<div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px;">' + hint + '</div>' : '') + '</div>';
  }

  function html(node) {
    var NI = window.SLNodeIdentity;
    if (!NI) return '<p style="color:var(--color-danger);">node_identity.js is not loaded.</p>';
    if (!node) return '';
    var id = node.identity || {};
    var page = activePage();
    var sysInfo = systemsForPage(page, page && page.root);
    var ctx = ctxFor(node);
    var out = '';

    // --- kind. A GATE can only be a declared function failure, or pure decomposition
    // logic that inherits from above — it is never an item, a resource or a human error;
    // those are things that FAIL, and a gate is how failures combine. Offering the full
    // list on a gate invites a wrong declaration that then owns a requirement bucket.
    var isGate = (node.type === 'gate');
    var allowed = isGate ? ['functional'] : Object.keys(NI.KINDS);
    var kindOpts = [{ id: '', name: isGate ? '— logic only, inherits from above —' : '— not declared —' }]
      .concat(allowed.map(function (k) { return { id: k, name: NI.KINDS[k].label }; }));
    out += field('What is this node?', sel('ni-kind', id.kind || '', kindOpts, "slNodeIdentitySet('kind', this.value)"));

    if (!id.kind) {
      out += isGate
        ? '<p style="font-size:11.5px;color:var(--color-text-tertiary);">Pure decomposition logic — it inherits its ' +
          'owner from above and needs no declaration. Declare a function failure only when this gate <b>crosses to ' +
          'another system</b>, which is also when it becomes a transfer-gate candidate.</p>'
        : '<p style="font-size:11.5px;color:var(--color-text-tertiary);">Free text until this is declared. ' +
          'The node still works — it just cannot be owned, shared or traced, and it will hold up closure.</p>';
      return wrap(out, node, ctx);
    }

    // --- system (picked, never typed; short and targeted)
    if (['functional', 'item'].indexOf(id.kind) !== -1) {
      var opts = sysInfo.list.map(function (s) { return { id: s.id, name: s.name }; });
      opts.unshift({ id: '', name: allSystems().length ? '— select system —' : '— no systems defined —' });
      if (allSystems().length) opts.push({ id: MORE, name: '+ another system…' });
      // An EMPTY register and a NARROWED list are different problems and must not read
      // the same. "The list cannot be narrowed" is true and useless when the answer is
      // that the project has no systems at all — say that, and say where to fix it.
      var hint;
      if (!allSystems().length) {
        hint = '⚠ <b>No systems defined in this project.</b> Add them in the Systems workspace — ' +
               'a node cannot be owned, and its requirements cannot be filed, until its system exists.';
      } else if (sysInfo.source === 'interdependence') {
        hint = 'Contributors to this tree’s failure condition, per the interdependence table.';
      } else if (sysInfo.source === 'system-tree') {
        hint = 'Fixed by the tree — this is a system tree.';
      } else if (sysInfo.source === 'no-linked-fc') {
        hint = 'Showing all ' + allSystems().length + ' systems — this page has no linked failure ' +
               'condition, so the list cannot be narrowed to that condition’s contributors.';
      } else {
        hint = 'Showing all ' + allSystems().length + ' systems — no interdependence contributors ' +
               'are recorded for this failure condition yet.';
      }
      out += field('System', sel('ni-system', sysInfo.locked || id.systemId || '', opts,
        "slNodeIdentitySet('systemId', this.value)", sysInfo.locked ? 'opacity:.75;' : ''), hint);
    }

    if (id.kind === 'functional') {
      var fnList = id.systemId ? functionsOf(id.systemId) : [];
      var fnOpts = [{ id: '', name: !id.systemId ? '— select a system first —' : (fnList.length ? '— select function —' : '— none defined for this system —') }]
        .concat(fnList.map(function (f) { return { id: f.id, name: f.name }; }));
      if (id.systemId) fnOpts.push({ id: NEW, name: '+ new function…' });
      out += field('System function', sel('ni-function', id.functionId || '', fnOpts, "slNodeIdentitySet('functionId', this.value)"),
        !id.systemId ? 'Pick the system above and its functions appear here.'
          : (fnList.length ? '' : 'This system has no functions recorded yet — create one here, it costs the same as picking.'));

      var fcList = id.systemId ? fcsOf(id.systemId) : [];
      var fcOpts = [{ id: '', name: !id.systemId ? '— select a system first —' : '— none (intermediate logic) —' }]
        .concat(fcList.map(function (f) { return { id: f.id, name: f.name + (f.severity ? '  [' + f.severity + ']' : '') }; }));
      if (id.systemId) fcOpts.push({ id: NEW, name: '+ new failure condition…' });
      var crosses = NI.crossesBoundary(node, ctx);
      out += field('Failure condition', sel('ni-fc', id.fcId || '', fcOpts, "slNodeIdentitySet('fcId', this.value)"),
        crosses
          ? '<b>Crosses an ownership boundary</b> — this needs a declared failure condition, and it is a candidate for a transfer gate into that system’s own tree.'
          : 'Inside one system’s decomposition this is just logic and inherits from above. Declare a condition only when it crosses to another owner.');
    }

    if (id.kind === 'item') {
      var itList = itemsOf(id.systemId);
      var itOpts = [{ id: '', name: itList.length ? '— select item —' : '— no items recorded —' }]
        .concat(itList.map(function (i) { return { id: i.id, name: i.name }; }))
        .concat([{ id: NEW, name: '+ new item…' }]);
      out += field('Item', sel('ni-item', id.itemId || '', itOpts, "slNodeIdentitySet('itemId', this.value)"),
        itList.length ? '' : 'No items recorded' + (id.systemId ? ' for this system' : '') + ' yet — create one here.');
      var onMirror = !!(page && page.verifies);
      out += field(onMirror ? 'Effect (inherited from the allocation twin)' : 'Effect — what it fails to do',
        '<input type="text" id="ni-effect" value="' + esc(id.effectId || '') + '" placeholder="e.g. no output, erroneous output" ' +
        'style="width:100%;margin-bottom:0;" onchange="slNodeIdentitySet(\'effectId\', this.value)">',
        onMirror
          ? 'On the mirror this is fixed by the allocation node; add the failure MODES here.'
          : 'Allocation stops at the item and its effect. Failure modes and their rates live on the verification mirror.');
    }

    if (id.kind === 'resource') {
      var rs = resources();
      var rOpts = [{ id: '', name: '— select common resource —' }]
        .concat(rs.map(function (r) { return { id: r.id, name: r.name }; }));
      out += field('Common resource', sel('ni-resource', id.resourceId || '', rOpts, "slNodeIdentitySet('resourceId', this.value)"),
        rs.length ? 'Picked from the resource register, so two trees consuming it are the same event by construction.'
                  : '⚠ No resources declared yet — add them in the Resources view.');
      var chosen = rs.find(function (r) { return r.id === id.resourceId; });
      var provs = (chosen && chosen.providedBy) || [];
      var pOpts = [{ id: '', name: '— select provider —' }].concat(
        (provs.length ? provs : allSystems().map(function (s) { return s.id; })).map(function (sid) {
          var s = allSystems().find(function (x) { return x.id === sid; });
          return { id: sid, name: (s ? s.name : sid) + (provs.indexOf(sid) !== -1 ? '  (declared provider)' : '') };
        }));
      out += field('Provided by', sel('ni-provider', id.providerSystemId || '', pOpts, "slNodeIdentitySet('providerSystemId', this.value)"),
        'The provider owns ONE probabilistic requirement on this resource, at the strictest value across every consumer. ' +
        'Each consuming system owns an interface requirement against it — not a copy of the same number.');
    }

    return wrap(out, node, ctx);
  }

  // Derived-name preview, ownership readout and findings — shared by every kind.
  function wrap(inner, node, ctx) {
    var NI = window.SLNodeIdentity;
    var id = node.identity || {};
    var d = NI.displayText(node, ctx);
    var own = NI.resolveOwner(node, ctx);
    var sysName = function (sid) { var s = allSystems().find(function (x) { return x.id === sid; }); return s ? s.name : sid; };

    var out = inner;
    if (id.kind) {
      // NO name field, and NO override. Waqas, 19 Aug: "you do not need name on the
      // canvas, the name would be the failure condition itself." The node does not HAVE
      // a name of its own — it points at a failure condition, an item + effect, or a
      // resource, and that IS the name. A read-only echo of it is clutter, and an
      // override would reintroduce exactly the drift the whole feature exists to stop:
      // two descriptions of one condition. slNodeIdentitySet() keeps node.name in step
      // with the coordinate; nothing here lets anyone decouple them.

      var ownTxt = own.unowned
        ? '<span style="color:var(--color-warning);">unowned</span>'
        : esc(sysName(own.systemId)) + ' <span style="color:var(--color-text-tertiary);">(' + esc(own.via) + ')</span>';
      if (own.role === 'provider') {
        ownTxt = 'requirement owner: ' + (own.systemId ? esc(sysName(own.systemId)) : '<span style="color:var(--color-warning);">none</span>') +
          ' · consumed by: ' + (own.consumerSystemId ? esc(sysName(own.consumerSystemId)) : '<span style="color:var(--color-warning);">unresolved</span>');
      }
      out += '<div style="font-size:11.5px;margin-top:2px;">Owner — ' + ownTxt + '</div>';
    }

    var findings = NI.nodeFindings(node, ctx);
    if (findings.length) {
      out += '<div style="margin-top:10px;border-left:3px solid var(--color-warning);padding:6px 10px;font-size:11.5px;line-height:1.5;">' +
        findings.map(function (f) {
          return '<div><b>' + (f.severity === 'blocks-closure' ? '⚠ holds up closure' : 'note') + '</b> — ' + esc(f.msg) + '</div>';
        }).join('') + '</div>';
    }
    return out;
  }

  // ------------------------------------------------------------------ mounts
  function render() {
    var host = document.getElementById('config-identity-host');
    var node = g('selectedNodeData');
    if (host) host.innerHTML = node ? html(node) : '';
    var mhost = document.getElementById('ni-modal-body');
    if (mhost && node) mhost.innerHTML = html(node);
  }

  // Every "+ new …" is one click in the same control — creating must not be the slow path.
  async function createInline(kind) {
    var node = g('selectedNodeData'); if (!node) return null;
    var id = node.identity || (node.identity = {});
    var ask = window.slPrompt;
    if (kind === 'functionId') {
      var name = (await ask('New system function, name:', '')) || '';
      if (!name.trim()) return null;
      var sys = (g('systemsData') || []).find(function (s) { return s.id === id.systemId; });
      if (!sys) return null;
      if (!Array.isArray(sys.functions)) sys.functions = [];
      var fid = 'F-' + (sys.functions.length + 1) + '-' + String(sys.id).slice(0, 4).toUpperCase();
      sys.functions.push({ internalId: Date.now(), funcId: fid, funcName: name.trim(), funcDef: '' });
      return fid;
    }
    if (kind === 'fcId') {
      var d1 = (await ask('New failure condition, description:', '')) || '';
      if (!d1.trim()) return null;
      var sys2 = (g('systemsData') || []).find(function (s) { return s.id === id.systemId; });
      if (!sys2) return null;
      if (!Array.isArray(sys2.fha)) sys2.fha = [];
      var fcid = 'FC-' + String(sys2.id).slice(0, 4).toUpperCase() + '-' + (sys2.fha.length + 1);
      sys2.fha.push({ internalId: Date.now(), fcId: fcid, fcDesc: d1.trim(), severity: '', subId: id.functionId || '' });
      return fcid;
    }
    if (kind === 'itemId') {
      var n2 = (await ask('New item, name:', '')) || '';
      if (!n2.trim()) return null;
      var items = g('itemsData'); if (!Array.isArray(items)) return null;
      var iid = 'IT-' + (items.length + 1);
      items.push({ internalId: Date.now(), itemId: iid, name: n2.trim(), systemId: id.systemId || '' });
      return iid;
    }
    return null;
  }

  window.slNodeIdentitySet = async function (fieldName, value) {
    var node = g('selectedNodeData'); if (!node) return;
    if (!node.identity) node.identity = {};
    if (value === NEW) { var made = await createInline(fieldName); if (!made) { render(); return; } value = made; }
    if (value === MORE) {
      if (typeof window.showToast === 'function')
        window.showToast('This system is not a recorded contributor to this failure condition. Add it in the interdependence table first — that keeps the short list honest.', 'warning', 5200);
      render(); return;
    }
    if (fieldName === 'kind' && !value) delete node.identity.kind;
    else node.identity[fieldName] = value;
    if (fieldName === 'systemId') { delete node.identity.functionId; delete node.identity.fcId; delete node.identity.itemId; }
    if (fieldName === 'resourceId') {
      var r = resources().find(function (x) { return x.id === value; });
      if (r && r.providedBy && r.providedBy.length === 1) node.identity.providerSystemId = r.providedBy[0];
    }
    node.identity.declaredAt = new Date().toISOString();
    try { var who = (typeof window._signoffReviewerName === 'function') ? window._signoffReviewerName() : null; if (who) node.identity.declaredBy = who; } catch (_) {}
    var d = window.SLNodeIdentity.displayText(node, ctxFor(node));
    if (d.derived) {
      node.name = d.text;
      var nameEl = document.getElementById('config-name'); if (nameEl) nameEl.value = d.text;
    }
    render();
    try { if (typeof window.updateD3 === 'function') window.updateD3(); } catch (_) {}
    try { if (typeof window.commitSaveChanges === 'function') window.commitSaveChanges(); } catch (_) {}
  };


  window.slRenderNodeIdentity = render;
  window.slNodeIdentityHtmlFor = html;
  window.slNodeIdentitySystemsForPage = systemsForPage;

  // The creation dialog — identical markup, different mount.
  window.slOpenNodeIdentityModal = function () {
    var node = g('selectedNodeData'); if (!node) return;
    var host = document.getElementById('ni-modal');
    if (!host) return;
    document.getElementById('ni-modal-body').innerHTML = html(node);
    host.classList.add('show');
  };
  window.slCloseNodeIdentityModal = function () {
    var host = document.getElementById('ni-modal');
    if (host) host.classList.remove('show');
    render();
  };
}());
