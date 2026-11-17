# ShaharOne deployment

Use the existing GitHub repository, `main`, Cloudflare Pages project `rawatbhata-one`, and existing Supabase project `qyzcvmghhwxctwlaqhrq`. Do not create another backend, staging website or repository. The legacy project names remain intentional.

Migration 10 was applied to the existing hosted database on 17 November 2026 after explicit approval, backup and isolated restore verification. The [application report](migration-10-application-report.md) records preserved data/security and a passing online preflight. No credential/settings update, seed or frontend deployment was performed by that operation. See [the complete backup/review/release/rollback guide](delivery-release-guide.md) before further production actions.

## Configuration and build

Use `.env.example` for public build values and `.dev.vars.example` for trusted runtime values, both targeting the same existing Supabase project. The public site origin is `https://shaharone.in` through `VITE_SITE_URL` and `SITE_URL`. Existing credentials remain unchanged. Server secrets must not use a `VITE_` prefix.

Wrangler now has one configuration. Environment-specific project selectors, the separate-project rejection and preview-deploy script are retired. `production:check` is a compatibility alias of the single deployment check. Local Vite `preview` and isolated automated fixtures remain available.

The Pages project retains Node 24, repository-root build directory, build command `npm run build && npm run deploy:check`, output `dist`, and `functions/`. Public HTML, protected APIs, robots, sitemap and media routes run through Functions. Static admin/assets keep their existing no-store/security/immutable-cache rules as applicable.

The read-only backend preflight requires migration 10, one matching public/server project, a valid privileged server credential, strong HMAC, enabled-city/homepage readiness and no configured server secrets in built assets. Demo records are preserved; eligible real sitemap content is required only when indexing is deliberately enabled.

## Missing site URL build variables

Set Production build `VITE_SITE_URL=https://shaharone.in` and `VITE_BRAND_NAME=ShaharOne` in the existing Pages project's settings. The runtime `SITE_URL` is already declared in `wrangler.jsonc`; the corrected preflight includes that source as a default even when ignored local files are absent. If `SITE_URL` is also supplied in the build environment, it must match the committed runtime/public origin. Local `.env.local` and `.dev.vars` files are intentionally not uploaded to Cloudflare. Do not commit them to resolve a build error.

For the original failed commit, adding both URL values to Production build variables resolves its URL check. Include the [preflight fix](site-url-build-fix.md) in a reviewed source push for consistent clean-build behavior and clearer diagnostics. Migration 10 remains a separate required release check. Failed builds leave the last successful deployment active, so old branding can remain visible even after a new commit was pushed.

## Local checks

```powershell
npm.cmd run verify
$env:PLAYWRIGHT_CHANNEL = 'chrome'
$env:PLAYWRIGHT_PORT = '5174'
npm.cmd run test:e2e
npm.cmd run pages:build
npm.cmd run deploy:check -- --offline
npm.cmd run performance
```

Automated tests use disposable local SQL/browser/Lighthouse fixtures, not hosted records. The alternate browser-test port preserves an existing user server. The offline preflight does not contact the hosted database. A normal `deploy:check` performs read-only backend checks and is a release step after the reviewed migration is applied.

## Approved release

1. Back up schema/data/private checkout history and actual Storage objects; verify restoration locally.
2. Verify the existing migration ledger: migration 10 is already applied. Do not replay it or alter applied SQL files. Review any future pending migration separately; never run a seed/reset/cleanup during the release.
3. Compare counts, references, RLS/grants and Storage paths. Preserve the existing Auth administrator and credentials.
4. Configure the one set of build/runtime bindings in the existing Pages Production settings. Manually disable automatic preview-branch deployments in Cloudflare branch controls; no second hosted configuration is needed.
5. Obtain deployment approval before pushing `main`, because Git integration can deploy that push automatically. No push/deployment command is part of the implementation task.
6. Run the read-only backend preflight, review the resulting deployment and verify public/admin behavior without automated live checkout events. Configure verified real merchant contacts and eligible products through admin.
7. Enable indexing or legacy-host/www redirects only after the final domain/content checks. Localhost is noindex through the request-origin guard.

The [domain checklist](shaharone-launch-guide.md) covers DNS, apex/www, old URLs and Auth Site URL. The [delivery guide](delivery-release-guide.md) explains exact migration effects and the non-deleting rollback. Keep the last approved deployment/configuration snapshot. Never restore an old database dump over newer business/history data merely to roll back application code.
