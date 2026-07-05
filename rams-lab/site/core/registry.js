// core/registry.js — modules register themselves; the shell consumes the
// registry. The shell never imports a module; modules never import the shell
// (Constitution rules 1 & 5).

const modules = [];

export const registry = {
    register(mod) {
        if (!mod || !mod.id || typeof mod.render !== 'function') {
            throw new Error('[registry] module must declare { id, section, title, render }');
        }
        if (modules.some(m => m.id === mod.id)) throw new Error('[registry] duplicate module id: ' + mod.id);
        modules.push(mod);
    },
    all() { return modules.slice(); },
    get(id) { return modules.find(m => m.id === id) || null; },
    sections() {
        const out = [];
        modules.forEach(m => {
            let sec = out.find(s => s.name === m.section);
            if (!sec) { sec = { name: m.section, items: [] }; out.push(sec); }
            sec.items.push(m);
        });
        return out;
    },
};
