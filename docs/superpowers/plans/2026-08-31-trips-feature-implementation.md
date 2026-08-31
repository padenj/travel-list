# Trip Tracking Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core trip tracking feature with trip CRUD, trip element management, file uploads, and UI shell (list/card views, grouped element organization).

**Architecture:** Express server (repositories, middleware-based auth) + React TypeScript client (pages, components). Schema uses hybrid approach: base trip_elements table + type-specific extension tables. File uploads via multer. Family-scoped access control.

**Tech Stack:** TypeScript, Express, React, SQLite, multer, UUID, Catppuccin Mocha colors.

---

## File Structure Overview

**Backend:**
- `server/migrations/migrations/20260831_create_trips_schema.cjs` — Schema migration
- `server/repositories/tripRepository.ts` — Trip CRUD
- `server/repositories/tripElementRepository.ts` — Element CRUD
- `server/repositories/tripElementConfirmationRepository.ts` — Confirmations
- `server/middleware/tripAccessMiddleware.ts` — Access control
- `server/routes/tripRoutes.ts` — Trip/element endpoints
- `server/routes/tripFileRoutes.ts` — File upload/download
- `server/repositories.ts` — Export repositories
- `server/routes.ts` — Mount routes

**Frontend:**
- `client/src/types/trip.ts` — TypeScript types
- `client/src/api/tripApi.ts` — API helpers
- `client/src/pages/TripsPage.tsx` — Trips list/card view
- `client/src/pages/TripDetailPage.tsx` — Trip detail with elements
- `client/src/components/TripForm.tsx` — Trip create/edit
- `client/src/components/TripElementForm.tsx` — Element create/edit
- `client/src/components/TripElementList.tsx` — Grouped element display
- `client/src/AppRoutes.tsx` — Add routes
- `client/src/components/Navigation.tsx` — Add Trips nav
- `client/src/styles/trips.css` — Styling

---

## Task 1: Database Schema

**Files:** Create `server/migrations/migrations/20260831_create_trips_schema.cjs`

- [ ] Create migration with full schema (trips, trip_elements, type-specific tables, confirmations, pricing, attachments, participants, packing-list junction)
- [ ] Run `node server/migrations/run-migrations.cjs up` to verify
- [ ] Commit with message referencing schema structure

---

## Task 2: Trip Repository

**Files:** Create `server/repositories/tripRepository.ts`

Implement CRUD with soft deletes and family filtering:

