# Phase 5 results — Excel imports and catalog management

Completed 13 November 2026 (Asia/Kolkata). Phase 5 only was implemented. Phase 6 and production deployment were not started.

## Delivered behavior

The existing single-admin dashboard now has **Products & imports**, with a city-scoped, searchable merchant picker for commerce/restaurants. Catalog pages support bounded search/status filters and pagination, manual product create/edit/archive/restore, merchant product-category management and selection of existing merchant images. Changes use Supabase RPCs and the existing RLS-protected relational catalog; newly added products require no public source change.

The import workflow downloads Excel/CSV templates, accepts UTF-8 CSV and XLSX with worksheet selection, validates headings/rows/duplicate SKUs, displays server-derived New/Updated/Unchanged/Invalid classifications and before/after differences, and requires an explicit confirmation dialog. Insert/update matches `(merchant_id, sku)`; price-only updates reject unknown SKUs and non-price columns. Missing products remain untouched. A single invalid row blocks all application. Reports persist with source row/column/code/messages, a summary and formula-safe CSV export; history is merchant-scoped and paged.

Confirmation revalidates authorization, actor, expiry, snapshot and target identities/revisions, then changes all products in one transaction. Stale previews require another review. A later-row failure rolls back every product/version change while retaining a failed report. Lost-response retries reuse the same job and cannot apply twice. Manual archive retains SKU/enquiry history and restoration leaves the product inactive.

Files are parsed in a cancellable, time-limited same-origin worker. ZIP/XML preflight bounds expansion and cell positions and rejects formulas including cached values, malformed/ambiguous XML, external relationships and active content. Excel SKUs require text cells. The original workbook is not uploaded. See [the catalog guide](catalog-guide.md) for all columns, blank-versus-omitted behavior, references and limits.

## Database and security

Added and applied only [migration 7](../supabase/migrations/20261113000700_catalog.sql) to the previously approved **rawatbhata-one-dev** project (`qyzcvmghhwxctwlaqhrq`). The dry run listed exactly that migration; the post-apply dry run is up to date. Earlier migrations/seeds were not replayed. Existing 33 listings, 110 products and the sole administrator were preserved; zero hosted import jobs or additional QA businesses/products/media were created.

The migration adds a private bounded preview table, composite job/merchant FK, RLS policy/timestamp trigger, one product index, nine private helpers and 11 guarded public RPCs. Public RPCs remain security invokers; four narrow private definer helpers perform authorized operational writes/locking. Authenticated users gain no private-table INSERT/UPDATE/DELETE grants. Public visibility and Storage policies remain unchanged.

Live read-only verification confirmed:

- Ledger latest version `20261113000700`; all 32 application tables have RLS.
- All 30 public admin RPCs are invokers with empty search paths, authenticated execution and no anon/PUBLIC execution grants.
- Preview SELECT is admin-policy protected; anon SELECT and authenticated mutations are denied. Both media buckets remain private.
- Anonymous catalog HTTP access fails with SQLSTATE `42501`; public discovery still returns 15 categories.
- A read-only authenticated-role transaction using the existing allowlisted UID reads catalog context, products and empty import history successfully.

Installation has no business-data updates/deletions, `DROP` or `TRUNCATE`. The private preview's `ON DELETE CASCADE` only cleans its artifact if an operator later deletes the parent import job; no such deletion occurs here. Dashboard removal is explicit soft archive. See [setup and destructive-statement explanation](phase-5-setup.md).

## Executed verification

| Check | Result |
| --- | --- |
| `npm.cmd run verify` | Passed: syntax checks for 83 JS files, **128 unit/SQL integration tests**, production build of both entry points |
| Full Playwright regression using installed Chrome | **84 passed**: 42 desktop and 42 mobile-emulation cases, no retries |
| Final manual editor button-guard check | **2 passed**, desktop/mobile archive and restore, after retaining the button reference across confirmation |
| `npm.cmd audit --audit-level=moderate` | **0 vulnerabilities** |
| Migration dry run / application / final dry run | Only migration 7 applied to the approved dev project; now up to date |
| Live permission and public/read-only admin checks | Passed as described above; no hosted catalog writes used for QA |
| Built-output secret scan | 63 built files checked against both configured server-secret values; **0 matches**; public entry has no import-parser reference |
| Visual inspection | Desktop/mobile import report screenshots inspected; controls/tables remain usable without page overflow |

Phase 5 adds 15 parser/reader unit tests, 10 actual-SQL catalog integration tests and eight browser scenarios run in both projects. Coverage includes header aliases/missing/unknown/duplicate columns, UTF-8/BOM/quotes/delimiters/blank rows, exact money and leading-zero SKUs, worksheet selection, invalid types/values, foreign category/images, duplicate SKUs, archived/unknown SKU handling, and original-price preservation. Security cases include cached/prefixed formulas, namespace attribute collisions, misplaced/out-of-order cells, ZIP CRC/path/declared-versus-actual expansion, external relationships/entities, worker termination and stale file-read isolation.

