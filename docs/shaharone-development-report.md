> Historical document: the delivery and single hosted environment update supersedes the earlier root/city-selection and separate-backend requirements. See [current release guidance](delivery-release-guide.md).

# ShaharOne development results

Completed locally on 16 November 2026. The existing repository, vanilla JavaScript application, Cloudflare Pages project and Supabase architecture were reused. No deployment, Git push, DNS/Cloudflare/Auth configuration change, hosted database write or migration was performed.

## Delivered behavior

- ShaharOne branding across public/admin shells, titles, metadata, WhatsApp enquiry text, placeholder/share artwork and original SVG/PNG favicons. The package name is now `shaharone`; hosting, database and persistence identifiers retain their legacy names for compatibility.
- `/` is a server-rendered platform landing and city selector. It reads enabled cities through existing anonymous RLS, searches city names and pages at 24 cards (fetching at most 25 public rows). Rawatbhata remains first/default. The platform landing does not load city listings or advertisements.
- `/rawatbhata/` retains discovery, categories, ads, locality filters and ranked sections. `/:city/` reuses the same implementation for additional enabled cities. Unknown/disabled cities never silently load Rawatbhata.
- City-aware header/footer, native and enhanced search, breadcrumbs, categories and merchant links. Existing `/:city/:category/:merchant` routes, historical merchant slugs and root quick-look query links remain usable. City home URLs use trailing slashes; the existing 120-character database slug limit remains supported.
- Environment-driven canonical/OG/Twitter/schema/share URLs, ready for `https://shaharone.in`. Relative internal navigation keeps local/preview browsing on its current host. Existing demo and preview noindex protections remain.
- A separate `/sitemaps/platform.xml` includes `/`; database sitemap pages normalize city-home trailing slashes without changing applied SQL or exceeding their 1,000-URL limit. robots/sitemaps retain production opt-in and matching-origin checks.
- Guarded legacy-host and www redirects are prepared, **disabled by default**. Old Pages `/` maps to `/rawatbhata/`; already city-scoped paths retain their paths; www maps to the apex. Queries survive. GET/HEAD only; API writes are not redirected. Static/admin host coverage requires the manual Cloudflare rules documented in the launch guide.
- Separate development/production environment examples, production safeguards and a deployment readiness check that now verifies public city selection as well as the city homepage. Current development credentials were preserved; only local branding/site flags changed.

The audit confirmed that cities, localities, listings, product identifiers, ranking, schedules and advertisements already have the necessary city relationships. No schema migration, row rewrite or media move is needed. Applied migrations and seeds were left unchanged. Existing browser storage keys preserve carts, pending checkout idempotency and admin preferences on the same origin. Browser carts and Auth sessions cannot transfer automatically to a different domain.

## Verification executed

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: syntax checked 110 JS files, 168 unit/SQL tests, public/admin build |
| `npm run test:e2e -- --output=test-results/shaharone-final` with installed Chrome | Passed: 116 checks across desktop and mobile |
| Focused ShaharOne and SEO/analytics browser run | Passed: 20 checks |
| Final route/redirect/deployment unit checks after retaining 120-character city-slug compatibility | Passed: 24 checks |
| `npm run pages:build` | Passed: final Vite bundle and Pages Function compilation |
| `npm run deploy:check` | Passed: read-only existing development backend check, city selector/homepage ready, 73 built files checked, zero configured secret matches in public output |
| `npm run production:check` against current development configuration | Correctly refused: missing production origin/ref and development project reserved for preview |
| `npm audit --audit-level=low` | Zero vulnerabilities |
| `git diff --check` with Windows CRLF recognized | Passed |

The isolated browser/SQL suites cover city switching and search isolation, no-JavaScript navigation, merchant routes and all 33 demo merchant pages, cart persistence/price revalidation, authoritative WhatsApp initiation/handoff, RLS/admin authorization, media uploads, advertisements, ranking, hours/closures, XLSX/CSV imports and analytics/privacy. They do not use hosted database credentials or create hosted test fixtures.

Failures found during implementation were fixed: outdated root/label and fixture-count expectations, a startup race that could clear a typed city search, and a pre-existing minute-boundary timing assumption in the isolated analytics budget test. Server-rendered city-search inputs are now reused during hydration; the browser test deliberately delays JavaScript to verify that typed input survives. The analytics test uses PostgreSQL's transaction-stable clock; production rate-limit SQL was not changed.

