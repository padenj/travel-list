# Travel List - Vite Application

A modern travel list application built with Vite, React, TypeScript, and Express.

## Architecture

- **Frontend**: Vite + React + TypeScript + Mantine UI
- **Backend**: Express + TypeScript + SQLite  
- **Testing**: Vitest with comprehensive test suite
- **Development**: Concurrent development servers with Vite proxy

## Quick Start

```bash
# Install dependencies
npm install

# Start development (runs both frontend and backend)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test
```

## Development

### Development Servers
- **Frontend**: `http://localhost:3000` (Vite dev server)
- **Frontend (Remote)**: `https://code3000.padenco.com` (VS Code remote passthrough)
- **Backend**: `http://localhost:3001` (Express API server)
- **Proxy**: Vite automatically proxies `/api/*` requests to the backend

### Running Individual Services
```bash
# Frontend only
npm run dev:client

# Backend only  
npm run dev:server

# Backend on different port
PORT=3002 npm run dev:server
```

## Project Structure

```
├── src/                    # Frontend React application
│   ├── __tests__/         # Frontend unit tests
│   ├── api.ts            # API client functions
│   ├── components/       # React components
│   └── ...
├── server/                # Backend Express API
│   ├── __tests__/        # Backend unit tests
│   ├── index.ts          # Server entry point
│   ├── auth.ts           # Authentication utilities
│   ├── db.ts             # Database connection
│   ├── models.ts         # Database models
│   ├── repositories.ts   # Data access layer
│   ├── routes.ts         # API routes
│   └── ...
├── tests/                 # Integration tests
│   ├── integration/      # Cross-cutting integration tests
│   └── e2e/             # End-to-end tests (future)
├── docs/                 # Documentation
├── public/               # Static assets
├── travel-list.sqlite    # SQLite database
└── vite.config.ts        # Vite configuration
```

## Testing

### Test Organization
Following Vite best practices with hybrid test organization:

- **`src/__tests__/`** - Frontend unit tests (co-located with components)
- **`server/__tests__/`** - Backend unit tests (co-located with server code)  
- **`tests/integration/`** - Integration tests spanning multiple components
- **`tests/e2e/`** - End-to-end tests (reserved for future use)

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test files
npx vitest run server/__tests__/auth.test.ts
npx vitest run src/__tests__/api-client.test.ts
npx vitest run tests/integration/core-functionality.test.ts

# Run tests by pattern
npx vitest run --grep "authentication"
```

### Test Coverage
Current test suite includes:
- ✅ **Authentication Tests** (10/10 passing) - Password validation, hashing, verification
- ✅ **Database Tests** (14/14 passing) - Schema, constraints, transactions
- ✅ **Repository Tests** (12/13 passing) - CRUD operations, data integrity
- ✅ **Integration Tests** (9/9 passing) - Cross-component functionality
- ✅ **API Client Tests** (2/2 passing) - Token management, API calls
- ✅ **Audit Tests** (8/8 passing) - Activity logging and tracking

See `TEST_REPORT.md` for detailed test documentation.

## Features

### Authentication & Security
- JWT token-based authentication
- Secure password hashing with bcrypt (12 rounds)
- Password policy enforcement (16+ chars, complexity requirements)
- Role-based access control (SystemAdmin, FamilyAdmin, FamilyMember)
- Comprehensive audit logging

### User Management
- User creation and management
- Family organization and member management
- Soft delete functionality for data preservation
- Real-time password validation

### Database
- SQLite with comprehensive schema
- Foreign key constraints and referential integrity
- Indexes for performance optimization
- Audit trail with timestamps
- Transaction support

### Frontend
- Responsive UI with Mantine components
- Real-time form validation
- Protected routes with authentication
- Token-based API communication

## API Endpoints

### Authentication
- `POST /api/login` - User authentication
- `POST /api/change-password` - Change user password

### User Management
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Soft delete user

### Family Management
- `GET /api/families` - Get all families
- `POST /api/families` - Create new family
- `PUT /api/families/:id` - Update family
- `DELETE /api/families/:id` - Soft delete family

## Environment Configuration

### Development
- `JWT_SECRET` - JWT signing secret (auto-generated if not set)
- `PORT` - Backend server port (default: 3001)
- `NODE_ENV` - Environment mode (development/production)
- `VITE_API_BASE_URL` - Frontend API base URL (default: '/api')

### Database
- SQLite database file: `travel-list.sqlite`
- Automatic schema initialization on startup
- Foreign key constraints enabled

## Security Features

### Password Policy
- Minimum 8 characters
- Must contain at least 2 of the following character types:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Symbols (!@#$%^&*, etc.)

### Default Admin Account
- Username: `administrator`
- Default Password: `adminChangeMe1!`
- **Must be changed on first login**

### JWT Configuration
- 60-day token expiration
- Secure secret generation in production
- Role-based authorization middleware

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change backend port with `PORT=3002 npm run dev:server`
2. **Database issues**: Delete `travel-list.sqlite` to reset database
3. **Authentication errors**: Check JWT_SECRET environment variable
4. **Test failures**: Ensure all dependencies installed with `npm install`

### Development Tips

1. **Hot reloading**: Both frontend and backend support live code changes
2. **API testing**: Use browser dev tools or tools like Postman
3. **Database inspection**: Use SQLite browser or CLI tools
4. **Logging**: Server logs authentication and error details

### Performance

- Vite provides fast development builds and HMR
- SQLite offers excellent performance for development and small deployments
- Express middleware optimized for development and production
- Comprehensive test suite ensures code quality and reliability

## Seeding & Example Templates

- Example templates, categories, and default items are created automatically when a new family is created through the `POST /api/families` endpoint. There is no separate CLI seed-runner.

- Files:
  - `server/seeds/example-templates.json` — JSON definition of categories, items, and templates used by the seeder logic.

- Notes:
  - Seeding is idempotent per family: if the target family already has templates the seeder will skip creating them.
  - The test suite runs the seeding logic against an in-memory DB to validate behavior (Vitest sets `process.env.VITEST`).
