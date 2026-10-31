import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ID_CARD_NUMBER } = process.env;
if (!MONGODB_URI) throw new Error('MONGODB_URI is required in .env.');
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ID_CARD_NUMBER) {
  throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_ID_CARD_NUMBER in .env before seeding.');
}
if (ADMIN_PASSWORD.length < 12) throw new Error('Use an ADMIN_PASSWORD of at least 12 characters.');

try {
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  let admin = await User.findOne({ email }).select('+idCardNumber');
  if (admin) {
    admin.role = 'admin';
    admin.isActive = true;
    if (admin.idCardNumber !== ADMIN_ID_CARD_NUMBER.trim()) {
      throw new Error('An account with ADMIN_EMAIL already exists with a different ID card number. Check .env before seeding.');
    }
    await admin.save();
    console.log(`Existing account ${email} granted admin role. Password was not changed.`);
  } else {
    admin = await User.create({
      name: ADMIN_NAME || 'Hospital Administrator',
      email,
      password: ADMIN_PASSWORD,
      idCardNumber: ADMIN_ID_CARD_NUMBER.trim(),
      role: 'admin',
    });
    console.log(`Admin account created for ${admin.email}.`);
  }
} finally {
  await mongoose.disconnect();
}
