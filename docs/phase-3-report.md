# Phase 3 results

Completed on 12 November 2026. Implementation stops after merchant pages and checkout; no administrator dashboard, imports, general analytics or production deployment is included.

## Delivered

- Reusable `/:city/:category/:listing` pages generated from Supabase. Cards and keyboard search open them; existing quick-look links remain compatible.
- Image banners, accessible photo dialogs, business descriptions, relevant room/membership/service/visiting offerings, service areas, verified contacts and validated Maps directions.
- Paginated product catalogs with search, product groups, dietary/availability filters, price/name/featured sorting, unavailable states, indicative discounts and incremental loading.
- Separate versioned localStorage carts per merchant, quantities/removal/clear, estimated totals, cross-tab refresh, corrupt-storage handling and an in-memory fallback when storage is blocked. Mobile has a sticky cart summary.
- Fresh database quotes, confirmation, optional fulfilment/note, price-change review, stock-withdrawal handling and persistent idempotency across retries. No browser price is authoritative.
- A trusted same-origin Pages checkout handler with strict origin/payload validation, private server bindings, database-backed rate limits, explicit eligibility checks and authoritative transactional snapshots.
- Verified-number WhatsApp links, readable enquiry references, popup fallback and accurate initiation/handoff tracking. No message-delivery, accepted-order or payment claim is made.
- Shared PostgreSQL operating status for pages, discovery cards and checkout: weekly/split/overnight schedules, special dates, holidays, merged overlapping shifts, manual closures/reopening, scheduled overrides, timezone and daylight-saving behavior.
- Meaningful request-time merchant HTML, catalog text, titles/descriptions/canonical URLs, safe historical-slug redirects and real 404s. The local Vite adapter exercises the same rendering/checkout logic as Pages Functions. Full production SEO remains Phase 6.

## Development setup completed

Applied only `20261112000500_merchants.sql` and `supabase/seeds/merchant-demo.sql` to the approved `rawatbhata-one-dev` project after checks passed. Earlier migrations were retained in the ledger; a final dry run confirmed no pending migrations. Existing public environment files were preserved; ignored `.dev.vars` contains the development server bindings, with no credential values in source/public output.

Real public SDK verification resolved all 33 merchant URLs, counted 110 products and checked category/dietary filtering, 12-of-16 food catalog paging, schedules and blocked demo quotes. Hosted SQL readback confirmed anonymous/authenticated callers cannot execute checkout initiation, service access is enabled and limiter RLS is on. No real checkout intent was fabricated.

The built frontend passed a live Supabase browser smoke check at 320/390/768/1440px, with zero page or console errors. Sample cart confirmation stayed disabled for WhatsApp. A direct readiness probe through the trusted local handler returned the expected demo rejection. Successful initiation, recorded handoff and lost-response retries were verified against isolated test fixtures only; no WhatsApp message or outgoing navigation was sent.

## Validation

| Check | Result |
| --- | --- |
| JavaScript syntax | 50 files checked |
| Unit and actual PostgreSQL integration suite | 80 passed, including 14 merchant SQL and 10 merchant/cart/server unit tests |
| Playwright suite | 52 passed: 26 desktop and 26 mobile Chrome scenarios |
| Build | Both entries and merchant chunks built successfully |
| Dependency audit | Zero reported vulnerabilities, including development dependencies |
| Hosted public API and read-only privilege checks | Passed |
| Built frontend with real development Supabase | Passed; no horizontal overflow at four tested widths |
| Trusted local endpoint with real development Supabase | Correctly blocks demos; no fabricated enquiry |
| Public build credential scan | Actual trusted key/HMAC values absent |
| Expanded demo removal | Passed in disposable PostgreSQL; hosted demo retained |

Automated tests use explicit fixture public/server configuration and disposable PostgreSQL/HTTP adapters. The QA town, reserved fictional contacts and test map destination are never hosted demo content. Browser tests block WhatsApp navigation and verify fallback links/recorded state instead. Installed Chrome was used through `PLAYWRIGHT_CHANNEL=chrome`; mobile is browser emulation, not a physical-device claim.

