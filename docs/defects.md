# Defects Log

This file tracks production defects reported by users, date reported, summary, and resolution notes.

- Date: 2025-10-16
  Summary: Documentation claimed a 16+ character password policy in multiple docs (`docs/architecture.md`, `docs/detailed-specifications.md`, `README.md`, `TEST_REPORT.md`) but the server implementation enforces a different policy.
  Details: The implementation in `server/auth.ts` defines `PASSWORD_POLICY.minLength = 8` and requires at least 2 of the 4 character classes (uppercase, lowercase, number, symbol). The frontend `client/src/PasswordChangePage.tsx` enforces the same minimum-8 and at-least-2-types rule. Tests and several docs incorrectly stated a minimum of 16 characters and stricter per-type requirements.
  Resolution: Documentation updated on 2025-10-16 to reflect the actual implemented policy. Files changed: `docs/architecture.md`, `docs/detailed-specifications.md`, `README.md`, `TEST_REPORT.md`.
  Notes: If the product owner wants to strengthen the policy to 16+ characters, a coordinated change is required: update `server/auth.ts` validation, adjust client-side validation in `PasswordChangePage.tsx`, update tests in `server/__tests__/auth.test.ts` and any test expectations, and schedule a migration/communication to users. This is deferred until the product decision is made.


- Date: <date>
  Summary: <short summary of defect>
  Details: <longer details>
  Resolution: <what was done>
  Notes: <follow-ups>
