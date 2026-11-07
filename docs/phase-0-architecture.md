# TO Academy architecture and delivery plan

Status: proposed implementation baseline, Phase 0 only. Date: 2026-11-07 (Africa/Cairo). Read [repository audit](repository-audit.md) for observed facts and [API contract](api-contract.md) for endpoint and payload decisions. Frontend-specific plans live in each frontend's `docs/architecture.md`.

## Constraints and decisions

Three independent repositories, each with npm, package-lock.json, configuration, tests, and releases. Backend is the only database client. Frontends communicate through documented `/api/v1` HTTP endpoints. No parent Git repository, shared-code package, npm workspaces, or cross-repository imports. No Docker or other container configuration/instructions. No student accounts, payments, video/LMS, messaging integrations, analytics, or external media storage.

Use TypeScript strict mode and ESM. Backend: maintained stable Express, Mongoose, Zod, express-session, connect-mongo, bcrypt, Helmet, cors, express-rate-limit, pino/pino-http, and a maintained multipart parser. Select exact dependency versions and compatible type packages together in Phase 1; commit npm lockfiles when commits are authorized. Prefer latest patched Node 24 LTS and its bundled npm; keep the same runtime line in all repositories. No dependency versions or compatibility have been tested yet.

Public: React + Vite through React Router Framework Mode, using native static prerendering with `ssr: false`. Admin: React + Vite SPA with React Router. Both use TanStack Query, Fetch, React Hook Form, Zod, CSS Modules, and CSS custom properties. No global state library. Self-host an Arabic font such as Cairo with its license; system fallbacks must render Arabic/English legibly. Arabic RTL defaults, `Intl` for dates/money, and local translation dictionaries prepare for future English without implementing a language switch now.

## Target backend structure

```text
to-academy-backend/
  src/
    config/{database,env,cors,session}.ts
    modules/
      auth/{model,routes,controller,service,validators,utils}/
      admins/{model,routes,controller,service,validators,utils}/
      categories/{model,routes,controller,service,validators,utils}/
      courses/{model,routes,controller,service,validators,utils}/
      lectures/{model,routes,controller,service,validators,utils}/
      registrations/{model,routes,controller,service,validators,utils}/
      articles/{model,routes,controller,service,validators,utils}/
      settings/{model,routes,controller,service,validators,utils}/
      media/{model,routes,controller,service,validators,utils}/
    shared/
      middleware/  errors/  utils/  constants/  types/  validators/
    infrastructure/{storage,logging}/
    routes/index.ts
    app.ts
    server.ts
  scripts/{seed-admin,seed-categories,ensure-indexes}.ts
  tests/{unit,integration}/
  docs/{architecture.md,phase-0-architecture.md,repository-audit.md,api-contract.md,openapi.yaml}
  .env.example  .gitignore  .nvmrc
  package.json  package-lock.json  tsconfig.json
  eslint.config.js  vitest.config.ts  README.md
```

Paths above are targets, not generated empty directories. Add a file only when it owns behavior. Admins owns the Admin Mongoose model; auth/model can contain session data types when required, not a second admin schema. Other module model folders follow the same rule. Controllers translate validated HTTP inputs into service calls and responses. Services enforce business rules and use models. Routes compose validation, authentication, authorization, CSRF, and rate limits. Module utils handle concrete transformations such as slug normalization, DTO projections, or CSV formatting. Shared utilities cover common concerns only. Infrastructure owns the GridFS adapter and logger, not HTTP behavior. No generic CRUD framework or repository abstraction over Mongoose.

`app.ts` constructs the Express application for tests without opening sockets. `server.ts` validates configuration, connects MongoDB, initializes the session store, starts listening, and handles SIGINT/SIGTERM. Do not accept traffic before database/session readiness; gracefully close HTTP and database connections on shutdown. Unknown routes return the common JSON 404. Reject oversized JSON (propose 100 KiB) and malformed input centrally. Health endpoints expose minimal state, never database addresses or errors.

