import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Routes Integration Tests', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let testFamilyId: string;
  let adminToken: string;
  let userToken: string;
  let testUsername: string;
  let adminUsername: string;

  beforeEach(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    // Initialize database for tests
    const db = await getDb();
    
    // Create real repository instances
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();

    // Create a test family first to satisfy foreign key constraints
    testFamilyId = uuidv4();
    await familyRepo.create({
      id: testFamilyId,
      name: 'Test Family',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Create test user with unique username
    const testUserId = uuidv4();
    testUsername = `testuser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await userRepo.create({
      id: testUserId,
      username: testUsername,
      password: hashPasswordSync('TestPass1!'),
      role: USER_ROLES.FAMILY_MEMBER,
      must_change_password: false,
      email: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`,
      familyId: testFamilyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Create admin user with unique username
    const adminUserId = uuidv4();
    adminUsername = `testadmin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await userRepo.create({
      id: adminUserId,
      username: adminUsername,
      password: hashPasswordSync('AdminPass1!'),
      role: USER_ROLES.SYSTEM_ADMIN,
      must_change_password: false,
      email: `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}@example.com`,
      familyId: testFamilyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Generate tokens
    const createdUser = await userRepo.findByUsername(testUsername);
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdUser || !createdAdmin) throw new Error('Test users not created');
    
    userToken = generateToken(createdUser);
    adminToken = generateToken(createdAdmin);
  });

  afterEach(async () => {
    // Clean up database after each test - order matters due to foreign keys
    try {
      const db = await getDb();
      await db.run('DELETE FROM audit_log');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (error) {
      // Ignore cleanup errors - tables may not exist
      console.log('Cleanup error (ignoring):', error);
    }
    
    // Give a small delay to ensure all async operations complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await closeDb();
  });

  describe('POST /api/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: testUsername,
          password: 'TestPass1!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('role', USER_ROLES.FAMILY_MEMBER);
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/login')
        .send({
          username: testUsername,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/users', () => {
    it('should create user as system admin', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newuser123',
          password: 'SecurePass1!',
          role: USER_ROLES.FAMILY_MEMBER,
          email: 'new@example.com',
          familyId: testFamilyId
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'newuser123');
    });

    it('should reject weak passwords', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'weakpassuser',
          password: 'weak',
          role: USER_ROLES.FAMILY_MEMBER,
          email: 'weak@example.com',
          familyId: testFamilyId
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Password does not meet policy');
    });
  });

  describe('POST /api/families', () => {
    it('should create family successfully', async () => {
      const response = await request(app)
        .post('/api/families')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Test Family'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('family');
      expect(response.body.family).toHaveProperty('name', 'New Test Family');
      expect(response.body.family).toHaveProperty('id');
      expect(response.body.family).toHaveProperty('created_at');
      expect(response.body.family).toHaveProperty('updated_at');
      expect(response.body.family.deleted_at).toBeNull();
    });

    it('should reject empty family name', async () => {
      const response = await request(app)
        .post('/api/families')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: ''
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Family name is required');
    });
  });
});
