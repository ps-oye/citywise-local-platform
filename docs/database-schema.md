# Database schema

Phase 1 defines 30 business/operational tables across two schemas. Phase 3 adds a private checkout limiter, Phase 5 adds private import previews, and Phase 6 adds a separate private event limiter. All 33 tables have RLS. Later migrations add public read models and guarded admin/checkout/catalog/analytics operations. UUIDs are stable internal identities; public routes use scoped slugs. Migrations advance in filename order.

## Migration sequence

| File | Responsibility |
| --- | --- |
| `20261112000100_core.sql` | Schema compatibility checks, types, 30 tables, constraints, indexes, triggers, deny-by-default grants and RLS before the first commit |
| `20261112000200_security.sql` | Admin authorization, public visibility policies, scoped grants and audit triggers |
| `20261112000300_storage.sql` | Storage compatibility checks, private buckets and permissive/restrictive object policies |
| `20261112000400_discovery.sql` | Constrained display/demo assets, security-invoker discovery view, bounded public read RPCs and product-price index |
| `20261112000500_merchants.sql` | Merchant/catalog/quote reads, authoritative hours, slug history, demo product images, service-only checkout and persistent limiter |
| `20261112000600_admin.sql` | Two admin query indexes, restricted validation helpers, 19 security-invoker admin RPCs, transactional CRUD/ranking/hours/media and a public logo read; preserves existing RLS/Storage policies |
| `20261113000700_catalog.sql` | Private bounded immutable import previews, product query index, nine private helpers and 11 guarded invoker RPCs for catalog editing, preparation, transactional confirmation and reports; no catalog data changes on installation |
| `20261113000800_seo_analytics.sql` | Public invoker sitemap/media reads, service-only event recording/independent limiter, guarded city-local admin aggregates and three supporting indexes |
| `20261113000900_homepage_query.sql` | Same homepage RPC/ACL/RLS contract; selects bounded ranked identities before materializing expensive display cards and scopes JIT off to this function |

`supabase/seed.sql` initializes only the real city and public brand settings. `supabase/seeds/discovery-demo.sql` includes that baseline and installs the complete Phase 2 fictional dataset. `supabase/seeds/demo.sql` remains the smaller Phase 1 test fixture.

## Public business schema

| Tables | Relationships and purpose |
| --- | --- |
| `cities`, `localities` | Cities have IANA timezones; localities belong to one city. At most one city is the enabled default. |
| `categories`, `category_attributes` | Global category hierarchy; typed attribute definitions and optional filter options. Cycles are rejected. |
| `platform_settings` | One row of public brand text; no secrets or administrative settings. |
| `listings` | Common business fields, listing type, locality, contacts, publication, enablement, sponsorship and demo status. |
| `listing_categories` | Many-to-many category membership, with at most one primary category. |
| `listing_slug_history` | Old city-scoped slugs associated with stable listing IDs. The route/redirect workflow is deferred. |
| `listing_media` | Private bucket object references, alt text, image role and display order. |
| `listing_attributes` | Small JSONB values for category-specific attributes. Public reads require membership in the corresponding visible category. |
| `listing_service_areas` | Many localities served by one provider, restricted to the listing's city. |
| `listing_actions` | Checkout, closed-hours enquiry and fulfilment configuration. |
| `offerings` | Relational room, membership, service, package or visiting-information records; small flexible details only. |
| `product_categories`, `products` | Catalog categories scoped to one merchant; products identified uniquely by `(merchant_id, sku)`. Images/categories must belong to that merchant. |
| `business_hours` | Multiple intervals per weekday, with an explicit overnight flag. No interval means no scheduled opening for that weekday. |
| `special_hours`, `special_hour_intervals` | One date exception per business; closed dates override intervals. Multiple special-day intervals are supported. |
| `temporary_status_overrides` | One unrevoked manual override per listing, with optional expiry. Reopening revokes/replaces that override; it never unpublishes a listing. |
| `advertisements` | City-scoped promotions with optional linked listing, image paths, priority and start/end times. |
| `homepage_sections` | One category section per city, with independent visibility and ordering. |
| `homepage_featured_listings` | Featured membership/rank scoped to a section, category and city. Composite keys prevent unrelated assignments. |