## Module boundaries

| Module | Owns | Allowed collaboration |
| --- | --- | --- |
| admins | Admin records, safe DTO, active state, current profile | auth uses credential lookup/check service; no public CRUD |
| auth | Login/logout/me, session lifecycle, CSRF issuance | admins service; shared session middleware |
| categories | Category CRUD, sorting, active visibility, five-category seed | courses checks category existence and active status |
| courses | Course lifecycle, curriculum, price and public DTO | category service; media reference checks |
| lectures | Lecture lifecycle, schedule and private meeting URL | media reference checks |
| registrations | Target validation, deduplication, status/notes, CSV | course/lecture eligibility service methods; never their controllers |
| articles | Editorial lifecycle, author reference, publish timestamp, SEO | admins safe author projection; media reference checks |
| settings | Singleton academy/contact/about/footer/SEO settings | media reference checks |
| media | Validated upload, metadata, access checks, deletion | infrastructure GridFS; checks references before delete |

Keep reference checks unidirectional: content validates existence of media; media checks usage with model-level read queries in a dedicated utility, not reverse service imports. Dashboard counts live in a small admins service using model read queries, not a new analytics module. Avoid circular service imports.

## MongoDB model and relationships

All business collections use timestamps. API serializes ObjectId as `id: string`, dates as ISO 8601 UTC, and excludes `__v`. All writes use allowlisted fields; never spread request objects into Mongo queries/updates. Explicitly construct filters to reject operator injection. Validate ObjectIds before querying. References are not foreign keys: services enforce existence and restrict destructive deletion.

| Collection | Fields and relationships | Indexes / constraints |
| --- | --- | --- |
| admins | name, normalized email, passwordHash (excluded by default), role=`admin`, isActive, lastLoginAt | unique email; bcrypt only, no public registration |
| categories | name, slug, description, image -> GridFS file id, isActive, sortOrder | unique slug; isActive+sortOrder |
| courses | title, slug, shortDescription, description, category -> categories, thumbnail -> media, curriculum `[{title,topics:string[]}]`, lecturesCount, duration (display string), targetAudience:string[], trainingMethod (`online_live`, `offline`, `hybrid`), price nullable, currency=`EGP`, isFree, status, seo | unique slug; status+createdAt; category+status+createdAt |
| lectures | title, slug, description, content, scheduledAt UTC nullable for drafts, duration (minutes integer), meetingUrl private nullable, thumbnail -> media, status, seo | unique slug; status+scheduledAt |
| registrations | fullName, email optional normalized, phone normalized, whatsappNumber optional normalized, registrationType, course or lecture ref, status, notes private | partial unique phone+course for course type; partial unique phone+lecture for lecture type; status+createdAt; target+createdAt |
| articles | title, slug, excerpt, content, thumbnail -> media, author -> admins, status, publishedAt, seo | unique slug; status+publishedAt |
| settings | fixed singleton key, academyName, logo -> media, contact `{phone,email,whatsapp}`, socialLinks, address, aboutContent, footerInformation, seoDefaults | unique singleton key |
| media.files / media.chunks | GridFS bucket; metadata contains uploader admin id, verified MIME, visibility, alt text, original filename | standard GridFS chunk index and file metadata indexes |
| sessions | connect-mongo managed records: admin id, CSRF secret/token, expiry and session metadata | store-managed TTL; do not expose through API |

Article author output includes display name only; disabling an administrator must not erase articles. Seed categories idempotently by slug: `hr`, `marketing`, `job-market-preparation`, `programming`, `english`, with Arabic names and stable sort order. Do not overwrite edited descriptions on reruns.

