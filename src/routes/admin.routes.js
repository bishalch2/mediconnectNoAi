import { Router } from 'express';
import User, { ROLES } from '../models/User.js';
import { authenticate, requireRole, publicUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

// Admin lookup by the user's Gmail/email. Do not return password or ID card numbers.
router.get('/users', asyncHandler(async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ message: 'Provide an email query parameter, for example ?email=person@gmail.com.' });
  const users = await User.find({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }).sort({ name: 1 });
  res.json({ count: users.length, users: users.map(publicUser) });
}));

router.patch('/users/role', asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const role = req.body?.role;
  if (!email || !role) return res.status(400).json({ message: 'email and role are required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: `role must be one of: ${ROLES.join(', ')}.` });
  const target = await User.findOne({ email });
  if (!target) return res.status(404).json({ message: 'User not found for that email.' });
  if (String(target._id) === String(req.user._id) && role !== 'admin') {
    return res.status(409).json({ message: 'You cannot remove your own admin role.' });
  }
  target.role = role;
  await target.save();
  res.json({ message: 'User role updated successfully.', user: publicUser(target) });
}));

router.patch('/users/active', asyncHandler(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'email and boolean isActive are required.' });
  const target = await User.findOne({ email });
  if (!target) return res.status(404).json({ message: 'User not found for that email.' });
  if (String(target._id) === String(req.user._id) && req.body.isActive === false) return res.status(409).json({ message: 'You cannot disable your own account.' });
  target.isActive = req.body.isActive;
  await target.save();
  res.json({ message: 'User account status updated.', user: publicUser(target) });
}));

export default router;
