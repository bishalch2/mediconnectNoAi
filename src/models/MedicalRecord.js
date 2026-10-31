import mongoose from 'mongoose';

const prescribedMedicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dosage: { type: String, trim: true, default: '' },
  frequency: { type: String, trim: true, default: '' },
  duration: { type: String, trim: true, default: '' },
  instructions: { type: String, trim: true, default: '' },
}, { _id: false });

const fileSchema = new mongoose.Schema({
  storageName: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
}, { _id: false });

const medicalRecordSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  patientIdCardNumber: { type: String, required: true, index: true },
  type: { type: String, enum: ['lab_report', 'prescription'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  reportType: { type: String, trim: true, default: '' },
  diagnosis: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  medicines: { type: [prescribedMedicineSchema], default: [] },
  file: { type: fileSchema, default: undefined },
  aiPrediction: { type: mongoose.Schema.Types.Mixed, default: undefined },
  recordedAt: { type: Date, default: Date.now, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });

medicalRecordSchema.index({ patientId: 1, type: 1, recordedAt: -1 });

export default mongoose.model('MedicalRecord', medicalRecordSchema);