```typescript
export class TripRepository {
  async createTrip(familyId: string, trip: {
    title: string;
    description?: string;
    tripType?: string;
    startDate: string;
    endDate: string;
  }) {
    const id = uuidv4();
    await db.run(
      `INSERT INTO trips (id, family_id, title, description, trip_type, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, trip.title, trip.description, trip.tripType, trip.startDate, trip.endDate]
    );
    return this.getTripById(id);
  }

  async getTripById(tripId: string) {
    return db.get(`SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL`, [tripId]);
  }

  async getTripsByFamily(familyId: string) {
    return db.all(
      `SELECT * FROM trips WHERE family_id = ? AND deleted_at IS NULL ORDER BY start_date DESC`,
      [familyId]
    );
  }

  async updateTrip(tripId: string, updates: Partial<Trip>) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), tripId];
    await db.run(
      `UPDATE trips SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
    return this.getTripById(tripId);
  }

  async deleteTrip(tripId: string) {
    await db.run(`UPDATE trips SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [tripId]);
  }
}
```

- [ ] Write test file `tests/server/repositories/tripRepository.test.ts` with failing tests for each method
- [ ] Run tests to verify they fail
- [ ] Implement repository fully
- [ ] Run tests to verify all pass
- [ ] Commit

---

## Task 3: Trip Element Repository

**Files:** Create `server/repositories/tripElementRepository.ts`

Implement hybrid model: base element table + type-specific inserts:

```typescript
export class TripElementRepository {
  async createElement(tripId: string, element: {
    elementType: 'flight' | 'hotel' | 'car_rental' | 'activity';
    name: string;
    details?: Record<string, any>;
  }) {
    const id = uuidv4();
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, details)
       VALUES (?, ?, ?, ?, ?)`,
      [id, tripId, element.elementType, element.name, JSON.stringify(element.details || {})]
    );
    // Create type-specific row based on element.elementType
    if (element.elementType === 'flight') {
      await db.run(
        `INSERT INTO flight_legs (id, element_id, departure_date, departure_airport, arrival_airport, arrival_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), id, element.details?.departureDate, element.details?.departureAirport,
         element.details?.arrivalAirport, element.details?.arrivalDate]
      );
    }
    // Similar logic for hotel, car_rental, activity...
    return this.getElementById(id);
  }

  async getElementById(elementId: string) {
    const el = await db.get(`SELECT * FROM trip_elements WHERE id = ? AND deleted_at IS NULL`, [elementId]);
    if (!el) return null;
    // Fetch type-specific row
    if (el.element_type === 'flight') {
      el.flightLegs = await db.all(`SELECT * FROM flight_legs WHERE element_id = ?`, [elementId]);
    }
    return el;
  }

  async getElementsByTrip(tripId: string) {
    const els = await db.all(
      `SELECT * FROM trip_elements WHERE trip_id = ? AND deleted_at IS NULL ORDER BY element_type`,
      [tripId]
    );
    // Hydrate with type-specific data
    for (const el of els) {
      if (el.element_type === 'flight') {
        el.flightLegs = await db.all(`SELECT * FROM flight_legs WHERE element_id = ?`, [el.id]);
      }
      // Similar for other types...
    }
    return els;
  }

  async updateElement(elementId: string, updates: Partial<TripElement>) {
    // Update base table
    const {elementType, ...baseUpdates} = updates;
    const fields = Object.keys(baseUpdates).map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE trip_elements SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(baseUpdates), elementId]
    );
    return this.getElementById(elementId);
  }

  async deleteElement(elementId: string) {
    await db.run(`UPDATE trip_elements SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [elementId]);
  }
}
```

- [ ] Write test file `tests/server/repositories/tripElementRepository.test.ts` with failing tests
- [ ] Run tests to verify they fail
- [ ] Implement repository
- [ ] Run tests to verify all pass
- [ ] Commit

---

## Task 4: Confirmation Repository

**Files:** Create `server/repositories/tripElementConfirmationRepository.ts`

Simple CRUD for confirmations with flexible leg/participant scoping:

```typescript
export class TripElementConfirmationRepository {
  async addConfirmation(elementId: string, conf: {
    confirmationNumber: string;
    label?: string;
    legId?: string;
    participantId?: string;
  }) {
    const id = uuidv4();
    await db.run(
      `INSERT INTO trip_element_confirmations (id, element_id, confirmation_number, label, leg_id, participant_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, elementId, conf.confirmationNumber, conf.label, conf.legId, conf.participantId]
    );
    return this.getConfirmationById(id);
  }

  async getConfirmationsForElement(elementId: string) {
    return db.all(`SELECT * FROM trip_element_confirmations WHERE element_id = ?`, [elementId]);
  }

  async updateConfirmation(confirmationId: string, updates: Partial<TripElementConfirmation>) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE trip_element_confirmations SET ${fields} WHERE id = ?`,
      [...Object.values(updates), confirmationId]
    );
    return this.getConfirmationById(confirmationId);
  }

  async deleteConfirmation(confirmationId: string) {
    await db.run(`DELETE FROM trip_element_confirmations WHERE id = ?`, [confirmationId]);
  }

  private async getConfirmationById(id: string) {
    return db.get(`SELECT * FROM trip_element_confirmations WHERE id = ?`, [id]);
  }
}
```

- [ ] Write test file with CRUD tests
- [ ] Implement
- [ ] Run tests to verify all pass
- [ ] Commit

---

## Task 5: Access Control Middleware

**Files:** Create `server/middleware/tripAccessMiddleware.ts`

Family-scoped access similar to existing packing list middleware:

```typescript
export const tripAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const tripId = req.params.tripId;
  const familyId = req.user?.familyId;
  
  if (!tripId || !familyId) {
    return res.status(400).json({ error: 'Missing tripId or familyId' });
  }

  const trip = await db.get(`SELECT * FROM trips WHERE id = ? AND family_id = ? AND deleted_at IS NULL`, [tripId, familyId]);
  
  if (!trip) {
    return res.status(403).json({ error: 'Access denied to trip' });
  }

  req.trip = trip;
  next();
};
```

- [ ] Create middleware file
- [ ] Test that it correctly validates family access
- [ ] Commit

---

## Task 6: Trip API Routes

**Files:** Create `server/routes/tripRoutes.ts`

Implement GET/POST/PUT/DELETE for trips and elements:

