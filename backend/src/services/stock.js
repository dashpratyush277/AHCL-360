import mongoose from 'mongoose';
import { Product, ReorderSetting, StockBalance, StockTxn } from '../models/index.js';
import { badRequest } from '../utils/http.js';

const SIGN = { in: 1, out: -1, return: -1 };

/** Create a ledger entry. For `adjustment`, pass a signed `delta` (e.g. -3 for damaged). */
export async function recordStock({ distributor, product, type, qty, delta, reason, reference, date, createdBy, clientId }) {
  if (type === 'adjustment') {
    if (delta === undefined || delta === 0) throw badRequest('Adjustment requires non-zero delta');
    qty = Math.abs(delta);
  } else {
    delta = SIGN[type] * qty;
  }
  if ((type === 'return' || type === 'adjustment') && !reason) throw badRequest(`Reason is required for ${type}`);
  if (!Number.isSafeInteger(qty) || qty <= 0) throw badRequest('Quantity must be a positive whole number');

  await ensureBalance(distributor, product);
  // Atomic: for reductions the update only matches while enough stock remains.
  const moved = await StockBalance.findOneAndUpdate(
    { distributor, product, ...(delta < 0 ? { qty: { $gte: -delta } } : {}) },
    { $inc: { qty: delta } },
    { returnDocument: 'after' },
  );
  if (!moved) throw badRequest('Insufficient stock for this transaction');
  try {
    return await StockTxn.create({ distributor, product, type, qty, delta, reason, reference, date, createdBy, clientId });
  } catch (err) {
    await StockBalance.updateOne({ distributor, product }, { $inc: { qty: -delta } }); // undo the balance change
    throw err;
  }
}

/** Create the running-balance row from the ledger the first time a product is touched. */
async function ensureBalance(distributor, product) {
  if (await StockBalance.exists({ distributor, product })) return;
  const [row] = await StockTxn.aggregate([
    { $match: { distributor: new mongoose.Types.ObjectId(String(distributor)), product: new mongoose.Types.ObjectId(String(product)) } },
    { $group: { _id: null, qty: { $sum: '$delta' } } },
  ]);
  try {
    await StockBalance.create({ distributor, product, qty: row?.qty ?? 0 });
  } catch (err) {
    if (err.code !== 11000) throw err; // another request created it first – fine
  }
}

/**
 * Opening / in / out / return / adjustment / closing per product for a distributor.
 * When `from` is given, opening = everything before `from`.
 */
export async function closingStock(distributorId, { product, from, to } = {}) {
  const match = { distributor: new mongoose.Types.ObjectId(String(distributorId)) };
  if (product) match.product = new mongoose.Types.ObjectId(String(product));
  if (to) match.date = { $lt: to };
  const inPeriod = from ? { $gte: ['$date', from] } : true;
  const sumIf = (cond) => ({ $sum: { $cond: [{ $and: [inPeriod, cond] }, '$qty', 0] } });

  return StockTxn.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$product',
        opening: { $sum: { $cond: [inPeriod, 0, '$delta'] } },
        stockIn: sumIf({ $eq: ['$type', 'in'] }),
        stockOut: sumIf({ $eq: ['$type', 'out'] }),
        returned: sumIf({ $eq: ['$type', 'return'] }),
        adjustment: { $sum: { $cond: [{ $and: [inPeriod, { $eq: ['$type', 'adjustment'] }] }, '$delta', 0] } },
        closing: { $sum: '$delta' },
      },
    },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $project: { _id: 0, productId: '$_id', sku: '$product.sku', name: '$product.name', unit: '$product.unit', opening: 1, stockIn: 1, stockOut: 1, returned: 1, adjustment: 1, closing: 1 } },
    { $sort: { name: 1 } },
  ]);
}

/**
 * Reorder suggestions: product is flagged when closing stock <= reorder level, where the level
 * is either the configured one or a dynamic one = avg daily sales (30d) x lead time + safety stock.
 */
export async function reorderSuggestions(distributorId, { leadDays = 7, safetyDays = 3 } = {}) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stock, sales, settings, products] = await Promise.all([
    closingStock(distributorId),
    StockTxn.aggregate([
      { $match: { distributor: new mongoose.Types.ObjectId(String(distributorId)), type: 'out', date: { $gte: since } } },
      { $group: { _id: '$product', qty: { $sum: '$qty' } } },
    ]),
    ReorderSetting.find({ distributor: distributorId }).lean(),
    Product.find({ isActive: true }).select('sku name unit price defaultReorderLevel').lean(),
  ]);

  const byId = (arr, key) => new Map(arr.map((x) => [String(x[key]), x]));
  const stockMap = byId(stock, 'productId');
  const salesMap = byId(sales, '_id');
  const settingMap = byId(settings, 'product');

  return products
    .map((p) => {
      const id = String(p._id);
      const closing = stockMap.get(id)?.closing ?? 0;
      const avgDaily = (salesMap.get(id)?.qty ?? 0) / 30;
      const dynamicLevel = Math.ceil(avgDaily * (leadDays + safetyDays));
      const reorderLevel = settingMap.get(id)?.reorderLevel ?? Math.max(p.defaultReorderLevel ?? 0, dynamicLevel);
      const suggestedQty = Math.max(0, Math.ceil(avgDaily * (leadDays + safetyDays) * 2) + reorderLevel - closing);
      return { productId: id, sku: p.sku, name: p.name, unit: p.unit, price: p.price, closing, avgDailySales: +avgDaily.toFixed(2), reorderLevel, needsReorder: closing <= reorderLevel, suggestedQty };
    })
    .filter((r) => r.needsReorder)
    .sort((a, b) => a.closing - a.reorderLevel - (b.closing - b.reorderLevel));
}
