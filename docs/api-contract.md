# API contract plan — v1

Phase 0 design, updated through Phase 2.4 on 2026-11-08. Foundation, auth, Categories, Courses, Lectures and Registrations are implemented; other modules remain planned. This document is the implementation plan; `docs/openapi.yaml` will become the authoritative machine-readable contract as endpoints are implemented in Phases 1-2. Do not generate frontend types from invented or incomplete behavior. See [architecture](phase-0-architecture.md) for security, relationships, lifecycle and environment decisions.

## Conventions

Base: `/api/v1`. JSON requests/responses except multipart image uploads, streamed media, CSV exports, and the OpenAPI/Swagger documents. Admin operations use `/admin/...`; authentication uses `/auth/...`. Every admin endpoint requires an active administrator session. Every session-affecting/admin write also requires CSRF and trusted Origin checks. Public registration does not require an admin session or CSRF token.

Success responses always include `success`, `message`, `data`, and `meta`:

```json
{"success":true,"message":"Courses retrieved successfully","data":[],"meta":{"page":1,"limit":12,"total":0,"totalPages":0}}
```

Singular operations use `meta:null`. Creates return 201; reads/patches/deletes/logout return 200 so the envelope remains consistent. Deleted entity responses use `data:null`. Raw downloads are explicitly documented exceptions. Messages are human-readable; clients branch on HTTP status and stable error codes, not message text. Frontends provide Arabic UI copy locally.

```json
{"success":false,"message":"Validation failed","code":"VALIDATION_ERROR","errors":[{"path":"phone","message":"Invalid phone number","code":"INVALID_PHONE"}]}
```

All errors include an `errors` array (empty for non-field errors). Statuses: 400 invalid JSON/validation/query/id, 401 missing/expired session or invalid login, 403 invalid CSRF/origin or disallowed action, 404 absent/inaccessible resource, 409 duplicate/in-use/lifecycle conflict, 413 upload/body too large, 415 unsupported media, 429 rate limit (Retry-After), 500 unexpected error, 503 database unavailable. Error responses never include Mongo errors, stack traces, secrets, existing registrant PII or session ids. Login failure always uses the same public response.

List query defaults: `page=1`, `limit=12` publicly and `limit=20` for admin; max limit 100. Positive integers only. Whitelisted sort values; stable tie-break on id. Admin default newest first, category sortOrder ascending, public lectures schedule ascending, public articles publishedAt descending. `meta` includes page/limit/total/totalPages. Empty lists return 200; details of hidden content return 404. Text search `q` bounded to 100 characters, treated as escaped literal text (not a caller-supplied regex). Do not return unlimited lists for CSV or prerendering.

UTC ISO dates, ObjectId strings, no `__v`. Optional absent text fields normalize to null where specified in OpenAPI; collections return arrays, never null. Shared SEO input: `{title?: string, description?: string, ogImage?: string}` with safe media reference and length limits. Canonical URLs derive from configured public origin and stable route; no arbitrary canonical override. Slugs support Arabic/Latin safely and are path-encoded by clients. PATCH rejects unknown keys and cannot mutate ids, createdAt, passwordHash or author identity through generic payloads.

## Endpoints

Paths below include `/api/v1` implicitly. `Session` = authenticated active admin; `CSRF` = synchronizer token plus exact allowed Origin for writes.

