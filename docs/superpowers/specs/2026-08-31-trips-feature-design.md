# Trip Tracking Feature — Design Specification

**Session:** Initial scope definition  
**Date:** August 31, 2026  
**Status:** Approved  
**Scope:** Trip data model, API, and UI scaffolding with basic element CRUD

---

## Overview

Add a **Trips** feature to the travel-list app, allowing users to create and manage trips with associated booking elements (flights, hotels, car rentals, activities, etc.). Trips organize travel plans, link to existing packing lists, track multiple participants (family members + external guests), and support flexible pricing (cash and loyalty points). Future sessions will add expense tracking, trip scheduling, and research planning.

---

## Requirements

### Functional Requirements

1. **Trip Management**
   - Create, read, update, soft-delete trips
   - Each trip belongs to a family
   - Trip attributes: name, description, trip_type (free text, e.g., Beach/International/Business), start_date, end_date, status (planning|upcoming|active|completed)
   - Support multiple locations per trip
   - Bidirectional linking to packing lists (can link from trip or packing list side)

2. **Trip Participants**
   - Add family members from existing user roster
   - Add external guests by name (not in the family account)
   - Remove participants
   - No role/permission model for participants yet (future enhancement)

3. **Trip Elements (Bookings)**
   - Create, read, update, soft-delete elements within a trip
   - Element types: Flight, Hotel, Car Rental, Activity, Other
   - Reorderable within trip (sort_position)
   - Each element has:
     - Common fields: name, confirmation_number, booking_reference, booking_url, notes
     - Pricing: price_cash (USD default), price_points, loyalty_program, total_cash, total_points
     - File attachments (screenshots, itineraries, confirmations)
     - Multiple confirmation numbers (per-direction, per-leg, per-passenger, or any combination)

4. **Flight-Specific Features**
   - Multi-leg support (connecting flights in one booking)
   - Per-leg details: departure/arrival airports, times, airline, flight number, seat numbers
   - Per-leg pricing and loyalty points (may differ from element-level)
   - Per-leg confirmation numbers
   - Layover time tracking
   - Link to check-price URL for price drop monitoring

5. **Hotel-Specific Features**
   - Check-in / check-out dates, room type, booking source
   - Advertised price (for tracking price drops)
   - Points booking support

6. **Car Rental-Specific Features**
   - Rental company, car size
   - Pickup/dropoff locations and times
   - Prepaid + at-counter pricing variants

7. **Activity-Specific Features**
   - Venue name, activity date/time
   - Number of tickets, ticket type

8. **File Attachments**
   - Upload images, PDFs, screenshots
   - Store on server filesystem
   - Associate with specific elements
   - Support mobile file input and camera uploads (progressive enhancement)

9. **Smart Suggestions (Patterns)**
   - Recognize airline codes → suggest default loyalty program
   - Recognize hotel chains → suggest loyalty program
   - Recognize booking sources (Expedia, etc.) → suggest confirmation labels
   - Pattern-driven hints for confirmation number naming

### Non-Functional Requirements

- All trip routes secured by family access control
- Soft deletes for data audit trail
- Scalable confirmation model for future per-passenger expense tracking
- Schema designed for future loyalty program balance tracking
- Mobile-responsive UI (will use existing responsive patterns)

---

## Data Model

### Core Tables

#### `trips`
```
id (TEXT, PRIMARY KEY)
family_id (TEXT, FK → families)
name (TEXT)
description (TEXT, nullable)
trip_type (TEXT, free text)
start_date (TEXT, ISO date)
end_date (TEXT, ISO date)
status (TEXT: planning|upcoming|active|completed)
created_at (TEXT, ISO timestamp, default now)
updated_at (TEXT, ISO timestamp, default now)
deleted_at (TEXT, nullable)
```

#### `trip_locations`
```
id (TEXT, PRIMARY KEY)
trip_id (TEXT, FK → trips)
name (TEXT)
order_position (INTEGER)
created_at (TEXT, ISO timestamp)
```

#### `trip_participants`
```
id (TEXT, PRIMARY KEY)
trip_id (TEXT, FK → trips)
user_id (TEXT, FK → users, nullable)   -- null for external guests
display_name (TEXT)                     -- "Alex", "Mom", "Friend Name"
created_at (TEXT, ISO timestamp)
```

#### `trip_packing_lists` (junction table — bidirectional linking)
```
trip_id (TEXT, FK → trips)
packing_list_id (TEXT, FK → packing_lists)
created_at (TEXT, ISO timestamp)
PRIMARY KEY (trip_id, packing_list_id)
```

### Trip Elements (Hybrid Model)

