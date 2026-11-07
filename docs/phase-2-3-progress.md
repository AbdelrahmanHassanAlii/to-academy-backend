# Phase 2.3 execution ledger

Approved Phase 2.2 published unchanged to origin/main at 3542d20f567977f1fb3d07c60a7579bf5ba72e74. Eight Conventional Commits; no remote divergence. Courses work stays local.

Sequence: validation/model → category eligibility and course services → public/admin HTTP wiring → real MongoDB lifecycle/security tests → OpenAPI/contracts and next milestone plan → complete verification and review → local commits.

Ruling: latest requested lectureCount, trainingMode (online-live/online-recorded/hybrid), localized title, and featured replace older Phase 0 field names — explicit current requirements take precedence — future clients must use the updated OpenAPI.

Ruling: preserve integer piastres; null means unannounced, free implies zero, non-free requires positive price or null — approved architecture already defines these semantics — clients must divide price by 100 for EGP display.

Ruling: retain first publishedAt as lifecycle metadata and lock slug after initial publication, including later drafts/archives — approved architecture requires stable published URLs without redirects — renaming a published URL requires a future redirect feature.

Ruling: category deletion remains soft deactivation. Public courses require an active, existing category at read time — avoids orphan public responses after deactivation — reactivation restores eligible courses automatically.

Ruling: thumbnail is a nullable ObjectId, with syntax validation only until Media exists — follows Categories and avoids implementing an excluded module — file existence must be integrated in the Media milestone.

Completed: validator tests observed failing on missing module, then13 passed. Public category slug contract test observed failing against ObjectId-only validation, corrected to the approved public slug/admin id distinction. Model/service and API integration tests exercised real MongoDB; corrected hydrated nested DTO leakage and absent minimized seo handling exposed during tests. Latest10 Courses integration tests passed, plus all33 previous integration tests.

Environment: sandbox denied loopback with EACCES and Git MSYS hook startup; reran authorized checks/commits outside that restriction with Node24.22.1 explicitly selected. Local MongoDB27017 was confirmed working. An attempted temporary ignored Mongo process was stopped; no database/service configuration changed. No application .env or owner data modified.

Final review: independent read-only review found no important runtime issues. Its PATCH-schema defaults finding was graded important because generated clients could send unwanted resets. Final: fixed CourseUpdateRequest creation defaults — HTTP OpenAPI regression test observed RED, then GREEN; full unit suite90/90 and integration43/43. No deferred minor findings.

Verified: npm test90 tests/8 files; npm run test:integration43 tests/6 files; typecheck, lint, build, format:check and api:check all passed. OpenAPI0.4.0 has16 paths/23 operations. No new dependency or environment key; npm ci not repeated because package.json and lockfile are unchanged. Local Conventional Commits validated by existing Husky hook; no Phase2.3 push.
