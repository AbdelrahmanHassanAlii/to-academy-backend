# TO Academy backend

Phase 2.1: Express/TypeScript foundation plus administrator authentication, protected profile access and secure CLI provisioning. Three repositories remain independent; this project runs directly on the host. See the [authentication and seed runbook](docs/authentication.md).

## Requirements and installation

- **Node.js 24.22.1 LTS**, pinned in `.nvmrc`; use a version manager or official host installer. Engine range requires at least this patched release on Node 24. The implementation was verified on 24.22.1. Recheck security patches before deployment.
- **npm 11**, pinned tool version 11.19.1 in `packageManager`.
- Local MongoDB 7+ or a reachable Atlas database. The installed local MongoDB 7.0 instance was verified during Phase 1; an executable alone is insufficient.

From this repository, using PowerShell:

```powershell
node --version
npm --version
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated random value into `SESSION_SECRET` in your local `.env`. Do not commit it. `Copy-Item` is only for initial setup; preserve any existing `.env`. The application does not create credentials or silently substitute a secret.

The restricted implementation session had no npm executable on PATH, so an ignored `.tools/package/bin/npm-cli.js` was used via `node .tools/package/bin/npm-cli.js <command>` with npm 11.19.1. This is a session-local tooling workaround, not an application dependency; normal developer machines use `npm`. No global runtime installation or PATH settings were changed persistently.

`.npmrc` enforces engines, exact dependency versions, and disables dependency lifecycle scripts. Current dependencies work without install scripts; platform-specific esbuild is installed as its optional package. This also prevents Swagger's transitive optional reporting script from executing. If future packages require native build scripts, review that change explicitly. `minimatch` is overridden to 11.0.1 to address the ESLint toolchain's globparts amplification advisory; remove the override when upstream compatible ranges include the fix. No production dependency vulnerabilities were reported by the final audit.

## Environment

Node loads `.env` for dev/start/database-check/integration commands. OS environment takes precedence. Required settings are validated at startup; errors name invalid keys without printing values.

| Variable              | Development example / requirement                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`, `test` or `production`; explicit                                                       |
| `PORT`                | `4000`; integer 1..65535                                                                              |
| `MONGODB_URI`         | `mongodb://127.0.0.1:27017/to_academy` or private Atlas URI                                           |
| `SESSION_SECRET`      | Required high-entropy random secret; example generation above; never shared with browser              |
| `SESSION_COOKIE_NAME` | `toacademy.sid`; token-safe name                                                                      |
| `PUBLIC_APP_URL`      | Exact origin `http://localhost:5173`                                                                  |
| `ADMIN_APP_URL`       | Exact origin `http://localhost:5174`                                                                  |
| `ALLOWED_ORIGINS`     | Comma-separated exact origins, including both apps; no paths, trailing slash, wildcard or credentials |
| `TRUST_PROXY_HOPS`    | Explicit `0` direct local server; bounded verified hop count 0..5 in deployment                       |
| `TEST_MONGODB_URI`    | Integration tests only, dedicated `to_academy_test` or `to_academy_test_<suffix>` database            |

Secret length/character checks reject obvious placeholders, but cannot prove entropy; use a cryptographic generator. Eight-hour absolute session lifetime, 100 KiB JSON limit and 60 CSRF requests/minute/IP are code constants. No additional configuration knobs without a need. Never put Mongo/session secrets into frontend `VITE_` values.

Production origin configuration:

```dotenv
NODE_ENV=production
PORT=4000
PUBLIC_APP_URL=https://toacademy.com
ADMIN_APP_URL=https://admin.toacademy.com
ALLOWED_ORIGINS=https://toacademy.com,https://admin.toacademy.com
SESSION_COOKIE_NAME=toacademy.sid
TRUST_PROXY_HOPS=1
```

Set MongoDB URI and a generated secret through the host's private environment manager. `TRUST_PROXY_HOPS=1` is appropriate **only** for a single verified TLS-terminating proxy with direct backend ingress restricted to that proxy. The proxy must replace untrusted forwarded headers. If there are variable-length paths, configure an explicit trusted proxy network strategy before deployment instead of increasing the number blindly. Application HTTPS origin validation does not configure TLS itself.

## MongoDB directly on the host

For an existing Windows service, inspect/start it from a suitably privileged terminal when needed:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

