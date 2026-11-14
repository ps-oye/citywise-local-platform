# Rawatbhata One

A lightweight local discovery platform, initially for Rawatbhata, Rajasthan. HTML5, CSS3 and vanilla JavaScript run on Vite; Supabase provides PostgreSQL, Auth and private media storage. Cloudflare Pages hosts the development preview.

**Implemented scope: Phases 1–7 — discovery, merchant pages, the single-admin dashboard, catalog imports, SEO, analytics, deployment and final QA/cleanup.** Public pages return database-backed HTML and metadata before JavaScript. `/admin/` includes merchant/category/location management, images, advertisements, ranking, hours, Products & imports, and Enquiries & analytics. WhatsApp enquiries use server-authoritative prices; the database enforces the single allowlisted administrator.

**Development preview:** [Rawatbhata One](https://de486908.rawatbhata-one.pages.dev). It uses the existing development Supabase project, fictional content and explicit noindex directives. Production remains a separate environment/release. See [Phase 7 results](docs/phase-7-report.md) for final QA, fixes and measurements, and [the deployment guide](docs/deployment-guide.md) for setup.

Read [AGENTS.md](AGENTS.md) and [the master specification](docs/MASTER_SPEC.md) before adding features.

## Quick start

Use Node.js 24 LTS (minimum 22.12) and npm 10 or newer:

```powershell
npm.cmd ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev
```

Open `http://127.0.0.1:5173/` or `http://127.0.0.1:5173/admin/`. On other shells, use `npm` instead of `npm.cmd`. Windows PowerShell may block `npm.ps1`; `npm.cmd` works without changing the machine execution policy.

Keep an existing `.env.local`; it already points to your development project. Leaving both Supabase values blank displays an explicit setup state. With configuration present, the homepage requests context and four category sections containing at most four cards each; more categories load on request. Public listing content comes from Supabase, with no frontend fallback business dataset.

Try `/rawatbhata/food`, `/rawatbhata/food/demo-food`, `/rawatbhata/hotels/demo-hotels` or `/rawatbhata/search?q=Kaju%20Katli`. Filters survive refresh and browser navigation. Cards open merchant pages; old quick-look URLs still work. Sample carts can be reviewed, while the actual WhatsApp action remains disabled for fictional merchants.

## Environment variables

All `VITE_` values are public browser configuration. Only these names are allowed:

| Name | Purpose |
| --- | --- |
| `VITE_BRAND_NAME` | Working name, defaults to Rawatbhata One; 1–80 characters |
| `VITE_SITE_URL` | Optional HTTPS site origin, no path/query/credentials |
| `VITE_SUPABASE_URL` | HTTPS project origin; localhost HTTP is allowed for development |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public publishable key or legacy anon JWT |

Set both Supabase values together. Secret/service-role keys and unknown `VITE_` variables fail validation. Key inspection is a configuration guard, not cryptographic authentication; Supabase remains responsible for validating requests. Vite runs the same validation before starting or building. Restart the dev server after editing environment values.

Never put database passwords, service-role keys or customer data in browser variables. Real environment files are ignored by Git; only `.env.example` is tracked.

## Architecture and files

```text
index.html / admin/index.html    Separate public and administration entry points
public/                         Static assets, 404 page and Cloudflare headers
src/config/                     Validated browser environment
src/pages/                      Public page controllers
src/admin/                      Administration entry point
src/components/                 Shared DOM components
src/data/                       Supabase client and bounded repositories
src/services/                   Application orchestration
src/workers/                    Bounded, cancellable spreadsheet parsing
src/domain/                     Pure discovery, cart, merchant display and WhatsApp rules
src/server/                     Trusted checkout and public merchant HTML rendering
src/utils/                      Text safety, destination validation and money formatting
src/styles/                     Design tokens, base styles, layouts and components
functions/                      Public route/merchant HTML and protected checkout handler
supabase/migrations/             Ordered schema, RLS and storage migrations
supabase/seed.sql                Baseline city and public brand settings
supabase/seeds/                  Opt-in, removable fictional demo fixtures
tests/                          Unit, PostgreSQL integration and browser tests
scripts/                        Local verification
docs/                           Architecture, schema, security, setup and phase report
```

See [admin guide](docs/admin-guide.md), [catalog/import guide](docs/catalog-guide.md), [Phase 6 guide](docs/phase-6-guide.md), [Phase 6 results](docs/phase-6-report.md), [SEO/analytics architecture](docs/seo-analytics-architecture.md), [schema](docs/database-schema.md) and [security](docs/security.md). Earlier phase reports remain historical records. Public pages use a sessionless Supabase client; administrator sessions stay in sessionStorage within their separate entry point. Merchant and admin catalog/analytics code load separately. Trusted server modules are never imported into either browser entry point.

## Supabase setup and migrations

Use a dedicated **development Supabase project** or an isolated local stack. The configured `rawatbhata-one-dev` project has migrations 1–9, 33 fictional merchants and 110 products. Phase 6 applied only migrations 8 (SEO/analytics) and 9 (bounded homepage query); earlier migrations and seeds were not replayed. The user-selected Auth UID remains the sole administrator, signup remains disabled, and all 33 application tables retain RLS. Live API checks deny anonymous admin/event writes and the migration ledger is up to date. Follow [Phase 6 setup](docs/phase-6-setup.md) for another environment and [Phase 4 setup](docs/phase-4-setup.md) for first-account provisioning.

The reviewed migration changes and regression results are documented in [migration readiness](docs/migration-readiness.md). These initial migrations are for an unapplied setup; do not re-run them over an already initialized application schema.

With the project-local Supabase CLI and a separately installed Docker runtime:

```powershell
npx.cmd supabase start
npx.cmd supabase migration up
```

The installed CLI 3.x defaults to the local database. `migration up` applies pending migrations on an existing local stack. It does not re-run the seed: if needed, apply `supabase/seed.sql` with the local SQL editor or psql. Do not reset a database containing data you want to keep.

For another hosted development project, review the nine ordered migration files, then use the CLI:

```powershell
npx.cmd supabase login
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
```

Run commands only against the intended project after reviewing the dry run. Then apply `supabase/seed.sql`, or the opt-in discovery seed described below, which includes the baseline. SQL-editor application does not update the CLI migration ledger; use one migration approach consistently. DDL files are applied once by a ledger, not repeatedly pasted into an existing schema. The baseline preserves existing rows; the discovery seed updates its demo records.

`--remote` selects the hosted project explicitly; `--skip-vault` prevents unrelated Vault configuration updates. The public key in `.env.local` is for browser access and does not authorize database migrations. Never put database credentials or an account access token in a `VITE_` variable.

The core migration enables RLS and removes client grants before its first commit. Its permission/trigger loops use an explicit list of the application's 30 tables. A populated schema that would gain new client USAGE is rejected rather than silently exposing existing objects. Function defaults are restricted for the migration owner across schemas; future functions need explicit execution grants.

Local Auth signup and anonymous sign-in are disabled in `supabase/config.toml`. Hosted projects need the same Auth settings applied manually. See [administrator provisioning](docs/admin-guide.md).

### Storage

The storage migration creates private `listing-media` and `promotional-media` buckets with 5 MiB limits and JPEG, PNG, WebP and AVIF allowlists. Object names must be `<listing-or-ad-uuid>/<filename>.<extension>`. Only the provisioned admin can upload to existing entities, with their own owner UID.

Public reads require an enabled media reference belonging to a published business or an active advertisement. Restrictive guards enforce this even if an existing policy broadly permits access; other buckets keep their existing policies. The active admin can replace/delete platform media whose owner is missing or belongs to a previous administrator.

Compatible existing buckets are reused without updates. A bucket with different settings, or disabled RLS on `storage.objects`, aborts the storage migration with an explanatory error. Phase 4 adds authenticated uploads, bounded image decoding/re-encoding and metadata stripping. The server verifies the caller and uses that user's RLS-protected Storage permissions. See [the admin guide](docs/admin-guide.md) for limits and cleanup behavior.

## Optional demo fixtures

The baseline seed contains no businesses. To install the complete demo in another approved development project after migrations 1–9:

```powershell
npx.cmd supabase db query --remote=YOUR_DEVELOPMENT_PROJECT_REF --file supabase/seeds/discovery-demo.sql
npx.cmd supabase db query --remote=YOUR_DEVELOPMENT_PROJECT_REF --file supabase/seeds/merchant-demo.sql
```

The discovery seed installs 33 clearly fictional listings across all 15 categories, three fictional neighbourhoods, relevant facets and three sponsored demo promotions. The merchant seed enriches those listings to 110 products, product groups, split weekly schedules and a sample date exception. It requires migration 5 and the discovery seed first. Both are opt-in and can refresh demo content; re-running the discovery seed deliberately restores its sample prices, advertisement dates and ranks. They preserve non-demo businesses and do not create Auth users, verified contacts, real addresses or coordinates. Checkout is blocked by database constraints/triggers. The smaller `supabase/seeds/demo.sql` remains a Phase 1 fixture and is not required first.

Photos are illustrative, downloaded locally and optimized as WebP. The Rajasthan landscape is not a photograph of Rawatbhata. See [asset credits and licenses](docs/asset-credits.md).

After reviewing the target database, manually apply `supabase/seeds/remove-demo.sql` to remove demo fixtures. The application never removes demo data automatically; cleanup tests only affect disposable PostgreSQL. References from operational records cause the transaction to fail rather than cascade into private data. Real rows that still reference sample categories/localities need deliberate reassignment first.

## Products and imports

In `/admin/`, open **Products & imports** and choose a commerce/restaurant merchant in the selected city. Add/edit/archive products and manage product categories, or open **Import files**. Download an Excel/CSV template, choose insert/update or price-only mode, select the worksheet if needed, validate, review the new/updated/unchanged/invalid rows and explicitly confirm. Import history retains results and downloadable error reports. See [the full column contract and limits](docs/catalog-guide.md).

Products match on `(merchant_id, sku)`; files cannot supply merchant identity. Missing products are never deleted, all rows must validate, and confirmed changes apply atomically. Price-only mode rejects unknown SKUs and non-price fields. Omitted optional columns preserve existing values; blank cells explicitly clear/reset them as documented. Formulas, unsafe workbooks and oversized files are rejected. Stale previews require a new review, while retrying an applied job cannot apply it twice. No new credentials or endpoint configuration is needed.

## Trusted checkout configuration

The current development workspace has an ignored `.dev.vars` with the development project's privileged server key and a dedicated HMAC secret. Existing `.env`/`.env.local` were preserved. `npm.cmd run dev` and `npm.cmd run preview` serve `/api/checkout` through the same trusted handler used by Pages Functions.

For another workspace, copy `.dev.vars.example` to `.dev.vars` and configure server values as described in [Phase 3 setup](docs/phase-3-setup.md). Never prefix privileged values with `VITE_`. Only the public publishable key belongs in `.env.local`. Cloudflare deployment will need these values as server bindings; local configuration does not provision hosting secrets.

The endpoint validates origin, request limits, merchant visibility, verified contact, action/fulfilment configuration, operating status and authoritative products. A price/stock change requires another review. Persistent rate limits and idempotency protect initiation records. Tracking means **enquiry initiated / link prepared**, never message sent or order accepted. No payment gateway or customer account is involved.

## Verification

```powershell
npm.cmd run verify
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit
```

`verify` checks JS syntax, executes unit/integration tests and builds both entry points. Integration tests apply the actual migrations to disposable in-memory PostgreSQL through PGlite, using test-only Supabase system schemas and verified-UID fixtures. They exercise RLS under anon, ordinary authenticated, admin and service roles. They never connect to your environment or production database.

Browser tests start an isolated PostgreSQL-backed HTTP API on port 54329 and Vite on port 5173 with fixture credentials. They exercise the actual migrations and discovery queries, keyboard search, carousel timing/reduced motion, filtering, pagination, text safety, error recovery, responsive layouts and admin separation. Selected API failures and malicious content are deliberately intercepted. The unit/SQL and `test:e2e` suites use isolated configuration and never connect to or write to hosted Supabase. If the downloaded Chromium executable is blocked on Windows, an installed Chrome may be used:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

Phase 7 verification passed 156 unit/SQL tests and 108 browser tests, followed by focused responsive checks for the final banner spacing correction. For read-only QA of the deployed development preview:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run qa:preview
node scripts/smoke-preview.mjs
```

These separate hosted commands use the saved preview URL, or accept an explicit HTTPS URL after the command. They check public HTML/metadata, demo restrictions, responsive browser flows and API boundaries without creating hosted business/media fixtures. Results and remaining real-service verification are in [Phase 7 results](docs/phase-7-report.md).

## SEO, analytics and Cloudflare preview

Public homepage/category/explore/search/merchant requests expose useful HTML with titles, descriptions, canonical and social metadata, truthful structured data and native search/pagination. Initial public data is reused during hydration. `/robots.txt` and paged XML sitemaps are generated from eligible real content. Demo, filtered/search/admin/error and preview pages remain noindex. Production indexing requires an explicit matching HTTPS origin and opt-in runtime settings.

Enquiries & analytics provides city-local date ranges, daily trends, top listings/promotions and separate trusted initiation/link-preparation counts. Optional browser reports use a protected, independently limited endpoint and honor DNT/GPC and the footer privacy preference. No visitor identifier, IP, search/referrer or enquiry note is stored in event rows. Counts are approximate activity, not confirmed orders, unique visitors or sales.

```powershell
npm.cmd run pages:build
npm.cmd run deploy:check
# Authenticate privately, only when needed:
npx.cmd wrangler login --scopes account:read user:read pages:write
npm.cmd run deploy:preview
```

The preview command verifies/builds, checks secret isolation and both public/server Supabase credentials, verifies the account and production branch, then publishes only the separate preview branch and preview bindings. It refuses production branch names. The current preview is already deployed; repeat deployment only for a deliberate update. The [guide](docs/phase-6-guide.md) documents credentials, direct-upload choices, runtime bindings, production preparation and the separately guarded `production:check`. Passwords/tokens must stay outside chat and source control.

## Build and local preview

```powershell
npm.cmd run build
npm.cmd run preview
```

Both HTML entry points and static assets are built into `dist/`. Vite's local adapter and Cloudflare Pages Functions render public HTML and trusted APIs. Old merchant slugs redirect safely; hidden/missing content returns 404. Hashed assets bypass Functions and cache immutably; dynamic/private content is no-store. The configured preview keeps noindex enabled. `npm.cmd run performance` exercises the actual local Pages runtime with isolated data and saves measured Lighthouse HTML/JSON reports under ignored `artifacts/lighthouse/`.

## Troubleshooting

- No data connection: fill both public values from the same Supabase development project; blank values show the setup state.
- Connected with no city: apply the baseline seed and ensure one city is enabled and marked default.
- Permission denied on admin changes: provision the exact Auth UID in the private allowlist; an email or editable metadata role is insufficient.
- Discovery/merchant setup state: verify migrations 4 and 5 are recorded, the baseline city exists and the Data API schema cache has refreshed. Do not disable RLS.
- Checkout unavailable: verify the ignored server configuration targets the same development project as the public variables. Privileged credentials must remain outside `VITE_` values. Demo confirmation intentionally has no active WhatsApp action.
- Browser launch error: check the installed browser/channel and OS permissions. Do not disable security policies to make application tests pass.
- Ports 5173 or 54329 are occupied: stop your previous test/development server before browser tests. Tests intentionally do not reuse unknown servers.
- CSP blocks a custom Supabase domain: add that exact HTTPS origin to `connect-src` and `img-src` in both `public/_headers` and `src/config/security-headers.js` during hosting configuration.
- Catalog/import setup error: verify migration 7 is recorded and the Data API schema cache has refreshed. Keep RLS enabled and `private` outside the exposed schemas.
- Import validation failure: use the matching mode template, format Excel SKUs as Text, replace formulas with values and review row/column errors. Omit optional columns to preserve existing fields; an empty cell resets/clears them. See the catalog guide for limits.
- Homepage RPC SQLSTATE 57014: verify migration 9 is applied. It selects at most four eligible identities per section before expensive card enrichment; do not raise public statement timeouts or disable RLS to mask a missing migration.
- Analytics report is empty: select the correct city/date range; demo activity is excluded by default and privacy signals suppress optional events. Checkout metrics use actual initiation records, independently of browser tracking.
- Cloudflare deployment authentication: use the private browser login. For multiple accounts, set the intended `CLOUDFLARE_ACCOUNT_ID`; never paste an API token into chat or a public variable.
- Expired or stale import: prepare and inspect a new preview. After a lost confirmation response, retry the same job or inspect Import history before starting another import.
- Private operational tables are absent from the REST API: this is intentional. Guarded public RPCs expose only the authorized admin/import workflows.

Phases 1–7 are implemented, including final QA and cleanup. The master specification defines no later implementation phase. Production preparation/release is a separate requested action; the development preview remains noindex and uses fictional content. [Phase 7 results](docs/phase-7-report.md) records verification, changed files and remaining real-service/operator checks.
