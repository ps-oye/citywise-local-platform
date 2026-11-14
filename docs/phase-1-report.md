# Phase 1 results

Completed on 12 November 2026. Only Phase 1 — architecture and foundation — has been implemented.

The pre-application migration review findings were corrected on the same date. See [migration readiness](migration-readiness.md) for the changes, compatibility guards and verified CLI 3.x commands. SQL was executed only in disposable PostgreSQL; no hosted migration or hosted dry run was performed.

## Delivered

- Separate runnable public and administration foundation entry points using HTML, CSS and vanilla ES modules with Vite.
- Modular configuration, shared components, repositories, services, utilities, reserved domain/backend boundaries and a responsive design system.
- Validated public environment configuration, a lazy-loaded Supabase SDK and an actual bounded connection check.
- Three ordered migrations defining 30 relational tables, integrity constraints, indexes, update triggers, RLS, single-admin authorization and minimal audit metadata.
- Private storage buckets with publication-aware reads and administrator/owner/path/type/size restrictions.
- A baseline city/brand seed plus optional repeatable fixtures for all 15 major categories, sample catalogs/offerings/hours and disabled promotions. Demo contact details and checkout are blocked.
- Development, security, administrator, database and hosting-preparation documentation.

AGENTS.md and docs/MASTER_SPEC.md were read completely and preserved. No discovery homepage, cart, checkout endpoint, admin login/CRUD interface or import workflow was introduced.

## Verification performed

| Check | Result |
| --- | --- |
| npm run check | 19 JavaScript files passed syntax checks |
| npm test | 38/38 unit and PostgreSQL integration tests passed, including 11 migration-safety cases |
| Migration execution | All three SQL migrations applied to disposable embedded PostgreSQL |
| Role tests | Anonymous, ordinary authenticated, allowlisted admin, revoked admin and trusted service behavior verified |
| Seed checks | Repeat installation and scoped cleanup passed in isolated databases |
| npm run build | Both HTML entry points and asset bundles built successfully |
| Initial UI run: npm run test:e2e with PLAYWRIGHT_CHANNEL=chrome | 6/6 desktop/mobile tests passed; not repeated for this SQL/documentation correction |
| Built preview smoke check | Public/admin HTTP 200, unknown route HTTP 404, unconfigured connection state, SDK deferral and keyboard skip navigation passed |
| Narrow layout | No horizontal overflow at 320 px; desktop and mobile screenshots inspected |
| Initial dependency review | npm install audited 29 packages and reported zero vulnerabilities before the later CLI addition; this SQL correction added no dependencies |
| git diff --check | Passed; Git reported only the existing Windows LF/CRLF conversion notice |

The browser checks use real Chrome with isolated HTTP fixtures for the SDK. The built-preview smoke check also ran against the final unconfigured dist output. Initial public/shared JavaScript totals approximately 6 kB before compression; the 216 kB Supabase SDK chunk is deferred when no connection is configured. No Lighthouse score is claimed.

## Limits and remaining integration checks

The current migration suite has no failing checks. Docker and psql were not found; the Supabase CLI is now installed locally as a development dependency. PGlite executes actual PostgreSQL SQL but uses test-only representations of Supabase-owned Auth and Storage schemas. Test verification does not load application environment files or connect to a real project.

Real JWT/Auth behavior, hosted signup settings, PostgREST schema exposure, Storage HTTP MIME/size enforcement, image byte validation and Cloudflare header delivery remain service-level checks. Those are not represented as completed. The downloaded Chromium headless executable could not launch on this Windows machine; all browser tests passed using installed Chrome, as documented in README.

Discovery, search behavior, merchant rendering, automatic hours calculations, cart/checkout, admin workflows, imports, analytics and production SEO remain in their specified later phases.

## Manual setup required

1. Run npm ci and npm run dev (use npm.cmd in Windows PowerShell). The foundation works with both Supabase values blank.
2. Create or start an isolated Supabase development project and review/apply the migrations in order. Apply supabase/seed.sql afterward.
3. Disable hosted signup and anonymous sign-in, then manually provision one Auth user and its UID in private.admin_users. See admin-guide.md.
4. Put the public project URL and publishable/anon key in an ignored .env.local file; restart Vite and use the connection check.
5. Optionally install the fictional demo seed in development. Cleanup is a reviewed manual operation; cleanup tests only affect disposable PostgreSQL.
6. Configure and verify real service behavior before subsequent features rely on it. Hosting configuration is documented for a later requested deployment.

