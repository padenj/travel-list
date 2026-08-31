import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { getDb, closeDb } from '../db';
import { tripRouter } from './tripRoutes';
import { JWT_SECRET } from '../auth';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { User } from '../server-types';

describe('Trip API Routes', () => {
  let app: Express;
  let db: any;
  let familyId: string;
  let userId: string;
  let tripId: string;
  let elementId: string;
  let authToken: string;

  function generateToken(uid: string, fid: string): string {
    const user: User = {
      id: uid,
      familyId: fid,
      name: 'Test User',
      username: 'testuser',
      role: 'FamilyMember',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return jwt.sign(user, JWT_SECRET);
  }

  beforeEach(async () => {
    db = await getDb();
    familyId = uuidv4();
    userId = uuidv4();
    tripId = uuidv4();
    elementId = uuidv4();

    authToken = generateToken(userId, familyId);

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      'INSERT INTO users (id, familyId, name, username, password_hash, role, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"), NULL)',
      [userId, familyId, 'Test User', 'testuser', 'hash', 'FamilyMember']
    );
    await db.run(
      'INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))',
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );

    app = express();
    app.use(express.json());
    app.use('/api/trips', tripRouter);
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('GET /api/trips', () => {
    it('should return all trips for authenticated user family', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .get('/api/trips')
        .set('Authorization', token)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].familyId).toBe(familyId);
    });
  });

  describe('POST /api/trips', () => {
    it('should create trip with required fields', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips')
        .set('Authorization', token)
        .send({
          name: 'New Trip',
          startDate: '2026-08-01',
          endDate: '2026-08-10',
        })
        .expect(201);

      expect(response.body.name).toBe('New Trip');
      expect(response.body.familyId).toBe(familyId);
    });

    it('should return 400 if required fields missing', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips')
        .set('Authorization', token)
        .send({ name: 'New Trip' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/trips/:tripId', () => {
    it('should return trip detail', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .get('/api/trips/' + tripId)
        .set('Authorization', token)
        .expect(200);

      expect(response.body.id).toBe(tripId);
      expect(response.body.familyId).toBe(familyId);
    });

    it('should return 403 for different family', async () => {
      const otherFamilyId = uuidv4();
      const otherUserId = uuidv4();
      const otherToken = 'Bearer ' + generateToken(otherUserId, otherFamilyId);
      
      await request(app)
        .get('/api/trips/' + tripId)
        .set('Authorization', otherToken)
        .expect(403);
    });
  });

  describe('PUT /api/trips/:tripId', () => {
    it('should update trip', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .put('/api/trips/' + tripId)
        .set('Authorization', token)
        .send({ name: 'Updated Trip' })
        .expect(200);

      expect(response.body.name).toBe('Updated Trip');
    });
  });

  describe('DELETE /api/trips/:tripId', () => {
    it('should soft-delete trip', async () => {
      const token = 'Bearer ' + authToken;
      await request(app)
        .delete('/api/trips/' + tripId)
        .set('Authorization', token)
        .expect(204);
    });
  });

  describe('GET /api/trips/:tripId/elements', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
    });

    it('should return all elements for trip', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .get('/api/trips/' + tripId + '/elements')
        .set('Authorization', token)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].tripId).toBe(tripId);
    });
  });

  describe('POST /api/trips/:tripId/elements', () => {
    it('should create element', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips/' + tripId + '/elements')
        .set('Authorization', token)
        .send({
          elementType: 'flight',
          name: 'Flight to LA',
        })
        .expect(201);

      expect(response.body.tripId).toBe(tripId);
      expect(response.body.elementType).toBe('flight');
      expect(response.body.name).toBe('Flight to LA');
    });

    it('should return 400 if required fields missing', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips/' + tripId + '/elements')
        .set('Authorization', token)
        .send({ elementType: 'flight' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/trips/:tripId/elements/:elementId', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
    });

    it('should return element detail', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .get('/api/trips/' + tripId + '/elements/' + elementId)
        .set('Authorization', token)
        .expect(200);

      expect(response.body.id).toBe(elementId);
      expect(response.body.tripId).toBe(tripId);
    });

    it('should return 404 when element does not exist', async () => {
      const token = 'Bearer ' + authToken;
      const fakeElementId = uuidv4();
      const response = await request(app)
        .get('/api/trips/' + tripId + '/elements/' + fakeElementId)
        .set('Authorization', token)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/trips/:tripId/elements/:elementId', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
    });

    it('should update element', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .put('/api/trips/' + tripId + '/elements/' + elementId)
        .set('Authorization', token)
        .send({ name: 'Updated Flight' })
        .expect(200);

      expect(response.body.name).toBe('Updated Flight');
    });
  });

  describe('DELETE /api/trips/:tripId/elements/:elementId', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
    });

    it('should delete element', async () => {
      const token = 'Bearer ' + authToken;
      await request(app)
        .delete('/api/trips/' + tripId + '/elements/' + elementId)
        .set('Authorization', token)
        .expect(204);
    });
  });

  describe('POST /api/trips/:tripId/elements/:elementId/confirmations', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
    });

    it('should add confirmation', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips/' + tripId + '/elements/' + elementId + '/confirmations')
        .set('Authorization', token)
        .send({ confirmationNumber: 'CONF123' })
        .expect(201);

      expect(response.body.confirmationNumber).toBe('CONF123');
      expect(response.body.elementId).toBe(elementId);
    });

    it('should return 400 if confirmation number missing', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .post('/api/trips/' + tripId + '/elements/' + elementId + '/confirmations')
        .set('Authorization', token)
        .send({ label: 'Test' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/trips/:tripId/elements/:elementId/confirmations', () => {
    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
      await db.run(
        'INSERT INTO trip_element_confirmations (id, element_id, confirmation_number, created_at) VALUES (?, ?, ?, datetime("now"))',
        [uuidv4(), elementId, 'CONF123']
      );
    });

    it('should return confirmations for element', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .get('/api/trips/' + tripId + '/elements/' + elementId + '/confirmations')
        .set('Authorization', token)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].confirmationNumber).toBe('CONF123');
    });
  });

  describe('PUT /api/trips/:tripId/elements/:elementId/confirmations/:confirmationId', () => {
    let confirmationId: string;

    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
      confirmationId = uuidv4();
      await db.run(
        'INSERT INTO trip_element_confirmations (id, element_id, confirmation_number, created_at) VALUES (?, ?, ?, datetime("now"))',
        [confirmationId, elementId, 'CONF123']
      );
    });

    it('should update confirmation', async () => {
      const token = 'Bearer ' + authToken;
      const response = await request(app)
        .put('/api/trips/' + tripId + '/elements/' + elementId + '/confirmations/' + confirmationId)
        .set('Authorization', token)
        .send({ confirmationNumber: 'UPDATED' })
        .expect(200);

      expect(response.body.confirmationNumber).toBe('UPDATED');
    });
  });

  describe('DELETE /api/trips/:tripId/elements/:elementId/confirmations/:confirmationId', () => {
    let confirmationId: string;

    beforeEach(async () => {
      await db.run(
        'INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))',
        [elementId, tripId, 'flight', 'Flight to LA']
      );
      confirmationId = uuidv4();
      await db.run(
        'INSERT INTO trip_element_confirmations (id, element_id, confirmation_number, created_at) VALUES (?, ?, ?, datetime("now"))',
        [confirmationId, elementId, 'CONF123']
      );
    });

    it('should delete confirmation', async () => {
      const token = 'Bearer ' + authToken;
      await request(app)
        .delete('/api/trips/' + tripId + '/elements/' + elementId + '/confirmations/' + confirmationId)
        .set('Authorization', token)
        .expect(204);
    });
  });
});
