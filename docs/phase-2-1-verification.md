# Phase 2.1 completion report

Date: 2026-11-07, Africa/Cairo. Backend only. Phase 1 published successfully first; Phase 2.1 commits are local pending review/push approval. No Public/Admin/parent files modified, no container tooling or JWT, no further business module implemented.

## Phase 1 publication

Branch: `main`. Origin unchanged: `https://github.com/AbdelrahmanHassanAlii/to-academy-backend.git`. Origin had no refs before publication; no unexpected history/divergence. Nine commits were pushed normally (no force/squash/amend) through `b801056`. Working tree was clean before Phase 2.1. No Commitlint configuration or active Husky hook existed; all commit headers were checked against Conventional Commit syntax and 100-character limit. Staged diffs inspected before each commit. No `.env`/tools/generated artifacts or actual secrets were tracked.

| Hash    | Phase 1 message                                                         |
| ------- | ----------------------------------------------------------------------- |
| eaf5ea7 | chore(backend): configure node typescript and quality tooling           |
| 0483f7d | feat(config): add validated environment logging and api error contracts |
| 495c3f5 | feat(database): manage mongodb connectivity and graceful shutdown       |
| 24cfc86 | feat(security): add cors mongo sessions csrf and rate limiting          |
| cc4d62e | feat(docs): add extensible openapi and swagger infrastructure           |
| 6caea7d | feat(api): initialize express health readiness and server lifecycle     |
| 9914f2f | test(backend): cover configuration security and mongo lifecycle         |
| a513070 | docs(architecture): preserve repository audit and approved api plan     |
| b801056 | docs(backend): document phase one setup security and verification       |

## Phase 2.1 files

New files:

```text
src/modules/admins/
  model/admin.model.ts
  routes/admin.routes.ts
  controller/admin.controller.ts
  service/admin.service.ts
  validators/admin.validators.ts
  utils/admin-profile.ts
  index.ts
src/modules/auth/
  model/auth-session.ts
  routes/auth.routes.ts
  controller/auth.controller.ts
  service/auth.service.ts
  validators/auth.validators.ts
  utils/password.ts
  utils/login-rate-limit.ts
  utils/session-lifecycle.ts
  index.ts
src/shared/
  middleware/authenticate.ts
  middleware/authorize.ts
  validators/credentials.ts
scripts/seed-admin.ts
tests/unit/admin-validation.test.ts
tests/unit/session-lifecycle.test.ts
tests/integration/auth.test.ts
tests/integration/seed-admin.test.ts
docs/authentication.md
docs/phase-2-1-progress.md
docs/phase-2-1-verification.md
```

Modified: `package.json`, `package-lock.json`, `src/app.ts`, `src/server.ts`, `src/shared/types/session.d.ts`, `src/shared/middleware/csrf.ts`, `src/shared/middleware/error-handler.ts`, `tests/unit/app.test.ts`, `tests/unit/csrf.test.ts`, `docs/openapi.yaml`, `README.md`. Original Phase 0 and Phase 1 reports remain historical records. Existing local `.env` was preserved and remains ignored/untracked; no credential values were read into output.

Only new dependencies: bcrypt 6.0.0 (asynchronous password hashing/comparison) and @types/bcrypt 6.0.0. Exact versions and lockfile retained; no other runtime infrastructure replaced.

## Administrator model and authorization

Fields: name, unique normalized email, passwordHash (select:false and JSON-stripped), role=admin, isActive, nullable lastLoginAt and timestamps. Per-connection model; startup/seed await unique index creation without dropping indexes. Password: 12+ characters, <=72 UTF-8 bytes, no NUL/no trim; bcrypt cost 12. Safe DTO is id/name/email/role/lastLoginAt only.

`authenticate` checks session identity/expiry and current active database administrator on every protected request. Invalid/deleted/inactive identities destroy the stale session and return 401. `authorize` checks the database role against an explicit allowlist; unauthenticated 401 and insufficient permission 403 are separate. There is one MVP role; no permissions framework or public administrator signup.

## Endpoints and sessions

