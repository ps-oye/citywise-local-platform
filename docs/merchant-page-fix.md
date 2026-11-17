# Merchant pages while migration 10 is pending

Local follow-up on 17 November 2026. Merchant browsing now works with the existing hosted schema as well as the updated schema. No hosted migrations, seeds, merchant/product updates, credential changes, Git pushes or deployments were performed.

## Cause

The delivery update changed public merchant reads to `merchant_detail_checkout`, which is introduced by pending migration 10. The earlier admin login fix covered only the admin context. Merchant reads still failed independently and the browser displayed the generic “discovery catalog needs its initial setup” state.

Read-only checks confirmed that `merchant_detail_checkout` returned HTTP 404 / `PGRST202`, while the original `merchant_detail` returned the existing public business. This was a missing optional API function, not missing merchant data. Running a seed or resetting the database would not be an appropriate fix.

## Implementation

`src/data/merchant-detail.js` shares one compatibility read between server rendering and browser navigation. It first uses the delivery-aware RPC. Only a specific missing-function response permits the original public merchant read; authorization errors, network failures, invalid responses and hidden/null listings do not downgrade to another path. Both reads retain existing public RLS/publication rules and use public credentials.

The legacy result is explicitly marked checkout-unavailable. An existing city-context read preserves single/multiple-city navigation. Stable IDs, canonical paths and historical merchant redirects are retained. Product browsing/search/filtering, separate carts and quantity changes remain available, as do applicable photographs, descriptions, offerings, contact actions, directions and hours. Hidden/disabled/unknown listings and cities retain actual 404 responses.

The public HTTP transport preserves only the specific missing-function signal, bounds failure bodies to 16 KiB (successful data remains bounded to 1 MiB), and keeps backend details out of displayed errors. No private credentials are used for public HTML.

Customers see a plain temporary ordering-unavailable explanation while the delivery schema is absent. They do not see pickup/enquiry food checkout controls or a broken checkout flow. The trusted checkout endpoint independently verifies the delivery capability before quota consumption or initiation, preventing an old food request from bypassing mandatory address requirements. No checkout record or limiter write is made when that capability is missing. Actual food initiation still receives a final locked SQL quote and requires validated delivery text/fingerprint; non-food behavior remains supported on the migrated schema.

After reviewed migration 10 is applied, reloading automatically restores the complete delivery flow. The compatibility fix does not apply the migration or relax its requirements. See [backup/release/rollback instructions](delivery-release-guide.md).

## Verification

The six new desktop/mobile browser cases passed. They exercise the actual server renderer and SQL-backed fixture API with migration-10 functions unavailable, including admin → View public page → catalog, direct HTML, client navigation, filtering/quantities, contacts/directions, multiple listing types, 404s, blocked checkout writes and automatic recovery when the capability becomes available.

Unit coverage also checks strict fallback conditions, permission/network/cancellation failures, bounded error bodies, hidden listings/canonical redirects and the trusted write boundary. The configured real backend was used only for public read-only diagnosis. Local HTTP checks returned **200** with useful merchant/contact/hours HTML for existing restaurant and hotel URLs. Automated checkout tests use isolated fixtures only.

Final checks passed: syntax validation of **119 JavaScript files**, **194 unit/SQL tests**, both frontend builds, **134 desktop/mobile browser tests** (4.0 minutes), and Cloudflare Pages Functions compilation. The offline deployment preflight scanned 73 built files with zero configured server-secret matches. `git diff --check` and local documentation-link checks passed. Local evidence is in `artifacts/merchant-compatibility-verify.log`, `artifacts/merchant-compatibility-regression.log`, `artifacts/merchant-compatibility-browser.log` and `test-results/merchant-compatibility-regression/.last-run.json`.

## Files

- New `src/data/merchant-detail.js`
- `src/data/merchant-repository.js`, `src/server/merchant-page.js`, `src/server/public-catalog.js`
- `src/domain/merchant.js`, `src/components/merchant-ui.js`, `src/pages/merchant.js`
- `src/server/checkout-handler.js`
- New `tests/unit/merchant-compatibility.test.js`, `tests/e2e/merchant-compatibility.spec.js`
- `tests/unit/merchant.test.js`, `tests/unit/delivery.test.js`, `tests/helpers/discovery-server.mjs`
- README and the linked admin/release/security/update guides

## Using the fix

Refresh `http://localhost:5173/admin/` with Ctrl+Shift+R, then reopen the merchant's **View public page** link. Refresh any already-open merchant tabs too. The local server has been restarted with the corrected server/browser modules. Existing merchant content is available without a database reset or seed. Complete new delivery checkout still requires reviewed migration 10; no production changes were made by this fix.
