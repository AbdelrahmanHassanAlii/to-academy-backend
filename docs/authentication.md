# Administrator authentication — Phase 2.1

Backend-only milestone using the Phase 1 Mongo-backed session, CORS, CSRF and cookie configuration. No JWT, public signup, password reset, administrator list UI or other business modules.

## Model and module boundaries

`src/modules/admins/model/admin.model.ts` builds a model on the supplied Mongoose connection. Fields: name, normalized lowercase/trimmed email, passwordHash, role (`admin` only), isActive, nullable lastLoginAt, createdAt and updatedAt. Unique email index is awaited at server startup and by the seed CLI. No index/data deletion; index failure prevents HTTP startup. Existing duplicate data requires owner intervention.

passwordHash is excluded from normal queries and stripped from JSON even if explicitly selected for verification. HTTP returns an explicit allowlist: id, name, email, role, lastLoginAt. Controllers handle HTTP/session transport; services own credentials/data rules; validators parse input; utils handle bcrypt/profile/session transformations. Modules never call another controller.

## Secure CLI provisioning

Install full dependencies (`npm ci`) on a trusted provisioning machine with pinned Node; the CLI uses tsx. Set private MONGODB_URI in `.env` or process environment. Seed requires no session secret. Supply explicit ephemeral `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` through prompts/secret manager. Never use password literals in shell history, positional arguments, committed files or task output. No default credentials or public seed route.

PowerShell, from the backend directory:

```powershell
$env:SEED_ADMIN_NAME = Read-Host 'Administrator name'
$env:SEED_ADMIN_EMAIL = Read-Host 'Administrator email'
$taskSeedSecurePassword = Read-Host 'Administrator password' -AsSecureString
$taskSeedPasswordPointer = [IntPtr]::Zero
try {
  $taskSeedPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSeedSecurePassword)
  $env:SEED_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskSeedPasswordPointer)
  npm run seed:admin
  if ($LASTEXITCODE -ne 0) { throw 'Seed failed; inspect its safe error code' }
} finally {
  if ($taskSeedPasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskSeedPasswordPointer)
  }
  $taskSeedSecurePassword.Dispose()
  Remove-Item Env:SEED_ADMIN_NAME, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Success prints only `Administrator created`; no name/email/password/hash or raw DB errors. Seeds use bcrypt cost 12, role=admin, isActive=true. Name: trimmed 2..120 characters; email valid and <=254; password at least 12 characters, maximum **72 UTF-8 bytes**, no NUL, never trimmed. Use a strong unique password. The byte limit prevents silent bcrypt truncation, especially for multibyte/Arabic input. [bcrypt documentation](https://github.com/kelektiv/node.bcrypt.js) describes the byte limit and asynchronous API.

Same normalized email returns nonzero `ADMIN_EXISTS` without changing credentials; the DB unique index guards concurrent duplicates. Other safe codes: `SEED_INPUT_INVALID`, `SEED_CONFIG_INVALID`, `SEED_FAILED`, `SEED_ARGUMENTS_FORBIDDEN`. npm echoes command arguments before launching a script, so never pass a password argument even though the CLI rejects it. Remove environment inputs immediately after invocation; do not put them in the application service environment. Explicit distinct-email invocations may provision another same-role administrator under operator control. There is no HTTP account creation endpoint.

## Session flow and endpoints

1. GET `/api/v1/auth/csrf` with a configured exact Origin and `credentials:'include'`; keep token in memory. Browser owns the HttpOnly cookie.
2. POST `/auth/login` JSON `{email,password}` with credentials and `X-CSRF-Token`. Unknown fields are rejected. Email normalized; password unmodified. Invalid body is 400. Bad password, unknown email and inactive account share generic 401 `INVALID_CREDENTIALS`.
3. Successful verification updates lastLoginAt, regenerates the session, rotates CSRF and resets eight-hour absolute expiry. Store only adminId as identity plus token/expiry/cookie metadata. Session id never appears in JSON.
4. Refetch `/auth/csrf` after login for the rotated token. Old cookie cannot authorize; old token cannot mutate the new session. Repeated reads preserve expiry and do not save/upsert unchanged sessions, preventing an in-flight read from recreating a session deleted by logout. A deterministic concurrent read/logout regression verifies this behavior.
5. Each authenticated operation checks expiry, reloads current active administrator from Mongo, then checks their database role. Missing/deleted/inactive identities return 401; stale sessions are deleted and cookie cleared on encounter. Client/session-supplied roles have no authority.
6. POST `/auth/logout` with active authentication, exact Origin and current token. Delete the persisted session and expire cookie before success. Replay/current-user checks and repeated logout fail with 401. Expired sessions use the existing `SESSION_EXPIRED` response.

| Method | Path                      | Requirements                                 |
| ------ | ------------------------- | -------------------------------------------- |
| GET    | `/api/v1/auth/csrf`       | Trusted Origin; foundation                   |
| POST   | `/api/v1/auth/login`      | Origin + CSRF, JSON credentials, rate limits |
| POST   | `/api/v1/auth/logout`     | Active admin + Origin + CSRF                 |
| GET    | `/api/v1/auth/me`         | Active admin                                 |
| GET    | `/api/v1/admin/admins/me` | Active admin                                 |
| PATCH  | `/api/v1/admin/admins/me` | Active admin + Origin + CSRF; name only      |

No email/password/role/isActive self-edit. `authenticate.ts` reloads identity; `authorize.ts` checks a role allowlist separately. Empty authorization allowlist denies all, as tested, without introducing another role. All private responses are no-store.

Cookies remain host-only, Path=/, HttpOnly, SameSite=Lax, Secure in production. Localhost across ports and HTTPS toacademy.com/admin.toacademy.com/api.toacademy.com remain the approved same-site/different-origin topology. Credentialed Fetch, exact CORS allowlist, trusted Origin and CSRF apply independently. Existing proxy/ingress assumptions remain unchanged. Real TLS/browser deployment still needs acceptance testing.

Login limits: five failed attempts/15 minutes per IP and normalized account, plus 60 requests/minute/IP coarse cap. Account keys are hashed and never logged. Successful requests leave the failure budget. State is process-local and resets on restart: one API process until shared enforcement is added. Account-wide limits can temporarily block an account targeted by an attacker; no permanent lockout/recovery flow is implemented.

OpenAPI 0.2.0 documents seven paths with cookie authentication, required CSRF/Origin headers, safe profile/request schemas and errors. Swagger remains read-only. Spec cookie name matches the example `toacademy.sid`; reflect any operator customization of SESSION_COOKIE_NAME in client docs.

## Checks and limits

Run `npm test`, `npm run test:integration` with explicit dedicated TEST_MONGODB_URI, `typecheck`, `lint`, `format:check`, `build`, `api:check`. Tests use randomized disposable admin records and targeted session cleanup, never database/collection drops. Seed subprocess tests invoke the actual npm command when the suite runs through npm. No production administrator was seeded by this task.

Tests cover password byte validation/hashing, unique email/hash privacy, generic credential failures, rate limits, session persistence/regeneration/rotation, missing/expired/deleted/inactive identities, logout/replay, protected profile updates, role denial and CLI create/duplicate/input/privacy. Test fixture stores remove connection listeners between synthetic app instances; production creates one middleware/store pair.

No password reset, password rotation, MFA, role hierarchy, account UI or audit trail. lastLoginAt records successful credential verification even if a subsequent session-store operation fails. Revocation on deactivation/deletion takes effect on the next authenticated request. Phase 2.1 commits stay local pending owner push approval. See [completion report](phase-2-1-verification.md) and [execution ledger](phase-2-1-progress.md).
