# Phase 7 — Final QA and cleanup

Completed 14 November 2026 (Asia/Kolkata), following verification started on 13 November. Scope is the existing vanilla JavaScript/Supabase/Cloudflare application. Production launch and destructive database changes remain separate. Final hosted/performance results are recorded below.

## Fixes

1. **Admin confirmation after navigation.** An old merchant status dialog could resolve after browser navigation and still call its mutation. `app.run` now checks the page generation and signed-in user before invoking the operation, in addition to its existing post-request check. A regression intercepts the would-be write and verifies that no request is sent after navigation.
2. **Fulfilment changes during cart review.** A delayed pickup quote could open a confirmation labelled Delivery after the preference changed. Preference/cart changes now abort and invalidate the pending review. Responses must belong to the current request and captured preference; old completion handlers cannot reset a newer request's state. Saved-cart reconciliation also checks its captured preference.
3. **Stale search suggestions.** Changing text previously left the old options selectable during debounce, and a pending response could reopen suggestions after blur. Input changes clear old items and active-descendant state immediately. Leaving the search control cancels/invalidate pending work, and results require current focus and request generation.
4. **Cross-tab analytics preferences.** Opting out in one already-open tab previously left another tab tracking. Storage events and visibility return now synchronize the choice and checkbox. Opt-out clears queued activity and aborts pending intake. Re-enabling cannot resurrect an earlier discarded batch. Blocked storage still preserves the current tab's in-memory choice.
5. **Production backend selection.** Prefix matching could accept a host such as `fixture.supabase.co.unrelated.example`. The production guard now validates an alphanumeric project ref and compares the complete normalized HTTPS origin. Suffix hosts, injected refs and non-default ports are rejected before backend credential checks; explicit default port 443 remains valid.
6. **Narrow-screen promotion spacing.** Final screenshot inspection found the illustration caption overlapping the promotion button at 320 px. The existing narrow-screen media rule now reserves enough bottom space for the caption and controls. Responsive regressions check the actual caption/button rectangles for overlap as well as document overflow.

The production-origin unit regression and four focused desktop browser regressions were run against the previous code and reproduced these issues before the fixes. Targeted unit/browser checks passed after correction. No SQL migration, RLS relaxation, schema change or hosted catalog mutation was needed.

## Cleanup and repeatable checks

- Removed the unused Phase 1 foundation page renderer, whose controls no longer exist in the public application, and an unused SEO image helper/import. Existing connection-service tests remain.
- Reviewed all direct dependencies. All five production packages have active uses in Supabase or spreadsheet parsing, so none was removed speculatively. Declared the existing `chrome-launcher@1.2.3` as a pinned direct development dependency because the performance script imports it. It previously relied on Lighthouse's transitive installation.
- Completed `npm ci`, `npm prune` and the dependency audit. No production package or frontend framework was added.
- Corrected the no-JavaScript notice to describe the working server-rendered browse/search forms and the features requiring JavaScript.
- Added `npm run qa:preview` for bounded read-only public HTML enumeration, demo contact restrictions and real hosted browser checks at 320, 390, 768 and 1440 px. It sends DNT, uses no admin credentials, never confirms checkout, saves sanitized JSON/screenshots and closes its browsers.
- Both hosted smoke commands accept an explicit HTTPS preview origin without requiring an existing deployment artifact. Omitting it uses the deployer's saved immutable URL.

## Executed tests

| Check | Result |
| --- | --- |
| Baseline `npm run verify` | 154 unit/SQL tests passed; public/admin builds succeeded |
| Baseline full browser suite | 96 passed |
| Focused deployment/privacy unit checks after fixes | 20 passed |
| New final-QA browser checks | 12 passed: six scenarios on desktop and mobile |
| Final `npm run verify` | 105 JavaScript files syntax checked; 156 unit/SQL tests passed; both builds succeeded |
| Final full browser suite | 108 passed: 54 desktop and 54 mobile |
| Follow-up responsive checks | Both desktop/mobile tests passed after the final 320 px spacing fix, including the new overlap assertion |
| Pages Functions compilation | Compiled successfully using pinned Wrangler |
| Dependency audit | Zero vulnerabilities |
| Deployment preflight | 71 public files checked, zero configured server-secret matches; public catalog/homepage/schema and server credential ready |
| Compiled Functions secret scan | One compiled Worker checked; zero configured server-secret matches |
| Lighthouse in actual local Pages runtime | Six reports generated successfully with noindex retained |
| Final hosted HTTP smoke | 14 passed, including noindex/metadata/cache headers, real 404 and protected API boundaries |
| Final hosted HTML enumeration | 52 passed, covering 15 categories and 33 canonical demo merchants |
| Final hosted browser QA | 320/390/768/1440 px all passed; zero page errors and no checkout requests |
| Documentation and workspace checks | 30 Markdown files / 151 local links checked, zero broken links; `git diff --check` passed; owned test/lab ports stopped |

