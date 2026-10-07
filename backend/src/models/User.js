import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ROLES, USER_TYPES } from '../config/roles.js';
import { encryptedFieldsPlugin, mask } from '../utils/crypto.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String, select: false },
    userType: { type: String, enum: USER_TYPES, required: true },
    role: { type: String, enum: ALL_ROLES, required: true },
    employeeCode: { type: String, unique: true, sparse: true },

    // Employees: reporting manager (junior -> manager mapping) and territory
    manager: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    territory: { type: Schema.Types.ObjectId, ref: 'Territory' },
    // Partners: the distributor/stockist entity this login belongs to
    distributor: { type: Schema.Types.ObjectId, ref: 'Distributor', index: true },

    profile: {
      designation: String,
      department: String,
      address: String,
      dateOfJoining: Date,
      photo: { type: Schema.Types.ObjectId, ref: 'File' },
    },
    officeHours: {
      start: { type: String, default: '09:30' },
      end: { type: String, default: '18:30' },
      workingDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
    },
    travelMode: { type: String, enum: ['bike', 'car', 'public'], default: 'bike' },
    salary: { basic: Number, hra: Number, allowances: Number, deductions: Number },
    bank: { accountNo: String, ifsc: String, bankName: String },
    kyc: {
      pan: String,
      aadhaar: String,
      status: { type: String, enum: ['not_submitted', 'pending', 'verified', 'rejected'], default: 'not_submitted' },
      remarks: String,
    },

    isBlocked: { type: Boolean, default: false },
    blockedReason: String,
    // Incremented to invalidate every issued token (block, password change, forced logout).
    tokenVersion: { type: Number, default: 0 },
    fcmTokens: { type: [String], default: [], select: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.plugin(encryptedFieldsPlugin, { fields: ['kyc.pan', 'kyc.aadhaar', 'bank.accountNo'] });

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.checkPassword = function checkPassword(password) {
  return this.passwordHash ? bcrypt.compare(password, this.passwordHash) : false;
};

/** Safe public representation (masks identity numbers). */
userSchema.methods.toPublic = function toPublic() {
  const o = this.toJSON();
  delete o.passwordHash;
  delete o.fcmTokens;
  delete o.tokenVersion;
  if (o.kyc) {
    o.kyc.pan = mask(o.kyc.pan);
    o.kyc.aadhaar = mask(o.kyc.aadhaar);
  }
  if (o.bank) o.bank.accountNo = mask(o.bank.accountNo);
  return o;
};

/** All user ids reporting (directly or indirectly) to managerId. */
userSchema.statics.subordinateIds = async function subordinateIds(managerId) {
  const [res] = await this.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(managerId)) } },
    { $graphLookup: { from: 'users', startWith: '$_id', connectFromField: '_id', connectToField: 'manager', as: 'team', maxDepth: 5 } },
    { $project: { ids: '$team._id' } },
  ]);
  return res?.ids ?? [];
};

export const User = mongoose.model('User', userSchema);