If MongoDB is installed without a service, create a data directory you own, then run its host executable in another terminal:

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA/TOAcademy/mongodb"
& 'C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe' --dbpath "$env:LOCALAPPDATA/TOAcademy/mongodb" --bind_ip 127.0.0.1 --port 27017
```

Do not start a second process if port 27017 is already occupied. Local MongoDB should bind to loopback. Enable appropriate database authentication and private network restrictions for production.

For Atlas: create the database/user, grant the application read/write and index-creation access only to its database, allow the actual backend IP in Atlas Network Access, and put the SRV URI in private `MONGODB_URI`. Encode password URI characters. Use TLS defaults; do not disable certificate validation. A separate test DB/user is strongly preferred for integration checks.

```powershell
npm run db:check
```

This opens a real Mongoose connection, issues MongoDB `ping`, and closes it. Success does not write business data. A connection failure is classified as `DATABASE_UNREACHABLE` (server selection/connectivity) or `DATABASE_CONNECTION_FAILED`; logs omit URI/credentials. For unreachable local MongoDB, check service, loopback bind, port and firewall. For Atlas, check IP access list, SRV/DNS resolution, user credentials and database permissions. Driver timeouts bound startup: 5 seconds for selection/connect and 2 seconds for the ping. Sessions additionally need read/write plus TTL-index privileges; startup awaits `sessions.expires` TTL index creation before opening HTTP. No database drop or index removal command is implemented.

## Run and commands

`npm run seed:admin` provisions an administrator using ephemeral SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD inputs; see the [secure prompt-based instructions](docs/authentication.md#secure-cli-provisioning). It refuses duplicate email and prints no credentials. Provisioning needs full dependencies because the CLI uses tsx; the production API runtime does not.

```powershell
npm run dev
# Production:
npm run build
npm start
```

| Script                    | Purpose                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `dev`                     | Load local env, TypeScript watch with tsx                                                 |
| `build`                   | Compile source to `dist/`, preserving strict checks                                       |
| `start`                   | Run compiled `dist/server.js` with optional local env                                     |
| `typecheck`               | Check source, tests, scripts and Vitest config                                            |
| `lint`                    | ESLint, zero warnings allowed                                                             |
| `format` / `format:check` | Format/check authored code/config/new docs; reviewed Phase 0 documents excluded           |
| `test`                    | Unit + HTTP middleware tests; no MongoDB required                                         |
| `test:integration`        | Real database/session/runtime tests; requires TEST_MONGODB_URI, fails if missing/unusable |
| `db:check`                | Real database connect/ping/disconnect                                                     |
| `api:check`               | Validate OpenAPI schema/references                                                        |

Deploy `dist/`, `docs/openapi.yaml`, `package.json` and `package-lock.json`, install production dependencies with `npm ci --omit=dev` on the pinned Node runtime, and set the environment. Swagger UI uses files from runtime dependencies. Do not omit `docs/openapi.yaml` from a deployment bundle. The server waits for database/session-store readiness before listening. A host supervisor should restart on failure and send SIGTERM (Unix) or a supported graceful stop signal; Windows local development uses Ctrl+C. Shutdown stops readiness, drains HTTP for up to 10 seconds, closes active requests at the deadline, then closes the shared Mongo client. A 12-second process deadline bounds shutdown hangs. Startup failure exits nonzero.

## Implemented API

Authentication adds `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, and protected `GET/PATCH /api/v1/admin/admins/me` (name updates only). See the [complete session flow](docs/authentication.md). Infrastructure endpoints remain:

| Endpoint                   | Result                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/v1/health`       | 200 process liveness; no DB dependency or cookie creation                               |
| `GET /api/v1/ready`        | 200 after live Mongo ping/session read access; 503 if dependencies unavailable/shutdown |
| `GET /api/v1/auth/csrf`    | Trusted Origin required; session-bound token + cookie, no-store, rate limited           |
| `GET /api/v1/openapi.json` | Authoritative implemented OpenAPI document                                              |
| `GET /api/v1/docs/`        | Swagger UI (read-only)                                                                  |

All API JSON successes: `{success:true,message,data,meta:null}`; errors: `{success:false,message,code,errors:[]}`. Raw OpenAPI JSON/Swagger assets are documentation exceptions. Unknown endpoints return JSON 404, including future business endpoints. OpenAPI paths cover implemented operations only; infrastructure documentation endpoints need no recursive self-description. Health responses are minimal and no-store. Readiness checks dependency access, not business migrations/fixtures that do not exist yet.

Manual checks:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
Invoke-RestMethod http://localhost:4000/api/v1/ready
Invoke-RestMethod http://localhost:4000/api/v1/auth/csrf -Headers @{ Origin='http://localhost:5174' } -SessionVariable browserSession
```

