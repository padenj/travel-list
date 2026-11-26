import { BedCount, LodgingRoom, RoomAmenity, RoomPayload, RoomType } from '../types/trip';

export interface RoomDraft {
  roomType: RoomType | null;
  beds: BedCount[];
  description: string;
  amenities: RoomAmenity[];
  otherAmenities: string;
  travelerIds: string[];
}

export function emptyRoomDraft(): RoomDraft {
  return { roomType: null, beds: [], description: '', amenities: [], otherAmenities: '', travelerIds: [] };
}

export function roomDraftFromRoom(room: LodgingRoom): RoomDraft {
  return {
    roomType: room.roomType ?? null, beds: room.beds ?? [], description: room.description ?? '',
    amenities: room.amenities ?? [], otherAmenities: room.otherAmenities ?? '', travelerIds: room.travelerIds ?? [],
  };
}

export function isRoomDraftDirty(initial: RoomDraft, current: RoomDraft, newTravelerName = ''): boolean {
  return Boolean(newTravelerName.trim()) || JSON.stringify(initial) !== JSON.stringify(current);
}

export function validateRoomDraft(draft: RoomDraft): string | null {
  const seen = new Set<string>();
  for (const bed of draft.beds) {
    if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
    if (seen.has(bed.type)) return 'Each bed type may appear once';
    seen.add(bed.type);
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

export function roomPayload(draft: RoomDraft): RoomPayload {
  return {
    roomType: draft.roomType,
    beds: draft.beds,
    description: blank(draft.description),
    amenities: draft.amenities,
    otherAmenities: blank(draft.otherAmenities),
    travelerIds: draft.travelerIds,
  };
}
