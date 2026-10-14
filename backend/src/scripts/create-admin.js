/**
 * Create (or reset) the first super admin on a fresh production database.
 *
 *   npm run create-admin -- --name "Admin Name" --mobile 9876543210 --email admin@ahcl.in --password "S3cure-Pass!"
 *
 * Re-running with an existing mobile resets that user's password and makes them super admin.
 */
import { parseArgs } from 'node:util';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/index.js';

const { values } = parseArgs({
  options: { name: { type: 'string' }, mobile: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' } },
});

if (!values.name || !values.mobile || !values.password) {
  console.error('Usage: npm run create-admin -- --name "Name" --mobile 9876543210 [--email you@ahcl.in] --password "min 8 chars"');
  process.exit(1);
}
if (values.password.length < 8 || !/\d/.test(values.password) || !/[A-Za-z]/.test(values.password)) {
  console.error('Password must be at least 8 characters and contain a letter and a digit.');
  process.exit(1);
}
if (!env.mongoUri) {
  console.error('Set MONGO_URI first – this script writes to your real database.');
  process.exit(1);
}

await connectDb();
let user = await User.findOne({ mobile: values.mobile });
if (!user) user = new User({ name: values.name, mobile: values.mobile, userType: 'employee', role: 'super_admin', employeeCode: 'ADMIN001' });
Object.assign(user, { name: values.name, role: 'super_admin', userType: 'employee', isBlocked: false });
if (values.email) user.email = values.email.toLowerCase();
await user.setPassword(values.password);
user.tokenVersion += 1;
await user.save();
console.log(`Super admin ready: ${user.name} (${user.mobile}). Sign in to the admin panel with this mobile and password.`);
await disconnectDb();
