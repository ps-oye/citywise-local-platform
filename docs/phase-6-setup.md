# Phase 6 setup and migration effects

As of 13 November 2026 (Asia/Kolkata), the authorized development preview is live at [https://964c0074.rawatbhata-one.pages.dev](https://964c0074.rawatbhata-one.pages.dev). Open [/admin/](https://964c0074.rawatbhata-one.pages.dev/admin/) with the existing administrator's email/password, entered only in your browser. Choose **Enquiries & analytics** for the new report. The report defaults to excluding fictional activity; enable the explicit demo checkbox to inspect sample activity.

## Configured development services

| Service | Verified configuration |
| --- | --- |
| Supabase | `rawatbhata-one-dev`, ref `qyzcvmghhwxctwlaqhrq`; migrations 1–9 applied |
| Existing data | 33 fictional listings, 110 products; seeds not replayed |
| Administrator | One active allowlisted user, unchanged |
| Data security | 33 application tables with RLS; private schema not exposed |
| Media | `listing-media` and `promotional-media` remain private |
| Cloudflare Pages | `rawatbhata-one`, Direct Upload, preview branch `phase-6` |
| Production branch | `main`; no production deployment performed |
| Preview runtime | `DEPLOYMENT_ENV=preview`, `SITE_INDEXING_ENABLED=false`, `ANALYTICS_ENABLED=true` |
| Runtime secrets | Matching development Supabase public/private values and checkout HMAC uploaded to preview only |

Cloudflare browser authentication succeeded with account/user read and Pages publishing permissions. Wrangler retains its normal local login profile; no token was written to this repository. Existing `.env.local` and `.dev.vars` were preserved. Runtime values passed through process memory/stdin and were not printed. No DNS, custom domain, paid service or Git integration was added.

The preview is publicly reachable. It returns noindex metadata and headers, robots without a sitemap declaration, and an empty sitemap. The admin workspace remains protected by Supabase Auth and the database allowlist. Fictional merchants have no fabricated contact details and actual WhatsApp checkout remains disabled.

## Applied migrations

Only the following forward migrations were added and applied to the approved development project after relevant checks:

1. [`20261113000800_seo_analytics.sql`](../supabase/migrations/20261113000800_seo_analytics.sql): creates an RLS-protected private analytics limiter, timestamp trigger and three indexes; adds four public read functions for eligible sitemap paths/media, two service-only analytics functions, and the authenticated allowlist-guarded `admin_analytics` invoker.
2. [`20261113000900_homepage_query.sql`](../supabase/migrations/20261113000900_homepage_query.sql): replaces the existing `discovery_home` body with a bounded query, preserving signature, JSON shape, validation, invoker RLS and existing ACLs. It selects at most four ranked/locality-eligible identities per section before card enrichment and sets JIT off only within this function. This resolved the real hosted anonymous-query timeout without changing the global timeout or security policies.

The final migration dry run reported the remote database up to date. Existing business, product, price, contact, Auth, Storage and seed records were not changed by either installation. No hosted QA merchant/product/media/import fixture was created. Read-only role checks verified the real allowlisted UID can read the new report, anonymous callers are denied, all 31 public admin RPCs retain invoker authorization, and analytics writers admit only the service role.

## Destructive statements and retention

Neither migration executes `DROP`, `TRUNCATE`, business-data `DELETE` or catalog updates. Migration 8 restricts permissions only on its new table/functions and then grants their intended roles. Migration 9 uses `CREATE OR REPLACE FUNCTION` and preserves its existing execution grants; it does not drop a function or rewrite policies.

The analytics limiter function contains a runtime `DELETE` scoped to **ephemeral limiter counters inactive for more than two days**. It executes only when a trusted backend later consumes an event budget. It never deletes an activity event, enquiry, product, listing, Auth user or Storage object. The new limiter table has no foreign keys because its only identity is a global/client-hash time window; existing core foreign keys are unchanged.

Browser activity/event records and private checkout history have no automatic purge installed. Choose retention and backups deliberately before production; any later historical cleanup needs its own reviewed transaction. The dashboard does not delete those records.

## Run or redeploy locally

```powershell
npm.cmd ci
npm.cmd run dev
```

Verification and an authorized subsequent preview upload:

```powershell
npm.cmd run verify
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e
npm.cmd run deploy:check
npm.cmd run deploy:preview
node scripts/smoke-preview.mjs
```

The deployer validates the selected account and project's actual production branch, refuses to deploy to it, scopes uploaded secrets to preview and records the returned immutable URL in ignored `artifacts/preview-deployment.json`. It never applies SQL or reseeds the database. If the local Cloudflare session expires, sign in with Wrangler's browser flow; never send tokens or passwords in chat. See [the Phase 6 guide](phase-6-guide.md) for bindings and optional shell variables.

For a different development database, inspect the pending migrations and explicitly select its ref:

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
```

An existing Phase 5 database needs only migrations 8–9; a fresh project needs 1–9 in order and the documented one-time admin/bucket setup. Do not replay applied SQL or seed an existing catalog. CLI 3 may call a separately named development project's default branch `production`; verify its actual project name/ref rather than that branch label.

## Manual production work remaining

No further configuration is required to browse this development preview. Before a separately requested production launch, prepare a separate Supabase project, verified real content/contacts, the single admin, Auth settings, private media policies, retention/backups and production runtime credentials. Build with matching HTTPS `SITE_URL` / `VITE_SITE_URL`, explicitly set `PRODUCTION_SUPABASE_PROJECT_REF`, and run `npm.cmd run production:check`. It rejects this development database and unprepared demo content.

Verify real password login and Storage HTTP uploads in your own environment, configure the final domain, and enable production indexing only after real content and final-origin checks pass. No production project, domain, content removal or indexing change was performed here. [Phase 6 results](phase-6-report.md) lists executed tests and remaining limitations. Phase 7 is ready next and has not started.
