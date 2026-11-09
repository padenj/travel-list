import { tripApi } from '../api/tripApi';

// Server error codes from the destination and split routes, mapped to text people can act on.
export const DESTINATION_ERROR_TEXT: Record<string, string> = {
  unassigned_member: 'Everyone on the list needs a destination.',
  member_in_two_destinations: 'Someone is in two destinations.',
  list_already_destination: 'This list is already part of a trip.',
  list_in_other_trip: 'That list belongs to a trip with dates or bookings. Pick another list or start a new one.',
  list_not_found: "That list couldn't be found. It may have been deleted.",
  members_required: 'Choose at least one traveler.',
  'memberIds is required': 'Choose at least one traveler.',
  'memberIds must be a non-empty array': 'A destination needs at least one traveler.',
  invalid_members: 'Only family members can be travelers.',
  'name is required': 'Give the destination a name.',
  invalid_item_groups: 'One of the item groups no longer exists. Reopen this dialog and try again.',
  invalid_target_destination: "Shared items can't be moved there.",
  not_same_trip: "Shared items can't be moved there.",
  not_found: 'That destination no longer exists. Refresh and try again.',
  'Destination not found': 'That destination no longer exists. Refresh and try again.',
  would_empty_destination: 'That would leave another destination with no travelers.',
  last_destination: 'A trip needs at least one destination.',
  invalid_shared_items_to: 'Choose where the shared items go.',
};

/** Readable text for an error thrown by tripApi (409 bodies carry the code in `body.error`). */
export function destinationErrorText(err: unknown, fallback: string): string {
  const code = (err as any)?.body?.error ?? (err as Error)?.message;
  return (code && DESTINATION_ERROR_TEXT[code]) || fallback;
}

export interface MemberConflictInfo {
  destinationName: string;
  onlyMember: boolean;
}

/** Looks up the destination named in a 409 `member_in_other_destination` and whether the member is its only one. */
export async function describeMemberConflict(tripId: string, memberId: string, destinationId: string): Promise<MemberConflictInfo> {
  try {
    const found = (await tripApi.listDestinations(tripId)).find(d => d.id === destinationId);
    if (found) {
      return { destinationName: found.name, onlyMember: found.memberIds.filter(id => id !== memberId).length === 0 };
    }
  } catch {
    // Moving re-fetches the destination, so fall back to offering it.
  }
  return { destinationName: 'another destination', onlyMember: false };
}
