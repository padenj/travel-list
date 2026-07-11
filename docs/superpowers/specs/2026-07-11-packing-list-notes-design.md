# Packing List Notes Design

## Overview

Add a notes field to each packing list so trip-specific reminders (forgotten items, future considerations) can be captured and reused. Notes are tied to a packing list, not to users or families.

## Goals

- Store freeform notes directly on each packing list.
- Show/edit notes on the dashboard in a collapsible panel above list content.
- Support autosave with both debounce and blur-triggered save.
- Keep typing stable (no cursor jumps, no disruptive text resets), including on mobile.

## Non-Goals

- No separate notes endpoint.
- No notes in the family list-of-lists payload used for selector population.
- No per-user notes variants.

## Data Model

- Add nullable `notes TEXT` column to `packing_lists`.
- Keep default `NULL`; treat `NULL` and empty string as “no notes” in UI rendering.
- Preserve note text exactly as entered (including newlines).

## Backend/API Design

### Endpoints

- `GET /packing-lists/:id`
  - Include `notes` in returned `list` object.
- `PUT /packing-lists/:id`
  - Accept optional `notes` in request body and persist via existing packing list update flow.
  - Existing auth and family access checks remain unchanged.
- `GET /families/:familyId/packing-lists`
  - No `notes` field added (intentionally excluded for payload minimization).

### Validation and Persistence

- Accept any string payload for notes, including empty string.
- Do not trim or normalize whitespace/newlines.
- Store exactly the provided string.

## Frontend/UI Design

### Placement

- Dashboard page: add a “Trip Notes” collapsible panel above the lists section.
- Panel is bound to the currently selected/active packing list.

### Collapsed State

- Show first 3 lines of notes.
- If notes are empty, show helper prompt:
  - `Add reminders for future trips…`

### Expanded State

- Show multiline textarea for editing.
- Textarea is controlled by local draft state.

## Autosave and Typing Stability

- Debounced save while typing (target 500ms idle).
- Immediate save on blur.
- If blur occurs while debounce timer is pending, cancel debounce and flush one save.
- Never overwrite local textarea value from save responses while user is actively editing.
- Prevent stale response overwrite with monotonic request sequencing:
  - Each save gets an incrementing request id.
  - Only latest request can update save status/state.
- Do not remount textarea during edits (stable component identity) to preserve caret position and IME behavior on mobile.

## Error Handling and UX

- Save states: idle, saving, saved, error.
- Use existing notification pattern for errors.
- On save failure, retain local draft so user does not lose edits.
- Subsequent debounce/blur save attempts retry naturally.

## Testing Strategy

### Backend

- Migration test coverage for `notes` column addition path.
- Route-level coverage for:
  - `GET /packing-lists/:id` includes `notes`.
  - `PUT /packing-lists/:id` updates `notes`.

### Frontend

- Dashboard notes panel tests:
  - Collapsed preview renders first 3 lines.
  - Empty notes shows helper prompt.
  - Debounced save fires after idle interval.
  - Blur triggers immediate save.
  - Out-of-order save responses do not clobber newer draft.
  - Typing remains local-state driven without value resets on save completion.
  - Switching lists loads corresponding notes and draft state.

## Implementation Notes

- Reuse existing `updatePackingList` client API helper for writes.
- Reuse existing packing list fetch (`getPackingList`) for initial/load-on-switch data.
- Keep dashboard changes isolated; avoid changing unrelated list management flows.
