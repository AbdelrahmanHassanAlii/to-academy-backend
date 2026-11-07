# Phase 2.2 execution ledger

Spec: owner's approved Phase 2.2 request; existing architecture/API/session foundation preserved. Backend checkout on main only. Use test-first implementation and one independent final review; make local Conventional Commits but do not push this milestone.

## Phase 2.1 publication

Verified clean main, unchanged origin, exactly eight local commits and no credential-pattern matches or tracked secret/generated paths. Remote matched expected Phase 1 baseline. Pushed normally; GitHub main verified at `ba24e2e8349ab6860f1c51e6940336ef876e40f5`. Published history: 01137cb, d6d337a, 658630b, c25ee43, fb92f90, 5e3c60c, 34409eb, ba24e2e (messages recorded in completion report).

## Decisions and interfaces

- Configure local Commitlint/Husky before category commits. Preserve ignore-scripts policy: explicit `npm run hooks:install` after installation. No npx downloads in hooks. Actual invalid-commit rejection + valid configuration commit verify automatic behavior.
- Ruling: follow the latest explicit category contract over earlier flat-string/`hr` design. Name is `{ar,en?}`, description localized, stable seed slug `human-resources`. No existing category implementation/data migration is present.
- Model is per-connection, indexes explicitly awaited at runtime startup/seed; API identifiers use id strings, image is nullable Mongo ObjectId serialized as string. No Media implementation: image reference is syntactically validated, not dereferenced yet.
- Slugs support normalized Arabic/Latin/numbers/hyphens; explicit invalid separators/control chars rejected. Omitted creation slug derives from English name or Arabic name. Unique collisions return 409, never silently change explicit slugs.
- Public list: active only, sortOrder then _id stable ascending, page=1/limit=12/max100; admin list defaults limit20 and allows exact isActive/q filters. Strict allowlisted query keys; no arbitrary Mongo expressions.
- PATCH updates provided root fields only; provided localized name/description objects replace those objects (name requires ar). Empty PATCH rejected; image:null clears optional image. This avoids ambiguous partial translation merges.
- DELETE performs idempotent soft deactivation, returns retained admin DTO. No physical deletion, course model/queries or speculative references. References remain valid when future courses exist.
- Seed five explicit requested slugs with `$setOnInsert` only. Unique index + retryable duplicate handling guard concurrency; preserve all existing fields, deactivation, descriptions, order and identifiers. Rename of a seeded slug means the original seed slug will be recreated on rerun; document this operator behavior.
- Existing validateRequest uses one locals slot. Extend it compatibly to allow named slots for params/query/body so multiple validations cannot overwrite each other. Existing consumers/default behavior stay unchanged.

## Checklist

- [x] Verify/push Phase 2.1 before any new implementation.
- [x] Configure and verify Commitlint/Husky, commit tooling separately.
- [x] RED -> GREEN category validation/model/service and safe public/admin projections.
- [x] RED -> GREEN public/admin API integration, pagination, active visibility and soft delete.
- [x] RED -> GREEN real category seed CLI idempotence/preservation.
- [x] Extend OpenAPI/docs, independent review and fixes, full checks, local micro-commits, final remote/state verification.

## Evidence and rulings

- Installed @commitlint/cli and config-conventional21.2.4, Husky9.1.7; registry install/audit and clean npm ci reported zero vulnerabilities. Existing ignore-scripts policy retained; explicit hooks:install activates generated launchers, no network/npx call inside the hook.
- Verified valid Commitlint input passes and invalid input fails. `git hook run commit-msg` rejected invalid input, then an actual invalid git commit was rejected automatically with HEAD unchanged. Valid tooling commit1f05508 passed the same hook; all later commits also use it. No bad test commit or history rewrite occurred.
- Category validation tests first failed with missing implementation; then21 passed. New real-Mongo API tests first failed before module exports existed, then10 passed. Seed tests failed before CLI/seed method existed, then3 passed (actual npm CLI, preservation including timestamps, concurrency).
- Typecheck identified Zod optional localized fields vs strict Mongoose creation types. Ruling: construct allowlisted create fields explicitly and omit undefined localized values, rather than weakening strict TypeScript or casting the whole payload. Typecheck then passed.
- Existing request-validation/default response behavior was preserved; category routes use named params/query/body slots and pagination metadata. Existing auth/security tests retained; only OpenAPI inventory extended.
- Independent read-only reviewer found no actionable correctness/security/data-integrity/current-contract defect. Minor README statement about meta:null was updated to cover paginated lists. No deferred review finding.
- Verified76 unit/HTTP tests and33 real Mongo integration tests; clean install369 packages/audit370 with zero vulnerabilities. Full final checks repeated after clean install. No owner application DB seed or business content modification performed.
- Git staged diffs inspected before each micro-commit. Seed service hunk separated from category API service staging without discarding edits. No Phase2.2 push, branch/remote change, squash/amend or force push. Final status/history evidence is in the completion report.