#### `trip_elements` (base table for all element types)
```
id (TEXT, PRIMARY KEY)
trip_id (TEXT, FK → trips)
element_type (TEXT: flight|hotel|car_rental|activity|other)
name (TEXT)
booking_reference (TEXT, nullable)
booking_url (TEXT, nullable)
price_cash (DECIMAL, nullable)
price_points (INTEGER, nullable)
loyalty_program (TEXT, nullable)        -- e.g., "Southwest Rapid Rewards", "Marriott Bonvoy"
total_cash (DECIMAL, nullable)          -- aggregate for all passengers/nights
total_points (INTEGER, nullable)
notes (TEXT, nullable)
sort_position (INTEGER)
created_at (TEXT, ISO timestamp)
updated_at (TEXT, ISO timestamp)
deleted_at (TEXT, nullable)
```

#### `trip_element_confirmations` (flexible confirmation tracking)
```
id (TEXT, PRIMARY KEY)
element_id (TEXT, FK → trip_elements)
leg_id (TEXT, FK → flight_legs, nullable)           -- for flight legs
participant_id (TEXT, FK → trip_participants, nullable)
confirmation_number (TEXT)
label (TEXT, nullable)                  -- "Expedia Itinerary #", "Hilton Confirm #", "Outbound", "Leg 2", "Alex"
created_at (TEXT, ISO timestamp)
```

#### `trip_element_attachments` (files)
```
id (TEXT, PRIMARY KEY)
element_id (TEXT, FK → trip_elements)
filename (TEXT)                         -- system-generated, UUID-based
original_name (TEXT)                    -- user-provided filename
mime_type (TEXT)
file_path (TEXT)                        -- relative path under UPLOADS_DIR
file_size (INTEGER)
created_at (TEXT, ISO timestamp)
```

### Type-Specific Extension Tables

#### `flight_legs` (for multi-leg flights)
```
id (TEXT, PRIMARY KEY)
element_id (TEXT, FK → trip_elements)
leg_order (INTEGER)
departure_airport (TEXT)                -- e.g., "DEN"
departure_datetime (TEXT, ISO timestamp)
arrival_airport (TEXT)                  -- e.g., "SJD"
arrival_datetime (TEXT, ISO timestamp)
airline (TEXT, nullable)                -- e.g., "Southwest", "WN"
flight_number (TEXT, nullable)          -- e.g., "WN722"
seat_numbers (TEXT, nullable)           -- comma-separated or formatted, e.g., "22D,22E,22F"
price_cash (DECIMAL, nullable)          -- per-leg pricing if applicable
price_points (INTEGER, nullable)
loyalty_program (TEXT, nullable)
confirmation_number (TEXT, nullable)    -- overrides element-level if set
check_price_url (TEXT, nullable)        -- link to check for price changes
layover_minutes_after (INTEGER, nullable)
created_at (TEXT, ISO timestamp)
updated_at (TEXT, ISO timestamp)
```

#### `hotel_element_details` (one-to-one with type='hotel')
```
element_id (TEXT, PRIMARY KEY, FK → trip_elements)
address (TEXT, nullable)
check_in_date (TEXT, ISO date)
check_out_date (TEXT, ISO date)
room_type (TEXT, nullable)
booking_source (TEXT, nullable)
advertised_price_cash (DECIMAL, nullable)   -- for price-drop tracking
advertised_price_points (INTEGER, nullable)
advertised_loyalty_program (TEXT, nullable)
created_at (TEXT, ISO timestamp)
updated_at (TEXT, ISO timestamp)
```

#### `car_rental_element_details` (one-to-one with type='car_rental')
```
element_id (TEXT, PRIMARY KEY, FK → trip_elements)
rental_company (TEXT, nullable)
car_size (TEXT, nullable)               -- e.g., "Midsize", "Full Size", "SUV"
pickup_location (TEXT, nullable)
pickup_datetime (TEXT, ISO timestamp, nullable)
dropoff_location (TEXT, nullable)
dropoff_datetime (TEXT, ISO timestamp, nullable)
prepaid_price (DECIMAL, nullable)
at_counter_price (DECIMAL, nullable)
created_at (TEXT, ISO timestamp)
updated_at (TEXT, ISO timestamp)
```

#### `activity_element_details` (one-to-one with type='activity')
```
element_id (TEXT, PRIMARY KEY, FK → trip_elements)
venue_name (TEXT, nullable)
activity_date (TEXT, ISO date)
activity_time (TEXT, nullable)          -- e.g., "14:00", "2:00 PM"
num_tickets (INTEGER, nullable)
ticket_type (TEXT, nullable)
created_at (TEXT, ISO timestamp)
updated_at (TEXT, ISO timestamp)
```

