# Phase 6 results — SEO, analytics and deployment

Completed 13 November 2026 (Asia/Kolkata). Scope: Phase 6 only. The requested development preview is deployed at [964c0074.rawatbhata-one.pages.dev](https://964c0074.rawatbhata-one.pages.dev), with [admin login here](https://964c0074.rawatbhata-one.pages.dev/admin/). It uses the existing development Supabase database and stays **noindex**. Phase 7 has not started.

## Delivered behavior

- Homepage, category, explore, search and merchant URLs return meaningful database-backed HTML before JavaScript. Native search/pagination work without JavaScript; bootstrap data avoids redundant initial browser fetches. Newly published listings need no source edit or rebuild. Missing/hidden content returns real 404s; backend failures return safe 503s.
- Shared titles, descriptions, canonical URLs, Open Graph/Twitter cards and escaped JSON-LD stay current during browser navigation. Structured data contains no invented ratings, reviews, offers, availability or fictional business entities. Production indexing requires explicit flags, a matching HTTPS canonical origin and eligible real content.
- Dynamic robots and paginated XML sitemaps respect the selected environment. Demos/search/filtered/admin/error/preview pages remain noindex. Eligible production sitemap paths use the merchant router's visible-category precedence. Stable social-image URLs recheck public RLS visibility with no privileged read credential. An original 1200 × 630 share card is included.
- Optional listing/contact/ad activity goes through strict same-origin, size-bounded, rate-limited, service-only ingestion. Event retries are idempotent; conflicting UUID reuse fails atomically. DNT/GPC and explicit opt-out suppress activity. The memory-only queue has no persistent visitor identity. Visible-ad qualification excludes hidden slides, placeholders, background tabs and application modals.
- The single-admin dashboard now reports city-local trends, listing/contact/ad metrics, top listings/promotions and bounded recent enquiry references, with date ranges up to 90 days and explicit demo inclusion. Browser reports are separate from trusted checkout initiation and handoff preparation; neither is described as a sent message or completed order. Report responses omit contacts, notes and item snapshots.
- Pinned Wrangler/Lighthouse tooling, Pages routing/headers, custom Supabase CSP support, public/server configuration checks, artifact secret scanning, production guards and reproducible performance/hosted smoke scripts are implemented. Preview bindings and production defaults are separated.

## Hosted setup and homepage correction

Cloudflare authentication completed, and project `rawatbhata-one` was published through Direct Upload on preview branch `phase-6`, separately from production branch `main`. The returned immutable URL is recorded in ignored `artifacts/preview-deployment.json`. Runtime secrets were uploaded only to preview through stdin. No production deployment, custom domain, DNS, paid service or repository push was performed.

Migrations 8 and 9 were reviewed and applied only to the authorized `rawatbhata-one-dev` project. No seed was replayed; all 33 fictional listings, 110 products and the single active administrator were retained. Read-only live checks verified 33 RLS tables, 31 guarded invoker admin RPCs, service-only event writers, private buckets and an up-to-date migration ledger. Details and destructive-statement explanations are in [Phase 6 setup](phase-6-setup.md).

The first hosted homepage check exposed an expensive pre-existing `discovery_home` query exceeding Supabase's anonymous statement timeout. Migration 9 bounds selected identities before enriching cards, materializes reusable results and disables JIT only for that function. It preserves the public contract, ranking, service-area/locality matching, four-card limits and existing RLS/ACLs. No global timeout or security policy was relaxed. After the correction, initial four-section calls took 434–497 ms. Six-section checks took 553 ms without a locality and 631–684 ms across the three demo localities, with live rank/locality assertions passing. These are observed requests, not latency guarantees.

## Executed verification

| Check | Result |
| --- | --- |
| `npm run verify` after migration 9 | 154 unit/SQL integration tests passed, syntax checks passed, both public/admin builds succeeded |
| Full Playwright suite | 96 passed: 48 desktop and 48 mobile |
| Discovery/SEO browser rerun after migration 9 | 38 passed |
| Targeted discovery/database/migration-safety SQL after migration 9 | 39 passed |
| Deployment guard tests after adding homepage readiness probe | 5 passed |
| `npm run pages:functions` and actual Pages upload | Functions compiled successfully; deployed preview verified |
| `npm run deploy:check` | 71 built files checked, zero configured server-secret matches, public catalog/homepage/Phase 6 schema ready, server credential verified |
| `npm audit --audit-level=moderate` | Zero vulnerabilities |
| Actual hosted HTTP smoke | 14 checks passed: HTML, metadata, noindex, robots/empty sitemap, image, immutable JS, real 404, event boundaries, checkout method and unauthenticated upload rejection |
| Actual hosted desktop/mobile browser smoke | Both passed: 15 categories, navigation, sample cart, demo checkout disabled, admin form present; zero page errors |
| Actual local Pages runtime/Lighthouse | Home/category/merchant verified on simulated mobile and desktop; all six reports generated |
| Desktop/mobile visual inspection | Public preview and analytics screenshots inspected; responsive layouts, readable controls and deliberate table/rail scrolling |

SQL tests execute real migrations/role changes in disposable PostgreSQL fixtures, including all prior admin/import/checkout behaviors. New tests cover sitemap/public-media visibility, service-only writes, quota persistence, cross-city targets, idempotency, revocation, date boundaries and enquiry counting. Browser tests use installed Chrome with mobile emulation and isolated Auth/Storage fixtures; no hosted password or business/media fixture is required. Hosted smoke browsers sent DNT to avoid optional test activity.

Earlier browser assertion failures were fixed for the SSR bootstrap contract, six overview cards and collapsed mobile controls; the full suite then passed. A missing category-results heading found by Lighthouse was corrected before the final measurements.

## Measured performance

Lighthouse 13.6.0 ran against the actual local Cloudflare Pages runtime and isolated demo SQL fixtures on 13 November 2026. Mobile and desktop use Lighthouse's simulated conditions. Reports are ignored local artifacts at `artifacts/lighthouse/{page}-{device}.html`/`.json`, with `summary.json` measured at `2026-11-13T11:04:07.105Z`.

| Page | Device | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | Mobile | 92 | 100 | 100 | 69 | 3.287 s | 0.051 |
| Home | Desktop | 100 | 100 | 100 | 69 | 0.649 s | 0.0002 |
| Category | Mobile | 96 | 100 | 100 | 69 | 2.503 s | 0.051 |
| Category | Desktop | 100 | 100 | 100 | 69 | 0.589 s | 0.0002 |
| Merchant | Mobile | 97 | 100 | 100 | 69 | 2.310 s | 0.051 |
| Merchant | Desktop | 100 | 100 | 100 | 69 | 0.245 s | 0.0002 |

SEO's sole failed audit is intentional crawlability: the requested preview sends both meta and HTTP **noindex**. Other applicable SEO audits pass. Production SEO scores have not been measured and are not inferred from this preview. These are lab scores, not live field Core Web Vitals; mobile home/category LCP still has room to improve. No third-party analytics script or frontend framework was introduced.

## Files created or modified in Phase 6

The repository already contained uncommitted/untracked work from earlier phases. This inventory describes Phase 6's changes rather than treating all untracked files as new in this phase. No commit/staging operation was performed.

| Area | Created |
| --- | --- |
| SQL | `supabase/migrations/20261113000800_seo_analytics.sql`, `supabase/migrations/20261113000900_homepage_query.sql` |
| Domain/components | `src/domain/seo.js`, `src/domain/analytics.js`, `src/components/discovery-home.js` |
| Public/server services | `src/services/analytics.js`, `src/server/public-catalog.js`, `src/server/seo-html.js`, `src/server/discovery-page.js`, `src/server/seo-endpoints.js`, `src/server/events-handler.js`, `functions/api/events.js` |
| Admin | `src/admin/pages/analytics.js`, `src/styles/analytics.css` |
| Deployment/performance | `wrangler.jsonc`, `.cloudflare.env.example`, `public/_routes.json`, `scripts/deployment-config.mjs`, `scripts/check-deployment.mjs`, `scripts/deploy-preview.mjs`, `scripts/measure-performance.mjs`, `scripts/smoke-preview.mjs`, `scripts/create-share-card.mjs` |
| Artwork | `public/images/share-card.svg`, `public/images/share-card.png` |
| Tests | `tests/integration/seo-analytics.test.js`, `tests/unit/seo-analytics.test.js`, `tests/unit/deployment.test.js`, `tests/e2e/seo-analytics.spec.js` |
| Documentation | `docs/seo-analytics-architecture.md`, `docs/phase-6-guide.md`, `docs/phase-6-setup.md`, `docs/phase-6-report.md` |

| Area | Modified |
| --- | --- |
| Configuration/build | `package.json`, `package-lock.json`, `.gitignore`, `.dev.vars.example`, `vite.config.js`, `src/config/security-headers.js`, `src/config/public-routes.js` |
| Runtime/SEO integration | `scripts/vite-runtime.mjs`, `functions/[[path]].js`, `src/server/merchant-page.js`, `public/robots.txt`, `public/_headers` |
| Public UI | `index.html`, `src/app.js`, `src/pages/discovery.js`, `src/pages/merchant.js`, `src/domain/discovery.js`, `src/components/promotion-carousel.js`, `src/components/discovery-ui.js`, `src/styles/discovery.css` |
| Admin integration | `src/admin/app.js`, `src/data/admin-repository.js` |
| Test fixtures/assertions | `tests/helpers/discovery-server.mjs`, `tests/unit/discovery.test.js`, `tests/e2e/admin.spec.js`, `tests/e2e/catalog.spec.js`, `tests/e2e/discovery.spec.js` |
| Existing documentation | `README.md`, `docs/admin-guide.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/security.md`, `docs/deployment-guide.md`, `docs/asset-credits.md`, `functions/README.md` |

Generated ignored artifacts include deployment/HTTP/browser/discovery summaries, Lighthouse HTML/JSON, compiled Functions, fixture builds and desktop/mobile screenshots. Real environment files were not modified, and credentials are not included in these reports.

## Remaining limits and next phase

There are no remaining blockers for browsing the authorized development preview. Real admin password login, real Storage uploads and verified-business WhatsApp handoff were not performed against the hosted database; authorization and transactional workflows were tested with isolated SQL/HTTP fixtures. Real production contacts, final-domain indexing, rich-result validation, Search Console, retention/backups and production field measurements require the eventual production environment.

The single-admin report shows approximate event activity, not unique users or guaranteed ad delivery. Events/enquiries currently retain history without an automatic purge. Preview noindex does not restrict public access. Demo merchants remain deliberately fictional and cannot send real checkout messages.

See [setup/manual configuration](phase-6-setup.md) and [the operational guide](phase-6-guide.md). Production deployment is separate. **Phase 7 — Final QA and cleanup is ready next; stopped after Phase 6.**
