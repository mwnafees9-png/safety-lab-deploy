#!/usr/bin/env node
// tools/seo/sitemap.mjs — regenerate site/sitemap.xml from the public page list (13 Sep 2026).
//
// WHY: the hand-kept sitemap said every page was last modified on 2026-06-05, months after
// the pages changed. Search engines use <lastmod> to decide what to re-read; a stale date
// tells them there is nothing new. This script writes the file from one list, with each
// page's <lastmod> taken from the last git commit that touched it (falling back to today for
// an uncommitted change). build.sh runs it into dist/ on every build, so the SHIPPED sitemap
// always carries real dates without dirtying the tree; the committed site/sitemap.xml is the
// same list (the wall, tests/regression_sitemap.test.js, holds the URL lists equal) and is
// what tools/indexnow/ping.mjs reads for its page list.
//
//   node tools/seo/sitemap.mjs                 write site/sitemap.xml
//   node tools/seo/sitemap.mjs --out <path>    write elsewhere (build.sh: dist/sitemap.xml)
//   node tools/seo/sitemap.mjs --check         exit 1 if site/sitemap.xml lists other URLs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST = "https://safetylabaero.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");

// The public pages, in the order search engines should see them. security.html is NOT here:
// it is an unlinked duplicate of /trust and canonicalizes there. The app (/app) is not a page
// for search. Add a page here when it is linked from the site and meant to be found.
export const PAGES = [
  { url: "/",                      file: "landing.html",               changefreq: "weekly",  priority: "1.0" },
  { url: "/fault-tree-analysis",   file: "fault-tree-analysis.html",   changefreq: "monthly", priority: "0.9" },
  { url: "/functional-hazard-assessment", file: "functional-hazard-assessment.html", changefreq: "monthly", priority: "0.9" },
  { url: "/arp-4761a",             file: "arp-4761a.html",             changefreq: "monthly", priority: "0.9" },
  { url: "/arp-4754b",             file: "arp-4754b.html",             changefreq: "monthly", priority: "0.9" },
  { url: "/fmea-software",         file: "fmea-software.html",         changefreq: "monthly", priority: "0.9" },
  { url: "/common-cause-analysis", file: "common-cause-analysis.html", changefreq: "monthly", priority: "0.9" },
  { url: "/medini-analyze-alternative", file: "medini-analyze-alternative.html", changefreq: "monthly", priority: "0.8" },
  { url: "/resources",             file: "resources.html",             changefreq: "monthly", priority: "0.7" },
  { url: "/roi",                   file: "roi.html",                   changefreq: "monthly", priority: "0.7" },
  { url: "/tools",                 file: "tools.html",                 changefreq: "monthly", priority: "0.7" },
  { url: "/templates",             file: "templates.html",             changefreq: "monthly", priority: "0.7" },
  { url: "/ai-guardrails",         file: "ai-guardrails.html",         changefreq: "monthly", priority: "0.7" },
  { url: "/trust",                 file: "trust.html",                 changefreq: "monthly", priority: "0.7" },
  { url: "/legal",                 file: "legal.html",                 changefreq: "yearly",  priority: "0.3" },
  { url: "/privacy",               file: "privacy.html",               changefreq: "yearly",  priority: "0.3" },
];

export function lastmod(file, root = ROOT) {
  const full = path.join(root, "site", file);
  if (!fs.existsSync(full)) throw new Error("sitemap: missing page file " + file);
  try {
    // uncommitted change → today; else the last commit date of the file
    const dirty = execSync(`git status --porcelain -- "site/${file}"`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const d = execSync(`git log -1 --format=%cs -- "site/${file}"`, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (_) {}
  return new Date().toISOString().slice(0, 10);
}

export function render(root = ROOT) {
  const rows = PAGES.map((p) =>
    `  <url>\n    <loc>${HOST}${p.url}</loc>\n    <lastmod>${lastmod(p.file, root)}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const oi = process.argv.indexOf("--out");
  const out = oi > 0 ? path.resolve(process.argv[oi + 1]) : path.join(SITE, "sitemap.xml");
  const want = render();
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    const locs = (t) => [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).join("\n");
    if (locs(have) === locs(want)) { console.log("sitemap.xml lists the current pages (" + PAGES.length + ")"); process.exit(0); }
    console.log("sitemap.xml lists OTHER pages than tools/seo/sitemap.mjs — run: node tools/seo/sitemap.mjs"); process.exit(1);
  }
  fs.writeFileSync(out, want);
  console.log("wrote " + path.relative(ROOT, out) + " (" + PAGES.length + " pages)");
}
