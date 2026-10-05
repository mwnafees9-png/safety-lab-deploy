#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): the customer install package and the guide that sends people to it.
 *
 * FOUND: the zip built on 2 Oct was never uploaded, and by 5 Oct it was out of date. The 3 Oct
 * security work changed how the administrator is made (the all-in-one script creates the account
 * and prints a temporary password; with no mail server, users come from add-user.sh) and added
 * three database files. Guide Rev 2.1 still told the customer to run the old administrator
 * command, and named a zip dated 2 Oct. Uploading that zip would have shipped the older kit.
 *
 * THE RULES.
 *   1. The package is built by package-customer-install.sh from a COMMIT, never the working tree.
 *   2. Its name is the address the current guide gives the customer, read from the guide.
 *   3. Only the current guide revision is inside it; withdrawn revisions never reach a customer.
 *   4. Nothing secret is inside it.
 *   5. What the guide says about the administrator matches what the kit does.
 * Rules 1 to 4 are EXECUTED against a throwaway git repo; rule 4 and the real package are also
 * executed against this repo's HEAD.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const KIT = path.join(ROOT, 'customer-install');
const SCRIPT = path.join(ROOT, 'package-customer-install.sh');
const sh = (cmd, opts) => cp.spawnSync('bash', ['-c', cmd], Object.assign({ encoding: 'utf8' }, opts || {}));
const unzipText = (file, entry) => sh(`unzip -p ${JSON.stringify(file)} ${entry}`).stdout || '';
const plain = xml => xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// ---------------------------------------------------------------- the guide in the working tree
const guides = fs.readdirSync(KIT).filter(f => /^SL-DG-0001 .* v[\d.]+\.docx$/.test(f))
  .sort((a, b) => a.match(/v([\d.]+)\.docx$/)[1].localeCompare(b.match(/v([\d.]+)\.docx$/)[1], 'en', { numeric: true }));
const cur = guides[guides.length - 1];
const rev = cur.match(/v([\d.]+)\.docx$/)[1];
const docx = path.join(KIT, cur);
const body = plain(unzipText(docx, 'word/document.xml'));
const header = plain(unzipText(docx, 'word/header1.xml'));
check('the current guide has a PDF beside it', fs.existsSync(docx.replace(/\.docx$/, '.pdf')));
check(`the page header says Rev ${rev}`, header.includes('Rev ' + rev), header);
check(`document control says revision ${rev}`, new RegExp('Revision\\n' + rev.replace('.', '\\.') + '\\n').test(body));
const urls = [...new Set(body.match(/https:\/\/updates\.safetylabaero\.com\/customer-install\/[A-Za-z0-9._-]+\.zip/g) || [])];
check('the guide names exactly one package address', urls.length === 1, urls.join(', '));
check('the package name carries its build date', /\/SafetyLabAero-customer-install-\d{4}-\d{2}-\d{2}\.zip$/.test(urls[0] || ''));

// rule 5: what the guide says about the administrator is what the kit does
check('the guide no longer says to make yourself administrator by command after install',
  !/Make yourself the administrator \(once\)/.test(body) && !/under For the administrator only/.test(body));
check('section 4.1: create and confirm the account BEFORE naming it administrator',
  /First create your account in the application[\s\S]{0,300}Confirm email[\s\S]{0,200}Only then/.test(body));
check('section 4.5 lists the administrator email question', /the administrator.s email address/.test(body));
check('section 4.5 says the temporary password is shown once', /temporary password\. They are shown this once/.test(body));
check('section 4.5 names add-user.sh for a server with no mail server', /\.\/add-user\.sh person@yourcompany\.com/.test(body));
const install = fs.readFileSync(path.join(KIT, 'selfhost', 'install.sh'), 'utf8');
check('...and the kit really asks for the administrator email', /read -r -p "   Administrator email: "/.test(install));
check('...and really prints the administrator sign-in once', /Your administrator sign-in/.test(install) && /if \[ -n "\$ADMIN_PW" \]/.test(install));
check('...and add-user.sh is in the kit', fs.existsSync(path.join(KIT, 'selfhost', 'add-user.sh')));
check('...and apply.sh tells the operator to confirm the address first', /Confirm email/.test(fs.readFileSync(path.join(KIT, 'db', 'apply.sh'), 'utf8')));
const footer = plain(unzipText(docx, 'word/footer1.xml'));
check('no em dash anywhere in the guide: body, page header or page footer', !/\u2014/.test(body + header + footer), footer);

