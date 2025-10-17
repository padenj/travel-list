
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
import { closeDb, getDb } from './db';

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
    // Serve frontend static files. Add a short middleware to prevent HTML
    // (index.html and other .html) from being cached by intermediate
    // proxies / CDNs during development/testing. This ensures the SPA shell
    // is always fetched from the origin and reduces stale nav/HTML issues.
    app.use((req, res, next) => {
      // Only apply to GET requests for HTML documents
      if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
        // Prevent caching at the edge and in browsers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });

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
  const runMigrationsIfAny = async () => {
    try {
      const migrationsDir = path.resolve(process.cwd(), 'server', 'migrations', 'migrations');
      // Prefer placing migrations.json next to the DB file so it can live on the same
      // mount as the database (e.g., /data) and persist across image updates.
      // Fall back to the repo path for in-memory/test DBs.
      const dbFileEnv = process.env.DB_FILE || path.join('data', 'travel-list.sqlite');
      const resolvedDbFile = dbFileEnv === ':memory:' ? dbFileEnv : path.resolve(process.cwd(), dbFileEnv);
      let storagePath: string;

      if (resolvedDbFile === ':memory:') {
        storagePath = path.resolve(process.cwd(), 'server', 'migrations', 'migrations.json');
      } else {
        const dbDir = path.dirname(resolvedDbFile);
        // Ensure directory exists
        try {
          if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        } catch (e) {
          console.warn('Could not ensure database directory exists:', e);
        }
        storagePath = path.join(dbDir, 'migrations.json');
      }

      console.log('Using migration storage at', storagePath);

      const files: string[] = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort() : [];
      const migrations = files.map(f => ({ name: f, path: path.join(migrationsDir, f) }));

      if (!fs.existsSync(storagePath)) {
        // If migrations storage doesn't exist (fresh install), mark migrations
        // up to the latest migration date as already applied. This avoids
        // re-applying older migrations on a fresh schema that already includes
        // those changes.
        let initialExecuted: string[] = [];
        try {
          if (migrations && migrations.length > 0) {
            // Extract date prefix (YYYYMMDD) from filenames and determine the
            // maximum date present among migration files.
            const dates = migrations.map(m => {
              const match = m.name.match(/^(\d{8})/);
              return match ? match[1] : null;
            }).filter(Boolean) as string[];
            const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0]);
            // Mark any migration whose date prefix is <= maxDate as executed.
            initialExecuted = migrations.filter(m => {
              const match = m.name.match(/^(\d{8})/);
              if (!match) return false;
              return match[1] <= maxDate;
            }).map(m => m.name);
          }
        } catch (e) {
          console.warn('Could not pre-populate migrations storage; defaulting to empty list', e);
          initialExecuted = [];
        }
        fs.writeFileSync(storagePath, JSON.stringify(initialExecuted, null, 2), 'utf8');
      }

      let executed: string[] = [];
      try {
        const raw = fs.readFileSync(storagePath, 'utf8');
        executed = JSON.parse(raw || '[]');
      } catch (e) {
        console.warn('Could not read executed migrations storage; starting fresh', e);
        executed = [];
      }

      const pending = migrations.filter(m => !executed.includes(m.name));
      if (!pending || pending.length === 0) {
        console.log('✅ Database is up to date; no migrations to run');
        return;
      }

      console.log(`⚡ Found ${pending.length} pending migration(s). Applying now...`);

      const db: any = await getDb();

      for (const m of pending) {
        console.log('Applying migration', m.name);
        const moduleUrl = `file://${m.path}`;
        const required = await import(moduleUrl);
        const mod = required.default || required;
        if (!mod || typeof mod.up !== 'function') {
          throw new Error(`Migration ${m.name} has no up function`);
        }
        await mod.up({ db });
        executed.push(m.name);
        fs.writeFileSync(storagePath, JSON.stringify(executed, null, 2), 'utf8');
        console.log('Applied', m.name);
      }

      console.log('✅ Migrations applied');
    } catch (err: any) {
      console.error('⚠️ Error running migrations:', err && err.message ? err.message : err);
      throw err;
    }
  };

  (async () => {
    try {
      await runMigrationsIfAny();
    } catch (err) {
      console.error('Migrations failed during startup; aborting server start.');
      process.exit(1);
    }

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
  })();
}

export default app;
