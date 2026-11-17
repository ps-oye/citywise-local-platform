# ShaharOne delivery and tracking update — results

Implemented locally on 16 November 2026 in the existing vanilla JavaScript/Vite/Supabase/Cloudflare application. The earlier ShaharOne rebrand changes in the working tree are preserved. No framework/dependency, hosted project, staging site or repository was introduced.

**Release boundary:** migration 10 is prepared and tested but **not applied to the hosted database**. No hosted seed, test checkout, credential change, Cloudflare/DNS setting, Git push or production deployment was executed. The new application requires migration 10 before an approved release. Follow [backup, review, release and rollback instructions](delivery-release-guide.md).

The [17 November admin login follow-up](admin-login-fix.md) restores existing administration before that migration is applied, with a pending-update notice. Its subsequent verification passed 188 unit/SQL tests and 128 desktop/mobile browser cases. The original update results below remain the record of the 16 November implementation.

The later [merchant-page follow-up](merchant-page-fix.md) also restores existing public merchant browsing, including dashboard links, while blocking checkout safely until the required schema is present. Its final checks passed 194 unit/SQL tests and 134 browser cases. No hosted data/schema change was made for either compatibility fix.

## What changed

| Requirement | Implemented behavior |
| --- | --- |
| Enable WhatsApp catalog checkout | Eligible real shops can enable/disable it in admin after supplying a valid verified WhatsApp contact. Existing demo, publication, enablement, product/stock and business-hours checks remain authoritative |
| Mandatory delivery address | Confirmation requires a complete normalized multiline address; optional instructions/landmark remain available. Both client and server validate it; pending fields lock while preparing checkout |
| Delivery privacy | Plaintext address/instructions remain transient and appear in the encoded WhatsApp message, not database history/analytics, browser persistence, internal URLs or application logs. SQL receives only a server-keyed retry fingerprint |
| Delivery-only food checkout | Restaurants and food-capable commerce categories use delivery automatically. No food pickup, self-collection, enquiry-only or fulfillment selection is displayed. Non-food commerce and general contact actions remain available |
| Rawatbhata default | With Rawatbhata as the sole enabled city, `/` returns temporary 307/no-store to `/rawatbhata/`. No city selection is required; locality filtering remains. A second enabled city restores selection automatically |
| Merchant-wise tracking | All/individual merchant selection, bounded search/options, date filters, initiation count, exact estimated total/average, recent reference/time/items/value/status and sortable paged merchant summaries |
| Historical accuracy | Stable merchant UUIDs and recorded item/name snapshots retain history after renaming, disabling or archiving. New references use SO; existing RB references/retries are preserved |
| Contact Us | Footer shows only `ShaharOneRawatbhata@gmail.com`, linked with `mailto:`. Mobile wrapping and contrast use the existing design system |
| One hosted environment | One existing repository/main/Pages/Supabase/Auth/Storage configuration, matching public/runtime origins, no separate-project selectors or preview-deployment creation. Local isolated tests remain |
| Existing integrations | Admin, products/imports, ads/ranking, hours/closures, discovery/locality/search, merchant routes and directions remain covered by regression tests |

The originally disabled checkout control belongs to fictional sample merchants. Those records intentionally have no usable verified WhatsApp contact and remain ineligible; this update does not turn preserved demo businesses into real shops. Admin now explains eligibility instead of allowing an unsafe sample checkout. Existing eligible real shops use the complete delivery workflow.

## Customer workflow

**Browse Food → Add to Cart → Enter Address → Confirm → Open WhatsApp.**

Separate merchant carts still support multiple products, quantity changes and removal. The review fetches current server prices/availability and shows merchant, unit prices, quantities, line totals and estimated total. Missing/whitespace/incomplete addresses block confirmation with a clear message. Normalization preserves meaningful line breaks, Hindi/Unicode and special characters; addresses allow 12–1,000 characters and optional instructions allow 500.

The trusted endpoint validates again, applies existing quotas, obtains a final locked authoritative quote, records one initiation and prepares a message for the database merchant's verified WhatsApp number. The message includes shop, SO reference, items/units/quantities/prices, estimated total, address/instructions and merchant confirmation of stock, final price, delivery charges/time and payment. Duplicate identical retries reuse one initiation; changed carts/addresses cannot silently reuse that request. Price/status/stock changes require another review. Popup-blocked handoff retains the explicit open-link fallback.

ShaharOne collects no payment, requires no customer account, and does not synchronize WhatsApp's native catalog/cart. The merchant manages delivery and payment. `initiated` and `handoff_created` mean initiation and link preparation only; they do not prove a message was sent, accepted or delivered. Estimated checkout value is not sales revenue.

## Database and configuration

New pending migration: [20261116001000_delivery_tracking.sql](../supabase/migrations/20261116001000_delivery_tracking.sql).

