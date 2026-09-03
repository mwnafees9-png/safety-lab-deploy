// ============================================================================
// req_taxonomy.js — v1.0 — ONE vocabulary for what a requirement IS.
//
// WHY THIS EXISTS (1 Aug 2026). The `type` field on a requirement row held FOUR
// disagreeing vocabularies at once, and the disagreement was silent:
//
//   the entry FORM offered ...... Design Assurance · Probabilistic · Independence
//   the GENERATORS wrote ........ Probabilistic · Design Assurance · Independence · Maintenance
//   the FILTER chips matched .... Safety · Functional · Performance
//   demos / bowtie / importers .. Safety · Architecture · Monitor · Functional ·
//                                 Human Factors · Qualification · Installation ·
//                                 Derived · Quantitative
//
// The form and the filter shared ZERO values, so a user could not hand-author a
// requirement that any Type filter would match. Measured on the shipped Kestrel RJ
// showcase: 57 requirements across 11 type values; "Safety" returned 0, "Performance"
// returned 0, "Functional" returned 2. Four of the five chips showed an empty list on
// the flagship demo — and an empty list reads as "you have none of those", not as
// "this filter cannot match anything you own".
//
// `level` had the same disease: the form offered L1–L4, generators emitted L1–L3,
// the chips matched High-level / Derived. vv_validation.js already carried a local
// workaround for half of it (`level === 'Derived' || r.derivationType`) — the tell
// that this had been hit before and patched at one call site instead of fixed.
//
// THE FIX — split the field, because two orthogonal things were sharing it:
//
//   type      WHAT KIND of requirement this is        → ARP4754B §5.3.1 classes
//   analysis  WHICH ANALYSIS produced it              → Probabilistic, Independence, …
//   level     WHERE in the hierarchy it sits          → L1 aircraft / L2 system / L3 item
//
// "Probabilistic" was never a peer of "Safety": a probabilistic requirement IS a
// safety requirement, derived from the FHA. Forcing both into one field is the root
// error, and any new generator would have deepened it.
//
// STANDARDS BASIS. The class list below is ARP4754B §5.3.1 "Classes of Requirements",
// §5.3.1.1 through §5.3.1.11, read from the source. CLAUSE NUMBERS AND TITLES ONLY —
// SAE material is licensed and no clause prose is stored here or anywhere in the repo,
// the same cite-and-point posture the rest of the product uses.
// ============================================================================
(function () {
    'use strict';

    // ---- ARP4754B §5.3.1 Classes of Requirements -------------------------------
    // `id` is stable and internal; `label` is what is stored on the row and shown.
    const REQ_CLASSES = [
        { id: 'safety',        label: 'Safety',                    clause: 'ARP4754B §5.3.1.1'  },
        { id: 'functional',    label: 'Functional',                clause: 'ARP4754B §5.3.1.2'  },
        { id: 'customer',      label: 'Customer',                  clause: 'ARP4754B §5.3.1.3'  },
        { id: 'operational',   label: 'Operational',               clause: 'ARP4754B §5.3.1.4'  },
        { id: 'performance',   label: 'Performance',               clause: 'ARP4754B §5.3.1.5'  },
        { id: 'installation',  label: 'Physical and Installation', clause: 'ARP4754B §5.3.1.6'  },
        { id: 'maintain',      label: 'Maintainability',           clause: 'ARP4754B §5.3.1.7'  },
        { id: 'interface',     label: 'Interface',                 clause: 'ARP4754B §5.3.1.8'  },
        { id: 'certification', label: 'Certification',             clause: 'ARP4754B §5.3.1.9'  },
        { id: 'derived',       label: 'Derived',                   clause: 'ARP4754B §5.3.1.10' },
        { id: 'reuse',         label: 'Re-Use',                    clause: 'ARP4754B §5.3.1.11' }
    ];

    // ---- Which analysis produced it -------------------------------------------
    // This is the vocabulary the generators and the entry form USED to put in `type`.
    // Nothing is lost by the split: it moves here and stays visible in its own column.
    const ANALYSIS_KINDS = [
        { id: 'probabilistic', label: 'Probabilistic',    note: 'FHA target / FTA event allocation' },
        { id: 'dal',           label: 'Design Assurance', note: 'FDAL/IDAL allocation (ARP4761A App P)' },
        { id: 'independence',  label: 'Independence',     note: 'gate structure · PRA · ZSA · CMA' },
        { id: 'maintenance',   label: 'Maintenance',      note: 'latent-failure interval / CMR' },
        { id: 'human_factors', label: 'Human Factors',    note: 'HF register — crew task credit' },
        { id: 'iface',         label: 'Interface register', note: 'system-to-system edges + ICD references' }
    ];

    // ---- Where in the hierarchy ------------------------------------------------
    const REQ_LEVELS = [
        { id: 'L1', label: 'L1', note: 'Aircraft' },
        { id: 'L2', label: 'L2', note: 'System'   },
        { id: 'L3', label: 'L3', note: 'Item'     }
    ];

    const CLASS_LABELS    = REQ_CLASSES.map(c => c.label);
    const ANALYSIS_LABELS = ANALYSIS_KINDS.map(a => a.label);
    const CLAUSE_BY_LABEL = {};
    REQ_CLASSES.forEach(c => { CLAUSE_BY_LABEL[c.label.toLowerCase()] = c.clause; });

    // ---- Migration of everything already stored --------------------------------
    //
    // THE RULE: never silently reclassify an engineer's judgement. A value this map
    // does not confidently understand is LEFT EXACTLY AS IT IS, and the filter shows
    // it under "Unmapped" so the row stays reachable. Losing a row from a filter is
    // what caused this; a migration that guesses would cause it again, less visibly.
    //
    // Two of these are judgement calls rather than lookups, and are recorded as such:
    //
    //   Design Assurance → Safety.  FDAL/IDAL is derived from failure-condition
    //     severity (ARP4761A App P), so the requirement's KIND is safety even though
    //     the artifact is a development-assurance level. Certification (§5.3.1.9) is
    //     the defensible alternative. `analysis: 'Design Assurance'` keeps the
    //     distinction visible either way, so this is reversible in one line.
    //
    //   Maintenance → Maintainability.  A latent-failure interval is a candidate CMR,
    //     which is arguably a Safety requirement discharged through the maintenance
    //     programme. §5.3.1.7 is the class that NAMES it, so that is where it goes.
    //
    // Everything else below is a direct reading, not a judgement.
    const LEGACY_TYPE_MAP = {
        // generator + form vocabulary
        'probabilistic':     { type: 'Safety',                    analysis: 'Probabilistic'    },
        'quantitative':      { type: 'Safety',                    analysis: 'Probabilistic'    },
        'independence':      { type: 'Safety',                    analysis: 'Independence'     },
        'design assurance':  { type: 'Safety',                    analysis: 'Design Assurance' },
        'maintenance':       { type: 'Maintainability',           analysis: 'Maintenance'      },
        // values already in the §5.3.1 vocabulary — identity, kept explicit so a
        // reader can see they were considered rather than missed
        'safety':            { type: 'Safety'                     },
        'functional':        { type: 'Functional'                 },
        'performance':       { type: 'Performance'                },
        'customer':          { type: 'Customer'                   },
        'operational':       { type: 'Operational'                },
        'interface':         { type: 'Interface'                  },
        'certification':     { type: 'Certification'              },
        'derived':           { type: 'Derived'                    },
        'installation':      { type: 'Physical and Installation'  },
        // authored in the demos, unambiguous against the standard's own naming
        'human factors':     { type: 'Operational', analysis: 'Human Factors' }
    };

    // Deliberately ABSENT from the map, and the reason. These are real authored values
    // in the shipped showcases; each could sit in two different §5.3.1 classes and the
    // right answer depends on what the engineer meant.
    const AMBIGUOUS_LEGACY = {
        'architecture':  'Functional (§5.3.1.2) or Safety (§5.3.1.1) — depends whether the architecture is required for function or for failure independence.',
        'monitor':       'Safety (§5.3.1.1) or Functional (§5.3.1.2) — a monitor required to detect a failure condition is safety; one required to provide indication is functional.',
        'qualification': 'Certification (§5.3.1.9) or Physical and Installation (§5.3.1.6) — environmental qualification sits in either depending on the basis claimed.'
    };

    function _key(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

    function classOf(label)  { return REQ_CLASSES.find(c => c.label.toLowerCase() === _key(label)) || null; }
    function clauseFor(label) { return CLAUSE_BY_LABEL[_key(label)] || ''; }
    function isKnownClass(label) { return !!classOf(label); }
    function isAmbiguousLegacy(label) { return Object.prototype.hasOwnProperty.call(AMBIGUOUS_LEGACY, _key(label)); }

    // Idempotent. Returns { changed, before, after } and mutates the row only when
    // it is confident. Safe to run on every load, and on rows already migrated.
    function migrateRow(row) {
        if (!row || typeof row !== 'object') return { changed: false };
        const before = { type: row.type, analysis: row.analysis };
        const t = _key(row.type);
        if (!t) return { changed: false, before, after: before };
        if (isKnownClass(row.type) && (!LEGACY_TYPE_MAP[t] || !LEGACY_TYPE_MAP[t].analysis || row.analysis)) {
            return { changed: false, before, after: before };   // already a §5.3.1 class
        }
        const m = LEGACY_TYPE_MAP[t];
        if (!m) return { changed: false, before, after: before, unmapped: true };
        row.type = m.type;
        if (m.analysis && !row.analysis) row.analysis = m.analysis;
        const after = { type: row.type, analysis: row.analysis };
        return { changed: after.type !== before.type || after.analysis !== before.analysis, before, after };
    }

    function migrateAll(rows) {
        const out = { scanned: 0, changed: 0, unmapped: {} };
        (rows || []).forEach(r => {
            out.scanned++;
            const res = migrateRow(r);
            if (res.changed) out.changed++;
            if (res.unmapped) { const k = String(r.type); out.unmapped[k] = (out.unmapped[k] || 0) + 1; }
        });
        return out;
    }

    // ---- What the filters must offer -------------------------------------------
    //
    // The chips are built from the taxonomy UNION the values actually present in the
    // project. That is the whole guard: a chip can only exist if something can match
    // it, and a stored value can only be invisible if nothing holds it. Neither half
    // of the original failure can recur.
    function valuesPresent(rows, field) {
        const seen = new Map();
        (rows || []).forEach(r => {
            const v = r && r[field];
            if (v == null || v === '') return;
            seen.set(String(v), (seen.get(String(v)) || 0) + 1);
        });
        return seen;
    }

    // Returns [{ value, count, known }] — `known` false marks a value the taxonomy
    // does not contain, which the UI renders under "Unmapped" rather than dropping.
    function chipsFor(rows, field) {
        const present = valuesPresent(rows, field);
        const canon = field === 'type' ? CLASS_LABELS
                    : field === 'analysis' ? ANALYSIS_LABELS
                    : REQ_LEVELS.map(l => l.label);
        const out = [];
        canon.forEach(v => { if (present.has(v)) out.push({ value: v, count: present.get(v), known: true }); });
        present.forEach((count, v) => {
            if (canon.indexOf(v) < 0) out.push({ value: v, count, known: false });
        });
        return out;
    }

    const API = { REQ_CLASSES, ANALYSIS_KINDS, REQ_LEVELS, CLASS_LABELS, ANALYSIS_LABELS,
                  LEGACY_TYPE_MAP, AMBIGUOUS_LEGACY, classOf, clauseFor, isKnownClass,
                  isAmbiguousLegacy, migrateRow, migrateAll, valuesPresent, chipsFor };
    if (typeof window !== 'undefined') window.ReqTaxonomy = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
