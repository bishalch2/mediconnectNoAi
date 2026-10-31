import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import User from '../models/User.js';
import MedicalRecord from '../models/MedicalRecord.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordForResponse, parseMedicines } from '../utils/records.js';
import { runPneumoniaPrediction } from '../services/pneumoniaService.js';

const router = Router();
router.use(authenticate);

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 10)) * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Only JPG, PNG, and PDF files are supported.');
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  },
});
const parseUpload = (req, res, next) => upload.single('file')(req, res, (error) => error ? next(error) : next());

function fileMetadata(file) {
  if (!file) return undefined;
  return { storageName: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size };
}

async function findPatientByCard(idCardNumber) {
  if (typeof idCardNumber !== 'string' || !idCardNumber.trim()) return null;
  return User.findOne({ idCardNumber: idCardNumber.trim(), role: 'patient', isActive: true }).select('+idCardNumber');
}

async function removeStoredFile(storageName) {
  if (!storageName) return;
  const safeName = path.basename(storageName);
  await fsPromises.unlink(path.join(uploadDir, safeName)).catch(() => {});
}

function canReadRecord(record, user) {
  if (['admin', 'doctor', 'diagnosis_lab_manager'].includes(user.role)) return true;
  return user.role === 'patient' && String(record.patientId) === String(user._id);
}

router.get('/my', requireRole('patient'), asyncHandler(async (req, res) => {
  const records = await MedicalRecord.find({ patientId: req.user._id })
    .populate('uploadedBy', 'name email role').sort({ recordedAt: -1 });
  res.json({ count: records.length, records: records.map((record) => recordForResponse(record, req)) });
}));

// Doctors, diagnosis staff, and administrators can look up the patient's history by ID card number.
router.get('/patient/:idCardNumber', requireRole('doctor', 'diagnosis_lab_manager', 'admin'), asyncHandler(async (req, res) => {
  const patient = await findPatientByCard(req.params.idCardNumber);
  if (!patient) return res.status(404).json({ message: 'Patient not found for that ID card number.' });
  const records = await MedicalRecord.find({ patientId: patient._id })
    .populate('uploadedBy', 'name email role').sort({ recordedAt: -1 });
  res.json({ patient: { id: String(patient._id), name: patient.name, email: patient.email }, count: records.length, records: records.map((record) => recordForResponse(record, req)) });
}));

router.post('/lab-reports', requireRole('diagnosis_lab_manager', 'admin'), parseUpload, asyncHandler(async (req, res) => {
  const idCardNumber = req.body?.idCardNumber;
  if (!idCardNumber) return res.status(400).json({ message: 'idCardNumber is required.' });
  if (!req.file) return res.status(400).json({ message: 'Attach a report in the multipart form field named file.' });
  const patient = await findPatientByCard(idCardNumber);
  if (!patient) {
    await removeStoredFile(req.file.filename);
    return res.status(404).json({ message: 'Patient not found for that ID card number.' });
  }
  const reportType = String(req.body.reportType || 'general').trim().toLowerCase().replace(/[\s-]+/g, '_');
  let aiPrediction;
  if (reportType === 'chest_xray' || reportType === 'chest_x_ray') {
    aiPrediction = await runPneumoniaPrediction(req.file);
  }
  const record = await MedicalRecord.create({
    patientId: patient._id,
    patientIdCardNumber: patient.idCardNumber,
    type: 'lab_report',
    title: String(req.body.title || 'Diagnostic lab report').trim(),
    reportType,
    diagnosis: String(req.body.diagnosis || '').trim(),
    notes: String(req.body.notes || '').trim(),
    file: fileMetadata(req.file),
    aiPrediction,
    recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
    uploadedBy: req.user._id,
  });
  res.status(201).json({ message: 'Lab report uploaded successfully.', record: recordForResponse(record, req) });
}));