- Adds category food capability, nullable private delivery fingerprint and date/status indexes; retains the existing merchant/date index.
- Adds delivery-aware public/admin wrappers, a service-only delivery writer, and single-admin merchant/tracking RPCs. RLS, foreign keys and Storage policies are retained.
- Reuses locked/idempotent initiation and authoritative quote logic. Old non-food request/token behavior remains compatible.
- Its only `DROP` replaces `checkout_intents_reference_check` with a widened SO/RB CHECK in one transaction. No row/table/column is dropped; only food/sweets capability metadata and normal timestamps are updated.
- Applied migrations 1–9 and existing seed files are unchanged. New SQL does not replay seeds, reset/delete business records, erase checkout history or change private object paths.

A reviewed [manual behavior rollback](../supabase/rollback/20261116001000_restore_checkout.sql) restores prior checkout definitions while retaining all data, added columns/indexes and SO/RB references. It is not automatically executed. Prefer a forward fix; keep the migration ledger and newer history intact.

The public `.env.example` and private `.dev.vars.example` describe complementary parts of one configuration. `VITE_SITE_URL` and `SITE_URL` are `https://shaharone.in`. The existing local credentials were preserved; only non-secret site/obsolete-selector settings changed. The old environment-specific templates and separate production-project requirement are removed. Wrangler has one vars block. Former hosted preview scripts fail safely, and their npm commands are removed. Vite's `preview` remains a local server.

Deployment preflight checks matching public/server project and site origins, secret/HMAC validity, built-secret isolation and, when explicitly run online by an operator, migration 10/read-only backend readiness. Indexing and known-host/www redirects remain explicit opt-ins with exact-origin protection. Localhost stays noindex.

## Verification performed

All feature/SQL/browser/Pages-runtime tests used disposable local fixtures. They did not read/write production merchant or checkout records.

| Executed check | Result |
| --- | --- |
| `npm run verify` | Passed: syntax check of 115 JavaScript files, **183 unit/SQL tests**, public/admin production build |
| Full Chrome Playwright suite, desktop + mobile | **124 passed**, 2.9 minutes |
| Final delivery/analytics browser checks after shared table styling | **20 passed**, desktop + mobile, 35.5 seconds |
| `npm run pages:build` | Passed: both Vite entry points and Cloudflare Pages Functions compilation |
| `npm run deploy:check -- --offline` | Passed configuration/artifact checks, 73 built files scanned, zero configured server-secret matches; no hosted calls |
| `npm audit --audit-level=low` | Zero vulnerabilities |
| `git diff --check` | Passed |
| `npm run performance` | Passed all eight isolated Pages-runtime Lighthouse measurements and singleton root smoke |

The SQL tests execute real migration SQL under anonymous, ordinary authenticated, active-admin and service roles. New coverage includes address/privacy boundaries, delivery-message encoding/merchant contact, final prices/stock/closures, duplicate retries, forbidden legacy food initiation, exact monetary aggregates, archived/renamed history, inclusive city-time dates, stable sorting/pagination and authorization. A populated forward-migration/rollback case preserves old RB and new SO receipts and existing product records. Independent bounded code/security reviews found no remaining material issues after fixing in-flight delivery-field edits.

The full browser suite covers cart quantities/removal, stale prices and network retries, disabled merchants, authenticated admin CRUD, taxonomy, products and XLSX/CSV imports, ads/ranking/media, business hours/temporary closures, search/locality/filters/directions, historical merchant URLs, SEO/no-JavaScript routes and privacy. New food delivery and merchant-report scenarios run on both desktop and mobile. Screenshots were reviewed locally; final table styling uses the existing admin design classes. No test message was sent to a real merchant.

Latest lab scores:

| Page | Mobile performance | Desktop performance | Accessibility | Best practices |
| --- | ---: | ---: | ---: | ---: |
| Platform (two-city fixture) | 100 | 100 | 100 | 100 |
| Rawatbhata home | 92 | 100 | 100 | 100 |
| Category | 97 | 100 | 100 | 100 |
| Merchant | 98 | 100 | 100 | 100 |

SEO scores are 66/69 because these localhost fixture pages deliberately remain noindex. The reported failing SEO audit is indexing prohibition; do not enable indexing just to improve a local score. Scores are simulated local lab measurements, not production Core Web Vitals. Rawatbhata mobile LCP was approximately 3.27 seconds, so actual hosted performance remains a post-release measurement.

Ignored evidence is under `artifacts/delivery-verify-final.log`, `artifacts/delivery-browser-final.log`, `artifacts/delivery-pages-build-final.log`, `artifacts/delivery-layout-final.log`, `artifacts/delivery-performance.log`, `artifacts/lighthouse/` and `test-results/`. Those directories are local artifacts, not production uploads.

