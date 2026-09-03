/* ============================================================================
 * node_identity.js — v1.0 — what a fault-tree node IS, declared rather than typed.
 * ----------------------------------------------------------------------------
 * Waqas, 19 Aug 2026: "can we potentially do fault tree node event modeling in a
 * standardized way, user clicks add gate/add event, we give them a pop modal in that
 * modal a drop down number 1 select system, 2 select system function, 3 failure
 * condition?"
 *
 * WHY THIS EXISTS. Today a node carries free text. That has three costs:
 *   · nobody can tell whether two nodes are the same thing, so shared identity comes
 *     from a naming coincidence;
 *   · nobody can tell which system OWNS a node, so auto-generated requirements file
 *     into whatever scope the generator happened to run in (the defect that started
 *     this whole thread);
 *   · engineers re-invent descriptions of failure conditions someone already thought
 *     about carefully.
 * A declared coordinate fixes all three at the point of creation instead of trying to
 * reconstruct them afterwards.
 *
 * THE COORDINATE.  node.identity = {
 *     kind,               // see KINDS below
 *     systemId,           // the system this node belongs to
 *     functionId,         // the system FUNCTION (functional nodes)
 *     fcId,               // the declared failure condition, when it crosses a boundary
 *     itemId, effectId,   // item + FMES effect group (allocation side)
 *     modeIds,            // item failure modes (verification side ONLY)
 *     resourceId, providerSystemId,   // interface / common resource
 *     declaredBy, declaredAt
 *   }
 *
 * THE BOUNDARY RULE (replaces "is this function abstract enough"). A functional node
 * IS a declared failure condition exactly when it CROSSES AN OWNERSHIP BOUNDARY — its
 * owning system differs from its parent's. Inside one system's own decomposition,
 * gates are just logic and inherit everything. Checkable from data, not a judgement.
 *
 * OWNERSHIP, and why a resource node has TWO answers. For most kinds the owner is one
 * system. For an interface/resource node it is two different things at once:
 *   · the PROVIDER owns the probabilistic requirement on the resource itself, once,
 *     at the strictest value across every consumer;
 *   · the CONSUMER — the branch the node sits in — owns an interface/assumption
 *     requirement against it.
 * So resolveOwner() returns { systemId, role, via } and never collapses the two.
 *
 * UNSTRUCTURED IS ALLOWED. A node with no identity is legal and must never block
 * modelling — you cannot think and fill in dropdowns at the same time. It is flagged,
 * and it blocks CLOSURE rather than blocking work. Same rule as unowned pages.
 *
 * Pure: no DOM, no storage, no app globals. The caller supplies a context object with
 * the lookups. window.SLNodeIdentity (browser) and module.exports (node tests).
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SLNodeIdentity = api;
}(this, function () {
  'use strict';

  // Quantified kinds carry a probability; the rest are structural or qualitative.
  var KINDS = {
    functional:  { label: 'Functional failure',        quantified: true,  needs: ['systemId', 'functionId'] },
    item:        { label: 'Item failure',              quantified: true,  needs: ['systemId', 'itemId'] },
    resource:    { label: 'Interface / common resource', quantified: true, needs: ['resourceId', 'providerSystemId'] },
    human:       { label: 'Human error',               quantified: true,  needs: [] },
    external:    { label: 'External / environmental',  quantified: true,  needs: [] },
    devError:    { label: 'Development error',         quantified: false, needs: [] },
    undeveloped: { label: 'Undeveloped placeholder',   quantified: false, needs: [] }
  };

  function kindOf(node) {
    var id = node && node.identity;
    return (id && KINDS[id.kind]) ? id.kind : null;
  }
  function isStructured(node) { return kindOf(node) !== null; }

  // What is missing before this coordinate is complete? Returns [] when complete.
  function missingFields(node) {
    var k = kindOf(node);
    if (!k) return ['kind'];
    var id = node.identity, out = [];
    KINDS[k].needs.forEach(function (f) {
      var v = id[f];
      if (v === undefined || v === null || String(v).trim() === '') out.push(f);
    });
    return out;
  }
  function isComplete(node) { return isStructured(node) && missingFields(node).length === 0; }

  // ---------------------------------------------------------------- ownership
  // ctx = {
  //   parentOf(node)   -> node | null
  //   pageOf(node)     -> { id, systemId, treeLevel, verifies }
  //   transferTarget(node) -> page | null      (a transfer gate's destination)
  // }
  // Order, most specific first:
  //   1. the node's own declared system
  //   2. a transfer gate's destination page
  //   3. the nearest ancestor that declares one
  //   4. the page's own systemId
  //   5. nothing -> unowned, which is a FINDING and not a bucket
  function resolveOwner(node, ctx) {
    ctx = ctx || {};
    var id = node && node.identity;

    if (id && id.kind === 'resource') {
      // Two answers, deliberately not collapsed.
      var consumer = _inheritedSystem(node, ctx);
      return {
        systemId: id.providerSystemId || null,
        role: 'provider',
        via: 'declared-resource',
        consumerSystemId: consumer ? consumer.systemId : null,
        consumerVia: consumer ? consumer.via : null,
        unowned: !id.providerSystemId
      };
    }
    if (id && id.systemId) return { systemId: id.systemId, role: 'owner', via: 'declared', unowned: false };

    var inh = _inheritedSystem(node, ctx);
    if (inh) return { systemId: inh.systemId, role: 'owner', via: inh.via, unowned: false };
    return { systemId: null, role: 'owner', via: null, unowned: true };
  }

  function _inheritedSystem(node, ctx) {
    if (typeof ctx.transferTarget === 'function') {
      var t = ctx.transferTarget(node);
      if (t && t.systemId) return { systemId: t.systemId, via: 'transfer-target' };
    }
    var guard = 0, cur = node;
    while (typeof ctx.parentOf === 'function' && guard++ < 500) {
      cur = ctx.parentOf(cur);
      if (!cur) break;
      var cid = cur.identity;
      if (cid && cid.kind === 'resource') continue;          // a resource does not own its siblings
      if (cid && cid.systemId) return { systemId: cid.systemId, via: 'ancestor' };
      if (typeof ctx.transferTarget === 'function') {
        var tt = ctx.transferTarget(cur);
        if (tt && tt.systemId) return { systemId: tt.systemId, via: 'ancestor-transfer' };
      }
    }
    var pg = (typeof ctx.pageOf === 'function') ? ctx.pageOf(node) : null;
    if (pg && pg.systemId) return { systemId: pg.systemId, via: 'page' };
    return null;
  }

  // ---------------------------------------------------------------- the boundary rule
  // A functional node is a DECLARED failure condition exactly when its owner differs
  // from its parent's owner. Within one system's decomposition it is just logic.
  function crossesBoundary(node, ctx) {
    if (kindOf(node) !== 'functional') return false;
    var mine = resolveOwner(node, ctx);
    var parent = (typeof ctx.parentOf === 'function') ? ctx.parentOf(node) : null;
    if (!parent) return true;                       // the root of a branch always declares
    var theirs = resolveOwner(parent, ctx);
    // A node with no owner of its own cannot be said to cross into anything.
    if (!mine.systemId) return false;
    // An owner appearing where the parent had NONE is the commonest crossing there is:
    // an aircraft-level gate handing off to a system. Caught by the wall, 19 Aug — the
    // first cut returned false here and silently declared no boundaries at all on a
    // PASA tree, which is precisely the tree this rule exists for.
    if (!theirs.systemId) return true;
    return String(mine.systemId) !== String(theirs.systemId);
  }

  // ---------------------------------------------------------------- derived text
  // The displayed name comes from the thing the node points at, so a label can never
  // drift from the condition it names. An explicit override is honoured and marked.
  // ctx.label(kind, id) -> string
  function displayText(node, ctx) {
    ctx = ctx || {};
    var id = node && node.identity;
    if (!id) return { text: (node && node.name) || '', derived: false, overridden: false };
    if (id.textOverride && String(id.textOverride).trim()) {
      return { text: String(id.textOverride).trim(), derived: false, overridden: true };
    }
    var L = (typeof ctx.label === 'function') ? ctx.label : function () { return null; };
    var t = null;
    if (id.kind === 'functional') t = L('failureCondition', id.fcId) || L('function', id.functionId);
    else if (id.kind === 'item')   t = _join(L('item', id.itemId), L('effect', id.effectId));
    else if (id.kind === 'resource') t = _join(L('resource', id.resourceId), L('function', id.functionId), ' for ');
    else if (id.kind === 'devError') t = L('function', id.functionId);
    if (!t) return { text: (node && node.name) || '', derived: false, overridden: false, unresolved: true };
    return { text: t, derived: true, overridden: false };
  }
  function _join(a, b, sep) {
    if (a && b) return a + (sep || ' — ') + b;
    return a || b || null;
  }

  // ---------------------------------------------------------------- findings
  // Everything here is a FINDING, never a block. Modelling is never interrupted;
  // closure is what these gate.
  function nodeFindings(node, ctx) {
    var out = [];
    if (!isStructured(node)) {
      out.push({ kind: 'unstructured', severity: 'blocks-closure',
        msg: 'This node has no declared identity — it is free text. It cannot be owned, shared or ' +
             'traced until someone says what it is.' });
      return out;
    }
    var miss = missingFields(node);
    if (miss.length) out.push({ kind: 'incomplete', severity: 'blocks-closure',
      msg: 'Declared as ' + KINDS[kindOf(node)].label + ' but missing: ' + miss.join(', ') + '.' });

    var own = resolveOwner(node, ctx);
    if (own.unowned) out.push({ kind: 'unowned', severity: 'blocks-closure',
      msg: 'No owning system can be resolved — not declared here, not on any ancestor, no transfer ' +
           'target, and the page has none. Requirements generated from this node have nowhere to file.' });

    if (kindOf(node) === 'resource' && !own.consumerSystemId) {
      out.push({ kind: 'resource-no-consumer', severity: 'advisory',
        msg: 'A common resource with no resolvable consuming system — the interface requirement has ' +
             'no owner even though the provider requirement does.' });
    }
    // Mode-level data belongs on the verification mirror only. Allocation stops at the item.
    var pg = (typeof ctx.pageOf === 'function') ? ctx.pageOf(node) : null;
    var onMirror = !!(pg && pg.verifies);
    var id = node.identity;
    if (!onMirror && id.modeIds && id.modeIds.length) {
      out.push({ kind: 'modes-on-allocation', severity: 'blocks-closure',
        msg: 'Failure modes are declared on an ALLOCATION tree. Allocation stops at the item and its ' +
             'effect; modes and their rates live on the verification mirror.' });
    }
    return out;
  }

  // Sweep a whole tree. cb-free, returns counts plus the offending nodes so a panel can
  // list them rather than just show a number.
  function sweepTree(rootNode, ctx) {
    var res = { nodes: 0, structured: 0, unstructured: [], incomplete: [], unowned: [], other: [] };
    (function walk(n) {
      if (!n) return;
      res.nodes++;
      if (isStructured(n)) res.structured++;
      nodeFindings(n, ctx).forEach(function (f) {
        if (f.kind === 'unstructured') res.unstructured.push({ node: n, finding: f });
        else if (f.kind === 'incomplete') res.incomplete.push({ node: n, finding: f });
        else if (f.kind === 'unowned') res.unowned.push({ node: n, finding: f });
        else res.other.push({ node: n, finding: f });
      });
      (n.children || n._children || []).forEach(walk);
    })(rootNode);
    res.blocksClosure = res.unstructured.length + res.incomplete.length + res.unowned.length +
      res.other.filter(function (o) { return o.finding.severity === 'blocks-closure'; }).length;
    return res;
  }

  return {
    KINDS: KINDS, kindOf: kindOf, isStructured: isStructured, isComplete: isComplete,
    missingFields: missingFields, resolveOwner: resolveOwner, crossesBoundary: crossesBoundary,
    displayText: displayText, nodeFindings: nodeFindings, sweepTree: sweepTree
  };
}));