// Updates the newest lab report for this ID card number. Upload a new file only when replacing it.
router.patch('/lab-reports/by-card/:idCardNumber', requireRole('diagnosis_lab_manager', 'admin'), parseUpload, asyncHandler(async (req, res) => {
  const patient = await findPatientByCard(req.params.idCardNumber);
  if (!patient) return res.status(404).json({ message: 'Patient not found for that ID card number.' });
  const record = await MedicalRecord.findOne({ patientId: patient._id, type: 'lab_report' }).sort({ recordedAt: -1 });
  if (!record) {
    if (req.file) await removeStoredFile(req.file.filename);
    return res.status(404).json({ message: 'No lab report exists for this patient yet. Upload one first.' });
  }
  for (const field of ['title', 'reportType', 'diagnosis', 'notes']) {
    if (typeof req.body?.[field] === 'string') record[field] = req.body[field].trim();
  }
  if (req.body?.recordedAt) {
    const parsedDate = new Date(req.body.recordedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      if (req.file) await removeStoredFile(req.file.filename);
      return res.status(400).json({ message: 'recordedAt is not a valid date.' });
    }
    record.recordedAt = parsedDate;
  }
  let newPrediction;
  if (req.file) {
    const oldStorageName = record.file?.storageName;
    record.file = fileMetadata(req.file);
    const normalizedType = String(record.reportType || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (normalizedType === 'chest_xray' || normalizedType === 'chest_x_ray') newPrediction = await runPneumoniaPrediction(req.file);
    record.aiPrediction = newPrediction;
    await record.save();
    if (oldStorageName) await removeStoredFile(oldStorageName);
  } else {
    await record.save();
  }
  res.json({ message: 'Lab report updated successfully.', record: recordForResponse(record, req) });
}));

router.patch('/lab-reports/:recordId', requireRole('diagnosis_lab_manager', 'admin'), parseUpload, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.recordId)) {
    if (req.file) await removeStoredFile(req.file.filename);
    return res.status(400).json({ message: 'recordId is invalid.' });
  }
  const record = await MedicalRecord.findOne({ _id: req.params.recordId, type: 'lab_report' });
  if (!record) {
    if (req.file) await removeStoredFile(req.file.filename);
    return res.status(404).json({ message: 'Lab report not found.' });
  }
  for (const field of ['title', 'reportType', 'diagnosis', 'notes']) {
    if (typeof req.body?.[field] === 'string') record[field] = req.body[field].trim();
  }
  const oldStorageName = req.file ? record.file?.storageName : undefined;
  if (req.file) {
    record.file = fileMetadata(req.file);
    const normalizedType = String(record.reportType || '').toLowerCase().replace(/[\s-]+/g, '_');
    record.aiPrediction = normalizedType === 'chest_xray' || normalizedType === 'chest_x_ray'
      ? await runPneumoniaPrediction(req.file)
      : undefined;
  }
  await record.save();
  if (oldStorageName) await removeStoredFile(oldStorageName);
  res.json({ message: 'Lab report updated successfully.', record: recordForResponse(record, req) });
}));

router.post('/prescriptions', requireRole('doctor', 'admin'), parseUpload, asyncHandler(async (req, res) => {
  const patient = await findPatientByCard(req.body?.idCardNumber);
  if (!patient) {
    if (req.file) await removeStoredFile(req.file.filename);
    return res.status(404).json({ message: 'Patient not found for that ID card number.' });
  }
  const medicines = parseMedicines(req.body?.medicines);
  if (!req.file && !medicines.length && !req.body?.diagnosis && !req.body?.notes) {
    return res.status(400).json({ message: 'Provide a file, medicines, diagnosis, or notes for the prescription.' });
  }
  const record = await MedicalRecord.create({
    patientId: patient._id,
    patientIdCardNumber: patient.idCardNumber,
    type: 'prescription',
    title: String(req.body.title || 'Doctor prescription').trim(),
    diagnosis: String(req.body.diagnosis || '').trim(),
    notes: String(req.body.notes || '').trim(),
    medicines,
    file: fileMetadata(req.file),
    recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
    uploadedBy: req.user._id,
  });
  res.status(201).json({ message: 'Prescription saved successfully.', record: recordForResponse(record, req) });
}));

router.get('/:recordId/file', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.recordId)) return res.status(400).json({ message: 'recordId is invalid.' });
  const record = await MedicalRecord.findById(req.params.recordId);
  if (!record) return res.status(404).json({ message: 'Medical record not found.' });
  if (!canReadRecord(record, req.user)) return res.status(403).json({ message: 'You are not allowed to download this file.' });
  if (!record.file?.storageName) return res.status(404).json({ message: 'This record does not have an attached file.' });
  const filePath = path.join(uploadDir, path.basename(record.file.storageName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Stored file is missing from the server.' });
  res.setHeader('Content-Type', record.file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(record.file.originalName).replace(/[\r\n"]+/g, '_')}"`);
  res.sendFile(filePath);
}));

export default router;
