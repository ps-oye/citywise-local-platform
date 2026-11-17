# ShaharOne

A lightweight local discovery and delivery-enquiry platform, starting in Rawatbhata, Rajasthan. The existing HTML/CSS/vanilla JavaScript application uses Vite, Supabase PostgreSQL/Auth/private Storage and Cloudflare Pages. No customer account, payment gateway or native WhatsApp catalog synchronization is used.

The application now uses **one existing hosted configuration**: this repository, `main`, Pages project `rawatbhata-one`, and the existing Supabase project. Legacy technical names and browser persistence keys are intentional. No additional hosted database, repository or staging website is required.

The delivery/tracking update's **migration 10 was applied to the existing hosted database on 17 November 2026**, after explicit approval, a private backup and an actual isolated restore verification. Existing data/identities and security policies were preserved; no hosted test checkout, seed, credential change or frontend deployment was performed. See [application and verification results](docs/migration-10-application-report.md), [release/backup/rollback instructions](docs/delivery-release-guide.md) and [implementation history](docs/delivery-update-report.md). Earlier pending-migration reports are historical.

## Public experience

- `/` temporarily redirects (307/no-store) to `/rawatbhata/` while Rawatbhata is the only enabled city. Multiple enabled cities automatically restore selection at `/`.
- City categories, search and merchants use `/:city/:category` and `/:city/:category/:merchant`. Locality filtering remains available; a single city needs no selection click.
- Homepage ads, categories and ranked sections come from Supabase. Each section shows at most four eligible listings; more sections/results load on demand.
- Merchant pages include relevant catalogs/offerings, images, contacts, directions and verified schedule/closure explanations. Essential HTML and metadata are server-rendered.
- Food flow: **Browse Food -> Add to Cart -> Enter Address -> Confirm -> Open WhatsApp**. Delivery is merchant-managed; the shop confirms delivery charges/timing and collects payment directly.
- Public footer Contact Us displays only the clickable `ShaharOneRawatbhata@gmail.com` email.

## Local setup

Use Node 24 (minimum 22.12) and npm 10 or newer. Preserve existing ignored `.env.local` and `.dev.vars` files and their credentials.

```powershell
npm.cmd ci
# Only for a new checkout; never overwrite configured files:
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (-not (Test-Path .dev.vars)) { Copy-Item .dev.vars.example .dev.vars }
npm.cmd run dev
```

Open the printed localhost URL or `/admin/`. On non-Windows shells use `npm`. Local navigation stays relative; local pages remain noindex because their request origin does not match the configured production HTTPS origin.

Local browsing can use the existing hosted backend, but **automated tests never use it**. The new application needs migration 10; use isolated tests to review pending schema changes before an operator applies them. Do not create production test merchants/checkouts or run a seed to fix an empty screen.

## One set of configuration

The two templates are public-build and trusted-runtime parts of the same application configuration:

| Public build variable | Value |
| --- | --- |
| `VITE_BRAND_NAME` | `ShaharOne` |
| `VITE_SITE_URL` | `https://shaharone.in` |
| `VITE_SUPABASE_URL` | Existing Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Matching public publishable/anon key |

| Server/runtime variable | Purpose |
| --- | --- |
| `SITE_URL` | `https://shaharone.in`; must match the build origin |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same project/public key as the browser build |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only credential |
| `CHECKOUT_HMAC_SECRET` | Private random secret of at least 32 characters |
| `ANALYTICS_HMAC_SECRET` | Optional separate private secret, at least 32 characters |
| `SITE_INDEXING_ENABLED` | Explicit indexing opt-in, initially false |
| `SITE_REDIRECTS_ENABLED` | Explicit legacy-host/www redirect opt-in, initially false |
| `ANALYTICS_ENABLED` | Optional discovery activity reporting |

Only the four listed `VITE_` names are allowed; they are public browser values. Never prefix secrets with `VITE_`. Public and server project origins must match. Restart the local server/rebuild after changing configuration.

For Cloudflare Git builds, set `VITE_SITE_URL=https://shaharone.in` and `VITE_BRAND_NAME=ShaharOne` in the existing project's Production build variables; ignored local environment files are absent there. The deployment preflight reads runtime defaults from `wrangler.jsonc`, including `SITE_URL`, and rejects conflicting build/runtime origins. See [SITE_URL build troubleshooting](docs/site-url-build-fix.md) for the failed-build diagnosis and the separate pending migration requirement. An unsuccessful build does not replace the last successful website.

`DEPLOYMENT_ENV`, separate production-project ref requirements, environment-specific templates and preview deployment creation have been retired. The Supabase project's historical `-dev` name does not require a new database. `npm run preview` is still a local built-site server, not hosted staging.

## Checkout and privacy

An eligible real shop must be published/enabled, have checkout enabled by the admin, a valid verified WhatsApp contact and available products. Existing hours and temporary closures apply. Fictional demo merchants remain ineligible for actual checkout; they are never automatically converted to real businesses.

