import { Router } from 'express';
import mongoose from 'mongoose';
import Slot from '../models/Slot.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

// The conditional update is atomic: only one concurrent patient can book a slot.
router.post('/', requireRole('patient'), asyncHandler(async (req, res) => {
  const { slotId } = req.body || {};
  if (!mongoose.isValidObjectId(slotId)) return res.status(400).json({ message: 'slotId is required and must be a valid MongoDB ObjectId.' });
  const booked = await Slot.findOneAndUpdate(
    { _id: slotId, status: 'available', startTime: { $gt: new Date() } },
    { $set: { status: 'booked', patientId: req.user._id } },
    { returnDocument: 'after', runValidators: true },
  ).populate('doctorId', 'name email');
  if (!booked) {
    const existing = await Slot.findById(slotId).select('status startTime');
    if (!existing) return res.status(404).json({ message: 'Slot not found.' });
    if (existing.startTime <= new Date()) return res.status(409).json({ message: 'This appointment time is in the past.' });
    return res.status(409).json({ message: 'This slot has already been booked.' });
  }
  res.status(201).json({ message: 'Appointment booked successfully.', booking: booked });
}));

router.get('/my', asyncHandler(async (req, res) => {
  if (!['patient', 'doctor'].includes(req.user.role)) return res.status(403).json({ message: 'Only patients and doctors can view their bookings.' });
  const filter = req.user.role === 'patient'
    ? { patientId: req.user._id, status: 'booked' }
    : { doctorId: req.user._id, status: 'booked' };
  const bookings = await Slot.find(filter).populate('doctorId', 'name email').populate('patientId', 'name email').sort({ startTime: 1 });
  res.json({ count: bookings.length, bookings });
}));

router.patch('/:slotId/cancel', requireRole('patient'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.slotId)) return res.status(400).json({ message: 'slotId is not a valid MongoDB ObjectId.' });
  const cancelled = await Slot.findOneAndUpdate(
    { _id: req.params.slotId, patientId: req.user._id, status: 'booked', startTime: { $gt: new Date() } },
    { $set: { status: 'available' }, $unset: { patientId: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!cancelled) return res.status(404).json({ message: 'Your future booking was not found.' });
  res.json({ message: 'Booking cancelled. The slot is available again.', slot: cancelled });
}));

router.patch('/:slotId/doctor-cancel', requireRole('doctor'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.slotId)) return res.status(400).json({ message: 'slotId is not a valid MongoDB ObjectId.' });
  const cancelled = await Slot.findOneAndUpdate(
    { _id: req.params.slotId, doctorId: req.user._id, status: 'booked', startTime: { $gt: new Date() } },
    { $set: { status: 'available' }, $unset: { patientId: 1 } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!cancelled) return res.status(404).json({ message: 'Your future booked slot was not found.' });
  res.json({ message: 'Appointment cancelled by doctor; the slot is available again.', slot: cancelled });
}));

export default router;
