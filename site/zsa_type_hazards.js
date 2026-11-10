/* zsa_type_hazards.js (SLZsaTypeHazards v1.0, 10 Nov 2026): what each kind of equipment and material in a zone brings.
 *
 * Waqas, 10 Nov 2026: "for the ZSA, we identify equipment in each zone their material type etc and we should be writing
 * up what each type of material/equipment brings forward hazard and what all that type of hazard can do to the safety of
 * the surrounding equipment and the aircraft itself." Confirmed: per zone, written from the project (not blank boxes);
 * the wording is a fixed library we maintain, so the same equipment always reads the same way and every line can be
 * traced to where it came from.
 *
 * Per zone of the ZSA report (zsa_autopilot.js), one section "What the equipment and materials in the zone bring":
 *   1. each kind of equipment present (its equipment type if the system is tagged, else from its name, else from what
 *      the CAD part is: fluid, hot, electronics), with the units of that kind, and per hazard it brings:
 *        when it happens (in normal running or when it fails),
 *        what it can do to the equipment around it: the effect in plain words, the units in the zone it can reach
 *          (an item with susceptibility on record only if it is susceptible; one with none on record is taken as
 *          susceptible to everything), and the neighboring zones it carries into when nothing credited stands between
 *          (fire, heat, fluid and contamination: ARP4761A Appendix K, cross-zone effects),
 *        what it can do to the aircraft: losing what it reaches, through the fault trees (SLCadZonal.impactOfEquipment,
 *          the real fault tree engine), the worst failure condition named with its severity;
 *   2. each material on record (the STEP material in the CAD model, or a material set on the system), with the hazard
 *      that material brings (magnesium burns, aluminum loses strength in a fire, carbon fiber composite releases
 *      conductive fibers and toxic smoke when it burns, and so on) and what that means for the equipment around it;
 *   3. what is not on record, said plainly (units with no system, no type or no material), never guessed.
 * The wording is ours, describing the method of ARP4761A Appendix K (K.1 mechanisms, K.3.1 hazards inherent to the
 * equipment, failed and unfailed). The equipment hazards come from EQUIP_HAZARDS (equipment_hazards.js) so there is
 * one library; this module adds what a hazard does to its neighbors and the material library.
 * Materials: projectConfig.cadMaterials = { <cad model sha or id>: { <pid>: material } } (harvested from the STEP file
 * when the model is opened; small text, kept in the project so the report has it) and systemsData[].material.
 * Pure: section() writes nothing. window.SLZsaTypeHazards + module.exports (tests).
 */
