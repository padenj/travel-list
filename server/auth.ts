import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { User } from './server-types';

import crypto from 'crypto';

// Generate a secure random secret if none provided
const generateSecureSecret = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

export const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  console.warn('⚠️  Using generated JWT secret for development. Set JWT_SECRET environment variable.');
  return generateSecureSecret();
})();
export const PASSWORD_POLICY = {
  minLength: 8,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /[0-9]/,
  symbol: /[^A-Za-z0-9]/
} as const;

export function validatePassword(password: string): boolean {
  if (typeof password !== 'string') return false;
  if (password.length < PASSWORD_POLICY.minLength) return false;
  
  // Check if at least 2 of the 4 character types are present
  let typeCount = 0;
  if (PASSWORD_POLICY.upper.test(password)) typeCount++;
  if (PASSWORD_POLICY.lower.test(password)) typeCount++;
  if (PASSWORD_POLICY.number.test(password)) typeCount++;
  if (PASSWORD_POLICY.symbol.test(password)) typeCount++;
  
  return typeCount >= 2;
}

// Use async operations to avoid blocking the event loop
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Keep sync versions for backward compatibility during migration
export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function comparePasswordSync(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(user: User): string {
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    familyId: user.familyId || null
  }, JWT_SECRET, { expiresIn: '60d' });
}
