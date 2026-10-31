import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Authentication required. Send Authorization: Bearer <token>.' });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Token is invalid or expired. Please log in again.' });
    }
    const user = await User.findById(payload.sub).select('+idCardNumber');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled.' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: `This action requires one of these roles: ${allowedRoles.join(', ')}.` });
    }
    next();
  };
}

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