## Files created or changed for this update

The working tree already contained the earlier ShaharOne rebrand. The following groups describe this delivery/tracking update; earlier brand asset changes are preserved.

| Area | Files |
| --- | --- |
| New database scripts | `supabase/migrations/20261116001000_delivery_tracking.sql`, `supabase/rollback/20261116001000_restore_checkout.sql` |
| Delivery domain and public UI | New `src/domain/delivery.js`; `src/domain/whatsapp.js`, `src/pages/merchant.js`, `src/server/checkout-handler.js`, `src/styles/merchant.css` |
| Admin/reporting | New `src/admin/components/checkout-tracking.js`; `src/admin/pages/analytics.js`, `merchants.js`, `taxonomy.js`, `src/data/admin-repository.js`, `src/utils/format.js`, `src/styles/analytics.css` |
| City/SEO/contact | `index.html`, `src/app.js`, `src/pages/discovery.js`, `src/data/discovery-repository.js`, `merchant-repository.js`, `src/server/discovery-page.js`, `merchant-page.js`, `seo-endpoints.js`, `seo-html.js`, `site-redirects.js`, `src/domain/seo.js`, `src/styles/platform.css` |
| Configuration/release tools | `.cloudflare.env.example`, `.env.example`, `.dev.vars.example`, `wrangler.jsonc`, `package.json`, `scripts/check-deployment.mjs`, `deployment-config.mjs`, `deploy-preview.mjs`, `qa-preview.mjs`, `smoke-preview.mjs`, `measure-performance.mjs` |
| New tests | `tests/unit/delivery.test.js`, `tests/integration/delivery-tracking.test.js`, `tests/e2e/delivery.spec.js` |
| Updated tests/fixtures | `playwright.config.js`, `tests/helpers/discovery-server.mjs`, `tests/fixtures/merchant-checkout.sql`; unit deployment/discovery/merchant/SEO/ShaharOne tests, integration discovery/merchant/SEO tests, browser admin/discovery/final-QA/merchant/SEO tests |
| New documentation | `docs/delivery-update-plan.md`, `docs/delivery-release-guide.md`, this report |
| Updated documentation | `AGENTS.md`, `README.md`, `docs/MASTER_SPEC.md`, `admin-guide.md`, `deployment-guide.md`, `shaharone-launch-guide.md`, `database-schema.md`, `security.md`, `architecture.md`; historical notices in prior phase/rebrand/deployment reports |
| Removed obsolete templates | `.env.development.example`, `.env.production.example`, `.dev.vars.production.example` from the previous uncommitted rebrand setup |
| Ignored local configuration | Existing `.env.local` and `.dev.vars`: non-secret site/retired-selector settings only; existing credentials retained |

## Manual steps before production

1. Review [migration 10 and its exact effects](delivery-release-guide.md#1-review-migration-10). Back up schema/data/private history/Auth/Storage metadata and actual image bytes outside the repo; verify restoration into an isolated local database.
2. Review the existing project's ledger/dry run, then have an authorized operator apply only migration 10 during a controlled release window. Do not run reset, seed, cleanup or data-replacement commands. Compare existing counts/UUIDs/history/policies after application.
3. Use the one existing Pages project/main and existing Supabase credentials. Configure matching site/public/server bindings; preserve private secrets and the administrator. Run the normal read-only deployment preflight after migration application.
4. Manually set Cloudflare automatic preview branches to None. Obtain deployment approval before pushing `main`, because its Git integration can publish automatically. The current source task did not perform that push.
5. Review apex/www/legacy-host DNS and redirects and the existing Auth Site URL using the [domain checklist](shaharone-launch-guide.md). Leave indexing/legacy redirects off until domain and real-content checks are complete. No automatic DNS/Cloudflare/Auth changes were made.
6. Configure eligible **real** food merchants through admin with verified contact, products, publication/enablement and hours. Preserved fictional samples remain checkout-disabled. Confirm the release's public/admin routes and historical reports without automated live checkout writes.

## Risks and limits

- Hosted feature availability remains pending migration application and approved code deployment. Migration 10 changes food quote policy, so release the matching frontend/backend deliberately; older food UI may temporarily block checkout between those steps.
- Hosted password sign-in and actual Storage HTTP operations were not exercised with production credentials; their regression paths passed with isolated fixtures. Domain/DNS/provider settings must be verified manually.
- No WhatsApp Click-to-Chat implementation can verify that a customer actually sent the message. Only initiation/link preparation is recorded.
- Delivery address/instructions are not recoverable from admin history by design. Merchants receive them through WhatsApp; external provider/body/link logging must not be added.
- There are no known broken routes or failing automated regressions remaining. The changes are complete locally; production release is a separate approved action.