The final-QA scenarios cover stale search/blur, fulfilment review races, stale admin confirmations, cross-tab privacy, all 15 demo category URLs and all 33 demo merchant canonical pages. Responsive checks exercise home, category, commerce, hotel, service, fitness and all ten admin destinations at 320, 768, 1024 and 1440 px, with one page heading and no document overflow. Existing tests cover keyboard search, skip navigation, modal focus, reduced motion, safe text rendering, import validation/concurrency, cart persistence and authoritative checkout.

SQL tests apply the actual migrations in disposable PostgreSQL and switch anonymous, ordinary authenticated, administrator and service roles. They cover publication/media inheritance, single-admin revocation, forbidden direct operational writes, product uniqueness/constraints, transactional imports, checkout idempotency/rate limits and city-local hours/analytics. Browser Auth/Storage transports are isolated fixtures backed by that SQL. No test password is used against hosted Supabase.

Read-only hosted checks confirmed migration `20261113000900`, 33 listings, 110 products, one active administrator, 33 RLS-protected tables, 31 invoker admin RPCs without anonymous execution, service-only event writers and both private media buckets. Existing activity/history was retained. No seed, migration or production deployment was applied in Phase 7.

The final remote dry run reports no pending migration, seed or role change. A read-only integrity query found 44 application foreign keys and 105 indexes, with no unvalidated foreign keys/checks or invalid/not-ready indexes.

## Acceptance coverage

| Master spec criteria | Evidence |
| --- | --- |
| 1–2: visual quality and responsive layouts | Public/admin browser checks and representative screenshots across phone, tablet and desktop widths |
| 3–7: promotions, categories, top-four ranking, See All | Carousel timing/reduced-motion, admin ad uploads/scheduling, all-category enumeration and SQL/browser ranking assertions |
| 8–10: search, unique URLs, database-backed details | Search tests, all 33 canonical demo pages, no-JavaScript HTML, publication/slug-history integration |
| 11–14: product filters, carts, confirmation, initiation | Merchant browser suite and trusted SQL/HTTP checkout tests, including price/stock changes and lost responses |
| 15–17: directions, hours and closures | Verified directions URL generation in fixtures, timezone/split/overnight/holiday SQL and admin closure/reopening browser workflows |
| 18–20: login, authorization, merchant management | Ordinary-user denial, allowlist revocation, session isolation and merchant create/edit/archive tests |
| 21–23: automatic pages, images, spreadsheet imports | Browser publication, private media workflows, XLSX/CSV preview/confirmation/price-only/manual catalog tests |
| 24–26: rankings, visibility, taxonomy/localities | Admin reorder/hide/save, merchant publication/enable/archive and category/locality/city tests |
| 27–30: demo breadth, performance, SEO, runnable deployment | 15 categories/33 fictional listings, measured Lighthouse, metadata/robots/sitemap and actual Pages runtime/preview checks |
| 31–32: documentation and tests | Current setup/admin/deployment/security documentation, this report and executed verification above |

The five specified admin workflows are exercised through the merchant/media/publication, hours/closure, catalog price-update, advertisement and homepage-ranking browser tests. Their database mutations execute only in isolated fixtures. Live password login, real image uploads and a real merchant WhatsApp handoff remain operator checks before production.

## Hosted preview and measured performance

