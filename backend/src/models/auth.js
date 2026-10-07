import mongoose from 'mongoose';

const { Schema } = mongoose;

const otpSchema = new Schema({
  identifier: { type: String, required: true, index: true }, // mobile or email
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
});
export const Otp = mongoose.model('Otp', otpSchema);

const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    tokenVersion: { type: Number, required: true },
    device: String,
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: Date,
  },
  { timestamps: true },
);
export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
