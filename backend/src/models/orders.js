import mongoose from 'mongoose';

const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

/** Atomic sequence generator for order / invoice / claim numbers. */
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

export async function nextNumber(prefix, { width = 5, fiscal = true } = {}) {
  const now = new Date();
  // Indian fiscal year: Apr-Mar, e.g. 2627 for FY 2026-27
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyTag = fiscal ? `${String(fy).slice(2)}${String(fy + 1).slice(2)}` : '';
  const key = `${prefix}-${fyTag}`;
  const { seq } = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `${prefix}/${fyTag}/${String(seq).padStart(width, '0')}`;
}

const orderItem = {
  product: ref('Product'),
  sku: String,
  name: String,
  unit: String,
  hsn: String,
  qty: { type: Number, min: 1 },
  price: Number, // unit price excl. GST
  discountPct: { type: Number, default: 0 },
  gstRate: Number,
  taxable: Number,
  tax: Number,
  lineTotal: Number,
};

export const ORDER_STATUSES = ['processing', 'packed', 'shipped', 'delivered', 'cancelled'];

const orderSchema = new Schema(
  {
    orderNo: { type: String, unique: true },
    distributor: { ...ref('Distributor'), required: true, index: true },
    placedBy: ref('User'),
    items: [orderItem],
    subtotal: Number,
    discountTotal: Number,
    taxableTotal: Number,
    taxTotal: Number,
    grandTotal: Number,
    status: { type: String, enum: ORDER_STATUSES, default: 'processing', index: true },
    statusHistory: [{ status: String, at: Date, by: ref('User'), note: String }],
    shippingAddress: String,
    trackingInfo: String,
    notes: String,
    invoice: ref('Invoice'),
    stockPosted: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Order = mongoose.model('Order', orderSchema);

/** GST tax invoice. Intra-state => CGST+SGST, inter-state => IGST. */
const invoiceSchema = new Schema(
  {
    invoiceNo: { type: String, unique: true },
    order: ref('Order'),
    distributor: { ...ref('Distributor'), required: true, index: true },
    issuedAt: { type: Date, default: Date.now },
    seller: { name: String, gstin: String, address: String, stateCode: String },
    buyer: { name: String, gstin: String, address: String, stateCode: String },
    placeOfSupply: String,
    interState: Boolean,
    items: [
      {
        name: String,
        hsn: String,
        qty: Number,
        unit: String,
        rate: Number,
        discountPct: Number,
        taxable: Number,
        gstRate: Number,
        cgst: Number,
        sgst: Number,
        igst: Number,
        total: Number,
      },
    ],
    taxableTotal: Number,
    cgstTotal: Number,
    sgstTotal: Number,
    igstTotal: Number,
    roundOff: Number,
    grandTotal: Number,
    amountInWords: String,
    status: { type: String, enum: ['unpaid', 'partially_paid', 'paid', 'cancelled'], default: 'unpaid' },
  },
  { timestamps: true },
);
export const Invoice = mongoose.model('Invoice', invoiceSchema);
