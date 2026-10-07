import { Router } from 'express';
import { isAdmin } from '../config/roles.js';
import { Attendance, Claim, Distributor, Expense, Leave, Order, Retailer, SalesOrder, User, Visit } from '../models/index.js';
import { closingStock } from '../services/stock.js';
import { dayKey, monthKey, periodRange } from '../utils/dates.js';
import { assertDistributorAccess, distributorScopeFilter, visibleUserIds } from '../utils/scope.js';

const r = Router();

const lastMonths = (n) => {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 15)));
  return out;
};

/** Home dashboard numbers, tailored to the caller's panel and role. */
r.get('/dashboard', async (req, res) => {
  const u = req.user;
  const { start } = periodRange(monthKey());

  if (u.userType === 'partner') {
    const scope = await distributorScopeFilter(u);
    const [orders, openOrders, claims, retailers, stock] = await Promise.all([
      Order.aggregate([{ $match: { ...scope, createdAt: { $gte: start }, status: { $ne: 'cancelled' } } }, { $group: { _id: null, n: { $sum: 1 }, value: { $sum: '$grandTotal' } } }]),
      Order.countDocuments({ ...scope, status: { $in: ['processing', 'packed', 'shipped'] } }),
      Claim.countDocuments({ ...scope, status: { $in: ['pending', 'revision_requested'] } }),
      Retailer.countDocuments(scope),
      u.distributor ? closingStock(u.distributor) : [],
    ]);
    return res.json({
      panel: 'partner',
      monthOrders: orders[0]?.n ?? 0,
      monthOrderValue: orders[0]?.value ?? 0,
      openOrders,
      pendingClaims: claims,
      retailers,
      stockUnits: stock.reduce((a, s) => a + s.closing, 0),
      lowStockSkus: stock.filter((s) => s.closing <= 10).length,
    });
  }

  const ids = await visibleUserIds(u);
  const userFilter = ids ? { user: { $in: ids } } : {};
  const today = dayKey();
  const [visitsToday, salesMonth, pendingLeaves, pendingExpenses, present, teamSize] = await Promise.all([
    Visit.countDocuments({ ...userFilter, date: today }),
    SalesOrder.aggregate([{ $match: { ...userFilter, createdAt: { $gte: start } } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
    Leave.countDocuments({ ...userFilter, status: 'pending' }),
    Expense.countDocuments({ ...userFilter, status: 'pending' }),
    Attendance.countDocuments({ ...userFilter, date: today, 'checkIn.time': { $ne: null } }),
    ids ? ids.length : User.countDocuments({ userType: 'employee', isBlocked: false }),
  ]);
  res.json({ panel: 'employee', visitsToday, salesThisMonth: salesMonth[0]?.t ?? 0, pendingLeaves, pendingExpenses, presentToday: present, teamSize });
});

/** Chart series: sales/visits/order value by month, orders by status, top distributors, stock. */
r.get('/charts', async (req, res) => {
  const months = lastMonths(Number(req.query.months) || 6);
  const since = periodRange(months[0]).start;
  const u = req.user;
  const isEmployee = u.userType === 'employee';
  const ids = isEmployee ? await visibleUserIds(u) : null;
  const userFilter = ids ? { user: { $in: ids } } : {};
  const dScope = await distributorScopeFilter(u);
  const ym = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Kolkata' } };

  const [sales, visits, orders, ordersByStatus, topDistributors] = await Promise.all([
    isEmployee ? SalesOrder.aggregate([{ $match: { ...userFilter, createdAt: { $gte: since } } }, { $group: { _id: ym, value: { $sum: '$total' } } }]) : [],
    isEmployee ? Visit.aggregate([{ $match: { ...userFilter, createdAt: { $gte: since } } }, { $group: { _id: ym, value: { $sum: 1 } } }]) : [],
    Order.aggregate([{ $match: { ...dScope, createdAt: { $gte: since }, status: { $ne: 'cancelled' } } }, { $group: { _id: ym, value: { $sum: '$grandTotal' } } }]),
    Order.aggregate([{ $match: { ...dScope, createdAt: { $gte: since } } }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
    isAdmin(u)
      ? Order.aggregate([
          { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
          { $group: { _id: '$distributor', value: { $sum: '$grandTotal' } } },
          { $sort: { value: -1 } },
          { $limit: 10 },
          { $lookup: { from: 'distributors', localField: '_id', foreignField: '_id', as: 'd' } },
          { $project: { name: { $first: '$d.name' }, value: 1 } },
        ])
      : [],
  ]);

  const series = (rows) => months.map((m) => ({ month: m, value: rows.find((x) => x._id === m)?.value ?? 0 }));
  const distributorId = req.query.distributor || u.distributor;
  if (distributorId) await assertDistributorAccess(u, distributorId);
  const stock = distributorId ? (await closingStock(distributorId)).map((s) => ({ name: s.name, closing: s.closing })) : [];

  res.json({
    salesByMonth: series(sales),
    visitsByMonth: series(visits),
    orderValueByMonth: series(orders),
    ordersByStatus: ordersByStatus.map((o) => ({ status: o._id, value: o.value })),
    topDistributors,
    stock,
    totals: isAdmin(u)
      ? { distributors: await Distributor.countDocuments({ isActive: true }), retailers: await Retailer.countDocuments(), employees: await User.countDocuments({ userType: 'employee', isBlocked: false }) }
      : undefined,
  });
});

export default r;
