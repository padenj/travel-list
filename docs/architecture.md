# Technical Architecture

## Overview
This application is a Progressive Web App (PWA) for managing travel packing checklists, designed for families/groups. It uses a React + TypeScript frontend and a Node.js backend, deployed together in a Docker container.

## System Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18+ with TypeScript
- **PWA Features**: Service worker, manifest, offline caching
- **State Management**: React hooks and context
- **Storage**: LocalStorage/IndexedDB for offline data
- **Build System**: Create React App with TypeScript template
- **Development**: Hot reloading on localhost:3000

### Backend (Node.js + TypeScript)
- **Runtime**: Node.js with Express framework
- **Language**: TypeScript with ES modules
- **Authentication**: JWT tokens with bcrypt password hashing
- **Database**: SQLite (production-ready with future multi-DB support)
- **Architecture**: Repository pattern with database abstraction
- **Development**: Hot reloading on localhost:3001

### Development Environment
- **Monorepo**: Turborepo with npm workspaces
- **Frontend Dev Server**: localhost:3000 → https://code3000.padenco.com (public access)
- **Backend Dev Server**: localhost:3001
- **API Proxy**: Frontend `/api/*` requests proxy to backend automatically
- **Hot Reloading**: Both frontend and backend support live code changes

### Production Deployment
- **Container**: Single Docker container running both frontend and backend
- **Web Server**: Express serves both API and static React build
- **Database**: SQLite file with volume persistence
- **Environment**: Configurable via environment variables
- **Access**: Self-hosted, browser and mobile PWA installation

## Database Schema

### Core Tables
- **users**: Authentication and role management
- **families**: Family/group organization  
- **family_members**: Links users to families with member-specific data
- **categories**: Packing item categories (per family)
- **items**: Individual packing items (per family)
- **templates**: Saved packing list templates
- **packing_lists**: Active trip packing lists (name, creation date, family-scoped)
- **audit_log**: Security and change tracking

### Packing list specific notes
- packing lists reference master `items` by id (no copies) when items come from templates or master item lists. This ensures that updates to the master `items` (name, category assignments, member assignments) are reflected in any packing list that references them.
- `packing_list_items` rows should include:
  - reference to `item_id` (nullable for one-off items)
  - `display_name` (cached for one-offs only)
  - `added_during_packing` boolean
  - `not_needed` boolean
  - ordering and category snapshot (first category used for display)
  - per-user checked state stored in a related table `packing_list_item_checks` (packing_list_item_id, member_id, checked, checked_at)
- There is one `active_packing_list_id` stored on the `families` table. Changing the active list updates the dashboard for all family members.

### Relationship Tables
- **item_categories**: Many-to-many items ↔ categories
- **item_members**: Many-to-many items ↔ family members (assignments to specific members or whole family)
- **template_categories**: Template composition via categories
- **template_items**: Template composition via individual items
- **packing_list_items**: Packing list contents with check status (per-item checked state, added_during_packing flag)

### Technical Features
- **Primary Keys**: UUID strings for all entities
- **Soft Deletes**: `deleted_at` timestamp columns
- **Audit Trail**: Created/updated timestamps on all entities
- **Change Tracking**: For offline sync conflict resolution
- **Data Isolation**: All family data scoped by family_id

## API Architecture

### Authentication
- **Method**: JWT tokens with HTTP-only cookies (future) or localStorage
- **Session Duration**: 60 days with automatic refresh
- **Password Policy**: 16+ characters, mixed case, numbers, symbols
- **Default Admin**: `administrator` / `adminChangeMe1!` (must change on first login)

### Endpoints Structure
- **Authentication**: `/api/login`, `/api/logout`, `/api/change-password`
- **User Management**: `/api/users/*` (role-based access)
- **Family Management**: `/api/families/*`
- **Data Management**: `/api/categories/*`, `/api/items/*`, `/api/templates/*`, `/api/packing-lists/*`
- **Sync**: `/api/sync/*` (future - for offline sync)

### Packing list API suggestions (Milestone 5)
- GET `/api/families/:familyId/packing-lists` — list packing lists (filter, sort)
- POST `/api/families/:familyId/packing-lists` — create a new packing list (optional templateId to populate)
- GET `/api/packing-lists/:listId` — detailed packing list with items and per-member checked state
- POST `/api/packing-lists/:listId/populate-from-template` — populate an existing list with referenced items from a template
- POST `/api/packing-lists/:listId/items` — add items to a list (supports referencing existing item_id or one-off items)
- PATCH `/api/packing-list-items/:itemId` — update list item (toggle per-user checked, set not_needed, reassign)
- PATCH `/api/families/:familyId/active-packing-list` — set family active packing list

These endpoints should return appropriate nested structures so the frontend can render per-member columns (whole family items in a separate column, and items for each member), and support server-side filtering/sorting as required.

### Security Model
- **Role-Based Access Control**: SystemAdmin, FamilyAdmin, FamilyMember
- **Data Isolation**: Family-scoped data access only
- **Audit Logging**: All authentication and admin actions logged
- **Input Validation**: Server-side validation for all endpoints

## PWA Technical Requirements

### Service Worker
- **Caching Strategy**: Cache-first for static assets, network-first for API calls
- **Background Sync**: Queue API calls when offline, sync when online
- **Update Strategy**: Prompt user for app updates

### Offline Storage
- **Primary**: IndexedDB via Dexie.js or similar
- **Fallback**: LocalStorage for critical data
- **Sync Strategy**: Last-writer-wins with timestamp comparison

### Installation
- **Manifest**: Web app manifest for mobile installation
- **Icons**: Multiple sizes for different devices
- **Splash Screen**: Custom loading screen for installed app