Restaurants and categories marked **Food catalog** use delivery only; inherited category capabilities cover sweet shops and future categories. Other commerce keeps its configured pickup/enquiry options. Hotels, gyms, attractions and services retain their normal contact actions.

The confirmation shows authoritative item prices, quantities and estimated totals. Delivery address is mandatory, normalized and validated on client/server. Delivery text is transient and appears only in the necessary encoded WhatsApp message: it is not saved in checkout history/analytics, browser storage, internal URLs or logs. An opaque server HMAC fingerprint and existing idempotency keys prevent duplicate initiations after retries. New references use `SO-`; historical `RB-` references remain supported.

Tracking records initiation and link preparation only. It cannot prove the customer sent a WhatsApp message or the merchant accepted/delivered an order. Estimated checkout value is not sales revenue.

## Administration

`/admin/` uses the existing manually provisioned Auth account and database allowlist. Public signup/customer/merchant login remain absent. Auth sessions stay in the admin tab's sessionStorage; public discovery uses a separate sessionless client. RLS and trusted backend checks protect all operations.

The dashboard retains merchant/category/locality CRUD, images, products and XLSX/CSV imports, ads, ranking, schedules and closures. **Enquiries & analytics -> Order Tracking** now includes searchable/paged merchant options, date filters, count/value/average, recent item snapshots/status/references and sortable merchant summaries. Merchant UUIDs preserve history after renaming, disabling or archiving. Customer delivery text is never displayed in tracking.

See [admin guide](docs/admin-guide.md), [catalog/import guide](docs/catalog-guide.md), [schema](docs/database-schema.md) and [security](docs/security.md).

If local admin login reports a connection error after the delivery update, reload the corrected code or restart `npm.cmd run dev`. The new admin context function may be absent while migration 10 is pending. Login now falls back only for that missing function to the existing authorized context, with a visible update notice. Existing management/city-wide analytics remain available; new delivery capability controls and merchant-wise tracking await the reviewed migration. See [admin login troubleshooting](docs/admin-login-fix.md). No credential reset or automatic schema change is needed to restore existing admin access.

Public merchant pages also retain [compatible browsing before migration 10](docs/merchant-page-fix.md), including dashboard links, direct HTML and browser navigation. Products, photos, contacts, directions and hours stay available from existing data. Checkout remains safely unavailable until its required schema exists; the trusted endpoint enforces that boundary. A generic setup screen does not mean the merchant records should be replaced with seed data.

## Database changes

Migrations 1-9 and existing seed files are unchanged. Applied [migration 10](supabase/migrations/20261116001000_delivery_tracking.sql) adds food capabilities, private delivery fingerprints, date/status indexes, delivery-aware RPCs and merchant tracking; it preserves rows and historical references. Its only `DROP` replaces a CHECK constraint to allow SO as well as RB references, without deleting data. The [application report](docs/migration-10-application-report.md) records the verified backup and before/after comparisons. Do not replay an applied migration.

Review [backup, application and rollback instructions](docs/delivery-release-guide.md) before applying any hosted schema change. The [manual behavior rollback](supabase/rollback/20261116001000_restore_checkout.sql) retains every record and additive column/index. Do not reset a hosted database, replay demo seeds, edit applied migrations or restore an old backup over newer live data.

Fictional seed datasets remain opt-in local/demo resources; do not execute them against the single hosted database during this update. Automated tests create and discard their own PGlite databases.

## Verification

```powershell
npm.cmd run verify
$env:PLAYWRIGHT_CHANNEL = 'chrome'
# Use an unused local port if your own server is already running:
$env:PLAYWRIGHT_PORT = '5174'
npm.cmd run test:e2e
npm.cmd run pages:build
npm.cmd run deploy:check -- --offline
npm.cmd audit --audit-level=low
```

`verify` checks syntax, unit/SQL tests and both builds. Browser tests start a disposable SQL-backed API and Vite with explicit fixture credentials; they never reuse an unknown running server. Chrome can be replaced with installed Playwright Chromium if desired. `npm run performance` measures isolated local Pages runtime pages with Lighthouse and stops its owned processes.

`deploy:check --offline` checks configuration and built-secret isolation without contacting the hosted database. The normal read-only deployment check additionally verifies the hosted schema (including migration 10), public catalog and server credential; run it as an operator release check after migration review/application, not as a production checkout test.

## Hosting and release

Keep the existing Pages Git integration on `main`, Node 24, repository-root build, output `dist`, build command `npm run build && npm run deploy:check` and repository `functions/`. Manually disable automatic preview-branch deployments in Cloudflare when adopting the single hosted release workflow. Do not push to `main` without deployment approval: the Git integration can publish that push automatically.

Use [deployment guide](docs/deployment-guide.md), [domain checklist](docs/shaharone-launch-guide.md) and [delivery release guide](docs/delivery-release-guide.md). Confirm the existing Auth Site URL for `https://shaharone.in`; current password login has no email callback/recovery flow to configure. Keep server secrets private and public signup disabled. Indexing and domain redirects remain deliberate opt-ins; demo/admin/search/error pages retain noindex behavior.