## Security and session architecture

Helmet, explicit credentialed CORS, 100 KiB JSON limit, structured Pino request logs, generated request ids, centralized safe errors, Zod validation and reusable IP rate limiting are installed. Logs include method/path (without query), request id/status/latency; headers, cookies, body/PII, tokens, raw errors and Mongo URI are excluded. No logger serializes raw startup errors. Validation provides parsed body/query/params in `res.locals.validated`; services/controllers in later phases must consume validated data. Rate limiting uses process-local memory: suitable for the initial one-process API only, resets on restart, and must use shared enforcement before scaling instances. CSRF issuance and login are rate limited; registration policies belong to the later registration module.

Session behavior:

- express-session + connect-mongo shares the already-connected Mongoose client. No runtime MemoryStore fallback. Session storage uses `sessions`, with an awaited TTL expiry index. MongoDB is the single connection owner; do not call `store.close()` independently while the application uses the client.
- Cookies are HttpOnly, host-only (no Domain), Path=/, SameSite=Lax; Secure is **true in production** and false for local HTTP. `saveUninitialized=false`, `resave=false`, `rolling=false`. Public health/docs do not load/create sessions. Session payload contains adminId after login, CSRF token, absolute expiry and cookie metadata; roles are read from MongoDB, never trusted from session/client input.
- First token issuance sets a random 32-byte hex synchronizer token and eight-hour deadline. Expiry is checked server-side independently of delayed TTL cleanup; expired sessions are destroyed and cookies cleared. Repeated token reads preserve the logical deadline. Login regenerates the session, rotates the CSRF token and resets the absolute lifetime; clients refetch /auth/csrf afterward. Logout destroys the stored session and clears its cookie.
- `GET /auth/csrf` requires exact configured Origin; returns token in JSON with no-store. A browser must use `credentials: 'include'`, keep token in memory, and later send `X-CSRF-Token` on session/admin writes. Exported `requireCsrf` checks Origin and session-bound token using timing-safe comparison. Login, logout and protected name updates use the CSRF guard; synthetic test-only probe routes are never mounted by the runtime.
- Missing Origin is permitted on public health/docs for operations clients. Session issuance and guarded writes reject missing/untrusted Origin. No Referer fallback is needed for these Fetch clients. No wildcard credentials, localStorage session ids, JWTs or frontend secrets.

Both deployment configurations were tested at HTTP/middleware level: localhost ports 5174 -> 4000 (same-site, different origin) and HTTPS admin.toacademy.com -> api.toacademy.com (same-site, different origin). SameSite=Lax supports the intended topology; requests still need `credentials: 'include'`. The API's host-only cookie is sent only to the API, which is sufficient. Secure cookies are emitted behind a declared TLS proxy and withheld on untrusted/insecure transport. CORS rejects lookalike subdomains. These are server-side tests, not a real DNS/TLS deployment or cross-browser acceptance run. Unrelated platform domains are outside the approved same-site topology; do not silently use SameSite=None.

## Tests and checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27017/to_academy_test'
npm run test:integration
npm run api:check
npm run build
npm run db:check
```

Use a dedicated test database, never the application DB. Integration checks fail closed unless its URI names `to_academy_test` or `to_academy_test_<suffix>`; they do not drop databases/collections and delete only session records they create. An explicit test URI is mandatory; absence is a failed setup, not a silent skip. Missing MongoDB is an environment blocker, not a passing integration suite. Unit tests use MemoryStore only in test fixtures to verify middleware policy; persistence tests use real connect-mongo.

See [Phase 2.1 report](docs/phase-2-1-verification.md) and [authentication runbook](docs/authentication.md) for current endpoints, seed instructions and security behavior. The [Phase 1 report](docs/phase-1-verification.md) and approved Phase 0 documents remain historical records: [architecture](docs/phase-0-architecture.md), [audit](docs/repository-audit.md), [API plan](docs/api-contract.md). Phase 1 was published in nine commits; Phase 2.1 remains local pending push approval. Frontend repositories remain untouched.