Course prices: `null` means inquire; zero allowed only with `isFree=true`; free implies price zero; paid courses accept null or positive price. Store price as integer minor units (piastres) and document API `price` as such; clients format `price / 100` using `Intl.NumberFormat`. No payment workflow. Publishing requires complete minimum content, an active category, and a usable slug. Public category filters show only active categories; hide courses whose category is inactive. Draft/archive never public. Public lectures require `status=published` and may include past published sessions; upcoming listings add the current-time constraint. Completed/cancelled lectures are not publicly retrievable. Public articles require published status and nonfuture publishedAt. Separate explicitly allowlisted list/detail/admin DTOs; meetingUrl never appears in public payloads, even after registration.

Slug generation: normalize Unicode and trim; allow Arabic/Latin letters, numbers, hyphens; reject separators/control characters; use deterministic collision suffixes and unique indexes. Slugs editable before initial publication, stable afterward for MVP to avoid redirect history infrastructure. Validate descriptions/content length; plain text with paragraph rendering for MVP, no arbitrary HTML or rich-text editor. Do not render untrusted content using `dangerouslySetInnerHTML`.

Registration is a discriminated union requiring exactly one matching target, with active/published eligibility checked server-side. Phone is required; email optional to match the form requirements. Normalize Egyptian local numbers into +20 E.164 and accept valid explicit international numbers; use a maintained phone parsing library if needed rather than a brittle Egyptian-only regex. Database uniqueness is the concurrency guard; handle duplicate-key races as 409. One record per phone+target for all statuses; admins reactivate a cancelled registration. Do not expose existing record details in public errors. Public creation never accepts status or notes and returns only a receipt id and pending state.

Delete categories only when unused (otherwise 409); courses/lectures with registrations cannot be deleted (use archive/cancel), preventing orphan PII and records. Delete unused content/media only; default to archive/unpublish for published content. MongoDB cannot enforce cross-document integrity: reference validation plus rechecks are adequate for the expected single-admin MVP, but must be revisited if concurrent destructive editing expands. Keep admin hard-delete confirmation in the dashboard.

## Session and security architecture

Recommended deployment: public, admin, and API on HTTPS subdomains under the same registrable domain. Use localhost consistently during development: API 4000, public 5173, admin 5174. Do not mix localhost and 127.0.0.1 in browser origins.

- express-session with connect-mongo; no MemoryStore fallback. Store only admin id and CSRF/session timing state. Read current active administrator on every authenticated request so deactivation takes effect immediately.
- Host-only, HttpOnly cookie, Path=/, SameSite=Lax, Secure in production; no broad Domain attribute. Example cookie name `toacademy.sid`. Set resave=false and saveUninitialized=false. Eight-hour absolute login lifetime; nonrolling cookie, checked server-side, TTL cleanup is not the only expiry check. Clear cookies with the same attributes on logout.
- Regenerate session after successful bcrypt verification, issue a new CSRF token, save before responding; update lastLoginAt. Destroy session on logout. Generic incorrect-credentials response; do not reveal inactive accounts. Password length 12..72 UTF-8 bytes; bcrypt cost proposed 12 and benchmarked on the deployment host.
- `GET /auth/csrf` issues a cryptographically random synchronizer token bound to a session and returns it as JSON. Frontends hold the token in memory and send `X-CSRF-Token` on login/logout and every admin mutation, including multipart uploads. Rotate after login. Require exact trusted Origin for browser mutations (or validate Referer origin if needed); reject missing origin context on session mutations. Timing-safe token comparison. CORS alone is not CSRF protection.
- Public registration has no session-based authority: accept JSON only, validate allowed Origin for browser traffic, and apply separate IP/target abuse limits. CSRF token is not required for this nonprivileged endpoint. Do not create sessions for public GETs or registration submissions.
- Explicit CORS allowlist, credentials support, no wildcard/reflected arbitrary origin. Trust proxy only for a documented deployment hop/CIDR, never blanket `true`. Secure cookie checks must reflect actual TLS termination. Handle preflight and `Vary: Origin` correctly.
- Initial limits: login 5 failed attempts/15 minutes per IP plus normalized account key, CSRF issuance 60/minute/IP, registrations 10/hour/IP; tune through acceptance testing. Single-process in-memory limiter is adequate initially; document reset on restart and no multi-instance deployment without a shared limiter.
- Helmet, reduced fingerprinting, strict input validation, bounded pagination/uploads, sanitized CSV, and private no-store responses. Structured logs include request id, method, path without sensitive query values, status and latency; redact Cookie, Set-Cookie, authorization, passwords, CSRF tokens, registration PII, bodies and database URI. Production errors never include stack traces.

