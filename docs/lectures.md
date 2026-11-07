# Lectures

Implemented in Phase 2.4. Module `src/modules/lectures/` contains model, validators, service, controller, routes and utils with layer barrels and a module `index.ts`. Uses the existing connection, authentication, authorization, CSRF, envelopes and pagination.

## Fields and dates

Localized `title: { ar, en? }` is required. Slug is explicit or generated with bounded suffix allocation, unique and permanently locked after first publication. Reserved `featured` is rejected consistently with the reused slug validator. `shortDescription` (600 characters) and full `description` (30000) use the same localized form; both Arabic values are required for publication. Drafts may omit descriptions. Optional `course` is an existing Course ObjectId, nullable. Thumbnail is a nullable syntax-checked reference until Media. SEO uses existing localized title/description fields.

`scheduledAt` is required, `durationMinutes` is an integer 1..1440; nullable capacity is an integer 1..100000 (null = unlimited), and nullable `registrationDeadline` cannot follow the scheduled time. The server owns reservedSeats, publishedAt and timestamps. Input dates must be real ISO 8601 dates with `Z` or an explicit offset. MongoDB stores UTC instants; every response date is ISO UTC ending in `Z`. Example: `2030-06-01T18:00:00+03:00` becomes `2030-06-01T15:00:00.000Z`. Future clients must format with `Intl.DateTimeFormat(..., { timeZone: 'Africa/Cairo' })`; never hardcode Cairo's UTC offset because DST applies.

## Lifecycle

| Current   | Allowed next states         |
| --------- | --------------------------- |
| draft     | published, cancelled        |
| published | draft, completed, cancelled |
| completed | terminal                    |
| cancelled | terminal                    |

Repeating the current state is idempotent. Create accepts draft/default or published; publishing/republication requires complete descriptions and a future schedule. Existing past published lectures can remain publicly visible. Explicit completion may be recorded by the administrator. Completed/cancelled/draft lectures never appear publicly. Lectures with reserved seats cannot be unpublished to draft; cancel instead. DELETE always soft cancels and retains the lecture and registrations, including drafts without registrations. A completed lecture is retained and cannot be cancelled.

Changing capacity below reservedSeats is rejected, including pending reservations. To lower it further, the administrator must explicitly cancel selected registrations first. Lecture edits use optimistic concurrency and reservations/releases increment the same version; simultaneous capacity changes and registrations either serialize safely or return a 409 asking the administrator to reload. Cancellation of a lecture stops new registrations but does not automatically cancel its existing registrations.

## API and privacy

All paths below include `/api/v1`:

| Access                                | Endpoints                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Public                                | GET `/lectures`, GET `/lectures/:slug`                                            |
| Admin session                         | GET `/admin/lectures`, GET `/admin/lectures/:id`                                  |
| Admin session + trusted Origin + CSRF | POST `/admin/lectures`, PATCH `/admin/lectures/:id`, DELETE `/admin/lectures/:id` |

Public list defaults page=1/limit=12; admin limit=20; max 100. Filters: q (literal Arabic/English title, max 100), course ObjectId, period=upcoming/past; admin also status. Upcoming means scheduledAt > now, past means <= now. Sort: schedule ascending/default, latest schedule descending, newest/oldest creation date, title Arabic binary order; stable id tie-break. Lists return standard pagination metadata. Public cards omit full description/SEO/timestamps; public detail includes them. No session is created by public reads.

The nullable HTTPS `meetingUrl` is excluded at the Mongoose field-selection level and by explicit public DTO allowlists. Only authenticated admin detail/create/update responses include it. Admin lists and DELETE omit it. It is never included in public lists, detail, search, registration receipts or CSV. Public OpenAPI DTOs contain no such property. A registration (even confirmed) grants no URL access. Staff manually share details outside the site; no Zoom API, invitations, messaging or email exists. Admin responses are no-store under the existing session middleware.

Indexes: unique slug; status+scheduledAt+id; course+status+scheduledAt+id; createdAt+id. Literal regex search is escaped and bounded, suitable for the small catalog, without a full-text index or linguistic collation.
