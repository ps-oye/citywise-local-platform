# Delivery update: review, backup, release and rollback

This update uses the **existing** repository, Pages project `rawatbhata-one`, primary branch `main`, and existing Supabase project `qyzcvmghhwxctwlaqhrq`. The project's legacy `-dev` name does not imply another backend. Its merchants, products, categories, images, ads, schedules, Auth user, storage buckets and checkout history remain in place. No extra project, staging website or repository is required.

The implementation task does not apply the pending migration, run hosted test checkouts, change credentials/Cloudflare/DNS settings, push to `main` or deploy. The new application requires migration 10 before release.

The [admin login compatibility fix](admin-login-fix.md) lets existing administration continue while that migration is pending. It falls back only when the new context RPC is missing; the existing admin allowlist/RLS still authorize access. A visible notice explains which new features require the reviewed update. This does not remove the migration requirement for the full delivery/tracking release or apply it automatically.

The [merchant-page follow-up](merchant-page-fix.md) similarly preserves public catalogs, contacts and hours through existing public reads. Checkout is blocked on both browser and trusted server when its schema capability is absent; the old food flow cannot bypass mandatory delivery validation. Complete the reviewed migration before activating the new delivery/tracking release. Existing browsing does not require a reset or demo seed.

## 1. Review migration 10

Review [20261116001000_delivery_tracking.sql](../supabase/migrations/20261116001000_delivery_tracking.sql) against the existing migration ledger through 9. Applied migration files and seed files are unchanged.

| Statement/change | Effect |
| --- | --- |
| Add `categories.food_catalog`, default false | Adds a category capability; restaurants are food merchants, and other catalog shops inherit the capability through assigned categories/ancestors |
| Update existing `food` / `sweets` capability flags | Changes only that boolean metadata and normal update timestamps; preserves category identity, content and assignments |
| Add nullable `checkout_intents.delivery_fingerprint` | Stores an opaque server-keyed digest for safe delivery retries; historical rows stay null |
| `DROP CONSTRAINT checkout_intents_reference_check`, then add widened CHECK | Replaces validation so both historical `RB-` and new `SO-` references are allowed. **No table, column or row is dropped.** Both statements run in one transaction; failure rolls it back |
| Add date and state/date indexes | Supports All Merchants/date/status reads; the existing merchant/date index is retained |
| Replace `merchant_cart_quote` | Keeps authoritative product validation and closure rules, adds food delivery-only behavior, and preserves non-food token behavior |
| Replace `checkout_initiate` with a private shared core + wrappers | Keeps locks, revalidation, snapshots and idempotency. Old non-food requests remain supported; food initiation requires the new delivery validation path |
| Add read/admin wrappers and tracking RPCs | Keeps invoker RLS and single-admin checks; exposes no customer delivery text |

There is no `DELETE`, `TRUNCATE`, table reset, business/history cleanup, seed replay, RLS disable or broad new grant in this migration. New functions use explicit grants and an empty search path. The only `DROP` replaces the reference CHECK described above. Function bodies contain the authorized future initiation inserts; defining those functions does not create checkout records.

The transaction uses a five-second lock timeout. Index creation and constraint validation require database locks. Schedule application during low activity; stop and review a lock timeout or schema mismatch instead of removing safeguards or rerunning seeds. Do not manually replay an already recorded migration.

Migration 10 changes food quote policy. Coordinate application with the matching reviewed frontend/backend release: the previous food UI may temporarily block checkout between migration and deployment. Use a controlled release window and existing per-merchant checkout controls if needed; do not bypass the new address requirement.

## 2. Back up before any production schema action

Use a secure backup directory **outside the repository and public artifacts**. Backups can contain private operational data and credentials/metadata. Keep access restricted and test restoration into an isolated local database, never over the live database.

Before applying migration 10:

