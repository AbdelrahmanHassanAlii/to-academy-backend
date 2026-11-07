# Phase 2.4 completion and verification

Date: 2026-11-08, Africa/Cairo. Scope: backend Lectures and Registrations only. Phase 2.4 remains local for owner review. No Public/Admin repository changes, Articles, Settings, Media, frontend, provider integration, payments or Docker.

## 1. Phase 2.3 publication

Verified clean main, expected origin URL and exactly seven approved commits ahead. Fetched remote and confirmed no divergence. Inspected commit history, changed paths/code, documentation and credential patterns; no sensitive additions. All seven messages passed strict Commitlint. Initial sandbox fetch failed; authorized host fetch succeeded. Initial host npm command dropped Commitlint options; reran the actual CLI with --from/--to and verified every message.

Pushed normally, without squash/amend/rebase/force: `3542d20..77f429f main -> main`. GitHub refs/heads/main was verified at **77f429fe2496e2d0d3c6b48e1649f0f31df8a91a**, exactly matching local HEAD after push. Rechecked at the end of Phase 2.4: remote remains at that Phase 2.3 commit. Phase 2.4 has not been pushed.

## 2. Lecture module and schema

`src/modules/lectures/` contains model, routes, controller, service, validators, utils, per-layer index.ts and module index.ts. Fields: localized title, slug, localized shortDescription/description, nullable course, scheduledAt, durationMinutes, nullable capacity/deadline/thumbnail/private meetingUrl, status, localized SEO, server-owned reservedSeats/first publishedAt, timestamps. Date input requires an explicit ISO offset/Z; storage UTC, responses ISO UTC Z, display timezone Africa/Cairo. Full [lecture contract](lectures.md).

## 3. Registration module and schema

`src/modules/registrations/` has the same six layers/barrels. Fields: immutable UUID reference, fullName, normalized E.164 phone, nullable email, targetType and exactly one matching course/lecture, Arabic targetName snapshot, status, server consent timestamp, private administrativeNotes, timestamps. Narrow Course/Category reference methods reuse existing services. Status transition tables are in [registration documentation](registrations.md); invalid transitions fail, repeated status updates are idempotent.

## 4. Endpoints

All paths include `/api/v1`:

| Access                                  | Method | Path                                    |
| --------------------------------------- | ------ | --------------------------------------- |
| Public                                  | GET    | /lectures                               |
| Public                                  | GET    | /lectures/:slug                         |
| Public trusted Origin, JSON, rate limit | POST   | /registrations                          |
| Admin session                           | GET    | /admin/lectures                         |
| Admin session                           | GET    | /admin/lectures/:id                     |
| Admin session + Origin/CSRF             | POST   | /admin/lectures                         |
| Admin session + Origin/CSRF             | PATCH  | /admin/lectures/:id                     |
| Admin session + Origin/CSRF             | DELETE | /admin/lectures/:id (soft cancellation) |
| Admin session                           | GET    | /admin/registrations                    |
| Admin session                           | GET    | /admin/registrations/:id                |
| Admin session + Origin/CSRF             | PATCH  | /admin/registrations/:id                |
| Admin session                           | GET    | /admin/registrations/export             |

Lists use projections, capped pagination, escaped search and stable sorting. Lecture filters include related course, upcoming/past, and admin status. Registration filters include type, target, status and name/phone search. Listings omit contact details, consent and administrative notes; protected detail includes them.

## 5. Capacity and concurrency

MongoDB replica set/Atlas transactions combine conditional atomic lecture counter reservation and registration insertion, using snapshot reads and majority commit. Every reservation/release increments the lecture version so optimistic admin capacity edits conflict safely. Pending/confirmed/attended consume seats; cancellation releases once; reactivation rechecks eligibility and reserves atomically. Failed/duplicate inserts roll back reservations. Capacity below reservedSeats is rejected; staff must explicitly cancel selected registrations first. Lecture cancellation retains registrations and stops future intake. [Transaction topology/setup](mongodb-replica-set.md) is mandatory; startup fails closed on standalone MongoDB.

## 6. Duplicate protection

Pinned libphonenumber-js/max 1.13.15 normalizes Egyptian national/international/00 and Arabic/Persian digit input to E.164, with strict valid-number parsing. Partial unique lecture+phone and course+phone indexes apply across all statuses, plus unique reference. Duplicate-key handling returns generic REGISTRATION_EXISTS 409 with no existing student data. Different targets remain allowed. Cancelled registrations are reactivated by administrators instead of inserted again.

## 7. Private meeting URL

Mongoose select:false plus public field allowlists exclude meetingUrl from public lists/details/search and all registration/CSV output. Admin lists and DELETE also omit it. Only authenticated detail/create/update responses include it. Confirmation never grants access. No reveal endpoint, Zoom API, automatic invitations or messaging; staff share details manually outside the site.

## 8. CSV

Authenticated filtered export: at most5000 projected rows (fetch5001 to detect overflow), otherwise EXPORT_TOO_LARGE 409 before any partial file. UTF-8 BOM for Arabic, CRLF records, every cell quoted, embedded quotes doubled, formula prefixes neutralized including whitespace/control/format characters and E.164 plus signs. Fixed filename, attachment, no-store. Export includes reference/name/phone/email/type/Arabic target-name snapshot/status/UTC creation date; no notes, meeting URLs, passwords/tokens/session data. Pagination is accepted for filter reuse but intentionally ignored by export.

