import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authMiddleware } from '../middleware';
import { tripAccessMiddleware } from '../middleware/tripAccessMiddleware';

export const tripFileRouter = Router();

// Configure multer
const uploadsDir = process.env.UPLOADS_DIR || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Store with UUID name, keep original name in DB
    const fileId = uuidv4();
    cb(null, fileId);
  },
});

const upload = multer({ storage });

// Upload file to element
tripFileRouter.post(
  '/:tripId/elements/:elementId/files',
  authMiddleware,
  tripAccessMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileId = req.file.filename;
      const storedPath = path.join(uploadsDir, fileId);

      const db = await getDb();

      // Store file metadata in database
      await db.run(
        `INSERT INTO trip_element_attachments (id, element_id, filename, original_name, mime_type, file_path, file_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [fileId, req.params.elementId, fileId, req.file.originalname, req.file.mimetype, storedPath, req.file.size]
      );

      res.status(201).json({
        id: fileId,
        filename: fileId,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: storedPath,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

// Download file
tripFileRouter.get(
  '/:tripId/files/:fileId',
  authMiddleware,
  tripAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const file = await db.get(
        `SELECT * FROM trip_element_attachments WHERE id = ?`,
        [req.params.fileId]
      );

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.download(file.file_path, file.original_name);
    } catch (error) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
);

// Delete file
tripFileRouter.delete(
  '/:tripId/files/:fileId',
  authMiddleware,
  tripAccessMiddleware,
  async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const file = await db.get(
        `SELECT * FROM trip_element_attachments WHERE id = ?`,
        [req.params.fileId]
      );

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Delete from filesystem
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
      }

      // Delete from database
      await db.run(
        `DELETE FROM trip_element_attachments WHERE id = ?`,
        [req.params.fileId]
      );

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
);
