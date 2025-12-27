import { JWT_SECRET } from './auth';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from './server-types';

interface AuthenticatedRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Response | void {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware to ensure only SystemAdmin or members of a family can access family-scoped routes
export function familyAccessMiddleware(paramFamilyIdName: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const familyId = req.params[paramFamilyIdName] || req.body?.familyId || null;
    if (!req.user) return res.status(401).json({ error: 'No token provided' });
    if (req.user.role === 'SystemAdmin') return next();
    if (!familyId) return res.status(403).json({ error: 'Forbidden' });
    if (req.user.familyId !== familyId) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}
