import mongoose from 'mongoose';

const { Schema } = mongoose;
const point = { lat: Number, lng: Number, accuracy: Number };

const territorySchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    region: String,
    description: String,
  },
  { timestamps: true },
);
export const Territory = mongoose.model('Territory', territorySchema);

/** Circular geofence. Office fences validate attendance; client fences validate visits. */
const geofenceSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ['office', 'territory', 'client'], default: 'office' },
    center: { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
    radiusM: { type: Number, default: 200 },
    territory: { type: Schema.Types.ObjectId, ref: 'Territory' },
    // Empty => applies to everyone; otherwise only to listed users.
    users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    enforce: { type: Boolean, default: false }, // reject (true) or just flag (false) outside fence
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Geofence = mongoose.model('Geofence', geofenceSchema);

const locationPingSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  accuracy: Number,
  speed: Number,
  battery: Number,
  recordedAt: { type: Date, required: true },
  // Keep raw GPS for 180 days.
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
});
locationPingSchema.index({ user: 1, recordedAt: -1 });
export const LocationPing = mongoose.model('LocationPing', locationPingSchema);

const visitSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientName: { type: String, required: true },
    clientType: { type: String, enum: ['distributor', 'retailer', 'prospect', 'other'], default: 'other' },
    distributor: { type: Schema.Types.ObjectId, ref: 'Distributor' },
    retailer: { type: Schema.Types.ObjectId, ref: 'Retailer' },
    purpose: { type: String, required: true },
    notes: String,
    checkIn: { time: { type: Date, required: true }, ...point },
    checkOut: { time: Date, ...point },
    // Distance travelled since the previous visit / day start (km), from GPS trail.
    distanceKm: { type: Number, default: 0 },
    locationValid: { type: Boolean, default: true },
    locationRemark: String,
    date: { type: String, index: true }, // YYYY-MM-DD
    clientId: String, // offline idempotency key
  },
  { timestamps: true },
);
export const Visit = mongoose.model('Visit', visitSchema);
