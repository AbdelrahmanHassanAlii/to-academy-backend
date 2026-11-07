# Courses — Phase 2.3

Backend-only Courses management. Uses the existing session, CSRF, active administrator authorization, validation, error and pagination infrastructure. No frontend, payments, registrations or media storage added.

## Module and database

```text
src/modules/courses/
  model/{course.model.ts,index.ts}
  routes/{course.routes.ts,index.ts}
  controller/{course.controller.ts,index.ts}
  service/{course.service.ts,index.ts}
  validators/{course.validator.ts,index.ts}
  utils/{course.utils.ts,index.ts}
  index.ts
```

Models define schema and local invariants. Services enforce pricing, references, publication and slug rules; controllers only read validated inputs and return envelopes. Routes compose existing middleware. CategoryService exposes projected category reference reads; no reverse dependency from Categories to Courses and no controller-to-controller coupling.

Fields: localized title, shortDescription and description; slug; required category ObjectId; nullable thumbnail ObjectId; curriculum `[{title:string,topics:string[]}]`; lectureCount; duration display string; targetAudience string array; trainingMode (`online-live|online-recorded|hybrid`); nullable price; currency EGP; isFree; status (`draft|published|archived`); featured; localized seo.title/seo.description; nullable server-owned publishedAt; createdAt/updatedAt. API uses id and ISO UTC dates, excluding Mongo internals. Plain text only; clients must escape content rather than inject HTML. Thumbnail references are validated against ready Media and backing GridFS files; published courses require public visibility. References are saved transactionally with a media guard. See [Media](media.md).

Arabic is required for each supplied localized content object; English optional. Title required 1..200; summary max600; description max30000. Curriculum max100 units, max50 topics/unit; topic max500 characters. lectureCount integer0..10000; duration max120; max50 audience entries of max300. Empty optional editorial fields are represented by omitted input (null in draft output); seo may be {}. Body limit remains100KiB, so excessively large combinations return413 even if individual field limits pass. Defaults: draft, non-free, price=null, currency=EGP, featured=false, lectureCount=0, empty arrays/seo, nullable thumbnail/duration/trainingMode/descriptions/publishedAt.

Indexes, explicitly awaited during startup without dropping existing indexes:

- unique `{slug:1}`;
- `{status:1,createdAt:-1,_id:-1}`;
- `{category:1,status:1,createdAt:-1,_id:-1}`;
- `{status:1,featured:1,createdAt:-1,_id:-1}`;
- `{createdAt:-1,_id:-1}` for unfiltered administrator lists.

Search is bounded, escaped literal matching in Arabic/English titles. It is not full-text search. Date sorts use indexes in either direction; Arabic title sort uses MongoDB binary ordering and may sort in memory for the small MVP catalog. No search service or language collation assumption.

## Pricing and publication

Price is an integer number of **piastres**; 150000 means EGP1500. Clients format price/100 with Intl.NumberFormat. null means no announced price/inquire; there is no separate hidden amount to leak. No payments or checkout.

- Non-free accepts positive price or null; zero/negative/fractional values are rejected.
- Free requires zero. Setting isFree=true with price omitted normalizes price to zero; explicit inconsistent price is rejected. Switching back to non-free requires positive price or null in the same update.
- Drafts require title and an existing category; inactive categories are permitted for preparation. Publishing additionally requires Arabic summary/description, duration and trainingMode, and an active existing category. No extra requirement for an announced price, curriculum, thumbnail or audience.
- PublishedAt is set on first publication and retained through drafts/archives. Clients cannot set it. DELETE archives, never physically deletes; repeat archive returns200. Existing future registration references remain intact. Archive works even with a category removed outside supported APIs.
- Categories DELETE remains soft deactivation. Public listing/detail excludes courses with inactive/missing categories, including previously published courses. Reactivation restores eligible published courses. Ordinary edits must retain an existing category; assign a valid category to repair an externally orphaned course.

Cross-document category checks are application checks, not foreign keys/transactions. Concurrent category changes can occur after a check; subsequent public reads enforce current eligibility. This follows the approved single-admin MVP tradeoff; revisit stronger consistency if concurrency expands. No supported API physically deletes categories or courses.

## Slugs and PATCH semantics

