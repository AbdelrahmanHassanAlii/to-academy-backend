# Categories — Phase 2.2

Categories is the only business module added in this milestone. It uses the established per-connection Mongoose model, services, controllers, routes, validators and module utilities, with the exact requested folder/barrel structure. No Courses or Media module is implemented.

## Data contract

```json
{
  "name": { "ar": "الموارد البشرية", "en": "Human Resources" },
  "slug": "human-resources",
  "description": { "ar": "وصف التصنيف" },
  "image": null,
  "isActive": true,
  "sortOrder": 0
}
```

Arabic name is required (trimmed 1..120 characters), English optional. Description is an optional localized object; each string max4000. Image is a nullable ObjectId reference, serialized as a string, following the backend's Mongo reference convention. Only its syntax is checked until Media exists; no URL input, file upload or GridFS lookup was introduced. Default active=true, sortOrder=0 (integer 0..1,000,000), description={}, image=null; normal timestamps. API uses `id`, never `_id`/`__v` or embedded locale subdocument ids.

The latest approved phase request intentionally supersedes the initial flat-string category shape and original `hr` seed slug. This milestone uses localized objects and `human-resources`. No previous Categories implementation or category migration is being replaced.

Slugs: Unicode NFKC, lowercase, whitespace/underscores/repeated hyphens collapsed to hyphens; surrounding hyphens removed. Arabic/Latin letters, numbers and combining marks are allowed, with no separators, URL query syntax, control characters or arbitrary punctuation. Length1..120. Explicit slug collisions return409 CATEGORY_SLUG_EXISTS. If slug is absent on creation it derives from English name if present, otherwise Arabic; supply an explicit valid slug if punctuation in the name prevents valid derivation. Name edits do not implicitly rename existing slugs.

Indexes are awaited at server startup and by the CLI: unique `{slug:1}`, `{isActive:1,sortOrder:1,_id:1}` for public/filter sorting, and `{sortOrder:1,_id:1}` for unfiltered admin sorting. No index drop or `syncIndexes`. A duplicate-index startup failure requires owner intervention; it never discards data. DB unique errors, including concurrent conflicts, map to safe409 rather than raw Mongo errors.

## Public API

- `GET /api/v1/categories`: active only, ascending sortOrder with id tie-break; page=1, limit=12 (max100); optional q literal case-insensitive search in Arabic/English names and slug. Returns `{success,message,data:[...],meta:{page,limit,total,totalPages}}`. Empty lists return200 with totalPages0.
- `GET /api/v1/categories/:slug`: active category or404 CATEGORY_NOT_FOUND. Inactive and unknown records are indistinguishable.

Public projection: id/name/slug/description/image/sortOrder only. No isActive/timestamps/internal fields. Public routes run before session middleware and do not create sessions. No inactive filter or arbitrary sort/Mongo query fields are accepted.

## Administrator API

All paths require live administrator authentication and role authorization from MongoDB. Every write also requires exact trusted Origin and X-CSRF-Token from the existing session foundation.

| Method | Path                           | Behavior                                                                                |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| GET    | `/api/v1/admin/categories`     | Paginated all states; default limit20, optional exact isActive=true/false and literal q |
| GET    | `/api/v1/admin/categories/:id` | Read full safe admin record, including inactive                                         |
| POST   | `/api/v1/admin/categories`     | Create; required localized name; remaining fields optional;201                          |
| PATCH  | `/api/v1/admin/categories/:id` | Update supplied fields; activate/deactivate/change order;200                            |
| DELETE | `/api/v1/admin/categories/:id` | Soft-deactivate, retain record/id;200 with isActive=false                               |

Admin output adds isActive, createdAt and updatedAt. Params/body/query are separately validated into named locals so the validated body cannot overwrite the id. Empty PATCH and unknown fields rejected. Provided name/description objects replace the whole localized object; omitted root fields are preserved. Name still requires Arabic when replaced; image:null clears its reference. DELETE is idempotent for an existing record and never physically deletes: existing and future course references remain valid. Use PATCH isActive=true to restore visibility. No course model, reference lookup or orphan-cleanup code is added.

Validation errors are400; missing valid id is404; slug conflict409; unauthenticated401; CSRF/origin/permission failures403. Existing centralized413/415/500/503 errors apply. Pagination requires positive integers within page<=100000 and limit<=100; q is trimmed 1..100 chars. Searches escape regex metacharacters; operator objects/duplicate parameters/unknown query keys are not passed into Mongo filters.

## Idempotent seed

```powershell
npm ci
npm run hooks:install
# Set MONGODB_URI privately in .env or process environment.
npm run seed:categories
```

The operator command uses tsx, so provision from a trusted checkout with full dependencies. No positional arguments, hardcoded credentials, session secret or administrator password required. It prints counts only and uses safe error codes. Runtime startup creates indexes, but does not automatically seed data. This task tests against isolated test databases; it does not populate the owner's application database automatically.

| Slug                   | Arabic             | English                | Initial order |
| ---------------------- | ------------------ | ---------------------- | ------------- |
| human-resources        | الموارد البشرية    | Human Resources        | 0             |
| marketing              | التسويق            | Marketing              | 1             |
| job-market-preparation | التأهيل لسوق العمل | Job Market Preparation | 2             |
| programming            | البرمجة            | Programming            | 3             |
| english                | اللغة الإنجليزية   | English                | 4             |

Each upsert uses stable unique slug and `$setOnInsert` only, with automatic update timestamps disabled for that operation. Existing names, translations, descriptions, images, active state, sort order, ids and timestamps remain unchanged. Repeated run:0 created/5 existing. Same-slug duplicate races are handled without swallowing unrelated errors. If an operator renames a seeded slug, the original slug will be recreated on the next seed; it is a seed-key contract, not an automatic rename/migration mechanism.

No environment variables changed. TEST_MONGODB_URI remains explicitly required for integration checks. Category seed tests use a random dedicated test database suffix and remove only known seeded records, never dropping databases/collections. Run `npm test`, `npm run test:integration`, `typecheck`, `lint`, `format:check`, `build`, `api:check`. OpenAPI0.3.0 documents eleven paths/fifteen operations, including pagination/localized DTOs, writes/CSRF and soft-delete behavior.

See [commit convention and hooks](contributing.md), [phase ledger](phase-2-2-progress.md), and [completion report](phase-2-2-verification.md). Phase 2.2 commits remain local pending owner approval. Courses is the next separately approved milestone.
