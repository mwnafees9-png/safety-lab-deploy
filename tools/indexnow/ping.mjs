#!/usr/bin/env node
// tools/indexnow/ping.mjs — tell Bing (and every engine sharing the IndexNow feed)
// which pages just changed, the moment a deploy lands. (12 Sep 2026, from the SEO
// report's one real action: Bing scored 18/100 because it was never told about us.)
//
// How it works: the site hosts a key file, https://safetylabaero.com/<key>.txt, whose
// body is the key (proves we own the host). After a successful deploy, ship.sh runs this
// script; it reads the public page list straight from site/sitemap.xml and POSTs it to
// api.indexnow.org in one request. The key file's NAME is the key — there is one key,
// it lives in site/ (the *.txt allowlist ships it), and nothing here is secret.
//
// Never fatal: a failed ping is printed and the process still exits 0, because a deploy
// that already succeeded must not be reported as failed by a courtesy notification.
//
// Usage:  node tools/indexnow/ping.mjs            (ships whatever sitemap.xml lists)
//         node tools/indexnow/ping.mjs --dry      (print the payload, send nothing)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "safetylabaero.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");

export function findKey(siteDir = SITE) {
  // Exactly one <32 hex>.txt whose body is its own name.
  const hits = fs.readdirSync(siteDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  const good = hits.filter((f) => fs.readFileSync(path.join(siteDir, f), "utf8").trim() === f.slice(0, -4));
  if (good.length !== 1) throw new Error(`IndexNow: expected exactly one valid key file in site/, found ${good.length} (${hits.join(", ") || "none"})`);
  return good[0].slice(0, -4);
}
export function sitemapUrls(siteDir = SITE) {
  const xml = fs.readFileSync(path.join(siteDir, "sitemap.xml"), "utf8");
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const own = urls.filter((u) => new URL(u).host === HOST);
  if (!own.length) throw new Error("IndexNow: sitemap.xml lists no URLs on " + HOST);
  return own;
}
export function payload(siteDir = SITE) {
  const key = findKey(siteDir);
  return { host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList: sitemapUrls(siteDir) };
}
export async function ping(opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const body = payload(opts.siteDir);
  if (opts.dry) { console.log(JSON.stringify(body, null, 2)); return { ok: true, dry: true, count: body.urlList.length }; }
  const res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  // 200 = submitted, 202 = accepted (key to be validated later). Anything else is a problem worth reading.
  const ok = res.status === 200 || res.status === 202;
  return { ok, status: res.status, count: body.urlList.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dry = process.argv.includes("--dry");
  ping({ dry }).then((r) => {
    if (r.dry) return;
    console.log(r.ok ? `IndexNow: ${r.count} URLs submitted (HTTP ${r.status}).`
                     : `IndexNow: ping NOT accepted (HTTP ${r.status}) — deploy is fine; check the key file and sitemap.`);
  }).catch((e) => {
    console.log("IndexNow: ping skipped — " + String((e && e.message) || e));
  }).finally(() => process.exit(0));   // never fail a deploy over a notification
}
