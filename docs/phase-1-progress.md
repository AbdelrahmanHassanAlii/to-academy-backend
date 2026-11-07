# Phase 1 implementation ledger

Plan/spec: approved `docs/phase-0-architecture.md` Exact next steps, `docs/api-contract.md`, and owner's Phase 1 request. Executing inline with test-first behavioral checks; stop after foundation.

## Constraints and rulings

- Backend directory only; no commits, pushes, business modules, host service changes or container tooling.
- Existing documents preserved. Git ownership mismatch handled with command-scoped `-c safe.directory=...`; no global configuration changes.
- Ruling: implement in the explicitly requested backend checkout. HEAD is unborn and user prohibits commits; creating a worktree requires a base commit and conflicts with this scope. No branch or worktree operation is necessary.
- Ruling: use supplied Node 24.22.1 (patched supported LTS) and repo-local ignored npm 11.19.1 because npm is absent from PATH. No global host runtime installation.
- Ruling: implement GET /auth/csrf as foundation per approved plan, no auth business module, login or administrator model. Synthetic protected routes exist only in tests to exercise security middleware.
- Production topology: HTTPS toacademy.com / admin.toacademy.com / api.toacademy.com; host-only API cookie, SameSite=Lax. Local development uses localhost across ports, Secure=false. Origin/CSRF remain required in both.

## Execution checklist

- [x] Re-read reviewed documents; inspect baseline Git/files/runtime.
- [x] Setup dependencies/configuration and lockfile.
- [x] RED -> GREEN: environment validation and security configuration.
- [x] RED -> GREEN: app endpoints, validation, errors, CORS/rate limits/log redaction.
- [x] RED -> GREEN: real Mongo connection, readiness, session persistence, CSRF and expiry.
- [x] Production entry/shutdown, OpenAPI infrastructure and host instructions.
- [x] Run all requested checks; independent final review; record exact evidence and limitations.

## Review focus

Production secure cookie behind a trusted TLS proxy; no cookie over insecure transport; unknown/absent Origin; absolute session expiry despite store touch; failed database startup/readiness; sensitive error/log redaction; preserving reviewed files and limiting edits to backend.

Pre-flight interfaces: env feeds app/database/session; Mongo connection is shared by Mongoose and connect-mongo; readiness performs a bounded live ping and checks initialized session storage; test-only routes exercise exported CSRF middleware without shipping a dummy auth API. OpenAPI paths must match implemented runtime routes.

## Results and rulings

- Initial tests failed because implementation files did not exist; environment tests then passed 17/17, followed by foundation/CSRF checks. Initial type failures involved strict optional Pino/cookie types; fixed without weakening TypeScript settings.
- Real MongoDB was reachable at the explicit local test URI. Initial persistence test revealed connect-mongo's default string serialization; selected `stringify:false` for inspectable structured session records. Test teardown was corrected to avoid using a client deliberately disconnected by a dependency-loss test.
- Ruling: retain the driver's caught error as Error.cause for internal diagnostics to satisfy ESLint, while logging only safe error codes/messages. Raw causes never enter HTTP responses/logs.
- Session-store failure regression: injected read failure returned 500, then explicit session middleware mapping made it 503; verified RED -> GREEN.
- Dependency audit initially reported 10 moderate development-toolchain findings rooted in minimatch. Installed compatible patched minimatch 11.0.1 through an exact override; subsequent npm audit reported zero vulnerabilities.
- Final independent read-only reviewer found no Critical/Important issues and one minor unsupported charset/encoding error-mapping issue. Regraded as a contract defect worth fixing: both regression cases returned 500 before the change and 415 afterward. Full unit suite 43/43 and real Mongo integration 4/4 green after the fix. No deferred review findings.
- Manual `npm start` compiled-server smoke: health, readiness, CSRF and Swagger UI all HTTP 200. Manual `npm run dev` smoke: health and readiness both HTTP 200. Temporary processes were stopped. PTY Ctrl+C did not reach the Windows process; smoke teardown used verified process termination (one process-tree cleanup required approved escalation). Graceful drain/disconnection/idempotence are covered by executed automated tests; no claim of live Unix SIGTERM testing.
- Final typecheck, ESLint, production build, OpenAPI validation and unit/integration commands all exited 0. Formatting, clean-install/audit and final state checks are recorded in `phase-1-verification.md`.
- Ruling: user prohibits commits, so all deliverables remain uncommitted in the requested checkout. No business modules, login or frontend changes. No real production deployment/browser/DNS/TLS test is implied by middleware tests.
