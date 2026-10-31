export function recordForResponse(record, req) {
  const value = record.toObject ? record.toObject() : { ...record };
  delete value.patientIdCardNumber;
  if (value.file) {
    value.file = {
      originalName: value.file.originalName,
      mimeType: value.file.mimeType,
      size: value.file.size,
      downloadUrl: `${req.protocol}://${req.get('host')}/api/records/${value._id}/file`,
    };
  }
  return value;
}

export function parseMedicines(value) {
  if (value === undefined || value === null || value === '') return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); }
    catch { const error = new Error('medicines must be a JSON array.'); error.statusCode = 400; throw error; }
  }
  if (!Array.isArray(parsed)) {
    const error = new Error('medicines must be an array of objects.'); error.statusCode = 400; throw error;
  }
  return parsed;
}
