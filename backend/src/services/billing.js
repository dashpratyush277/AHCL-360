import { env } from '../config/env.js';
import { Invoice, Product, nextNumber } from '../models/index.js';
import { badRequest } from '../utils/http.js';

const r2 = (n) => Math.round(n * 100) / 100;

/** Price an order from catalog data (never trusts client prices). */
export async function priceOrderItems(items) {
  const products = await Product.find({ _id: { $in: items.map((i) => i.product) }, isActive: true }).lean();
  const map = new Map(products.map((p) => [String(p._id), p]));
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const priced = items.map((i) => {
    const p = map.get(String(i.product));
    if (!p) throw badRequest(`Product not available: ${i.product}`);
    const discountPct = Math.min(100, Math.max(0, i.discountPct ?? 0));
    const gross = p.price * i.qty;
    const discount = r2((gross * discountPct) / 100);
    const taxable = r2(gross - discount);
    const tax = r2((taxable * p.gstRate) / 100);
    subtotal += gross;
    discountTotal += discount;
    taxTotal += tax;
    return { product: p._id, sku: p.sku, name: p.name, unit: p.unit, hsn: p.hsn, qty: i.qty, price: p.price, discountPct, gstRate: p.gstRate, taxable, tax, lineTotal: r2(taxable + tax) };
  });

  const taxableTotal = r2(subtotal - discountTotal);
  return { items: priced, subtotal: r2(subtotal), discountTotal: r2(discountTotal), taxableTotal, taxTotal: r2(taxTotal), grandTotal: r2(taxableTotal + taxTotal) };
}

/** Generate a GST-compliant invoice for an order (idempotent). */
export async function createInvoiceForOrder(order, distributor) {
  if (order.invoice) return Invoice.findById(order.invoice);
  const interState = Boolean(distributor.stateCode && distributor.stateCode !== env.company.stateCode);

  const items = order.items.map((i) => {
    const tax = r2((i.taxable * i.gstRate) / 100);
    return {
      name: i.name,
      hsn: i.hsn,
      qty: i.qty,
      unit: i.unit,
      rate: i.price,
      discountPct: i.discountPct,
      taxable: i.taxable,
      gstRate: i.gstRate,
      cgst: interState ? 0 : r2(tax / 2),
      sgst: interState ? 0 : r2(tax / 2),
      igst: interState ? tax : 0,
      total: r2(i.taxable + tax),
    };
  });
  const sum = (k) => r2(items.reduce((a, b) => a + b[k], 0));
  const exact = sum('taxable') + sum('cgst') + sum('sgst') + sum('igst');
  const grandTotal = Math.round(exact);

  const invoice = await Invoice.create({
    invoiceNo: await nextNumber('INV'),
    order: order._id,
    distributor: distributor._id,
    seller: { name: env.company.name, gstin: env.company.gstin, address: env.company.address, stateCode: env.company.stateCode },
    buyer: { name: distributor.name, gstin: distributor.gstin, address: distributor.address, stateCode: distributor.stateCode },
    placeOfSupply: distributor.stateCode,
    interState,
    items,
    taxableTotal: sum('taxable'),
    cgstTotal: sum('cgst'),
    sgstTotal: sum('sgst'),
    igstTotal: sum('igst'),
    roundOff: r2(grandTotal - exact),
    grandTotal,
    amountInWords: amountInWords(grandTotal),
  });
  order.invoice = invoice._id;
  await order.save();
  return invoice;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const three = (n) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred ${two(n % 100)}`.trim() : two(n));

/** Indian numbering system: crore / lakh / thousand. */
export function amountInWords(amount) {
  let n = Math.floor(amount);
  if (n === 0) return 'Rupees Zero Only';
  const parts = [];
  for (const [div, label] of [[10_000_000, 'Crore'], [100_000, 'Lakh'], [1000, 'Thousand']]) {
    if (n >= div) {
      parts.push(`${three(Math.floor(n / div))} ${label}`);
      n %= div;
    }
  }
  if (n) parts.push(three(n));
  return `Rupees ${parts.join(' ')} Only`;
}