## Private operational schema

`private` is not listed in the exposed Data API schemas. Authenticated clients can only read these records if the allowlist authorizes their UID. Narrow guarded public RPCs provide admin overview and import workflows without exposing that schema.

| Table | Purpose |
| --- | --- |
| `admin_users` | A boolean primary key constrained to true permits exactly one administrator at most. The Auth UID is unique; active=false immediately revokes authorization. No browser can insert or edit this allowlist. Manual provisioning is required. |
| `product_import_jobs` | Merchant, actor, upsert/price-only mode, bounded row counts and job status. |
| `product_import_errors` | Row/column-specific validation reports without retaining entire uploaded sheets. |
| `catalog_import_previews` | One immutable request digest, server snapshot, source metadata, normalized payload, per-row plan and summary per job; 30-minute confirmation expiry. Composite `(job_id, merchant_id)` FK prevents cross-merchant artifacts. |
| `catalog_versions` | Version metadata and optional private snapshot path, scoped to merchant. A composite foreign key requires any linked import job to belong to that same merchant. |
| `checkout_intents` | Unique idempotency key and readable enquiry reference, authoritative total and initiated/handoff_created states only. |
| `checkout_intent_items` | Product/price snapshots and validated quantities/line totals, constrained to the intent's merchant. |
| `analytics_events` | A unified typed log for listing/contact/ad events, replacing duplicate event tables. Event keys are unique; ad and listing city references are constrained. |
| `analytics_rate_limits` | Service-only ephemeral daily-HMAC client/global event budgets; separate from checkout, no visitor fingerprint in event rows. |
| `admin_audit_logs` | Append metadata for public-table changes: actor UID, table, record identity, operation and timestamps. No content/contact snapshots. |

Private writes require trusted database/backend execution. The browser administrator has only SELECT grants subject to RLS on import records; Phase 5's guarded private definer helpers prepare/finish owned jobs and record versions without adding browser write grants. Audit metadata is automatically inserted by restricted trigger functions.

## Integrity and indexing

- Each application table has created_at and updated_at timestamptz fields; update triggers set updated_at from the database clock. The explicit `private.application_tables()` manifest scopes grant/RLS/trigger operations to these 30 tables.
- Money uses non-negative integer minor units with an upper bound of 99,999,999,999; INR is the initial currency. Never accept a browser total as authoritative.
- Timezone triggers validate names against PostgreSQL's IANA timezone catalog.
- Slugs are lowercase, hyphen-separated and length constrained. Listing slugs are unique within a city.
- Contacts use E.164 shape checks. Verification remains a trusted administrator action.
- Demo listings cannot contain phone/WhatsApp numbers, addresses, coordinates or map references. Checkout cannot be enabled for demos or unverified/non-commerce contacts. Disabling a verified contact first requires disabling checkout.
- Foreign keys prevent cross-city localities/service areas/featured placements, cross-merchant product images/categories, cross-merchant checkout lines and cross-merchant catalog/import-job references.
- Published/enabled listing and catalog indexes support bounded queries. Search uses initial GIN full-text indexes, with no external search infrastructure.
- Homepage ranking is rank ascending, then listing_id ascending; the discovery RPC limits each category to four records.
- Products/listings/promotions have archive fields or statuses. Public visibility does not depend on a business's operating hours.

Phase 3 implements checkout calculation, automatic hours evaluation and merchant slug-change routing. Phase 5 implements previewed atomic imports. Phase 6 implements controlled event intake and bounded admin reporting; production remains separate from the deployed development preview.

## Public discovery read model

`discovery_listing_cards` uses `security_invoker=true` and `security_barrier=true`, preserving the caller's table privileges/RLS. Explicit public eligibility also hides drafts when an administrator calls public endpoints. The projection combines eligible categories, locality/service areas, indicative prices, facets and private media references. Phase 3 updates the existing view to use the shared schedule calculation, including manual status. Missing schedules are explicitly labeled unavailable.

