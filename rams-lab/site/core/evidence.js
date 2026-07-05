// core/evidence.js — the evidence layer every vertical inherits: FNV-1a
// fingerprints (drift detection), SHA-256 hash-chained sign-offs (tamper
// evidence), baselines. Vertical-agnostic (Constitution rule 7).

export function fnv(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

// Deterministic stringify: sorted keys, underscore-prefixed keys dropped.
export function stableStringify(obj) {
    return JSON.stringify(obj, function (k, v) {
        if (k && k.charAt && k.charAt(0) === '_') return undefined;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const o = {};
            Object.keys(v).sort().forEach(key => { if (key.charAt(0) !== '_') o[key] = v[key]; });
            return o;
        }
        return v;
    });
}

export function fingerprint(obj) { return fnv(stableStringify(obj)); }

export async function sha256(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str)));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'fnv:' + fnv(str);   // headless/test fallback — still deterministic
}

// Signed act appended to a hash chain on the evidence root. `target` is any
// {kind, id} the vertical defines; content is fingerprinted at signing time.
export async function sign(evidenceRoot, target, stage, signer, content) {
    const chain = evidenceRoot.signoffs;
    const prev = chain.length ? chain[chain.length - 1].hash : '';
    const contentFp = fingerprint(content || {});
    const at = new Date().toISOString();
    const hash = await sha256([prev, target.kind, target.id, stage, signer, at, contentFp].join('§'));
    const rec = { kind: target.kind, id: target.id, stage, signer, at, contentFp, prevHash: prev, hash };
    chain.push(rec);
    return rec;
}

export async function verifyChain(evidenceRoot) {
    const chain = evidenceRoot.signoffs || [];
    let prev = '';
    for (const rec of chain) {
        if (rec.prevHash !== prev) return { ok: false, at: rec };
        const expect = await sha256([prev, rec.kind, rec.id, rec.stage, rec.signer, rec.at, rec.contentFp].join('§'));
        if (expect !== rec.hash) return { ok: false, at: rec };
        prev = rec.hash;
    }
    return { ok: true, length: chain.length };
}

export function latestSignoff(evidenceRoot, target) {
    const chain = evidenceRoot.signoffs || [];
    for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].kind === target.kind && String(chain[i].id) === String(target.id)) return chain[i];
    }
    return null;
}

// Drift: content changed since it was signed.
export function isStale(evidenceRoot, target, content) {
    const s = latestSignoff(evidenceRoot, target);
    return s ? s.contentFp !== fingerprint(content || {}) : false;
}

export async function baseline(evidenceRoot, label, projectState) {
    const hash = await sha256(stableStringify(projectState));
    const rec = { label, at: new Date().toISOString(), hash };
    evidenceRoot.baselines.push(rec);
    return rec;
}
