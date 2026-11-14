# Phase 4 results

Completed 13 November 2026 (Asia/Kolkata). Scope is Phase 4 only. Phase 5 is ready next and has not been started. No website was deployed.

## Delivered

- A separate, responsive `/admin/` workspace in vanilla HTML/CSS/ES modules, with a password login, keyboard navigation, accessible form labels, loading/empty/error states, confirmations and unsaved-edit guards.
- Supabase Auth `getUser()` verification plus the database-backed singleton UID allowlist. Tab-scoped sessions, refresh, local sign-out, access rechecks and a sessionless public app. No public/customer/merchant signup or login was introduced.
- Real city-scoped overview counts, paged merchant search, merchant creation/editing, category assignments and typed category details, service areas, relevant offerings, contact verification, publication, enablement, sponsorship, archive/restore and automatically accessible public URLs.
- Category CRUD and city/locality management, with stable existing slugs, default-city handling and foreign-key protection.
- Banner/logo/gallery uploads and metadata controls, native image processing, strict bounded WebP output, caller-scoped authenticated Storage operations and explicit image removal. Uploaded private media takes priority over demo placeholders; logos render on public merchant pages.
- Paused-first advertisements with desktop/mobile variants, safe destinations, linked merchants, city-timezone schedules, priority, sponsorship and archiving.
- Homepage section title/order/visibility, merchant placement, accessible up/down ranking and featured controls. Public sections retain the maximum of four eligible listings.
- Weekly/split/overnight hours, special dates, holidays, overlap rejection, emergency closure, scheduled expiry, manual reopening and return to automatic hours. Closures remain independent of listing publication.
- Transactional, audited admin mutations and stale-record rejection, including all media changes. Scoped SQL deletion behavior is explained in [Phase 4 setup](phase-4-setup.md).

## Verification actually run

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: syntax check of 69 JavaScript files, 103 unit/SQL integration tests and production build |
| `PLAYWRIGHT_CHANNEL=chrome npx playwright test` | Passed all 68 tests: 34 desktop and 34 mobile-emulation cases, including the 16 admin workflow cases and all previous discovery/merchant regressions |
| `npm audit --audit-level=moderate` | Passed, 0 reported vulnerabilities across installed dependencies |
| `npm audit --omit=dev --audit-level=moderate` | Passed, 0 reported runtime vulnerabilities |
| Exact server-secret scan of production output | Passed: 58 files scanned, no configured server credential/HMAC values found |
| Real development migration dry run after push | Up to date; no pending migration, seed or role changes |
| Real Auth settings and account checks | Public signup disabled, email login enabled, exactly one active allowlisted existing user with confirmed email |
| Live anonymous Data API checks | Admin RPC rejected (HTTP 401 / SQLSTATE 42501); public discovery succeeded with all 15 categories |
| Live authenticated database-role read smoke | Allowlisted UID passed `is_admin()`, overview and context reads inside a read-only transaction; no business rows changed |
| Live grants/Storage review | 19 invoker admin RPCs; none executable by anon; both platform buckets private |
| Visual review | Desktop and emulated mobile screenshots inspected; forms, dialogs and horizontal table/navigation containers remain usable without document overflow |

The isolated HTTP fixture implements Auth/Storage transports while applying the actual migration SQL and RLS. It uses no real credentials and cannot connect to hosted Supabase. Browser coverage includes ordinary-user rejection, wrong password, session separation, refresh/sign-out, UID revocation, merchant publication/archive, image processing/public rendering/removal, invalid file rejection, hours/closures/reopening, ranking visibility, scheduled promotions, taxonomy CRUD and city-switch/unsaved-form protection.

Issues found and fixed during review/testing included auth callback races and SDK-lock avoidance, clear accessible labels, wrong-city editor context, stale revisions masked by media operations, ambiguous-upload compensation, browser-generated ICC metadata, scoped real-time override cancellation and weekly/special-date overlap validation. The final browser result is recorded as passed in `test-results/.last-run.json`.

## Development project changes

