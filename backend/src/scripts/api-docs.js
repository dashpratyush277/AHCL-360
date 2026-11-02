/**
 * Generates API documentation from the route source files:
 *   docs/api/API.md                          – endpoint list per module
 *   docs/api/AHCL360.postman_collection.json – import into Postman (set baseUrl + token)
 *
 *   npm run api-docs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROUTES = path.join(ROOT, 'backend', 'src', 'routes');
const OUT = path.join(ROOT, 'docs', 'api');

// Mount points from app.js
const MOUNTS = {
  'auth.js': ['/api/auth', 'Authentication (public except where noted)'],
  'files.js': ['/api/files', 'Encrypted file upload / download'],
  'attendance.js': ['/api/attendance', 'Attendance (employees)'],
  'tracking.js': ['/api/tracking', 'GPS tracking (employees)'],
  'visits.js': ['/api/visits', 'Client visits (employees)'],
  'hr.js': ['/api/hr', 'HR: leave, holidays, payslips, documents, KYC'],
  'expenses.js': ['/api/expenses', 'Expense claims'],
  'team.js': ['/api/team', 'Team management (managers)'],
  'reports.js': ['/api/reports', 'PDF / Excel reports'],
  'sync.js': ['/api/sync', 'Offline sync'],
  'analytics.js': ['/api/analytics', 'Dashboards'],
  'admin.js': ['/api/admin', 'Administration (admins only)'],
  'sales.js': ['/api', 'Products, distributors, stock, DSO, targets'],
  'partner.js': ['/api', 'Orders, invoices, credit notes, retailers, claims'],
  'common.js': ['/api', 'Profile, notifications, support'],
};

const simpleRe = /\br\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;

/** The /** ... *\/ or // comment directly above a route (nothing but whitespace in between). */
function docComment(src, index) {
  const before = src.slice(0, index).trimEnd();
  if (before.endsWith('*/')) {
    const start = before.lastIndexOf('/*'); // the block right above – section dividers (/* ---) don't count
    if (start === -1 || before.slice(start, start + 3) !== '/**') return '';
    return before.slice(start + 3, -2).replace(/^\s*\*\s?/gm, ' ').replace(/\s+/g, ' ').trim();
  }
  const line = before.slice(before.lastIndexOf('\n') + 1).trim();
  return line.startsWith('//') ? line.slice(2).trim() : '';
}

const modules = [];
for (const [file, [base, title]] of Object.entries(MOUNTS)) {
  const src = fs.readFileSync(path.join(ROUTES, file), 'utf8');
  const endpoints = [];
  for (const m of src.matchAll(simpleRe)) {
    const head = src.slice(m.index, src.indexOf('async (', m.index));
    const roles = /authorize\((ADMINS|MANAGERS)\)/.exec(head)?.[1];
    const full = `${base}${m[2] === '/' ? '' : m[2]}`;
    const isPublic = file === 'auth.js' && !/authenticate/.test(head);
    endpoints.push({
      method: m[1].toUpperCase(),
      path: full,
      roles: isPublic ? 'public' : roles === 'ADMINS' ? 'admin' : roles === 'MANAGERS' ? 'manager/admin' : '',
      note: docComment(src, m.index),
    });
  }
  if (file === 'admin.js') endpoints.forEach((e) => (e.roles = 'admin'));
  modules.push({ file, title, endpoints });
}

fs.mkdirSync(OUT, { recursive: true });
let md = '# AHCL 360 API reference\n\nGenerated from the route files by `npm run api-docs`. All endpoints are JSON over HTTPS.\n\n';
md += '* **Auth:** `Authorization: Bearer <accessToken>` (from `/api/auth/login`, `/api/auth/otp/verify` or `/api/auth/mfa/verify`). Access tokens last 15 minutes; renew with `/api/auth/refresh`.\n';
md += '* **Scope:** every list and record is filtered on the server by role (employee → own data, manager → team, admin → all; partner → own distributor, super distributor → + child distributors). Records outside your scope answer **404**.\n';
md += '* **Errors:** `{ "error": "message", "details": [{ "path", "message" }] }` with 400/401/403/404/409/429/5xx.\n* **Paging:** list endpoints accept `?page=&limit=` and return `{ items, total, page, limit }`.\n\n';
let total = 0;
for (const m of modules) {
  md += `## ${m.title}\n\n| Method | Path | Access | Notes |\n|---|---|---|---|\n`;
  for (const e of m.endpoints) md += `| ${e.method} | \`${e.path}\` | ${e.roles || 'signed-in'} | ${e.note.replace(/\|/g, '\\|')} |\n`;
  md += '\n';
  total += m.endpoints.length;
}
md = md.replace('All endpoints are JSON', `${total} endpoints, JSON`);
fs.writeFileSync(path.join(OUT, 'API.md'), md);

const toUrl = (p) => {
  const segs = p.replace(/^\/api/, '').split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `{{${s.slice(1)}}}` : s));
  return { raw: `{{baseUrl}}/${segs.join('/')}`, host: ['{{baseUrl}}'], path: segs };
};
const collection = {
  info: { name: 'AHCL 360 API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Set baseUrl (e.g. https://ahcl360.onrender.com/api) and token (accessToken from a login call).' },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'https://ahcl360.onrender.com/api' }, { key: 'token', value: '' }],
  item: modules.map((m) => ({
    name: m.title,
    item: m.endpoints.map((e) => ({
      name: `${e.method} ${e.path.replace(/^\/api/, '')}`,
      request: { method: e.method, url: toUrl(e.path), description: e.note, ...(['POST', 'PUT', 'PATCH'].includes(e.method) ? { header: [{ key: 'Content-Type', value: 'application/json' }], body: { mode: 'raw', raw: '{}' } } : {}) },
    })),
  })),
};
fs.writeFileSync(path.join(OUT, 'AHCL360.postman_collection.json'), JSON.stringify(collection, null, 2));
console.log(`Documented ${total} endpoints in ${modules.length} modules -> docs/api/`);
