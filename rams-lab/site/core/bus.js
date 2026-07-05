// core/bus.js — event bus. Modules communicate ONLY through this (or the store).
const handlers = new Map();

export const bus = {
    on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(fn);
        return () => handlers.get(event).delete(fn);
    },
    emit(event, payload) {
        (handlers.get(event) || []).forEach(fn => {
            try { fn(payload); } catch (e) { console.error('[bus]', event, e); }
        });
        (handlers.get('*') || []).forEach(fn => {
            try { fn(event, payload); } catch (e) { console.error('[bus:*]', e); }
        });
    },
};
