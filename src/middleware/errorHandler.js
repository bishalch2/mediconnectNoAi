import multer from 'multer';

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ message: tooLarge ? 'Uploaded file exceeds the configured size limit.' : error.message });
  }
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return res.status(409).json({ message: `${field} already exists. Use a unique value.` });
  }
  if (error?.name === 'ValidationError') {
    return res.status(400).json({ message: error.message });
  }
  if (error?.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${error.path}.` });
  }
  const status = Number(error.statusCode || error.status || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  if (safeStatus >= 500) console.error(error);
  res.status(safeStatus).json({
    message: safeStatus >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error.' : (error.message || 'Internal server error.'),
  });
}
