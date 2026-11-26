import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { LodgingRoomRepository, RoomConflictError, listRoomsForElement } from './lodgingRoomRepository';
import { TripElementRepository } from './tripElementRepository';
import { TripParticipantRepository } from './tripParticipantRepository';

describe('LodgingRoomRepository', () => {
  let repo: LodgingRoomRepository;
  let tripId: string;
  let stayId: string;
  let stay2Id: string;
  let a: string;
  let b: string;

  beforeEach(async () => {
    const db = await getDb();
    repo = new LodgingRoomRepository();
    const familyId = uuidv4();
    tripId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'F', datetime('now'), datetime('now'))`, [familyId]);
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'T', '2027-01-01', '2027-01-10', datetime('now'), datetime('now'))`, [tripId, familyId]);
    const elements = new TripElementRepository();
    const stay = { elementType: 'hotel' as const, name: 'Casa', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };
    stayId = (await elements.createElement(tripId, stay)).id;
    stay2Id = (await elements.createElement(tripId, { ...stay, name: 'Other' })).id;
    const participants = new TripParticipantRepository();
    a = (await participants.createParticipant(tripId, { displayName: 'Ann' })).id;
    b = (await participants.createParticipant(tripId, { displayName: 'Ben' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  it('creates rooms in position order with defaults', async () => {
    const r1 = await repo.createRoom(stayId, { roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['microwave'], travelerIds: [a] });
    const r2 = await repo.createRoom(stayId, {});
    expect(r1).toMatchObject({
      elementId: stayId, position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }],
      description: null, amenities: ['microwave'], otherAmenities: null, travelerIds: [a],
    });
    expect(r2).toMatchObject({ position: 1, roomType: null, beds: [], amenities: [], travelerIds: [] });
    expect((await listRoomsForElement(await getDb(), stayId)).map(r => r.id)).toEqual([r1.id, r2.id]);
  });

  it('updates a room partially and replaces travelers when given', async () => {
    const r = await repo.createRoom(stayId, { roomType: 'standard', description: 'Garden', travelerIds: [a] });
    const updated = await repo.updateRoom(r.id, { description: ' ', travelerIds: [a, b] });
    expect(updated).toMatchObject({ roomType: 'standard', description: null });
    expect(updated.travelerIds.sort()).toEqual([a, b].sort());
    const again = await repo.updateRoom(r.id, { roomType: 'suite' });
    expect(again.travelerIds.sort()).toEqual([a, b].sort());
  });

  it('keeps a traveler in at most one room per stay', async () => {
    await repo.createRoom(stayId, { travelerIds: [a] });
    await expect(repo.createRoom(stayId, { travelerIds: [a] })).rejects.toThrow(RoomConflictError);
    await expect(repo.createRoom(stayId, { travelerIds: [a] })).rejects.toThrow('Ann is already in another room of this stay');
    const r2 = await repo.createRoom(stayId, { travelerIds: [b] });
    await expect(repo.updateRoom(r2.id, { travelerIds: [a, b] })).rejects.toThrow(RoomConflictError);
    // same traveler in a different stay is fine
    await expect(repo.createRoom(stay2Id, { travelerIds: [a] })).resolves.toBeTruthy();
    // updating a room with its own traveler is fine
    await expect(repo.updateRoom(r2.id, { travelerIds: [b] })).resolves.toBeTruthy();
  });

  it('getRoom returns null when missing and deleteRoom removes travelers', async () => {
    expect(await repo.getRoom('nope')).toBeNull();
    const r = await repo.createRoom(stayId, { travelerIds: [a] });
    await repo.deleteRoom(r.id);
    expect(await repo.getRoom(r.id)).toBeNull();
    const db = await getDb();
    expect(await db.get('SELECT COUNT(*) n FROM lodging_room_travelers WHERE room_id = ?', [r.id])).toEqual({ n: 0 });
  });
});
