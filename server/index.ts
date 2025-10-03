
import '../server/env-loader';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware';
import routes from './routes';
import { errorHandler, notFoundHandler } from './error-handler';
import { closeDb } from './db';

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '3001');

// Enable CORS for all routes
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://code3000.padenco.com', 
    'https://code3000.padenco.com'
  ],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    message: 'Travel List API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await closeDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await closeDb();
  process.exit(0);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on http://0.0.0.0:${PORT}`);
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      console.error(`💥 Port ${PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`💥 Port ${PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});
