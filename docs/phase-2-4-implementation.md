# Phase 2.4 implementation plan

Owner authorization: publish the seven approved Phase 2.3 commits, implement Lectures and Registrations, keep Phase 2.4 local, stop for review. Specification: `phase-2-4-plan.md` plus the owner's detailed Phase 2.4 requirements.

## Decisions

Reuse Express/Mongoose/Zod, localized Courses fields, session authorization, CSRF, safe error envelopes and pagination. All persisted dates are UTC; input requires ISO 8601 with explicit offset; output is ISO UTC with `Z`. Clients display Africa/Cairo using IANA timezone rules. Lectures use durationMinutes, optional capacity/deadline, and explicit public DTOs. Only admin detail/create/update responses contain meetingUrl; admin lists exclude it too.

Use transactions on replica sets/Atlas, with a conditional lecture seat counter update and registration insert in one transaction. This ensures rollback on duplicates/failure and serializes capacity edits with reservations. Pending, confirmed and attended consume seats; cancellation releases one; reactivation rechecks eligibility/capacity. Cancelled phone/target pairs remain unique. Standalone MongoDB fails closed for registration writes; startup checks topology. Course/category eligibility is checked in the transaction snapshot; administrative course/category changes can race across that snapshot boundary, documented as an MVP limitation.

## Tasks and verification

- [x] Lecture model/validators/utils: unit tests for dates, localization, durations, deadlines, capacity, publication; unique slug and status/schedule/course indexes.
- [x] Lecture service/HTTP: create/update with optimistic concurrency, stable published slug, guarded lifecycle and capacity edits; safe public projections, search/filter/sort/pagination; admin auth/CSRF; always soft cancel DELETE. Related course existence through a narrow CourseService method.
- [x] Registrations model/validators/utils: exact target invariant, phone parser with Egyptian default/E.164, optional email, immutable consent; partial compound unique target/phone indexes; documented status transitions; safe BOM/CSV encoding.
- [x] Transactional registration service: real MongoDB tests for parallel reservations, duplicate races, rollback, cancellation/reactivation and capacity reductions. Admin DTOs minimize list PII, filtered capped export, notes/status validation.
- [x] Routes/wiring: public JSON + exact trusted Origin + rate limiting before session middleware; admin session/CSRF reuse. Startup initializes indexes and verifies transaction topology.
- [x] Documentation/OpenAPI: schemas and every implemented endpoint, CSV security, lifecycle, UTC/Cairo, replica-set setup, concurrency boundary.
- [x] Verification: npm test, typecheck, lint, format:check, build, api:check, real MongoDB replica-set integration suite; inspect changes and commit logical units through Husky/Commitlint. No Phase 2.4 push.

Review focus: reactivation over capacity; duplicate rollback; concurrent capacity reduction; private URL in any public representation; CSV formulas with whitespace/control prefixes. Tests cover these before completion.
