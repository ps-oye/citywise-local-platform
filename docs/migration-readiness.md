# Initial migration readiness

This records the earlier Phase 1 review. Phases 2 and 3 added forward migrations and demo seeds to the approved development project. See [current Phase 3 setup status](phase-3-setup.md); do not replay initial migrations over an initialized schema. The Phase 3 migration preserves existing business/enquiry records, foreign keys, admin authorization and Storage policies.

The six review findings have been corrected in the original, unapplied Phase 1 migrations. The revised SQL has been executed only in disposable in-memory PostgreSQL. No remote database migration, hosted dry run, bucket change or data deletion was performed during this correction.

## Corrections

| Concern | Revised behavior |
| --- | --- |
| Core commits without RLS | All 30 application tables have RLS enabled and client privileges revoked before the first commit. Failure or delay before migration 2 leaves access closed. |
| Schema-wide table/function changes | An explicit application-table manifest scopes grants, RLS and triggers. Existing unrelated table/function grants, policies and triggers are preserved. |
| Existing schema access | A populated schema that would gain client USAGE is rejected before setup, preventing accidental exposure of unrelated objects. |
| Default function permissions | The migration owner's global PUBLIC EXECUTE default and per-schema automatic client grants are removed. Existing functions keep their permissions; future functions need explicit grants. |
| Existing broad Storage policies | Restrictive guards prevent anonymous/ordinary-user writes and unpublished/unreferenced reads in the two platform buckets, even alongside an allow-all policy. Other buckets retain their existing behavior. |
| Missing/previous media owner | The current allowlisted admin can replace/delete platform images uploaded by an old admin, Dashboard or service backend. New uploads require the current admin owner and a valid entity path. |
| Cross-merchant import references | Catalog versions use a composite foreign key requiring any linked import job to belong to the same merchant. |
| Existing incompatible bucket settings | The storage migration aborts instead of overwriting bucket visibility, size, MIME or name settings. Compatible buckets are reused unchanged. |
| Disabled Storage RLS | The storage migration aborts rather than installing ineffective policies or changing Supabase-owned RLS configuration. |

The default-function restriction applies to future functions created by the role running the migrations, across schemas. It does not remove existing function permissions or configure defaults for other creator roles. Schema CREATE remains restricted for browser roles. All policies and guards intentionally change access within the application's two reserved media buckets.

## Verification

`npm.cmd run verify` passed:

- Syntax checks for 19 JavaScript files.
- All 38 unit/integration tests, including 11 migration-safety cases.
- Production build of both frontend entry points.

The tests cover core-only access with legacy grants enabled/disabled; unrelated-object preservation; future function/table permissions; safe schema refusal; broad legacy Storage policies; unrelated bucket operations; administrator replacement; import-job merchant consistency; and bucket/RLS compatibility failures. Seed installation and cleanup still pass in isolated databases.

These tests do not verify the target project's credentials, Auth/HTTP services, Storage file-byte enforcement or Cloudflare hosting. A target project's pre-existing state can cause a deliberate compatibility error. The migrations are not a guarantee that every external service is configured.

## Apply to your intended Supabase project

Use a fresh development project. These are initial CREATE migrations, not upgrade scripts for an application whose older migrations have already run. If an old version was applied, keep its migration history and use a separately reviewed upgrade migration rather than replaying or resetting it.

The project-local CLI is version 3.x. It defaults to local operations, so specify the hosted target explicitly. Replace `YOUR_DEVELOPMENT_PROJECT_REF` below with the intended project reference. The browser publishable key does not authorize migrations.

First authenticate and inspect pending migrations:

```powershell
npx.cmd supabase login
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
```

After reviewing the target and the dry-run output, apply the pending migrations:

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
```

`--skip-vault` excludes unrelated Vault configuration changes. These commands were documented from the installed CLI's help output, not executed against a project during verification.

Alternatively, use your project's SQL editor and execute each complete file once in this order:

1. [20261112000100_core.sql](../supabase/migrations/20261112000100_core.sql)
2. [20261112000200_security.sql](../supabase/migrations/20261112000200_security.sql)
3. [20261112000300_storage.sql](../supabase/migrations/20261112000300_storage.sql)

Use one approach consistently: SQL-editor execution does not populate the CLI migration ledger. Each SQL file is transactional. Compatibility failure rolls back that file; earlier successful files remain applied and secured. Follow the ledger rather than re-running completed CREATE files.

After all three complete, apply [supabase/seed.sql](../supabase/seed.sql) to initialize Rawatbhata and the brand settings. It inserts missing baseline rows without overwriting existing rows. The fictional demo seed is separate and optional.

Provision the single Auth administrator using [admin-guide.md](admin-guide.md), disable public signup/anonymous sign-in in the hosted project, and check the public frontend connection. CLI or SQL-editor operations require trusted project access; keep account tokens and database credentials out of VITE_ variables.

## Data and compatibility behavior

The three migrations contain no DROP, TRUNCATE, direct DELETE, or overwrite of existing bucket metadata. They create application schema objects and missing buckets, install policies/triggers, restrict schema CREATE, and adjust future default privileges. Cascading foreign keys only delete dependent rows when a parent is deliberately deleted later.

If setup reports a populated-schema, existing-object, incompatible-bucket or disabled-Storage-RLS error, review the named object in the intended project. Do not delete data, disable RLS or reset a database to bypass it. The migration deliberately leaves conflicting existing configuration intact.

[remove-demo.sql](../supabase/seeds/remove-demo.sql) is a separate destructive cleanup script. It is not part of migration execution or the baseline seed.

## Files changed by this correction

- All three SQL files in `supabase/migrations/`.
- `tests/helpers/database.js` and the existing `tests/integration/database.test.js`.
- New `tests/integration/migration-safety.test.js`.
- `README.md`, `docs/security.md`, `docs/database-schema.md`, `docs/admin-guide.md`, `docs/deployment-guide.md` and `docs/phase-1-report.md`.
- This readiness guide.

The correction stays within Phase 1. Phase 2 remains the next product-development phase.