### Schema Notes

- Confirmation numbers are intentionally flexible (`trip_element_confirmations`) to support:
  - Single booking confirmation (element-level only)
  - Per-direction flights (scoped to leg)
  - Per-passenger bookings (scoped to participant)
  - Booking service + provider numbers (use `label` field)
  - Multi-leg with mixed confirmation strategies
- Loyalty program field is text (not FK) to allow user-entered values. Future sessions can introduce a `loyalty_programs` table and link balances/points tracking without schema changes.
- Price fields allow null to accommodate bookings not yet priced or partial information.
- Soft deletes (`deleted_at`) maintain audit trail for all entities.

---

## API Routes

All routes use existing `authMiddleware` + new `tripAccessMiddleware` for family-scoped access control.

### Trip Management
```
GET    /api/trips                           List trips for authenticated user's family
POST   /api/trips                           Create trip
GET    /api/trips/:id                       Get trip detail with elements, participants, packing lists
PUT    /api/trips/:id                       Update trip
DELETE /api/trips/:id                       Soft delete trip
```

### Trip Locations
```
POST   /api/trips/:id/locations             Add location
DELETE /api/trips/:id/locations/:locId      Remove location
```

### Trip Participants
```
POST   /api/trips/:id/participants          Add participant (family member or external guest)
DELETE /api/trips/:id/participants/:pid     Remove participant
```

### Packing List Links (Bidirectional)
```
POST   /api/trips/:id/packing-lists/:listId      Link packing list to trip
DELETE /api/trips/:id/packing-lists/:listId      Unlink
GET    /api/packing-lists/:id/trip               Get linked trip (if any) — added to existing route
```

### Trip Elements
```
GET    /api/trips/:id/elements              List elements with type-specific details
POST   /api/trips/:id/elements              Create element + type-specific detail
GET    /api/trips/:id/elements/:eid         Get element detail (full type-specific data)
PUT    /api/trips/:id/elements/:eid         Update element + type-specific detail
DELETE /api/trips/:id/elements/:eid         Soft delete element
PATCH  /api/trips/:id/elements/reorder      Update sort_position for multiple elements (bulk)
```

### Confirmations
```
POST   /api/trips/:id/elements/:eid/confirmations       Add confirmation
PUT    /api/trips/:id/elements/:eid/confirmations/:cid  Update confirmation
DELETE /api/trips/:id/elements/:eid/confirmations/:cid  Remove confirmation
```

### Flight Legs
```
POST   /api/trips/:id/elements/:eid/legs       Add leg (for flights)
PUT    /api/trips/:id/elements/:eid/legs/:lid  Update leg
DELETE /api/trips/:id/elements/:eid/legs/:lid  Remove leg
```

### Attachments
```
POST   /api/trips/:id/elements/:eid/attachments        Upload file (multipart form)
DELETE /api/trips/:id/elements/:eid/attachments/:aid   Delete file
GET    /api/attachments/:aid/file                      Serve file (with auth check)
```

### API Response Patterns

All responses follow existing app conventions (JSON, error codes, token-based auth).

**Trip element response example** (GET /api/trips/trip123/elements):
```json
{
  "id": "elem456",
  "trip_id": "trip123",
  "element_type": "flight",
  "name": "DEN → SJD WN0722",
  "booking_reference": "ABC123",
  "booking_url": "https://...",
  "price_cash": 186.54,
  "price_points": 2000,
  "loyalty_program": "Southwest Rapid Rewards",
  "total_cash": 186.54,
  "total_points": 2000,
  "notes": "... notes ...",
  "sort_position": 1,
  "confirmations": [
    { "id": "c1", "confirmation_number": "C2M7S8", "label": "Southwest" }
  ],
  "attachments": [
    { "id": "a1", "original_name": "itinerary.pdf", "mime_type": "application/pdf", "file_size": 45000 }
  ],
  "flight_legs": [
    {
      "id": "leg1",
      "leg_order": 1,
      "departure_airport": "DEN",
      "departure_datetime": "2026-08-29T09:10:00Z",
      "arrival_airport": "SJD",
      "arrival_datetime": "2026-08-29T11:05:00Z",
      "airline": "Southwest",
      "flight_number": "WN0722",
      "seat_numbers": "22D,22E,22F",
      "price_cash": 186.54,
      "price_points": 2000,
      "loyalty_program": "Southwest Rapid Rewards",
      "check_price_url": "https://southwest.com/...",
      "layover_minutes_after": null
    }
  ]
}
```

---

## User Interface

### Navigation
- **Trips** added as top-level item in left rail navigation, alongside Dashboard, Packing Lists, Categories, Templates, Help