| Method | Path | Access | Contract |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness, minimal `{status:"ok"}` |
| GET | `/ready` | Public | 200 ready or 503; no infrastructure details |
| GET | `/openapi.json` | Public | Implemented OpenAPI only |
| GET | `/docs` | Public | Swagger UI, no credentials embedded |
| GET | `/auth/csrf` | Allowed browser origin, rate limited | `{csrfToken}` in envelope; initializes CSRF session, no-store |
| POST | `/auth/login` | CSRF, login rate limit | `{email,password}` -> safe admin DTO; rotate/save session and CSRF |
| POST | `/auth/logout` | Session + CSRF | Destroy server session, clear cookie, data null |
| GET | `/auth/me` | Session | `{id,name,email,role,lastLoginAt}`; no-store |
| GET | `/admin/admins/me` | Session | Current administrator profile only |
| PATCH | `/admin/admins/me` | Session + CSRF | `{name}` only; no public/admin account creation endpoint |
| GET | `/admin/overview` | Session | `{totalCourses,publishedCourses,upcomingLectures,totalRegistrations,pendingRegistrations}` |
| GET | `/categories` | Public | Active only, paginated, sortOrder |
| GET | `/courses` | Public | Published + active category only; filters `category` slug, `q`, `featured`, `sort`; paginated |
| GET | `/courses/featured` | Public | Featured published courses; same pagination/filters |
| GET | `/courses/:slug` | Public | Public course detail or 404 |
| GET | `/lectures` | Public | Published only; `period=upcoming|past`, related course id, q and sort; paginated |
| GET | `/lectures/:slug` | Public | Public lecture detail, never meetingUrl |
| GET | `/articles` | Public | Published nonfuture articles only, paginated, `q` |
| GET | `/articles/:slug` | Public | Public article and safe author display name |
| GET | `/settings` | Public | Academy/contact/about/footer/SEO allowlist |
| POST | `/registrations` | Public + registration rate limit | Discriminated course/lecture registration; 201 receipt only |
| GET | `/media/:id` | Public only if allowed by visibility and live references | Stream verified image; otherwise 404 |
| GET | `/admin/categories` | Session | All states, paginated |
| POST | `/admin/categories` | Session + CSRF | Category input -> created record |
| GET | `/admin/categories/:id` | Session | Editable record |
| PATCH | `/admin/categories/:id` | Session + CSRF | Partial category input |
| DELETE | `/admin/categories/:id` | Session + CSRF | Soft deactivate |
| GET | `/admin/courses` | Session | Filter `status`, category id, `q`; paginated |
| POST | `/admin/courses` | Session + CSRF | Course input -> record |
| GET | `/admin/courses/:id` | Session | Includes drafts/archive |
| PATCH | `/admin/courses/:id` | Session + CSRF | Includes publish/unpublish/archive via status |
| DELETE | `/admin/courses/:id` | Session + CSRF | Soft archive and retain references |
| GET | `/admin/lectures` | Session | Filter status and schedule; paginated |
| POST | `/admin/lectures` | Session + CSRF | Lecture input, private meetingUrl allowed |
| GET | `/admin/lectures/:id` | Session | Includes meetingUrl |
| PATCH | `/admin/lectures/:id` | Session + CSRF | Schedule, edit link, publish/complete/cancel |
| DELETE | `/admin/lectures/:id` | Session + CSRF | Always soft cancel; retain registrations; omit meetingUrl |
| GET | `/admin/articles` | Session | Filter status, `q`; paginated |
| POST | `/admin/articles` | Session + CSRF | Article input; author=current admin |
| GET | `/admin/articles/:id` | Session | Includes drafts |
| PATCH | `/admin/articles/:id` | Session + CSRF | Content/SEO/status; server manages publishedAt |
| DELETE | `/admin/articles/:id` | Session + CSRF | Delete with confirmation |
| GET | `/admin/registrations` | Session | Filter targetType, course id, lecture id, status, q; paginated |
| GET | `/admin/registrations/export` | Session | Same filters; raw UTF-8 BOM CSV, no-store |
| GET | `/admin/registrations/:id` | Session | PII and private notes |
| PATCH | `/admin/registrations/:id` | Session + CSRF | `{status?,administrativeNotes?}`, validated lifecycle, no target reassignment |
| GET | `/admin/settings` | Session | Editable singleton; defaults if not created |
| PATCH | `/admin/settings` | Session + CSRF | Partial allowlisted fields, singleton upsert |
| GET | `/admin/media` | Session | Metadata list, paginated |
| POST | `/admin/media` | Session + CSRF | multipart `file`, optional `alt`; private by default |
| GET | `/admin/media/:id` | Session | Metadata only |
| GET | `/admin/media/:id/content` | Session | Authorized raw image stream |
| PATCH | `/admin/media/:id` | Session + CSRF | `{alt?,visibility?:"private"|"public"}` |
| DELETE | `/admin/media/:id` | Session + CSRF | Delete unreferenced file and chunks, else 409 |

Register `/admin/registrations/export` before `/:id`. Route ids use ObjectId validation; public detail paths use slug validation. There is no public registration list, meeting-link reveal endpoint, administrator signup, contact inbox, email callback, or Zoom API.

## Request and response schemas to implement in OpenAPI

### Auth

Login email trimmed/lowercased; password checked as supplied (never trim passwords). Success contains only the safe administrator profile. Refresh CSRF with `/auth/csrf` after login before further mutations; frontend holds token only in memory. Cookies are sent by browser via credentials, never returned as response data. All auth/profile/registration admin responses are `Cache-Control: no-store`.

### Categories

Input: name (required), slug (optional at creation), description (optional), image (nullable media id), isActive (default true), sortOrder (integer default 0). PATCH partial. Public projection: id/name/slug/description/image/sortOrder. Admin includes active state and timestamps. Seed names cover HR, marketing, job market preparation, programming, English.

### Courses

Implemented in Phase 2.3; see [Courses contract](courses.md) and authoritative OpenAPI0.5.0. Newest approved phase requirements supersede original lecturesCount/trainingMethod and no-featured proposal: use lectureCount, trainingMode (online-live|online-recorded|hybrid), featured and localized title/shortDescription/description.

Required on creation: title.ar and existing category ObjectId. Optional explicit slug, thumbnail nullable ObjectId, curriculum array of {title,topics:string[]}, lectureCount, duration display string, targetAudience:string[], trainingMode, price nullable integer piastres, currency EGP, isFree, status draft|published|archived, featured, localized SEO. Price null means unannounced, positive means paid, zero requires free. Draft defaults support incomplete content; publish requires summary/description/duration/trainingMode and active category. Server-owned first publishedAt locks slug permanently after initial publication. Draft slug updates are explicit; title edits preserve slug.

