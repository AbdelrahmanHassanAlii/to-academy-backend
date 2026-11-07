# Phase 2.5 implementation plan

Spec: owner's 2026-11-08 request, Articles, Settings and Media. Execution is authorized in the existing backend checkout; no additional approval gates, frontend edits or Phase 2.5 push.

## Design decisions

- Use the existing Mongoose connection/client and the `academy_media` GridFS bucket. Stream multipart bytes through a bounded signature/size validator to GridFS; independently decode the stored image before making its metadata ready. Restrict decoding to 16 million pixels and one frame. JPEG, PNG and WebP only, 5 MiB maximum. No permanent disk storage.
- Upload visibility is an explicit multipart field (`private` by default, `public` for website content). Visibility is immutable for this MVP; upload a replacement to change it. Admin metadata/detail and a protected `/admin/media/:id/content` preview route are separate from public binary retrieval.
- Track pending/ready/deleting uploads in `Media`. Pending metadata precedes streaming so stale uploads/chunks can be reconciled after process failure. Cleanup is retryable. Public DTOs never include internal bucket information or uploader identity.
- A shared service-level media reference coordinator uses transactions and writes a media guard/version before saving content. Deletion writes the same guard, checks references in all four collections, and marks deleting before removing GridFS bytes. Concurrent assignments and deletion therefore serialize across app instances. Protect draft and archived references too. No controller/route dependencies.
- Articles use Arabic-required/English-optional localized fields, unique stable slugs, sanitized allowlisted HTML, author display name, draft/published/archived, featured, SEO and first publication timestamp. DELETE archives. Sanitization applies on writes and DTO reads; no embedded images/iframes/styles/scripts.
- Settings use a fixed string `_id=academy`, safe defaults and atomic upsert with duplicate-key retry. All accepted fields are public academy information; DTOs explicitly whitelist fields. No private integration credentials are accepted.

## Tasks and verification

- [x] Media tests first: signatures/limits, multipart validation, privacy, auth/CSRF, GridFS streaming and failure cleanup. Implement model, validation utilities, service, controller and routes. Run unit/type checks and real MongoDB tests; commit a verified media unit.
- [x] Articles tests first: lifecycle, sanitization, slug conflicts, featured/search/pagination and access. Implement six module layers using media reference coordination; run relevant tests and commit.
- [x] Settings tests first: defaults, simultaneous singleton upserts, public filtering, contacts/URLs/logo and access. Implement six layers, run tests and commit.
- [x] Integrate course/lecture create/update with transactional media checks and add deletion race/reference regression tests. Preserve registration concurrency and replica-set startup checks. Commit after verification.
- [x] Wire runtime/app routes using the existing connection; document schemas, all operations, CSRF and multipart contracts. Validate OpenAPI and HTTP examples.
- [x] Run full unit, real replica-set integration/GridFS/registration suites, typecheck, lint, format check, build and strict Commitlint. Review complete diff, record actual results, create final local documentation commit and verify clean ahead/behind state. Stop for owner review.

## Review focus

Interrupted multipart bodies and extra fields must clean files; process crashes must leave recoverable pending records. Private media must never be publicly downloadable. Deletion/reference races must fail safely, including publication of an existing draft. Singleton initialization must withstand simultaneous first writes. Sanitization must exclude dangerous URL schemes, SVG, attributes and malformed HTML. GridFS does not participate in transactions: only metadata/reference changes do; binary deletion is a retryable second step.
