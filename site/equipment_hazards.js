// ============================================================================
// equipment_hazards.js — v1.0 — Z4/ZSA-A: equipment-type inherent-hazard
// library. BORN MODULAR: new file, pure data + logic, no DOM.
//
// ARP4761A §K.3.1 ("Physical Hazards Inherent to the System Equipment") directs
// the analyst, for EVERY item regardless of functional-hazard class, to identify
// the physical hazards inherent to its technology that can affect neighbours —
// in the FAILED and the UNFAILED state. §K.1 names the mechanisms: heat transfer,
// vibration, mechanical interference, electromagnetic radiation. Table K1 item 5
// ("failure consequences") enumerates secondary-damage effects. This module
// captures that as a reusable library: equipment TYPE -> inherent hazard(s),
// each with { mechanism, state, threat-to-neighbours }.
//
// Systems (systemsData) carry an optional `equipType` tag (persists with the
// project). zoneHazards() aggregates the inherent hazards of every box in a
// zone's subtree — the candidate zonal threats that seed the ZSA walkthrough.
//
// Library content is paraphrased category/hazard labels (methodology/facts),
// not verbatim standard text. Source: SAE ARP4761A Appendix K (§K.1, §K.3.1,
// §K.4.4, Table K1 item 5), §K.4.5.2 (cross-zonal).
// ============================================================================
(function () {
    'use strict';
    var ROOT = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    function _sys() { return (typeof systemsData !== 'undefined' && systemsData) ? systemsData : (ROOT.systemsData || []); }
    function _Z() { return ROOT.ZONES || null; }

    // hazard: { id, name, mechanism, state:'failed'|'unfailed'|'both', threat }
    var LIB = {
        battery:          { label: 'Battery / energy storage', hazards: [
            { id: 'batt-fire', name: 'Thermal runaway / fire', mechanism: 'fire', state: 'failed', threat: 'Ignition and intense heat to neighboring equipment and structure' },
            { id: 'batt-vent', name: 'Toxic / flammable venting', mechanism: 'contamination', state: 'failed', threat: 'Gas/electrolyte release into the bay' },
            { id: 'batt-heat', name: 'Heat dissipation', mechanism: 'heat', state: 'unfailed', threat: 'Thermal load on co-located equipment' } ] },
        hydraulic:        { label: 'Hydraulic line / actuator / reservoir', hazards: [
            { id: 'hyd-leak', name: 'High-pressure fluid leak / spray', mechanism: 'fluid', state: 'failed', threat: 'Fluid on neighboring systems, EWIS, structure' },
            { id: 'hyd-fire', name: 'Flammable fluid ignition near heat source', mechanism: 'fire', state: 'failed', threat: 'Fire in the zone' },
            { id: 'hyd-whip', name: 'Pipe whip / line burst', mechanism: 'mechanical', state: 'failed', threat: 'Mechanical damage to adjacent items' },
            { id: 'hyd-compat', name: 'Fluid material incompatibility', mechanism: 'contamination', state: 'both', threat: 'Material susceptibility of exposed neighbors' } ] },
        fuel:             { label: 'Fuel line / tank / pump', hazards: [
            { id: 'fuel-leak', name: 'Flammable fluid leak', mechanism: 'fluid', state: 'failed', threat: 'Fuel on neighbors; vapor accumulation' },
            { id: 'fuel-fire', name: 'Fire / ignition of vapor', mechanism: 'fire', state: 'failed', threat: 'Zone fire' } ] },
        pneumatic_bleed:  { label: 'Bleed-air duct / valve', hazards: [
            { id: 'bleed-heat', name: 'High temperature / hot surface', mechanism: 'heat', state: 'both', threat: 'Burns/ignition of neighbors; degraded qualification margins' },
            { id: 'bleed-burst', name: 'HP air leak / duct burst', mechanism: 'pressure', state: 'failed', threat: 'Jet impingement / mechanical effect on adjacent items' } ] },
        rotating:         { label: 'Rotating machine (pump / generator / motor / engine)', hazards: [
            { id: 'rot-burst', name: 'Uncontained debris / rotor burst', mechanism: 'debris', state: 'failed', threat: 'High-energy fragments to neighbors (couples to PRA)' },
            { id: 'rot-vib', name: 'Vibration', mechanism: 'vibration', state: 'both', threat: 'Fatigue/loosening of co-located equipment and structure' },
            { id: 'rot-shaft', name: 'Flailing shaft on disconnect', mechanism: 'mechanical', state: 'failed', threat: 'Mechanical damage / jams' } ] },
        electrical_power: { label: 'Electrical power (HV bus / generator / contactor)', hazards: [
            { id: 'elec-arc', name: 'Arcing / electrical short', mechanism: 'fire', state: 'failed', threat: 'Ignition and EWIS damage' },
            { id: 'elec-em',  name: 'Electromagnetic emission', mechanism: 'em', state: 'unfailed', threat: 'EMI to sensitive neighbors' } ] },
        rf_emitter:       { label: 'RF emitter (radar / transmitter / antenna)', hazards: [
            { id: 'rf-em',   name: 'Electromagnetic radiation / EMI', mechanism: 'em', state: 'unfailed', threat: 'Interference with equipment sensitive to that spectrum' },
            { id: 'rf-heat', name: 'Heat', mechanism: 'heat', state: 'unfailed', threat: 'Thermal load' } ] },
        oxygen:           { label: 'Oxygen line / bottle', hazards: [
            { id: 'o2-fire', name: 'Combustion enrichment / fire intensification', mechanism: 'fire', state: 'failed', threat: 'Any zone fire burns hotter/faster' },
            { id: 'o2-burst', name: 'High-pressure burst', mechanism: 'pressure', state: 'failed', threat: 'Fragments / overpressure' } ] },
        pyrotechnic:      { label: 'Pyrotechnic / high-energy device', hazards: [
            { id: 'pyro-blast', name: 'Blast / fragments', mechanism: 'debris', state: 'failed', threat: 'Blast and fragments to neighbors' },
            { id: 'pyro-energy', name: 'Stored-energy release', mechanism: 'stored-energy', state: 'failed', threat: 'Sudden energy release in the zone' } ] },
        hot_surface:      { label: 'Hot surface (heat exchanger / heater)', hazards: [
            { id: 'hot-ign', name: 'Heat / ignition source', mechanism: 'heat', state: 'both', threat: 'Ignition of flammable leaks; thermal load' } ] },
        pressure_vessel:  { label: 'Pressure vessel / accumulator', hazards: [
            { id: 'pv-burst', name: 'Burst / fragments', mechanism: 'debris', state: 'failed', threat: 'Fragments to neighbors' },
            { id: 'pv-energy', name: 'Stored-energy release', mechanism: 'stored-energy', state: 'failed', threat: 'Overpressure in the zone' } ] },
        avionics:         { label: 'Avionics / electronic LRU', hazards: [
            { id: 'av-heat', name: 'Heat dissipation', mechanism: 'heat', state: 'unfailed', threat: 'Thermal load on the bay' },
            { id: 'av-em',   name: 'EMI', mechanism: 'em', state: 'unfailed', threat: 'Emission to sensitive neighbors' } ] },
        mechanical_control:{ label: 'Mechanical control (cable / pushrod / torque shaft)', hazards: [
            { id: 'mech-jam', name: 'Flailing / jam on disconnect', mechanism: 'mechanical', state: 'failed', threat: 'Jams or damages adjacent controls' },
            { id: 'mech-interf', name: 'Mechanical interference', mechanism: 'mechanical', state: 'both', threat: 'Chafing/interference with moving parts' } ] },
        water_waste:      { label: 'Water / waste line (galley / lav)', hazards: [
            { id: 'wtr-leak', name: 'Fluid leak / cross-zone migration', mechanism: 'fluid', state: 'failed', threat: 'Water reaching other zones / connectors (cross-zonal, §K.4.5.2)' },
            { id: 'wtr-corr', name: 'Corrosion / contamination', mechanism: 'contamination', state: 'both', threat: 'Corrosion of neighbors/structure' } ] }
    };

    // heuristic type suggestion from a system name (convenience; the explicit tag is authoritative)
    var HINTS = [
        [/batter|\bess\b|energy stor/i, 'battery'],
        [/hydraul|\bhyd\b/i, 'hydraulic'],
        [/\bfuel\b/i, 'fuel'],
        [/bleed|pneumat/i, 'pneumatic_bleed'],
        [/oxygen|\bo2\b|obogg?s/i, 'oxygen'],
        [/radar|transmit|antenna|\brf\b|transponder|weather/i, 'rf_emitter'],
        [/pyro|squib|fire bottle|extinguish|cartridge/i, 'pyrotechnic'],
        [/heat exch|heater|\bduct\b/i, 'hot_surface'],
        [/accumulat|reservoir|bottle|vessel/i, 'pressure_vessel'],
        [/generat|\bgen\b|\bapu\b|\bpump\b|motor|engine|powerplant|turbine|\bfan\b|starter/i, 'rotating'],
        [/electric|\bpower\b|\bbus\b|contactor|breaker|\bgcu\b/i, 'electrical_power'],
        [/cable|pushrod|torque|linkage|bellcrank|actuat/i, 'mechanical_control'],
        [/water|galley|\blav\b|waste/i, 'water_waste'],
        [/avionic|comput|\bfcc\b|fadec|display|adiru|\bfmc\b|sensor|control unit|\blru\b|module|processor/i, 'avionics']
    ];

    function types() { return Object.keys(LIB).map(function (k) { return { type: k, label: LIB[k].label }; }); }
    function hazardsForType(t) { return (LIB[t] ? LIB[t].hazards : []).slice(); }
    function label(t) { return LIB[t] ? LIB[t].label : t; }
    function systemType(id) { var s = _sys().find(function (x) { return x.id === id; }); return s ? (s.equipType || null) : null; }
    function setType(id, t) { var s = _sys().find(function (x) { return x.id === id; }); if (!s) return { ok: false }; if (t) s.equipType = t; else delete s.equipType; return { ok: true }; }
    function hazardsForSystem(id) { var t = systemType(id); return t ? hazardsForType(t) : []; }
    function suggestType(name) { var n = String(name || ''); for (var i = 0; i < HINTS.length; i++) { if (HINTS[i][0].test(n)) return HINTS[i][1]; } return null; }

    // Aggregate inherent hazards of every box in a zone's subtree -> candidate zonal threats.
    function zoneHazards(zoneId) {
        var Z = _Z(); if (!Z) return [];
        var equip = Z.equipmentInSubtree(zoneId);
        var out = {}; // hazardId -> { name, mechanism, state, threat, from:[{id,name,type}] }
        equip.forEach(function (sid) {
            var t = systemType(sid); if (!t) return;
            var s = _sys().find(function (x) { return x.id === sid; }) || { name: sid };
            hazardsForType(t).forEach(function (h) {
                if (!out[h.id]) out[h.id] = { id: h.id, name: h.name, mechanism: h.mechanism, state: h.state, threat: h.threat, from: [] };
                out[h.id].from.push({ id: sid, name: s.name, type: t });
            });
        });
        return Object.keys(out).map(function (k) { return out[k]; });
    }

    ROOT.EQUIP_HAZARDS = {
        SCHEMA: 'equip-haz-1',
        types: types, hazardsForType: hazardsForType, label: label,
        systemType: systemType, setType: setType, hazardsForSystem: hazardsForSystem,
        suggestType: suggestType, zoneHazards: zoneHazards
    };
})();