Transactional tests prove preview does not mutate products, all-or-nothing apply, missing-product preservation, settled-job idempotency, stale/expired/actor-revoked rejection and rollback after a later-row database failure. A concurrent-SKU substitution regression verifies that a target appearing after the fingerprint check cannot be adopted. Browser coverage includes templates/downloads, manual catalog/category editing and public visibility, both import modes, validation reports, stale re-preview, lost HTTP confirmation response and late report-page callbacks. A strict-CSP XLSX case uses more than 512 KiB of shared-string XML without allowing blob workers. Existing discovery, merchant, cart, checkout, admin/Auth/Storage and migration-safety tests remain green.

An isolated PGlite timing run with 1,000 products and 500-character descriptions measured **1,396 ms preparation** and **758 ms application**, with all 1,000 changes applied. This is a local measurement, not a hosted performance guarantee. The lazy catalog JS is approximately 63.78 kB minified / 23.30 kB gzip, catalog CSS 4.97 kB / 1.43 kB gzip, and worker 111.90 kB minified. Public browsing does not load the catalog route/worker.

## Files created or changed for this phase

Earlier phase files already present in the workspace are not new Phase 5 work. Git currently treats much of the earlier implementation as untracked; nothing was staged or committed by this phase.

| Created | Purpose |
| --- | --- |
| `supabase/migrations/20261113000700_catalog.sql` | Guarded catalog/import database operations and private artifacts |
| `src/domain/catalog-import.js` | Shared column contract, helpful validation and limits |
| `src/services/catalog-file-parser.js` | Bounded CSV/ZIP/XML/XLSX parsing |
| `src/services/catalog-file-reader.js` | Worker lifecycle, request identity, timeout/cancellation |
| `src/services/catalog-downloads.js` | XLSX/CSV templates and safe CSV reports |
| `src/workers/catalog.worker.js` | Isolated file/worksheet parsing |
| `src/admin/pages/catalog.js` | Lazy catalog router, merchant picker, products and tabs |
| `src/admin/catalog-ui.js` | Shared merchant navigation and error rendering |
| `src/admin/catalog-product-editor.js` | Manual product/category management |
| `src/admin/catalog-imports.js` | File workflow, preview, confirmation, history and reports |
| `src/styles/catalog.css` | Responsive catalog/import presentation |
| `tests/helpers/catalog-files.js` | Test-only XLSX fixture generation |
| `tests/unit/catalog-import.test.js` | Parser/templates/security regressions |
| `tests/unit/catalog-reader.test.js` | Worker timeout and stale read regressions |
| `tests/integration/catalog.test.js` | Actual SQL/RLS, revisions and atomic imports |
| `tests/e2e/catalog.spec.js` | Desktop/mobile catalog/import flows |
| `docs/catalog-architecture.md` | Implementation plan, final boundaries and parser references |
| `docs/catalog-guide.md` | Administrator workflow and complete file contract |
| `docs/phase-5-setup.md` | Development setup, migration and retention effects |
| `docs/phase-5-report.md` | This results/verification/file inventory |

| Modified | Purpose |
| --- | --- |
| `package.json`, `package-lock.json` | Four justified pinned parser/ZIP/XML dependencies |
| `src/admin/app.js` | Products & imports navigation and lazy route |
| `src/data/admin-repository.js` | Catalog/import RPC methods and structured validation details |
| `src/domain/admin.js` | Safe catalog/import error messages |
| `tests/helpers/discovery-server.mjs` | Bounded import JSON request fixture support |
| `tests/integration/admin.test.js` | Preserve invoker/admin checks with the additional RPCs |
| `README.md` | Current Phase 5 scope, setup and navigation |
| `docs/admin-guide.md`, `docs/architecture.md` | Current catalog workflows and architecture links |
| `docs/database-schema.md`, `docs/security.md` | New artifact/RPC/security contracts |
| `docs/deployment-guide.md` | Current dev migration level and unchanged runtime bindings |

## Manual use and remaining limits

Run `npm.cmd ci` if dependencies have not been installed, then `npm.cmd run dev`. Open `/admin/`, use the existing administrator credentials and choose **Products & imports**. No new credentials or account provisioning are required in the configured development project. Do not send the password to chat. For another database, apply reviewed pending migrations through 7 as described in [setup](phase-5-setup.md).

No remaining Phase 5 blocker was found. Deliberate limits are 5 MiB files, 1,000 data rows, 1 MiB normalized JSON, 16 MiB expanded workbooks, 30-minute previews and plain-value `.xlsx`/UTF-8 CSV input. There is no full replacement, automatic history purge, hard product delete or automatic catalog restore. Import history retains bounded normalized business rows/plans privately. Larger catalogs must be split into files.

Password sign-in and import writes were exercised against isolated Auth/HTTP fixtures with the actual SQL/RLS, not by requesting the user's password or writing hosted QA content. The hosted admin smoke check used a read-only database role transaction. Mobile coverage is Chromium emulation, not physical Safari; no Lighthouse score or Cloudflare deployment verification is claimed.

**Phase 6 — SEO, analytics and deployment — is ready next and has not been started.**