1. Record the migration ledger through 9, existing deployment/commit, public configuration, and securely retain the current server bindings without printing secrets. Record merchant/product/category/media/advertisement/checkout counts and existing references for comparison.
2. Export the database schema and data, including `public`, `private`, `auth` and `storage`, with the project's approved backup mechanism. Confirm the backup actually includes private checkout intents/items and the admin allowlist, not only public tables.
3. Back up the actual private Storage objects separately: SQL storage metadata does not contain image bytes. Retain object paths, bucket policies/settings and Auth configuration.
4. Verify backup readability and a restore locally. Keep the existing database available; do not reset it or replace it with a demo seed.

The installed Supabase CLI supports explicit hosted project selection. Example read-only dump commands, after authenticating securely in your own terminal and creating the external backup directory:

```powershell
npx.cmd supabase db dump --remote=qyzcvmghhwxctwlaqhrq --schema=public,private,auth,storage --file C:\ShaharOne-backups\before-m10-schema.sql
npx.cmd supabase db dump --remote=qyzcvmghhwxctwlaqhrq --schema=public,private,auth,storage --data-only --use-copy --file C:\ShaharOne-backups\before-m10-data.sql
```

Inspect CLI exclusions and the resulting files: hosted system schemas, role definitions and managed Auth/Storage behavior need a compatible restore procedure. Retain a provider backup/point-in-time recovery where available as well. Do not paste database passwords into chat or pass them in command arguments. These commands are instructions only; this task did not run them.

## 3. One hosted configuration

`.env.example` and `.dev.vars.example` are complementary public-build and private-runtime parts of **one** configuration. They are not separate environments. Existing ignored `.env.local` and `.dev.vars` retain their credentials. Only non-secret site/obsolete-selector flags were updated locally.

| Setting | Required value/source |
| --- | --- |
| `VITE_BRAND_NAME` | `ShaharOne` |
| `VITE_SITE_URL` | `https://shaharone.in` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing project's URL and public key, at build time |
| `SITE_URL` | `https://shaharone.in`, at runtime |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same existing project/public key as the build |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only project credential; never a `VITE_` variable |
| `CHECKOUT_HMAC_SECRET` | Existing private random secret, at least 32 characters; do not rotate merely for this update |
| `ANALYTICS_HMAC_SECRET` | Optional separate private secret; otherwise the existing domain-separated HMAC is reused |
| `SITE_INDEXING_ENABLED` | Explicit opt-in; keep false until real-content/final-host checks are complete |
| `SITE_REDIRECTS_ENABLED` | Explicit opt-in for the known legacy host/www migration, after the apex works |
| `ANALYTICS_ENABLED` | Whether optional discovery activity reporting is accepted |

`DEPLOYMENT_ENV`, `PRODUCTION_SUPABASE_PROJECT_REF`, `PAGES_PREVIEW_BRANCH`, separate hosted-project rejection and environment-specific templates are retired. Wrangler has one configuration for the existing project. `npm run deploy:preview` was removed; directly calling the old script fails safely without creating a project, uploading secrets or deploying. `npm run preview` remains Vite's **local** built-site server.

Indexing requires the explicit flag plus the exact configured HTTPS request origin. Localhost stays noindex even when the hosted flag is true. Legacy-host redirects require an explicit flag, exact canonical target and known source hosts. No automatic indexing/redirect activation was performed.

## 4. Apply and release only after review/approval

