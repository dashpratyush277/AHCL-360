import mongoose from 'mongoose';

const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

const punch = { time: Date, lat: Number, lng: Number, accuracy: Number, withinGeofence: Boolean, geofence: String };

const attendanceSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (IST)
    checkIn: punch,
    checkOut: punch,
    status: { type: String, enum: ['present', 'half_day', 'absent', 'leave', 'holiday'], default: 'present' },
    workMinutes: { type: Number, default: 0 },
    distanceKm: { type: Number, default: 0 },
    remarks: String,
  },
  { timestamps: true },
);
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
export const Attendance = mongoose.model('Attendance', attendanceSchema);

const leaveSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    type: { type: String, enum: ['casual', 'sick', 'earned', 'unpaid', 'other'], default: 'casual' },
    from: { type: String, required: true }, // YYYY-MM-DD
    to: { type: String, required: true },
    days: Number,
    halfDay: { type: Boolean, default: false },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
    reviewedBy: ref('User'),
    reviewedAt: Date,
    reviewComment: String,
  },
  { timestamps: true },
);
export const Leave = mongoose.model('Leave', leaveSchema);

const holidaySchema = new Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    name: { type: String, required: true },
    type: { type: String, enum: ['national', 'regional', 'optional', 'company'], default: 'company' },
    region: String,
  },
  { timestamps: true },
);
holidaySchema.index({ date: 1, region: 1 }, { unique: true });
export const Holiday = mongoose.model('Holiday', holidaySchema);

const lineItem = { label: String, amount: Number };
const payslipSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    month: { type: String, required: true }, // YYYY-MM
    earnings: [lineItem],
    deductions: [lineItem],
    gross: Number,
    net: Number,
    paidDays: Number,
    creditedAt: Date,
    file: ref('File'), // optional uploaded PDF; otherwise generated on the fly
  },
  { timestamps: true },
);
payslipSchema.index({ user: 1, month: 1 }, { unique: true });
export const Payslip = mongoose.model('Payslip', payslipSchema);

/** Official document vault + KYC submissions. */
const documentSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    category: {
      type: String,
      enum: ['offer_letter', 'appointment_letter', 'id_proof', 'address_proof', 'kyc_pan', 'kyc_aadhaar', 'education', 'policy', 'other'],
      required: true,
    },
    title: { type: String, required: true },
    file: { ...ref('File'), required: true },
    issuedByCompany: { type: Boolean, default: false }, // vault docs issued by HR vs. uploaded by employee
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    remarks: String,
    uploadedBy: ref('User'),
  },
  { timestamps: true },
);
export const Document = mongoose.model('Document', documentSchema);
