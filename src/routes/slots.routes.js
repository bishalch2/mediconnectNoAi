import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Slot from '../models/Slot.js';
import { authenticate, requireRole, publicUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildSlots, parseDateTime, timezoneSuffix, validateSlotDuration } from '../utils/time.js';

const router = Router();
router.use(authenticate);

router.get('/doctors', asyncHandler(async (_req, res) => {
  const doctors = await User.find({ role: 'doctor', isActive: true }).sort({ name: 1 });
  res.json({ doctors: doctors.map(publicUser) });
}));

router.post('/availability', requireRole('doctor'), asyncHandler(async (req, res) => {
  const { startTime, endTime } = req.body || {};
  const slotDurationMinutes = Number(req.body?.slotDurationMinutes ?? 30);
  validateSlotDuration(slotDurationMinutes);
  const start = parseDateTime(startTime, 'startTime');
  const end = parseDateTime(endTime, 'endTime');
  if (timezoneSuffix(startTime) !== timezoneSuffix(endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must use the same timezone offset.' });
  }
  if (start <= new Date()) return res.status(400).json({ message: 'startTime must be in the future.' });
  const generated = buildSlots(start, end, slotDurationMinutes);
  const overlap = await Slot.findOne({ doctorId: req.user._id, startTime: { $lt: end }, endTime: { $gt: start } }).select('_id startTime endTime');
  if (overlap) return res.status(409).json({ message: 'This availability overlaps with an existing slot. Choose a different time window.', conflictingSlot: overlap });
  const createdSlots = await Slot.insertMany(generated.map((slot) => ({ ...slot, doctorId: req.user._id })), { ordered: true });
  res.status(201).json({ message: 'Availability created.', slotDurationMinutes, count: createdSlots.length, slots: createdSlots });
}));

router.get('/doctors/:doctorId/slots', asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  if (!mongoose.isValidObjectId(doctorId)) return res.status(400).json({ message: 'doctorId is not a valid MongoDB ObjectId.' });
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true });
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });

  const query = { doctorId };
  if (req.query.status !== undefined) {
    if (!['available', 'booked'].includes(req.query.status)) return res.status(400).json({ message: 'status must be available or booked.' });
    if (req.user.role === 'patient' && req.query.status === 'booked') return res.status(403).json({ message: 'Patients cannot query booked slots.' });
    if (req.user.role === 'doctor' && req.query.status === 'booked' && String(req.user._id) !== doctorId) {
      return res.status(403).json({ message: 'Doctors can only inspect booked slots belonging to themselves.' });
    }
    if (req.user.role !== 'doctor' && req.query.status === 'booked' && !['admin', 'diagnosis_lab_manager'].includes(req.user.role)) {
      return res.status(403).json({ message: 'You cannot query booked slots.' });
    }
    query.status = req.query.status;
  } else {
    query.status = 'available';
  }

  if (req.query.from || req.query.to) {
    if (!req.query.from || !req.query.to) return res.status(400).json({ message: 'Provide both from and to query parameters.' });
    const from = parseDateTime(req.query.from, 'from');
    const to = parseDateTime(req.query.to, 'to');
    if (to <= from) return res.status(400).json({ message: 'to must be later than from.' });
    query.startTime = { $gte: from, $lt: to };
  }

  // Do not advertise expired slots as available; the booking endpoint rejects past start times.
  if (query.status === 'available') {
    const now = new Date();
    if (query.startTime) {
      const currentLowerBound = query.startTime.$gte;
      if (!currentLowerBound || currentLowerBound < now) query.startTime.$gte = now;
    } else {
      query.startTime = { $gt: now };
    }
  }

  const slots = await Slot.find(query)
    .select(req.user.role === 'doctor' && String(req.user._id) === doctorId ? undefined : '-patientId')
    .sort({ startTime: 1 }).limit(500);
  res.json({ doctor: publicUser(doctor), count: slots.length, slots });
}));

router.patch('/slots/:slotId', requireRole('doctor'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.slotId)) return res.status(400).json({ message: 'slotId is not a valid MongoDB ObjectId.' });
  const slot = await Slot.findOne({ _id: req.params.slotId, doctorId: req.user._id, status: 'available', startTime: { $gt: new Date() } });
  if (!slot) return res.status(404).json({ message: 'Available future slot not found for this doctor. Booked slots cannot be edited.' });
  const start = parseDateTime(req.body?.startTime, 'startTime');
  const end = parseDateTime(req.body?.endTime, 'endTime');
  if (timezoneSuffix(req.body.startTime) !== timezoneSuffix(req.body.endTime)) {
    return res.status(400).json({ message: 'startTime and endTime must use the same timezone offset.' });
  }
  if (start <= new Date()) return res.status(400).json({ message: 'startTime must be in the future.' });
  const durationFromTimes = (end.getTime() - start.getTime()) / (60 * 1000);
  const durationMinutes = Number(req.body?.slotDurationMinutes ?? req.body?.durationMinutes ?? durationFromTimes);
  validateSlotDuration(durationMinutes);
  if (durationFromTimes !== durationMinutes) {
    return res.status(400).json({ message: 'The slot duration must match the difference between startTime and endTime.' });
  }
  const conflict = await Slot.findOne({ _id: { $ne: slot._id }, doctorId: req.user._id, startTime: { $lt: end }, endTime: { $gt: start } }).select('_id startTime endTime');
  if (conflict) return res.status(409).json({ message: 'The new slot time overlaps another slot.', conflictingSlot: conflict });
  slot.startTime = start;
  slot.endTime = end;
  slot.durationMinutes = durationMinutes;
  await slot.save();
  res.json({ message: 'Availability slot updated.', slot });
}));

router.delete('/slots/:slotId', requireRole('doctor'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.slotId)) return res.status(400).json({ message: 'slotId is not a valid MongoDB ObjectId.' });
  const deleted = await Slot.findOneAndDelete({ _id: req.params.slotId, doctorId: req.user._id, status: 'available', startTime: { $gt: new Date() } });
  if (!deleted) return res.status(404).json({ message: 'Available future slot not found for this doctor.' });
  res.json({ message: 'Slot deleted.', slotId: String(deleted._id) });
}));

export default router;
