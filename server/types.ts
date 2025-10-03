// Type definitions for custom Express Request extensions

import { Request } from 'express';
import { User } from './server-types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};