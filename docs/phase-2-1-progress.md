# Phase 2.1 implementation ledger

Spec: owner-approved Phase 2.1 request, `phase-0-architecture.md`, `api-contract.md`, and Phase 1 foundation. Inline implementation with test-first security/API checks and one independent final review. Backend only; stop before other modules.

## Published Phase 1 baseline

Nine Conventional Commits were reviewed, checked and pushed to unchanged origin/main on 2026-11-07. HEAD at publication: `b801056`. Remote had no refs before push. No Commitlint config or active Husky hook existed, so standard Conventional Commit syntax and 100-character header maximum were checked explicitly. `.env` remains ignored/untracked and was not read into outputs or changed. Phase 1: 43 unit + 4 real Mongo tests, types/lint/format/build/OpenAPI all passed before push.

| Hash    | Message                                                                 |
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

## Decisions and interface checks

- Preserve MongoStore/cookies/CORS/CSRF/expiry foundation; add adminId only to session state. Identity and role are reloaded from Mongo on authenticated requests.
- Ruling: owner requests this checkout/current branch and micro-commits. Continue on main, with Phase 2.1 ahead locally only; no worktree/branch change or Phase 2 push.
- Auth service consumes admins credential lookup and last-login update services, never another controller. Controllers handle HTTP/session transport, services own credentials and data rules. Models are per-connection, matching existing app/test design.
- Validators reject unknown fields; normalized email unique index; password 12..72 UTF-8 bytes, no trimming; bcrypt cost 12. Unknown email gets a runtime-generated dummy hash comparison, same generic 401 as bad password/inactive account.
- Login requires existing Origin+CSRF, then regenerates session, rotates token and resets absolute expiry. Client refetches GET /auth/csrf after login. Logout requires auth+CSRF; repeated logged-out calls return 401 (not silent success), per approved contract. Expired sessions follow existing 401 expiry handling.
- Provide only protected GET/PATCH /admin/admins/me (name-only PATCH), as approved API plan; no public registration, admin listing, role/status editing or extra business module.
- CLI seed reads required SEED_ADMIN_NAME/EMAIL/PASSWORD from ephemeral environment supplied by an operator's secure prompt/secret manager. No positional credentials, default password, credential logging or public seed route. Validate before DB write; unique email prevents accidental duplicates. Owner explicitly invokes the CLI; tests invoke it only against a dedicated test DB.
- Rate limits: login five failed attempts per 15 min per IP and per normalized account (hashed key, never email in limiter logs), plus coarse 60 requests/minute/IP. Failed login does not create a new session. Process-local limiter remains single-instance as documented.

## Tasks

- [x] RED -> GREEN admin/password validators, per-connection model, safe DTO and seed service.
- [x] RED -> GREEN real-Mongo login/logout/me/profile, middleware, session regeneration/expiry/invalidation/rate-limit tests.
- [x] Secure seed CLI + subprocess verification; extend OpenAPI and setup/security docs.
- [x] Independent review, all checks, staged inspections and local Conventional Commits; verify no Phase 2 push.

Review focus: credential timing/enumeration, bcrypt byte truncation, fixation/CSRF rotation, cookie clearing, missing/deleted/inactive administrators, invalid session identity and role, startup index failures, seed duplicate/error privacy, protected profile allowlist and production topology.

## Evidence and review outcomes

- Credential tests first failed because the module was absent, then passed 7/7 after implementation. Auth integration first failed on missing middleware, then passed against real MongoDB. Selected maintained bcrypt 6.0.0 and @types/bcrypt 6.0.0; native prebuilt works with install scripts disabled.
- Replaced deprecated Mongoose `new:true` with `returnDocument:'after'` based on the actual installed version warning. Test-only connection listeners are removed between synthetic app instances sharing one store; no production store settings were loosened.
- Seed subprocess checks first failed before the script existed, then proved create, duplicate rejection, validation, and no credential output. Actual npm invocation initially exposed npm's own argument echo in the forbidden-argument test. Ruling: valid provisioning exercises npm; positional-argument rejection exercises the CLI directly, because npm echoes arguments before the program can reject them. Runbook explicitly prohibits arguments. No production credentials were used.
- Final independent security reviewer reproduced an Important logout race: in-flight existing-token GET saved/upserted an authenticated session after logout deletion. Parent reproduced it with a deterministic gated-read Store test (replay 200 before fix). `issueCsrf` now saves only initial token/deadline creation; unchanged sessions only touch, which cannot upsert. Regression replay is 401; original CSRF tests remain green.
- Minor review finding regraded as an API contract defect: known Mongo connectivity errors returned 500. Added safe allowlisted 503 DATABASE_UNAVAILABLE mapping; regression failed 500 before fix and passed 503 afterward. No remaining review findings deferred.
- Added three failure-path tests: regeneration deletion failure, explicit session-save failure (no privileged autosave), and failed logout destruction. All return safe 503/fail closed as appropriate. No additional reviewer dispatch was needed after the single review/fix pass.
- Verification: 55 unit/HTTP tests plus 20 real Mongo integration tests; typecheck/lint/build/OpenAPI passed. Clean `npm ci` installed 306 packages, audited 307, zero vulnerabilities. Final verification repeated after clean installation; exact command outcomes in the completion report.
- Git: explicit staged diff inspection before every commit, including separate index-only hunks for dependency changes vs seed command and API inventory vs error mapping. No source edits were discarded, no history rewritten, and no remote URL/branch changed. Phase 2.1 commits remain ahead of origin/main locally, awaiting owner push approval.