| RPC | Bounded result |
| --- | --- |
| `discovery_context(text)` | One selected city; at most 20 cities, 100 localities, 60 categories, 200 filter definitions and 10 active promotions |
| `discovery_home(uuid,uuid,integer,integer)` | 1–6 category sections per request, at most four featured cards each; default four sections |
| `discovery_listings(uuid,uuid,uuid,text,text,integer,integer,jsonb)` | 1–24 matching cards, default 12; search/product matches, category descendants, locality/service areas, facets and deterministic sort |
| `discovery_preview(uuid)` | One eligible card with description, or null |

All four functions are stable security invokers with an empty search path and explicit EXECUTE grants. Search is limited to 100 characters, offsets to 10,000 and facets to six bounded string values. No dynamic SQL or public mutation endpoint is introduced. Search uses PostgreSQL text matching/full-text operations; it does not load the complete catalog into the browser.

Category `short_name` and `cover_image_path` support shortcuts. Listing/ad demo image fields accept only controlled `/images/demo/` raster paths and require `is_demo`. Real listing/ad uploads continue to use private Storage. Migration 4 replaces `advertisements_check1`, the Phase 1 image-presence check, with `advertisements_image_required`: enabled real ads still need a Storage desktop image; demo ads may instead use their constrained local image. No row, table, foreign key, policy, bucket or stored object is deleted.

## Seed lifecycle

The Phase 2 discovery seed uses deterministic IDs and unmistakable demo names. It refreshes its existing demo names, descriptions, imagery, facets, prices, offerings, featured ranks and sponsored advertisement dates; non-demo businesses are preserved. It creates 33 listings, 15 categories, three localities, three promotions and one sample manual closure. Local licensed image assets require no Storage upload. The Phase 1 fixture additionally contains sample weekly schedules; automatic schedule evaluation is not a Phase 2 feature.

Removal is a reviewed manual transaction. Restrictive foreign keys deliberately reject deletion if operational records still depend on demo listings. The baseline city, brand settings, Auth users and admin allowlist are retained.

## Phase 3 merchant and checkout contracts

| RPC | Caller and purpose |
| --- | --- |
| `merchant_detail(text,text,text)` | Public invoker read; resolves eligible current/historical listing slugs and returns the canonical path, bounded media/offerings, actions, schedules and business information |
| `merchant_products(uuid,text,uuid,text,boolean,text,integer,integer)` | Public invoker read; search/category/diet/availability/sort filters, default 12 and maximum 24 products |
| `merchant_availability(uuid,timestamptz)` | Public invoker read; listing-local weekly/special/overnight intervals, merged overlaps and manual override priority |
| `merchant_cart_quote(uuid,jsonb,text)` | Public invoker read; at most 30 distinct product IDs and quantities 1–99, current prices/stock, eligible fulfilment and a non-secret revision fingerprint |
| `checkout_consume_limit(text,uuid)` | Service-only mutation; separate committed rate consumption before business validation |
| `checkout_initiate(uuid,jsonb,text,text,text,uuid)` | Service-only transaction; locks merchant/actions/products, revalidates eligibility and quote, binds an idempotency key to a canonical SHA-256 request fingerprint and snapshots authoritative line values |
| `checkout_mark_handoff(uuid,text)` | Service-only mutation; marks link preparation after a valid WhatsApp URL has been built, never message delivery |

The public read functions run under caller RLS plus explicit public predicates. Trusted functions run as security invokers and are executable only by `service_role`; the HTTP handler is the authorization/input/rate boundary. The private limiter has its own explicit RLS/grants and is outside the original 30-table business manifest. Only keyed daily client fingerprints and counters are stored there, with no raw address. Expired limiter counters older than two days are pruned on subsequent rate consumption.

New nullable intent columns preserve merchant/contact/request snapshots; existing records are retained. Item units are also snapshotted. State remains `initiated` or `handoff_created`. Original foreign keys, money domains, administrator authorization and Storage policies remain unchanged.

Slug edits within a city automatically reserve the previous listing slug. Current or historical URLs in an assigned visible category resolve to the current primary category path; attempts to reuse another listing's reserved slug fail. Cross-city/category-history migration remains an explicit future administrative concern.

