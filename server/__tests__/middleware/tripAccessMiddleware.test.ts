import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tripAccessMiddleware } from '../../middleware/tripAccessMiddleware';
import { getDb } from '../../db';

vi.mock('../../db', () => ({
  getDb: vi.fn(),
}));

describe('tripAccessMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockDb: any;

  beforeEach(() => {
    mockReq = {
      params: {},
      user: undefined,
    } as any;

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
    mockDb = {
      get: vi.fn(),
    };

    (getDb as any).mockReturnValue(mockDb);
  });

  it('should return 400 when tripId is missing', async () => {
    mockReq.params = {};
    (mockReq as any).user = { familyId: 'family-123' };

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing tripId or familyId' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 400 when familyId is missing', async () => {
    mockReq.params = { tripId: 'trip-123' };
    (mockReq as any).user = undefined;

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing tripId or familyId' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 when trip is not found', async () => {
    mockReq.params = { tripId: 'trip-123' };
    (mockReq as any).user = { familyId: 'family-123' };
    mockDb.get.mockResolvedValue(null);

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Access denied: Trip not found or does not belong to your family',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should set req.trip and call next when trip exists and belongs to family', async () => {
    mockReq.params = { tripId: 'trip-123' };
    (mockReq as any).user = { familyId: 'family-123' };

    const tripData = {
      id: 'trip-123',
      family_id: 'family-123',
      name: 'Test Trip',
      description: 'A test trip',
    };

    mockDb.get.mockResolvedValue(tripData);

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.trip).toEqual(tripData);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 403 when trip belongs to a different family', async () => {
    mockReq.params = { tripId: 'trip-123' };
    (mockReq as any).user = { familyId: 'family-123' };
    mockDb.get.mockResolvedValue(null);

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockDb.get).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ? AND family_id = ?'),
      ['trip-123', 'family-123']
    );
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('should exclude deleted trips', async () => {
    mockReq.params = { tripId: 'trip-123' };
    (mockReq as any).user = { familyId: 'family-123' };
    mockDb.get.mockResolvedValue(null);

    await tripAccessMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockDb.get).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      ['trip-123', 'family-123']
    );
  });
});