No production deployment, remote migration, remote data deletion, media upload or credential provisioning was performed.

**Next ready phase: Phase 2 — public homepage and discovery. Stop here until it is requested.**

## Files modified

- [README.md](../README.md) — project setup, commands, architecture map, service configuration, verification and limitations.

## Files created

- [.editorconfig](../.editorconfig)
- [.env.example](../.env.example)
- [.gitignore](../.gitignore)
- [.nvmrc](../.nvmrc)
- [admin/index.html](../admin/index.html)
- [docs/admin-guide.md](../docs/admin-guide.md)
- [docs/architecture.md](../docs/architecture.md)
- [docs/database-schema.md](../docs/database-schema.md)
- [docs/deployment-guide.md](../docs/deployment-guide.md)
- [docs/migration-readiness.md](../docs/migration-readiness.md)
- [docs/phase-1-report.md](../docs/phase-1-report.md)
- [docs/security.md](../docs/security.md)
- [functions/README.md](../functions/README.md)
- [index.html](../index.html)
- [package-lock.json](../package-lock.json)
- [package.json](../package.json)
- [playwright.config.js](../playwright.config.js)
- [public/404.html](../public/404.html)
- [public/_headers](../public/_headers)
- [public/icons/mark.svg](../public/icons/mark.svg)
- [public/images/listing-placeholder.svg](../public/images/listing-placeholder.svg)
- [public/robots.txt](../public/robots.txt)
- [scripts/check.mjs](../scripts/check.mjs)
- [src/admin/app.js](../src/admin/app.js)
- [src/app.js](../src/app.js)
- [src/components/brand.js](../src/components/brand.js)
- [src/config/environment.js](../src/config/environment.js)
- [src/data/platform-repository.js](../src/data/platform-repository.js)
- [src/data/supabase-client.js](../src/data/supabase-client.js)
- [src/domain/README.md](../src/domain/README.md)
- `src/pages/foundation.js` — created in Phase 1; the unused renderer was removed during [Phase 7 cleanup](phase-7-report.md).
- [src/services/platform-service.js](../src/services/platform-service.js)
- [src/styles/base.css](../src/styles/base.css)
- [src/styles/components.css](../src/styles/components.css)
- [src/styles/layout.css](../src/styles/layout.css)
- [src/styles/main.css](../src/styles/main.css)
- [src/styles/tokens.css](../src/styles/tokens.css)
- [src/utils/dom.js](../src/utils/dom.js)
- [src/utils/format.js](../src/utils/format.js)
- [src/utils/urls.js](../src/utils/urls.js)
- [supabase/config.toml](../supabase/config.toml)
- [supabase/functions/README.md](../supabase/functions/README.md)
- [supabase/migrations/20261112000100_core.sql](../supabase/migrations/20261112000100_core.sql)
- [supabase/migrations/20261112000200_security.sql](../supabase/migrations/20261112000200_security.sql)
- [supabase/migrations/20261112000300_storage.sql](../supabase/migrations/20261112000300_storage.sql)
- [supabase/seed.sql](../supabase/seed.sql)
- [supabase/seeds/demo.sql](../supabase/seeds/demo.sql)
- [supabase/seeds/remove-demo.sql](../supabase/seeds/remove-demo.sql)
- `tests/e2e/foundation.spec.js` (replaced in Phase 2 by [the discovery browser suite](../tests/e2e/discovery.spec.js))
- [tests/fixtures/supabase-system.sql](../tests/fixtures/supabase-system.sql)
- [tests/helpers/database.js](../tests/helpers/database.js)
- [tests/integration/database.test.js](../tests/integration/database.test.js)
- [tests/integration/migration-safety.test.js](../tests/integration/migration-safety.test.js)
- [tests/unit/foundation.test.js](../tests/unit/foundation.test.js)
- [vite.config.js](../vite.config.js)