Security review found and corrected callback replacement-token handling in server HTML, retry validation before/after locks, and limited-client consumption of shared quotas. Regression tests cover those cases, authoritative price changes, unavailable/foreign products, malformed quantities, total limits, unauthorized RPC calls, idempotency conflicts, persisted retries, safe destinations, XSS and storage corruption. No Lighthouse score is claimed.

The build measured approximately 13.1 kB gzip for the public application chunk, 9.6 kB for lazy merchant code, 4.5 kB for shared cart/display code, 55.8 kB for the SDK and 12 kB combined CSS. Existing licensed WebP images are reused; no frontend dependency or image package was added.

## Files created or modified

| Area | Files |
| --- | --- |
| Database | New `supabase/migrations/20261112000500_merchants.sql`, `supabase/seeds/merchant-demo.sql`; prior migrations unchanged |
| Merchant renderer/controller | New `src/components/merchant-ui.js`, `src/pages/merchant.js`, `src/styles/merchant.css`, `src/data/merchant-repository.js` |
| Cart and display rules | New `src/domain/cart.js`, `src/domain/merchant.js`, `src/domain/whatsapp.js`, `src/services/cart-store.js`, `src/services/checkout-service.js` |
| Trusted server/HTML | New `src/server/checkout-handler.js`, `src/server/supabase.js`, `src/server/merchant-page.js`, `functions/api/checkout.js`, `scripts/vite-runtime.mjs`; updated `functions/[[path]].js` |
| Discovery integration | Updated `src/app.js`, `src/config/public-routes.js`, `src/components/discovery-ui.js`, `src/components/search-box.js`, `src/domain/discovery.js`, `src/pages/discovery.js`, `vite.config.js` |
| Tests | New `tests/fixtures/merchant-checkout.sql`, `tests/integration/merchant.test.js`, `tests/unit/merchant.test.js`, `tests/e2e/merchant.spec.js`; updated `tests/helpers/discovery-server.mjs`, `tests/unit/discovery.test.js`, `tests/e2e/discovery.spec.js`, `playwright.config.js` |
| Configuration | New blank `.dev.vars.example`; updated `.gitignore` and package description. Ignored local `.dev.vars` created separately; existing `.env`/`.env.local` and dependency versions preserved |
| Documentation | New `docs/merchant-architecture.md`, `docs/phase-3-setup.md`, this report; updated `README.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/security.md`, `docs/deployment-guide.md`, status/link notes in `docs/discovery-architecture.md`, `docs/migration-readiness.md` and `docs/phase-1-report.md`, `functions/README.md`, `src/domain/README.md` |

## SQL effects and limits

Migration 5 removes no business data, tables, foreign keys or Storage policies. It adds the limiter table with explicit RLS, nullable snapshots, demo image validation, slug reservation and narrow functions, and updates the invoker discovery view. Its limiter function deletes only expired counters older than two days when invoked. The separate destructive demo-removal script was not run remotely. Details and manual commands are in [Phase 3 setup](phase-3-setup.md).

No known failing Phase 3 checks remain. Start with `npm.cmd run dev`; current development configuration is ready. Real merchant checkout will require an administrator to configure a genuine verified contact and enabled actions; all current businesses intentionally remain fictional demos. Cart data is browser-local and can be lost if storage is cleared/blocked. Schedule status reflects published configuration, not guaranteed live stock or attendance.

Cloudflare deployment/runtime secret provisioning, real Auth login, uploaded Storage service checks, advanced SEO/sitemap, general analytics and imports remain unverified or deferred to their specified phases. Old listing-slug redirects are supported within assigned visible categories; cross-city/category-history changes require deliberate future administration. Production demo cleanup remains manual.

**Phase 4 — the single-administrator dashboard — is ready next, only when requested.**
