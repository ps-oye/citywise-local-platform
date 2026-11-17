> Historical document: the delivery and single hosted environment update supersedes the earlier root/city-selection and separate-backend requirements. See [current release guidance](delivery-release-guide.md).

# Cloudflare Git deployment and configuration

The current development site is [rawatbhata-one.pages.dev](https://rawatbhata-one.pages.dev/). Its Cloudflare Pages project is `rawatbhata-one`; its GitHub repository is `ps-oye/citywise-local-platform`. These names can differ. The repository's `wrangler.jsonc` correctly names the Pages project `rawatbhata-one`.

Cloudflare labels deployments from `main` **Production**. This site still uses the approved development Supabase database, fictional content and noindex. A real production database/content launch remains separate.

## Required settings

| Setting | Value |
| --- | --- |
| Git source | GitHub, `ps-oye/citywise-local-platform` |
| Main branch | `main` |
| Build command | `npm run build && npm run deploy:check` |
| Output directory | `dist` |
| Root directory | Repository root |
| Node | 24, as selected by `.nvmrc` |
| Compatibility flag | `nodejs_compat`, retained in Wrangler configuration |
| Development indexing | `SITE_INDEXING_ENABLED=false` in both environments |

`deploy:check` runs after Vite builds. It validates public/private configuration, the public catalog/homepage/Phase 6 schema, read-only service credential authentication, route artifacts and absence of configured server secrets in public output. Failure stops the Git build before publishing. It performs no migration, seed or business-data write. The command's default preview mode deliberately accepts this development database; the separate `production:check` is for a future real production environment.

## Configure both Cloudflare environments

Cloudflare **Production** and **Preview** have separate bindings. Configure both under project Settings → Variables and Secrets. A local ignored `.env.local` or `.dev.vars` file is not uploaded by Git.

| Binding | Source/purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public project URL from `.env.local`; required during Vite build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public key from `.env.local`; required during Vite build |
| `SUPABASE_URL` | Same project URL for request-time Functions |
| `SUPABASE_PUBLISHABLE_KEY` | Same public key for RLS-protected HTML/catalog reads |
| `SUPABASE_SECRET_KEY` | Existing server-only key from `.dev.vars`; legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported |
| `CHECKOUT_HMAC_SECRET` | Existing private HMAC, at least 32 characters |

These six bindings are currently stored as encrypted Cloudflare variables, with the existing preview server bindings preserved. Encryption in the dashboard does not make `VITE_` values private: Vite intentionally embeds the public URL/key into browser assets. Never prefix a privileged key or HMAC with `VITE_`, and never commit real environment files. An optional separate `ANALYTICS_HMAC_SECRET`, if used, also needs at least 32 characters.

Wrangler continues to define the non-secret environment/indexing/analytics flags. Secrets are supplied through the hosting configuration. Future Git builds receive the public build variables and Functions receive their runtime bindings. Rebuild after a configuration change; an already-built JavaScript bundle cannot acquire missing Vite variables just by retrying a request in the browser.

## 14 November 2026 repair

The Git deployment `716980bf` from commit `ecd9226589ee4d816f4dc9fe5fce61779fe4c0bd` compiled successfully but returned HTTP 503 for the homepage. Its main deployment environment contained only three feature flags and no Supabase bindings. The public browser build therefore lacked its configuration, while request-time HTML also lacked a public database client. The older preview worked because its separate preview server bindings had been configured by Direct Upload.

The repair reused the existing development configuration, added the missing bindings to the main environment, added public build variables to previews, retained noindex, and added the build health gate above. Git rebuilt the same commit successfully as `a77fe898-24c9-4c49-9538-8f9252bdca77`. Its immutable URL is [a77fe898.rawatbhata-one.pages.dev](https://a77fe898.rawatbhata-one.pages.dev/); the canonical Pages domain now serves that deployment. The build command and `dist` output were verified through Cloudflare's deployment metadata. No application code, database migration, seed, Auth configuration or business data changed.

Verification on the stable domain passed 14 HTTP/security checks, 52 public HTML checks covering 15 categories and 33 demo merchants, and browser navigation/sample-cart/dialog/admin-form checks at 320, 390, 768 and 1440 px. There were zero browser page errors and no checkout or business-data writes. DNT suppressed optional test analytics. Sanitized deployment metadata and logs are stored under ignored `artifacts/deployment-repair/`.

## Verify a subsequent deployment

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
node scripts/smoke-preview.mjs https://rawatbhata-one.pages.dev
npm.cmd run qa:preview -- https://rawatbhata-one.pages.dev
```

Open the stable domain after a successful build. If a tab still shows the previous setup screen, reload it with Ctrl+F5 so it loads the newly built JavaScript. Old immutable deployment URLs describe their own deployment and should not be used to check the latest release.

References: [Pages build variables](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Function variables and secrets](https://developers.cloudflare.com/pages/functions/bindings/), [Git deployments](https://developers.cloudflare.com/pages/get-started/git-integration/).
