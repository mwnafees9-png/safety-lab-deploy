// license-check.mjs — check a license file against THIS server before it is loaded (6 Oct 2026).
// Run inside the AI service container, which already holds Safety Lab's public keys and this
// server's own name:   docker exec -i safetylab-ai-proxy node /app/license-check.mjs < file.lic
// Prints one line of JSON: {ok:true, customer, seats, trial, notAfter} or {ok:false, message}.
// The SAME verifier the AI service uses for every request, so a license that passes here works.
import { verifyOfflineLicense } from "./worker.js";
const chunks = []; for await (const c of process.stdin) chunks.push(c);
const blob = Buffer.concat(chunks).toString("utf8").replace(/\s+/g, "");
const why = { invalid_token: "This is not a valid Safety Lab license, or it was damaged when it was copied.", expired: "This license has expired.", wrong_install: "This license is for a different server (it names another address)." };
if (!blob) { console.log(JSON.stringify({ ok: false, message: "The file is empty." })); process.exit(1); }
const v = await verifyOfflineLicense(process.env, blob);
if (v.error) { console.log(JSON.stringify({ ok: false, message: why[v.error] || v.error })); process.exit(1); }
let p = {}; try { p = JSON.parse(Buffer.from(blob.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch (_) {}
console.log(JSON.stringify({ ok: true, blob, customer: p.customer || "", seats: p.seats == null ? null : Number(p.seats), trial: p.trial === true, notBefore: p.notBefore || "", notAfter: p.notAfter || "" }));
