import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { authenticate, publicUser } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, idCardNumber } = req.body || {};
  if (![name, email, password, idCardNumber].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ message: 'name, email, password, and idCardNumber are all required.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({ message: 'A valid email address is required.' });
  if (password.length < 8) return res.status(400).json({ message: 'password must contain at least 8 characters.' });
  const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), password, idCardNumber: idCardNumber.trim(), role: 'patient' });
  return res.status(201).json({ message: 'Patient account created. An administrator can assign a different role.', user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, idCardNumber } = req.body || {};
  if (![email, password, idCardNumber].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ message: 'email, password, and idCardNumber are required.' });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +idCardNumber');
  if (!user || !(await bcrypt.compare(password, user.password)) || user.idCardNumber !== idCardNumber.trim()) {
    return res.status(401).json({ message: 'Invalid email, password, or ID card number.' });
  }
  if (!user.isActive) return res.status(403).json({ message: 'This account is disabled. Contact an administrator.' });
  const token = jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  return res.json({ message: 'Login successful.', token, tokenType: 'Bearer', expiresIn: process.env.JWT_EXPIRES_IN || '7d', user: publicUser(user) });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