(function (root) {
  'use strict';
  var VERSION = '1.0';
  function _g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
  function _arr(a) { return Array.isArray(a) ? a : []; }
  function _pc() { return _g('projectConfig') || {}; }
  function _s(v) { return String(v == null ? '' : v); }
  function _nat(a, b) { return _s(a).localeCompare(_s(b), undefined, { numeric: true }); }
  function _uniq(a) { var s = {}, o = []; _arr(a).forEach(function (x) { var k = _s(x); if (!s[k]) { s[k] = 1; o.push(x); } }); return o; }
  function _join(a) { a = _arr(a).filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function _sys(id) { return _arr(_g('systemsData')).find(function (s) { return s && _s(s.id) === _s(id); }) || null; }
  function _sysName(id) { var s = _sys(id); return s ? (s.name || _s(id)) : ''; }
  var SEV = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
  function sevRank(s) { return SEV.indexOf(_s(s)); }

  // ---- what each mechanism does to the equipment around it (our words, ARP4761A K.1 and K.3.1) ---------------------
  var AROUND = {
    fire: 'Flames and heat burn through wiring insulation, melt plastics, damage electronics, seals and hoses, and weaken structure; the fire spreads to anything that burns next to it.',
    heat: 'Heats the equipment next to it past what it is qualified for, so it ages faster or stops working, and it can set leaked fuel or hydraulic fluid alight.',
    fluid: 'Leaked fluid drips or sprays onto electronics and connectors and shorts them, soaks insulation, corrodes metal, and if it is flammable it feeds a fire when it meets heat or a spark.',
    debris: 'Fragments cut wiring and tubes, puncture tanks and lines, and break units and structure in their path.',
    pressure: 'A burst sends out a jet or blast that pushes, dents or tears nearby lines, ducts, panels and units.',
    mechanical: 'A loose, flailing or jammed part chafes or cuts the lines and cables next to it and can jam moving controls.',
    vibration: 'Shakes the equipment around it and its mountings, so fasteners and connectors work loose and parts crack over time.',
    em: 'Electromagnetic emission disturbs nearby electronics and the signals in the wiring next to it.',
    contamination: 'A corrosive or toxic release corrodes metal and connectors, breaks down seals and insulation, and contaminates the air.',
    'stored-energy': 'Stored energy released all at once damages everything close to it at the same moment.'
  };
  var MECH_WORD = { fire: 'fire', heat: 'heat', fluid: 'leaked fluid', debris: 'fragments', pressure: 'a burst', mechanical: 'mechanical damage', vibration: 'vibration', em: 'electromagnetic interference', contamination: 'contamination', 'stored-energy': 'a sudden energy release' };
  var CARRIES = { fire: 1, heat: 1, fluid: 1, contamination: 1 };
  var THREAT_TO_MECH = { heat: 'heat', fluid: 'fluid', debris: 'debris', emi: 'em', vibration: 'vibration' };
  var STATE_WORD = { failed: 'When it fails', unfailed: 'In normal running', both: 'In normal running and when it fails' };

  // kinds of equipment this module adds to the equipment library: runs and units the CAD model describes by what they carry
  var EXTRA = {
    wiring: { label: 'Electrical wiring (harness)', hazards: [
      { id: 'wire-arc', name: 'Arcing or a short (chafed or damaged wiring)', mechanism: 'fire', state: 'failed', threat: 'Ignition and damage to the wiring and equipment around it' },
      { id: 'wire-em', name: 'Emission from power wiring', mechanism: 'em', state: 'unfailed', threat: 'Interference to sensitive neighbors' } ] },
    wheel_brake: { label: 'Wheel, tire and brake', hazards: [
      { id: 'wb-burst', name: 'Tire burst or tread thrown', mechanism: 'debris', state: 'failed', threat: 'Rubber and rim fragments into the bay' },
      { id: 'wb-heat', name: 'Hot brakes', mechanism: 'heat', state: 'both', threat: 'Heat into the bay after braking; can ignite leaked hydraulic fluid' },
      { id: 'wb-fire', name: 'Brake or wheel fire', mechanism: 'fire', state: 'failed', threat: 'Fire in the bay' } ] },
    oil: { label: 'Oil tank, line or unit', hazards: [
      { id: 'oil-leak', name: 'Oil leak', mechanism: 'fluid', state: 'failed', threat: 'Oil on neighbors' },
      { id: 'oil-fire', name: 'Oil fire', mechanism: 'fire', state: 'failed', threat: 'Fire in the zone' } ] }
  };
  function _lib() { return root.EQUIP_HAZARDS || null; }
  function typeLabel(t) { if (EXTRA[t]) return EXTRA[t].label; var L = _lib(); return L ? L.label(t) : t; }
  function typeHazards(t) { if (EXTRA[t]) return EXTRA[t].hazards.slice(); var L = _lib(); return L ? L.hazardsForType(t) : []; }
  var RUN_TYPE = { wire: 'wiring', hydraulic: 'hydraulic', fuel: 'fuel', bleed: 'pneumatic_bleed', oil: 'oil', oxygen: 'oxygen', water: 'water_waste', waste: 'water_waste', control: 'mechanical_control' };
  // The kind of a unit, most specific first: its own name (the words below, in this order: a FADEC on an engine is
  // electronics, not the engine), else what the CAD part is (fluid, hot, electronics), else its system's equipment
  // type, else its system's name. A system's tag is not applied to every unit of it ahead of the unit's own name: an
  // engine system holds a FADEC, an oil tank and ignition exciters, each its own kind.
  var NAME_KIND = [
    [/batter|\bcells?\b|energy stor/i, 'battery'],
    [/fadec|computer|controller|control unit|\becu\b|\bfcc\b|sensor|detector|detection|monitor|display|processor|transducer|probe/i, 'avionics'],
    [/radar|transmitter|antenna|transponder|\bvhf\b|\bhf radio|satcom|\brf\b/i, 'rf_emitter'],
    [/oxygen|\bo2\b|obogs/i, 'oxygen'],
    [/fire bottle|extinguish|squib|pyro|cartridge|explosive/i, 'pyrotechnic'],
    [/accumulator|reservoir|pressure vessel|gas bottle|nitrogen/i, 'pressure_vessel'],
    [/\bfuel\b/i, 'fuel'],
    [/\boil\b/i, 'oil'],
    [/bleed|anti-?ice valve|precooler|pressure regulating|\bpack\b|pneumatic/i, 'pneumatic_bleed'],
    [/hydraul|\bhyd\b/i, 'hydraulic'],
    [/bogie|wheel|\btyres?\b|\btires?\b|brake unit|\bbrakes?\b|landing gear leg|gear leg/i, 'wheel_brake'],
    [/exciter|contactor|breaker|\bbus\b|power distribution|transformer|rectifier|inverter|\bpdu\b/i, 'electrical_power'],
    [/heater|heat exchanger|exhaust/i, 'hot_surface'],
    [/actuat/i, 'mechanical_control'],
    [/starter|engine \d|^engine|\(engine|generator|\bapu\b|auxiliary power|turbine|\bpump\b|motor|\bfan\b|propeller|rotor|compressor/i, 'rotating'],
    [/cable|pushrod|push rod|torque tube|torque shaft|linkage|bellcrank|quadrant/i, 'mechanical_control'],
    [/water|galley|\blav\b|lavatory|waste/i, 'water_waste'],
    [/\bunit\b|module|\blru\b|avionic|electronic/i, 'avionics']
  ];
  function nameKind(name) { var n = _s(name); for (var i = 0; i < NAME_KIND.length; i++) if (NAME_KIND[i][0].test(n)) return NAME_KIND[i][1]; return null; }
  // what an engineer set for a unit in the report's Edit: projectConfig.zsaUnitFacts[pid] = { kind, material, by, at }
  function facts(pid) { var f = _pc().zsaUnitFacts; return (f && pid && f[pid]) || null; }
  function setFacts(pid, kind, material, by) {
    if (!pid) return false; var pc = _pc(); if (!pc || typeof pc !== 'object') return false;
    if (!pc.zsaUnitFacts || typeof pc.zsaUnitFacts !== 'object') pc.zsaUnitFacts = {};
    var k = _s(kind).trim(), m = _s(material).trim().slice(0, 120), cur = pc.zsaUnitFacts[pid] || {};
    if (k && !typeHazards(k).length) k = '';
    if (!k && !m) { if (pc.zsaUnitFacts[pid]) delete pc.zsaUnitFacts[pid]; return true; }
    if (cur.kind === (k || undefined) && cur.material === (m || undefined)) return true;
    var rec = { by: _s(by) || 'Engineer', at: new Date().toISOString() }; if (k) rec.kind = k; if (m) rec.material = m;
    pc.zsaUnitFacts[pid] = rec; return true;
  }
  function kinds() { var L = _lib(), out = (L && L.types ? L.types() : []).map(function (t) { return { type: t.type, label: t.label }; }); Object.keys(EXTRA).forEach(function (k) { out.push({ type: k, label: EXTRA[k].label }); }); return out.sort(function (a, b) { return _nat(a.label, b.label); }); }
  function unitType(u) {
    var s = u.sysId ? _sys(u.sysId) : null, L = _lib();
    var fx = facts(u.pid); if (fx && fx.kind) return { type: fx.kind, from: 'the kind set in this report by ' + (fx.by || 'the engineer') };
    var t = nameKind(u.name);
    if (t === 'mechanical_control' && /actuat/i.test(_s(u.name)) && ((s && /hydraul/i.test(_s(s.name))) || /hydraul/i.test(_s(u.name)))) t = 'hydraulic';
    if (t) return { type: t, from: 'its name' };
    var k = u.k || {};
    if (k.fluid === 'fuel') return { type: 'fuel', from: 'what the CAD part holds' };
    if (k.fluid === 'hydraulic') return { type: 'hydraulic', from: 'what the CAD part holds' };
    if (k.fluid === 'oil') return { type: 'oil', from: 'what the CAD part holds' };
    if (k.hot) return { type: 'hot_surface', from: 'the CAD part running hot' };
    if (k.electronic) return { type: 'avionics', from: 'the CAD part being electronics' };
    if (s && s.equipType) return { type: s.equipType, from: 'the equipment type set on ' + (s.name || s.id) };
    t = s && L && L.suggestType ? L.suggestType(s.name) : null;
    if (t) return { type: t, from: 'its system\'s name' };
    return null;
  }

  // ---- materials (our words) --------------------------------------------------------------------------------------
  var MATERIALS = [
    { id: 'magnesium', near: true, label: 'Magnesium alloy', re: /magnesium|\bmg\s?alloy|\baz\d{2}|\bwe43|elektron/i,
      hazard: 'Burns once it is hot enough, very hot and hard to put out; water on it makes the fire worse.', mechanism: 'fire',
      here: 'A fire nearby can set the part itself burning, which adds heat and lasts longer than the fire that started it.' },
    { id: 'titanium', label: 'Titanium alloy', re: /titanium|\bti[\s-]?6al|\bti[\s-]?64\b|\bti\b/i,
      hazard: 'Can catch fire and keep burning when rubbed hard at high temperature (a titanium fire, mainly in compressors).', mechanism: 'fire',
      here: 'Keeps its strength in heat that would weaken aluminum, so it can serve as a barrier; inside rotating machinery it is a fire source.' },
    { id: 'aluminum', label: 'Aluminum alloy', re: /alumin|\bal\s?\d{4}\b|\b[2567]\d{3}-t\d|\bal-?li\b/i,
      hazard: 'Loses most of its strength in a fire long before it melts (around 600 °C), so it cannot hold back a fire for long.', mechanism: 'fire',
      here: 'A wall or cover of it is not fireproof: it is credited as a barrier only where its requirement says what it must withstand and that is verified.' },
    { id: 'steel', label: 'Steel, stainless steel or nickel alloy', re: /steel|stainless|inconel|nickel|\bcres\b|\b(15-5|17-4|304|316|321|4130|4340)\b|waspaloy|hastelloy/i,
      hazard: 'Brings no hazard of its own here; it keeps its strength in a fire.', mechanism: null,
      here: 'Can serve as a fire barrier when its requirement says so and that is verified.' },
    { id: 'cfrp', near: true, label: 'Carbon fiber composite', re: /carbon|cfrp|graphite|\bim7\b|\bt[37]00\b|\bas4\b/i,
      hazard: 'Its resin burns and gives off thick toxic smoke; burning or broken composite releases fine carbon fibers that conduct electricity; it loses strength once the resin softens; it conducts, so it corrodes aluminum it touches and carries lightning current.', mechanism: 'fire',
      here: 'Fibers released in a fire can short electronics and connectors around it; the smoke can reach the crew and passengers.' },
    { id: 'gfrp', near: true, label: 'Glass fiber composite', re: /glass fib|fiberglass|fibreglass|\bgfrp\b|e-?glass|s-?glass/i,
      hazard: 'Its resin burns and gives off smoke, and it loses strength once the resin softens.', mechanism: 'fire',
      here: 'Adds fuel and smoke to a fire around it.' },
    { id: 'aramid', near: true, label: 'Aramid composite or honeycomb', re: /aramid|kevlar|nomex|honeycomb/i,
      hazard: 'Chars rather than melts but its resin burns and gives off smoke; honeycomb soaks up fluid.', mechanism: 'fire',
      here: 'Leaked fluid can collect in it and later feed a fire.' },
    { id: 'polymer', near: true, label: 'Plastic (thermoplastic or thermoset)', re: /plastic|nylon|polyamide|peek|pei|ultem|polycarb|abs\b|acetal|delrin|ptfe|teflon|pvc|polyeth|polyprop|epoxy|phenolic|polyimide|kapton/i,
      hazard: 'Melts or burns and can drip burning; gives off toxic fumes (PTFE and PVC especially).', mechanism: 'fire',
      here: 'Adds fuel and fumes to a fire around it, and burning drips can carry the fire down onto what is below.' },
    { id: 'elastomer', label: 'Rubber or elastomer (seals, hoses)', re: /rubber|elastomer|silicone|viton|fkm|nitrile|\bnbr\b|epdm|neoprene/i,
      hazard: 'Hardens, cracks or swells with heat and with fluids it is not made for, and then leaks.', mechanism: 'fluid',
      here: 'Heat or a fluid leak nearby can make its own seal or hose fail, starting a second leak.' },
    { id: 'lithium', near: true, label: 'Lithium cells', re: /lithium|li-?ion|lipo|li-?po|lifepo|nmc|\bnca\b/i,
      hazard: 'Can go into thermal runaway: the cell heats itself, vents flammable toxic gas and catches fire, and the next cell follows.', mechanism: 'fire',
      here: 'One failing cell can set the whole battery and the equipment around it on fire.' },
    { id: 'foam', near: true, label: 'Foam or insulation blanket', re: /foam|insulation blanket|thermal blanket|acoustic blanket|batting/i,
      hazard: 'Soaks up leaked fluid and holds it; some foams burn readily.', mechanism: 'fluid',
      here: 'Fluid held in it stays next to wiring and hot parts long after a leak.' },
    { id: 'copper', label: 'Copper', re: /\bcopper\b|\bcu\b|brass|bronze/i,
      hazard: 'Brings no hazard of its own here.', mechanism: null, here: '' }
  ];
  // a part is often several materials ("steel rod, aluminum body, nitrile seals"): every material named counts
  function materialClasses(name) { var n = _s(name); if (!n.trim()) return []; var out = MATERIALS.filter(function (m) { return m.re.test(n); }); return out.length ? out : [materialClass(n)]; }
  function materialClass(name) { var n = _s(name); if (!n.trim()) return null; for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].re.test(n)) return MATERIALS[i]; return { id: 'other', label: n.trim(), hazard: '', mechanism: null, here: '', unknown: true }; }
  // the material of a unit: the STEP material of its CAD part, else a material set on its system
  function _cadMats(cadId) {
    var pc = _pc(), all = pc.cadMaterials && typeof pc.cadMaterials === 'object' ? pc.cadMaterials : {};
    var C = root.SLCadZonal, m = null; try { m = C && C.model ? C.model(cadId) : null; } catch (_) {}
    return (m && m.sha256 && all[m.sha256]) || all[cadId] || {};
  }
  function unitMaterial(u, cadId) {
    var fx = facts(u.pid); if (fx && fx.material) return { name: _s(fx.material), from: 'the material set in this report by ' + (fx.by || 'the engineer') };
    var cm = _cadMats(cadId), m = u.pid && cm[u.pid];
    if (m) return { name: _s(m), from: 'the CAD model' };
    var s = u.sysId ? _sys(u.sysId) : null;
    if (s && s.material) return { name: _s(s.material), from: 'the material set on ' + (s.name || s.id) };
    return null;
  }
  // kept in the project when the CAD model is opened: the STEP materials by part (small text, no geometry)
  function harvestMaterials(cadKey, attrs) {
    if (!cadKey || !attrs || typeof attrs !== 'object') return 0;
    var map = {}, n = 0;
    Object.keys(attrs).forEach(function (pid) { var a = attrs[pid]; if (a && a.material) { map[pid] = _s(a.material).slice(0, 120); n++; } });
    var pc = _pc(); if (!pc || typeof pc !== 'object') return 0;
    var cur = pc.cadMaterials && pc.cadMaterials[cadKey];
    if (!n) return 0;
    if (cur && JSON.stringify(cur) === JSON.stringify(map)) return n;
    if (!pc.cadMaterials || typeof pc.cadMaterials !== 'object') pc.cadMaterials = {};
    pc.cadMaterials[cadKey] = map;
    try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
    return n;
  }
  function setMaterial(sysId, material) { var s = _sys(sysId); if (!s) return false; var m = _s(material).trim(); if (m) s.material = m.slice(0, 120); else delete s.material; try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} return true; }

  // ---- susceptibility, neighbors, consequence ---------------------------------------------------------------------
  function susceptible(sysId, m) {
    var t = sysId && (_pc().zoneThreats || {})[sysId], s = t && Array.isArray(t.susceptible) ? t.susceptible.map(function (x) { return THREAT_TO_MECH[x] || x; }) : [];
    if (!s.length) return true;               // none on record: taken as susceptible to everything (no credit without data)
    if (m === 'fire' || m === 'stored-energy' || m === 'pressure') return true;   // nothing in a zone is immune to fire or a burst
    return s.indexOf(m) >= 0;
  }
  function _Z() { return root.ZONES || null; }
  function _credited(a, b) { var Z = _Z(); if (!Z || !Z.barrierBetween || !Z.barrierCredit) return null; var bar = Z.barrierBetween(a, b); if (!bar) return null; var c = Z.barrierCredit(bar); return c && c.credit ? bar : null; }
  // the zones next to this one: its parent and sub-zones, and the zones whose space touches it (zone boxes within
  // TOUCH_MM of each other); where a zone has no box, its siblings under the same parent (the engine's rule)
  var TOUCH_MM = 50;
  function _box(z) { var v = z && z.volume; return v && v.kind === 'box' && Array.isArray(v.min) && Array.isArray(v.max) ? v : null; }
  function _touch(a, b) { for (var i = 0; i < 3; i++) { if (a.min[i] > b.max[i] + TOUCH_MM || b.min[i] > a.max[i] + TOUCH_MM) return false; } return true; }
  function carryInto(zoneId) {
    var Z = _Z(), z = Z && Z.get ? Z.get(zoneId) : null; if (!z) return { into: [], held: [] };
    var nb = [], bz = _box(z);
    if (z.parentId != null) nb.push(z.parentId);
    _arr(Z.children(z.id)).forEach(function (c) { nb.push(c.id); });
    _arr(Z.all()).forEach(function (o) {
      if (!o || o.id === z.id || nb.indexOf(o.id) >= 0) return;
      var sib = (o.parentId == null) ? (z.parentId == null) : (o.parentId === z.parentId); if (!sib) return;
      var bo = _box(o);
      if (bz && bo) { if (_touch(bz, bo)) nb.push(o.id); }
      else if (z.parentId != null) nb.push(o.id);
    });
    var into = [], held = [];
    _uniq(nb).forEach(function (id) { var o = Z.get(id); if (!o) return; var lab = (o.code || o.name || o.id); if (_credited(zoneId, id)) held.push(lab); else into.push({ id: id, label: lab }); });
    into.sort(function (a, b) { return _nat(a.label, b.label); }); held.sort(_nat);
    return { into: into, held: held };
  }
  function consequence(sysIds) {
    sysIds = _uniq(sysIds).filter(Boolean);
    if (!sysIds.length) return null;
    var C = root.SLCadZonal, r = null;
    try { r = C && C.impactOfEquipment ? C.impactOfEquipment(sysIds) : null; } catch (_) { r = null; }
    if (r && r.notEvaluated) return { notEvaluated: r.notEvaluated };
    if (r && r.conditions && r.conditions.length) {
      var w = r.conditions[0];
      return { worst: w.severity, fc: (w.fcId ? w.fcId + ' ' : '') + _s(w.desc), count: r.conditions.length, from: 'the fault trees' };
    }
    // no fault tree reaches it: the worst failure condition of the systems' own FHA
    var best = null;
    sysIds.forEach(function (id) { var s = _sys(id); _arr(s && s.fha).forEach(function (f) { if (!best || sevRank(f.severity) > sevRank(best.severity)) best = { severity: f.severity, fc: (f.fcId ? f.fcId + ' ' : '') + _s(f.fcDesc), sys: s.name }; }); });
    if (best && best.severity) return { worst: best.severity, fc: best.fc, count: 1, from: 'the FHA of ' + best.sys + ': no fault tree is developed down to this equipment, so that system\'s worst failure condition is taken' };
    return { worst: null };
  }
  function aircraftText(sysIds, intoZones) {
    var cons = consequence(sysIds);
    if (!sysIds.length) return intoZones && intoZones.length ? 'None of the equipment it reaches in this zone is linked to a system; what it reaches in ' + _join(intoZones) + ' is in those zones\' sections.' : 'Nothing it reaches is linked to a system, so its effect on the aircraft is not worked out here. Link the CAD parts to their systems to have it worked out.';
    var who = _uniq(sysIds.map(_sysName)).sort(_nat);
    if (!cons) return '';
    if (cons.notEvaluated) return 'It takes out equipment of ' + _join(who) + '. What that does to the aircraft is not worked out: ' + cons.notEvaluated + '.';
    if (!cons.worst) return 'It takes out equipment of ' + _join(who) + '. No failure condition is reached by losing it.';
    return 'It takes out equipment of ' + _join(who) + '. Losing that is ' + cons.worst + ': ' + cons.fc.trim() + (cons.count > 1 ? ' (the worst of the failure conditions reached)' : '') + ', from ' + cons.from + '.';
  }

  // ---- the section ---------------------------------------------------------------------------------------------------
  // zone: a zone of SLZsaAuto.compute() (units, runs); cadId: its model. Returns { blocks, types, materials, gaps }.
  function section(zone, cadId, opts) {
    opts = opts || {};
    var out = { blocks: [], types: [], materials: [], gaps: [] };
    if (!zone) return out;
    var units = _arr(zone.units), runs = _arr(zone.runs), title = opts.title || zone.code;
    var tid = function (s) { return 'zsa-' + _s(zone.code).replace(/[^A-Za-z0-9_-]+/g, '-') + '-' + s; };
    var P = function (t) { out.blocks.push({ type: 'p', text: t }); };
    // every source: a unit, or a run as one source per run
    var items = [];
    units.forEach(function (u) { items.push({ key: 'u:' + u.pid, name: u.name + (u.designator ? ' (' + u.designator + ')' : ''), sysId: u.sysId || null, u: u, t: unitType(u), mat: unitMaterial(u, cadId) }); });
    runs.forEach(function (r) {
      var sy = _uniq(_arr(r.parts).map(function (p) { return p.sysId; }).filter(Boolean));
      var t = RUN_TYPE[r.kind] ? { type: RUN_TYPE[r.kind], from: 'the run it is' } : null;
      var mats = _uniq(_arr(r.parts).map(function (p) { var m = unitMaterial(p, cadId); return m ? m.name : null; }).filter(Boolean));
      items.push({ key: 'r:' + r.run, name: r.run, sysId: sy[0] || null, sysIds: sy, run: r, t: t, mat: mats.length ? { name: mats[0], from: 'the CAD model' } : null });
    });
    var Z = _Z(), zoneId = zone.id;
    var cz = carryInto(zoneId);
    // the equipment of the neighboring zones (for "it carries into", by system)
    var byType = {};
    items.forEach(function (it) { if (it.t) (byType[it.t.type] = byType[it.t.type] || []).push(it); });
    var tkeys = Object.keys(byType).sort(function (a, b) { return _nat(typeLabel(a), typeLabel(b)); });
    out.blocks.push({ type: 'h', text: 'What the equipment and materials in the zone bring' });
    if (!items.length) { P('Nothing is placed in ' + title + ', so it brings no hazard of its own.'); return out; }
    P('Each kind of equipment in ' + title + ' brings hazards of its own, whether it is working or has failed. Below, for each kind: the hazards it brings, what each can do to the equipment around it in the zone (and in the zones next to it, where nothing credited stands between), and what losing that equipment does to the aircraft, through the fault trees. The wording is the same library for every project; the equipment named and the outcome are this project\'s.');
    tkeys.forEach(function (t) {
      var src = byType[t], names = _uniq(src.map(function (x) { return x.name; })).sort(_nat), srcKeys = {}; src.forEach(function (x) { srcKeys[x.key] = 1; });
      var hz = typeHazards(t), rows = [];
      hz.forEach(function (h) {
        var m = h.mechanism;
        var reached = items.filter(function (x) { return !srcKeys[x.key] && susceptible(x.sysId, m); });
        var rnames = _uniq(reached.map(function (x) { return x.name; })).sort(_nat);
        var sysIds = _uniq([].concat.apply([], reached.map(function (x) { return x.sysIds || (x.sysId ? [x.sysId] : []); })));
        var into = CARRIES[m] ? cz.into.map(function (z) { return z.label; }) : [];
        if (CARRIES[m] && Z) cz.into.forEach(function (z) { _arr(Z.subtree ? Z.subtree(z.id) : [Z.get(z.id)]).forEach(function (zz) { _arr(zz && zz.equipment).forEach(function (sid) { if (susceptible(sid, m)) sysIds.push(sid); }); }); });
        sysIds = _uniq(sysIds);
        var around = (AROUND[m] || h.threat || '') + ' ' + (rnames.length ? 'Here it can reach ' + _join(rnames) + '.' : 'Nothing else in the zone is in its reach.') +
                     (into.length ? ' It can carry into ' + _join(into) + ': nothing credited stands between.' : '') + (CARRIES[m] && cz.held.length ? ' A credited barrier holds it out of ' + _join(cz.held) + '.' : '');
        rows.push([h.name, STATE_WORD[h.state] || '', around.trim(), aircraftText(sysIds, into)]);
      });
      out.types.push({ type: t, label: typeLabel(t), units: names, hazards: rows.length });
      P(typeLabel(t) + ': ' + _join(names) + '. Known as this kind from ' + _join(_uniq(src.map(function (x) { return x.t.from; }))) + '.');
      if (rows.length) out.blocks.push({ type: 'table', id: tid('kind-' + t), title: 'What it brings: ' + typeLabel(t) + ', in ' + title, columns: ['Hazard', 'When', 'What it can do to the equipment around it', 'What it can do to the aircraft'], rows: rows });
    });
    var untyped = items.filter(function (x) { return !x.t; }).map(function (x) { return x.name; }).sort(_nat);
    if (untyped.length) { P('Not known what kind of equipment these are, so the hazards they bring are not written here: ' + _join(untyped) + '. Set what each one is in this zone\'s Edit to have them included.'); out.gaps.push('untyped'); }
    // materials
    var mats = {};
    items.forEach(function (x) { if (!x.mat) return; materialClasses(x.mat.name).forEach(function (c) { var k = c.id === 'other' ? 'other:' + c.label : c.id; (mats[k] = mats[k] || { c: c, names: [], recorded: [] }).names.push(x.name); mats[k].recorded.push(x.mat.name); }); });
    var mk = Object.keys(mats).sort(function (a, b) { return _nat(mats[a].c.label, mats[b].c.label); });
    if (mk.length) {
      var mrows = mk.map(function (k) {
        var e = mats[k], c = e.c, nm = _uniq(e.names).sort(_nat);
        var reach = '';
        if (c.mechanism && c.near && !c.unknown) {
          var others = items.filter(function (x) { return nm.indexOf(x.name) < 0 && susceptible(x.sysId, c.mechanism); });
          reach = c.here + (others.length ? ' Around it in this zone: ' + _join(_uniq(others.map(function (x) { return x.name; })).sort(_nat)) + '.' : '');
        } else reach = c.here || (c.unknown ? 'This material is not in the library, so what it brings is not written here.' : '');
        var rec = _uniq(e.recorded);
        return [c.label + (c.unknown || rec.length !== 1 ? '' : ' (recorded as ' + rec[0] + ')'), _join(nm), c.hazard || 'Not in the library.', reach.trim()];
      });
      out.materials = mk.map(function (k) { return mats[k].c.label; });
      out.blocks.push({ type: 'table', id: tid('materials'), title: 'Materials in ' + title, columns: ['Material', 'Equipment made of it', 'The hazard it brings', 'What that means for the equipment around it'], rows: mrows });
    }
    var nomat = items.filter(function (x) { return !x.mat; }).map(function (x) { return x.name; }).sort(_nat);
    if (nomat.length) { P((mk.length ? 'The material of the rest is not on record' : 'No material is on record for the equipment in this zone') + ' (' + _join(nomat) + '), so what their materials bring is not written here. Material comes from the CAD model (the STEP file\'s material for each part), or set it for each unit in this zone\'s Edit.'); out.gaps.push('nomaterial'); }
    return out;
  }
  // what the section depends on beyond the CAD model and the zones (for the report's memo key)
  function memoPart() {
    var pc = _pc();
    try { return JSON.stringify([pc.cadMaterials || null, pc.zsaUnitFacts || null, pc.zoneThreats || null, _arr(_g('systemsData')).map(function (s) { return s ? [s.id, s.equipType || '', s.material || ''] : 0; }), (_Z() && _Z().barriers) ? _Z().barriers().map(function (b) { return [b.a, b.b, b.material || '', b.requirementId || '']; }) : 0]); } catch (_) { return ''; }
  }

  var api = { VERSION: VERSION, AROUND: AROUND, MATERIALS: MATERIALS, EXTRA: EXTRA, typeLabel: typeLabel, typeHazards: typeHazards, unitType: unitType, nameKind: nameKind, facts: facts, setFacts: setFacts, kinds: kinds, materialClass: materialClass, materialClasses: materialClasses, unitMaterial: unitMaterial,
              harvestMaterials: harvestMaterials, setMaterial: setMaterial, susceptible: susceptible, carryInto: carryInto, consequence: consequence, aircraftText: aircraftText, section: section, memoPart: memoPart };
  try { root.SLZsaTypeHazards = api; } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
