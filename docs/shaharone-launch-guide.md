# ShaharOne.in domain and hosting checklist

Use one existing repository, `main`, Pages project `rawatbhata-one`, and the existing Supabase project/Auth/Storage configuration. The latest single-hosted-environment requirements supersede the earlier separate-backend rebrand plan. Do not create a replacement database or replay seeds. See [delivery release/backup/rollback instructions](delivery-release-guide.md) before the pending migration or any deployment.

## Public routing

- With Rawatbhata as the only enabled city, `https://shaharone.in/` returns temporary 307/no-store to `https://shaharone.in/rawatbhata/`.
- City selection automatically returns at `/` when another city is enabled. Locality selection remains available in single-city mode.
- Categories/search and merchants remain city-scoped; merchant URLs and historical merchant slugs are preserved.
- Root/platform sitemap entries are omitted while root redirects; canonical city home remains `/rawatbhata/`. Multiple cities restore the platform sitemap automatically.
- All public canonical/social/share origins derive from matching `VITE_SITE_URL` and `SITE_URL`, both `https://shaharone.in`. Relative navigation keeps local testing local.

## Cloudflare and DNS (manual, if not already configured)

1. Keep the existing Pages Git integration on `main`, Node 24, repository-root build, `dist` output and repository `functions/`. Use `npm run build && npm run deploy:check` only after migration 10 is reviewed/applied. Do not push without deployment approval.
2. Configure the single set of public build variables and server-only runtime secrets in the existing project's Production settings. Preserve credentials; use [the configuration matrix](delivery-release-guide.md#3-one-hosted-configuration). In Settings -> Builds & deployments, keep production branch `main` and set automatic preview branches to **None**. See [Cloudflare branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/).
3. If the apex is not already active, associate `shaharone.in` through Pages -> Custom domains in the same Cloudflare account. For an apex domain, use the assigned Cloudflare nameservers; preserve existing MX/TXT/other DNS records and review DNSSEC/registrar settings when moving DNS. Let Pages create/validate the apex CNAME to `rawatbhata-one.pages.dev`.
4. Wait for active domain verification and HTTPS coverage. Verify root, `/rawatbhata/`, a merchant and the admin page before redirect activation.
5. For `www`, use a proxied redirect hostname and a permanent path/query-preserving redirect to `https://shaharone.in`. Cloudflare's documented Bulk Redirect method uses proxied `A www -> 192.0.2.1`. A second application/Pages project is unnecessary.

Cloudflare documents [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/) and [www-to-apex redirects](https://developers.cloudflare.com/pages/how-to/www-redirect/). No DNS or hosting settings were changed by this implementation.

## Supabase Auth

Keep the existing Auth user and database allowlist. Set/review the existing project's Auth Site URL as `https://shaharone.in`. Keep public signup and anonymous sign-in disabled. Current admin authentication uses password sign-in and `detectSessionInUrl:false`; there is no email callback/recovery flow to configure. Add only exact implemented redirect paths if such flows are added later; no broad wildcard is required for current password login. Do not change credentials merely for this update.

Supabase explains [Site URL and redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls). Browser sessions/carts are origin-scoped; a domain change requires admin sign-in again and does not automatically transfer old-origin local carts. Database records/history are unaffected.

## Legacy-host and www redirects

Application redirects remain off until `SITE_REDIRECTS_ENABLED=true` with exact canonical origin `https://shaharone.in`. Known-host GET/HEAD redirects preserve queries; checkout/upload writes are not forwarded across hosts. Indexing is separately opt-in and requires a matching HTTPS request origin. Localhost and arbitrary deployment hosts remain noindex.

| Source | Target |
| --- | --- |
| `rawatbhata-one.pages.dev/` | `https://shaharone.in/rawatbhata/` |
| Old root quick-look/search query | Same query on `/rawatbhata/` |
| `rawatbhata-one.pages.dev/rawatbhata/...` | Same city path/query on `https://shaharone.in` |
| `www.shaharone.in/...` | Same path/query on `https://shaharone.in` |

For complete static/admin coverage, prepare manual Cloudflare host rules: `_routes.json` excludes static assets/admin from the application renderer. Use an exact old-root rule to `/rawatbhata/` with subpath matching off, and a separate `/rawatbhata/` prefix rule preserving the existing suffix. Do not prepend Rawatbhata twice or include arbitrary preview subdomains. Keep www root mapped to apex root; its normal singleton routing is temporary and can restore city selection later. Verify no loops and preserve search/locality/product queries.

Cloudflare's [Pages host redirect guide](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/) describes account-level Bulk Redirects. Review the mappings above and activate only after the final domain works.

## Final release checks

Follow [the delivery release checklist](delivery-release-guide.md#4-apply-and-release-only-after-reviewapproval): backup, reviewed migration 10, existing-record comparison, one matching configuration, approved main deployment, public/admin checks and legitimate merchant setup. Preserve demo records; actual demo checkout stays disabled. Enable indexing only after eligible real content and final-host checks pass. Checkout initiation and estimated value must never be presented as confirmed orders or sales revenue.