The final development preview is [https://de486908.rawatbhata-one.pages.dev](https://de486908.rawatbhata-one.pages.dev), with [admin login here](https://de486908.rawatbhata-one.pages.dev/admin/). It was deployed at `2026-11-14T04:48:46.398Z` in the existing `rawatbhata-one` project on branch `phase-6`, preserving production branch `main` and preview-only runtime bindings. It retains noindex and the same development backend. No production deployment, custom domain, DNS, paid service or audience change was performed.

The final hosted pass verified 14 HTTP boundaries plus 52 meaningful public HTML responses: home, 15 category pages, three paginated explore pages and all 33 canonical merchant pages. Browser checks at 320, 390, 768 and 1440 px passed navigation, sample cart review, disabled real demo checkout, modal bounds/Escape, admin form and zero page errors. DNT suppressed optional analytics, and no checkout request or business-data write was made. The final narrow-screen spacing correction received follow-up responsive tests, refreshed screenshots and this hosted QA pass. Sanitized results are saved in ignored `artifacts/phase-7/hosted-qa.json` and `artifacts/hosted-smoke.json`.

Lighthouse 13.6.0 ran again after the spacing correction against the actual local Cloudflare Pages runtime with isolated SQL fixtures. The final summary timestamp is `2026-11-14T04:47:22.428Z`. Reports are preserved in ignored `artifacts/phase-7/lighthouse/{page}-{device}.html`/`.json` and `summary.json`.

| Page | Device | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | Mobile | 92 | 100 | 100 | 69 | 3.271 s | 0.051 |
| Home | Desktop | 100 | 100 | 100 | 69 | 0.649 s | 0.0002 |
| Category | Mobile | 97 | 100 | 100 | 69 | 2.484 s | 0.051 |
| Category | Desktop | 100 | 100 | 100 | 69 | 0.705 s | 0.0002 |
| Merchant | Mobile | 98 | 100 | 100 | 69 | 2.220 s | 0.051 |
| Merchant | Desktop | 100 | 100 | 100 | 69 | 0.589 s | 0.0002 |

The sole failed SEO audit on every report is intentional `is-crawlable`, caused by the requested preview noindex policy. All other applicable SEO audits pass. Do not enable preview indexing to inflate a score. Mobile home LCP remains above 2.5 seconds in this lab run; production field measurements and further image/network tuning remain operational work. Scores vary between lab runs; the table records the final run, not the highest observed scores.

## Phase 7 files

Created: `docs/phase-7-qa-plan.md`, `docs/phase-7-report.md`, `tests/e2e/final-qa.spec.js`, `scripts/qa-preview.mjs`.

Modified implementation/configuration: `src/admin/app.js`, `src/pages/merchant.js`, `src/components/search-box.js`, `src/services/analytics.js`, `src/domain/seo.js`, `src/styles/discovery.css`, `index.html`, `scripts/deployment-config.mjs`, `scripts/smoke-preview.mjs`, `package.json`, `package-lock.json`.

Modified tests: `tests/unit/deployment.test.js`, `tests/unit/seo-analytics.test.js`. Removed: `src/pages/foundation.js`. Current documentation updated: `README.md`, `docs/admin-guide.md`, `docs/deployment-guide.md`, `docs/security.md`. The one removed-file link in `docs/phase-1-report.md` now records its Phase 7 retirement; earlier results remain historical. Existing uncommitted/untracked work was preserved; nothing was staged, committed or pushed.

## Production configuration and limits

No new local credentials or migration are needed for this phase. Keep the existing ignored public/server environment files. The development preview continues to contain clearly fictional data, disabled actual demo checkout and public noindex pages; noindex does not restrict who can open a preview URL.

Production still requires a separate Supabase project, verified real businesses/contacts/images/hours, the single admin, disabled public signup/anonymous sign-in, private media policies, final HTTPS origin and matching public/private bindings. Run the guarded production preflight on that build. Review demo removal, backups, activity/enquiry retention and rich results/Search Console deliberately; no automatic historical-data purge is installed.

The browser suite uses Chrome and mobile emulation, not physical iOS/Safari or WhatsApp apps. Hosted password sign-in and Storage HTTP uploads were not performed because no live admin password or business/media test fixture was used. Existing SQL/HTTP tests verify those authorization and transaction boundaries, but do not establish successful real-service password/upload delivery. Lighthouse reports are lab measurements, not production field Core Web Vitals or a comprehensive accessibility certification.

Phase 7 is complete. No numbered implementation phase follows it in the master spec. Production preparation/release remains a separately requested action; stopped after reporting Phase 7.
