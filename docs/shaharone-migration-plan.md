> Historical document: the delivery and single hosted environment update supersedes the earlier root/city-selection and separate-backend requirements. See [current release guidance](delivery-release-guide.md).

# ShaharOne development migration

## Audit and implementation boundaries

The existing application uses modular vanilla JavaScript, Vite, Supabase and Cloudflare Pages Functions. The database already supports cities: listings have city-scoped slugs, localities have city-scoped foreign keys, and products/imports use merchant UUIDs and SKUs. Public RLS limits discovery to enabled cities and published listings. Private storage paths use record UUIDs, rather than a brand or city name.

No database migration, data reset, media move or new application is required. Applied migrations, city/listing/product UUIDs, storage paths, cart keys, checkout idempotency keys and administrator authorization must be preserved. Existing database branding is historical configuration; the public application uses its environment-configured brand.

The root currently opens the default city. The implementation will separate the platform landing page from city discovery, reuse the existing city-scoped category and merchant routes, and add bounded, RLS-protected city selection. Essential landing and discovery content will continue to render on the server.

| Route | Development behavior |
| --- | --- |
| `/` | ShaharOne platform and enabled-city selection |
| `/:city/` | City homepage; Rawatbhata remains the first/default city |
| `/:city/explore`, `/:city/search`, `/:city/:category` | Existing discovery, scoped to that city |
| `/:city/:category/:merchant` | Existing merchant page and historical-slug handling |
| `/admin/` | Existing single-administrator dashboard |

Production canonical URLs will use the configured `https://shaharone.in` origin. Preview/development remain noindex. Host migration redirects are explicitly disabled until launch: the old Pages root maps to `/rawatbhata/`, existing city paths retain their paths, and `www.shaharone.in` maps to the apex. Unknown paths and API writes will not be guessed or redirected by the application.

Development keeps the existing development Supabase project. Production must use a separately provisioned Supabase project and the existing production preflight. Password sign-in already works without an email callback; there is no password-recovery callback route to configure. Browser carts/sessions cannot automatically transfer between different domains.

All changes are local. This task does not authorize changes to Cloudflare, DNS, hosted Auth settings, hosted data or a production deployment. In particular, pushing to the Git-connected production branch could deploy automatically and is outside this task.

## Validation

Check platform/city/category/merchant HTML and metadata, future-city isolation, redirect safety, sitemap normalization, password authorization, carts and authoritative checkout, promotions/hours, image security and imports. Run syntax checks, SQL/unit/integration tests, desktop/mobile browser regressions and production bundle/Pages Functions checks. Record results and the manual launch steps in the launch guide.
