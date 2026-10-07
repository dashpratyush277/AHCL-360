import mongoose from 'mongoose';
import { encryptedFieldsPlugin } from '../utils/crypto.js';

const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });
const contact = { person: String, mobile: String, email: String };
const geo = { lat: Number, lng: Number };

/** Channel partner entity: Super Distributor / Distributor / Stockist. */
const distributorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    tier: { type: String, enum: ['super_distributor', 'distributor', 'stockist'], required: true },
    parent: ref('Distributor'),
    gstin: String,
    pan: String,
    stateCode: String, // GST place-of-supply
    contact,
    address: String,
    location: geo,
    territory: ref('Territory'),
    assignedEmployees: [ref('User')],
    creditLimit: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
distributorSchema.plugin(encryptedFieldsPlugin, { fields: ['pan'] });
export const Distributor = mongoose.model('Distributor', distributorSchema);

const retailerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    shopName: String,
    contact,
    address: String,
    city: String,
    pincode: String,
    location: geo,
    distributor: { ...ref('Distributor'), required: true, index: true },
    distributorCode: { type: String, required: true, index: true },
    kyc: {
      pan: String,
      aadhaar: String,
      gstin: String,
      panFile: ref('File'),
      aadhaarFile: ref('File'),
      gstFile: ref('File'),
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    },
    createdBy: ref('User'),
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
retailerSchema.plugin(encryptedFieldsPlugin, { fields: ['kyc.pan', 'kyc.aadhaar'] });
retailerSchema.index({ name: 'text', shopName: 'text', city: 'text' });
export const Retailer = mongoose.model('Retailer', retailerSchema);

const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    category: String,
    description: String,
    unit: { type: String, default: 'pcs' }, // pcs, box, kg, ltr...
    packSize: Number,
    mrp: Number,
    price: { type: Number, required: true }, // distributor price, excl. GST
    gstRate: { type: Number, default: 18 },
    hsn: String,
    image: ref('File'),
    defaultReorderLevel: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
productSchema.index({ name: 'text', sku: 'text', category: 'text' });
export const Product = mongoose.model('Product', productSchema);

/**
 * Stock ledger. `delta` is signed: in (+), out (-), return (-, goods returned to company),
 * adjustment (+/-, e.g. damaged). Closing stock = sum(delta).
 */
const stockTxnSchema = new Schema(
  {
    distributor: { ...ref('Distributor'), required: true },
    product: { ...ref('Product'), required: true },
    type: { type: String, enum: ['in', 'out', 'return', 'adjustment'], required: true },
    qty: { type: Number, required: true, min: 0 },
    delta: { type: Number, required: true },
    reason: String,
    reference: String, // order no / invoice no
    date: { type: Date, default: Date.now },
    createdBy: ref('User'),
    clientId: String,
  },
  { timestamps: true },
);
stockTxnSchema.index({ distributor: 1, product: 1, date: -1 });
export const StockTxn = mongoose.model('StockTxn', stockTxnSchema);

const reorderSchema = new Schema({
  distributor: { ...ref('Distributor'), required: true },
  product: { ...ref('Product'), required: true },
  reorderLevel: { type: Number, required: true },
});
reorderSchema.index({ distributor: 1, product: 1 }, { unique: true });
export const ReorderSetting = mongoose.model('ReorderSetting', reorderSchema);

const soItem = { product: ref('Product'), name: String, qty: Number, price: Number, amount: Number };

/** Daily Sales Order (DSO) captured by field staff. Drives Target vs Achievement. */
const salesOrderSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    distributor: ref('Distributor'),
    retailer: ref('Retailer'),
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    items: [soItem],
    total: { type: Number, default: 0 },
    remarks: String,
    clientId: String,
  },
  { timestamps: true },
);
export const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

const targetSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    periodType: { type: String, enum: ['month', 'quarter'], required: true },
    period: { type: String, required: true }, // YYYY-MM or YYYY-Qn
    salesAmount: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    newRetailers: { type: Number, default: 0 },
    setBy: ref('User'),
  },
  { timestamps: true },
);
targetSchema.index({ user: 1, period: 1 }, { unique: true });
export const Target = mongoose.model('Target', targetSchema);
