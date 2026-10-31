import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['patient', 'doctor', 'medicine_manager', 'diagnosis_lab_manager', 'admin'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  password: { type: String, required: true, minlength: 8, select: false },
  // Keep ID card values as strings because they can contain leading zeroes and letters.
  idCardNumber: { type: String, required: true, trim: true, unique: true, select: false },
  role: { type: String, enum: ROLES, default: 'patient', index: true },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.model('User', userSchema);
