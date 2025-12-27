<!--
Sync Impact Report
- Version change: template (no prior version) → 1.0.0
- Modified principles (template placeholders replaced):
	- PRINCIPLE_1_NAME (template) → I. Test-First (NON-NEGOTIABLE)
	- PRINCIPLE_2_NAME (template) → II. Clear Separation of Concerns & Modular Design
	- PRINCIPLE_3_NAME (template) → III. Observability & Fail-Safe Error Handling
	- PRINCIPLE_4_NAME (template) → IV. Simplicity and Minimal Surface Area
	- PRINCIPLE_5_NAME (template) → V. Offline Resilience & Data Integrity
- Added sections: Security & Privacy Requirements, Development Workflow & Quality Gates
- Templates updated:
	- .specify/templates/plan-template.md — ✅ updated (expanded Constitution Check)
	- .specify/templates/spec-template.md — ✅ updated (added Constitution alignment note)
	- .specify/templates/tasks-template.md — ✅ updated (Constitution alignment note)
- Templates requiring manual inspection:
	- .specify/templates/commands/* — ⚠ inspect for agent-specific names or outdated references
- Follow-up TODOs:
	- RATIFICATION_DATE: original ratification unknown; set to 2025-10-23 for first adoption.
	- Manual review: ensure CI checks and any automation reference `.specify/memory/constitution.md` and versioning policy.
-->

# Travel List Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)
All shipped behavior MUST be covered by automated tests that exercise the public
contract of the feature (unit + integration where applicable). Tests are written
before or with a failing regression (red) and must demonstrate the intended
behavior unambiguously. CI MUST run the full test-suite on every PR and block
merging on failures.

Rationale: The project maintains a fast, reliable test pyramid (unit →
integration → small E2E) to ensure regressions are caught early and design
remains refactorable. This protects users and enables iterative development.

### II. Clear Separation of Concerns & Modular Design
Code and UI MUST be organized so that business logic, data access, and
presentation are separable and independently testable. New features MUST favor
small, well-documented modules or services with explicit inputs/outputs and
minimal implicit coupling. Public APIs (server routes, shared utilities) MUST
have backwards-compatible contracts unless a breaking change is explicitly
governed by the Versioning policy below.

Rationale: Separation reduces blast radius for changes, enables focused tests,
and facilitates reuse between frontend and backend components.

### III. Observability & Fail-Safe Error Handling
The system MUST include structured logs, meaningful audit events, and clear
error surfaces. Server-side errors MUST be logged with sufficient context for
diagnosis (request id, user id, stack or class, and key inputs) and MUST avoid
leaking secrets in logs. Critical user-facing errors MUST map to documented
recovery or retry guidance in the docs.

Rationale: Observability enables fast debugging in both development and
production. Audit trails are required for security-sensitive operations (user
management, role changes, seeding, and sync operations).

### IV. Simplicity and Minimal Surface Area
Design choices MUST prefer the smallest, least-surprising API or UI that solves
the stated user problem. Features and abstractions MUST be justified by clear
value; speculative generalization is disallowed without documented need. When in
doubt, prefer explicitness over magic and document trade-offs.

Rationale: Keeping the system small and explicit reduces maintenance cost and
lowers the cognitive burden for contributors and reviewers.

### V. Offline Resilience & Data Integrity
Offline support and safe synchronization are first‑class concerns where they
apply. Client-side changes that are queued for sync MUST preserve intent and be
auditable. Conflict-resolution policies MUST be documented for each syncable
entity. Data integrity (no silent data loss) MUST be preserved during
migrations and sync operations.

Rationale: Travel List is used in intermittent connectivity environments; users
depend on predictable sync behavior and recoverable data flows.

## Security & Privacy Requirements

1. Secrets & configuration: Secrets MUST NOT be committed to source. Production
	 credentials MUST be stored in a secret manager and deployed via CI or
	 orchestration tooling (Portainer secrets, Vault, GitHub Actions secrets, etc.).
2. Authentication & authorization: The system MUST use strong password hashing
	 (bcrypt or better) and JWT tokens for session handling. Role-based access
	 controls already in place (SystemAdmin, FamilyAdmin, FamilyMember) MUST be
	 preserved and covered by unit/integration tests.
3. Data minimization & retention: Personal data collected MUST be limited to
	 what is required for functionality. Retention policies and restoration paths
	 MUST be documented where applicable.

Rationale: Security and privacy are minimal requirements for user trust and
regulatory compliance in many deployments.

## Development Workflow & Quality Gates

- PRs MUST include related issue/spec and a short summary of how the change
	aligns with the Constitution. Significant changes (DB migrations, public API
	changes, offline sync changes) MUST include a migration plan and tests.
- All PRs MUST pass automated tests and linting before merge. Reviewers MUST
	verify adherence to the Constitution; any conflict MUST be raised as a
	blocking review comment.
- Releases MUST be accompanied by changelogs that explicitly call out breaking
	changes and migration steps.

Rationale: Consistent workflows ensure quality and make governance tractable.

## Governance

1. Amendment process
	 - Proposals to change the Constitution MUST be made as a PR against this
		 repository that modifies `.specify/memory/constitution.md` and includes:
		 - A concise rationale for the change.
		 - An impact analysis (templates, plans, and commands that may need updates).
		 - A migration plan for any breaking changes.
	 - Approval: A constitutional change MUST be approved by at least two project
		 maintainers (one of whom MUST be a code owner or designated maintainer)
		 and merged with the migration plan completed or scheduled.

2. Versioning policy
	 - The Constitution uses semantic versioning MAJOR.MINOR.PATCH for governance
		 changes.
		 - MAJOR bump: Backward-incompatible principle removal or redefinition.
		 - MINOR bump: Addition of a principle or material expansion of guidance.
		 - PATCH bump: Wording, clarification, typo fixes, or non-semantic refinements.
	 - All PRs that change the Constitution MUST update the Version and
		 Last Amended date accordingly and include a brief bump rationale.

3. Compliance & review expectations
	 - Implementation plans (`.specify/templates/plan-template.md`) MUST include a
		 Constitution Check section which enumerates gates derived from this
		 document. Plans and feature specs MUST demonstrate how they satisfy those
		 gates before Phase 1 design is approved.
	 - PRs that introduce policy- or principle-violating changes are blocking
		 and MUST be remediated or the Constitution updated through the amendment
		 process.

**Version**: 1.0.0 | **Ratified**: 2025-10-23 | **Last Amended**: 2025-10-23

<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

```markdown
<!--
<!--
Sync Impact Report
- Version change: unknown (template) → 1.0.0
- Modified principles:
	- [PRINCIPLE_1_NAME] -> I. Test-First (NON-NEGOTIABLE)
	- [PRINCIPLE_2_NAME] -> II. Clear Separation of Concerns & Modular Design
	- [PRINCIPLE_3_NAME] -> III. Observability & Fail-Safe Error Handling
	- [PRINCIPLE_4_NAME] -> IV. Simplicity and Minimal Surface Area
	- [PRINCIPLE_5_NAME] -> V. Offline Resilience & Data Integrity
- Added sections: Security & Privacy Requirements, Development Workflow & Quality Gates
- Removed sections: placeholder-only sections replaced with concrete content
- Templates requiring updates:
	- .specify/templates/plan-template.md — ⚠ pending review (Constitution Check alignment)
	- .specify/templates/spec-template.md — ⚠ pending review (mandatory user-scenarios & testing language)
	- .specify/templates/tasks-template.md — ✅ updated (added Constitution alignment note)
	- .specify/templates/commands/* — ⚠ inspect for agent-specific names or outdated references
- Follow-up TODOs:
	- TODO(RATIFICATION_DATE): original ratification unknown; set to 2025-10-23 for first adoption.
	- Manual review: ensure CI checks reference the new Constitution path and versioning policy.
-->

# Travel List Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)
All shipped behavior MUST be covered by automated tests that exercise the public
contract of the feature (unit + integration where applicable). Tests are written
before or with a failing regression (red) and must demonstrate the intended
behavior unambiguously. CI MUST run the full test-suite on every PR and block
merging on failures.

Rationale: The project maintains a fast, reliable test pyramid (unit →
integration → small E2E) to ensure regressions are caught early and design
remains refactorable. This protects users and enables iterative development.

### II. Clear Separation of Concerns & Modular Design
Code and UI MUST be organized so that business logic, data access, and
presentation are separable and independently testable. New features MUST favor
small, well-documented modules or services with explicit inputs/outputs and
minimal implicit coupling. Public APIs (server routes, shared utilities) MUST
have backwards-compatible contracts unless a breaking change is explicitly
governed by the Versioning policy below.

Rationale: Separation reduces blast radius for changes, enables focused tests,
and facilitates reuse between frontend and backend components.

### III. Observability & Fail-Safe Error Handling
The system MUST include structured logs, meaningful audit events, and clear
error surfaces. Server-side errors MUST be logged with sufficient context for
diagnosis (request id, user id, stack or class, and key inputs) and MUST avoid
leaking secrets in logs. Critical user-facing errors MUST map to documented
recovery or retry guidance in the docs.

Rationale: Observability enables fast debugging in both development and
production. Audit trails are required for security-sensitive operations (user
management, role changes, seeding, and sync operations).

### IV. Simplicity and Minimal Surface Area
Design choices MUST prefer the smallest, least-surprising API or UI that solves
the stated user problem. Features and abstractions MUST be justified by clear
value; speculative generalization is disallowed without documented need. When in
doubt, prefer explicitness over magic and document trade-offs.

Rationale: Keeping the system small and explicit reduces maintenance cost and
lowers the cognitive burden for contributors and reviewers.

### V. Offline Resilience & Data Integrity
Offline support and safe synchronization are first‑class concerns where they
apply. Client-side changes that are queued for sync MUST preserve intent and be
auditable. Conflict-resolution policies MUST be documented for each syncable
entity. Data integrity (no silent data loss) MUST be preserved during
migrations and sync operations.

Rationale: Travel List is used in intermittent connectivity environments; users
depend on predictable sync behavior and recoverable data flows.

## Security & Privacy Requirements

1. Secrets & configuration: Secrets MUST NOT be committed to source. Production
	<!--
	Sync Impact Report
	- Version change: template (no prior version) → 1.0.0
	- Modified principles (template placeholders replaced):
		- PRINCIPLE_1_NAME (template) → I. Test-First (NON-NEGOTIABLE)
		- PRINCIPLE_2_NAME (template) → II. Clear Separation of Concerns & Modular Design
		- PRINCIPLE_3_NAME (template) → III. Observability & Fail-Safe Error Handling
		- PRINCIPLE_4_NAME (template) → IV. Simplicity and Minimal Surface Area
		- PRINCIPLE_5_NAME (template) → V. Offline Resilience & Data Integrity
	- Added sections: Security & Privacy Requirements, Development Workflow & Quality Gates
	- Templates updated:
		- .specify/templates/plan-template.md — ✅ updated (expanded Constitution Check)
		- .specify/templates/spec-template.md — ✅ updated (added Constitution alignment note)
		- .specify/templates/tasks-template.md — ✅ updated (Constitution alignment note)
	- Templates requiring manual inspection:
		- .specify/templates/commands/* — ⚠ inspect for agent-specific names or outdated references
	- Follow-up TODOs:
		- RATIFICATION_DATE: original ratification unknown; set to 2025-10-23 for first adoption.
		- Manual review: ensure CI checks and any automation reference `.specify/memory/constitution.md` and versioning policy.
	-->

	# Travel List Constitution

	## Core Principles

	### I. Test-First (NON-NEGOTIABLE)
	All shipped behavior MUST be covered by automated tests that exercise the public
	contract of the feature (unit + integration where applicable). Tests are written
	before or with a failing regression (red) and must demonstrate the intended
	behavior unambiguously. CI MUST run the full test-suite on every PR and block
	merging on failures.

	Rationale: The project maintains a fast, reliable test pyramid (unit →
	integration → small E2E) to ensure regressions are caught early and design
	remains refactorable. This protects users and enables iterative development.

	### II. Clear Separation of Concerns & Modular Design
	Code and UI MUST be organized so that business logic, data access, and
	presentation are separable and independently testable. New features MUST favor
	small, well-documented modules or services with explicit inputs/outputs and
	minimal implicit coupling. Public APIs (server routes, shared utilities) MUST
	have backwards-compatible contracts unless a breaking change is explicitly
	governed by the Versioning policy below.

	Rationale: Separation reduces blast radius for changes, enables focused tests,
	and facilitates reuse between frontend and backend components.

	### III. Observability & Fail-Safe Error Handling
	The system MUST include structured logs, meaningful audit events, and clear
	error surfaces. Server-side errors MUST be logged with sufficient context for
	diagnosis (request id, user id, stack or class, and key inputs) and MUST avoid
	leaking secrets in logs. Critical user-facing errors MUST map to documented
	recovery or retry guidance in the docs.

	Rationale: Observability enables fast debugging in both development and
	production. Audit trails are required for security-sensitive operations (user
	management, role changes, seeding, and sync operations).

	### IV. Simplicity and Minimal Surface Area
	Design choices MUST prefer the smallest, least-surprising API or UI that solves
	the stated user problem. Features and abstractions MUST be justified by clear
	value; speculative generalization is disallowed without documented need. When in
	doubt, prefer explicitness over magic and document trade-offs.

	Rationale: Keeping the system small and explicit reduces maintenance cost and
	lowers the cognitive burden for contributors and reviewers.

	### V. Offline Resilience & Data Integrity
	Offline support and safe synchronization are first‑class concerns where they
	apply. Client-side changes that are queued for sync MUST preserve intent and be
	auditable. Conflict-resolution policies MUST be documented for each syncable
	entity. Data integrity (no silent data loss) MUST be preserved during
	migrations and sync operations.

	Rationale: Travel List is used in intermittent connectivity environments; users
	depend on predictable sync behavior and recoverable data flows.

	## Security & Privacy Requirements

	1. Secrets & configuration: Secrets MUST NOT be committed to source. Production
		 credentials MUST be stored in a secret manager and deployed via CI or
		 orchestration tooling (Portainer secrets, Vault, GitHub Actions secrets, etc.).
	2. Authentication & authorization: The system MUST use strong password hashing
		 (bcrypt or better) and JWT tokens for session handling. Role-based access
		 controls already in place (SystemAdmin, FamilyAdmin, FamilyMember) MUST be
		 preserved and covered by unit/integration tests.
	3. Data minimization & retention: Personal data collected MUST be limited to
		 what is required for functionality. Retention policies and restoration paths
		 MUST be documented where applicable.

	Rationale: Security and privacy are minimal requirements for user trust and
	regulatory compliance in many deployments.

	## Development Workflow & Quality Gates

	- PRs MUST include related issue/spec and a short summary of how the change
		aligns with the Constitution. Significant changes (DB migrations, public API
		changes, offline sync changes) MUST include a migration plan and tests.
	- All PRs MUST pass automated tests and linting before merge. Reviewers MUST
		verify adherence to the Constitution; any conflict MUST be raised as a
		blocking review comment.
	- Releases MUST be accompanied by changelogs that explicitly call out breaking
		changes and migration steps.

	Rationale: Consistent workflows ensure quality and make governance tractable.

	## Governance

	1. Amendment process
		 - Proposals to change the Constitution MUST be made as a PR against this
			 repository that modifies `.specify/memory/constitution.md` and includes:
			 - A concise rationale for the change.
			 - An impact analysis (templates, plans, and commands that may need updates).
			 - A migration plan for any breaking changes.
		 - Approval: A constitutional change MUST be approved by at least two project
			 maintainers (one of whom MUST be a code owner or designated maintainer)
			 and merged with the migration plan completed or scheduled.

	2. Versioning policy
		 - The Constitution uses semantic versioning MAJOR.MINOR.PATCH for governance
			 changes.
			 - MAJOR bump: Backward-incompatible principle removal or redefinition.
			 - MINOR bump: Addition of a principle or material expansion of guidance.
			 - PATCH bump: Wording, clarification, typo fixes, or non-semantic refinements.
		 - All PRs that change the Constitution MUST update the Version and
			 Last Amended date accordingly and include a brief bump rationale.

	3. Compliance & review expectations
		 - Implementation plans (`.specify/templates/plan-template.md`) MUST include a
			 Constitution Check section which enumerates gates derived from this
			 document. Plans and feature specs MUST demonstrate how they satisfy those
			 gates before Phase 1 design is approved.
		 - PRs that introduce policy- or principle-violating changes are blocking
			 and MUST be remediated or the Constitution updated through the amendment
			 process.

	**Version**: 1.0.0 | **Ratified**: 2025-10-23 | **Last Amended**: 2025-10-23
