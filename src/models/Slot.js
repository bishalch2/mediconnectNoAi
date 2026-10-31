import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: undefined, index: true },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true },
  // Optional for backward compatibility with slots created before duration selection existed.
  durationMinutes: { type: Number, enum: [5, 10, 15, 20, 30, 60] },
  status: { type: String, enum: ['available', 'booked'], default: 'available', index: true },
}, { timestamps: true, versionKey: false });

slotSchema.index({ doctorId: 1, startTime: 1 }, { unique: true });
slotSchema.index({ patientId: 1, startTime: 1 });

export default mongoose.model('Slot', slotSchema);