The merchant seed requires the discovery seed and migration 5. It brings the fictional dataset to 110 products, product groups, split schedules and one sample date exception. Constrained local product image references require a demo parent; conversion to a real merchant requires clearing those references. Cleanup remains manual and was tested only in disposable databases.

## Phase 5 catalog and import contracts

| RPC | Contract |
| --- | --- |
| `admin_catalog_merchants` | City-scoped commerce/restaurant picker, 20 records per page, bounded name/slug search |
| `admin_catalog_context` | Merchant metadata, at most 300 product groups, 100 media references and current version |
| `admin_catalog_products` / `admin_catalog_product` | Paged product search/status filtering (default 20, maximum 50), or one product |
| `admin_save_product` / `admin_product_state` | Validated manual edit with expected revision; explicit archive/restore preserves identity/history |
| `admin_save_product_category` | Merchant-scoped group create/edit/disable with expected revision |
| `admin_prepare_import` | Up to 1,000 normalized rows / 1 MiB, row validation and immutable differences; no product mutation |
| `admin_import_report` / `admin_import_history` | Guarded paged source/plan/error/results; report page 25 by default (maximum 1,000 for export), history 20 (maximum 50) |
| `admin_apply_import` | Actor-bound, expiring prepared job only; snapshot and target identity/revision checks, atomic SKU upserts or price-only updates, idempotent settled result |

All 11 new public functions use invoker security, an empty search path and `private.require_admin()`; explicit EXECUTE is authenticated-only. Four private definer helpers authorize every call and only prepare, lock, finish jobs or record catalog versions. Five other private helpers use invoker security. Existing product RLS, merchant-scoped SKU uniqueness and cross-merchant category/media foreign keys remain authoritative.

The preview's payload/plan are bounded private workflow artifacts; public products stay relational. Source size is limited to 2 KiB, payload to 1 MiB, plan to 7 MiB and summary to 8 KiB. The server hashes the relevant merchant/target products/categories/media, stores expected target IDs/revisions including absence, and revalidates before applying. Any row failure rolls back every product change while retaining the failed job/report. Omitted file products are never deleted; archived SKUs require manual restoration. Version metadata identifies changes, not a full automatic restoration snapshot.

The new preview table has its own explicit grants/RLS/timestamp trigger outside the original 30-table manifest. Its job/merchant foreign key cascades only private preview cleanup if an operator deletes an import job; the dashboard and migration never do so. No previous migration or Storage policy is changed.

## Phase 6 SEO and analytics contracts

`seo_public_paths`, `seo_sitemap_index`, `seo_sitemap_page` and `public_media` are explicit public invoker reads with empty search paths and publication checks, including for administrator callers. Sitemap pages contain at most 1,000 real canonical URLs; the index rejects more than one million URLs. No potentially inaccurate child-content `lastmod` is emitted. Media reads resolve only enabled references of public listings; the image endpoint downloads with public credentials under Storage RLS.

`analytics_consume_limit(text,integer)` and `analytics_record_events(jsonb)` are service-only invokers. The HTTP boundary validates same-origin JSON up to 8 KiB / 20 events, fingerprints trusted ingress identity and commits an independent event budget first. SQL derives city/association/time, verifies publication/contact eligibility, inserts only the six supported event types and binds unique event keys to the original type/target. Conflicting key reuse rolls back the batch. Event budgets allow 120/client/minute, 1,000/client/hour and 5,000/global/minute, charged by events; expired counters older than two days are pruned. No browser mutation grant/policy is added.

`admin_analytics(uuid,date,date,boolean)` is an authenticated invoker guarded by the existing allowlist and private-table RLS. Its maximum 90-day range uses city-local half-open timestamp boundaries, zero-filled days, separate browser/enquiry/handoff aggregates, top-ten tables and twenty enquiry references/states. Demo inclusion is explicit. Notes, contacts, item snapshots, raw IPs and visitor identifiers are not returned. The total public admin RPC count is 31.

Migration 9 retains the homepage function identity and grants. It materializes the requested section page, selects up to four publicly eligible ranked identities per section (including enabled service-area locality matches), enriches at most 24 distinct identities for the maximum six-section request, and reuses those cards across sections. Ranking ties, public visibility, empty sections and pagination semantics remain unchanged. No policies or business rows are altered.
