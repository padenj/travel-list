import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validatePassword, hashPasswordSync, comparePasswordSync } from '../../server/auth';
import { getDb, closeDb } from '../../server/db';
import { UserRepository, FamilyRepository } from '../../server/repositories';
import { v4 as uuidv4 } from 'uuid';

describe('Core Functionality Tests', () => {
  beforeEach(async () => {
    await getDb(); // Initialize database
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('Authentication', () => {
    it('should validate passwords correctly', () => {
      expect(validatePassword('ValidP@ss1')).toBe(true); // All 4 types
      expect(validatePassword('Password1')).toBe(true); // 3 types
      expect(validatePassword('password1')).toBe(true); // 2 types
      expect(validatePassword('short')).toBe(false); // Too short
      expect(validatePassword('lowercase')).toBe(false); // Only 1 type
      expect(validatePassword('12345678')).toBe(false); // Only numbers
    });

    it('should hash and compare passwords', () => {
      const password = 'TestPassword123!';
      const hash = hashPasswordSync(password);
      
      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(comparePasswordSync(password, hash)).toBe(true);
      expect(comparePasswordSync('wrongpassword', hash)).toBe(false);
    });
  });

  describe('Database Operations', () => {
    it('should create and retrieve families', async () => {
      const familyRepo = new FamilyRepository();
      const familyData = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const createdFamily = await familyRepo.create(familyData);
      expect(createdFamily.name).toBe('Test Family');

      const foundFamily = await familyRepo.findById(familyData.id);
      expect(foundFamily?.name).toBe('Test Family');
    });

    it('should create and retrieve users', async () => {
      const familyRepo = new FamilyRepository();
      const userRepo = new UserRepository();

      // Create family first
      const familyData = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await familyRepo.create(familyData);

      // Create user
      const userData = {
        id: uuidv4(),
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test@example.com',
        familyId: familyData.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const createdUser = await userRepo.create(userData);
      expect(createdUser.username).toBe('testuser');

      const foundUser = await userRepo.findByUsername('testuser');
      expect(foundUser?.username).toBe('testuser');
    });

    it('should enforce database constraints', async () => {
      const db = await getDb();
      
      // Test role constraint
      await expect(
        db.run(
          "INSERT INTO users (id, username, password_hash, role, must_change_password, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ['test-id', 'testuser', 'hash', 'InvalidRole', 0, 'test@example.com', new Date().toISOString(), new Date().toISOString()]
        )
      ).rejects.toThrow();
    });

    it('should create proper database schema', async () => {
      const db = await getDb();
      
      // Check users table exists
      const usersTableInfo = await db.all("PRAGMA table_info(users)");
      const userColumns = usersTableInfo.map((col: any) => col.name);
      expect(userColumns).toContain('id');
      expect(userColumns).toContain('username');
      expect(userColumns).toContain('password_hash');
      expect(userColumns).toContain('role');
      
      // Check families table exists
      const familiesTableInfo = await db.all("PRAGMA table_info(families)");
      const familyColumns = familiesTableInfo.map((col: any) => col.name);
      expect(familyColumns).toContain('id');
      expect(familyColumns).toContain('name');
      
      // Check foreign keys are enabled
      const foreignKeysResult = await db.get('PRAGMA foreign_keys');
      expect(foreignKeysResult.foreign_keys).toBe(1);
    });
  });

  describe('Repository Operations', () => {
    it('should handle user CRUD operations', async () => {
      const familyRepo = new FamilyRepository();
      const userRepo = new UserRepository();

      // Create family
      const familyId = uuidv4();
      await familyRepo.create({
        id: familyId,
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Create user
      const userId = uuidv4();
      const userData = {
        id: userId,
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: true,
        email: 'test@example.com',
        familyId: familyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData);

      // Update user
      const updatedUser = await userRepo.update(userId, { 
        must_change_password: false 
      });
      expect(updatedUser?.must_change_password).toBe(0); // SQLite stores as integer

      // Soft delete user
      await userRepo.softDelete(userId);
      const deletedUser = await userRepo.findById(userId);
      expect(deletedUser).toBeUndefined();
    });

    it('should handle family CRUD operations', async () => {
      const familyRepo = new FamilyRepository();

      // Create family
      const familyId = uuidv4();
      const familyData = {
        id: familyId,
        name: 'Original Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(familyData);

      // Update family
      const updatedFamily = await familyRepo.update(familyId, { 
        name: 'Updated Family' 
      });
      expect(updatedFamily?.name).toBe('Updated Family');

      // List all families
      const families = await familyRepo.findAll();
      expect(families.length).toBeGreaterThanOrEqual(1);

      // Soft delete family
      await familyRepo.softDelete(familyId);
      const deletedFamily = await familyRepo.findById(familyId);
      expect(deletedFamily).toBeUndefined();
    });

    it('should enforce unique username constraint', async () => {
      const familyRepo = new FamilyRepository();
      const userRepo = new UserRepository();

      // Create family
      const familyId = uuidv4();
      await familyRepo.create({
        id: familyId,
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Create first user
      const userData1 = {
        id: uuidv4(),
        username: 'uniqueuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test1@example.com',
        familyId: familyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData1);

      // Try to create second user with same username
      const userData2 = {
        id: uuidv4(),
        username: 'uniqueuser',
        password: 'hashedpassword456',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test2@example.com',
        familyId: familyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await expect(userRepo.create(userData2)).rejects.toThrow();
    });
  });
});