Cross-site deployment on unrelated platform domains may need SameSite=None; Secure and can fail under third-party cookie restrictions. Do not switch silently: settle domain topology before deployment. No localStorage session ids or bearer tokens. Frontends use credentialed Fetch and recover from expired sessions through `/auth/me`.

Seed the first admin with an interactive masked password prompt and name/email input (or ephemeral environment input for noninteractive deployment), never CLI password arguments, checked-in credentials, or a default password. Seed requires explicit invocation and database connectivity, refuses duplicate email, and never prints hashes/passwords. No admin management UI/complex permissions; profile read/update endpoints only, no role or isActive self-edit.

## Media

Use the official MongoDB GridFSBucket through the MongoDB connection managed by Mongoose. GridFS metadata is the media record; do not duplicate blobs in normal documents. MVP accepts JPEG, PNG and WebP only, maximum 5 MiB/file, one file per request. PDF and other formats can be added when there is an actual client use case. Validate byte signatures as well as MIME/extension, reject SVG/HTML, limit image dimensions (propose 6000x6000), sanitize names, and abort/clean partial uploads. Never buffer arbitrarily large uploads. Store verified Content-Type, byte length and uploader; no exposed database paths.

All upload/list/metadata mutations/delete require auth and CSRF. New uploads private by default. Public GET `/media/:id` serves only explicitly public files referenced by currently public content or settings; unauthorized/missing ids return indistinguishable 404. Admin GET uses a separate protected path. Check visibility/references on every public request, use nosniff, safe disposition, and no-store initially so caches do not defeat unpublishing. Admin metadata returns id/url/type/size/alt only. Referenced files return 409 on deletion. Test lifecycle and upload cleanup on actual MongoDB; do not assume GridFS is a transactional blob store.

## Environment and host execution

Backend `.env.example` will contain these keys with clear comments and no real credentials:

```dotenv
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/to_academy
SESSION_SECRET=
SESSION_COOKIE_NAME=toacademy.sid
PUBLIC_APP_URL=http://localhost:5173
ADMIN_APP_URL=http://localhost:5174
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
TRUST_PROXY_HOPS=0
```

Zod validates at startup: required secret with >=32 bytes of entropy generated outside source control, recognized environment, valid port/URI, exact origin-only URLs, nonempty allowlist including both configured apps, production HTTPS, valid cookie name and bounded trusted proxy hop count. Secret entropy cannot be proven by string length; document random generation and reject obvious placeholders. No insecure secret/URI substitution in production. Expiry/upload limits are code constants initially, not extra environment knobs. Production operators explicitly set proxy trust after topology review. `.env`, `.env.*` ignored with `.env.example` exception. Database credentials stay backend-only. Frontend VITE values are public; never put secrets there.

Planned backend commands (not implemented in Phase 0):

| Command | Purpose |
| --- | --- |
| `npm ci` | Install from committed per-repo lockfile |
| `npm run dev` | tsx watch server, load local env |
| `npm run typecheck` | TypeScript without emit |
| `npm run build` / `npm start` | Compile tsc / run compiled server |
| `npm run lint` / `npm run format:check` | ESLint / formatting verification |
| `npm test` | Vitest unit + validation tests, no external DB |
| `npm run test:integration` | Supertest against isolated local/Atlas test DB |
| `npm run seed:admin` / `npm run seed:categories` | Explicit seeds |
| `npm run db:indexes` | Create/verify intended indexes without dropping existing ones |
| `npm run api:check` | OpenAPI validation and contract checks |