// ---------------------------------------------------------------- the packager, executed in a throwaway repo
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-'));
const mkGuide = (dir, name, r, urlsIn) => {
  const g = path.join(T, 'g-' + Math.random().toString(36).slice(2)); fs.mkdirSync(path.join(g, 'word'), { recursive: true });
  fs.writeFileSync(path.join(g, 'word', 'document.xml'), '<w:document><w:p><w:t>' + urlsIn.join(' ') + '</w:t></w:p></w:document>');
  fs.writeFileSync(path.join(g, 'word', 'header1.xml'), '<w:hdr><w:t>SL-DG-0001 Rev ' + r + '</w:t></w:hdr>');
  sh(`cd ${JSON.stringify(g)} && zip -qr ${JSON.stringify(path.join(dir, name + '.docx'))} word`);
  fs.writeFileSync(path.join(dir, name + '.pdf'), '%PDF-fake');
};
const repo = path.join(T, 'repo'); const kit = path.join(repo, 'customer-install');
fs.mkdirSync(path.join(kit, 'selfhost'), { recursive: true });
fs.copyFileSync(SCRIPT, path.join(repo, 'package-customer-install.sh'));
fs.writeFileSync(path.join(kit, 'selfhost', 'install.sh'), 'echo hi\n');
mkGuide(kit, 'SL-DG-0001 Deployment Guide v1.0', '1.0', ['https://updates.safetylabaero.com/customer-install/SafetyLabAero-customer-install-2026-09-07.zip']);
mkGuide(kit, 'SL-DG-0001 Deployment and Setup Guide v2.0', '2.0', []);
mkGuide(kit, 'SL-DG-0001 Deployment and Setup Guide v2.1', '2.1', ['https://updates.safetylabaero.com/customer-install/SafetyLabAero-customer-install-2026-10-05.zip']);
const git = c => sh(`cd ${JSON.stringify(repo)} && ${c}`);
git('git init -q && git config user.email t@t && git config user.name t && git add -A && git commit -qm kit');
const out = path.join(T, 'out');
const run = env => sh(`cd ${JSON.stringify(repo)} && bash package-customer-install.sh`, { env: Object.assign({}, process.env, { SLAB_PACKAGE_OUT: out }, env || {}) });
let r = run();
const zip = path.join(out, 'SafetyLabAero-customer-install-2026-10-05.zip');
check('the zip is named from the guide address', r.status === 0 && fs.existsSync(zip), r.stdout + r.stderr);
const list = fs.existsSync(zip) ? sh(`unzip -Z1 ${JSON.stringify(zip)}`).stdout.split('\n').filter(Boolean) : [];
check('only the current guide revision is inside', list.filter(f => /SL-DG-0001/.test(f)).sort().join('|') ===
  'customer-install/SL-DG-0001 Deployment and Setup Guide v2.1.docx|customer-install/SL-DG-0001 Deployment and Setup Guide v2.1.pdf', list.join(', '));
check('the kit itself is inside', list.includes('customer-install/selfhost/install.sh'));
check('the upload command is printed, not run', /npx wrangler r2 object put "safetylab-downloads\/customer-install\/SafetyLabAero-customer-install-2026-10-05\.zip"/.test(r.stdout) && !/Creating object/.test(r.stdout));

fs.writeFileSync(path.join(kit, 'selfhost', 'install.sh'), 'echo changed\n');
r = run();
check('an uncommitted kit change refuses the build', r.status !== 0 && /uncommitted changes/.test(r.stderr), r.stderr);
git('git checkout -q -- .');

fs.writeFileSync(path.join(kit, 'selfhost', 'radia.lic'), 'x'); git('git add -f -A && git commit -qm lic');
r = run();
check('a licence file in the kit refuses the build and leaves no zip', r.status !== 0 && /would contain/.test(r.stderr) && !fs.existsSync(zip), r.stderr);
git('git rm -q customer-install/selfhost/radia.lic && git commit -qm unlic');

mkGuide(kit, 'SL-DG-0001 Deployment and Setup Guide v2.1', '2.1', ['https://updates.safetylabaero.com/customer-install/SafetyLabAero-customer-install-2026-10-05.zip', 'https://updates.safetylabaero.com/customer-install/SafetyLabAero-customer-install-2026-10-02.zip']);
git('git add -A && git commit -qm two');
r = run();
check('a guide naming two package addresses refuses the build', r.status !== 0 && /exactly one package address/.test(r.stderr), r.stderr);

mkGuide(kit, 'SL-DG-0001 Deployment and Setup Guide v2.1', '2.0', ['https://updates.safetylabaero.com/customer-install/SafetyLabAero-customer-install-2026-10-05.zip']);
git('git add -A && git commit -qm hdr');
r = run();
check('a page header that disagrees with the file revision refuses the build', r.status !== 0 && /does not say Rev 2\.1/.test(r.stderr), r.stderr);

// ---------------------------------------------------------------- the real package, from this repo's HEAD
r = sh(`cd ${JSON.stringify(ROOT)} && bash package-customer-install.sh`, { env: Object.assign({}, process.env, { SLAB_PACKAGE_OUT: path.join(T, 'real'), SLAB_PACKAGE_ALLOW_DIRTY: '1' }) });
const real = (r.stdout.match(/Built (\S+\.zip)/) || [])[1];
check('the real package builds from HEAD', r.status === 0 && real, r.stderr);
if (real) {
  const rl = sh(`unzip -Z1 ${JSON.stringify(real)}`).stdout.split('\n').filter(Boolean);
  const dbFiles = fs.readdirSync(path.join(KIT, 'db')).filter(f => /^\d\d_.*\.sql$/.test(f));
  check('the real package carries every numbered database file', dbFiles.every(f => rl.includes('customer-install/db/' + f)));
  check('the real package carries add-user.sh', rl.includes('customer-install/selfhost/add-user.sh'));
  check('the real package holds no withdrawn guide', rl.filter(f => /SL-DG-0001/.test(f)).length === 2);
}
fs.rmSync(T, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
