# Backend commits

Use `<type>(<scope>): <short imperative description>`. Scope is required, kebab-case, and should identify the module or concern (`categories`, `auth`, `git`, `api`). Header maximum 100 characters. Types come from @commitlint/config-conventional: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Examples: `feat(categories): add public category listing`, `fix(auth): reject expired administrator sessions`.

Keep each commit a logical change, inspect staged diffs first, keep secrets out, and preserve history. No automatic squash/amend/force push. Pushing new milestones requires owner approval. Previously published history is preserved, not rewritten to satisfy newly enabled rules.

## Install hooks

```powershell
npm ci
npm run hooks:install
git config --get core.hooksPath
```

This repository intentionally retains `ignore-scripts=true` to disable dependency lifecycle scripts. Therefore even though `prepare` is defined, **the explicit hooks:install step is required after a fresh clone/install**. It activates Husky's generated `.husky/_` launcher and local core.hooksPath; generated launchers are ignored and regenerated locally. Existing clones with hooks activated continue running commit-msg automatically. CI/production can skip hook installation; it is not a production dependency.

The commit-msg hook runs the already-installed local Commitlint CLI with Node (no npm/npx dependency, network lookup or auto-download). It receives Git's message filename as a quoted argument. Valid messages pass; invalid ones abort the commit without changing history or discarding staged work. A local Git hook is a developer check and can be bypassed deliberately; repository/server enforcement would need a separate CI policy.

Manual checks:

```powershell
'feat(categories): add category listing' | npm run commitlint
'invalid commit message' | npm run commitlint
```

The first should exit 0, the second nonzero. The implementation also verifies that an actual invalid `git commit` attempt is rejected without advancing HEAD and that the following valid configuration commit passes the hook.
