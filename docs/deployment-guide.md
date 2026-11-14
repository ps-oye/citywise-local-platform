# Development services and Cloudflare deployment

Phases 1–7 are implemented. The authorized **noindex preview using the development database** is live at [de486908.rawatbhata-one.pages.dev](https://de486908.rawatbhata-one.pages.dev). Cloudflare Pages project `rawatbhata-one` uses preview branch `phase-6`; its production branch is `main`. No production release or custom domain is configured. See [Phase 7 results](phase-7-report.md) for final QA and the refreshed preview.

The approved Supabase project `rawatbhata-one-dev` (`qyzcvmghhwxctwlaqhrq`) has migrations 1–9 applied. The 33 fictional merchants, 110 products and existing single administrator were retained. Public signup and anonymous sign-in remain disabled; the private schema is not exposed through the Data API. Both media buckets remain private. See [Phase 6 setup](phase-6-setup.md) for migration effects and [Phase 6 results](phase-6-report.md) for executed verification.

## Local development

Install Node 24 and dependencies with `npm.cmd ci`. Preserve the configured `.env.local` and ignored `.dev.vars`. The browser receives only the public Supabase URL/key and optional brand/canonical origin. Server-only bindings contain the matching Supabase URL, secret/service-role key and checkout HMAC of at least 32 characters. An optional separate analytics HMAC has the same minimum length. Never put these private values in a `VITE_` variable, source file or chat.

Run `npm.cmd run dev` and open the displayed localhost URL. `/admin/` uses the existing administrator; enter its password only in your browser. Spreadsheet parsing/imports use the existing Auth client and add no upload endpoint or hosting binding. Production Functions and local development share server modules through `scripts/vite-runtime.mjs`.

## Reproduce a preview

```powershell
npm.cmd run verify
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e
npm.cmd run pages:functions
npm.cmd run deploy:check
```

`deploy:check` validates public/private project matching, HMACs, read-only server credential authentication, Phase 6 sitemap schema, the bounded homepage query, artifact routes and absence of configured server secrets in public output. It does not apply migrations or write business data.

For an authorized subsequent preview upload, sign in using `npx.cmd wrangler login` if the existing session has expired, then run `npm.cmd run deploy:preview`. The script repeats verification/build and compiles Pages Functions, checks the account/project production branch, uploads runtime bindings to the preview environment through stdin, and publishes branch `phase-6`. If multiple accounts exist, set the intended `CLOUDFLARE_ACCOUNT_ID` in the shell. `.cloudflare.env.example` documents optional shell names and is not loaded automatically. No Git integration, commit or source push is performed.

The command writes the returned immutable URL to ignored `artifacts/preview-deployment.json`. Run `node scripts/smoke-preview.mjs` to check its public HTML, metadata, robots/sitemap, static cache headers, real 404 and protected API responses without business-data writes. A preview URL is publicly reachable; noindex is an indexing control, not a login requirement. The admin's data still requires database-backed authorization.

For broader read-only hosted QA, run `npm.cmd run qa:preview` with `PLAYWRIGHT_CHANNEL=chrome` when using installed Chrome. It enumerates the current city's public categories and paginated listings, verifies merchant canonical HTML/demo contact restrictions, and checks navigation, sample cart dialogs, location controls and the admin login form at 320, 390, 768 and 1440 px. DNT suppresses optional test analytics; it never confirms actual checkout or signs into hosted administration. Both smoke scripts also accept an explicit HTTPS URL when the saved deployment artifact is absent. Results/screenshots are under ignored `artifacts/phase-7/`.

## Runtime and performance

`wrangler.jsonc` specifies `dist`, compatibility date, `nodejs_compat`, preview/production flags and default indexing disabled. Deploy `functions/` alongside the static build. `_routes.json` bypasses Functions for hashed assets, icons/images and static admin HTML. Dynamic public HTML, robots/sitemaps, media and protected APIs run through Functions. Function responses set their own security headers; static `_headers` rules alone do not protect them.

Static and Function CSP allow only the validated Supabase origins required by this build. Hashed assets use immutable caching. Dynamic/private/admin responses use no-store. Initial HTML contains bounded public content and bootstrap data, so browsers avoid redundant initial discovery fetches. The optimized homepage enriches at most four selected cards per requested section, preserving existing ranking/locality/RLS behavior.

`npm.cmd run performance` runs Lighthouse for home/category/merchant on simulated mobile/desktop against an isolated fixture database and actual local Pages runtime. It writes ignored HTML/JSON reports and stops its owned servers. This measures reproducible lab conditions, not production field Core Web Vitals. The [phase report](phase-6-report.md) records scores and their intentional preview noindex limitation.

## Production preparation

Production is a separate action. Prepare a separate Supabase project with migrations through 9, disabled signup/anonymous sign-in, private buckets/policies and the manually provisioned single administrator. Onboard verified real businesses and deliberately review demo removal, contacts, images, hours, backups and retention. Do not replay development seeds or delete sample data automatically.

Configure public build values and matching server-only production bindings separately from the preview. Set `PRODUCTION_SUPABASE_PROJECT_REF`, an explicit HTTPS `SITE_URL` and matching `VITE_SITE_URL`, then run `npm.cmd run production:check` on the production build. It rejects the current development project, mismatched origins/credentials, demo content in the default city and missing real sitemap content.

The standard production backend must match the complete normalized `https://{PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` origin. The ref accepts only non-empty lowercase alphanumeric values. Suffix hosts, injected ref syntax and non-default ports are rejected before backend credential checks. Existing exact-origin CSP support for custom/local development backends is unchanged.

The eventual Cloudflare build uses Node 24, `npm run build`, output `dist`, and repository `functions/`. Choose a reviewed Direct Upload or Git-integrated project intentionally. Verify real Auth password login, Storage HTTP uploads, authorization, final-domain response headers and responsive flows. Set Auth site/redirect URLs for any future email flows. Enable `SITE_INDEXING_ENABLED=true` only for the matching production origin with real content; validate structured data and submit its sitemap through the domain owner's Search Console. See [the detailed Phase 6 guide](phase-6-guide.md).
