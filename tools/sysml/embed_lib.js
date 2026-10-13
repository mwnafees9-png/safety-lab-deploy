#!/usr/bin/env node
// Copies site/sysml_safety_lib.sysml into site/sysml_model.js (LIBRARY_TEXT), byte for byte.
// Run after editing the library: node tools/sysml/embed_lib.js   (13 Oct 2026)
'use strict';
const fs = require('fs'), path = require('path');
const site = path.join(__dirname, '../../site');
const lib = fs.readFileSync(path.join(site, 'sysml_safety_lib.sysml'), 'utf8');
const f = path.join(site, 'sysml_model.js');
const js = fs.readFileSync(f, 'utf8');
const re = /var LIBRARY_TEXT = "(?:[^"\\]|\\.)*";/;
if (!re.test(js)) { console.error('LIBRARY_TEXT line not found'); process.exit(1); }
const out = js.replace(re, () => 'var LIBRARY_TEXT = ' + JSON.stringify(lib) + ';');
fs.writeFileSync(f, out);
console.log('embedded ' + lib.length + ' characters');