### Trips List Page (`/trips`)
- **Default view:** Compact list showing all trips for the family
  - Each row: trip name, trip type emoji, locations, element count, participant count, date range, status badge
  - Sortable / filterable by status or date
- **Toggle to card view:** Same information in card grid (title, locations, summary counts)
- **+ New Trip button:** Opens trip creation form/drawer

### Trip Detail Page (`/trips/:id`)
- **Header:** Trip name, dates, locations, status badge
- **Summary bar:** Participants count, linked packing lists, total booked cost
- **+ New Element button:** Opens element creation form
- **Elements grouped by type:**
  - ✈️ Flights
  - 🏨 Hotels
  - 🚗 Car Rentals
  - 🎪 Activities
  - 📋 Other
  - Each type collapsible/expandable
  - Each element shows: name, key details (date, time, confirmation), price
  - Click element to view/edit detail

### Element Detail / Edit View
- **Minimal initial forms:** Text inputs for common fields (name, pricing, notes, confirmations)
- **Type-specific fields:** Shown based on element_type
  - Flights: link icon for legs, Add Leg button, per-leg form (airports, times, airline, flight #, seats)
  - Hotels: check-in/out dates, room type, advertised price
  - Car rental: pickup/dropoff location/time, prepaid/counter pricing
  - Activity: venue, activity date/time, ticket count
- **Attachment section:** Upload button, list of attachments with delete
- **Pattern-driven suggestions:**
  - Loyalty program auto-populated based on airline code
  - Confirmation label suggestions (e.g., Expedia bookings suggest "Expedia Itinerary #" + provider)

### Design System Refresh
- Modernize design using **Catppuccin Mocha** color palette:
  - Background: `#1e1e2e` (dark)
  - Surface: `#313244` (slightly lighter)
  - Text: `#cdd6f4` (light)
  - Accent (primary): `#cba6f7` (lavender/purple)
  - Success: `#2a6e3e` (green, for prices/confirmations)
  - Warning: `#e8f4fd` (light blue, for planning status)
  - Info: `#f7b769` (amber, for flight status)
- Update component library (buttons, inputs, cards, badges) to use new palette
- Update existing pages (Dashboard, Packing Lists, etc.) for visual consistency
- Maintain accessibility (WCAG contrast ratios)
- Progressive enhancement: start with new Trip feature in new palette, backport to existing pages in subsequent sessions

---

## Implementation Roadmap (Future Sessions)

1. **Session 2 – Expense Tracking**
   - Add `trip_expenses` table
   - Link expenses to trip elements for partial payments
   - Expense categories (flights, lodging, food, etc.)
   - Summary dashboard comparing planned vs. actual costs

2. **Session 3 – Trip Schedule**
   - Add `trip_schedule` table for events/activities with times
   - Sync with element booking times
   - Calendar view of trip itinerary

3. **Session 4 – Research Planner**
   - Tracking options (flights, hotels, activities) before booking
   - Compare prices, times, reviews
   - Link research to booked elements

4. **Session 5 – Loyalty Program Tracking**
   - `loyalty_programs` table with balances
   - Tie to element bookings to track points used/available
   - Alerts for expiring points

5. **Session 6 – Mobile Photo Upload & Galleries**
   - Native camera integration for mobile
   - Photo gallery per element
   - OCR for receipt text extraction (stretch goal)

6. **Session 7 – UI Polish & Navigation Refresh**
   - Consolidate packing list settings
   - Finalize design system rollout

---

## Known Unknowns & Future Decisions

- **Passenger-specific expense splits:** Should expenses be trackable per participant for cost-sharing calculations? (Deferred to expense session)
- **Loyalty program balance auto-sync:** Should the app fetch real-time balances from loyalty programs? (Requires OAuth, deferred)
- **Trip sharing/collaboration:** Should trips be shareable with non-family members? (Deferred; requires permissions model)
- **Recurring trips:** Should the app support templating/recurring trips? (Deferred)

---

## Success Criteria

- ✅ All trip tables and type-specific extension tables created and migrated
- ✅ All CRUD API routes functional and tested
- ✅ Trip list page displays trips correctly
- ✅ Trip detail page shows elements grouped by type
- ✅ Element creation works for at least flights and hotels (basic forms)
- ✅ File attachment upload works
- ✅ Confirmation number entry supports flexible labels
- ✅ Flight legs can be added to flight elements
- ✅ Bidirectional trip-packing list linking works
- ✅ Pattern suggestions fire for loyalty programs and confirmation labels
- ✅ All routes respect family access control
- ✅ Design system palette applied to new trip feature
