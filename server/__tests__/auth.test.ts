import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validatePassword, hashPasswordSync, comparePasswordSync } from '../auth';

describe('Authentication Utils', () => {
  describe('validatePassword', () => {
    it('should reject passwords that are too short', () => {
      expect(validatePassword('short1')).toBe(false);
      expect(validatePassword('1234567')).toBe(false);
    });

    it('should reject passwords with only one character type', () => {
      expect(validatePassword('lowercase')).toBe(false);
      expect(validatePassword('UPPERCASE')).toBe(false);
      expect(validatePassword('12345678')).toBe(false);
      expect(validatePassword('!@#$%^&*')).toBe(false);
    });

    it('should accept passwords with at least 2 character types', () => {
      expect(validatePassword('Password')).toBe(true); // upper + lower
      expect(validatePassword('password1')).toBe(true); // lower + number
      expect(validatePassword('PASSWORD!')).toBe(true); // upper + symbol
      expect(validatePassword('123456!@')).toBe(true); // number + symbol
    });

    it('should accept passwords with multiple character types', () => {
      expect(validatePassword('Password1')).toBe(true); // upper + lower + number
      expect(validatePassword('Password!')).toBe(true); // upper + lower + symbol
      expect(validatePassword('ValidP@ss1')).toBe(true); // all 4 types
    });
  });

  describe('password hashing', () => {
    const password = 'TestPassword123!';

    it('should hash passwords correctly', () => {
      const hash = hashPasswordSync(password);
      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
    });

    it('should verify hashed passwords correctly', () => {
      const hash = hashPasswordSync(password);
      expect(comparePasswordSync(password, hash)).toBe(true);
      expect(comparePasswordSync('wrongpassword', hash)).toBe(false);
    });

    it('should produce different hashes for the same password', () => {
      const hash1 = hashPasswordSync(password);
      const hash2 = hashPasswordSync(password);
      expect(hash1).not.toBe(hash2); // Due to salt
      expect(comparePasswordSync(password, hash1)).toBe(true);
      expect(comparePasswordSync(password, hash2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle non-string inputs', () => {
      expect(validatePassword(null as any)).toBe(false);
      expect(validatePassword(undefined as any)).toBe(false);
      expect(validatePassword(123 as any)).toBe(false);
    });
  });
});