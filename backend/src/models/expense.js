import mongoose from 'mongoose';

const { Schema } = mongoose;

const expenseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    category: { type: String, enum: ['travel', 'food', 'lodging', 'phone', 'other'], default: 'travel' },
    travelMode: { type: String, enum: ['bike', 'car', 'public'] },
    fromPlace: String,
    toPlace: String,
    distanceKm: Number,
    ratePerKm: Number,
    // true => distance came from the GPS trail and amount = distance x rate
    autoCalculated: { type: Boolean, default: false },
    amount: { type: Number, required: true, min: 0 },
    description: String,
    bills: [{ type: Schema.Types.ObjectId, ref: 'File' }],
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'reimbursed'], default: 'pending', index: true },
    approvedAmount: Number,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewComment: String,
    reimbursedAt: Date,
    reimbursementRef: String,
    clientId: String,
  },
  { timestamps: true },
);

export const Expense = mongoose.model('Expense', expenseSchema);
