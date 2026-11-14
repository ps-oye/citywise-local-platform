# Phase 5 setup and migration effects

As of 13 November 2026 (Asia/Kolkata), the previously approved `rawatbhata-one-dev` project (`qyzcvmghhwxctwlaqhrq`) has migrations 1–7 applied. Phase 5 applied only `20261113000700_catalog.sql` after SQL, browser, build and dependency checks. No seeds were replayed and no hosted product/import test fixtures were created. The existing 33 listings, 110 products and single active administrator were preserved; import history is initially empty. A final migration dry run reports the database up to date. No website or production deployment was performed.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173/admin/`, sign in with the existing administrator email/password, and choose **Products & imports**. See [the catalog guide](catalog-guide.md). Existing public Supabase configuration and the earlier ignored server bindings remain valid. This phase needs no new credentials, public signup, Storage bucket, server endpoint or privileged browser variable. Keep the existing `.env.local` and `.dev.vars` files.

All spreadsheet parsing runs inside a same-origin module worker, loaded only with the catalog route. Install dependencies from the lockfile. The new pinned dependencies are `read-excel-file@9.3.15`, `papaparse@5.7.1`, `fflate@0.8.3` and `saxen@11.1.0`. Worker execution is covered by the existing `worker-src 'self'` CSP; no blob-worker allowance is required.

## Advance another development database

Review [migration 7](../supabase/migrations/20261113000700_catalog.sql). An existing Phase 4 project needs only this pending migration; a fresh project needs migrations 1–7 in order. Use the normal Supabase CLI authentication and explicitly select the intended development project:

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
```

Inspect the dry run before applying. Do not replay an applied migration or reseed existing catalogs. CLI 3 may label a separately named development project's default branch `production`; verify its project name/ref rather than choosing a target from that label. The current approved development ref is recorded above. Production setup/deployment remains a separate action.

For a fresh environment, provision the single administrator as described in [Phase 4 setup](phase-4-setup.md), disable public signup/anonymous sign-in, and keep `private` outside the Data API schemas. No account changes are needed in the configured development project. Enter the account password only in your own browser.

## Database changes and authorization

Migration 7 creates one private preview table, its composite job/merchant foreign key, RLS policy and timestamp trigger, one product query index, nine private helpers and 11 public admin RPCs. It reuses the existing product/import-job/error/version tables. Public admin functions are security invokers with an empty search path, explicit authenticated-only execution and the database allowlist guard. Four narrow private security-definer helpers perform guarded operational writes/locking; the other five helpers are invokers. Browser roles gain no direct private INSERT/UPDATE/DELETE grants. Existing public read predicates, product/merchant RLS and all Storage policies remain unchanged.

Live checks verified all 32 application tables have RLS, all 30 public admin RPCs are invokers without anonymous/PUBLIC execution, both media buckets remain private, and the new preview table gives authenticated users SELECT subject to the admin policy with no mutation grants. An anonymous Data API catalog call fails with SQLSTATE `42501`; public discovery still returns its 15 categories. A read-only authenticated-role transaction using the configured admin UID successfully reads catalog context, products and import history. No password was requested or used; real-password login and hosted import writes were not performed as QA.

## Destructive statements and retention

Installing migration 7 does not update or delete any listing, product, price, contact, Auth user, seed or Storage object. It contains no `DROP`, `TRUNCATE` or product/category `DELETE` operation. Its `REVOKE` statements restrict permissions only on the newly created table/functions, followed by explicit narrow grants.

The preview table's composite foreign key uses `ON DELETE CASCADE` to remove that job's private preview **if a trusted operator later deletes the parent import job**. It does not cascade into merchants or products. No job is deleted by installation or the dashboard.

After an explicit administrator confirmation, imports insert/update selected `(merchant_id, sku)` rows atomically; rows absent from the file are retained. Manual Archive performs a soft archive and disables the product; Restore keeps it inactive. Product categories are disabled instead of deleted. Private import plans, reports, errors and version metadata are retained; no scheduled retention purge or full catalog restore is installed. The existing audit triggers record public catalog mutations.

Review [Phase 5 results](phase-5-report.md) for tests, files and remaining limits. Phase 6 has not been started.
