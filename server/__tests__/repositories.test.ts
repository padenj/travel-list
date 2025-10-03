import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { UserRepository, FamilyRepository } from '../repositories';
import { getDb, closeDb } from '../db';
import { User, Family } from '../server-types';

describe('Repositories', () => {
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;

  beforeEach(async () => {
    // Initialize repositories
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    
    // Ensure fresh database for each test
    await getDb();
  });

  afterEach(async () => {
    // Clean up database connections
    await closeDb();
  });

  describe('FamilyRepository', () => {
    it('should create a family successfully', async () => {
      const familyData: Family = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const createdFamily = await familyRepo.create(familyData);
      
      expect(createdFamily.id).toBe(familyData.id);
      expect(createdFamily.name).toBe('Test Family');
      expect(createdFamily.created_at).toBe(familyData.created_at);
      expect(createdFamily.updated_at).toBe(familyData.updated_at);
      expect(createdFamily.deleted_at).toBeNull();
    });

    it('should find family by id', async () => {
      const familyData: Family = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(familyData);
      const foundFamily = await familyRepo.findById(familyData.id);
      
      expect(foundFamily).toBeDefined();
      expect(foundFamily!.name).toBe('Test Family');
    });

    it('should return undefined for non-existent family', async () => {
      const foundFamily = await familyRepo.findById('non-existent-id');
      expect(foundFamily).toBeUndefined();
    });

    it('should update family successfully', async () => {
      const familyData: Family = {
        id: uuidv4(),
        name: 'Original Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(familyData);
      const updatedFamily = await familyRepo.update(familyData.id, { name: 'Updated Family' });
      
      expect(updatedFamily).toBeDefined();
      expect(updatedFamily!.name).toBe('Updated Family');
    });

    it('should find all families', async () => {
      const family1: Family = {
        id: uuidv4(),
        name: 'Family 1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const family2: Family = {
        id: uuidv4(),
        name: 'Family 2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(family1);
      await familyRepo.create(family2);
      
      const families = await familyRepo.findAll();
      expect(families).toHaveLength(2);
      expect(families.map(f => f.name)).toEqual(expect.arrayContaining(['Family 1', 'Family 2']));
    });

    it('should soft delete family', async () => {
      const familyData: Family = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(familyData);
      await familyRepo.softDelete(familyData.id);
      
      const foundFamily = await familyRepo.findById(familyData.id);
      expect(foundFamily).toBeUndefined();
    });
  });

  describe('UserRepository', () => {
    let testFamilyId: string;

    beforeEach(async () => {
      // Create a test family for user tests
      const familyData: Family = {
        id: uuidv4(),
        name: 'Test Family',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await familyRepo.create(familyData);
      testFamilyId = familyData.id;
    });

    it('should create a user successfully', async () => {
      const userData = {
        id: uuidv4(),
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const createdUser = await userRepo.create(userData);
      
      expect(createdUser).toBeDefined();
      expect(createdUser.username).toBe('testuser');
      expect(createdUser.role).toBe('FamilyMember');
      expect(createdUser.familyId).toBe(testFamilyId);
    });

    it('should find user by username', async () => {
      const userData = {
        id: uuidv4(),
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData);
      const foundUser = await userRepo.findByUsername('testuser');
      
      expect(foundUser).toBeDefined();
      expect(foundUser!.username).toBe('testuser');
    });

    it('should return undefined for non-existent username', async () => {
      const foundUser = await userRepo.findByUsername('nonexistent');
      expect(foundUser).toBeUndefined();
    });

    it('should update user successfully', async () => {
      const userData = {
        id: uuidv4(),
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: true,
        email: 'test@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData);
      const updatedUser = await userRepo.update(userData.id, { 
        must_change_password: false,
        email: 'updated@example.com'
      });
      
      expect(updatedUser).toBeDefined();
      expect(updatedUser!.must_change_password).toBe(0); // SQLite stores booleans as integers
      expect(updatedUser!.email).toBe('updated@example.com');
    });

    it('should find all users', async () => {
      const user1 = {
        id: uuidv4(),
        username: 'user1',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'user1@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const user2 = {
        id: uuidv4(),
        username: 'user2',
        password: 'hashedpassword456',
        role: 'FamilyAdmin' as const,
        must_change_password: false,
        email: 'user2@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(user1);
      await userRepo.create(user2);
      
      const users = await userRepo.findAll();
      expect(users.length).toBeGreaterThanOrEqual(2);
      expect(users.map(u => u.username)).toEqual(expect.arrayContaining(['user1', 'user2']));
    });

    it('should soft delete user', async () => {
      const userData = {
        id: uuidv4(),
        username: 'testuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData);
      await userRepo.softDelete(userData.id);
      
      const foundUser = await userRepo.findById(userData.id);
      expect(foundUser).toBeUndefined();
    });

    it('should handle unique username constraint', async () => {
      const userData1 = {
        id: uuidv4(),
        username: 'uniqueuser',
        password: 'hashedpassword123',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test1@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const userData2 = {
        id: uuidv4(),
        username: 'uniqueuser', // Same username
        password: 'hashedpassword456',
        role: 'FamilyMember' as const,
        must_change_password: false,
        email: 'test2@example.com',
        familyId: testFamilyId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await userRepo.create(userData1);
      
      await expect(userRepo.create(userData2)).rejects.toThrow();
    });
  });
});