# Registrations

Implemented in Phase 2.4. `src/modules/registrations/` contains model, validators, service, controller, routes and utils with layer/module `index.ts` exports. No payments, student accounts or automated notifications.

## Data contract

POST `/api/v1/registrations` accepts exactly fullName (2..200), required phone, optional valid email (max254), targetType=lecture/course, targetId ObjectId, and privacyConsent=true. Unknown fields, administrative notes/status, extra references, missing consent and invalid targets are rejected. Public creation requires application/json, an exact configured allowed Origin and the existing IP rate limiter (30 attempts/15 minutes). It runs before session middleware: no admin session/CSRF token required and no public session cookie created. The in-memory limit is for the existing single-instance deployment and must be shared before scaling horizontally.

Phone normalization uses pinned `libphonenumber-js/max`, Egyptian national default EG, strict parsing without extracting numbers from arbitrary text, valid full metadata, ASCII/Arabic/Persian digit conversion, and 00-to-plus international prefixes. Stored E.164 example: `01000000000`, `٠١٠٠٠٠٠٠٠٠٠`, `00201000000000` and `+20 100 000 0000` all become `+201000000000`. Other valid international numbers are supported. Extensions are rejected. Email is lowercased; absent email is null.

Stored fields: opaque UUID reference, fullName, phone, nullable email, targetType, exactly one lecture/course reference (other null), Arabic targetName snapshot, status, server-recorded immutable privacyConsentAt, private administrativeNotes, UTC createdAt/updatedAt. Phone/target/reference/consent are immutable. The snapshot preserves useful target context for exports after title edits, without repeated per-row target queries. It contains no meeting details. Models enforce the target invariant; services enforce existence/eligibility. All persisted dates use Mongo UTC and responses use ISO UTC `Z`; academy display timezone is Africa/Cairo.

Success is 201 with the standard envelope and only `{ reference, status: "pending" }` in data. This reference is a receipt, never a credential or a way to retrieve student/meeting details. Confirmation is manual; enrollment requests do not process payments or grant course ownership.

## Eligibility, uniqueness and capacity

Lecture: published, future schedule, deadline absent or strictly greater than now, and capacity available. Cancelled/completed/draft/past/full lectures reject registration with generic TARGET_INELIGIBLE 409; missing targets return 404. Course: published with an existing active category, irrespective of price. Capacity is only a lecture concept.

Two database partial unique indexes enforce `(lecture, phone)` for targetType lecture and `(course, phone)` for targetType course across **all** statuses. A third unique index protects reference. Preliminary duplicate checks improve the response; database index enforcement is authoritative. Duplicate-key errors map to REGISTRATION_EXISTS 409 without existing registrant data. Different targets are allowed. A cancelled record remains unique and must be reactivated by staff.

MongoDB transactions require an initialized **replica set or Atlas/sharded deployment**, not a standalone local mongod. Startup verifies topology and fails closed on standalone servers. See [replica-set setup](mongodb-replica-set.md). No unsafe nontransactional fallback exists.

For lecture creation, the transaction first checks duplicate identity, then conditionally increments lecture.reservedSeats using status/schedule/deadline/capacity predicates in the atomic update, then inserts the registration. Both writes commit with snapshot read concern and majority write concern. Failed inserts/duplicates abort the counter increment. Concurrent writers contend on the lecture document; the MongoDB driver retries transient transaction conflicts and reevaluates predicates. The counter also increments lecture.__v, so an administrator's stale optimistic update cannot lower capacity beneath a committed reservation. There is no count-then-insert capacity check.

Pending, confirmed and attended consume one seat. Transition to cancelled decrements exactly once in the same transaction as the status update; concurrent repeat cancellations are idempotent. Reactivation repeats eligibility/reservation and fails atomically if full, expired, past or no longer published. Repeated confirmations never reserve extra seats. Completed/attended records retain their historical seats. A lecture cancellation retains registrations/counters; staff may cancel registrations individually when appropriate. No deletion API removes registrations.

Course/category eligibility is read in the transaction snapshot. Unlike lecture capacity/lifecycle, administrative course/category edits are not serialized through the same reservation document. An in-flight course enrollment can commit based on the earlier published/active snapshot. This is the documented MVP concurrency boundary; there is no hard foreign-key enforcement against manual database deletion. Existing course archive/category deactivation preserve references. Do not mutate seat counters or registration statuses manually in the database.

## Status transitions

| Current   | Allowed next states                                 |
| --------- | --------------------------------------------------- |
| pending   | confirmed, cancelled                                |
| confirmed | cancelled, attended                                 |
| cancelled | pending, confirmed (eligibility/capacity rechecked) |
| attended  | terminal                                            |

Same state is idempotent, and notes may be edited without a transition. Attended is lecture-only after its start or explicit completion, never for a cancelled lecture or course request. Arbitrary/backward transitions return REGISTRATION_CONFLICT 409. Staff may confirm an existing pending historical/cancelled-lecture registration for recordkeeping; this does not reopen the lecture or grant meeting access. Only reactivation reserves a new seat and requires current eligibility.

## Administrator API and CSV

Authenticated active administrator session required for GET `/api/v1/admin/registrations`, GET `/:id`, GET `/export`; PATCH `/:id` additionally requires trusted Origin and CSRF. Export is registered before the id route. Admin responses are no-store. PATCH permits only status and administrativeNotes (max5000).

List/export filters: targetType, lecture ObjectId, course ObjectId, status, q (literal student name or phone, max100), sort=newest/default or oldest. Inconsistent target filters are rejected. Lists have page1/limit20/default and max100, stable createdAt/id sorting and standard pagination metadata. Listings include only id/reference/name/type/target/title snapshot/status/timestamps; phone, email, consent and notes require protected detail. Search accepts normalized full phone or literal partial text. Query strings, bodies, PII, raw errors and private URLs are not logged by the existing logger.

CSV includes reference, name, phone, email, registration type, targetName, status and UTC registration date. It respects every active data filter and sort. Accepted page/limit are intentionally ignored for download: all matching records up to **5000** are exported; more returns EXPORT_TOO_LARGE 409 before file headers/content. The query fetches at most5001 projected records, bounding memory and avoiding a count/export race. Narrow filters to export larger datasets in separate downloads.

The CSV uses UTF-8 BOM for Arabic spreadsheet applications, CRLF record delimiters, quoted fields and doubled embedded quotes. Formula-leading `=`, `+`, `-`, `@` including whitespace/control/format prefixes receive an apostrophe; leading tab/CR/LF are also neutralized. E.164 phone cells are text. Newlines/commas/quotes remain valid inside quoted fields. Export excludes administrative notes, meeting URLs, passwords, tokens and session information. Filename is fixed `registrations.csv`; Content-Type text/csv; charset=utf-8, attachment, no-store.

Indexes additionally cover status+createdAt+id, targetType+status+createdAt+id, lecture+status+createdAt+id, course+status+createdAt+id, and global createdAt+id. Full-text/linguistic search is outside the small-catalog MVP.
