# Developer Quick Start Guide

## Setup & Installation

```bash
# Clone and setup
cd travel-list
npm install

# Start development
npm run dev
```

## Development URLs

- **Frontend (Local)**: http://localhost:3000
- **Frontend (Remote)**: https://code3000.padenco.com
- **Backend**: http://localhost:3001
- **API Proxy**: Frontend automatically proxies `/api/*` to backend

## Default Admin Access

- **Username**: `administrator`
- **Password**: `adminChangeMe1!` (must change on first login)

## Common Commands

### Development
```bash
npm run dev              # Start both frontend and backend
npm run dev:client       # Frontend only
npm run dev:server       # Backend only
PORT=3002 npm run dev:server  # Backend on different port
```

### Testing
```bash
npm test                 # Run all tests
npm test -- --watch     # Watch mode
npx vitest run server/__tests__/auth.test.ts  # Specific test
```

### Build & Deploy
```bash
npm run build           # Production build
npm run preview         # Preview production build
```

## Project Structure Quick Reference

```
├── src/                # React frontend
│   ├── __tests__/     # Frontend tests
│   ├── api.ts         # API client
│   └── components/    # React components
├── server/            # Express backend  
│   ├── __tests__/     # Backend tests
│   ├── index.ts       # Server entry
│   ├── auth.ts        # Authentication
│   ├── db.ts          # Database
│   └── routes.ts      # API routes
└── tests/             # Integration tests
    └── integration/   # Cross-cutting tests
```

## Key Features

### Authentication
- JWT tokens with 60-day expiration
- Bcrypt password hashing (12 rounds)
- Role-based access (SystemAdmin, FamilyAdmin, FamilyMember)

### Database  
- SQLite with foreign key constraints
- Soft deletes with `deleted_at` timestamps
- Comprehensive audit logging
- Auto-initialization on startup

### Testing
- Vitest with TypeScript support
- 69+ tests with ~95% pass rate
- Hybrid test organization following Vite best practices
- In-memory database for test isolation

## Environment Variables

```bash
JWT_SECRET=your-secret-here    # JWT signing secret
NODE_ENV=development           # Environment mode
PORT=3001                      # Backend port
VITE_API_BASE_URL=/api         # Frontend API base URL
```

## Database Schema

### Core Tables
- `users` - User accounts and authentication
- `families` - Family/group organization
- `audit_log` - Activity and security logging

### Key Features
- UUID primary keys
- Foreign key constraints
- Soft delete support
- Created/updated timestamps

## Troubleshooting

### Port Conflicts
```bash
PORT=3002 npm run dev:server
```

### Database Reset
```bash
rm travel-list.sqlite
npm run dev:server  # Will recreate schema
```

### Test Issues
```bash
npm install         # Ensure all dependencies
rm -rf node_modules && npm install  # Clean reinstall
```

## API Quick Reference

### Authentication
- `POST /api/login` - User login
- `POST /api/change-password` - Change password

### Users (Admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user  
- `DELETE /api/users/:id` - Delete user

### Families (Admin only)
- `GET /api/families` - List families
- `POST /api/families` - Create family
- `DELETE /api/families/:id` - Delete family

## Security Features

### Password Policy
- Minimum 8 characters
- At least 2 of the following character types:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Symbols (!@#$%^&*(),.?":{}|<>)
- Enforced client and server-side

### JWT Security
- Secure random secret generation
- Role-based authorization middleware
- Token expiration handling

## Best Practices

### Development
1. Use TypeScript for type safety
2. Write tests for new features
3. Follow the existing project structure
4. Use proper error handling

### Database
1. Always use soft deletes
2. Include audit logging for sensitive operations
3. Validate foreign key relationships
4. Use transactions for multi-table operations

### Testing
1. Write unit tests for individual functions
2. Use integration tests for API endpoints
3. Mock external dependencies
4. Test both success and error cases