| Endpoint                        | Behavior                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/v1/auth/login`       | Origin + existing CSRF, strict email/password body, generic 401 failures; successful login regenerates session, rotates CSRF, updates lastLoginAt |
| POST `/api/v1/auth/logout`      | Active admin + Origin + current CSRF; destroy session, clear matching cookie, return data:null                                                    |
| GET `/api/v1/auth/me`           | Current safe active administrator; 401 without valid identity                                                                                     |
| GET `/api/v1/admin/admins/me`   | Protected own profile                                                                                                                             |
| PATCH `/api/v1/admin/admins/me` | Protected name-only edit with CSRF; all other fields rejected                                                                                     |

Foundation health/readiness/CSRF/OpenAPI/Swagger remain available. OpenAPI 0.2.0 documents seven paths, eight operations, cookie authentication, request/profile schemas and error responses. Login response contains no session id/hash; browser must refetch CSRF after login. Identity stored as adminId only plus token/expiry/cookie metadata. Same host-only HttpOnly SameSite=Lax cookie, Secure in production, eight-hour absolute expiry, exact CORS/origin and credentialed Fetch requirements as Phase 1.

Logout replay/repeated logout/missing session return 401; repeated logout is not presented as authenticated success. Expired sessions retain SESSION_EXPIRED semantics. Session read/save/regenerate/destroy failures return safe 503 rather than false success. Known Mongo connection failures return DATABASE_UNAVAILABLE 503, without raw details.

Login rate limits: five failures/15 minutes per IP and normalized account; 60 requests/minute/IP burst cap. Account keys hashed, success does not consume failure budget. Process-local single-instance enforcement. Deactivation/deletion is checked on the next authenticated request; no role trusted from request/session values.

## Seed and environment

Use `npm run seed:admin` from a trusted full-install backend checkout, with private MONGODB_URI and ephemeral `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Exact secure PowerShell prompt/cleanup instructions: [authentication runbook](authentication.md#secure-cli-provisioning). No positional credentials/default password/public endpoint. Unique email prevents duplicates; failures print safe codes only and never overwrite credentials. Distinct-email operator invocations can provision another same-role admin. Full dependencies needed because provisioning uses tsx; it is not a runtime API function.

Application environment variables are unchanged from Phase 1: NODE_ENV, PORT, MONGODB_URI, SESSION_SECRET, SESSION_COOKIE_NAME, PUBLIC_APP_URL, ADMIN_APP_URL, ALLOWED_ORIGINS, TRUST_PROXY_HOPS. TEST_MONGODB_URI is required explicitly for integrations. Three SEED_ADMIN inputs are seed-only and should not persist in the service environment or Git.

## Executed verification

Commands were executed with Node 24.22.1 and repo-local npm 11.19.1 (`node .tools/package/bin/npm-cli.js ...`, because this restricted shell has no npm on PATH). Standard developer commands remain ordinary npm scripts.

| Check                       | Result                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                    | Passed; clean lockfile install, 306 packages installed, 307 audited, zero vulnerabilities                                                                           |
| `npm test`                  | Passed; 55 unit/HTTP tests across 6 files                                                                                                                           |
| `npm run test:integration`  | Passed; 20 real MongoDB tests across 3 files, dedicated loopback test DB                                                                                            |
| `npm run typecheck`         | Passed; strict source/scripts/tests                                                                                                                                 |
| `npm run lint`              | Passed; zero warnings                                                                                                                                               |
| `npm run format:check`      | Passed                                                                                                                                                              |
| `npm run build`             | Passed; compiled production source                                                                                                                                  |
| `npm run api:check`         | Passed; OpenAPI 0.2.0, 7 paths validated                                                                                                                            |
| Seed script                 | Passed; real npm command creates/hash-verifies disposable admin, duplicate rejected, bad/missing input and direct argument rejection tested, no credentials printed |
| Authentication API          | Passed; valid/invalid/unknown/inactive credentials, validation, rate limits and session fixation protection                                                         |
| Session persistence/logout  | Passed; real stored session/cross-instance reuse, old cookie/token rejection, expiry, missing/deleted/inactive account rejection, logout deletion/replay            |
| Authorization/profile       | Passed; unauthenticated denial, active admin success, insufficient permission, CSRF and name-only edit                                                              |
| Independent security review | Completed; Important logout race and minor database-status contract issue fixed with failing-then-passing regressions; no finding deferred                          |

Tests use only randomized disposable administrators and targeted session cleanup in `to_academy_test`; no database/collection drops or real production administrator creation. Existing tests were retained; only OpenAPI route inventory was extended for the new endpoints. Post-clean-install checks are the final verification; early failures are recorded in the ledger, not hidden.

## Security review and limits

The reviewer reproduced a concurrent logout resurrection bug: old issueCsrf saved an existing authenticated session after logout deleted it, and MongoStore.set upsert restored it. The fix preserves the foundation but saves only token/deadline initialization; existing-token reads do not save, so store touch cannot recreate the deleted record. A deterministic test changed from replay200 before fix to401 after fix. Separate tests cover explicit session-save failure (no privileged autosave), regeneration failure and logout deletion failure. Unavailable Mongo errors now map to safe503, verified independently.

No local blocker remains. Production DNS/TLS/proxy/browser acceptance, least-privilege Mongo access, backups and bcrypt load/latency tuning remain deployment checks. No password reset/rotation/MFA, account UI, role hierarchy, audit trail or other business modules are included. Account-wide rate limits can temporarily block an account targeted by attackers; process-local state resets on restart. lastLoginAt records successful credential verification even if a later session-store step fails. On failed logout deletion the API returns503 and the client must retry; it never falsely reports successful invalidation.

Git: eight Phase 2.1 Conventional Commits are kept local on main, ahead of the published Phase 1 baseline. No Phase 2.1 push, force push, history rewrite, remote change or PR. Final working tree is clean apart from ignored local tooling/configuration. The owner reviews this milestone before authorizing its push or further implementation.

Recommended next milestone: categories and idempotent initial-category seeding, then courses as separate approved increments. Stop here pending owner approval.
