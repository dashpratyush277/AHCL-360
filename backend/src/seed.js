/**
 * Demo data. Run `npm run seed` (add `-- --reset` to wipe first).
 * Default password for every seeded account: Password@123
 */
import mongoose from 'mongoose';
import {
  Attendance, Distributor, Geofence, Holiday, LocationPing, Order, Payslip, Product, Retailer,
  SalesOrder, Target, Territory, User, Visit, WorkReport, Expense, nextNumber,
} from './models/index.js';
import { createInvoiceForOrder, priceOrderItems } from './services/billing.js';
import { recordStock } from './services/stock.js';
import { dayKey, monthKey, quarterKey } from './utils/dates.js';

const PASSWORD = 'Password@123';

async function mkUser(data) {
  const u = new User(data);
  await u.setPassword(PASSWORD);
  return u.save();
}

export async function seed({ reset = false } = {}) {
  if (reset) await mongoose.connection.db.dropDatabase();
  if (await User.exists({})) {
    console.log('[seed] data already present - skipping (use --reset to reseed)');
    return;
  }

  const east = await Territory.create({ name: 'Odisha East', code: 'OD-E', region: 'East' });
  const west = await Territory.create({ name: 'Odisha West', code: 'OD-W', region: 'East' });

  // Office geofence (Bhubaneswar). Not enforced, so remote demo check-ins work but get flagged.
  await Geofence.create({ name: 'Head Office', kind: 'office', center: { lat: 20.2961, lng: 85.8245 }, radiusM: 300, enforce: false });

  const superAdmin = await mkUser({ name: 'Super Admin', mobile: '9000000001', email: 'admin@ahcl.test', userType: 'employee', role: 'super_admin', employeeCode: 'AHCL001', profile: { designation: 'Super Admin', department: 'IT' } });
  const manager = await mkUser({ name: 'Rakesh Mohanty', mobile: '9000000002', email: 'manager@ahcl.test', userType: 'employee', role: 'manager', employeeCode: 'AHCL002', territory: east._id, manager: superAdmin._id, profile: { designation: 'Area Sales Manager', department: 'Sales' }, salary: { basic: 40000, hra: 16000, allowances: 8000, deductions: 4800 }, travelMode: 'car' });
  const fe1 = await mkUser({ name: 'Sneha Das', mobile: '9000000003', email: 'sneha@ahcl.test', userType: 'employee', role: 'field_executive', employeeCode: 'AHCL003', territory: east._id, manager: manager._id, profile: { designation: 'Sales Executive', department: 'Sales' }, salary: { basic: 22000, hra: 8800, allowances: 4000, deductions: 2640 } });
  const fe2 = await mkUser({ name: 'Amit Sahoo', mobile: '9000000004', email: 'amit@ahcl.test', userType: 'employee', role: 'field_executive', employeeCode: 'AHCL004', territory: west._id, manager: manager._id, profile: { designation: 'Sales Executive', department: 'Sales' }, salary: { basic: 21000, hra: 8400, allowances: 4000, deductions: 2520 } });
  await mkUser({ name: 'Priya Nayak', mobile: '9000000005', email: 'hr@ahcl.test', userType: 'employee', role: 'admin', employeeCode: 'AHCL005', manager: superAdmin._id, profile: { designation: 'HR & Admin', department: 'HR' } });

  const products = await Product.insertMany([
    { sku: 'AHCL-FRT-01', name: 'Organic Fertilizer 5kg', category: 'Fertilizers', unit: 'bag', price: 320, mrp: 399, gstRate: 5, hsn: '3101', defaultReorderLevel: 40 },
    { sku: 'AHCL-FRT-02', name: 'NPK Blend 25kg', category: 'Fertilizers', unit: 'bag', price: 1150, mrp: 1399, gstRate: 5, hsn: '3105', defaultReorderLevel: 20 },
    { sku: 'AHCL-PST-01', name: 'Bio Pesticide 1L', category: 'Crop Protection', unit: 'btl', price: 540, mrp: 650, gstRate: 18, hsn: '3808', defaultReorderLevel: 30 },
    { sku: 'AHCL-PST-02', name: 'Fungicide 500ml', category: 'Crop Protection', unit: 'btl', price: 410, mrp: 499, gstRate: 18, hsn: '3808', defaultReorderLevel: 25 },
    { sku: 'AHCL-SED-01', name: 'Hybrid Paddy Seed 10kg', category: 'Seeds', unit: 'bag', price: 2100, mrp: 2450, gstRate: 0, hsn: '1006', defaultReorderLevel: 15 },
    { sku: 'AHCL-SED-02', name: 'Vegetable Seed Kit', category: 'Seeds', unit: 'kit', price: 180, mrp: 220, gstRate: 0, hsn: '1209', defaultReorderLevel: 50 },
    { sku: 'AHCL-MCR-01', name: 'Micronutrient Mix 1kg', category: 'Nutrients', unit: 'pkt', price: 260, mrp: 310, gstRate: 12, hsn: '3824', defaultReorderLevel: 40 },
  ]);

  const superDist = await Distributor.create({ name: 'Kalinga Agro Super Stockist', code: 'SD-OD-001', tier: 'super_distributor', gstin: '21AABCK1234A1Z5', stateCode: '21', contact: { person: 'Bijay Patra', mobile: '9100000001', email: 'kalinga@partner.test' }, address: 'Cuttack, Odisha', location: { lat: 20.4625, lng: 85.8828 }, territory: east._id, assignedEmployees: [manager._id], creditLimit: 1_000_000 });
  const dist = await Distributor.create({ name: 'Mahanadi Traders', code: 'DS-OD-101', tier: 'distributor', parent: superDist._id, gstin: '21AAFFM5678B1Z2', stateCode: '21', contact: { person: 'Sanjay Rout', mobile: '9100000002' }, address: 'Bhubaneswar, Odisha', location: { lat: 20.2961, lng: 85.8245 }, territory: east._id, assignedEmployees: [fe1._id], creditLimit: 300_000 });
  const stockist = await Distributor.create({ name: 'Sambalpur Krishi Kendra', code: 'ST-OD-201', tier: 'stockist', parent: superDist._id, gstin: '21AAGFS9012C1Z8', stateCode: '21', contact: { person: 'Manoj Behera', mobile: '9100000003' }, address: 'Sambalpur, Odisha', location: { lat: 21.4669, lng: 83.9812 }, territory: west._id, assignedEmployees: [fe2._id], creditLimit: 150_000 });

  await mkUser({ name: 'Bijay Patra', mobile: '9100000001', email: 'kalinga@partner.test', userType: 'partner', role: 'super_distributor', distributor: superDist._id });
  const distUser = await mkUser({ name: 'Sanjay Rout', mobile: '9100000002', email: 'mahanadi@partner.test', userType: 'partner', role: 'distributor', distributor: dist._id });
  await mkUser({ name: 'Manoj Behera', mobile: '9100000003', email: 'sambalpur@partner.test', userType: 'partner', role: 'stockist', distributor: stockist._id });

  // Opening stock + some movement
  for (const [d, mult] of [[dist, 1], [stockist, 0.6], [superDist, 3]]) {
    for (const p of products) {
      await recordStock({ distributor: d._id, product: p._id, type: 'in', qty: Math.round(80 * mult), reference: 'OPENING', date: new Date(Date.now() - 40 * 86_400_000), createdBy: superAdmin._id });
      await recordStock({ distributor: d._id, product: p._id, type: 'out', qty: Math.round((30 + Math.random() * 40) * mult), date: new Date(Date.now() - 10 * 86_400_000), createdBy: superAdmin._id });
    }
  }
  await recordStock({ distributor: dist._id, product: products[2]._id, type: 'return', qty: 4, reason: 'Leaking bottles', createdBy: fe1._id });
  await recordStock({ distributor: dist._id, product: products[0]._id, type: 'adjustment', delta: -2, reason: 'Damaged in storage', createdBy: distUser._id });

  const retailers = await Retailer.insertMany([
    { name: 'Ramesh Sahu', shopName: 'Sahu Krishi Bhandar', contact: { mobile: '9200000001' }, city: 'Bhubaneswar', pincode: '751002', location: { lat: 20.27, lng: 85.84 }, distributor: dist._id, distributorCode: dist.code, kyc: { gstin: '21ABCPS1234D1Z1', status: 'verified' }, createdBy: fe1._id },
    { name: 'Gita Pradhan', shopName: 'Pradhan Agro Store', contact: { mobile: '9200000002' }, city: 'Khordha', pincode: '752055', location: { lat: 20.18, lng: 85.62 }, distributor: dist._id, distributorCode: dist.code, createdBy: fe1._id },
    { name: 'Sunil Mishra', shopName: 'Mishra Seeds', contact: { mobile: '9200000003' }, city: 'Sambalpur', pincode: '768001', location: { lat: 21.47, lng: 83.97 }, distributor: stockist._id, distributorCode: stockist.code, createdBy: fe2._id },
  ]);

  // Orders in various states
  const mkOrder = async (distributor, user, items, status, daysAgo) => {
    const priced = await priceOrderItems(items);
    const at = new Date(Date.now() - daysAgo * 86_400_000);
    const order = await Order.create({ ...priced, orderNo: await nextNumber('ORD'), distributor: distributor._id, placedBy: user._id, shippingAddress: distributor.address, status, statusHistory: [{ status: 'processing', at, by: user._id }, ...(status !== 'processing' ? [{ status, at: new Date(at.getTime() + 86_400_000) }] : [])], createdAt: at });
    if (['packed', 'shipped', 'delivered'].includes(status)) await createInvoiceForOrder(order, distributor);
    return order;
  };
  for (let m = 0; m < 6; m++) await mkOrder(dist, distUser, [{ product: products[m % 7]._id, qty: 20 + m * 5 }, { product: products[(m + 2) % 7]._id, qty: 10 }], 'delivered', 30 * m + 5);
  await mkOrder(dist, distUser, [{ product: products[0]._id, qty: 50 }, { product: products[4]._id, qty: 5 }], 'shipped', 3);
  await mkOrder(dist, distUser, [{ product: products[2]._id, qty: 24 }], 'processing', 1);
  await mkOrder(stockist, distUser, [{ product: products[1]._id, qty: 15 }], 'packed', 2);

  // Field activity for today and the last few days
  const base = { lat: 20.2961, lng: 85.8245 };
  for (const [fe, dOff] of [[fe1, 0], [fe2, 0.02]]) {
    for (let day = 0; day < 5; day++) {
      const date = dayKey(new Date(Date.now() - day * 86_400_000));
      const start = new Date(`${date}T09:35:00+05:30`);
      if (start > new Date()) continue;
      const end = day === 0 ? null : new Date(`${date}T18:20:00+05:30`);
      await Attendance.create({ user: fe._id, date, checkIn: { time: start, lat: base.lat + dOff, lng: base.lng, withinGeofence: true, geofence: 'Head Office' }, ...(end ? { checkOut: { time: end, lat: base.lat, lng: base.lng, withinGeofence: true }, workMinutes: Math.round((end - start) / 60000), distanceKm: 18 + day } : {}) });
      const pings = Array.from({ length: 40 }, (_, i) => ({ user: fe._id, lat: base.lat + dOff + i * 0.0012, lng: base.lng + Math.sin(i / 5) * 0.004 + i * 0.0008, accuracy: 15, recordedAt: new Date(start.getTime() + i * 5 * 60_000) })).filter((p) => p.recordedAt < new Date());
      await LocationPing.insertMany(pings);
      const ret = retailers[day % 2];
      const vTime = new Date(start.getTime() + 60 * 60_000);
      if (vTime < new Date()) {
        await Visit.create({ user: fe._id, date, clientName: ret.shopName, clientType: 'retailer', retailer: ret._id, purpose: ['Order collection', 'Product demo', 'Payment follow-up'][day % 3], checkIn: { time: vTime, lat: ret.location.lat, lng: ret.location.lng }, checkOut: { time: new Date(vTime.getTime() + 25 * 60_000), lat: ret.location.lat, lng: ret.location.lng }, distanceKm: 6.4 + day });
        await SalesOrder.create({ user: fe._id, distributor: fe === fe1 ? dist._id : stockist._id, retailer: ret._id, date, items: [{ product: products[0]._id, name: products[0].name, qty: 10 + day, price: products[0].price, amount: (10 + day) * products[0].price }], total: (10 + day) * products[0].price });
      }
      if (day > 0) await WorkReport.create({ user: fe._id, date, summary: `Visited ${ret.shopName}, collected order and discussed new scheme.`, tasksCompleted: ['Retailer visit', 'Order booking'], stats: { visits: 1, distanceKm: 18 + day, salesValue: (10 + day) * products[0].price }, status: day > 2 ? 'approved' : 'submitted' });
    }
    await Expense.create({ user: fe._id, date: dayKey(new Date(Date.now() - 86_400_000)), category: 'travel', travelMode: 'bike', distanceKm: 19, ratePerKm: 3.5, amount: 66.5, autoCalculated: true, fromPlace: 'Head Office', toPlace: 'Khordha' });
    await Expense.create({ user: fe._id, date: dayKey(new Date(Date.now() - 2 * 86_400_000)), category: 'food', amount: 180, description: 'Lunch during field visit', status: 'approved', approvedAmount: 180, reviewedBy: manager._id });
    await Target.create({ user: fe._id, periodType: 'month', period: monthKey(), salesAmount: 150_000, visits: 60, newRetailers: 5, setBy: manager._id });
    await Target.create({ user: fe._id, periodType: 'quarter', period: quarterKey(), salesAmount: 450_000, visits: 180, newRetailers: 15, setBy: manager._id });
  }

  const year = new Date().getFullYear();
  await Holiday.insertMany([
    { date: `${year}-01-26`, name: 'Republic Day', type: 'national' },
    { date: `${year}-04-01`, name: 'Utkal Divas', type: 'regional', region: 'Odisha' },
    { date: `${year}-08-15`, name: 'Independence Day', type: 'national' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti', type: 'national' },
    { date: `${year}-10-20`, name: 'Durga Puja', type: 'regional', region: 'Odisha' },
    { date: `${year}-11-12`, name: 'Diwali', type: 'national' },
    { date: `${year}-12-25`, name: 'Christmas', type: 'national' },
  ]);

  for (const u of [manager, fe1, fe2]) {
    for (let m = 1; m <= 3; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m, 1);
      const s = u.salary;
      const earnings = [{ label: 'Basic', amount: s.basic }, { label: 'HRA', amount: s.hra }, { label: 'Allowances', amount: s.allowances }];
      const deductions = [{ label: 'PF', amount: s.deductions }, { label: 'Professional Tax', amount: 200 }];
      const gross = earnings.reduce((a, e) => a + e.amount, 0);
      await Payslip.create({ user: u._id, month: monthKey(d), earnings, deductions, gross, net: gross - deductions.reduce((a, e) => a + e.amount, 0), paidDays: 30, creditedAt: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
    }
  }

  console.log(`[seed] demo data created. Logins (password ${PASSWORD}):
  Admin panel : 9000000001 (super admin) / 9000000005 (admin)
  Employee    : 9000000002 (manager), 9000000003 / 9000000004 (field executives)
  Partner     : 9100000001 (super distributor), 9100000002 (distributor), 9100000003 (stockist)`);
}

// CLI: node src/seed.js [--reset]
if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/seed.js')) {
  const { connectDb, disconnectDb } = await import('./config/db.js');
  await connectDb();
  await seed({ reset: process.argv.includes('--reset') });
  await disconnectDb();
}
