#!/usr/bin/env node
/*
 * Regression, 28 Oct 2026. Waqas: "what are these changes, I cant make sense of them and I made no changes
 * +when you collapse the side nav all the horizontal nav pills collapse on every page".
 *
 * What happened: opening a project runs migrateLegacyMultiTraces (data_ops_modules.js), which gives every FHA row a
 * copy of its function id as a one-item list (subId "SF-001" -> subIds ["SF-001"]). The AI draft record (ai_audit.js)
 * read that as an edit of every AI-drafted row, wrote an edit record and a new fingerprint on each, and the change list
 * (change_ack.js) offered those records as the person's changes: 369 "Changed" rows of "ai seen" and "ai edits".
 * Two saved projects already carried such false records (185 and 74 rows).
 *
 *   [A] the record, alone: a list that only mirrors its field is not content; a real second function is; false records
 *       already saved are taken out and nothing else is; a real edit is still recorded
 *   [B] in the real app, through the real open path (window.__slabOpenProjectFile):
 *       B1 opening a project whose AI rows have no subIds yet: the load step adds them, nothing is recorded, nothing waits
 *       B2 opening a project that carries the false records: they are taken out, the journal says so, nothing waits
 *       B3 a person's own edit of an AI row: recorded, listed with the field they changed and without "ai seen"/"ai edits"
 *       B4 an app change to an AI row outside the person's change: recorded unsigned ("sync or load"), never listed
 *   [C] the menu collapsed: the page pills keep their names; the menu's own labels still hide
 * MUTATE=<name> reverts one guard; each must turn the test red.
 * Run: node tests/regression_ai_audit_mirror_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const MUTATIONS = {
  mirror: ['site/ai_audit.js', "            if (_isMirror(k, v, row[MIRRORS[k]])) return;\n", ''],
  clean:  ['site/ai_audit.js', "        var cleaned = _dropMirrorEdits(row);", "        var cleaned = 0;"],
  audit:  ['site/change_ack.js', "LAYOUT_FIELDS[k] || AUDIT_FIELDS[k] || ", "LAYOUT_FIELDS[k] || "],
  person: ['site/ai_audit.js', "sweep({ local: _personNow() })", "sweep({ local: true })"],
  css:    ['site/safety_lab.css', "body.nav-sidebar.nav-rail .app-sidebar .asb-lbl,", "body.nav-sidebar.nav-rail .asb-lbl,"]
};
const MUT = process.env.MUTATE || '';
function read(p) {
  let s = fs.readFileSync(path.join(REPO, p), 'utf8');
  if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation'); process.exit(3); } if (m[0] === p) { if (s.indexOf(m[1]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(4); } s = s.split(m[1]).join(m[2]); } }
  return s;
}
function mod() {
  const sb = { console, Math, JSON, String, Array, Object, Date, Number, projectConfig: {}, SLAvatar: { me: () => ({ name: 'K. Lee' }) } };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(read('site/ai_audit.js'), sb, { filename: 'ai_audit.js' });
  return sb.SLAiAudit;
}
const ROW = () => ({ internalId: 'r1', fcId: 'SF-001-M', subId: 'SF-001', fcDesc: 'Erroneous forward thrust, crew aware', phases: 'Standing, Taxi',
  effAc: 'Slight reduction in functional capabilities.', severity: 'Minor', sevBasis: 'MIN-1', realized: true, assumptionIds: ['ASM-AC-001', 'ASM-AC-002'],
  aiGenerated: true, aiFeature: 'fha.populate', aiAt: '2026-10-25T16:59:06.362Z' });

(async function main() {
  console.log('\n[A] the AI draft record, alone');
  {
    const A = mod(), H = r => A.fingerprint(JSON.stringify(A.fields(r)));
    const r = ROW(); A.observe(r, { local: false }); const seen = r.aiSeen;
    const m = JSON.parse(JSON.stringify(r)); m.subIds = ['SF-001'];
    check('the load step\'s copy of the function id changes nothing the record reads', H(m) === seen);
    check('... and opening again records no edit', A.observe(m, { local: false }) === null && !m.aiEdits);
    const e = JSON.parse(JSON.stringify(r)); e.subId = ''; e.subIds = [];
    const e0 = JSON.parse(JSON.stringify(r)); e0.subId = '';
    check('an empty list beside an empty field is not content either', H(e) === H(e0));
    const two = JSON.parse(JSON.stringify(r)); two.subIds = ['SF-001', 'SF-002'];
    check('a real second function is content: it is recorded as an edit', A.observe(two, { local: true }) === 'edit' && two.aiEdits[0].diff.some(d => d.field === 'subIds' && d.to === 'SF-001, SF-002'));
    // a row saved with the false record the old sweep wrote
    const f = JSON.parse(JSON.stringify(r)); f.subIds = ['SF-001']; f.aiEdits = [{ at: '2026-10-28T07:45:44.244Z', by: '', via: 'edit', diff: [{ field: 'subIds', from: null, to: 'SF-001' }] }]; f.aiSeen = 'deadbeef';
    check('a false record already saved is taken out', A.observe(f, { local: false }) === 'cleaned' && !f.aiEdits && f.aiSeen === seen, JSON.stringify(f.aiEdits));
    const g = JSON.parse(JSON.stringify(r)); g.subIds = ['SF-001']; g.effAc = 'Changed by an engineer.';
    g.aiEdits = [{ at: 'x', by: 'K. Lee', via: 'edit', diff: [{ field: 'effAc', from: r.effAc, to: 'Changed by an engineer.' }, { field: 'subIds', from: null, to: 'SF-001' }] }];
    const rg = A.observe(g, { local: false });
    check('a record that also holds a real edit keeps the real edit, with its author', rg === 'cleaned' && g.aiEdits.length === 1 && g.aiEdits[0].by === 'K. Lee' && JSON.stringify(g.aiEdits[0].diff.map(d => d.field)) === '["effAc"]', rg + ' ' + JSON.stringify(g.aiEdits));
    const o = ROW(); o.subIds = ['SF-001']; A.observe(o, { local: false });
    check('a row drafted after the load step (its original holds the copy) is not called edited either', !('subIds' in o.aiOriginal) && A.observe(o, { local: false }) === null);
    const p = JSON.parse(JSON.stringify(r)); p.effAc = 'An engineer rewrote this.';
    check('a real edit is still recorded, signed', A.observe(p, { local: true }) === 'edit' && p.aiEdits[0].by === 'K. Lee' && p.aiEdits[0].diff[0].field === 'effAc');
  }

  console.log('\n[B] in the real app, through the real open path');
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [A] proves the record');
  else {
    const http = require('http'), SITE = path.join(REPO, 'site');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const rel = 'site/' + path.relative(SITE, f).split(path.sep).join('/'); if (MUT && MUTATIONS[MUT][0] === rel) b = Buffer.from(read(rel));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const b = await pw.chromium.launch();
    const wait = ms => new Promise(r => setTimeout(r, ms));
    try {
      const pg = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await wait(3500);
      await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
      await pg.evaluate(async () => { await loadSampleProject(); }); await wait(3000);
      // a project as it is saved after an AI draft: every FHA row AI-drafted and audited, no subIds yet
      const build = (withFalse) => pg.evaluate((withFalse) => {
        const d = JSON.parse(JSON.stringify(_slabBuildProjectExport()));
        const A = SLAiAudit, H = r => A.fingerprint(JSON.stringify(A.fields(r)));
        (d.acFhaData || []).forEach(r => {
          delete r.subIds; Object.keys(r).forEach(k => { if (/^ai[A-Z]/.test(k)) delete r[k]; });
          r.aiGenerated = true; r.aiFeature = 'fha.populate'; r.aiAt = '2026-10-25T16:59:06.362Z';
          r.aiOriginal = A.fields(r); r.aiSeen = H(r);
          if (withFalse && r.subId) { r.aiEdits = [{ at: '2026-10-28T07:45:44.244Z', by: '', via: 'edit', diff: [{ field: 'subIds', from: null, to: String(r.subId) }] }]; r.aiSeen = 'deadbeef'; }
        });
        return JSON.stringify(d);
      }, withFalse);
      const open = async (txt) => { await pg.evaluate(() => { try { SLChangeAck._setTestAnswer('discard'); } catch (_) {} }); const r = await pg.evaluate(t => window.__slabOpenProjectFile(t), txt); await wait(1500); await pg.mouse.click(1200, 900); await wait(5000); return r; };
      const state = () => pg.evaluate(() => ({ rows: acFhaData.length, ai: acFhaData.filter(r => r.aiGenerated).length, withSubIds: acFhaData.filter(r => Array.isArray(r.subIds)).length,
        edited: acFhaData.filter(r => (r.aiEdits || []).length).length, count: SLChangeAck.count(), lines: SLChangeAck.lines().length,
        moved: acFhaData.filter(r => r.aiSeen !== SLAiAudit.fingerprint(JSON.stringify(SLAiAudit.fields(r)))).length,
        jr: ((projectConfig.journal && projectConfig.journal.entries) || []).filter(e => /AI draft record: took out/.test(JSON.stringify(e))).length }));

      const t1 = await build(false); const o1 = await open(t1); const s1 = await state();
      check('B1 the project opened', o1 && o1.ok !== false && s1.ai > 3, JSON.stringify(o1) + ' ' + JSON.stringify(s1));
      check('B1 the load step ran (every row has its list)', s1.withSubIds === s1.rows, JSON.stringify(s1));
      check('B1 no AI-drafted row is recorded as edited', s1.edited === 0, JSON.stringify(s1));
      check('B1 nothing waits to be confirmed', s1.count === 0 && s1.lines === 0, JSON.stringify(s1));

      const t2 = await build(true); await open(t2); const s2 = await state();
      check('B2 the false records saved in a project are taken out', s2.edited === 0 && s2.moved === 0, JSON.stringify(s2));
      check('B2 the project journal says so', s2.jr >= 1, JSON.stringify(s2));
      check('B2 nothing waits to be confirmed', s2.count === 0 && s2.lines === 0, JSON.stringify(s2));

      // B3: the person edits an AI row's text
      await pg.mouse.click(1200, 900);
      await pg.evaluate(() => { SLChangeAck._markInput(); const r = acFhaData.find(x => x.aiGenerated); r.effAc = 'An engineer rewrote this effect.'; if (typeof noteChange === 'function') noteChange(); scheduleAutosave(); });
      await wait(2500);
      const s3 = await pg.evaluate(() => { const r = acFhaData.find(x => x.aiGenerated); return { edits: r.aiEdits || [], lines: SLChangeAck.lines() }; });
      const fieldsShown = s3.lines.flatMap(l => (l.fields || []).map(f => f.name));
      check('B3 the edit is recorded on the row', s3.edits.length === 1 && s3.edits[0].via === 'edit' && s3.edits[0].diff.map(d => d.field).join() === 'effAc', JSON.stringify(s3.edits));
      check('B3 it is listed as the person\'s change, with the field they changed', s3.lines.length === 1 && fieldsShown.some(n => /eff/i.test(n)), JSON.stringify(s3.lines));
      check('B3 ... and without "ai seen" or "ai edits"', !fieldsShown.some(n => /^ai /i.test(n)), JSON.stringify(fieldsShown));
      await pg.evaluate(() => { try { SLChangeAck._setTestAnswer('discard'); } catch (_) {} }); await pg.evaluate(() => SLChangeAck.ask({ reason: 'test' })); await wait(800);

      // B4: the app (not the person) changes an AI row's text
      await wait(3500);
      await pg.evaluate(() => { SLChangeAck.background(() => { const r = acFhaData.filter(x => x.aiGenerated)[1]; r.comments = (r.comments || '') + ' Routed by the app.'; }); scheduleAutosave(); });
      await wait(4500);
      const s4 = await pg.evaluate(() => { const r = acFhaData.filter(x => x.aiGenerated)[1]; return { edits: r.aiEdits || [], count: SLChangeAck.count() }; });
      check('B4 an app change is recorded, not signed with the person\'s name', s4.edits.length === 1 && s4.edits[0].via === 'sync or load' && s4.edits[0].by === '', JSON.stringify(s4.edits));
      check('B4 ... and not offered as the person\'s change', s4.count === 0, JSON.stringify(s4));

      console.log('\n[C] the menu collapsed');
      const c = await pg.evaluate(() => {
        if (!document.body.classList.contains('nav-rail')) toggleNavRail();
        SLNavAreas.open('admin');
        const pills = Array.from(document.querySelectorAll('#sl-areabar .asb-item, #sl-areabar .sl-ab-grp'));
        const out = { n: pills.length, blank: pills.filter(p => p.getBoundingClientRect().width < 40 || !p.innerText.trim()).map(p => p.id || p.className), names: pills.map(p => p.innerText.trim()) };
        const side = Array.from(document.querySelectorAll('.app-sidebar .asb-nav > .asb-item .asb-lbl, .app-sidebar .asb-nav > .asb-grp > summary .asb-lbl'));
        out.sideShown = side.filter(l => l.getBoundingClientRect().width > 0).length; out.side = side.length;
        toggleNavRail(); return out;
      });
      check('C the page pills keep their names with the menu collapsed', c.n === 3 && !c.blank.length && c.names.join('|') === 'Connections|Workspaces and locks|Seats and license', JSON.stringify(c));
      check('C the collapsed menu still hides its own labels', c.side >= 1 && c.sideShown === 0, JSON.stringify(c));
      check('no page errors', errs.length === 0, errs.join(' | '));
    } finally { await b.close(); srv.close(); }
  }

  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (MUTATE=' + MUT + ')' : ''));
  if (!MUT && !process.env.NOMUT) {
    console.log('\n[M] every guard, reverted, turns this test red');
    const cp = require('child_process');
    // audit, person and css are caught only by [B] and [C], which need a browser: without one they are skipped, not
    // passed (mirror and clean are caught by [A] everywhere).
    let hasPw = false; try { require.resolve('playwright'); hasPw = true; } catch (_) {}
    for (const k of Object.keys(MUTATIONS)) {
      if (!hasPw && ['audit', 'person', 'css'].indexOf(k) >= 0) { console.log('  SKIP  mutation ' + k + ' (needs the browser checks)'); continue; }
      const r2 = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 300000 });
      check('mutation ' + k + ' goes red', r2.status === 1, (r2.stdout || '').split('\n').filter(l => /FAIL/.test(l)).slice(0, 3).join(' ') + (r2.stderr || '').slice(0, 300));
    }
    console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
