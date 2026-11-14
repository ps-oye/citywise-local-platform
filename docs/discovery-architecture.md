# Phase 2 discovery implementation

This records the Phase 2 boundary. Phase 3 now links cards/search to full merchant pages and calculates scheduled card status; old quick-look URLs remain compatible. See [merchant architecture](merchant-architecture.md) and [Phase 3 results](phase-3-report.md).

Phase 2 implements the public header, promotional slideshow, category shortcuts, ranked homepage rails, category/search pages and locality filtering. Merchant cards open an accessible, URL-backed quick-look dialog. Full merchant pages, catalogs, calculated hours, checkout, admin workflows and analytics remain in their specified later phases.

## Data flow

The existing Supabase client remains sessionless on public pages. A security-invoker PostgreSQL view projects public card data. Four bounded, read-only RPCs supply context, homepage section pages, filtered/search result pages and a single listing preview. Underlying RLS and explicit public eligibility both apply. Search includes listing/category/locality text, offerings and active products; filters and pagination run in PostgreSQL.

Only four homepage sections (up to four listings each) load initially; additional sections load on request. Search suggestions request at most six results and cancel stale requests. Result pages request twelve listings and support incremental loading. Private image references resolve through short-lived signed URLs, batched by bucket as images approach the viewport.

## Demo content

The opt-in discovery seed creates 33 fictional listings across 15 categories, three fictional localities, database-driven facets, catalog/offerings metadata and three sponsored demo promotions. It reuses Phase 1 demo IDs and updates demo rows only. Local licensed images are referenced by constrained database fields; businesses and categories are never embedded in public templates or frontend record arrays. Actual merchant uploads continue to use private Storage.

## Routes

A shared route parser handles /, /:city, /:city/explore, /:city/search and /:city/:category. Local Vite middleware and a lightweight Pages Function serve the public shell for those descriptive routes. /admin and static assets retain their separate paths. A listing query parameter opens a quick-look dialog without introducing Phase 3 merchant pages.

Search, locality, sorting and attribute facets are represented in URL parameters for refresh/back/forward and sharing. Dynamic public SEO rendering remains Phase 6; no merchant HTML generation or production publication occurs here.