Start installed MongoDB normally through its existing host service, or supply Atlas URI; confirm it works before integration tests. Do not reconfigure the user's MongoDB service without need. Integration tests require TEST_MONGODB_URI pointing to a dedicated test database with a checked test-only name, never the application's DB. Cleanup must fail closed outside that target. No automatically downloaded database binaries required. If DB access is missing, report integration checks as blocked rather than passed.

## API source of truth and testing

The [API plan](api-contract.md) defines proposed contracts, not working endpoints. Phase 1 creates `docs/openapi.yaml` (OpenAPI 3.0.3) for the foundation; Phase 2 extends it alongside each module with complete schemas, constraints, examples, auth, pagination, and every error response. Serve Swagger UI and JSON spec at `/api/v1/docs` and `/api/v1/openapi.json`; no credentials/sample secrets. Keep one authoritative backend specification. Both frontends generate independent checked-in `src/api/generated/schema.d.ts` via openapi-typescript from a pinned downloaded specification artifact, never by importing backend source. Record the backend contract version/checksum and regenerate on contract changes. Frontend CI checks generation against that pinned contract; integration/release verifies all three use the same published contract version. Compatible additive changes retain v1; incompatible changes require coordinated review.

Validation strategy: Vitest service/validator tests; Supertest integration against real test MongoDB for sessions/CSRF, public projections, duplicate registration races, status transitions, CSV escaping and GridFS lifecycle. Frontends use Vitest + Testing Library for meaningful registration/login/error cases and Playwright for one admin publication and one public registration flow. Verify builds/types/lint separately in each repo. No test suite exists yet; Phase 0 validation is repository/document inspection only.

## Delivery sequence and effort

Solo-developer estimates are focused engineering days, excluding client feedback/content delays. Baseline 17-20 days (roughly 110-140 focused hours); two weeks is high risk for the entire stated scope. Aim for four weeks with client content delivered early. Budget below 15,000 EGP must cover agreed development effort and separately agreed domain/hosting/backup costs; this plan is not a provider price quote.

| Phase | Focused days | Exit criteria |
| --- | --- | --- |
| 0 | 0.5-1 | Audit + architecture/API/routing/security decisions reviewed |
| 1 | 1-1.5 | Independently runnable backend foundation; startup, errors, CORS, sessions tested |
| 2 | 4-5 | Auth, categories, courses, lectures, registrations, articles, settings, media; complete OpenAPI and service/API tests |
| 3 | 3-4 | Admin auth, overview, resource forms/tables, registrations/CSV, media, settings |
| 4 | 4-4.5 | Arabic design, all public pages, registration, SEO and dynamic prerender |
| 5 | 2.5-3 | Integrated browser checks, responsive/a11y checks, security/SEO fixes, deployment/restore runbook and client review |
| Buffer | 1 | Dependency/platform/content issues |

Work backend first. Implement Phase 2 in vertical slices: auth + category seed, courses, lectures, registrations/CSV, articles/settings, then media and thumbnail wiring. Freeze a usable contract before admin integration. Admin validates real content editing, then public uses that same contract. Revisit public SSG early with a single published course fixture during Phase 2/4 to avoid discovering build incompatibilities at the end. No simultaneous repository rewrites.

## Exact next steps: Phase 1

