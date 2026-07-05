// core/store.js — the ONE state root. Modules read ctx.state, write via
// ctx.update(fn); every update persists, stamps, and broadcasts. No module
// owns private persistence (Constitution rule 6).
import { bus } from './bus.js';

const KEY = 'ramslab.project.v1';
let state = null;
let idCounter = 1;

function blank() {
    return {
        meta: { name: 'Untitled RAMS Program', createdAt: new Date().toISOString(), phase: 1 },
        systemDef: { description: '', boundary: '', operationalContext: '' },
        hazards: [],           // hazard log rows
        thr: [],               // apportionment nodes
        reliability: { items: [], fieldData: [] },
        availability: { measures: [] },
        maintainability: { tasks: [] },
        sracs: [],
        safetyCase: { parts: {} },
        evidence: { signoffs: [], baselines: [], attests: {}, tailored: {} },
        counters: {},
    };
}

export const store = {
    load() {
        try {
            const raw = localStorage.getItem(KEY);
            state = raw ? JSON.parse(raw) : blank();
        } catch (_) { state = blank(); }
        idCounter = state._idCounter || 1000;
        return state;
    },
    get state() { return state || this.load(); },
    replace(next) {
        state = next;
        this.persist();
        bus.emit('state:replaced', state);
    },
    update(fn, eventName) {
        fn(this.state);
        this.persist();
        bus.emit(eventName || 'state:changed', state);
    },
    persist() {
        try {
            state._idCounter = idCounter;
            state.meta.updatedAt = new Date().toISOString();
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch (e) { console.warn('[store] persist failed', e); }
    },
    id(prefix) {
        const c = this.state.counters;
        c[prefix] = (c[prefix] || 0) + 1;
        return prefix + '-' + String(c[prefix]).padStart(3, '0');
    },
    nid() { return idCounter++; },
    reset() { state = blank(); this.persist(); bus.emit('state:replaced', state); },
};