### Local Cloudflare performance

`npm run performance` passed against isolated SQL fixtures and the actual local Pages runtime. All eight runs scored **100 accessibility** and **100 best practices**. Performance scores:

| Page | Mobile | Desktop |
| --- | ---: | ---: |
| Platform `/` | 99 | 100 |
| City `/rawatbhata/` | 93 | 100 |
| Category | 96 | 100 |
| Merchant | 98 | 100 |

SEO scores were 66 for the platform and 69 for the other pages. The only failing SEO audit was the intentional preview **noindex** directive. It was retained. These are reproducible local lab measurements, not production field Core Web Vitals. Full Lighthouse JSON/HTML and screenshots remain in ignored `artifacts/lighthouse/` and `test-results/`.

## Remaining launch work

No broken routes or integrations remain in the executed regression suite. Final-domain DNS/TLS, real production Auth login/uploads and a real verified WhatsApp handoff require operator checks after release configuration. Actual checkout remains disabled for fictional demo merchants. The production database/domain have not been provisioned or declared ready by this task; the production preflight correctly blocks the development setup.

Follow the [manual Cloudflare, Supabase, Auth and DNS checklist](shaharone-launch-guide.md). Obtain deployment approval before pushing the Git-connected production branch. Keep previews on the existing development database and noindex. There is no next implementation phase requested; the next step is an explicitly approved preview/release process.

## Files created or modified

The list below records this rebrand's local changes. Previously pending README/admin/deployment documentation changes were retained and updated. The pre-existing untracked `docs/git-deployment-guide.md` was retained without claiming it as a new rebrand deliverable. Ignored `.env.local` and `.dev.vars` received only local brand/site-flag updates; their credentials remain unchanged. Build/test outputs are ignored and not listed as source files.

<!-- changed-files -->

### Created

- `.dev.vars.production.example`
- `.env.development.example`
- `.env.production.example`
- `docs/shaharone-development-report.md`
- `docs/shaharone-launch-guide.md`
- `docs/shaharone-migration-plan.md`
- `public/icons/apple-touch-icon.png`
- `public/icons/favicon-32.png`
- `src/components/platform-home.js`
- `src/domain/cities.js`
- `src/server/site-redirects.js`
- `src/styles/platform.css`
- `tests/e2e/shaharone.spec.js`
- `tests/unit/shaharone.test.js`

### Modified

- `.dev.vars.example`
- `.env.example`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `admin/index.html`
- `docs/MASTER_SPEC.md`
- `docs/admin-guide.md`
- `docs/deployment-guide.md`
- `functions/[[path]].js`
- `index.html`
- `package-lock.json`
- `package.json`
- `playwright.config.js`
- `public/404.html`
- `public/icons/mark.svg`
- `public/images/listing-placeholder.svg`
- `public/images/share-card.png`
- `public/images/share-card.svg`
- `scripts/create-share-card.mjs`
- `scripts/deployment-config.mjs`
- `scripts/measure-performance.mjs`
- `scripts/qa-preview.mjs`
- `scripts/smoke-preview.mjs`
- `scripts/vite-runtime.mjs`
- `src/admin/app.js`
- `src/admin/pages/taxonomy.js`
- `src/app.js`
- `src/components/merchant-ui.js`
- `src/config/environment.js`
- `src/config/public-routes.js`
- `src/data/discovery-repository.js`
- `src/domain/seo.js`
- `src/domain/whatsapp.js`
- `src/pages/discovery.js`
- `src/pages/merchant.js`
- `src/server/discovery-page.js`
- `src/server/merchant-page.js`
- `src/server/public-catalog.js`
- `src/server/seo-endpoints.js`
- `src/server/seo-html.js`
- `tests/e2e/admin.spec.js`
- `tests/e2e/discovery.spec.js`
- `tests/e2e/final-qa.spec.js`
- `tests/e2e/seo-analytics.spec.js`
- `tests/helpers/discovery-server.mjs`
- `tests/integration/discovery.test.js`
- `tests/integration/seo-analytics.test.js`
- `tests/unit/deployment.test.js`
- `tests/unit/discovery.test.js`
- `wrangler.jsonc`