1. Recheck backend Git state; preserve all documentation and any new owner edits. Select/pin patched Node 24 and verify engine compatibility of chosen dependency versions. Runtime installation, if needed, must be explained before changing host tooling.
2. Create backend-only npm/TypeScript ESM configuration, lockfile, scripts, `.gitignore`, `.env.example`, lint/test setup, and local README. No business-module placeholders.
3. Implement Zod startup configuration, pino redaction/request ids, application error types, strict request validation utilities, common response envelope, centralized error handling, and JSON 404.
4. Implement MongoDB connection with bounded startup failure, liveness/readiness, graceful shutdown, testable app factory, and an index-management approach. Verify the installed MongoDB or configure Atlas using owner-provided secrets locally.
5. Add explicit CORS, Helmet, body limits, production proxy validation, connect-mongo sessions, cookie settings, CSRF utility/issuance and auth middleware scaffolding. No dummy admin or insecure session fallback. Login/admin model behavior belongs to Phase 2.
6. Create initial OpenAPI covering health/readiness and implemented CSRF issuance with common schemas/security. Reserve planned routes in documentation only; do not advertise unimplemented operations as working.
7. Test environment rejection, redacted errors, unknown endpoints, CORS/preflight, session cookie/expiry and CSRF primitives; database-backed readiness/session-store tests require isolated test MongoDB. Run typecheck, lint, unit tests, integration tests and production build; document precise outcomes and blockers.

Phase 1 does not include frontends or CRUD modules. Stop at the foundation deliverable and report tests and exact Phase 2 work.

## Risks, assumptions and approval points

Decisions within the requested stack: Framework Mode SSG, Fetch, CSS Modules, optional registration email, phone deduplication, minor-unit prices, plain text editorial content, stable published slugs, image-only MVP media and one administrator role. These are documented assumptions to implement unless revised; no unrelated infrastructure is needed.

Before deployment, owner/client decisions are needed for the real domain and same-site subdomains, Node/static hosting and MongoDB/backup costs, credentials/operational access, and who triggers public rebuilds. No paid service purchase or deployment is authorized by this document. Choose provider based on actual domain/proxy/runtime compatibility and current pricing later.

Before release, client supplies approved identity/assets, course data, contact details, privacy text, PII retention period/deletion procedure, and a way staff will manually communicate joining instructions. No meeting links are sent by this application. Registrations must be usable without email. Contact page uses editable contact information and ordinary phone/mail links; there is no unspecified contact-message inbox/API.

Important static-site limitation: unpublishing removes content from the API immediately, but previously generated HTML/data and caches persist until a new deployment and cache invalidation. Immediate confidential takedown requires a deployment removal process; draft data must never enter a static build. Start with manual public rebuild/deploy after publication changes; automate only after provider choice and explicit scope approval. Rebuild failures keep the last good deployment and must be visible to the operator. Do not claim database edits automatically update SEO HTML.

Security/operations risks: cross-site cookies, exposed meeting links from careless DTOs, missing unique indexes, CSV formula execution, logs containing PII, media caches, test cleanup against the wrong database, and absent backups. Address these through the explicit rules/tests above. Host MongoDB executable presence does not prove usable DB access. Keep a host-native backup/restore runbook and verify recovery before production; no external file storage integration.

No destructive changes, implementation, host installs, paid resources, commits, pushes, PRs or remote changes are part of Phase 0. Existing instructions already authorize routine later implementation decisions, but this task ends at the requested audit/plan.

## Primary references verified for this plan

- [React Router prerendering](https://reactrouter.com/how-to/pre-rendering): async dynamic route list, static files/data, ssr:false restrictions and SPA fallback.
- [React Router rendering strategies](https://reactrouter.com/start/framework/rendering) and [installation](https://reactrouter.com/start/framework/installation): maintained Vite-compatible framework integration.
- [Vite SSR/SSG guide](https://vite.dev/guide/ssr.html): low-level alternative requires custom rendering orchestration.
- [Vike dynamic prerender hook](https://vike.dev/onBeforePrerenderStart): supports dynamic routes, but introduces its own routing conventions; unnecessary alongside required React Router.
- [Express session documentation](https://expressjs.com/en/resources/middleware/session/): server-side sessions, cookie/proxy requirements and production store requirements.
- [MongoDB Node GridFS documentation](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/): bucket metadata/chunks and streaming APIs.
- [Node release schedule](https://github.com/nodejs/Release#release-schedule): select a supported LTS line and patched runtime at implementation time.