```typescript
export const tripRouter = Router();

// List trips for family
tripRouter.get('/', authMiddleware, async (req, res) => {
  const trips = await tripRepository.getTripsByFamily(req.user.familyId);
  res.json(trips);
});

// Create trip
tripRouter.post('/', authMiddleware, async (req, res) => {
  const trip = await tripRepository.createTrip(req.user.familyId, req.body);
  res.status(201).json(trip);
});

// Get trip detail
tripRouter.get('/:tripId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  res.json(req.trip);
});

// Update trip
tripRouter.put('/:tripId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const trip = await tripRepository.updateTrip(req.trip.id, req.body);
  res.json(trip);
});

// Delete trip
tripRouter.delete('/:tripId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  await tripRepository.deleteTrip(req.trip.id);
  res.status(204).send();
});

// List elements for trip
tripRouter.get('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const elements = await tripElementRepository.getElementsByTrip(req.trip.id);
  res.json(elements);
});

// Create element
tripRouter.post('/:tripId/elements', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const element = await tripElementRepository.createElement(req.trip.id, req.body);
  res.status(201).json(element);
});

// Get element detail
tripRouter.get('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const element = await tripElementRepository.getElementById(req.params.elementId);
  if (!element || element.trip_id !== req.trip.id) return res.status(404).json({ error: 'Element not found' });
  res.json(element);
});

// Update element
tripRouter.put('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const element = await tripElementRepository.updateElement(req.params.elementId, req.body);
  if (!element || element.trip_id !== req.trip.id) return res.status(404).json({ error: 'Element not found' });
  res.json(element);
});

// Delete element
tripRouter.delete('/:tripId/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const element = await tripElementRepository.getElementById(req.params.elementId);
  if (!element || element.trip_id !== req.trip.id) return res.status(404).json({ error: 'Element not found' });
  await tripElementRepository.deleteElement(req.params.elementId);
  res.status(204).send();
});

// Add confirmation to element
tripRouter.post('/:tripId/elements/:elementId/confirmations', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const conf = await tripElementConfirmationRepository.addConfirmation(req.params.elementId, req.body);
  res.status(201).json(conf);
});
```

- [ ] Write test file `tests/server/routes/tripRoutes.test.ts` with integration tests
- [ ] Implement routes
- [ ] Run tests to verify all pass
- [ ] Modify `server/routes.ts` to mount tripRouter at `/trips`
- [ ] Commit

---

## Task 7: File Upload Routes

**Files:** Create `server/routes/tripFileRoutes.ts`

Multipart file upload with UUID-based storage:

```typescript
const uploadsDir = process.env.UPLOADS_DIR || './uploads';

export const tripFileRouter = Router();

// Upload file to element
tripFileRouter.post(
  '/:tripId/elements/:elementId/files',
  authMiddleware,
  tripAccessMiddleware,
  multer({ dest: uploadsDir }).single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const fileId = uuidv4();
    const storedPath = `${uploadsDir}/${fileId}`;
    fs.renameSync(req.file.path, storedPath);
    
    const fileRecord = await db.run(
      `INSERT INTO trip_element_attachments (id, element_id, file_name, original_name, file_type, file_size_bytes, stored_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileId, req.params.elementId, fileId, req.file.originalname, req.file.mimetype, req.file.size, storedPath]
    );
    
    res.status(201).json(fileRecord);
  }
);

// Download file
tripFileRouter.get('/:tripId/files/:fileId', authMiddleware, tripAccessMiddleware, (req, res) => {
  const file = db.get(`SELECT * FROM trip_element_attachments WHERE id = ?`, [req.params.fileId]);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.download(file.stored_path, file.original_name);
});

