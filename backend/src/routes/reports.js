import { Router } from 'express';
import { Attendance, Distributor, Expense, Order, SalesOrder, User, Visit, WorkReport } from '../models/index.js';
import { sendTableReport } from '../services/documents.js';
import { closingStock } from '../services/stock.js';
import { dayKey, rangeFromQuery } from '../utils/dates.js';
import { badRequest } from '../utils/http.js';
import { assertDistributorAccess, distributorScopeFilter, userScopeFilter } from '../utils/scope.js';

/**
 * GET /api/reports/:type?format=pdf|xlsx&from=YYYY-MM-DD&to=YYYY-MM-DD&user=<id>
 * Employees get their own data; managers their team; admins everyone.
 */
const r = Router();

const t = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const inr = (n) => (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const builders = {
  async 'daily-work'(req, scope, range) {
    const reports = await WorkReport.find({ ...scope, date: { $gte: dayKey(range.from), $lte: dayKey(range.to) } }).populate('user', 'name').sort({ date: -1 }).lean();
    return {
      title: 'Daily Work Summary',
      columns: [
        { key: 'date', header: 'Date', width: 60 },
        { key: 'name', header: 'Employee', width: 90 },
        { key: 'summary', header: 'Summary', width: 220 },
        { key: 'visits', header: 'Visits', width: 40 },
        { key: 'km', header: 'Km', width: 40 },
        { key: 'sales', header: 'Sales (INR)', width: 65 },
        { key: 'status', header: 'Status', width: 60 },
      ],
      rows: reports.map((x) => ({ date: x.date, name: x.user?.name, summary: x.summary, visits: x.stats?.visits, km: x.stats?.distanceKm, sales: inr(x.stats?.salesValue), status: x.status })),
      summary: [['Reports', reports.length]],
    };
  },

  async expense(req, scope, range) {
    const items = await Expense.find({ ...scope, createdAt: { $gte: range.from, $lt: range.to }, ...(req.query.status ? { status: req.query.status } : {}) }).populate('user', 'name').sort({ date: -1 }).lean();
    const total = items.reduce((a, e) => a + e.amount, 0);
    const approved = items.filter((e) => ['approved', 'reimbursed'].includes(e.status)).reduce((a, e) => a + (e.approvedAmount ?? e.amount), 0);
    return {
      title: 'Expense Report',
      columns: [
        { key: 'date', header: 'Date', width: 60 },
        { key: 'name', header: 'Employee', width: 90 },
        { key: 'category', header: 'Category', width: 55 },
        { key: 'route', header: 'From / To', width: 120 },
        { key: 'km', header: 'Km', width: 40 },
        { key: 'amount', header: 'Amount', width: 60 },
        { key: 'status', header: 'Status', width: 60 },
      ],
      rows: items.map((e) => ({ date: e.date, name: e.user?.name, category: e.category, route: [e.fromPlace, e.toPlace].filter(Boolean).join(' > '), km: e.distanceKm ?? '', amount: inr(e.amount), status: e.status })),
      summary: [['Total claimed (INR)', inr(total)], ['Approved (INR)', inr(approved)]],
    };
  },

  async 'visit-route'(req, scope, range) {
    const visits = await Visit.find({ ...scope, 'checkIn.time': { $gte: range.from, $lt: range.to } }).populate('user', 'name').sort({ 'checkIn.time': 1 }).lean();
    return {
      title: 'Visit Route Report',
      columns: [
        { key: 'date', header: 'Date', width: 55 },
        { key: 'name', header: 'Employee', width: 80 },
        { key: 'client', header: 'Client', width: 110 },
        { key: 'purpose', header: 'Purpose', width: 100 },
        { key: 'in', header: 'Check-in', width: 70 },
        { key: 'out', header: 'Check-out', width: 70 },
        { key: 'km', header: 'Km', width: 35 },
        { key: 'loc', header: 'Location', width: 55 },
      ],
      rows: visits.map((v) => ({ date: v.date, name: v.user?.name, client: v.clientName, purpose: v.purpose, in: t(v.checkIn?.time), out: t(v.checkOut?.time), km: v.distanceKm, loc: v.locationValid ? 'OK' : 'Mismatch' })),
      summary: [['Visits', visits.length], ['Total distance (km)', visits.reduce((a, v) => a + (v.distanceKm || 0), 0).toFixed(1)]],
    };
  },

  async attendance(req, scope, range) {
    const items = await Attendance.find({ ...scope, date: { $gte: dayKey(range.from), $lte: dayKey(range.to) } }).populate('user', 'name employeeCode').sort({ date: -1 }).lean();
    return {
      title: 'Attendance Report',
      columns: [
        { key: 'date', header: 'Date', width: 60 },
        { key: 'name', header: 'Employee', width: 100 },
        { key: 'status', header: 'Status', width: 55 },
        { key: 'in', header: 'Check-in', width: 75 },
        { key: 'out', header: 'Check-out', width: 75 },
        { key: 'hours', header: 'Hours', width: 40 },
        { key: 'fence', header: 'Geofence', width: 60 },
      ],
      rows: items.map((a) => ({ date: a.date, name: a.user?.name, status: a.status, in: t(a.checkIn?.time), out: t(a.checkOut?.time), hours: ((a.workMinutes || 0) / 60).toFixed(1), fence: a.checkIn?.withinGeofence === false ? 'Outside' : 'OK' })),
      summary: [['Records', items.length]],
    };
  },

  async sales(req, scope, range) {
    const items = await SalesOrder.find({ ...scope, createdAt: { $gte: range.from, $lt: range.to } }).populate('user', 'name').populate('distributor', 'name').populate('retailer', 'name').sort({ date: -1 }).lean();
    return {
      title: 'Daily Sales Orders',
      columns: [
        { key: 'date', header: 'Date', width: 60 },
        { key: 'name', header: 'Employee', width: 90 },
        { key: 'party', header: 'Distributor / Retailer', width: 140 },
        { key: 'lines', header: 'Items', width: 40 },
        { key: 'total', header: 'Total (INR)', width: 70 },
      ],
      rows: items.map((s) => ({ date: s.date, name: s.user?.name, party: s.retailer?.name || s.distributor?.name, lines: s.items.length, total: inr(s.total) })),
      summary: [['Total sales (INR)', inr(items.reduce((a, s) => a + s.total, 0))]],
    };
  },
};

const partnerBuilders = {
  async orders(req, scope, range) {
    const items = await Order.find({ ...scope, createdAt: { $gte: range.from, $lt: range.to } }).populate('distributor', 'name code').sort({ createdAt: -1 }).lean();
    return {
      title: 'Order Report',
      columns: [
        { key: 'no', header: 'Order No', width: 90 },
        { key: 'date', header: 'Date', width: 70 },
        { key: 'dist', header: 'Distributor', width: 120 },
        { key: 'status', header: 'Status', width: 60 },
        { key: 'total', header: 'Total (INR)', width: 70 },
      ],
      rows: items.map((o) => ({ no: o.orderNo, date: t(o.createdAt), dist: o.distributor?.name, status: o.status, total: inr(o.grandTotal) })),
      summary: [['Orders', items.length], ['Value (INR)', inr(items.reduce((a, o) => a + o.grandTotal, 0))]],
    };
  },

  async stock(req, scope, range) {
    const distributor = req.query.distributor || req.user.distributor;
    if (!distributor) throw badRequest('distributor is required');
    await assertDistributorAccess(req.user, distributor);
    const d = await Distributor.findById(distributor).lean();
    const items = await closingStock(distributor, { from: range.from, to: range.to });
    return {
      title: `Stock Statement - ${d.name}`,
      columns: [
        { key: 'sku', header: 'SKU', width: 60 },
        { key: 'name', header: 'Product', width: 140 },
        { key: 'opening', header: 'Opening', width: 50 },
        { key: 'stockIn', header: 'In', width: 45 },
        { key: 'stockOut', header: 'Out', width: 45 },
        { key: 'returned', header: 'Return', width: 45 },
        { key: 'adjustment', header: 'Adj.', width: 45 },
        { key: 'closing', header: 'Closing', width: 50 },
      ],
      rows: items,
    };
  },
};

r.get('/:type', async (req, res) => {
  const range = rangeFromQuery(req.query);
  let spec;
  if (partnerBuilders[req.params.type]) {
    const scope = await distributorScopeFilter(req.user, req.query.distributor);
    spec = await partnerBuilders[req.params.type](req, scope, range);
  } else if (builders[req.params.type]) {
    if (req.user.userType !== 'employee') throw badRequest('Report not available for partner accounts');
    const scope = await userScopeFilter(req.user, req.query.user || (req.query.team ? undefined : req.user._id));
    spec = await builders[req.params.type](req, scope, range);
  } else {
    throw badRequest(`Unknown report type. Use one of: ${[...Object.keys(builders), ...Object.keys(partnerBuilders)].join(', ')}`);
  }
  const who = req.query.user ? (await User.findById(req.query.user).select('name'))?.name : req.query.team ? 'Team' : req.user.name;
  await sendTableReport(res, { ...spec, format: req.query.format, subtitle: `${who || ''} | ${dayKey(range.from)} to ${dayKey(new Date(range.to - 1))}` });
});

export default r;