## 9. Tests and actual verification results

Supported runtime explicitly selected: Node **24.22.1**, npm **11.19.1** (repo-local ignored npm CLI). Host defaults were older; no global runtime installation/PATH setting was changed. Installing the single new pinned dependency reported zero vulnerabilities.

| Command                            | Actual final result                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| npm test                           | PASS: 128 tests in10 files, no skipped tests                                                                    |
| npm run test:integration           | PASS: 68 tests in7 files, no skipped tests                                                                      |
| npm run typecheck                  | PASS                                                                                                            |
| npm run lint                       | PASS, zero warnings                                                                                             |
| npm run format:check               | PASS                                                                                                            |
| npm run build                      | PASS                                                                                                            |
| npm run api:check                  | PASS: OpenAPI0.5.0,24 paths,35 operations                                                                       |
| Git staged/range whitespace checks | PASS                                                                                                            |
| Husky/Commitlint                   | All local commit messages checked by existing commit-msg hook; final strict range check required before handoff |

Real MongoDB7 was run in an isolated single-member replica set toacademyTest on loopback27024, using ignored backend `.tools/mongo-phase24` data and dedicated to_academy_test. Existing27017 service/data/configuration and application `.env` were not modified. Workers, sockets and hooks required authorized host execution because sandbox workers could not start. Those initial failures were not counted as passes.

Concurrency tests: ten simultaneous different-phone requests for two seats admit exactly two; five same-phone attempts create one record and consume one seat. Concurrent capacity reduction/registration retains counter<=capacity. Failed insert after reservation rolls back the seat (real server-side validator failure). Simultaneous duplicate cancellations release once; simultaneous reactivations reserve once. Reactivation into full capacity fails without changing the cancelled record. All prior integration suites remain intact and green.

Additional coverage: lecture creation/edit/publication/completion/cancellation, content/date/deadline/duration/capacity/course validation, stable slugs, public filtering/pagination/search, URL privacy, lecture/course eligibility, normalization, database unique constraints, consent, bad targets, deadlines, past/cancelled/completed lectures, status transitions, auth/CSRF, session-free public submission, Origin/JSON/rate limiting, admin filters/notes/PII minimization, UTF-8 Arabic CSV, quoting/formulas and oversized-export rejection.

Independent review findings were reproduced and fixed: generated lecture slugs now pass the same validator as public detail routes; DELETE responses omit meetingUrl. Regression tests failed before fixes and passed afterward. Documentation review identified nullable OpenAPI objects incorrectly expressed using allOf; new lecture nullable objects now define type/properties directly. Swagger Parser validates the complete specification. Final OpenAPI HTTP tests were rerun (21 passing) after that correction.

## 10. OpenAPI and documentation

OpenAPI0.5.0 documents all12 new operations: request/response schemas, auth/Origin/CSRF, error codes, pagination/filter/sort, lifecycle, seat accounting, privacy, rate limiting, CSV and deployment topology. Public schemas have no meetingUrl property. README, API contract and database schema are updated; historical architecture/earlier reports remain preserved. New module and replica-set guides are linked above.

## 11. Local commits

1. 5230575 feat(lectures): add localized model and strict input validation
2. 6cb2a39 feat(lectures): enforce publication lifecycle and atomic seat operations
3. b5b5fb5 feat(lectures): add safe public and protected admin endpoints
4. 87fc536 feat(registrations): add normalized identities and unique target indexes
5. 8bec498 feat(registrations): transact seat reservations status changes and exports
6. 2b82c6b feat(registrations): wire public intake and protected admin management
7. 9f4e08e test(registrations): verify concurrency lifecycle privacy and arabic csv
8. c7cdba4 docs(api): specify lecture privacy and registration capacity contracts
9. df05db3 docs(backend): explain registration lifecycles csv and replica set setup
10. Final report/implementation-ledger commit: docs(backend): record phase 2.4 verification and review handoff (hash available in final git log).

## 12. Git handoff

Keep main and all ten Phase 2.4 commits locally. Expected final clean tracked tree, ahead10/behind0 of origin/main, with remote remaining77f429f. Final exact status/range/HEAD and strict Commitlint checks are performed after this report commit and reported in the chat. No Phase 2.4 push/merge/rebase/amend/force operation is authorized or performed.

## 13. Remaining limitations

Production must use initialized replica-set/Atlas topology; no operator database conversion performed. Course/category eligibility uses the transaction snapshot and can race concurrent administrative state changes; lecture capacity/lifecycle writes serialize on the lecture document. No phone-ownership proof; staff confirm manually. Thumbnail existence awaits Media. Search is bounded literal regex with binary Arabic title order; CSV capped5000 and IP rate limiter process-local. Production TLS/proxy/browser acceptance remains deployment work. These are documented boundaries, not skipped tests.

## 14. Next milestone

Recommend **Articles, Settings and Media**, after owner approval. Stop here; wait for Phase 2.4 review and explicit publishing/continuation authorization.
