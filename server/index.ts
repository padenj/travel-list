
// Load environment variables early. Importing `dotenv/config` directly keeps the
// runtime import flat (no separate helper file) which avoids ESM resolution
// issues with extensionless imports after TypeScript transpilation.
import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
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

// Note: static serving of the built frontend is mounted after the API routes
// later in this file so that API/SSE routes take precedence. The production
// build lives at ./client/dist (created by `npm --prefix client run build`).

// Health check endpoint (API)
// Serve this under /api/health so the site root can host the frontend SPA.
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    message: 'Travel List API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api', routes);

// Serve built frontend when available (production). The builder places the
// frontend build at ./client/dist inside the image. If present, serve it and
// fallback to index.html for SPA routing. This keeps the frontend and backend
// on the same origin (port), so client-side proxying to /api continues to work.
try {
  const frontendDist = path.resolve(process.cwd(), 'client', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback — ensure API routes remain under /api
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    console.log('📦 Serving frontend from', frontendDist);
  }
} catch (err) {
  console.warn('⚠️ Frontend static serve setup failed', err);
}

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

// Only start listening if this module is the main entry point.
let server: any;
// In ESM environments `require.main === module` is not available. Use import.meta.url
// to detect direct execution. Compare the file path of this module to process.argv[1].
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv && process.argv[1] && __filename === process.argv[1];
if (isMain) {
  server = app.listen(PORT, '0.0.0.0', () => {
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
}

export default app;
