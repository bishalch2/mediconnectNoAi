import { Router } from 'express';
import mongoose from 'mongoose';
import Medicine from '../models/Medicine.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { medicineWithStatus } from '../utils/medicine.js';

const router = Router();
router.use(authenticate);
const managers = requireRole('medicine_manager', 'admin');
const editableFields = ['name', 'genericName', 'category', 'batchNumber', 'quantity', 'reorderLevel', 'expiryDate', 'isActive', 'unit', 'manufacturer', 'description'];

router.post('/', managers, asyncHandler(async (req, res) => {
  const medicine = await Medicine.create(req.body || {});
  res.status(201).json({ message: 'Medicine added successfully.', medicine: medicineWithStatus(medicine) });
}));

router.get('/low-stock', asyncHandler(async (_req, res) => {
  const medicines = await Medicine.find({ $expr: { $lte: ['$quantity', '$reorderLevel'] } }).sort({ quantity: 1, name: 1 });
  res.json(medicines.map(medicineWithStatus));
}));

router.get('/expired', asyncHandler(async (_req, res) => {
  const medicines = await Medicine.find({ expiryDate: { $lt: new Date() } }).sort({ expiryDate: 1 });
  res.json(medicines.map(medicineWithStatus));
}));

router.get('/', asyncHandler(async (req, res) => {
  const { search, category } = req.query;
  const filter = {};
  if (typeof search === 'string' && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { genericName: { $regex: escaped, $options: 'i' } },
      { batchNumber: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (typeof category === 'string' && category.trim()) filter.category = category.trim();
  const medicines = await Medicine.find(filter).sort({ expiryDate: 1 }).limit(500);
  res.json(medicines.map(medicineWithStatus));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Medicine ID is invalid.' });
  const medicine = await Medicine.findById(req.params.id);
  if (!medicine) return res.status(404).json({ message: 'Medicine not found.' });
  res.json(medicineWithStatus(medicine));
}));

router.patch('/:id/stock', managers, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Medicine ID is invalid.' });
  const { type, amount } = req.body || {};
  if (!['add', 'remove'].includes(type)) return res.status(400).json({ message: 'Type must be add or remove.' });
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ message: 'Amount must be a positive integer.' });
  let medicine;
  if (type === 'add') {
    medicine = await Medicine.findByIdAndUpdate(req.params.id, { $inc: { quantity: amount } }, { new: true, runValidators: true });
  } else {
    medicine = await Medicine.findOneAndUpdate({ _id: req.params.id, quantity: { $gte: amount } }, { $inc: { quantity: -amount } }, { new: true, runValidators: true });
  }
  if (!medicine) return res.status(400).json({ message: type === 'remove' ? 'Medicine not found or insufficient stock.' : 'Medicine not found.' });
  res.json({ message: `Stock ${type === 'add' ? 'added' : 'removed'} successfully.`, medicine: medicineWithStatus(medicine) });
}));

router.patch('/:id', managers, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Medicine ID is invalid.' });
  const update = {};
  for (const key of editableFields) if (Object.hasOwn(req.body || {}, key)) update[key] = req.body[key];
  const medicine = await Medicine.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!medicine) return res.status(404).json({ message: 'Medicine not found.' });
  res.json({ message: 'Medicine updated successfully.', medicine: medicineWithStatus(medicine) });
}));

router.delete('/:id', managers, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Medicine ID is invalid.' });
  const medicine = await Medicine.findByIdAndDelete(req.params.id);
  if (!medicine) return res.status(404).json({ message: 'Medicine not found.' });
  res.json({ message: 'Medicine deleted successfully.' });
}));

export default router;
