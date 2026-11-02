import { env } from '../config/env.js';
import { CreditNote, Invoice, Product, nextNumber } from '../models/index.js';
import { badRequest } from '../utils/http.js';

/*
 * All money is calculated in integer paise and converted to rupees only for storage/display,
 * so totals never drift through floating-point rounding. Tax rules (rates, HSN, place of supply,
 * rounding) must be signed off by AHCL's accountant/CA before live invoicing.
 */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paise) => paise / 100;
const pct = (paise, rate) => Math.round((paise * rate) / 100); // half-up to the nearest paisa
const safe = (n, what) => {
  if (!Number.isSafeInteger(n)) throw badRequest(`Amount too large (${what})`);
  return n;
};

/** Split GST for one line: CGST+SGST (intra-state, halves that always add up) or IGST. */
function splitTax(taxPaise, interState) {
  if (interState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const cgst = Math.floor(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
}

/** Price an order from catalog data. Client-sent prices/totals are never used. */
export async function priceOrderItems(items) {
  const products = await Product.find({ _id: { $in: items.map((i) => i.product) }, isActive: true }).lean();
  const map = new Map(products.map((p) => [String(p._id), p]));
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const priced = items.map((i) => {
    const p = map.get(String(i.product));
    if (!p) throw badRequest(`Product not available: ${i.product}`);
    if (!Number.isSafeInteger(i.qty) || i.qty <= 0) throw badRequest('Quantity must be a positive whole number');
    const discountPct = Math.min(100, Math.max(0, i.discountPct ?? 0));
    const unit = toPaise(p.price);
    const gross = safe(unit * i.qty, 'line');
    const discount = pct(gross, discountPct);
    const taxable = gross - discount;
    const tax = pct(taxable, p.gstRate);
    subtotal += gross;
    discountTotal += discount;
    taxTotal += tax;
    return {
      product: p._id, sku: p.sku, name: p.name, unit: p.unit, hsn: p.hsn, qty: i.qty, price: p.price, discountPct, gstRate: p.gstRate,
      taxable: toRupees(taxable), tax: toRupees(tax), lineTotal: toRupees(taxable + tax),
    };
  });

  const taxableTotal = subtotal - discountTotal;
  return {
    items: priced,
    subtotal: toRupees(safe(subtotal, 'subtotal')),
    discountTotal: toRupees(discountTotal),
    taxableTotal: toRupees(taxableTotal),
    taxTotal: toRupees(taxTotal),
    grandTotal: toRupees(safe(taxableTotal + taxTotal, 'total')),
  };
}

/** Build GST document lines + totals (shared by invoices and credit notes). */
function gstDocument(lines, interState) {
  const items = lines.map((l) => {
    const taxable = toPaise(l.taxable);
    const t = splitTax(pct(taxable, l.gstRate), interState);
    return { ...l, taxable, ...t, total: taxable + t.cgst + t.sgst + t.igst };
  });
  const sum = (k) => items.reduce((a, b) => a + b[k], 0);
  const exact = sum('total');
  const grand = Math.round(exact / 100) * 100; // invoice value rounded to the rupee
  return {
    items: items.map((i) => ({ ...i, taxable: toRupees(i.taxable), cgst: toRupees(i.cgst), sgst: toRupees(i.sgst), igst: toRupees(i.igst), total: toRupees(i.total) })),
    taxableTotal: toRupees(sum('taxable')),
    cgstTotal: toRupees(sum('cgst')),
    sgstTotal: toRupees(sum('sgst')),
    igstTotal: toRupees(sum('igst')),
    roundOff: toRupees(grand - exact),
    grandTotal: toRupees(grand),
    amountInWords: amountInWords(grand / 100),
  };
}

const parties = (distributor) => ({
  seller: { name: env.company.name, gstin: env.company.gstin, address: env.company.address, stateCode: env.company.stateCode },
  buyer: { name: distributor.name, gstin: distributor.gstin, address: distributor.address, stateCode: distributor.stateCode },
  placeOfSupply: distributor.stateCode,
  interState: Boolean(distributor.stateCode && distributor.stateCode !== env.company.stateCode),
});

/** Generate the GST tax invoice for an order. Idempotent: a unique index allows one invoice per order. */
export async function createInvoiceForOrder(order, distributor) {
  const existing = await Invoice.findOne({ order: order._id });
  if (existing) return existing;
  const p = parties(distributor);
  const doc = gstDocument(
    order.items.map((i) => ({ name: i.name, hsn: i.hsn, qty: i.qty, unit: i.unit, rate: i.price, discountPct: i.discountPct, taxable: i.taxable, gstRate: i.gstRate })),
    p.interState,
  );
  let invoice;
  try {
    invoice = await Invoice.create({ invoiceNo: await nextNumber('INV'), order: order._id, distributor: distributor._id, ...p, ...doc });
  } catch (err) {
    if (err.code !== 11000) throw err;
    invoice = await Invoice.findOne({ order: order._id }); // a concurrent request created it
  }
  order.invoice = invoice._id;
  await order.save();
  return invoice;
}

/**
 * GST credit note for goods returned against a delivered order. Each returned unit is credited
 * at the same taxable value per unit as on the original invoice.
 * lines: [{ orderItem, qty }] (already validated against returnable quantities)
 */
export async function createCreditNote({ order, invoice, distributor, lines, reason, createdBy }) {
  const p = parties(distributor);
  const doc = gstDocument(
    lines.map(({ orderItem: i, qty }) => ({
      product: i.product, name: i.name, hsn: i.hsn, qty, unit: i.unit, rate: i.price, discountPct: i.discountPct,
      taxable: toRupees(Math.round((toPaise(i.taxable) * qty) / i.qty)), gstRate: i.gstRate,
    })),
    p.interState,
  );
  return CreditNote.create({
    creditNoteNo: await nextNumber('CN'),
    order: order._id,
    invoice: invoice?._id,
    invoiceNo: invoice?.invoiceNo,
    distributor: distributor._id,
    reason,
    createdBy,
    ...p,
    ...doc,
  });
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