1. Complete the backup and migration review above. Inspect the existing project's pending migration dry run; only migration 10 should be new. Do not include development seeds or demo cleanup.
2. Apply the reviewed forward migration through the normal migration ledger process. The new public/admin API wrappers require it. This step is an operator action, not completed by the implementation task.
3. Recheck counts/references/relationships and RLS/grants against the backup. Test migration/rollback behavior with isolated fixtures before using the hosted database. Do not generate test checkout initiations against live merchants.
4. Configure only the existing Pages project's Production variables for `main`; preserve existing credentials. Node 24, build command `npm run build && npm run deploy:check`, output `dist`, repository root build directory, and `functions/` remain. The read-only backend preflight now verifies migration 10 before allowing this build to be considered ready.
5. In Cloudflare branch deployment controls, manually disable automatic preview-branch deployments if enabled. Cloudflare may still name provider settings “Production” and “Preview”; keep **one hosted release workflow** on `main`. No second website/backend is needed.
6. Review the pending source changes and obtain deployment approval **before pushing to `main`**. The existing Git integration can deploy a push automatically. No Git push or live deployment was performed by this task.
7. After the approved release, check home/category/merchant pages, legitimate admin login, ads, hours, imports and media. Verify the sole enabled city redirects `/` with temporary 307/no-store to `/rawatbhata/`. A second enabled city restores selection automatically without a rebuild.
8. Open an eligible real merchant in admin: select a catalog type/category, provide its actual WhatsApp contact, verify it with the business, configure hours, publish/enable, provide available products and enable WhatsApp catalog checkout. Food uses delivery automatically; no pickup/enquiry-only customer toggle is shown. Fictional demo listings remain ineligible and are not automatically converted to real shops.
9. Check Order Tracking using existing activity or an explicitly authorized real initiation, not automated production fixtures. New references use `SO-`; historical `RB-` references and archived merchant history remain visible. Values are estimates, never sales revenue.

## 5. Customer delivery/privacy behavior

Food flow: **Browse Food → Add to Cart → Enter Address → Confirm → Open WhatsApp**. The popup uses current database prices and stock, shop/contact eligibility and business status. Customers need a complete address of 12–1,000 characters with meaningful words; whitespace and line breaks are normalized while Unicode and special characters are preserved. Optional instructions allow 500 characters.

Address/instructions are held in memory and sent over HTTPS to the checkout endpoint. The server validates again, gives only a keyed fingerprint to SQL and adds delivery text to the necessary encoded WhatsApp link. Neither plaintext field is saved in checkout history, analytics, cart/session storage or internal page URLs. The application does not log checkout request bodies or complete WhatsApp URLs. Do not add provider/application body logging or outbound-link logging that captures this text. Browser cart/session storage retains only existing cart data and opaque idempotency keys/digests.

ShaharOne collects no payment and does not synchronize WhatsApp's native cart. Merchants confirm stock, final prices, delivery charges/timing and payment directly. An initiation/link prepared state does not prove the customer sent a message or that a merchant accepted/delivered an order.

## 6. Rollback without losing data

Prefer a forward fix or temporarily disable checkout for the affected merchant using existing admin controls. Do not delete checkout records, merchants, products or storage objects.

For a full application rollback, choose the recorded compatible previous deployment and review [the manual checkout SQL rollback](../supabase/rollback/20261116001000_restore_checkout.sql) with it. That script restores the prior quote/initiation definitions and **does not remove any rows, added columns, indexes, helper functions, food flags or the widened SO/RB CHECK**. It intentionally restores the former food preferences, so use it only as part of the deliberate application rollback. Retain SO-reference parsing in a rollback build if it may retry a new SO receipt.

Restore the application and its matching SQL behavior deliberately during a controlled release window. Keep migration 10 recorded; a manual behavioral rollback is not permission to rewrite the ledger or rerun the forward migration. If a later corrective migration is needed, version it separately. Never restore an old backup over newer live checkout/product data merely to undo code.

## Local verification

```powershell
npm.cmd run verify
$env:PLAYWRIGHT_CHANNEL = 'chrome'
# If your own local server uses 5173:
$env:PLAYWRIGHT_PORT = '5174'
npm.cmd run test:e2e
npm.cmd run pages:build
npm.cmd run deploy:check -- --offline
npm.cmd audit --audit-level=low
```

SQL/browser/Lighthouse tests use disposable local fixtures, including reserved fictional contacts, never the hosted backend. The configurable browser-test port leaves an existing user server alone. `deploy:check --offline` checks configuration/bundles/secret isolation without calling the hosted database; run the ordinary read-only deployment preflight only after the operator applies the reviewed migration.
