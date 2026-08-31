import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      trip?: {
        id: string;
        family_id: string;
        name: string;
        [key: string]: any;
      };
    }
  }
}

export const tripAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const tripId = req.params.tripId;
  const familyId = (req as any).user?.familyId;

  if (!tripId || !familyId) {
    return res.status(400).json({ error: 'Missing tripId or familyId' });
  }

  const db = await getDb();
  const trip = await db.get(
    `SELECT * FROM trips WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
    [tripId, familyId]
  );

  if (!trip) {
    return res.status(403).json({ error: 'Access denied: Trip not found or does not belong to your family' });
  }

  req.trip = trip;
  next();
};
