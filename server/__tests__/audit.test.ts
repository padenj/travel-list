import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../audit';
import { getDb, closeDb } from '../db';

describe('Audit Logging', () => {
  let testUserId: string;
  let testFamilyId: string;

  beforeEach(async () => {
    await getDb(); // Initialize database
    
    // Create test family and user for audit tests
    const db = await getDb();
    testFamilyId = uuidv4();
    testUserId = uuidv4();
    
    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [testFamilyId, 'Test Family', new Date().toISOString(), new Date().toISOString()]
    );
    
    await db.run(
      'INSERT INTO users (id, username, password_hash, role, must_change_password, email, familyId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [testUserId, 'testuser', 'hash', 'FamilyMember', 0, 'test@example.com', testFamilyId, new Date().toISOString(), new Date().toISOString()]
    );
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('logAudit', () => {
    it('should log audit entry successfully', async () => {
      const auditData = {
        userId: testUserId,
        username: 'testuser',
        action: 'login',
        details: 'User logged in successfully'
      };

      await logAudit(auditData);
      
      const db = await getDb();
      const auditEntries = await db.all(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'login']
      );

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]).toMatchObject({
        user_id: testUserId,
        username: 'testuser',
        action: 'login',
        details: 'User logged in successfully'
      });
      expect(auditEntries[0].id).toBeDefined();
      expect(auditEntries[0].timestamp).toBeDefined();
    });

    it('should log multiple audit entries', async () => {
      const auditEntries = [
        {
          userId: testUserId,
          username: 'testuser',
          action: 'login',
          details: 'User logged in'
        },
        {
          userId: testUserId,
          username: 'testuser',
          action: 'change-password',
          details: 'User changed password'
        },
        {
          userId: testUserId,
          username: 'testuser',
          action: 'logout',
          details: 'User logged out'
        }
      ];

      for (const entry of auditEntries) {
        await logAudit(entry);
      }
      
      const db = await getDb();
      const savedEntries = await db.all(
        'SELECT * FROM audit_log WHERE user_id = ? ORDER BY timestamp',
        [testUserId]
      );

      expect(savedEntries).toHaveLength(3);
      expect(savedEntries.map(e => e.action)).toEqual(['login', 'change-password', 'logout']);
    });

    it('should handle audit entry without details', async () => {
      const auditData = {
        userId: testUserId,
        username: 'testuser',
        action: 'login'
        // No details provided
      };

      await logAudit(auditData);
      
      const db = await getDb();
      const auditEntries = await db.all(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'login']
      );

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].details).toBe('');
    });

    it('should generate unique IDs for each entry', async () => {
      const auditData = {
        userId: testUserId,
        username: 'testuser',
        action: 'test',
        details: 'Test entry'
      };

      await logAudit(auditData);
      await logAudit(auditData);
      
      const db = await getDb();
      const auditEntries = await db.all(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'test']
      );

      expect(auditEntries).toHaveLength(2);
      expect(auditEntries[0].id).not.toBe(auditEntries[1].id);
    });

    it('should store timestamps in correct format', async () => {
      const auditData = {
        userId: testUserId,
        username: 'testuser',
        action: 'timestamp-test',
        details: 'Testing timestamp format'
      };

      const beforeTime = new Date();
      await logAudit(auditData);
      const afterTime = new Date();
      
      const db = await getDb();
      const auditEntry = await db.get(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'timestamp-test']
      );

      expect(auditEntry).toBeDefined();
      const entryTime = new Date(auditEntry.timestamp);
      expect(entryTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(entryTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle long details gracefully', async () => {
      const longDetails = 'A'.repeat(1000); // 1000 character string
      const auditData = {
        userId: testUserId,
        username: 'testuser',
        action: 'long-details-test',
        details: longDetails
      };

      await logAudit(auditData);
      
      const db = await getDb();
      const auditEntry = await db.get(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'long-details-test']
      );

      expect(auditEntry).toBeDefined();
      expect(auditEntry.details).toBe(longDetails);
    });

    it('should handle special characters in all fields', async () => {
      const auditData = {
        userId: testUserId,
        username: 'test-user@domain.com',
        action: 'special-chars-test',
        details: 'User performed action with special chars: !@#$%^&*()[]{}|;:,.<>?'
      };

      await logAudit(auditData);
      
      const db = await getDb();
      const auditEntry = await db.get(
        'SELECT * FROM audit_log WHERE user_id = ? AND action = ?',
        [testUserId, 'special-chars-test']
      );

      expect(auditEntry).toBeDefined();
      expect(auditEntry.username).toBe('test-user@domain.com');
      expect(auditEntry.details).toBe('User performed action with special chars: !@#$%^&*()[]{}|;:,.<>?');
    });

    it('should maintain chronological order', async () => {
      const actions = ['first', 'second', 'third'];

      for (const action of actions) {
        await logAudit({
          userId: testUserId,
          username: 'testuser',
          action,
          details: `Action ${action}`
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const db = await getDb();
      const auditEntries = await db.all(
        'SELECT * FROM audit_log WHERE user_id = ? AND action IN (?, ?, ?) ORDER BY timestamp',
        [testUserId, 'first', 'second', 'third']
      );

      expect(auditEntries).toHaveLength(3);
      expect(auditEntries.map(e => e.action)).toEqual(['first', 'second', 'third']);
      
      // Verify timestamps are in ascending order
      for (let i = 1; i < auditEntries.length; i++) {
        const prevTime = new Date(auditEntries[i - 1].timestamp);
        const currentTime = new Date(auditEntries[i].timestamp);
        expect(currentTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
      }
    });
  });
});