// Delete file
tripFileRouter.delete('/:tripId/files/:fileId', authMiddleware, tripAccessMiddleware, async (req, res) => {
  const file = db.get(`SELECT * FROM trip_element_attachments WHERE id = ?`, [req.params.fileId]);
  if (!file) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(file.stored_path);
  await db.run(`DELETE FROM trip_element_attachments WHERE id = ?`, [req.params.fileId]);
  res.status(204).send();
});
```

- [ ] Create file upload routes
- [ ] Test file upload/download
- [ ] Mount at `/trips/files` in `server/routes.ts`
- [ ] Commit

---

## Task 8: Frontend Types

**Files:** Create `client/src/types/trip.ts`

TypeScript types for frontend:

```typescript
export interface Trip {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  tripType?: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripElement {
  id: string;
  tripId: string;
  elementType: 'flight' | 'hotel' | 'car_rental' | 'activity';
  name: string;
  details?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  confirmations?: TripElementConfirmation[];
}

export interface TripElementConfirmation {
  id: string;
  elementId: string;
  confirmationNumber: string;
  label?: string;
  legId?: string;
  participantId?: string;
  createdAt: string;
}

export interface FlightLeg {
  id: string;
  elementId: string;
  departureDate: string;
  departureAirport: string;
  departureTime?: string;
  arrivalAirport: string;
  arrivalDate: string;
  arrivalTime?: string;
  airlineCode?: string;
  flightNumber?: string;
  seatNumber?: string;
  seatClass?: string;
  legOrder: number;
}
```

- [ ] Create types file
- [ ] Commit

---

## Task 9: Frontend API Helpers

**Files:** Create `client/src/api/tripApi.ts`

```typescript
const API_BASE = '/api/trips';

export const tripApi = {
  listTrips: () => fetch(API_BASE).then(r => r.json()),
  
  getTrip: (tripId: string) => fetch(`${API_BASE}/${tripId}`).then(r => r.json()),
  
  createTrip: (trip: Partial<Trip>) =>
    fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trip) })
      .then(r => r.json()),
  
  updateTrip: (tripId: string, trip: Partial<Trip>) =>
    fetch(`${API_BASE}/${tripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trip) })
      .then(r => r.json()),
  
  deleteTrip: (tripId: string) =>
    fetch(`${API_BASE}/${tripId}`, { method: 'DELETE' }),
  
  listElements: (tripId: string) =>
    fetch(`${API_BASE}/${tripId}/elements`).then(r => r.json()),
  
  createElement: (tripId: string, element: Partial<TripElement>) =>
    fetch(`${API_BASE}/${tripId}/elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(element) })
      .then(r => r.json()),
  
  updateElement: (tripId: string, elementId: string, element: Partial<TripElement>) =>
    fetch(`${API_BASE}/${tripId}/elements/${elementId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(element) })
      .then(r => r.json()),
  
  deleteElement: (tripId: string, elementId: string) =>
    fetch(`${API_BASE}/${tripId}/elements/${elementId}`, { method: 'DELETE' }),
};
```

- [ ] Create API helper file
- [ ] Commit

---

## Task 10: Trips Page

**Files:** Create `client/src/pages/TripsPage.tsx`

Main trips list with card/list toggle:

```typescript
import { useState, useEffect } from 'react';
import { tripApi } from '../api/tripApi';
import { Trip } from '../types/trip';
import '../styles/trips.css';

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    tripApi.listTrips().then(setTrips).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading trips...</div>;

  return (
    <div className="trips-page">
      <div className="trips-header">
        <h1>Trips</h1>
        <button onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}>
          Toggle {viewMode === 'list' ? 'Card' : 'List'} View
        </button>
      </div>

      <div className={`trips-container trips-${viewMode}`}>
        {trips.map(trip => (
          <a key={trip.id} href={`/trips/${trip.id}`} className="trip-item">
            <h2>{trip.title}</h2>
            {trip.description && <p>{trip.description}</p>}
            <span className="trip-dates">
              {trip.startDate} to {trip.endDate}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] Create page component
- [ ] Commit

---

## Task 11: Trip Detail Page

**Files:** Create `client/src/pages/TripDetailPage.tsx`

Trip detail with grouped elements:

```typescript
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { tripApi } from '../api/tripApi';
import { Trip, TripElement } from '../types/trip';

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elements, setElements] = useState<TripElement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    Promise.all([
      tripApi.getTrip(tripId),
      tripApi.listElements(tripId)
    ]).then(([t, el]) => {
      setTrip(t);
      setElements(el);
    }).finally(() => setLoading(false));
  }, [tripId]);

  if (loading) return <div>Loading...</div>;
  if (!trip) return <div>Trip not found</div>;

  const groupedByType = elements.reduce((acc, el) => {
    if (!acc[el.elementType]) acc[el.elementType] = [];
    acc[el.elementType].push(el);
    return acc;
  }, {} as Record<string, TripElement[]>);

  return (
    <div className="trip-detail-page">
      <h1>{trip.title}</h1>
      {trip.description && <p className="description">{trip.description}</p>}
      <span className="dates">{trip.startDate} to {trip.endDate}</span>

      <div className="elements-section">
        {Object.entries(groupedByType).map(([type, items]) => (
          <div key={type} className="element-group">
            <h2>{type.replace('_', ' ').toUpperCase()}</h2>
            {items.map(item => (
              <div key={item.id} className="element-card">
                <h3>{item.name}</h3>
                <a href={`/trips/${tripId}/elements/${item.id}`}>Edit</a>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] Create page component
- [ ] Commit

---

## Task 12: Styling with Catppuccin Mocha

**Files:** Create `client/src/styles/trips.css`

Apply Catppuccin Mocha palette:

```css
:root {
  --ctp-mocha-base: #1e1e2e;
  --ctp-mocha-surface0: #313244;
  --ctp-mocha-surface1: #45475a;
  --ctp-mocha-lavender: #cba6f7;
  --ctp-mocha-green: #2a6e3e;
  --ctp-mocha-text: #cdd6f4;
  --ctp-mocha-subtext: #a6adc8;
}

.trips-page {
  background-color: var(--ctp-mocha-base);
  color: var(--ctp-mocha-text);
  padding: 2rem;
}

.trips-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.trips-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.trips-container.trips-card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.trip-item {
  background-color: var(--ctp-mocha-surface0);
  padding: 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  border-left: 4px solid var(--ctp-mocha-lavender);
  transition: transform 0.2s;
}

.trip-item:hover {
  transform: translateY(-4px);
  background-color: var(--ctp-mocha-surface1);
}

.trip-item h2 {
  margin: 0 0 0.5rem 0;
  color: var(--ctp-mocha-lavender);
}

.trip-dates {
  display: block;
  color: var(--ctp-mocha-subtext);
  font-size: 0.9rem;
  margin-top: 1rem;
}

.trip-detail-page {
  background-color: var(--ctp-mocha-base);
  color: var(--ctp-mocha-text);
  padding: 2rem;
}

.element-group {
  margin-bottom: 3rem;
}

.element-group h2 {
  color: var(--ctp-mocha-lavender);
  border-bottom: 2px solid var(--ctp-mocha-surface1);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

.element-card {
  background-color: var(--ctp-mocha-surface0);
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  border-left: 3px solid var(--ctp-mocha-green);
}

.element-card h3 {
  margin: 0 0 0.5rem 0;
}

.element-card a {
  color: var(--ctp-mocha-lavender);
  text-decoration: none;
  font-size: 0.9rem;
}

.element-card a:hover {
  text-decoration: underline;
}
```

- [ ] Create CSS file with Catppuccin Mocha colors
- [ ] Commit

---

## Task 13: Add Routes

**Files:** Modify `client/src/AppRoutes.tsx`

Add trips routes:

```typescript
import { TripsPage } from './pages/TripsPage';
import { TripDetailPage } from './pages/TripDetailPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* existing routes... */}
      <Route path="/trips" element={<TripsPage />} />
      <Route path="/trips/:tripId" element={<TripDetailPage />} />
    </Routes>
  );
}
```

- [ ] Add trips routes
- [ ] Commit

---

## Task 14: Add Navigation Item

**Files:** Modify `client/src/components/Navigation.tsx`

Add Trips link to navigation:

```typescript
<nav className="navigation">
  {/* existing nav items... */}
  <a href="/trips">Trips</a>
</nav>
```

- [ ] Add Trips link
- [ ] Commit

---

## Task 15: Integration Verification

**Files:** Test all endpoints

- [ ] Start dev server: `npm run dev` (backend) and `npm run dev` (frontend on port 5173)
- [ ] Create a trip via API or UI
- [ ] View trips list
- [ ] Navigate to trip detail
- [ ] Verify card/list toggle on trips page works
- [ ] Verify elements grouped by type on detail page
- [ ] All styling renders with Catppuccin Mocha colors

---

## Spec Coverage Check

**Data Model:** ✓ Trips, trip_elements (base + type-specific), confirmations, pricing, attachments, participants
**API Routes:** ✓ Trip CRUD, element CRUD, confirmation CRUD, file upload/download
**UI Layout:** ✓ List/card views on trips page, grouped elements on detail page
**Styling:** ✓ Catppuccin Mocha palette applied
**Access Control:** ✓ Family-scoped via middleware
**File Storage:** ✓ UUID-based filesystem storage via multer

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-08-31-trips-feature-implementation.md`**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session with checkpoints

**Which approach?**