Public GET /courses, /courses/featured, /courses/:slug require published status plus active category. Public category filter is a slug; admin filter and assignments use ObjectId. Query supports q literal title search, featured, page/limit and sort newest|oldest|title; admin adds status. Cards project only public summary fields; detail adds curriculum/content/SEO; category={id,name,slug}. Admin receives category id and lifecycle metadata. Thumbnail is syntactically validated only until Media. DELETE /admin/courses/:id archives and returns retained admin DTO, never data:null or physical deletion. All admin reads require session and writes additionally require Origin/CSRF.

### Lectures

Implemented: see [Lectures contract](lectures.md) and OpenAPI 0.5.0. Localized title/shortDescription/description, optional generated stable slug, nullable course reference, required scheduledAt and durationMinutes, nullable capacity/deadline/thumbnail/private HTTPS meetingUrl, status and localized SEO. Explicit-offset ISO dates are stored UTC and returned with Z; display via Africa/Cairo. Published requires complete Arabic descriptions and future schedule. Public list/detail/search never include meetingUrl. Admin list/DELETE also omit it; authenticated detail/create/update may include it. Cancellation/completion hides lectures; DELETE retains records. Capacity edits cannot fall below reserved seats.

### Articles

Input: title, optional initial slug, excerpt, content plain text, thumbnail nullable id, status `draft|published`, seo. author determined server-side; publishedAt set on first publication, preserved on edits/republish. Public author is `{name}` only. Publishing requires title/excerpt/content; unpublish removes public visibility. Content length is bounded (propose 50,000 characters); paragraph rendering is accessible and escaped.

### Registration

Implemented: see [Registrations contract](registrations.md). Public strict JSON: `{fullName,phone,email?,targetType:"lecture"|"course",targetId,privacyConsent:true}`. fullName 2..200; email valid/lowercase or omitted; phone parsed with EG default and stored E.164. Exactly one target is stored. Receipt data is `{reference:"UUID",status:"pending"}`. No public lookup, student account, payment, invitation or automatic messaging.

Published eligible targets only. Unique normalized phone/target indexes apply across all statuses; generic duplicate 409. Lecture seat increment + registration insert and cancellation/release/reactivation are transactional with majority commit and snapshot reads. Replica set/Atlas required; standalone fails closed. Pending/confirmed/attended reserve seats. pending -> confirmed/cancelled; confirmed -> cancelled/attended; cancelled -> pending/confirmed with eligibility/capacity recheck; attended terminal (lecture-only after start/completion). Same state is idempotent. Course/category administrative eligibility has the documented transaction-snapshot boundary.

Admin notes max5000; listing omits contact fields/notes/consent, detail includes them. Filtered CSV is bounded to5000, ignores pagination for the download, UTF-8 BOM, CRLF, quoted/escaped, formula-neutralized including international phone values. No meeting URL or credentials. Authenticated export is no-store; PATCH additionally requires Origin/CSRF. Public creation requires trusted Origin, JSON, explicit consent and 30 attempts/15 minutes/IP without creating a session.

### Settings and media

Settings PATCH: academyName, logo id/null, contact `{phone,email,whatsapp}`, bounded socialLinks of known platforms and HTTPS URLs, address, aboutContent, footerInformation, seoDefaults. No secrets or arbitrary scripts/HTML. Public fields are explicitly projected. A missing settings record yields documented safe display defaults, not private config.

Media creation returns id/url/mimeType/size/alt/visibility; public url is only usable when file is public and currently referenced by public content/settings. Upload errors have 400/413/415, never parser stack traces. File payload is multipart, not JSON/base64. Admin metadata listing must not expose GridFS internals. Request limits: 5 MiB/file, one image, verified JPEG/PNG/WebP. Private content streams have no-store and correct verified MIME/nosniff.

## Publication/build contract

No special admin-authenticated prerender endpoint: enumerate `/courses`, `/lectures`, `/articles` using all pagination pages and fetch public detail DTOs. Use the exact same eligibility rules as the public site. Async public build discovery runs without session cookies. A backend outage, invalid schema, missing page, or disappearing slug fails the build and preserves the last successful release; do not render an empty catalog on network error. Legitimately empty catalogs succeed.

Public builds produce a versioned route manifest used by sitemap generation and output checks. Build-time publication is a snapshot, not immediate synchronization. Changes to status, content, slug, schedule, settings or media require public rebuild and cache invalidation. A publish/unpublish operation itself does not trigger hosting APIs in the MVP. Document operator responsibility visibly in the admin UI and deployment runbook.

## Contract release discipline

Phase 1 starts OpenAPI with actual foundation endpoints and shared envelope/error/security schemas. Phase 2 adds explicit create/update/public/admin variants for every resource, multipart and binary media responses, CSV response, pagination/query limits, all status codes and examples. Validate specification syntax/references and test implementation responses against it. Swagger UI describes deployed behavior, never future routes from this plan. Frontends generate local API types against a pinned backend specification artifact, track version/checksum, and update together on behavior changes. No copied hand-maintained domain interfaces that can drift independently.
