import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use jsdom so frontend component tests (testing-library) can render DOM.
    // Server-side tests still work under jsdom in this project; if any
    // node-specific test fails we can selectively configure per-suite.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'client/src/__tests__/GlobalListEditDrawer.test.tsx', // Targeted client regression coverage
      'client/src/__tests__/Dashboard.test.tsx', // Dashboard edit-list regression coverage
      'client/src/__tests__/TripsPage.test.tsx', // Trips page create action coverage
      'client/src/__tests__/TripDetailPage.test.tsx', // Trip detail add actions coverage
      'client/src/__tests__/TripParticipantsPanel.test.tsx', // Trip traveler management coverage
      'client/src/__tests__/BookingTransactionList.test.tsx', // Booking transaction ledger coverage
      'client/src/__tests__/FlightSeatGrid.test.tsx', // Per-leg seat assignment coverage
      'client/src/__tests__/BookingCard.test.tsx', // Booking creation/display coverage
      'client/src/__tests__/bookingSummary.test.ts', // Booking money line helper
      'client/src/__tests__/tripFormat.test.ts', // Money/leg formatting helpers
      'client/src/__tests__/FlightLegsEditor.test.tsx', // Multi-leg editor coverage
      'client/src/__tests__/tripDates.test.ts', // Trip date range formatting
      'client/src/__tests__/flightRows.test.ts', // Flight row model
      'client/src/__tests__/swipe.test.ts', // Swipe helpers
      'client/src/__tests__/FlightsSection.test.tsx', // Flights table/cards
      'client/src/__tests__/ElementDialog.test.tsx', // Dialog tabs and swipe
      'client/src/__tests__/tripApi.test.ts', // API error surfacing
      'client/src/__tests__/flightLegs.test.ts', // Leg draft model
      'client/src/__tests__/FlightLegForm.test.tsx', // Single-leg form
      'client/src/__tests__/FlightLegList.test.tsx', // Inline leg editing
      'client/src/__tests__/bookingCoverage.test.ts', // Booking coverage helpers
      'src/**/*.test.{ts,tsx}',           // Frontend unit tests
      'server/**/*.test.ts',              // Backend unit tests
      'tests/integration/**/*.test.ts',   // Integration tests
      'tests/e2e/**/*.test.ts'           // End-to-end tests
    ],
    exclude: ['node_modules', 'dist', 'build'],
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@server': '/server'
    }
  }
});