# Media and GridFS

Images are stored in MongoDB using the existing Mongoose connection/client. No additional database connection, permanent filesystem storage, Base64 documents, external object store or Docker. Bucket: `academy_media`; collections `academy_media.files` and `academy_media.chunks`, 64 KiB chunks. GridFS metadata contains only mediaId and schemaVersion=1. The Media collection stores originalFilename (basename, controls removed, max 200 chars), UUID filename with server-selected extension, MIME, measured size, GridFS ObjectId, uploader administrator ObjectId, immutable visibility, state, guard and timestamps. HTTP metadata excludes GridFS internals/state/guard.

## Upload and validation

POST /api/v1/admin/media accepts multipart/form-data with exactly one `file` and optionally `visibility=public|private`, in either order. Default private. Authentication, role and Origin/CSRF validation run before multipart parsing. Limit: 30 uploads/IP/15 minutes, process-local. Streaming parser and signature/size Transform apply backpressure into GridFS; no request-body file buffer. Max 5 MiB (5,242,880 bytes), only JPEG/PNG/WebP; MIME must match magic bytes. PNG chunks/CRC/termination are validated incrementally with at most eight buffered framing bytes. JPEG requires SOI/EOI, WebP requires RIFF/WEBP and exact RIFF length. A strict Sharp decode of the bounded stored image checks pixel data before readiness; max 16 million input pixels. The decoder can buffer the bounded stored compressed image internally (up to 5 MiB), separately from upload streaming. PNG animation chunks and multiple-page images are rejected. SVG, malformed/truncated images and signature spoofing return 415; oversize returns 413. Empty/multiple/unknown/truncated multipart parts return 400. PNG/JPEG/WebP bytes are retained unchanged, including any embedded EXIF: administrators must avoid uploading images containing private metadata.

A pending Media record is created before any GridFS write. Only after complete multipart validation and decoding does it become ready. Disconnected/truncated requests and failed storage/decode remove owned chunks, files and metadata. Early source errors are observed before database awaits. Cleanup failures retain pending/deleting records for recovery instead of losing their identity. At startup reconciliation removes pending records older than 24 hours and resumes deleting records; newly active uploads are untouched. After a hard process crash, restart after the stale cutoff to reconcile pending uploads; no background scheduler is introduced. This app does not repair arbitrary manual database corruption or unknown legacy chunks.

## APIs

| Access       | Method | Path                            | Response                                              |
| ------------ | ------ | ------------------------------- | ----------------------------------------------------- |
| Admin + CSRF | POST   | /api/v1/admin/media             | 201 metadata                                          |
| Admin        | GET    | /api/v1/admin/media             | Ready metadata list; page, limit (max100), visibility |
| Admin        | GET    | /api/v1/admin/media/:id         | Metadata                                              |
| Admin        | GET    | /api/v1/admin/media/:id/content | Binary preview, including private files               |
| Admin + CSRF | DELETE | /api/v1/admin/media/:id         | Deleted id; 409 if referenced                         |
| Public       | GET    | /api/v1/media/:id               | Ready public binary only                              |

Identifiers must be 24 hex characters. Public retrieval does not create a session and returns 404 for private/pending/deleting/missing files. Responses stream with measured Content-Length, validated Content-Type, nosniff and inline generated filename. Public cache policy is `public, max-age=0, must-revalidate`, avoiding persistent immutable caching after deletion; protected previews use `private, no-store`. Range requests and image transformations are outside this MVP. Cached/copied bytes already delivered to a visitor cannot be revoked.

## Visibility and reference safety

Choose public explicitly when uploading images for published courses, lectures, articles or the academy logo. Visibility cannot be changed in this MVP: upload a replacement, update references, then delete the old image. Admin metadata URL is null for private media, otherwise /api/v1/media/:id. Private drafts may reference private images and use the admin preview endpoint. Publication revalidates existing thumbnails even if no new thumbnail is supplied. Settings logo is always public.

`src/infrastructure/storage/media-references.ts` is a leaf service shared by content modules. It verifies ready metadata, supported MIME and a backing GridFS files record, writes a guard, and saves content in one replica-set transaction. Deletion writes the same guard, checks Courses/Lectures/Articles thumbnail and Settings logo references in the transaction, and marks deleting. MongoDB write conflict/retry therefore serializes competing assignment and deletion across instances. No route/controller imports across modules.

Deletion refuses **all** references, including drafts, archived articles/courses and cancelled/completed lectures (409 MEDIA_REFERENCED). DELETE on articles/courses/lectures is a soft lifecycle operation and does not release the image. Explicitly PATCH thumbnail:null or a safe replacement in every referencing document, or PATCH settings logo:null/replacement, then retry media DELETE. There is no force-delete shortcut. GridFS binary operations are outside transactions; deletion marks metadata first, then removes chunks/file/metadata. A deleting record can be retried through DELETE; startup reconciliation also resumes it. Already completed deletion returns 404 on a subsequent request.

Production still requires Atlas or an initialized MongoDB replica set. The registration topology check is preserved; standalone MongoDB cannot satisfy registration or media-reference transaction guarantees. See [replica-set setup](mongodb-replica-set.md).
