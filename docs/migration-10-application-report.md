# Migration 10 application — 17 November 2026

Applied `20261116001000_delivery_tracking.sql` to the existing Supabase project **qyzcvmghhwxctwlaqhrq**, following the user's explicit instruction to apply migration 10. The legacy project name `rawatbhata-one-dev` is unchanged; this remains the single hosted database. Verification completed at **2026-11-17 05:11 UTC**.

The remote ledger contained migrations 1–9. A fresh dry run listed **only migration 10**, with no seed or custom-role operations. Application used the normal migration ledger through `supabase db push --remote=qyzcvmghhwxctwlaqhrq --skip-vault --yes`. No seeds, resets, custom roles or vault updates were included. Applied SQL files and existing seeds were not edited. No application credentials, Auth settings, Cloudflare/DNS settings, Git push or deployment were changed by this operation.

## Backup and restore verification

Verified backup directory, outside the repository:

`D:\Prashant\ShaharOne-backups\qyzcvmghhwxctwlaqhrq-before-m10-20261117-103642`

Windows access is restricted to the current operator, SYSTEM and Administrators. This directory contains sensitive Auth/private operational data and configuration; do not commit, upload publicly or share it.

- `database-before-m10.dump`: **699,011 bytes**, native PostgreSQL custom-format archive covering `public`, `private`, `auth`, `storage` and `supabase_migrations`.
- `backup-manifest.json`: archive/migration SHA-256 values and successful restore checks. The reviewed migration SHA-256 was `4688a0e62b0d8e801cfbec49411e13ff16bcc69a67bd079aba35e578318cadc7`; the apply helper verified it and the backup immediately before application.
- Before/restore/after state snapshots include table counts, core-record checksums, foreign keys, policies, RLS, bucket configuration and existing identities. Runtime configuration and the reviewed forward/rollback SQL are retained privately.
- Storage object inventory was **zero**. Storage metadata/buckets were backed up; no hosted object bytes existed to download. Repository-owned demonstration images remain unchanged.
- The archive was actually restored into a separate loopback-only local PostgreSQL 18 instance, using a temporary private password. Counts across all selected tables, core-record checksums, foreign keys, policies and RLS matched. Timestamp comparisons were normalized to UTC. The local restore server was stopped and its temporary password file removed afterward.

This verifies the selected database schemas/data archive. Provider-managed account settings, external credentials and application deployment are separate from a database restore; do not restore an old archive over newer live data to roll back application behavior.

## Before/after checks

| Record/configuration | Before | After |
| --- | ---: | ---: |
| Listings | 33 | 33 |
| Products | 110 | 110 |
| Categories | 15 | 15 |
| Auth users | 1 | 1 |
| Active administrator | 1 | 1 |
| Checkout initiations / items | 0 / 0 | 0 / 0 |
| Analytics events | 37 | 37 |
| Application tables with RLS | 33 | 33 |
| Private media buckets | 2 | 2 |
| Guarded admin RPCs | 31 | 35 |
| Applied migration ledger rows | 9 | 10 |

Checksums for listings, products, existing checkout records/items, admin allowlist and storage objects matched. Auth identities, all existing foreign keys, RLS settings, public/private/Storage policies and bucket configuration matched. Category changes were limited to the approved `food_catalog` addition/defaults, `food`/`sweets` flags and normal timestamps; category identities/content/assignments were retained. The only table-count change was the single migration-ledger row.

New indexes/columns and SO/RB reference validation are installed. The new functions retain invoker security and empty search paths. Admin RPCs deny anonymous execution; checkout writers/private core are executable only by the service role, and public merchant reads retain public RLS. Both private buckets remain private. No hosted checkout test event or new merchant/product/user was created.

## Executed validation

- **14 targeted local SQL/delivery tests passed**, including populated forward migration/rollback, pricing/stock/idempotency, tracking/history and authorization/privacy cases.
- Backup archive restore and checksum/count/FK/policy/RLS comparisons passed in isolated local PostgreSQL.
- Post-application read-only database integrity/security comparisons all passed.
- PostgREST recognizes the new schema: `merchant_is_food` and the delivery-aware public merchant detail read return HTTP 200. A fictional food listing remains checkout-disabled.
- The ordinary online **`npm run deploy:check` passed**: public catalog, city/homepage, schema and server credential ready; 73 built files scanned, zero configured server-secret matches. No production checkout write was used for that check.

Detailed backup, dry-run/apply logs and verification snapshots are in the restricted backup directory. The transient local validation log is ignored at `artifacts/migration-10-local-validation.log`. Backup/operator helpers are ignored local artifacts, not application code or hosted functions.

## Next step and rollback

Migration 10 is **no longer pending**. Do not manually replay it or edit its applied file. The normal ledger will skip it on subsequent pushes.

The database blocker for the new release is resolved. Complete the matching Production site/build variables described in [the build-fix guide](site-url-build-fix.md), include reviewed source changes and retry the approved Cloudflare build. This operation did not push Git, retry a deployment or deploy the frontend.

Keep the archive and prior deployment available. Prefer a forward fix; the [reviewed manual behavior rollback](../supabase/rollback/20261116001000_restore_checkout.sql) preserves every record and additive field/index. Use it only with a deliberate compatible application rollback, retain migration 10 in the ledger, and do not restore an older database backup over newer business/history data. See [the release/backup/rollback guide](delivery-release-guide.md).