Only `20261112000600_admin.sql` was applied to the approved `rawatbhata-one-dev` project. Earlier migrations and demo seeds were not replayed. No business, product, customer or hosted media test fixture was created/deleted. The dataset remains 33 fictional merchants and 110 products. Existing RLS, public discovery and private bucket policies remain active.

The user supplied an existing Auth UUID; the guarded operator script added that UID to the single-admin allowlist. No password, invitation, customer/merchant account or replacement admin was generated. A minimal reviewed Auth config push changed only public signup from enabled to disabled. The actual Auth settings were checked afterwards.

The actual account password was deliberately not handled. Live checks cover account configuration, database-role authorization and anonymous HTTP permissions; real password entry belongs in the user's own browser. All password-login and upload interactions passed against isolated fixtures. Start `npm.cmd run dev`, open `http://127.0.0.1:5173/admin/` and use that Supabase user's email/password. No further migration push is needed in this development project.

## Files created

| Group | Files |
| --- | --- |
| Admin components/pages | `src/admin/ui.js`, `src/admin/merchant-picker.js`, `src/admin/media-manager.js`, `src/admin/pages/merchants.js`, `src/admin/pages/taxonomy.js`, `src/admin/pages/advertisements.js`, `src/admin/pages/ranking.js`, `src/admin/pages/hours.js`, `src/admin/pages/media.js` |
| Data/domain/services | `src/data/admin-repository.js`, `src/domain/admin.js`, `src/domain/admin-media.js`, `src/services/admin-session.js`, `src/services/admin-media.js` |
| Image boundary and styles | `src/server/admin-media-handler.js`, `functions/api/admin/media.js`, `src/styles/admin.css` |
| SQL | `supabase/migrations/20261112000600_admin.sql`, `supabase/provision-admin.sql` (manual template, not a migration/seed) |
| Tests | `tests/unit/admin.test.js`, `tests/integration/admin.test.js`, `tests/e2e/admin.spec.js` |
| Documentation | `docs/admin-architecture.md`, `docs/phase-4-setup.md`, `docs/phase-4-report.md` |

## Existing files modified

- `admin/index.html`, `src/admin/app.js`: replace the old foundation screen with the actual login, overview and router.
- `src/data/supabase-client.js`: explicit tab-scoped admin persistence, retaining sessionless public clients.
- `src/components/discovery-ui.js`, `src/components/merchant-ui.js`, `src/styles/merchant.css`: uploaded media priority and public logos.
- `scripts/vite-runtime.mjs`: run the same authenticated media handler locally and in built preview.
- `supabase/config.toml`: CLI 3 email-provider setting with signup disabled.
- `tests/helpers/discovery-server.mjs`: isolated Auth/Storage transport and real guarded admin SQL.
- `tests/e2e/discovery.spec.js`: verify the working admin login replaces the historical foundation page.
- `README.md`, `docs/admin-guide.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/security.md`, `docs/deployment-guide.md`, `functions/README.md`: current workflows, security, setup and phase boundaries.

No dependency was added. Existing local environment files were preserved; private values remain ignored. The repository already contained untracked files from earlier phases, so Git's overall untracked list is not a Phase 4 change inventory.

## Limits and remaining work

No failing test or known Phase 4 blocker remains. Browser mobile coverage uses an iPhone 13 viewport in Chromium, not a physical iOS/Safari device. Lighthouse/Core Web Vitals were not measured in this phase.

The server checks WebP structure rather than decoding a codec; this is a trusted single-admin endpoint. Interrupted uploads, replaced ad images or failed Storage deletion can leave private unreferenced objects requiring deliberate inspection/cleanup. Already-issued signed URLs expire within 60 seconds. These behaviors are documented in [the admin guide](admin-guide.md).

Admin data is bounded for the pilot: pages of 20 merchants/ads, up to 100 cities, 300 categories/localities per context, 100 managed images/offerings per listing, 100 placements per section and 40 current/future exception dates per edit. No whole-catalog fetch or product editing/import UI was added.

Product/Excel/CSV management is Phase 5. General analytics/event collection, full SEO and production configuration/deployment remain Phase 6. Continue only on the user's request.
