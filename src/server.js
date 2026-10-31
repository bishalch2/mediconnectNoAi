import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/db.js';

const port = Number(process.env.PORT || 5000);

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a private random string of at least 32 characters.');
  }
  await connectDatabase();
  app.listen(port, "0.0.0.0", ()=> {
    console.log(`Hospital API listening at http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
