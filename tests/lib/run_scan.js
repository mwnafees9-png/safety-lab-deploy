#!/usr/bin/env node
// Ad-hoc runner: print every finding grouped by code, for triage.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./layout_scan.js');
const SITE = path.join(process.argv[2] || '.', 'site');
const VERBOSE = process.argv.indexOf('-v') !== -1;

const css = fs.readFileSync(path.join(SITE, 'safety_lab.css'), 'utf8');
const idx = S.buildCssIndex(S.parseCss(css));

const all = [];
all.push(...S.scanHtmlSource(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), 'index.html', idx));
all.push(...S.scanCssSource(css));
fs.readdirSync(SITE).filter(f => f.endsWith('.js')).forEach(f => {
  try { all.push(...S.scanJsSource(fs.readFileSync(path.join(SITE, f), 'utf8'), f, idx)); }
  catch (e) { console.error('skip ' + f + ': ' + e.message); }
});

// Collapse identical (code, where) pairs — a JS panel rendered in a loop reports once.
const seen = new Set();
const uniq = all.filter(f => {
  const k = f.code + '|' + f.origin + '|' + f.where;
  if (seen.has(k)) return false;
  seen.add(k); return true;
});

const byCode = {};
uniq.forEach(f => { (byCode[f.code] = byCode[f.code] || []).push(f); });
Object.keys(byCode).sort().forEach(code => {
  const list = byCode[code];
  console.log('\n===== ' + code + ' — ' + list.length + ' unique =====');
  const byOrigin = {};
  list.forEach(f => { (byOrigin[f.origin] = byOrigin[f.origin] || []).push(f); });
  Object.keys(byOrigin).sort((a, b) => byOrigin[b].length - byOrigin[a].length).forEach(o => {
    console.log('  ' + o + '  (' + byOrigin[o].length + ')');
    const show = VERBOSE ? byOrigin[o] : byOrigin[o].slice(0, 10);
    show.forEach(f => console.log('      L' + f.line + '  ' + f.where));
    if (byOrigin[o].length > show.length) console.log('      … ' + (byOrigin[o].length - show.length) + ' more');
  });
});
console.log('\nTOTAL ' + uniq.length + ' unique (' + all.length + ' raw)');
