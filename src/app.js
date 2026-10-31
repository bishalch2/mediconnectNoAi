import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import slotRoutes from './routes/slots.routes.js';
import bookingRoutes from './routes/bookings.routes.js';
import medicineRoutes from './routes/medicines.routes.js';
import recordRoutes from './routes/records.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = (process.env.CLIENT_ORIGIN || '*').split(',').map((value) => value.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: !allowedOrigins.includes('*'),
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hospital-management-api', timestamp: new Date().toISOString() });
});
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/records', recordRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
