import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 },
  genericName: { type: String, trim: true, default: '' },
  category: { type: String, required: true, trim: true, index: true },
  batchNumber: { type: String, required: true, trim: true, index: true },
  quantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  reorderLevel: { type: Number, required: true, min: 0, default: 10, validate: Number.isInteger },
  expiryDate: { type: Date, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  unit: { type: String, trim: true, default: 'unit' },
  manufacturer: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
}, { timestamps: true, versionKey: false });

medicineSchema.index({ name: 'text', genericName: 'text', batchNumber: 'text' });

export default mongoose.model('Medicine', medicineSchema);
