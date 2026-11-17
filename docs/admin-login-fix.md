# Local admin login compatibility fix

Follow-up completed locally on 17 November 2026. This fixes admin access while the delivery/tracking schema update is pending. No hosted migration, credential change, Auth/allowlist modification, production checkout, Git push or deployment was performed.

## Cause and evidence

The local application uses the existing configured Supabase project. Its newly introduced bootstrap call was `admin_context_checkout`, added by pending migration 10. A read-only function probe returned HTTP 404 / `PGRST202` for that function; existing `admin_context` and `is_admin` were reachable and correctly rejected anonymous execution. The application mapped the missing-function response to “The request could not be completed. Check your connection and try again.” while trying to load the workspace after authentication.

The running local Vite server also retained an older transformed module. A fresh local server now serves the corrected repository module at `http://localhost:5173/admin/`. No real admin password or authenticated hosted session was used for debugging.

## Changes

- Admin bootstrap first uses the delivery-aware context. Only `PGRST202` permits a fallback to the original `admin_context`; both use the existing authenticated SDK client and database admin guard. Permission, session, network and other database failures still fail closed.
- A context capability and visible admin notice identify an unavailable delivery update. Existing category/location edits use the original supported RPC without sending a food capability field the old schema cannot accept.
- Saving merchant details on the old schema preserves existing pickup/delivery settings. New food capability controls remain hidden until the update is available.
- Existing city-wide analytics/date controls load without calling unavailable merchant-tracking RPCs. A reload after applying the reviewed migration automatically restores the new controls/reports.
- Missing database functions receive an actionable update message instead of a misleading network-error message. No RLS, authorization, credential or database rule was weakened.

## Verification

`npm run verify` passed syntax checks for 116 JavaScript files, all **188 unit/SQL tests**, and public/admin builds. The four new compatibility browser cases passed on desktop/mobile using isolated SQL-backed fixtures. They reproduce the exact missing-function response, verify login/session reload, city switching, category saves, merchant preference preservation, city-wide analytics and restored migration-aware controls. An ordinary authenticated user remains blocked before either admin context is loaded.

The full desktop/mobile browser regression suite also passed: **128 tests in 4.0 minutes**, including existing admin CRUD/media/hours, imports, checkout, discovery and SEO behavior. The offline deployment preflight passed with 73 built files scanned and zero configured server-secret matches. `git diff --check` passed. Local test fixtures never use real merchant records or create hosted checkout events. Evidence is retained locally in `artifacts/admin-login-verify.log`, `artifacts/admin-login-regression.log`, `artifacts/admin-login-compatibility.log` and `test-results/admin-login-regression/.last-run.json`.

## Files

- `src/data/admin-repository.js`, `src/domain/admin.js`
- `src/admin/app.js`, `src/admin/pages/taxonomy.js`, `merchants.js`, `analytics.js`
- `src/styles/admin.css`
- `tests/unit/admin.test.js`, new `tests/e2e/admin-compatibility.spec.js`
- `README.md`, `docs/admin-guide.md`, `docs/delivery-release-guide.md`, this report

## Using the fix

Open `http://localhost:5173/admin/` and refresh with Ctrl+Shift+R. If you are running an older server yourself, stop it with Ctrl+C and run `npm.cmd run dev` again. Sign in with the existing administrator account. A pending-update notice is expected until migration 10 is available; existing administration works without applying it.

The complete new delivery checkout and merchant-wise reporting still require reviewed migration 10. Follow [backup, review, release and rollback instructions](delivery-release-guide.md) before applying it. This fix does not apply the migration, change the account/password, or deploy to production.

The subsequent [merchant-page fix](merchant-page-fix.md) covers the separate public read path, including dashboard public-page links and direct/browser navigation while migration 10 is pending.