NFKC, lowercase, collapsed spaces/underscores/hyphens; Arabic/Latin Unicode letters/numbers/combining marks allowed. Max120; URL separators, control characters and query syntax rejected. featured is reserved for its dedicated route.

Creation without slug derives from English title if present, otherwise Arabic, removes punctuation and allocates deterministic -2/-3 suffixes on collisions (bounded100 attempts). Explicit duplicate slugs return409 COURSE_SLUG_EXISTS; database unique index also guards concurrent requests. Supply a valid explicit slug if no usable title-derived slug exists.

Title edits never rename URLs. Explicit slug changes are allowed **before first publication only**; subsequent changes return409 COURSE_SLUG_LOCKED, including after unpublishing or archiving. This preserves the approved stable-URL rule without implementing redirect history. First publication metadata makes the restriction persist across lifecycle transitions.

PATCH preserves omitted root fields; supplied locale objects, arrays and seo replace that root field. Supplied title/summary/description always require ar, so English-only patches cannot erase Arabic accidentally. price:null clears an announced amount; thumbnail:null clears a reference. Descriptions/duration/trainingMode cannot be explicitly cleared to null through PATCH; drafts can omit them initially. Mongoose optimistic concurrency prevents overlapping PATCH requests from silently losing updates (409 COURSE_CHANGED); archive increments the version too. Reload and retry after conflict.

## HTTP contract

All paths prefixed `/api/v1`. Standard success envelope `{success:true,message,data,meta}`; errors `{success:false,message,code,errors:[]}`. Singular meta=null; list meta={page,limit,total,totalPages}. Empty result totalPages=0.

| Method | Path               | Behavior                                  |
| ------ | ------------------ | ----------------------------------------- |
| GET    | /courses           | Published cards with active category      |
| GET    | /courses/featured  | Same, always featured=true                |
| GET    | /courses/:slug     | Published detail or indistinguishable404  |
| GET    | /admin/courses     | All statuses or filtered editable records |
| GET    | /admin/courses/:id | Editable detail                           |
| POST   | /admin/courses     | Create;201                                |
| PATCH  | /admin/courses/:id | Partial edit/publication;200              |
| DELETE | /admin/courses/:id | Archive retained record;200               |

Public query: page(default1,max100000), limit(default12,max100), category **slug**, q(trimmed1..100), featured(exact true/false), sort(newest/oldest/title;default newest). Admin defaults limit20, category **ObjectId**, adds status. Unknown queries and malformed ids fail400. Category assignment in bodies always uses ObjectId. Featured endpoint forces true regardless of featured query. Stable id tie-break on all sorts. Missing/inactive public category filter returns an empty list.

Public cards project only id/title/slug/shortDescription/category{id,name,slug}/thumbnail/duration/price/currency/isFree/featured. Detail adds description/curriculum/lectureCount/targetAudience/trainingMode/seo/createdAt/updatedAt. No status/publishedAt/internal fields. Admin category is an editable id, and includes lifecycle metadata. Public GETs run before sessions; no cookie or session is created. Public projections and pagination avoid loading full course content for cards. Category reference reads are batched once per list, avoiding per-course lookups; fetching all active category references without a filter is appropriate for this small taxonomy and can be revisited if it grows materially.

Admin routes require live active administrator + admin role; writes require trusted Origin and current session X-CSRF-Token. No new authentication mechanism, secrets or environment keys. Private responses use the existing no-store middleware. OpenAPI0.4.0 at `/api/v1/openapi.json`, Swagger `/api/v1/docs/`, YAML source in docs/openapi.yaml.

After publishing/unpublishing/editing public content, rebuild and redeploy the future public prerendered site and invalidate caches. MongoDB mutations do not update a static site automatically. Locked slugs avoid redirects but do not remove this rebuild requirement.

## Running checks

Use pinned Node and npm as in README. No new dependencies or install step beyond existing npm ci. No Courses seed or migration is needed: no earlier Courses collection is replaced. Dedicated real test database only:

```powershell
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/to_academy_test'
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run api:check
```

Tests create randomized fixtures and clean owned records only, never drop a database/collection. Unit validators cover malformed data/pricing/filters; real MongoDB tests cover index uniqueness, slug generation, publication, category changes, safe projections, pricing, filtering/pagination, CSRF, authentication and archive. Existing auth/session tests remain unchanged.
