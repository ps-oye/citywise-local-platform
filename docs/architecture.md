# Architecture and Phase 1 implementation plan

The foundation/phase history below is retained. The current [delivery update report](delivery-update-report.md) and [release guide](delivery-release-guide.md) supersede old separate-hosted-environment requirements. This update preserves the existing framework, modules, database identities and storage paths.

## Current delivery and city behavior

The existing merchant page, cart service, authoritative quote RPC and trusted Pages checkout endpoint now support food delivery: review current item prices/quantities, enter a mandatory address and optional instructions, validate again, record one idempotent initiation, then prepare the merchant's WhatsApp link. Shared `src/domain/delivery.js` owns text normalization/validation and admin category-capability interpretation. SQL remains authoritative for merchant classification, eligibility, stock, money and business hours. Delivery text is transient; only an opaque keyed retry digest enters the existing private intent table. Non-food fulfillment/contact behavior is retained.

Admin analytics reuses the private intent/item tables through two bounded, single-admin RPCs for merchant options and tracking. Stable merchant IDs and recorded item snapshots retain archived/renamed history. Count/value/average calculations run in PostgreSQL before item expansion; browser aggregate money formatting uses exact integer arithmetic. Analytics labels distinguish checkout initiation/link preparation from accepted orders and estimated value from revenue.

The public route parser still recognizes platform `/` and dynamic city routes. The server probes the unfiltered enabled-city projection: a singleton returns temporary 307/no-store to that city's homepage; the browser mirrors this with replacement navigation. Filtered city search cannot trigger a false singleton. Multiple enabled cities restore the platform selector automatically, while locality filtering remains city-scoped. Navigation, canonical HTML and sitemap rules share that behavior; unknown cities never silently load Rawatbhata.

One existing Git repository/main/Pages/Supabase/Auth/Storage configuration serves the hosted application. Public build and private runtime variables must identify the same backend and production site origin. Local isolated SQL/HTTP/browser/Pages-runtime fixtures replace hosted test writes. Explicit indexing/known-host redirect flags and exact-origin checks remain; automatic preview creation and separate-project selectors are retired. Migration 10 must be reviewed/backed up/applied before an approved release; it is not applied by the implementation task.

## Scope and plan

Phase 1 provides a runnable foundation: inspect the original documents; establish separate public/admin entry points; add safe shared modules and design tokens; model the relational entities; enforce database/storage access; provide isolated seeds and tests; document external setup. This section records that original work. Current behavior is described in [discovery architecture](discovery-architecture.md), [merchant architecture](merchant-architecture.md), [admin architecture](admin-architecture.md), [catalog architecture](catalog-architecture.md), [SEO/analytics architecture](seo-analytics-architecture.md) and [Phase 6 results](phase-6-report.md).

The original repository contained only AGENTS.md, MASTER_SPEC.md, LICENSE and a one-line README. No application code or existing database had to be migrated.

## Decisions

1. **Vanilla JavaScript with Vite.** Two HTML entry points share small DOM utilities and token-based CSS. No UI framework, icon library, webfont or carousel dependency is needed.
2. **Layered code.** Pages/components render text and manage UI state; services orchestrate; repositories access Supabase; domain modules will hold independently testable business rules. Import business logic into both public/admin flows rather than copying it.
3. **RLS is the authorization boundary.** Public reads always use the publishable key. A private, single-row allowlist maps one Auth UID to administration. No browser role assertion can grant privileges.
4. **Multi-city from the start.** Listings, localities, promotions and homepage sections carry city identifiers. Composite foreign keys reject cross-city assignments.
5. **Separate visibility concepts.** Publication, platform enablement, sponsorship, category-specific featured placement/rank and operating status are independent. A closure never unpublishes a business.
6. **Relational core.** Products, prices, schedules and ranks are typed relational records. JSONB is limited to category definitions/values and flexible offering details.
7. **Private operational records.** Checkout, import reports, catalog versions, audit metadata and analytics live outside the exposed API schema.
8. **Private media.** Reads follow listing/ad visibility. Uploads are restricted by admin UID, path, bucket type and size configuration.
9. **Money in minor units.** Non-negative constrained bigints fit safely in JS integers. Checkout will use authoritative prices in a trusted backend in Phase 3.
10. **Isolated tests.** PGlite executes the actual SQL without Docker or credentials. Auth/Storage system schemas are contract fixtures; a real Supabase stack remains a separate integration check.

## Boundaries

```mermaid
flowchart LR
  Public[Public HTML and JS] --> Service[Shared services]
  Admin[Admin HTML and JS] --> Service
  Service --> Data[Supabase repositories]
  Data --> RLS[PostgreSQL RLS]
  RLS --> Business[Public business tables]
  RLS --> Allowlist[Private admin allowlist]
  Storage[Private Storage buckets] --> RLS
  Future[Later trusted Pages or Edge Functions] --> Private[Private operational records]
```

Public and admin bundles have separate entry points. Public SDK clients do not load or persist admin sessions. The initial unconfigured page does not load the SDK chunk. No Realtime subscription or unbounded catalog query is installed.

## Routing and SEO contract

Phase 1 routes were `/` and `/admin/`, plus a genuine static 404. Phase 2 adds `/rawatbhata`, `/rawatbhata/explore`, `/rawatbhata/search` and reusable `/:city/:category` routes, with URL-backed listing previews. These development pages remain excluded from indexing. The shared route parser is used by browser navigation, Vite and the Pages public HTML renderer.

Public route contracts:

- `/:city/:category` — reusable category page (Phase 2).
- `/:city/:category/:listing` — reusable merchant page using a stable UUID internally (Phase 3).
- `listing_slug_history` — stores previous slugs; the route service resolves current URLs and redirects old ones.

Phase 3 implements request-time merchant HTML through a lightweight Pages Function and the matching local Vite adapter. The shared renderer queries with public credentials under RLS, escapes content/bootstrap data, emits headings/business details, returns true 404s and validates canonical redirects. Publication requires no source-file creation or rebuild. Phase 6 adds shared full metadata, structured data, dynamic discovery HTML, sitemaps and analytics. See [merchant architecture](merchant-architecture.md) and [Phase 6 architecture](seo-analytics-architecture.md).

## Trust boundaries

Checkout and analytics have no public insert policies. Their trusted endpoints validate payload limits, independent rate limits, idempotency and eligible targets before writing. Checkout also verifies authoritative product availability/prices. An enquiry is only initiated or handed off; the schema has no sent/accepted/completed order state.

Phase 4 implements the separate admin dashboard, Auth verification, single-UID allowlist enforcement, bounded transactional writes and caller-scoped image uploads. Phase 5 adds lazy-loaded catalog management, bounded worker parsing and confirmed atomic imports. Phase 6 extends request-time HTML to discovery pages, shares metadata between server/browser, provides runtime-gated sitemaps/indexing, and adds private service-only event ingestion plus guarded admin aggregates. Initial public data is reused during hydration. The latest update uses one existing hosted backend and retains isolated local testing. See [Phase 6 architecture](seo-analytics-architecture.md) for its original implementation history.
