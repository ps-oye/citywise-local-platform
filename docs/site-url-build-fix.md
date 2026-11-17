# Cloudflare SITE_URL build failure

**Subsequent update:** migration 10 was applied and verified on 17 November 2026. The [application report](migration-10-application-report.md) supersedes the pending-database finding below. The site URL configuration requirements still apply; no Cloudflare variable or frontend deployment was changed by the migration operation.

Read-only diagnosis on 17 November 2026 confirmed:

- The `shaharone.in` custom domain is attached to the existing `rawatbhata-one` Pages project and HTTPS responds successfully.
- The current website returns the older Rawatbhata One page directly (HTTP 200), without an HTTP redirect.
- New commit `925d73a` failed its build at 04:42 UTC. The active successful deployment remains `ecd9226`.
- The Cloudflare Production build variables do not contain `VITE_SITE_URL`, `SITE_URL` or `VITE_BRAND_NAME`.
- The existing database still returns a missing-function response for migration 10's `merchant_is_food`. That is a separate release prerequisite after URL configuration is corrected.

## Why the build failed

Ignored local `.env.local` and `.dev.vars` files are intentionally absent from Git/Cloudflare builds. Browser configuration must be supplied at build time. The deployment preflight also previously ignored the non-secret runtime `SITE_URL` already declared in `wrangler.jsonc`, so its local configuration differed from a clean hosted build.

The preflight now reads committed Wrangler vars as runtime defaults, followed by local private overrides and explicit build environment values. It preserves strict HTTPS/public-server matching and rejects a build URL that conflicts with the actual committed runtime URL. Missing variables receive an actionable message. Directory/environment inputs are injectable for isolated configuration tests; no hosted values or credentials were changed.

## Manual settings for the existing project

In Cloudflare -> Workers & Pages -> rawatbhata-one -> Settings -> Variables and Secrets / Environment variables, select the **Production** build environment:

| Variable | Plain-text value |
| --- | --- |
| `VITE_SITE_URL` | `https://shaharone.in` |
| `VITE_BRAND_NAME` | `ShaharOne` |
| `SITE_URL` | `https://shaharone.in` if supplied to the build shell; it must match the committed runtime value |

For the already-pushed commit without this preflight fix, both URL variables must be provided to the build shell. With this fix included in the next reviewed source push, the preflight also accepts the existing `wrangler.jsonc` runtime `SITE_URL` when no duplicate build-shell value is present. `VITE_SITE_URL` remains required for Vite to embed the correct public origin. Use the apex HTTPS origin with no `/rawatbhata` suffix. Keep existing Supabase and private secret bindings unchanged.

Cloudflare documents [build environment variables](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables) separately from [Wrangler Functions configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/). Wrangler is the source of truth for runtime fields declared there; edit the source file when a managed runtime setting must change. This fix does not copy private runtime secrets into browser values or into Git.

## Remaining release prerequisite

Correcting URLs resolves the reported URL error. The ordinary deployment preflight still requires migration 10 before releasing the full delivery/tracking update; that protection was not removed or bypassed. Back up and review/apply the single pending migration to the existing database using [the release guide](delivery-release-guide.md), then retry the approved build/deployment. Do not reset the database, replay seeds, change the build command to skip checks, or expect clearing browser cache to publish a failed build.

The existing build command remains `npm run build && npm run deploy:check`, output `dist`, production branch `main`. Production deployment requires approval before a push/retry that publishes. No push, retry, deployment, hosted variable edit, DNS change or migration application was performed by this fix.

## Verification and files

All 10 deployment tests passed, including a clean CI fixture with no local env files, missing public URL diagnostics, conflicting runtime/build origins and preservation of the migration gate. Public/admin builds passed. The offline preflight scanned 73 built files with zero configured server-secret matches, and syntax/whitespace checks passed.

Changed files: `scripts/deployment-config.mjs`, `tests/unit/deployment.test.js`, `README.md`, `docs/deployment-guide.md`, and this report. Tests use temporary fixture configuration and perform no hosted writes.
