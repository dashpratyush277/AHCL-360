/**
 * Runs the full test suite with coverage and writes docs/TEST_REPORT.md.
 *   npm run test:report
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const backend = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = fs.readdirSync(path.join(backend, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`);
const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', '--test-reporter=tap', ...files], { cwd: backend, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const out = run.stdout + run.stderr;

// TAP: "ok N - name" / "not ok N - name", indented per suite level
const lines = out.split('\n');
const rows = [];
for (const l of lines) {
  const m = /^(\s*)(not ok|ok) \d+ - (.+?)(?: # .*)?$/.exec(l);
  if (m) rows.push({ depth: m[1].length / 4, ok: m[2] === 'ok', name: m[3] });
}
// In TAP a suite's result line comes right after its (more indented) children – skip those suite lines.
const leaf = rows.filter((r, i) => !(i > 0 && rows[i - 1].depth > r.depth));
const passed = leaf.filter((r) => r.ok).length;

const cov = [];
let inCov = false;
for (const l of lines) {
  if (l.includes('start of coverage report')) inCov = true;
  else if (l.includes('end of coverage report')) inCov = false;
  else if (inCov && /\|/.test(l)) cov.push(l.replace(/^#\s?/, ''));
}
const total = cov.find((l) => l.includes('all files'));

let md = `# AHCL 360 – automated test report\n\nGenerated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST by \`npm run test:report\` (Node ${process.version}).\n\n`;
md += `**Result: ${passed} / ${leaf.length} tests passed.**`;
if (total) md += ` Overall coverage: \`${total.split('|').slice(1, 4).map((s) => s.trim()).join(' / ')}\` (line % / branch % / function %).`;
md += '\n\nEach test starts a fresh in-memory MongoDB, loads the demo data and calls the real HTTP API.\n';
md += 'Tests prefixed **T01–T11** map to the QA sign-off cases in section 11 of the AHCL review; **P0** to its mandatory fixes.\n\n## Tests\n\n| Result | Test |\n|---|---|\n';
for (const r of leaf) md += `| ${r.ok ? '✅ pass' : '❌ FAIL'} | ${r.name.replace(/\|/g, '\\|')} |\n`;
md += '\n## Coverage by file\n\n```\n' + cov.filter((l) => !/^\s*-+\s*$/.test(l)).join('\n') + '\n```\n';
md += '\n## Not covered by automated tests (manual / device)\n\n* T03 device part (location permission denied on the phone), T09 (force close, reboot, poor network, battery saver) and T12 (pilot load) – run on real Android devices during the pilot.\n* Visual layout of the mobile app and admin panel – reviewed on device/browser during the recorded demo.\n';
fs.writeFileSync(path.resolve(backend, '..', 'docs', 'TEST_REPORT.md'), md);
console.log(`${passed}/${leaf.length} passed – docs/TEST_REPORT.md written`);
process.exit(passed === leaf.length ? 0 : 1);
