# Cloudflare Pages Functions

`[[path]].js` serves bounded, meaningful HTML for homepage/category/explore/search and `/:city/:category/:listing` merchant pages. Reads use the public key under RLS. Shared renderers escape text/bootstrap JSON, emit canonical/social metadata and truthful structured data, redirect historical merchant slugs and return real 404/503 statuses. Initial public data is reused by the browser. Admin, assets and protected APIs retain separate routing.

The same router serves environment-aware robots, paginated non-demo sitemaps and stable `/media/{uuid}` social images. Public media is revalidated and downloaded with public credentials under RLS, not the checkout service key. Dynamic responses have security headers and no-store caching. Preview indexing is disabled; static assets and admin HTML use `_routes.json`/`_headers`.

`api/checkout.js` is the trusted POST-only checkout boundary. It uses server bindings, trusted Cloudflare client identity, persistent PostgreSQL limits and service-only transaction functions. It never forwards browser Authorization to its privileged client and calculates prices from database values. See [Phase 3 setup](../docs/phase-3-setup.md).

`api/events.js` accepts bounded same-origin optional activity, honors DNT/GPC, consumes a separate persistent budget before writing, and uses service-only idempotent SQL. No visitor identifier, IP, URL query, referrer or user agent is recorded in activity rows. Browser analytics cannot establish sent WhatsApp messages or orders. See [Phase 6 guide](../docs/phase-6-guide.md).

`api/admin/media.js` verifies the bearer with Supabase Auth and the private admin allowlist through `is_admin()`, then uses that caller JWT for Storage and guarded media RPCs. It accepts only bounded metadata-free static WebP output from the admin image pipeline. It does not use a service key. Parent revisions reject stale changes; known database rejections can clean up new objects, while ambiguous outcomes retain them for inspection. Removal protects product references and returns its entity snapshot transactionally. See [Phase 4 setup](../docs/phase-4-setup.md).

`scripts/vite-runtime.mjs` hosts the same server modules locally, deriving identity from the socket and reading ignored `.dev.vars`. Server secrets must never use a `VITE_` prefix. The authorized Cloudflare development preview is deployed; production remains separate. Build with `npm run pages:build`, validate with `npm run deploy:check`, and see [deployment instructions](../docs/deployment-guide.md).
