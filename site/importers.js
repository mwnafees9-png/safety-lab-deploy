// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// importers.js — ExcelImport / SysMLImport / JamaConnect, extracted verbatim from
// safety_lab.js (Phase 76 modularization). Classic script, shared global scope, loaded
// BEFORE safety_lab.js. Self-contained at definition; refs to monolith globals run
// inside methods at runtime. Byte-identical.

const ExcelImport = (function() {

    // --------------------------------------------------------------------
    // Layer 1 — sheet-name → kind. Aliases are normalized (lower, alnum-only).
    // --------------------------------------------------------------------
    // NOTE on ordering: kinds are evaluated top-to-bottom and the first hit wins.
    // sys-* must come BEFORE ac-* because "System Hazards" contains "hazards"
    // (an acFha alias). Likewise the more-specific kinds (zsa/pra/cma/fmea) come
    // before the generic ac* set. Short two-letter aliases like 'sa' are dangerous
    // for substring matching (it'd swallow 'ZSA') so we drop them — full names only.
    const SHEET_ALIASES = {
        // sys-scoped first
        sysFunc:['systemfunctions', 'subsystemfunctions', 'sysfunctions', 'sysfunc'],
        sysFcim:['systemfcim', 'sysfcim', 'subsystemfcim'],
        sysFha: ['systemhazards', 'sysfha', 'systemfha', 'subsystemfha', 'systemfunctionalhazardassessment', 'subsystemhazards'],
        sysReq: ['systemrequirements', 'sysreq', 'subsystemrequirements'],
        sysAsm: ['systemassumptions', 'sysassumptions', 'sysasm'],
        // dedicated specialty analyses
        pra:    ['pra', 'particularrisks', 'particularriskanalysis', 'particularriskassessment'],
        zsa:    ['zsa', 'zonalsafetyanalysis', 'zonalsafety', 'zonalsafetyassessment', 'zonal'],
        cma:    ['cma', 'commonmodeanalysis', 'commoncauseanalysis', 'ccfanalysis', 'ccfcma'],
        fmea:   ['fmea', 'failuremodeseffects', 'failuremodesandeffects', 'fmeca'],
        // ac-scoped last
        acFunc: ['functions', 'acfunctions', 'aircraftfunctions', 'aclvlfunctions', 'fnlist', 'functionlist'],
        acFcim: ['fcim', 'acfcim', 'functioncondition', 'fcconditionmatrix', 'failureconditionmatrix'],
        acFha:  ['fha', 'acfha', 'aircrafthazards', 'hazards', 'functionalhazardassessment',
                 'hazardanalysis', 'failureconditions'],
        acReq:  ['requirements', 'acrequirements', 'safetyrequirements', 'aircraftrequirements',
                 'acreq', 'fdal', 'idal'],
        acAsm:  ['assumptions', 'safetyassumptions', 'acassumptions', 'aircraftassumptions']
    };

    // --------------------------------------------------------------------
    // Layer 2 — per-kind column header → field. First match wins.
    // Each value is { aliases: [...], required?: true }.
    // --------------------------------------------------------------------
    const FIELD_ALIASES = {
        acFha: {
            subId:    ['subid', 'subfunctionid', 'functionid', 'funcid', 'functionref', 'fnid'],
            fcId:     ['fcid', 'hazardid', 'failureconditionid', 'fc#', 'fcnum', 'fcnumber'],
            fcDesc:   ['description', 'fcdescription', 'condition', 'hazarddescription', 'hazardstatement', 'failurecondition'],
            phases:   ['phases', 'flightphases', 'phaseofflight'],
            effAc:    ['effectac', 'aircrafteffect', 'effectonaircraft', 'effectoperational', 'aceffect', 'effectoffailurecondition', 'effectoffailureconditionandrationale', 'failureeffect', 'failureeffects', 'effect', 'effects', 'effectoffailure'],
            effCrew:  ['effectcrew', 'creweffect', 'effectoncrew'],
            effPax:   ['effectpax', 'effectpassengers', 'effectonpassengers', 'effectonoccupants', 'paxeffect', 'occupanteffect'],
            severity: ['severity', 'classification', 'severityclass', 'hazardclass', 'severityclassification'],
            // assumptionIds must come BEFORE comments — when a single column is named
            // "Assumptions, Comments, Supporting Material" the assumption ref is the
            // higher-value data to capture; the executor splits ASM-* tokens out.
            assumptionIds: [
                'assumptionids', 'assumptions', 'assumption', 'asmids', 'asmrefs', 'asmref',
                'supportingmaterial', 'supportingdata', 'supportingrefs', 'supportingreferences',
                'assumptionscommentssupportingmaterial', 'assumptionscomments', 'commentsandassumptions',
                'notesassumptions', 'assumptionsnotes', 'linkedassumptions', 'relatedassumptions',
                'derivedassumptions', 'assumptionrefs', 'assumptionreferences'
            ],
            comments: ['comments', 'notes', 'remarks', 'rationale', 'discussion']
        },
        sysFha: {
            subId:    ['subid', 'functionid', 'funcid', 'fnid'],
            fcId:     ['fcid', 'hazardid', 'failureconditionid'],
            fcDesc:   ['description', 'fcdescription', 'condition', 'hazarddescription', 'hazardstatement', 'failurecondition'],
            phases:   ['phases', 'flightphases', 'phaseofflight'],
            effAc:    ['effectac', 'aircrafteffect', 'effectonaircraft', 'aceffect', 'failureeffect', 'failureeffects', 'effect', 'effects', 'effectoffailure'],
            effCrew:  ['effectcrew', 'creweffect', 'effectoncrew'],
            effPax:   ['effectpax', 'effectpassengers', 'effectonpassengers', 'effectonoccupants', 'paxeffect', 'occupanteffect'],
            severity: ['severity', 'classification'],
            assumptionIds: [
                'assumptionids', 'assumptions', 'assumption', 'asmids', 'asmrefs', 'asmref',
                'supportingmaterial', 'supportingdata', 'supportingrefs',
                'assumptionscommentssupportingmaterial', 'assumptionscomments',
                'linkedassumptions', 'assumptionrefs', 'assumptionreferences'
            ],
            comments: ['comments', 'notes', 'remarks', 'discussion'],
            acTrace:  ['actrace', 'aircraftfc', 'parentfc', 'parenthazard', 'tracesto']
        },
        acReq: {
            reqId:    ['reqid', 'requirementid', 'id', 'sr#', 'sr', 'reqno'],
            traceId:  ['traceid', 'traceto', 'functionref', 'fnid', 'funcid'],
            level:    ['level', 'reqlevel', 'tier'],
            type:     ['type', 'requirementtype', 'category'],
            text:     ['text', 'requirement', 'requirementtext', 'statement', 'shall'],
            rat:      ['rationale', 'rat', 'basis', 'justification']
        },
        sysReq: {
            reqId:    ['reqid', 'requirementid', 'id'],
            traceId:  ['traceid', 'traceto', 'functionref', 'fnid'],
            level:    ['level', 'reqlevel'],
            type:     ['type', 'requirementtype'],
            text:     ['text', 'requirement', 'statement'],
            rat:      ['rationale', 'basis', 'justification']
        },
        acAsm: {
            asmId:    ['asmid', 'assumptionid', 'id', 'sa#', 'sa'],
            origin:   ['origin', 'source', 'derivedfrom'],
            text:     ['text', 'statement', 'assumption', 'assumptionstatement'],
            state:    ['state', 'status', 'maturity']
        },
        sysAsm: {
            asmId:    ['asmid', 'assumptionid', 'id'],
            origin:   ['origin', 'source'],
            text:     ['text', 'statement', 'assumption'],
            state:    ['state', 'status']
        },
        acFunc: {
            // 21 Oct 2026 (full function tree). A column whose heading says "parent" (or "sits under")
            // can only be the parent column, and the parent column only ever comes from such a
            // heading (detectColumnMap). Blank = directly under the aircraft function.
            parentSubId: ['parentsubfunctionid', 'parentsubid', 'parentsubfunction', 'parentid', 'parent', 'sitsunder'],
            funcId:   ['funcid', 'functionid', 'fnid', 'id'],
            funcName: ['funcname', 'functionname', 'name', 'title', 'aircraftfunction'],
            funcDef:  ['funcdef', 'functiondefinition', 'functiondescription', 'definition', 'description'],
            subId:    ['subid', 'subfunctionid'],
            subName:  ['subname', 'subfunctionname'],
            subDef:   ['subdef', 'subfunctiondefinition', 'subfunctiondescription', 'subdefinition'],
            // 22 Oct 2026 (the 3-level layout): the Sub-Sub-Function columns its export writes. A line that
            // fills them is the sub-sub-function, under the sub-function in the same line.
            subSubId:   ['subsubid', 'subsubfunctionid'],
            subSubName: ['subsubname', 'subsubfunction', 'subsubfunctionname'],
            subSubDef:  ['subsubdef', 'subsubdefinition', 'subsubfunctiondefinition', 'subsubfunctiondescription'],
            // 21 Oct 2026 (a customer's sheet: every level in ONE column, only the numbering says which level).
            // The outline number (1, 1.1, 1.1.1, AF-1.2.3) decides the level and the parent; the
            // name and description columns then hold every level. See _importFunctionOutline.
            // 22 Oct 2026: "code" (the customer's own heading for the numbering, found on the call).
            outline:  ['outline', 'outlinenumber', 'number', 'no', 'num', 'nr', 'functionnumber', 'functionno', 'fnno', 'code', 'functioncode',
                       'wbs', 'hierarchy', 'hierarchynumber', 'levelnumber', 'itemnumber', 'itemno', 'paragraph', 'section', 'ref', 'refno']
        },
        sysFunc: {
            funcId:   ['funcid', 'functionid', 'fnid', 'id'],
            funcName: ['funcname', 'functionname', 'name'],
            funcDef:  ['funcdef', 'definition', 'description']
        },
        // FCIM data model is matrix-shaped natively: ONE record = one sub-function
        // row with three failure-condition pairs (Total Loss / Partial Loss /
        // Malfunction). We map each pivot column to its specific field pair.
        // Each cell of the form "<id-token> <description>" splits to fcId + fcDesc.
        acFcim: {
            subId:     ['subid', 'subfunctionid', 'aircraftsubfunctionid', 'functionid', 'funcid'],
            awareness: ['awareness', 'crewawareness', 'crewaware', 'crewawareunaware', 'crewawarenessstatus'],
            // Pivot columns — each maps to one specific FC slot on the record.
            pivotTL:   ['totalloss', 'totallossoffunction', 'completefailure'],
            pivotPL:   ['partialloss', 'partiallossoffunction', 'degraded', 'degradedfunction', 'reduced'],
            pivotM:    ['malfunction', 'malfunctionuncommanded', 'malfunctionerroneous', 'erroneous',
                        'erroneousoutput', 'uncommanded', 'inadvertent', 'inadvertentactivation'],
            // Flat fallback — when a workbook spells the FC slots out as discrete columns.
            tlId:   ['tlid', 'totallossid', 'tlfcid'],
            tlDesc: ['tldesc', 'totallossdescription'],
            plId:   ['plid', 'partiallossid', 'plfcid'],
            plDesc: ['pldesc', 'partiallossdescription'],
            mId:    ['mid', 'malfunctionid', 'mfcid', 'erroneousid'],
            mDesc:  ['mdesc', 'malfunctiondescription']
        },
        sysFcim: {
            subId:     ['subid', 'subfunctionid', 'functionid'],
            awareness: ['awareness', 'crewawareness', 'crewaware', 'crewawareunaware'],
            pivotTL:   ['totalloss', 'totallossoffunction', 'completefailure'],
            pivotPL:   ['partialloss', 'partiallossoffunction', 'degraded', 'degradedfunction'],
            pivotM:    ['malfunction', 'malfunctionuncommanded', 'erroneous', 'uncommanded', 'inadvertent'],
            tlId:   ['tlid', 'totallossid'], tlDesc: ['tldesc', 'totallossdescription'],
            plId:   ['plid', 'partiallossid'], plDesc: ['pldesc', 'partiallossdescription'],
            mId:    ['mid', 'malfunctionid'], mDesc: ['mdesc', 'malfunctiondescription']
        },
        pra: {
            // 23 Sep 2026 (G3) — keys are the PRA table's own fields (the old 'description' key
            // matched nothing the PRA tab reads, so imported propagation paths showed blank).
            praId:    ['praid', 'id', 'pra#'],
            threat:   ['threat', 'threatsource', 'risktype', 'hazardtype', 'risk'],
            desc:     ['propagationpath', 'description', 'details', 'threatdescription'],
            systems:  ['targetsystems', 'affectedsystems', 'systems', 'components'],
            csfl:     ['csflimpact', 'csflimpactanalysis', 'csfl', 'impact'],
            affectedZones: ['zones', 'affectedzones', 'zonesimpacted'],
            mitigation: ['mitigation', 'mitigationstrategy', 'controls', 'mitigationapproach']
        },
        // 23 Sep 2026 (G9) — keys are the ZSA table's own fields (the old zsaId/zone/threat
        // keys matched nothing the ZSA tab reads, so imported zones showed blank), plus
        // the finding record (zsa_record.js).
        zsa: {
            zoneId:   ['zoneid', 'zone', 'arinczone', 'ata', 'zsaid', 'id', 'zsa#'],
            desc:     ['description', 'boundaries', 'boundary', 'zonedescription'],
            equip:    ['installedequipment', 'equipment', 'routing'],
            severity: ['worstseverity', 'severity'],
            interference: ['interferenceprofile', 'interference', 'interferences', 'threat', 'risk', 'hazard'],
            housedFunctions: ['housedfunctions', 'functionshoused'],
            mitigation: ['separationmitigations', 'mitigation', 'mitigations', 'protection'],
            assessedBy: ['assessedby', 'assessor', 'inspector'],
            assessMethod: ['assessmentmethod', 'method', 'inspectionmethod'],
            assessedOn: ['assessedon', 'assessmentdate', 'inspectiondate', 'date'],
            findingStatus: ['findingstatus', 'status', 'state']
        },
        cma: {
            cmaId:    ['cmaid', 'id', 'cma#'],
            subject:  ['subject', 'item', 'name'],
            claim:    ['claim', 'independenceclaim'],
            findings: ['findings', 'analysis'],
            mitigation: ['mitigation'],
            status:   ['status', 'state']
        },
        fmea: {
            fmeaId:   ['fmeaid', 'id', 'fmea#'],
            component: ['component', 'item', 'lru'],
            failureMode: ['failuremode', 'mode'],
            cause:    ['cause', 'failurecause'],
            effect:   ['effect', 'localeffect'],
            severity: ['severity'],
            occurrence: ['occurrence', 'probability'],
            detection: ['detection']
        }
    };

    // --------------------------------------------------------------------
    // Value normalizers
    // --------------------------------------------------------------------
    const SEVERITY_MAP = {
        'i': 'Catastrophic', 'cati': 'Catastrophic', 'catastrophic': 'Catastrophic', 'cat': 'Catastrophic',
        'class1': 'Catastrophic', 'classi': 'Catastrophic',
        'ii': 'Hazardous', 'catii': 'Hazardous', 'hazardous': 'Hazardous', 'haz': 'Hazardous',
        'class2': 'Hazardous', 'classii': 'Hazardous', 'severemajor': 'Hazardous',
        'iii': 'Major', 'catiii': 'Major', 'major': 'Major', 'maj': 'Major',
        'class3': 'Major', 'classiii': 'Major',
        'iv': 'Minor', 'cativ': 'Minor', 'minor': 'Minor', 'min': 'Minor',
        'class4': 'Minor', 'classiv': 'Minor',
        'v': 'Negligible', 'noeffect': 'Negligible', 'negligible': 'Negligible', 'neg': 'Negligible',
        'noeff': 'Negligible'
    };
    function normSeverity(v) {
        if (!v) return '';
        const k = String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
        return SEVERITY_MAP[k] || v;
    }

    const ASM_STATE_MAP = {
        'proposed': 'Proposed', 'open': 'Proposed', 'draft': 'Proposed', 'new': 'Proposed',
        'validated': 'Validated', 'val': 'Validated', 'accepted': 'Validated',
        'verified': 'Verified', 'ver': 'Verified', 'closed': 'Verified', 'final': 'Verified'
    };
    function normAsmState(v) {
        if (!v) return 'Proposed';
        const k = String(v).toLowerCase().replace(/[^a-z]/g, '');
        return ASM_STATE_MAP[k] || 'Proposed';
    }

    // Split multi-value cells on common delimiters: ; , | / newline
    function splitMulti(v) {
        if (v == null) return [];
        return String(v).split(/[;,|\/\n]/).map(s => s.trim()).filter(Boolean);
    }

    // Split a combined-effects cell into { ac, crew, pax } when the cell carries
    // the standard ARP 4761A-style labels embedded in free text. Recognizes:
    //   "Effect on aircraft: X. Effect on crew: Y. Effect on passengers: Z"
    //   "Effect on the aircraft: X. Effect on the crew: Y. ..."  ← common variant
    //   plus shorter variants (AC: / Crew: / Pax: / Occupants:).
    // The prefix "Effect[s] on [the] " must be consumed by the same match that
    // captures the bucket label — otherwise the preceding segment ends up with
    // a trailing "Effect on the " glued to it.
    // Returns null when fewer than 2 buckets actually fill — single-effect cells
    // stay as-is and continue to live in effAc.
    function splitCombinedEffects(text) {
        if (!text) return null;
        const s = String(text);
        const re = /(?:effects?\s+(?:on|to|upon)\s+(?:the\s+)?)?\b(aircraft|ac|crew|flightcrew|pax|passengers?|occupants?)\b\s*[:\-—]\s*/gi;
        const matches = [];
        let m;
        while ((m = re.exec(s)) !== null) {
            matches.push({ index: m.index, end: re.lastIndex, label: m[1].toLowerCase() });
        }
        if (matches.length < 2) return null;
        const out = { ac: '', crew: '', pax: '' };
        for (let i = 0; i < matches.length; i++) {
            const cur = matches[i];
            const next = matches[i + 1];
            const segment = s.slice(cur.end, next ? next.index : s.length).trim().replace(/[\s.]+$/, '');
            if (/^a(c|ircraft)$/.test(cur.label)) out.ac = segment;
            else if (cur.label === 'crew' || cur.label === 'flightcrew') out.crew = segment;
            else out.pax = segment;  // passengers / pax / occupants
        }
        const filled = (out.ac ? 1 : 0) + (out.crew ? 1 : 0) + (out.pax ? 1 : 0);
        if (filled < 2) return null;
        return out;
    }

    // Normalize a header / sheet name for alias matching: lower-case, drop non-alnum.
    function normName(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Detect the header row in a sheet. Some templates have a multi-row title
    // block (logo, doc#, revision) before the actual table. Walk down up to 8
    // rows looking for the row with the most non-empty cells.
    function detectHeaderRow(rows) {
        const scan = Math.min(rows.length, 8);
        let bestIdx = 0, bestScore = -1;
        for (let i = 0; i < scan; i++) {
            const row = rows[i] || [];
            const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
            // Prefer rows with several text cells (looks like headers).
            const textCells = row.filter(c => typeof c === 'string' && c.trim().length > 0).length;
            const score = nonEmpty + textCells * 0.5;
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        return bestIdx;
    }

    // Phase 53.19 — context-aware routing. When opts.sysActive is true (i.e. a
    // system folder is open at import time), ambiguous AC-default matches are
    // promoted to their sys-scoped equivalents — so importing into an open
    // system workspace puts the data where the user actually wants it.
    const AC_TO_SYS = {
        acFunc:  'sysFunc',
        acFcim:  'sysFcim',
        acFha:   'sysFha',
        acReq:   'sysReq',
        acAsm:   'sysAsm'
    };
    function _ctxRoute(kind, opts) {
        if (opts && opts.sysActive && AC_TO_SYS[kind]) return AC_TO_SYS[kind];
        return kind;
    }
    function detectKindFromSheetName(sheetName, opts) {
        opts = opts || {};
        const k = normName(sheetName);
        // Pass 1: exact alias match.
        for (const [kind, aliases] of Object.entries(SHEET_ALIASES)) {
            if (aliases.includes(k)) return _ctxRoute(kind, opts);
        }
        // Pass 2: substring match (sheet name contains alias).
        for (const [kind, aliases] of Object.entries(SHEET_ALIASES)) {
            if (aliases.some(a => k.includes(a))) return _ctxRoute(kind, opts);
        }
        return null;
    }

    // Match column headings to fields (rebuilt 21 Oct 2026). The old matcher took ANY substring in
    // EITHER direction, so a heading was claimed by whichever alias happened to contain it or be
    // contained in it: "Global ID" became the function ID, "Owner Name" the function name, and a
    // heading such as "Function" could land in a field that merely had "function" inside its
    // alias. Customers' sheets (Jama exports above all) are full of such headings, so columns
    // landed in the wrong fields with no error. Now:
    //   exact      the whole heading is an alias ("Function ID", "Comments")              strongest
    //   words      a run of WHOLE words in the heading is an alias of 5+ letters (so a lone
    //              "name" or "type" inside "Owner Name" or "Item Type" claims nothing)
    //              ("Hazard Description and Effect" -> description)
    //   short      the heading is an alias minus a plural or an ID ("Phase" -> phases)
    //   "parent"   a heading that says parent (or sits under) only matches a parent alias, and a
    //              parent alias only matches such a heading
    //   ids        a heading ending in ID / No / Number / Ref prefers a field that is an id
    // and the whole sheet is assigned at once, best match first: each field takes ONE column,
    // each column ONE field, so a stronger heading is never beaten by a weaker one that came first.
    const _ID_WORDS = { id: 1, no: 1, number: 1, num: 1, nr: 1, ref: 1, key: 1, code: 1 };
    // a heading may drop only a plural or an "ID" off the end of an alias: "Phase" is phases and
    // "Function" is the function ID, but "Effect" is never "effect on passengers"
    const _SHORT_TAILS = { s: 1, es: 1, id: 1, ids: 1 };
    function _hdrKey(s) { return normName(String(s == null ? '' : s).replace(/#/g, ' number ')); }
    function _hdrWords(s) {
        return String(s == null ? '' : s).replace(/#/g, ' number ').replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    }
    function _headerCandidates(kind, header) {
        const aliases = FIELD_ALIASES[kind];
        if (!aliases) return [];
        const k = _hdrKey(header);
        if (!k) return [];
        const words = _hdrWords(header);
        const runs = new Set();
        for (let i = 0; i < words.length; i++) for (let j = i; j < words.length; j++) runs.add(words.slice(i, j + 1).join(''));
        const saysParent = runs.has('parent') || runs.has('sitsunder');
        const idTail = !!_ID_WORDS[words[words.length - 1]];
        const out = [];
        Object.entries(aliases).forEach(function (entry, order) {
            const field = entry[0], list = entry[1];
            let best = -1;
            list.forEach(function (raw) {
                const a = _hdrKey(raw);
                if (!a) return;
                if (saysParent !== /parent|sitsunder/.test(a)) return;
                let sc = -1;
                if (k === a) sc = 1000 + a.length;
                else if (a.length >= 5 && runs.has(a)) sc = 500 + a.length * 10;
                else if (k.length >= 4 && a.indexOf(k) === 0 && _SHORT_TAILS[a.slice(k.length)]) sc = 200 + k.length;
                if (sc < 0) return;
                if (idTail && sc < 1000 && !/id$/i.test(field) && field !== 'outline') sc -= 400;
                if (sc > best) best = sc;
            });
            if (best > 0) out.push({ field: field, score: best, order: order });
        });
        // 22 Oct 2026: "Function" / "Sub-Function" on its own is the ID column (ruling of 21 Oct), unless
        // the sheet also has a "... ID" column for it, as the tool's own export does: then it is the
        // NAME. Offered as a weak second choice, so it only lands there once the ID column is taken.
        out.slice().forEach(function (c) {
            const sib = { funcId: 'funcName', subId: 'subName', subSubId: 'subSubName' }[c.field];
            if (sib && c.score < 1000 && !idTail && aliases[sib] && !out.some(function (o) { return o.field === sib; })) out.push({ field: sib, score: 100, order: c.order });
        });
        return out;
    }
    function detectColumnMap(kind, headers) {
        const cands = [];
        (headers || []).forEach(function (h, hi) {
            if (!h) return;
            _headerCandidates(kind, h).forEach(function (c) { cands.push({ h: h, hi: hi, field: c.field, score: c.score, order: c.order }); });
        });
        cands.sort(function (a, b) { return (b.score - a.score) || (a.order - b.order) || (a.hi - b.hi); });
        const map = {}, usedF = {}, usedH = {};
        cands.forEach(function (c) {
            if (usedF[c.field] || usedH[c.h]) return;
            map[c.h] = c.field; usedF[c.field] = 1; usedH[c.h] = 1;
        });
        return map;
    }
    // One heading on its own (the FCIM pivot sniff): its best field, or null.
    function detectFieldFromHeader(kind, header) {
        const c = _headerCandidates(kind, header).sort(function (a, b) { return (b.score - a.score) || (a.order - b.order); });
        return c.length ? c[0].field : null;
    }

    // ---- outline numbering (21 Oct 2026) ---------------------------------
    // "1", "1.2", "1.2.3", "1.2.3." and "AF-1.2.3" all read; the key drops a trailing dot.
    const _OUTLINE_RE = /^([A-Za-z][A-Za-z0-9]*[-_ ]?)?(\d+)((?:\.\d+)*)\.?$/;
    function _outlineParts(v) {
        const str = String(v == null ? '' : v).trim();
        const m = _OUTLINE_RE.exec(str);
        if (!m) return null;
        const prefix = m[1] || '';
        const segs = [m[2]].concat(m[3] ? m[3].slice(1).split('.') : []);
        return { key: prefix + segs.join('.'), prefix: prefix, segs: segs, depth: segs.length };
    }
    function _outlineParentKey(p) { return p.depth > 1 ? p.prefix + p.segs.slice(0, -1).join('.') : ''; }
    // Does this column hold outline numbers with more than one level? (most values parse, and at
    // least two different depths appear, one of them below the top)
    function _looksLikeOutline(values) {
        const vals = values.map(v => String(v == null ? '' : v).trim()).filter(Boolean);
        if (vals.length < 2) return false;
        const parts = vals.map(_outlineParts);
        const ok = parts.filter(Boolean);
        if (ok.length < vals.length * 0.8) return false;
        const depths = new Set(ok.map(p => p.depth));
        return depths.size >= 2 && Math.max.apply(null, Array.from(depths)) >= 2;
    }
    // A functions sheet with no sub-function columns, whose numbers carry the levels: switch it to
    // outline mode. The numbering column becomes "Number", and the name / description columns are
    // read for every level. Returns a short description of the tree for the dialog, or null.
    function _sniffOutline(sheet) {
        if (sheet.kind !== 'acFunc') return null;
        const map = sheet.columnMap, fields = Object.values(map);
        if (fields.indexOf('subId') >= 0 || fields.indexOf('subName') >= 0 || fields.indexOf('subSubId') >= 0 || fields.indexOf('subSubName') >= 0) return null;
        const colOf = f => Object.keys(map).find(h => map[h] === f);
        const values = h => sheet.rows.map(r => r[h]);
        let col = colOf('outline');
        if (col && !_looksLikeOutline(values(col))) { delete map[col]; col = null; }
        if (!col) {
            const tryCols = [colOf('funcId')].concat(sheet.headers.filter(Boolean)).filter(Boolean);
            col = tryCols.find(h => _looksLikeOutline(values(h))) || null;
        }
        if (!col) return null;
        Object.keys(map).forEach(h => { if (map[h] === 'outline' && h !== col) delete map[h]; });
        map[col] = 'outline';
        // the name and description, for every level
        const nameCol = colOf('funcName') || colOf('subName') || (colOf('funcId') !== col ? colOf('funcId') : null);
        const defCol = colOf('funcDef') || colOf('subDef');
        Object.keys(map).forEach(h => { if (h !== col && h !== nameCol && h !== defCol) delete map[h]; });
        if (nameCol) map[nameCol] = 'funcName';
        if (defCol) map[defCol] = 'funcDef';
        return _outlineSummary(sheet);
    }
    function _outlineSummary(sheet) {
        const col = Object.keys(sheet.columnMap).find(h => sheet.columnMap[h] === 'outline');
        if (!col) return null;
        const parts = sheet.rows.map(r => _outlineParts(r[col])).filter(Boolean);
        const depth = parts.reduce((m, p) => Math.max(m, p.depth), 0);
        const tops = parts.filter(p => p.depth === 1).length;
        return { column: col, levels: depth, functions: tops, below: parts.length - tops };
    }

    // --------------------------------------------------------------------
    // Parser — file → ImportPlan
    // --------------------------------------------------------------------
    let _currentPlan = null;
    let _preferredKind = null;
    // Set by the tab's own Import Excel button just before the file picker opens (data_ops_modules).
    function setPreferredKind(kind) { _preferredKind = kind && FIELD_ALIASES[kind] ? kind : null; }

    async function parseFile(file) {
        const XLSX = await _loadSheetJS();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        // Capture the active system at parse time so the dialog can advertise
        // the context and the executor can route sys-* sheets into the right system.
        const _sysAtParse = (typeof sys === 'function') && sys();
        const plan = {
            fileName: file.name,
            fingerprint: '',
            sheets: [],
            sysContext: _sysAtParse ? { id: _sysAtParse.id, name: _sysAtParse.name } : null
        };
        for (const sheetName of wb.SheetNames) {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
            if (!rows || rows.length === 0) continue;
            const headerRow = detectHeaderRow(rows);
            const headers = (rows[headerRow] || []).map(h => h == null ? '' : String(h).trim());
            // Layer 1: sheet-name routing — context-aware. When a system folder is
            // open at import time, ambiguous AC-shaped matches route to sys-* instead.
            const sysActive = (typeof sys === 'function') && !!sys();
            let kind = detectKindFromSheetName(sheetName, { sysActive }) || 'ignore';
            let routingReason = kind === 'ignore'
                ? 'no sheet-name match'
                : ('matched sheet name "' + sheetName + '"' + (sysActive && kind.indexOf('sys') === 0 ? ' (sys context active)' : ''));

            // Content-based override: a sheet with 2+ pivot-mode columns (TL / PL / M)
            // is a matrix FCIM no matter what the sheet is called.
            const pivotHits = headers.filter(h => {
                if (!h) return false;
                const f = detectFieldFromHeader('acFcim', h);
                return f === 'pivotTL' || f === 'pivotPL' || f === 'pivotM';
            }).length;
            if (pivotHits >= 2 && kind !== 'acFcim' && kind !== 'sysFcim') {
                kind = 'acFcim';
                routingReason = 'content sniff — ' + pivotHits + ' pivot-mode columns detected';
            }

            // The tab the import was started from (21 Oct 2026): a sheet whose name says nothing
            // (Sheet1, Export, a Jama report name) goes to that tab instead of being skipped.
            if (kind === 'ignore' && _preferredKind && (wb.SheetNames.length === 1 || !plan.sheets.some(x => x.kind === _preferredKind))) {
                kind = _preferredKind;
                routingReason = 'the tab the import was started from';
            }
            const columnMap = kind !== 'ignore' ? detectColumnMap(kind, headers) : {};   // { headerName: fieldName }
            // Diagnostic — visible to the user in DevTools when something looks off.
            try { console.log('[ExcelImport] Sheet "' + sheetName + '" → ' + kind + ' (' + routingReason + '); columns:', columnMap); } catch(_) {}
            // Build dataRows as raw {header: value} objects so the executor can pick fields
            // by columnMap regardless of how the user fixes the mapping in the dialog.
            const dataRows = [];
            for (let i = headerRow + 1; i < rows.length; i++) {
                const r = rows[i] || [];
                if (r.every(c => c == null || String(c).trim() === '')) continue;
                const obj = {};
                headers.forEach((h, j) => { if (h) obj[h] = r[j]; });
                dataRows.push(obj);
            }
            const sheetObj = {
                name: sheetName,
                kind,           // editable in the dialog
                autoRouted: kind !== 'ignore',
                headers,
                headerRow,
                columnMap,      // editable in the dialog
                rows: dataRows,
                rowCount: dataRows.length
            };
            sheetObj.outline = _sniffOutline(sheetObj);
            plan.sheets.push(sheetObj);
        }
        _preferredKind = null;   // one import only
        // Fingerprint = the sheet names AND their headings (21 Oct 2026). Names alone made every
        // "Sheet1" workbook share one saved template, so a template saved for one file was applied
        // to a different file and its columns pointed at headings that were not there.
        plan.fingerprint = plan.sheets.map(s => normName(s.name) + ':' + s.headers.filter(Boolean).map(normName).join(',')).sort().join('|');
        return plan;
    }

    // --------------------------------------------------------------------
    // Mapping dialog (Layer 3)
    // --------------------------------------------------------------------
    const TAB_OPTIONS = [
        { kind: 'ignore',  label: '— Skip this sheet —' },
        { kind: 'acFunc',  label: 'AC Functions' },
        { kind: 'acFcim',  label: 'AC FCIM' },
        { kind: 'acFha',   label: 'AC FHA' },
        { kind: 'acReq',   label: 'AC Requirements' },
        { kind: 'acAsm',   label: 'AC Assumptions' },
        { kind: 'sysFunc', label: 'System Functions (active system)' },
        { kind: 'sysFcim', label: 'System FCIM (active system)' },
        { kind: 'sysFha',  label: 'System FHA (active system)' },
        { kind: 'sysReq',  label: 'System Requirements (active system)' },
        { kind: 'sysAsm',  label: 'System Assumptions (active system)' },
        { kind: 'pra',     label: 'Particular Risks' },
        { kind: 'zsa',     label: 'Zonal Safety' },
        { kind: 'cma',     label: 'Common Mode' },
        { kind: 'fmea',    label: 'FMEA' }
    ];
    // Plain names for the "Tool field" dropdown (21 Oct 2026): it showed code names (funcId,
    // subDef) that only a developer could read.
    const FIELD_LABELS = {
        funcId: 'Function ID', funcName: 'Function name', funcDef: 'Function description',
        subId: 'Sub-function ID', subName: 'Sub-function name', subDef: 'Sub-function description',
        subSubId: 'Sub-sub-function ID', subSubName: 'Sub-sub-function name', subSubDef: 'Sub-sub-function description',
        parentSubId: 'Sits under (parent sub-function ID)', outline: 'Number (sets the level: 1, 1.1, 1.1.1)',
        fcId: 'Failure condition ID', fcDesc: 'Failure condition', phases: 'Flight phases',
        effAc: 'Effect on the aircraft', effCrew: 'Effect on the crew', effPax: 'Effect on passengers',
        severity: 'Severity', assumptionIds: 'Assumptions', comments: 'Comments', acTrace: 'Traces to aircraft FC',
        reqId: 'Requirement ID', traceId: 'Traces to (function ID)', level: 'Level', type: 'Type',
        text: 'Text', rat: 'Rationale', asmId: 'Assumption ID', origin: 'Origin', state: 'State',
        awareness: 'Crew awareness', pivotTL: 'Total loss', pivotPL: 'Partial loss', pivotM: 'Malfunction',
        tlId: 'Total loss ID', tlDesc: 'Total loss description', plId: 'Partial loss ID', plDesc: 'Partial loss description',
        mId: 'Malfunction ID', mDesc: 'Malfunction description',
        praId: 'PRA ID', threat: 'Threat', desc: 'Description', systems: 'Systems', csfl: 'CSFL impact',
        affectedZones: 'Affected zones', mitigation: 'Mitigation', zoneId: 'Zone ID', equip: 'Installed equipment',
        interference: 'Interference', housedFunctions: 'Housed functions', assessedBy: 'Assessed by',
        assessMethod: 'Assessment method', assessedOn: 'Assessed on', findingStatus: 'Finding status',
        cmaId: 'CMA ID', subject: 'Subject', claim: 'Claim', findings: 'Findings', status: 'Status',
        fmeaId: 'FMEA ID', component: 'Component', failureMode: 'Failure mode', cause: 'Cause', effect: 'Effect',
        occurrence: 'Occurrence', detection: 'Detection'
    };
    function _fieldLabel(field, sheet) {
        if (sheet && sheet.kind === 'acFunc' && Object.values(sheet.columnMap || {}).indexOf('outline') >= 0) {
            if (field === 'funcName') return 'Name (every level)';
            if (field === 'funcDef') return 'Description (every level)';
        }
        return FIELD_LABELS[field] || field;
    }
    function _kindLabel(kind) {
        const o = TAB_OPTIONS.find(x => x.kind === kind);
        return o ? o.label : kind;
    }

    function renderDialog(plan) {
        const host = document.getElementById('xlsx-import-sheets');
        if (!host) return;

        // Summary pills
        const auto = plan.sheets.filter(s => s.kind !== 'ignore').length;
        const skip = plan.sheets.length - auto;
        const totalRows = plan.sheets.reduce((n, s) => s.kind !== 'ignore' ? n + s.rowCount : n, 0);
        const sumHost = document.getElementById('xlsx-import-summary');
        if (sumHost) {
            const ctx = plan.sysContext
                ? '<span class="xlsx-summary-pill" style="background: rgba(2,132,199,0.12); border-color: rgba(2,132,199,0.3); color: #0369a1;">📁 System: <strong>' + esc(plan.sysContext.name) + '</strong> — ambiguous sheets routed to Sys scope</span>'
                : '<span class="xlsx-summary-pill">📁 Aircraft scope (no system folder open)</span>';
            sumHost.innerHTML =
                '<span class="xlsx-summary-pill">📄 <strong>' + plan.sheets.length + '</strong> sheets</span>' +
                '<span class="xlsx-summary-pill">✅ <strong>' + auto + '</strong> auto-routed</span>' +
                '<span class="xlsx-summary-pill">⊘ <strong>' + skip + '</strong> skipped</span>' +
                '<span class="xlsx-summary-pill">≈ <strong>' + totalRows + '</strong> rows to import</span>' +
                ctx;
        }

        let html = '';
        plan.sheets.forEach((sheet, idx) => {
            const ignored = sheet.kind === 'ignore';
            const tag = ignored
                ? '<span class="xlsx-status-tag skip">Skip</span>'
                : (sheet.autoRouted ? '<span class="xlsx-status-tag auto">Auto-routed</span>'
                                    : '<span class="xlsx-status-tag manual">Manual</span>');
            const selOpts = TAB_OPTIONS.map(o =>
                '<option value="' + o.kind + '"' + (o.kind === sheet.kind ? ' selected' : '') + '>' + esc(o.label) + '</option>'
            ).join('');
            html += '<div class="xlsx-sheet-card' + (ignored ? ' ignored' : '') + '" data-sheet-idx="' + idx + '">';
            html +=   '<div class="xlsx-sheet-head" onclick="ExcelImport.toggleSheet(' + idx + ')">';
            html +=     '<div>';
            html +=       '<div class="xlsx-sheet-name">' + esc(sheet.name) + ' ' + tag + '</div>';
            html +=       '<div class="xlsx-sheet-meta">' + sheet.rowCount + ' data rows · header row #' + (sheet.headerRow + 1) + ' · ' + sheet.headers.filter(Boolean).length + ' columns</div>';
            html +=     '</div>';
            html +=     '<div class="xlsx-sheet-target" onclick="event.stopPropagation();">';
            html +=       '<select onchange="ExcelImport.changeSheetKind(' + idx + ', this.value)">' + selOpts + '</select>';
            html +=     '</div>';
            html +=     '<div class="xlsx-sheet-arrow">▾</div>';
            html +=   '</div>';
            html +=   '<div class="xlsx-sheet-body">';
            html +=     _renderColumnTable(sheet, idx);
            html +=   '</div>';
            html += '</div>';
        });
        host.innerHTML = html;
    }

    function _renderColumnTable(sheet, sheetIdx) {
        if (sheet.kind === 'ignore') {
            return '<div style="font-size:12px; color: var(--color-text-tertiary); padding: 4px 0;">This sheet will not be imported. Pick a target tab above to enable column mapping.</div>';
        }
        const fieldOpts = Object.keys(FIELD_ALIASES[sheet.kind] || {});
        const headers = sheet.headers.filter(Boolean);
        if (headers.length === 0) {
            return '<div style="font-size:12px; color: var(--color-text-tertiary);">No detectable columns in this sheet.</div>';
        }
        let html = '';
        if (sheet.kind === 'acFunc' && sheet.outline) {
            const o = sheet.outline;
            html += '<div style="font-size:12px; margin: 2px 0 8px; padding: 8px 10px; border: 1px solid var(--color-border-hair); background: var(--color-surface-2);">' +
                '<b>Levels from the numbering.</b> The "' + esc(o.column) + '" column sets each row\'s level and parent: ' +
                o.functions + ' function' + (o.functions === 1 ? '' : 's') + ' and ' + o.below + ' below ' + (o.functions === 1 ? 'it' : 'them') + ', ' + o.levels + ' level' + (o.levels === 1 ? '' : 's') + ' deep. ' +
                'Rows already in the tool with the same number are updated, not added twice.' +
                ((typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit && SLFuncTree.levelLimit() && o.levels > SLFuncTree.levelLimit())
                    ? ' <b style="color:var(--color-warning);">Numbers below level ' + SLFuncTree.levelLimit() + ' will not be imported: ' + esc(SLFuncTree.limitText(SLFuncTree.levelLimit())) + '</b>' : '') + '</div>';
        }
        html += '<table class="xlsx-col-table">';
        html += '<thead><tr><th>Excel column</th><th style="width:34%;">→ Tool field</th><th>Sample value</th></tr></thead><tbody>';
        headers.forEach(h => {
            const mapped = sheet.columnMap[h] || '';
            const sample = sheet.rows.length ? String(sheet.rows[0][h] == null ? '' : sheet.rows[0][h]).slice(0, 80) : '';
            const opts = '<option value="">— ignore —</option>' +
                fieldOpts.map(f => '<option value="' + f + '"' + (f === mapped ? ' selected' : '') + '>' + esc(_fieldLabel(f, sheet)) + '</option>').join('');
            html += '<tr>';
            html += '<td><strong>' + esc(h) + '</strong></td>';
            html += '<td><select onchange="ExcelImport.changeColumnMap(' + sheetIdx + ', \'' + esc(h).replace(/'/g, "\\'") + '\', this.value)">' + opts + '</select></td>';
            html += '<td class="xlsx-col-preview" title="' + esc(sample) + '">' + esc(sample) + '</td>';
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function showDialog() {
        const m = document.getElementById('xlsx-import-modal');
        if (m) m.classList.add('show');
    }

    // --------------------------------------------------------------------
    // Executor — mutate data arrays
    // --------------------------------------------------------------------
    function _newId(prefix) {
        return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function _pickRow(sheet, row) {
        // Translate raw row dict → field-keyed object using columnMap.
        const out = {};
        for (const [hdr, field] of Object.entries(sheet.columnMap)) {
            if (!field) continue;
            out[field] = row[hdr];
        }
        return out;
    }

    // ----- Hierarchical fill-down (Excel "merged-cell" convention) -----
    // When a row leaves the parent column blank, inherit the last non-blank
    // value seen. Standard convention in aerospace FHA / function-decomp
    // workbooks where the parent function ID is written once and the rows
    // below are sub-rows under it. Per-kind list of parent fields:
    const PARENT_FIELDS_BY_KIND = {
        acFunc:  ['funcId', 'funcName', 'funcDef'],   // function → sub-function rows
        sysFunc: [],                                   // single-level
        acFcim:  ['subId', 'awareness'],   // sub-function row may span multiple data rows
        sysFcim: ['subId', 'awareness'],
        acFha:   ['subId'],                           // sub-function → hazards
        sysFha:  ['subId'],
        acReq:   ['traceId'],                         // function → requirements
        sysReq:  ['traceId'],
        fmea:    ['component']                        // component → multiple modes
    };

    function _isBlank(v) {
        return v == null || String(v).trim() === '';
    }

    function _importInto(sheet, report) {
        const kind = sheet.kind;
        if (kind === 'acFunc' && Object.values(sheet.columnMap).indexOf('outline') >= 0) return _importFunctionOutline(sheet, report || { warnings: [], errors: [] });
        const parentFields = PARENT_FIELDS_BY_KIND[kind] || [];
        const lastSeen = {};   // field → last non-blank value seen this sheet
        let count = 0;
        for (const raw of sheet.rows) {
            const r = _pickRow(sheet, raw);
            // Skip totally blank mapped rows.
            if (Object.values(r).every(_isBlank)) continue;

            // Fill-down parent fields. Update lastSeen whenever a row provides
            // a non-blank value; otherwise inherit from the cache.
            for (const f of parentFields) {
                if (!_isBlank(r[f])) {
                    lastSeen[f] = r[f];
                } else if (lastSeen[f] != null) {
                    r[f] = lastSeen[f];
                }
            }

            if (kind === 'acFha' || kind === 'sysFha') {
                // Pull the assumption column into assumptionIds[]. Two paths:
                //   1. ASM-N / SA-N tokens — treat as references to existing records.
                //   2. Anything else non-empty — treat as a free-text assumption
                //      STATEMENT, mint a new ASM record on the fly (matching the
                //      behavior of the FHA form's inline add-new-assumption box),
                //      and link the new ID to this FHA row.
                // Placeholder values (None / N/A / TBD / —) are skipped.
                const asmIds = [];
                const residualComments = String(r.comments || '').trim();
                const PLACEHOLDER = /^(none|n\/?a|tbd|tba|-+|—|null)$/i;

                if (r.assumptionIds != null) {
                    const raw = String(r.assumptionIds).trim();
                    if (raw && !PLACEHOLDER.test(raw)) {
                        // Split ONLY on strong delimiters — commas and slashes show
                        // up inside legitimate assumption statements.
                        const tokens = raw.split(/[;|\n\r]+/).map(s => s.trim()).filter(Boolean);
                        // Which assumption store this row writes into.
                        const asmStore = (kind === 'acFha') ? acAssumptionsData : (sys() ? sys().asm : null);
                        if (asmStore) {
                            for (const token of tokens) {
                                if (PLACEHOLDER.test(token)) continue;
                                if (/^(ASM|SA)[-_.][\w-]+$/i.test(token)) {
                                    asmIds.push(token);
                                    continue;
                                }
                                // Free-text — reuse existing record if the statement
                                // already matches one (case-insensitive), else mint a new one.
                                const existing = asmStore.find(a =>
                                    a && a.text && a.text.trim().toLowerCase() === token.toLowerCase()
                                );
                                if (existing) {
                                    asmIds.push(existing.asmId);
                                } else {
                                    let counter, newId;
                                    if (kind === 'acFha') {
                                        counter = acAsmCounter || 1;
                                        newId = 'ASM-' + counter;
                                        acAsmCounter = counter + 1;
                                    } else {
                                        counter = (sys().asmCounter || 1);
                                        newId = 'ASM-' + counter;
                                        sys().asmCounter = counter + 1;
                                    }
                                    asmStore.push({
                                        asmId: newId,
                                        origin: 'Imported · ' + sheet.name,
                                        text: token,
                                        state: 'Proposed',
                                        valStrategy: '', valArtifact: '', verArtifact: ''
                                    });
                                    asmIds.push(newId);
                                }
                            }
                        }
                    }
                }
                // Combined-effects splitter: workbooks frequently stuff "Effect on
                // aircraft / crew / passengers" into a single cell. If effCrew + effPax
                // weren't separately mapped, parse the labels out of effAc and route
                // them to the right fields.
                let effAc   = String(r.effAc   || '').trim();
                let effCrew = String(r.effCrew || '').trim();
                let effPax  = String(r.effPax  || '').trim();
                if (!effCrew && !effPax && effAc) {
                    const split = splitCombinedEffects(effAc);
                    if (split) {
                        if (split.ac)   effAc   = split.ac;
                        if (split.crew) effCrew = split.crew;
                        if (split.pax)  effPax  = split.pax;
                    }
                }

                const rec = {
                    internalId: newRowId(),
                    subId: String(r.subId || '').trim(),
                    fcId: String(r.fcId || '').trim() || _newId('FC'),
                    fcDesc: String(r.fcDesc || '').trim(),
                    phases: String(r.phases || '').trim(),
                    effAc: effAc,
                    effCrew: effCrew,
                    effPax: effPax,
                    severity: normSeverity(r.severity),
                    assumptionIds: asmIds,
                    comments: residualComments
                };
                if (kind === 'sysFha' && r.acTrace) rec.acTraces = splitMulti(r.acTrace);
                if (kind === 'acFha') acFhaData.push(rec);
                else if (sys()) sys().fha.push(rec);
                count++;
            } else if (kind === 'acReq' || kind === 'sysReq') {
                const rec = {
                    internalId: newRowId(),
                    reqId: String(r.reqId || '').trim() || _newId('R'),
                    traceId: String(r.traceId || '').trim(),
                    level: String(r.level || 'L3').trim(),
                    type: String(r.type || 'Functional').trim(),
                    text: String(r.text || '').trim(),
                    rat: String(r.rat || '').trim()
                };
                if (kind === 'acReq') acReqData.push(rec);
                else if (sys()) sys().req.push(rec);
                count++;
            } else if (kind === 'acAsm' || kind === 'sysAsm') {
                const rec = {
                    asmId: String(r.asmId || '').trim() || _newId('ASM'),
                    origin: String(r.origin || 'Imported').trim(),
                    text: String(r.text || '').trim(),
                    state: normAsmState(r.state),
                    valStrategy: '', valArtifact: '', verArtifact: ''
                };
                if (kind === 'acAsm') acAssumptionsData.push(rec);
                else if (sys()) sys().asm.push(rec);
                count++;
            } else if (kind === 'acFunc' || kind === 'sysFunc') {
                const rec = {
                    internalId: newRowId(),
                    funcId: String(r.funcId || '').trim() || _newId('F'),
                    funcName: String(r.funcName || '').trim(),
                    funcDef: String(r.funcDef || '').trim()
                };
                if (kind === 'acFunc') {
                    rec.subId = String(r.subId || '').trim();
                    rec.subName = String(r.subName || '').trim();
                    rec.subDef = String(r.subDef || '').trim();
                    const _par = String(r.parentSubId || '').trim();
                    if (_par && _par !== rec.subId) rec.parentSubId = _par;
                    // 22 Oct 2026: a line that fills the Sub-Sub-Function columns (the 3-level export) is the
                    // sub-sub-function, under the sub-function in the same line.
                    const _ss = String(r.subSubId || '').trim(), _ssn = String(r.subSubName || '').trim();
                    if (_ss || _ssn) {
                        rec.parentSubId = rec.subId;
                        rec.subId = _ss; rec.subName = _ssn; rec.subDef = String(r.subSubDef || '').trim();
                        if (!rec.parentSubId || rec.parentSubId === rec.subId) delete rec.parentSubId;
                    }
                    acFunctionsData.push(rec);
                } else if (sys()) sys().functions.push(rec);
                count++;
            } else if (kind === 'pra') {
                praData.push({
                    internalId: newRowId(),
                    praId: String(r.praId || '').trim() || _newId('PRA'),
                    threat: String(r.threat || '').trim(),
                    desc: String(r.desc || '').trim(),
                    systems: String(r.systems || '').trim(),
                    csfl: String(r.csfl || '').trim(),
                    affectedZones: splitMulti(r.affectedZones),
                    mitigation: String(r.mitigation || '').trim()
                });
                count++;
            } else if (kind === 'zsa') {
                const _zr = (typeof SLZsaRecord !== 'undefined') ? SLZsaRecord : null;
                zsaData.push({
                    internalId: newRowId(),
                    zoneId: String(r.zoneId || '').trim() || _newId('ZSA'),
                    desc: String(r.desc || '').trim(),
                    equip: String(r.equip || '').trim(),
                    severity: String(r.severity || '').trim(),
                    interference: String(r.interference || '').trim(),
                    housedFunctions: splitMulti(r.housedFunctions),
                    mitigation: String(r.mitigation || '').trim(),
                    assessedBy: String(r.assessedBy || '').trim(),
                    assessMethod: _zr ? _zr.methodFrom(r.assessMethod) : '',
                    assessedOn: String(r.assessedOn || '').trim(),
                    findingStatus: (_zr ? _zr.statusFrom(r.findingStatus) : '') || 'open'
                });
                count++;
            } else if (kind === 'cma') {
                cmaData.push({
                    internalId: newRowId(),
                    cmaId: String(r.cmaId || '').trim() || _newId('CMA'),
                    subject: String(r.subject || '').trim(),
                    claim: String(r.claim || '').trim(),
                    findings: String(r.findings || '').trim(),
                    mitigation: String(r.mitigation || '').trim(),
                    status: String(r.status || 'Open').trim()
                });
                count++;
            } else if (kind === 'fmea') {
                // Phase 68 — FMEA is per-system & item-level only. Tag the import to the open
                // System Folder and map legacy columns (component/failureMode/effect/cause) onto
                // the current shape so imported rows render and survive the load-time prune.
                fmeaData.push({
                    internalId: newRowId(),
                    fmeaId: String(r.fmeaId || '').trim() || ('F-' + (fmeaCounter++)),
                    fmeaType: 'piece-part', scope: 'system', owningSystemId: activeSystemId || '',
                    part: String(r.part || r.component || '').trim(),
                    mode: String(r.mode || r.failureMode || '').trim(),
                    localEffect: String(r.localEffect || r.effect || '').trim(),
                    nextEffect: String(r.nextEffect || '').trim(),
                    endEffect: String(r.endEffect || '').trim(),
                    severity: normSeverity(r.severity),
                    detection: String(r.detection || '').trim(),
                    remarks: String(r.remarks || r.cause || r.occurrence || '').trim()
                });
                count++;
            } else if (kind === 'acFcim' || kind === 'sysFcim') {
                // FCIM record shape (matches the existing renderer + form):
                //   { internalId, subId, awareness, tlId, tlDesc, plId, plDesc, mId, mDesc }
                // One imported row → one FCIM record. Pivot cells like "1.1.TL.A Total
                // Loss of Pitch Control" split into id + description.
                function _splitFc(cell) {
                    if (_isBlank(cell)) return { id: '', desc: '' };
                    const s = String(cell).trim();
                    const m = s.match(/^([A-Za-z0-9._-]+)\s+([\s\S]+)$/);
                    if (m) return { id: m[1], desc: m[2].trim() };
                    return { id: '', desc: s };
                }
                // Use the columnMap to find which header (if any) maps to each pivot slot.
                const tlCol = Object.entries(sheet.columnMap).find(([, f]) => f === 'pivotTL');
                const plCol = Object.entries(sheet.columnMap).find(([, f]) => f === 'pivotPL');
                const mCol  = Object.entries(sheet.columnMap).find(([, f]) => f === 'pivotM');
                const tl = tlCol ? _splitFc(raw[tlCol[0]]) : { id: String(r.tlId || '').trim(), desc: String(r.tlDesc || '').trim() };
                const pl = plCol ? _splitFc(raw[plCol[0]]) : { id: String(r.plId || '').trim(), desc: String(r.plDesc || '').trim() };
                const mm = mCol  ? _splitFc(raw[mCol[0]])  : { id: String(r.mId  || '').trim(), desc: String(r.mDesc  || '').trim() };

                // Skip rows that produced no FC content at all (would just be sub-function noise).
                if (!tl.id && !tl.desc && !pl.id && !pl.desc && !mm.id && !mm.desc) continue;

                const rec = {
                    internalId: newRowId(),
                    subId: String(r.subId || '').trim(),
                    awareness: String(r.awareness || '').trim(),
                    tlId: tl.id, tlDesc: tl.desc,
                    plId: pl.id, plDesc: pl.desc,
                    mId:  mm.id, mDesc:  mm.desc
                };
                // 26 Oct 2026: a cell exported as "N/A: <reason>" comes back not applicable, with its reason; it is
                // not a failure condition, so it carries no FC ID and is not extracted below.
                if (typeof _fcimImportCells === 'function') _fcimImportCells(rec);
                if (kind === 'acFcim') acFcimData.push(rec);
                else if (sys()) sys().fcim.push(rec);
                // Phase 53.42 — mirror what {ac,sys}FcimCRUD.afterChange does so the FHA tab's
                // FC-ID dropdown can find these IDs. The sysFcim branch was missing before,
                // which made imported sys-FCIM IDs invisible to the SFHA edit form.
                // "N/A" marks an inapplicable crew-UNAWARE case, not an absent failure
                // condition — so imported N/A rows trace forward like any other.
                // Corrected 1 Aug 2026 alongside _pushExtractedFCs, which this mirrors.
                if (kind === 'acFcim') {
                    if (rec.tlId) acExtractedFCs.push({ id: rec.tlId, desc: rec.tlDesc });
                    if (rec.plId) acExtractedFCs.push({ id: rec.plId, desc: rec.plDesc });
                    if (rec.mId) acExtractedFCs.push({ id: rec.mId, desc: rec.mDesc });
                } else if (kind === 'sysFcim' && sys()) {
                    const s = sys();
                    if (!Array.isArray(s.extractedFCs)) s.extractedFCs = [];
                    if (rec.tlId) s.extractedFCs.push({ id: rec.tlId, desc: rec.tlDesc });
                    if (rec.plId) s.extractedFCs.push({ id: rec.plId, desc: rec.plDesc });
                    if (rec.mId) s.extractedFCs.push({ id: rec.mId, desc: rec.mDesc });
                }
                count++;
            }
        }
        return count;
    }

    // ---- functions from ONE column, levels from the numbering (21 Oct 2026) ----------
    // Each row: a number (1, 1.1, 1.1.1 ...), a name and a description. Depth 1 is an aircraft
    // function (funcId = its number). Every deeper row is a sub-function row of that function
    // (subId = its number), under the row whose number it extends (parentSubId), to any depth.
    // A function with nothing under it gets its function-only row, as always.
    // Importing the same sheet again UPDATES the rows it made (matched by function and number),
    // so a corrected spreadsheet can be re-imported without duplicates.
    // Refused, with nothing written, when a number appears twice: Excel stores 1.10 as the number
    // 1.1, so two rows reading "1.1" means the numbering column lost information and any tree
    // built from it would be wrong.
    function _importFunctionOutline(sheet, report) {
        let rows = [];
        const bad = [];
        sheet.rows.forEach(function (raw, i) {
            const r = _pickRow(sheet, raw);
            const p = _outlineParts(r.outline);
            const name = String(r.funcName || r.subName || '').trim();
            const def = String(r.funcDef || r.subDef || '').trim();
            if (!p) { if (name || def || !_isBlank(r.outline)) bad.push(sheet.headerRow + 2 + i); return; }
            rows.push({ p: p, name: name, def: def });
        });
        const seen = {}, dups = [];
        rows.forEach(function (x) { if (seen[x.p.key]) dups.push(x.p.key); seen[x.p.key] = x; });
        if (dups.length) {
            report.errors.push('"' + sheet.name + '" was not imported: the number' + (dups.length > 1 ? 's ' : ' ') + Array.from(new Set(dups)).slice(0, 5).join(', ') +
                (dups.length > 1 ? ' appear' : ' appears') + ' more than once. Excel turns 1.10 into 1.1 when the column is a number column. Format the numbering column as Text in Excel, retype those numbers, and import again.');
            return 0;
        }
        if (bad.length) report.warnings.push('"' + sheet.name + '": ' + bad.length + ' row' + (bad.length > 1 ? 's have' : ' has') + ' no number Safety Lab can read and ' + (bad.length > 1 ? 'were' : 'was') + ' skipped (spreadsheet row' + (bad.length > 1 ? 's ' : ' ') + bad.slice(0, 8).join(', ') + (bad.length > 8 ? ', ...' : '') + ').');
        // 22 Oct 2026: the project's level limit (the 3-level layout). Numbers deeper than it are not
        // imported, and the note names them. 1 is level 1, 1.1 level 2, 1.1.1 level 3.
        const lim = (typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit) ? SLFuncTree.levelLimit() : 0;
        if (lim) {
            const deep = rows.filter(function (x) { return x.p.depth > lim; });
            if (deep.length) {
                report.warnings.push('"' + sheet.name + '": ' + SLFuncTree.refusedText(deep.map(function (x) { return x.p.key; })));
                rows = rows.filter(function (x) { return x.p.depth <= lim; });
            }
        }
        const byKey = seen;
        const missingParents = new Set();
        function ancestorOf(p) {             // the nearest row above this one that exists
            let k = _outlineParentKey(p), q = p;
            while (k) {
                if (byKey[k]) return byKey[k];
                missingParents.add(k);
                q = _outlineParts(k); k = q ? _outlineParentKey(q) : '';
            }
            return null;
        }
        const topKeyOf = p => p.prefix + p.segs[0];
        const hasKids = {};
        rows.forEach(function (x) { if (x.p.depth > 1) hasKids[topKeyOf(x.p)] = true; });
        const store = acFunctionsData;
        const fnInfo = {};
        rows.forEach(function (x) { if (x.p.depth === 1) fnInfo[x.p.key] = { funcName: x.name, funcDef: x.def }; });
        let added = 0, updated = 0;
        rows.forEach(function (x) {
            const top = topKeyOf(x.p);
            if (!fnInfo[top]) { fnInfo[top] = { funcName: top, funcDef: '' }; missingParents.add(top); }
            const f = fnInfo[top];
            if (x.p.depth === 1) {
                // keep every row of this function in step with its name and description
                store.forEach(function (r) { if (r && String(r.funcId) === top) { r.funcName = f.funcName; r.funcDef = f.funcDef; } });
                if (hasKids[top]) return;
                const only = store.find(r => r && String(r.funcId) === top && !String(r.subId || '').trim());
                if (only) { updated++; return; }
                store.push({ internalId: newRowId(), funcId: top, funcName: f.funcName, funcDef: f.funcDef, subId: '', subName: '', subDef: '' });
                added++;
                return;
            }
            const up = ancestorOf(x.p);
            const parentSubId = up && up.p.depth > 1 ? up.p.key : '';
            const ex = store.find(r => r && String(r.funcId) === top && String(r.subId || '').trim() === x.p.key);
            if (ex) {
                ex.funcName = f.funcName; ex.funcDef = f.funcDef; ex.subName = x.name; ex.subDef = x.def;
                if (parentSubId) ex.parentSubId = parentSubId; else delete ex.parentSubId;
                updated++;
            } else {
                const rec = { internalId: newRowId(), funcId: top, funcName: f.funcName, funcDef: f.funcDef, subId: x.p.key, subName: x.name, subDef: x.def };
                if (parentSubId) rec.parentSubId = parentSubId;
                store.push(rec);
                added++;
            }
        });
        if (missingParents.size) {
            const list = Array.from(missingParents).sort();
            report.warnings.push('"' + sheet.name + '": no row for ' + list.slice(0, 6).join(', ') + (list.length > 6 ? ' and ' + (list.length - 6) + ' more' : '') +
                '. The rows under ' + (list.length > 1 ? 'them were' : 'it was') + ' placed under the nearest number that does exist' + (list.some(k => !/\./.test(k)) ? ' (a missing top-level function was created with its number as its name)' : '') + '.');
        }
        report.counts = report.counts || {};
        report.counts[sheet.name] = { added: added, updated: updated };
        return added + updated;
    }

    function runImport() {
        if (!_currentPlan) return;
        const counts = {};
        let total = 0;

        // For sys-* kinds, require an active system.
        const needsSys = _currentPlan.sheets.some(s => s.kind && s.kind.indexOf('sys') === 0);
        if (needsSys && !sys()) {
            showToast('Open a system folder first — some sheets target system-scoped tabs.', 'warning', 4000);
            return;
        }

        const report = { warnings: [], errors: [] };
        const _fnBefore = new Set((typeof acFunctionsData !== 'undefined' && acFunctionsData) || []);
        for (const sheet of _currentPlan.sheets) {
            if (sheet.kind === 'ignore') continue;
            const n = _importInto(sheet, report);
            counts[sheet.kind] = (counts[sheet.kind] || 0) + n;
            total += n;
        }
        // 22 Oct 2026: a project with a level limit (the 3-level layout) takes back any imported
        // function row below it, and says which. Rows that were already there are not touched.
        try {
            if (typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit && SLFuncTree.levelLimit() && typeof acFunctionsData !== 'undefined') {
                const deep = SLFuncTree.dropTooDeep(acFunctionsData, r => !_fnBefore.has(r));
                if (deep.length) {
                    report.warnings.push(SLFuncTree.refusedText(deep));
                    if (counts.acFunc) { counts.acFunc = Math.max(0, counts.acFunc - deep.length); total = Math.max(0, total - deep.length); }
                }
            }
        } catch (_) {}

        // Optional: save mapping template.
        const saveChk = document.getElementById('xlsx-save-template');
        if (saveChk && saveChk.checked) {
            _saveTemplate(_currentPlan);
        }

        closeDialog();

        // Refresh everything visible.
        try { renderACFunctions && renderACFunctions(); } catch(_) {}
        try { renderACFCIM && renderACFCIM(); } catch(_) {}
        try { renderACFHA && renderACFHA(); } catch(_) {}
        try { window.renderACReq && window.renderACReq(); } catch(_) {}
        try { renderACAssumptions && renderACAssumptions(); } catch(_) {}
        try { renderSysFHA && renderSysFHA(); } catch(_) {}
        try { window.renderSysReq && window.renderSysReq(); } catch(_) {}
        try { renderSysAssumptions && renderSysAssumptions(); } catch(_) {}
        try { renderPRA && renderPRA(); } catch(_) {}
        try { renderZSA && renderZSA(); } catch(_) {}
        try { renderCMA && renderCMA(); } catch(_) {}
        try { renderFMEA && renderFMEA(); } catch(_) {}
        try { updateDashboard && updateDashboard(); } catch(_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}

        const breakdown = Object.entries(counts).map(([k, v]) => v + ' ' + _kindLabel(k)).join(' · ');
        showToast('Imported ' + total + ' rows from ' + _currentPlan.fileName + (breakdown ? ' (' + breakdown + ')' : ''), total ? 'success' : 'warning', 5000);
        if (report.errors.length || report.warnings.length) {
            try { slAlert(report.errors.concat(report.warnings).join('\n\n'), { title: report.errors.length ? 'Part of the import was refused' : 'Imported, with notes' }); } catch (_) {}
        }
        try { if (typeof acFuncPopulateParents === 'function') acFuncPopulateParents(); } catch (_) {}
        _currentPlan = null;
    }

    function closeDialog() {
        const m = document.getElementById('xlsx-import-modal');
        if (m) m.classList.remove('show');
    }

    // --------------------------------------------------------------------
    // Template persistence (Layer 3 polish)
    // --------------------------------------------------------------------
    const TEMPLATE_KEY = 'safetyLab.xlsxImportTemplates.v1';
    function _loadTemplates() {
        try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '{}') || {}; }
        catch (_) { return {}; }
    }
    function _saveTemplate(plan) {
        try {
            const tpl = _loadTemplates();
            tpl[plan.fingerprint] = {
                savedAt: Date.now(),
                sheets: plan.sheets.map(s => ({
                    name: s.name,
                    kind: s.kind,
                    columnMap: s.columnMap
                }))
            };
            localStorage.setItem(TEMPLATE_KEY, JSON.stringify(tpl));
        } catch (e) { console.warn('Template save failed:', e); }
    }
    function _applyTemplate(plan) {
        const tpl = _loadTemplates()[plan.fingerprint];
        if (!tpl) return false;
        for (const tplSheet of tpl.sheets) {
            const s = plan.sheets.find(x => x.name === tplSheet.name);
            if (!s) continue;
            s.kind = tplSheet.kind;
            const cm = {};
            Object.keys(tplSheet.columnMap || {}).forEach(h => { if (s.headers.indexOf(h) >= 0) cm[h] = tplSheet.columnMap[h]; });
            s.columnMap = cm;
            s.outline = _outlineSummary(s);
            s.autoRouted = false;   // template-driven, not auto
        }
        return true;
    }

    // --------------------------------------------------------------------
    // UI event handlers
    // --------------------------------------------------------------------
    function onFilePicked(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        event.target.value = '';   // reset so re-selecting the same file fires onchange
        showToast('Reading workbook…', 'info', 1800);
        parseFile(file).then(plan => {
            _currentPlan = plan;
            // Try template first.
            const usedTpl = _applyTemplate(plan);
            renderDialog(plan);
            showDialog();
            if (usedTpl) showToast('Mapping template auto-applied for this workbook layout.', 'info', 3000);
        }).catch(err => {
            console.error(err);
            showToast('Could not read Excel file: ' + err.message, 'error', 5000);
        });
    }

    function toggleSheet(idx) {
        const card = document.querySelector('[data-sheet-idx="' + idx + '"]');
        if (card) card.classList.toggle('expanded');
    }

    function changeSheetKind(idx, kind) {
        if (!_currentPlan) return;
        const sheet = _currentPlan.sheets[idx];
        if (!sheet) return;
        sheet.kind = kind;
        sheet.autoRouted = false;
        // Re-auto-match columns for the new kind (best effort).
        sheet.columnMap = kind !== 'ignore' ? detectColumnMap(kind, sheet.headers) : {};
        sheet.outline = _sniffOutline(sheet);
        renderDialog(_currentPlan);
        // Re-expand this card so the user sees the new mapping.
        const card = document.querySelector('[data-sheet-idx="' + idx + '"]');
        if (card) card.classList.add('expanded');
    }

    function changeColumnMap(sheetIdx, header, field) {
        if (!_currentPlan) return;
        const sheet = _currentPlan.sheets[sheetIdx];
        if (!sheet) return;
        // one column per field: choosing a field for this column takes it off any other column
        if (field) Object.keys(sheet.columnMap).forEach(h => { if (h !== header && sheet.columnMap[h] === field) delete sheet.columnMap[h]; });
        if (field) sheet.columnMap[header] = field;
        else delete sheet.columnMap[header];
        sheet.outline = sheet.kind === 'acFunc' ? _outlineSummary(sheet) : null;
        renderDialog(_currentPlan);
        const card = document.querySelector('[data-sheet-idx="' + sheetIdx + '"]');
        if (card) card.classList.add('expanded');
    }

    // --------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------
    return {
        onFilePicked, runImport, closeDialog,
        toggleSheet, changeSheetKind, changeColumnMap, setPreferredKind,
        // Exposed for testing
        _internals: {
            parseFile, normSeverity, normAsmState, splitMulti, normName,
            detectKindFromSheetName, detectFieldFromHeader, detectColumnMap, SHEET_ALIASES, FIELD_ALIASES,
            outlineParts: _outlineParts, looksLikeOutline: _looksLikeOutline, sniffOutline: _sniffOutline,
            importInto: function (sheet, report) { return _importInto(sheet, report); }, fieldLabel: _fieldLabel
        }
    };
})();
window.ExcelImport = ExcelImport;

// ============================================================================
// Phase 56.32a — SysML XMI file importer
// ============================================================================
// Parses an XMI 2.x file exported from Cameo / Capella / Papyrus / Modelio and
// extracts SysML Blocks (→ Items) and Activities / Operations (→ AC Functions).
// MVP scope: file-based import only, additive (does not dedup against existing
// records), preview modal lets the user untick anything before commit.
// Tested by importing real exports from Electra's MBSE tool of choice.
// ----------------------------------------------------------------------------
const SysMLImport = (function() {
    let _parsed = null;   // { blocks: [...], activities: [...], fileName }

    // Extract local name from a possibly-namespaced tag (e.g., "uml:Class" → "Class")
    function _localName(el) {
        if (!el || !el.tagName) return '';
        const t = el.tagName;
        const i = t.indexOf(':');
        return i >= 0 ? t.substring(i + 1) : t;
    }
    function _typeAttr(el) {
        // xmi:type or just type, depending on the exporter
        return (el.getAttribute('xmi:type') || el.getAttribute('type') || '').trim();
    }
    function _nameAttr(el) {
        return (el.getAttribute('name') || '').trim();
    }
    function _idAttr(el) {
        return (el.getAttribute('xmi:id') || el.getAttribute('id') || '').trim();
    }

    function onFilePicked(event) {
        const file = event && event.target && event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                _parseAndPreview(String(e.target.result || ''), file.name);
            } catch (err) {
                console.error('[SysMLImport] parse failed:', err);
                if (typeof showToast === 'function') showToast('Could not parse SysML file: ' + (err.message || err), 'error', 4500);
                else slAlert('Could not parse SysML file: ' + (err.message || err), { title: 'SysML import' });
            }
            // Reset input so the same file can be picked again next time.
            try { event.target.value = ''; } catch (_) {}
        };
        reader.onerror = function() {
            if (typeof showToast === 'function') showToast('Could not read file', 'error', 3000);
        };
        reader.readAsText(file);
    }

    function _parseAndPreview(text, fileName) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        const parseError = doc.getElementsByTagName('parsererror');
        if (parseError && parseError.length) {
            throw new Error('XMI file is not valid XML');
        }

        const blocks = [];
        const activities = [];
        const allEls = doc.getElementsByTagName('*');
        // Walk every element; filter by type. This is robust across exporters
        // because we don't rely on a specific root structure.
        for (let i = 0; i < allEls.length; i++) {
            const el = allEls[i];
            const tag = _localName(el);
            const ttype = _typeAttr(el);
            const name = _nameAttr(el);
            if (!name) continue;   // skip unnamed elements (anonymous parts / properties)

            // Blocks: stereotyped uml:Class. Most MBSE exporters write SysML
            // Blocks as <packagedElement xmi:type="uml:Class"> with a separate
            // <Block> stereotype tag. Including any named Class is permissive
            // but catches Cameo / Papyrus / Modelio reliably; the preview lets
            // the user untick anything they don't want.
            if (ttype === 'uml:Class' || (tag === 'Class' && !ttype)) {
                blocks.push({
                    selected: true,
                    xmiId: _idAttr(el),
                    name: name,
                    desc: _findDocumentation(el),
                });
                continue;
            }
            // Activities and Operations both map to functions in Safety Lab Aero.
            if (ttype === 'uml:Activity' || ttype === 'uml:Operation' || ttype === 'uml:Behavior'
                || (tag === 'Activity' && !ttype) || (tag === 'Operation' && !ttype)) {
                activities.push({
                    selected: true,
                    xmiId: _idAttr(el),
                    name: name,
                    desc: _findDocumentation(el),
                    kind: ttype || tag,
                });
            }
        }

        _parsed = { blocks, activities, fileName: fileName || 'model.xmi' };
        _renderPreview();
    }

    // Find a documentation/comment child if present. Cameo writes
    // <ownedComment><body>...</body></ownedComment>, Papyrus uses
    // <ownedComment body="..."/>.
    function _findDocumentation(el) {
        const comments = el.children || [];
        for (let i = 0; i < comments.length; i++) {
            const c = comments[i];
            if (_localName(c) !== 'ownedComment') continue;
            const bodyAttr = c.getAttribute('body');
            if (bodyAttr) return bodyAttr;
            const bodyEl = c.getElementsByTagName('body')[0];
            if (bodyEl && bodyEl.textContent) return bodyEl.textContent.trim();
        }
        return '';
    }

    function _renderPreview() {
        if (!_parsed) return;
        const id = 'sysml-import-modal';
        // Clean any prior modal.
        const prior = document.getElementById(id);
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);

        const scrim = document.createElement('div');
        scrim.id = id;
        scrim.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';

        const blocks = _parsed.blocks || [];
        const acts = _parsed.activities || [];
        const renderRows = (arr, kindLabel) => {
            if (!arr.length) return '<div style="padding:14px;color:var(--color-text-tertiary);font-style:italic;font-size:13px;">No ' + kindLabel + ' found in this file.</div>';
            return '<div style="max-height:260px;overflow:auto;border:1px solid var(--color-border-hair);border-radius:8px;">' +
                arr.map((r, i) =>
                    '<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid var(--color-border-hair);font-size:13px;cursor:pointer;">' +
                    '  <input type="checkbox" data-kind="' + kindLabel + '" data-i="' + i + '" ' + (r.selected ? 'checked' : '') + ' style="margin-top:2px;" onchange="SysMLImport._toggle(\'' + kindLabel + '\',' + i + ',this.checked)">' +
                    '  <div style="flex:1;min-width:0;">' +
                    '    <div style="font-weight:600;color:var(--color-text-primary);">' + esc(r.name) + '</div>' +
                    (r.desc ? '<div style="color:var(--color-text-secondary);font-size:12px;margin-top:2px;">' + esc(r.desc.slice(0, 180)) + (r.desc.length > 180 ? '…' : '') + '</div>' : '') +
                    '  </div>' +
                    '</label>'
                ).join('') +
                '</div>';
        };

        scrim.innerHTML = '<div style="background:var(--color-surface-1);color:var(--color-text-primary);border-radius:14px;padding:22px 26px;width:min(780px,94vw);max-height:88vh;overflow:auto;border:1px solid var(--color-border-hair);box-shadow:0 30px 80px rgba(0,0,0,0.5);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
            '  <h2 style="margin:0;font-size:18px;font-weight:700;">📐 Import SysML model</h2>' +
            '  <button onclick="SysMLImport.close()" style="background:transparent;border:none;color:var(--color-text-secondary);font-size:22px;cursor:pointer;">×</button>' +
            '</div>' +
            '<div style="font-size:12.5px;color:var(--color-text-secondary);margin-bottom:14px;">' + esc(_parsed.fileName) + ' — review and untick anything you don\'t want to import. Blocks become Items; Activities and Operations become AC Functions.</div>' +
            '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-tertiary);font-weight:600;margin:8px 0 4px;">Blocks → Items (' + blocks.length + ')</div>' +
            renderRows(blocks, 'blocks') +
            '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-tertiary);font-weight:600;margin:14px 0 4px;">Activities &amp; Operations → AC Functions (' + acts.length + ')</div>' +
            renderRows(acts, 'activities') +
            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;border-top:1px solid var(--color-border-hair);padding-top:14px;">' +
            '  <button onclick="SysMLImport.close()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">Cancel</button>' +
            '  <button onclick="SysMLImport.commit()" style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#007aff 0%,#af52de 100%);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Import selected</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(scrim);
    }

    function _toggle(kind, i, checked) {
        if (!_parsed) return;
        const arr = kind === 'blocks' ? _parsed.blocks : _parsed.activities;
        if (arr && arr[i]) arr[i].selected = !!checked;
    }

    function close() {
        const m = document.getElementById('sysml-import-modal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
        _parsed = null;
    }

    function commit() {
        if (!_parsed) return;
        const blocks = (_parsed.blocks || []).filter(b => b.selected);
        const acts   = (_parsed.activities || []).filter(a => a.selected);
        let itemsAdded = 0, funcsAdded = 0;

        blocks.forEach(b => {
            const itemId = 'ITM-SYS-' + ((itemsData || []).length + itemsAdded + 1).toString().padStart(3, '0');
            itemsData.push({
                internalId: (typeof newRowId === 'function' ? newRowId() : Date.now() + Math.random()),
                history: [],
                itemId: itemId,
                name: b.name,
                type: 'Subsystem',
                dal: '',
                daType: 'FDAL',
                owningSystemId: '',
                description: b.desc || ('Imported from SysML model: ' + (_parsed.fileName || '')),
                realizedByCSCI: '',
                realizedByHWCI: '',
                traceIds: [],
                comments: [],
                _xmiId: b.xmiId,
                _xmiSource: _parsed.fileName || ''
            });
            itemsAdded++;
        });

        acts.forEach(a => {
            const subId = 'FN-SYS-' + ((acFunctionsData || []).length + funcsAdded + 1).toString().padStart(3, '0');
            acFunctionsData.push({
                internalId: (typeof newRowId === 'function' ? newRowId() : Date.now() + Math.random()),
                funcId: '',
                funcName: '',
                funcDef: '',
                subId: subId,
                subName: a.name,
                subDef: a.desc || ('Imported from SysML model: ' + (_parsed.fileName || '')),
                _xmiId: a.xmiId,
                _xmiSource: _parsed.fileName || ''
            });
            funcsAdded++;
        });

        close();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
        // Refresh whatever tab is open so the new records show up.
        try { if (typeof renderItems === 'function') renderItems(); } catch (_) {}
        try { if (typeof renderAcFunctions === 'function') renderAcFunctions(); } catch (_) {}
        try { if (typeof updateDashboard === 'function') updateDashboard(); } catch (_) {}

        const msg = 'Imported ' + itemsAdded + ' item' + (itemsAdded === 1 ? '' : 's') + ' and ' + funcsAdded + ' function' + (funcsAdded === 1 ? '' : 's') + ' from SysML.';
        if (typeof showToast === 'function') showToast(msg, 'success', 3500);
    }

    return { onFilePicked, _toggle, close, commit };
})();
window.SysMLImport = SysMLImport;

// ============================================================================
// Phase 56.32b — Jama Connect REST integration
// ============================================================================
// Pulls requirements from a Jama Connect tenant and maps them into Safety Lab Aero
// acReqData with the original Jama IDs preserved as external traceability.
// MVP scope: basic auth, single-project + single-item-type import per session.
// CORS: Jama Connect supports CORS configuration on the tenant side. If
// Electra's tenant doesn't allow safetylabaero.com as an origin, the fetch
// will fail with a clear error and we'll need to add a Worker proxy.
// ----------------------------------------------------------------------------
const JamaConnect = (function() {
    const STORAGE_KEY = 'safetyLab.jama.config.v1';
    let _config = { baseUrl: '', username: '', password: '' };
    let _state = { projects: [], itemTypes: [], items: [], selectedProjectId: '', selectedItemTypeId: '' };

    function _loadConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) Object.assign(_config, JSON.parse(raw));
        } catch (_) {}
    }
    function _saveConfig() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_config)); } catch (_) {}
    }
    function _basicAuthHeader() {
        const t = (_config.username || '') + ':' + (_config.password || '');
        return 'Basic ' + btoa(t);
    }
    async function _apiGet(path) {
        const url = (_config.baseUrl || '').replace(/\/$/, '') + path;
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': _basicAuthHeader(), 'Accept': 'application/json' },
            mode: 'cors'
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error('Jama API ' + res.status + ': ' + (text.slice(0, 160) || res.statusText));
        }
        return res.json();
    }

    function openImportModal() {
        _loadConfig();
        _state = { projects: [], itemTypes: [], items: [], selectedProjectId: '', selectedItemTypeId: '' };
        _renderModal('config');
    }

    function _renderModal(step) {
        const id = 'jama-import-modal';
        const prior = document.getElementById(id);
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);

        const scrim = document.createElement('div');
        scrim.id = id;
        scrim.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';

        let inner = '';
        if (step === 'config') {
            inner = '<h2 style="margin:0 0 6px;font-size:18px;font-weight:700;">🔗 Connect to Jama</h2>' +
                '<div style="font-size:12.5px;color:var(--color-text-secondary);margin-bottom:14px;">Stored locally in your browser only. Never leaves this device.</div>' +
                '<label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-tertiary);margin-bottom:4px;">Base URL</label>' +
                '<input id="jc-base-url" type="text" value="' + esc(_config.baseUrl || '') + '" placeholder="https://electra.jamacloud.com" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;margin-bottom:10px;font-family:inherit;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '  <div>' +
                '    <label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-tertiary);margin-bottom:4px;">Username</label>' +
                '    <input id="jc-username" type="text" value="' + esc(_config.username || '') + '" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;font-family:inherit;">' +
                '  </div>' +
                '  <div>' +
                '    <label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-tertiary);margin-bottom:4px;">Password / API token</label>' +
                '    <input id="jc-password" type="password" value="' + esc(_config.password || '') + '" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;font-family:inherit;">' +
                '  </div>' +
                '</div>' +
                '<div id="jc-msg" style="margin-top:12px;font-size:12.5px;min-height:18px;"></div>' +
                '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;border-top:1px solid var(--color-border-hair);padding-top:14px;">' +
                '  <button onclick="JamaConnect.close()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">Cancel</button>' +
                '  <button onclick="JamaConnect.connect()" style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#007aff 0%,#af52de 100%);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Connect</button>' +
                '</div>';
        } else if (step === 'select') {
            const projOpts = (_state.projects || []).map(p => '<option value="' + p.id + '"' + (String(p.id) === String(_state.selectedProjectId) ? ' selected' : '') + '>' + esc(p.fields && p.fields.name || ('Project ' + p.id)) + '</option>').join('');
            const typeOpts = (_state.itemTypes || []).filter(t => t.id != null).map(t => '<option value="' + t.id + '"' + (String(t.id) === String(_state.selectedItemTypeId) ? ' selected' : '') + '>' + esc(t.display || t.typeKey || ('Type ' + t.id)) + '</option>').join('');
            inner = '<h2 style="margin:0 0 6px;font-size:18px;font-weight:700;">🔗 Import from Jama</h2>' +
                '<div style="font-size:12.5px;color:var(--color-text-secondary);margin-bottom:14px;">Pick the project + item type, then load requirements.</div>' +
                '<label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-tertiary);margin-bottom:4px;">Project</label>' +
                '<select id="jc-project" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;margin-bottom:10px;" onchange="JamaConnect._setProject(this.value)">' +
                '<option value="">— Select a project —</option>' + projOpts + '</select>' +
                '<label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-text-tertiary);margin-bottom:4px;">Item type</label>' +
                '<select id="jc-itemtype" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;margin-bottom:10px;" onchange="JamaConnect._setItemType(this.value)">' +
                '<option value="">— Select an item type —</option>' + typeOpts + '</select>' +
                '<div id="jc-msg" style="margin-top:8px;font-size:12.5px;min-height:18px;"></div>' +
                '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;border-top:1px solid var(--color-border-hair);padding-top:14px;">' +
                '  <button onclick="JamaConnect._renderStep(\'config\')" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">← Settings</button>' +
                '  <div style="display:flex;gap:8px;">' +
                '    <button onclick="JamaConnect.close()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">Cancel</button>' +
                '    <button onclick="JamaConnect.loadItems()" style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#007aff 0%,#af52de 100%);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Load requirements</button>' +
                '  </div>' +
                '</div>';
        } else if (step === 'review') {
            const items = _state.items || [];
            const rows = items.length === 0
                ? '<div style="padding:20px;text-align:center;color:var(--color-text-tertiary);font-style:italic;">No items returned for this project + item type.</div>'
                : '<div style="max-height:320px;overflow:auto;border:1px solid var(--color-border-hair);border-radius:8px;">' +
                  items.map((it, i) => {
                      const f = it.fields || {};
                      const docKey = it.documentKey || ('#' + it.id);
                      const name = f.name || '';
                      const desc = (f.description || '').replace(/<[^>]+>/g, '').slice(0, 220);
                      return '<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid var(--color-border-hair);font-size:13px;cursor:pointer;">' +
                          '  <input type="checkbox" data-i="' + i + '" ' + (it._selected ? 'checked' : '') + ' onchange="JamaConnect._toggleItem(' + i + ',this.checked)" style="margin-top:2px;">' +
                          '  <div style="flex:1;min-width:0;">' +
                          '    <div style="font-weight:600;color:var(--color-text-primary);font-family:var(--font-mono);font-size:12px;">' + esc(docKey) + '</div>' +
                          '    <div style="color:var(--color-text-primary);">' + esc(name) + '</div>' +
                          (desc ? '<div style="color:var(--color-text-secondary);font-size:12px;margin-top:2px;">' + esc(desc) + (desc.length >= 220 ? '…' : '') + '</div>' : '') +
                          '  </div>' +
                          '</label>';
                  }).join('') +
                  '</div>';
            inner = '<h2 style="margin:0 0 6px;font-size:18px;font-weight:700;">🔗 Review &amp; import</h2>' +
                '<div style="font-size:12.5px;color:var(--color-text-secondary);margin-bottom:14px;">' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' returned. Untick anything you want to skip.</div>' +
                rows +
                '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;border-top:1px solid var(--color-border-hair);padding-top:14px;">' +
                '  <button onclick="JamaConnect._renderStep(\'select\')" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">← Back</button>' +
                '  <div style="display:flex;gap:8px;">' +
                '    <button onclick="JamaConnect.close()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--color-border-hair);background:var(--color-surface-2);color:var(--color-text-primary);font-size:13px;cursor:pointer;">Cancel</button>' +
                '    <button onclick="JamaConnect.commit()" style="padding:8px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#007aff 0%,#af52de 100%);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Import selected</button>' +
                '  </div>' +
                '</div>';
        }

        scrim.innerHTML = '<div style="background:var(--color-surface-1);color:var(--color-text-primary);border-radius:14px;padding:22px 26px;width:min(720px,94vw);max-height:88vh;overflow:auto;border:1px solid var(--color-border-hair);box-shadow:0 30px 80px rgba(0,0,0,0.5);">' + inner + '</div>';
        document.body.appendChild(scrim);
    }

    function _renderStep(s) { _renderModal(s); }
    function _setMsg(text, kind) {
        const el = document.getElementById('jc-msg');
        if (!el) return;
        const color = kind === 'error' ? '#dc2626' : kind === 'success' ? '#15803d' : 'var(--color-text-secondary)';
        el.style.color = color;
        el.textContent = text;
    }
    function _setProject(id) { _state.selectedProjectId = id; }
    function _setItemType(id) { _state.selectedItemTypeId = id; }
    function _toggleItem(i, on) {
        if (!_state.items || !_state.items[i]) return;
        _state.items[i]._selected = !!on;
    }

    async function connect() {
        const baseEl = document.getElementById('jc-base-url');
        const userEl = document.getElementById('jc-username');
        const passEl = document.getElementById('jc-password');
        _config.baseUrl = (baseEl && baseEl.value || '').trim();
        _config.username = (userEl && userEl.value || '').trim();
        _config.password = (passEl && passEl.value || '');
        if (!_config.baseUrl || !_config.username || !_config.password) {
            _setMsg('Need base URL, username, and password / API token.', 'error');
            return;
        }
        _setMsg('Connecting…', 'info');
        try {
            const me = await _apiGet('/rest/v1/users/current');
            _saveConfig();
            _setMsg('Signed in as ' + ((me && me.data && (me.data.firstName + ' ' + me.data.lastName)) || _config.username) + '. Loading projects…', 'success');
            const projRes = await _apiGet('/rest/v1/projects?maxResults=50');
            _state.projects = (projRes && projRes.data) || [];
            const typeRes = await _apiGet('/rest/v1/itemtypes?maxResults=200');
            _state.itemTypes = (typeRes && typeRes.data) || [];
            _renderStep('select');
        } catch (err) {
            console.error('[JamaConnect] connect failed:', err);
            const msg = String(err && err.message || err);
            if (msg.indexOf('Failed to fetch') >= 0 || msg.indexOf('NetworkError') >= 0) {
                _setMsg('Could not reach Jama. If the tenant blocks browser CORS for safetylabaero.com, ask Electra IT to allow it (or we add a Worker proxy).', 'error');
            } else {
                _setMsg(msg, 'error');
            }
        }
    }

    async function loadItems() {
        if (!_state.selectedProjectId || !_state.selectedItemTypeId) {
            _setMsg('Pick a project and an item type first.', 'error');
            return;
        }
        _setMsg('Loading items…', 'info');
        try {
            // /rest/v1/items supports project + itemType + maxResults
            const res = await _apiGet('/rest/v1/items?project=' + encodeURIComponent(_state.selectedProjectId) +
                '&itemType=' + encodeURIComponent(_state.selectedItemTypeId) + '&maxResults=200');
            _state.items = ((res && res.data) || []).map(it => Object.assign({ _selected: true }, it));
            _renderStep('review');
        } catch (err) {
            console.error('[JamaConnect] loadItems failed:', err);
            _setMsg(String(err && err.message || err), 'error');
        }
    }

    function commit() {
        const items = (_state.items || []).filter(x => x._selected);
        if (!items.length) { close(); return; }
        let added = 0;
        items.forEach(it => {
            const f = it.fields || {};
            const docKey = it.documentKey || ('JAMA-' + it.id);
            const name = (f.name || '').toString();
            const desc = (f.description || '').replace(/<[^>]+>/g, '').trim();
            acReqData.push({
                internalId: (typeof newRowId === 'function' ? newRowId() : Date.now() + Math.random()),
                history: [],
                id: '',
                traceId: '',
                traceIds: [],
                level: 'High-level',
                type: 'Safety',
                text: name + (desc ? ' — ' + desc : ''),
                rationale: '',
                parent: '',
                children: [],
                comments: [],
                valStatus: 'Open',
                verStatus: 'Open',
                _jamaId: it.id,
                _jamaDocumentKey: docKey,
                _jamaProjectId: _state.selectedProjectId,
                _jamaImportedAt: new Date().toISOString()
            });
            added++;
        });
        close();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
        try { if (typeof renderAcReq === 'function') renderAcReq(); } catch (_) {}
        try { if (typeof renderRequirementsRepository === 'function') renderRequirementsRepository(); } catch (_) {}
        try { if (typeof updateDashboard === 'function') updateDashboard(); } catch (_) {}
        if (typeof showToast === 'function') showToast('Imported ' + added + ' requirement' + (added === 1 ? '' : 's') + ' from Jama.', 'success', 3500);
        // Bow-ties auto-complete their evidence from newly imported requirements
        // (barrier ↔ requirement auto-linking, incl. Jama document keys).
        try {
            if (typeof window.btAutoLinkAll === 'function') {
                const n = window.btAutoLinkAll();
                if (n && typeof showToast === 'function') showToast('Bow-tie barriers auto-linked to ' + n + ' imported requirement' + (n === 1 ? '' : 's') + '.', 'info', 3500);
            }
        } catch (_) {}
    }

    function close() {
        const m = document.getElementById('jama-import-modal');
        if (m && m.parentNode) m.parentNode.removeChild(m);
        _state = { projects: [], itemTypes: [], items: [], selectedProjectId: '', selectedItemTypeId: '' };
    }

    // ---- public API — used by the bow-tie enrichment and the live bridge
    // (jama_bridge.js). Saved config, no modal.
    function isConfigured() { _loadConfig(); return !!(_config.baseUrl && _config.username && _config.password); }
    function _requireConfig() { _loadConfig(); if (!isConfigured()) throw new Error('Jama is not connected — open Import from Jama and connect first.'); }
    async function searchItems(query, max) {
        _requireConfig();
        const res = await _apiGet('/rest/v1/abstractitems?contains=' + encodeURIComponent(String(query || '')) + '&maxResults=' + Math.min(50, max || 20));
        return (res && res.data) || [];
    }
    async function _apiPost(path, body) {
        _requireConfig();
        const url = (_config.baseUrl || '').replace(/\/$/, '') + path;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': _basicAuthHeader(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify(body)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('Jama API ' + res.status + ': ' + (JSON.stringify(json).slice(0, 200) || res.statusText));
        return json;
    }
    async function getProjects() { _requireConfig(); const r = await _apiGet('/rest/v1/projects?maxResults=50'); return (r && r.data) || []; }
    async function getItemTypes() { _requireConfig(); const r = await _apiGet('/rest/v1/itemtypes?maxResults=50'); return (r && r.data) || []; }
    // Create an item. parentItemId (a set/folder) is strongly recommended — many
    // Jama instances refuse item creation at project root.
    async function createItem(projectId, itemTypeId, name, description, parentItemId) {
        const body = {
            project: Number(projectId), itemType: Number(itemTypeId),
            location: { parent: parentItemId ? { item: Number(parentItemId) } : { project: Number(projectId) } },
            fields: { name: String(name || '').slice(0, 254), description: String(description || '') }
        };
        const r = await _apiPost('/rest/v1/items', body);
        return (r && r.meta && (r.meta.id != null ? r.meta.id : (r.meta.location || '').split('/').pop())) || null;
    }
    // Everything the program traced to this item, both directions — the tier-3 graph.
    async function getRelated(itemId) {
        _requireConfig();
        const out = [];
        for (const dir of ['upstreamrelated', 'downstreamrelated']) {
            try { const r = await _apiGet('/rest/v1/items/' + Number(itemId) + '/' + dir + '?maxResults=50'); ((r && r.data) || []).forEach(x => x && out.push(x)); } catch (_) {}
        }
        return out;
    }
    async function getItem(itemId) { _requireConfig(); const r = await _apiGet('/rest/v1/items/' + Number(itemId)); return (r && r.data) || null; }

    function getBaseUrl() { _loadConfig(); return (_config.baseUrl || '').replace(/\/$/, ''); }

    return { openImportModal, connect, loadItems, commit, close, isConfigured, searchItems,
        getProjects, getItemTypes, createItem, getRelated, getItem, getBaseUrl,
        _renderStep, _setProject, _setItemType, _toggleItem };
})();
window.JamaConnect = JamaConnect;
