import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Uploaded file metadata. Bytes are stored AES-encrypted on disk (see routes/files.js). */
const fileSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Partner uploads are also visible to other logins of the same distributor.
    distributor: { type: Schema.Types.ObjectId, ref: 'Distributor' },
    storageName: { type: String, required: true },
    originalName: String,
    mimeType: String,
    size: Number,
    purpose: {
      type: String,
      enum: ['bill', 'kyc', 'document', 'payslip', 'claim', 'photo', 'ticket', 'other'],
      default: 'other',
    },
  },
  { timestamps: true },
);

export const File = mongoose.model('File', fileSchema);
