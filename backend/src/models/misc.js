import mongoose from 'mongoose';

const { Schema } = mongoose;
const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

/** Daily work report submitted by juniors, reviewed by their manager. */
const workReportSchema = new Schema(
  {
    user: { ...ref('User'), required: true, index: true },
    date: { type: String, required: true },
    summary: { type: String, required: true },
    tasksCompleted: [String],
    plannedTomorrow: String,
    challenges: String,
    // Snapshot of auto-computed stats at submission time
    stats: { visits: Number, distanceKm: Number, salesValue: Number },
    status: { type: String, enum: ['submitted', 'approved', 'needs_changes'], default: 'submitted', index: true },
    comments: [{ by: ref('User'), text: String, at: { type: Date, default: Date.now } }],
    reviewedBy: ref('User'),
    reviewedAt: Date,
    rating: { type: Number, min: 1, max: 5 },
    clientId: String,
  },
  { timestamps: true },
);
workReportSchema.index({ user: 1, date: 1 }, { unique: true });
export const WorkReport = mongoose.model('WorkReport', workReportSchema);

const claimSchema = new Schema(
  {
    claimNo: { type: String, unique: true },
    distributor: { ...ref('Distributor'), required: true, index: true },
    submittedBy: ref('User'),
    type: { type: String, enum: ['scheme', 'discount', 'damage', 'transport', 'other'], required: true },
    schemeName: String,
    periodFrom: String,
    periodTo: String,
    amount: { type: Number, required: true, min: 0 },
    approvedAmount: Number,
    description: String,
    attachments: [ref('File')],
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'revision_requested', 'settled'], default: 'pending', index: true },
    history: [{ status: String, by: ref('User'), note: String, at: { type: Date, default: Date.now } }],
    settledAt: Date,
    settlementRef: String,
  },
  { timestamps: true },
);
export const Claim = mongoose.model('Claim', claimSchema);

const ticketSchema = new Schema(
  {
    ticketNo: String,
    user: { ...ref('User'), required: true, index: true },
    subject: { type: String, required: true },
    category: { type: String, enum: ['app', 'order', 'payment', 'hr', 'claim', 'other'], default: 'other' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    messages: [{ from: ref('User'), text: String, attachments: [ref('File')], at: { type: Date, default: Date.now } }],
    assignedTo: ref('User'),
  },
  { timestamps: true },
);
export const Ticket = mongoose.model('Ticket', ticketSchema);

const notificationSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    title: { type: String, required: true },
    body: String,
    type: {
      type: String,
      enum: ['order', 'claim', 'attendance', 'salary', 'target', 'announcement', 'leave', 'expense', 'report', 'system'],
      default: 'system',
    },
    data: Schema.Types.Mixed,
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', notificationSchema);

/** Records processed offline operations so retries are idempotent. */
const syncOpSchema = new Schema(
  {
    user: { ...ref('User'), required: true },
    clientId: { type: String, required: true },
    op: String,
    result: Schema.Types.Mixed,
  },
  { timestamps: true },
);
syncOpSchema.index({ user: 1, clientId: 1 }, { unique: true });
export const SyncOp = mongoose.model('SyncOp', syncOpSchema);

/** Audit trail for admin actions (block user, approve, etc.). */
const auditSchema = new Schema(
  {
    actor: ref('User'),
    action: String,
    entity: String,
    entityId: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true },
);
export const AuditLog = mongoose.model('AuditLog', auditSchema);
