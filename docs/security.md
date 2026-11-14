# Security model and verification

## Authorization

The Supabase publishable key identifies a project, not an administrator. RLS is enabled on all 33 application tables: the original 30, Phase 3's private checkout limiter, Phase 5's private import previews and Phase 6's private analytics limiter. Only the Auth UID in the private single-row allowlist can manage public business records. User metadata and frontend checks cannot grant access.

`public.is_admin()` is a stable security-definer function with an empty search path and fully qualified references. It returns only a boolean. Browser clients cannot modify or enumerate the allowlist. An inactive allowlist row revokes writes immediately, including for a still-valid session.

Public clients have SELECT grants and explicit visibility policies. Authenticated clients also have mutation grants, but RLS admits writes only for the allowlisted UID. No browser receives TRUNCATE, schema creation or private operational write grants. New application tables/functions require deliberate grants in a future migration.

The core migration enables RLS and revokes client table grants before its first commit. Stopping between the core and security migrations therefore leaves the application inaccessible to clients rather than exposing unprotected tables. This is tested both with and without legacy automatic grants.

`private.application_tables()` is the explicit ownership list for the 30 application tables. Grant, RLS and trigger loops use only this list; existing unrelated table/function ACLs and policies are not rewritten. Existing schema USAGE is preserved. If the later application grants would make a populated schema newly accessible to a client role, a compatibility check aborts before changing the schema.

Function default hardening applies to the role running the migrations. PostgreSQL's global PUBLIC EXECUTE default is revoked for that role, and per-schema automatic client grants are removed for public/private. Existing functions retain their execution grants. Future functions created by that migration owner in other schemas also need explicit execution grants; defaults for a different creator role must be configured separately.

| Caller | Published business data | Draft/disabled data | Business writes | Private operational reads | Direct operational writes |
| --- | --- | --- | --- | --- | --- |
| Anonymous | Read visible records | Denied | Denied | Denied | Denied |
| Ordinary authenticated | Read visible records | Denied | Denied | No rows | Denied |
| Allowlisted active admin | Read | Read | Allowed by RLS | Read | Denied |
| Trusted service backend | Trusted access | Trusted access | Trusted access | Trusted access | Trusted access |

Private records are not exposed through the configured REST schema. Guarded public RPCs provide bounded admin overview, import and analytics reporting. Operational writes from the import workflow run only through narrow private helpers that verify the administrator; no browser role gains private-table mutation grants.

Phase 4 exposes only bounded overview counts through `admin_overview`, guarded by `private.require_admin()`. Its other 18 admin RPCs are security-invoker functions with empty search paths, explicit authenticated-only execution grants and the same allowlist check. Existing RLS and unrelated grants/policies are preserved. Merchant/category/action/service-area/attribute writes, ordered ranking updates and selected-business schedule changes are transactional; stale parent revisions fail with SQLSTATE 40001, including media attachment, metadata updates and removal. Archiving retains catalogs/private enquiries. Scoped destructive application operations are documented in [Phase 4 setup](phase-4-setup.md).

The separate admin client persists only in the current tab's sessionStorage and verifies Auth `getUser()` plus `is_admin()`. Public clients never consume its session. SDK auth callbacks schedule verification outside the callback to avoid the SDK auth-lock deadlock. Public signup and anonymous sign-ins must be disabled in hosted Auth configuration. No browser can provision the allowlist.

`/api/admin/media` rejects cross-origin requests, absent/invalid bearers and non-admin UIDs before parsing uploads. The verified caller JWT and public key, rather than a service key, authorize Storage and SQL. Requests and image sizes are bounded. Browser decoding/re-encoding strips ICC/EXIF/XMP metadata; the server accepts only the canonical static WebP container and validates dimensions/chunk structure. Structural checks do not replace a server image-codec decoder; this is a trusted single-admin endpoint. Product references block deletion; live ads must be paused first. Only known database rejections allow upload cleanup; ambiguous network outcomes retain potentially committed files. Removal returns its revision snapshot from the same SQL transaction to avoid silently adopting concurrent edits. Private orphans can need deliberate Storage cleanup. Signed URLs have a maximum application lifetime of 60 seconds.

## Public visibility

A public listing must be published, enabled, unarchived, located in an enabled city/locality and assigned to at least one enabled category hierarchy. Related products, hours, service offerings, media, actions and featured records inherit that visibility. Disabled category ancestors hide their descendants.

Active but unavailable products remain readable so the later catalog can display an out-of-stock state. Inactive/archived products and disabled product categories are hidden.

Advertisements must be enabled, unarchived and currently within their date range. Linked listings must also be public. Temporary business closures do not affect publication.

Public visibility helper functions use owner access to avoid recursive RLS queries. They expose boolean eligibility only, use fixed qualified objects and do not accept SQL or destination URLs.

## Media

Both buckets are private. Public SELECT policies allow only exact enabled media references of eligible listings or advertisements. Uploaded but unreferenced objects are not public. Restrictive SELECT/INSERT/UPDATE/DELETE guards for anon and authenticated prevent permissive legacy policies from widening access to these two buckets. Other buckets continue to use their existing policies.

New admin uploads require the active allowlisted UID, its own owner_id, an existing listing/ad prefix and a raster image extension. The active administrator can update/delete platform media regardless of its uploader, including Dashboard/service uploads with no owner and files uploaded by a previous administrator. Updates still require a valid target path. A removed administrator immediately loses those mutation permissions.

The migration checks that Storage RLS is already enabled. It inserts missing buckets and reuses compatible existing ones without overwriting settings. Incompatible bucket privacy/size/MIME/name settings cause the transaction to abort. No stored file or bucket is deleted by the migration.

Bucket limits are 5 MiB and JPEG/PNG/WebP/AVIF. Supabase Storage's HTTP service enforces these bucket settings; SQL object-policy tests do not decode uploaded bytes. Phase 4's browser decoding/re-encoding and authenticated structural validation handle the application upload boundary described above. SVG uploads are disallowed; repository-owned SVG artwork is a static source asset.

Private download requests must remain authorized. Do not generate permanent Storage public URLs. Phase 2 batches on-demand signed image URLs with a 60-second lifetime and a 45-second client cache. Returned URLs must match the configured Supabase origin. Previously issued signed URLs remain usable until expiry after unpublishing. Phase 6 adds `/media/{uuid}` for stable social-image URLs: every request checks current public eligibility with the public key and downloads under RLS, with no-store responses, bounded bytes and validated image types. This does not invalidate earlier signed URLs or revoke copies already downloaded by another party. Demo-only photos use the constrained local asset directory.

## Phase 2 public RPCs

The discovery view and all four read functions run as security invokers, preserving underlying RLS and privileges. Explicit public eligibility also excludes drafts/disabled content when the caller is an administrator. Only SELECT and narrow function EXECUTE permissions are added; existing admin, private-table and Storage policies are unchanged.

Queries validate bounded pagination, city slugs, search length, supported sort modes and a small object of string-valued facets. Search uses parameter values and fixed SQL, not interpolated SQL or wildcard patterns. Category hierarchy, product availability flags, advertisement scheduling and provider service areas are evaluated in PostgreSQL. Cards/previews never request private customer/admin content.

## Browser configuration and content

- The same public environment validation runs in Vite and browser code. Unknown VITE_ keys, partial credentials and privileged Supabase keys are rejected without printing their values.
- HTTPS origins are required outside loopback development. Destination helpers reject executable protocols, credentials, protocol-relative URLs, whitespace and backslashes.
- Render database text with textContent or the shared HTML escaping utility at every text/attribute boundary. Do not inject arbitrary merchant HTML. Browser tests attempt malicious listing names/descriptions and search input.
- Public SDK clients do not persist or refresh admin sessions, and never detect credentials in URL fragments.
- The source repository ignores real environment files and dependency/build/test output.
- Cloudflare response headers restrict scripts, framing, browser capabilities and external connections. Build-time static headers and Function responses add only an exact validated custom Supabase origin when required. No unsafe-inline or unrestricted connection source is enabled. The Vite dev server does not serve the production _headers policy.

## Trusted operations

Phase 3 adds the narrow `/api/checkout` endpoint. Phase 5 adds guarded transactional import confirmation. Phase 6 adds optional activity through `/api/events` and database-authorized analytics reports. Private tables still have no browser write policies. Never label a WhatsApp link handoff as a message sent or an order accepted.

## Phase 3 trusted checkout

Public merchant/catalog/quote functions retain invoker RLS and explicit publication rules. The server uses a privileged key only for the three service-only checkout RPCs. It never forwards client Authorization headers or trusts browser prices, contacts, redirect URLs or availability flags.

The POST boundary requires same-origin JSON, a 16 KiB body limit, known fields only, at most 30 distinct items, integer quantities 1–99, an idempotency UUID and an optional note of at most 500 characters. Privileged values remain in ignored `.dev.vars` locally or server bindings in Pages. Public builds were checked against the actual server secret values, with no matches.

Hosted identity comes from Cloudflare's ingress `CF-Connecting-IP` only when its request metadata is present; local identity comes from the socket, ignoring forwarding headers. A keyed daily SHA-256 fingerprint supports database-backed limits without storing raw IP addresses. Client quotas are checked before shared quotas, and globally exhausted windows reject new scopes. Limits commit before business validation, so invalid/unavailable business attempts do not roll them back. See [Cloudflare's header semantics](https://developers.cloudflare.com/fundamentals/reference/http-headers/) and [Pages secret bindings](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

Trusted initiation independently checks published/enabled status, non-demo commerce type, verified contact, action/fulfilment rules, operating closures and every product's merchant/category/active/available state. Total money limits are checked after aggregation. Merchant/action/product locks and advisory idempotency locks protect both new attempts and retries. Price/stock/status changes require review again; a reused key with a different canonical request conflicts. SHA-256 fingerprints bind requests; the public quote token is a revision indicator, not an authorization secret.

The server builds links only from its database receipt, then records handoff creation. Failure to prepare/record a link returns a safe retry response. Historical snapshots preserve names, units and prices. The optional note is disclosed as part of the private enquiry record; no customer name, phone or address field is requested. Carts stay in the browser and remain untrusted estimates until quoted.

Merchant HTML uses public credentials under RLS, callback-based replacements, HTML/attribute escaping and safely escaped non-executable JSON. Hidden listings return 404; validated canonical redirects are same-origin paths. Tests cover XSS tags and JavaScript replacement tokens embedded in merchant text.

The audit trigger records minimal metadata for public business changes. Private operational mutation happens only through trusted backend workflows; later functions should provide corresponding operational audit details.

## What has been tested

Actual SQL runs in disposable embedded PostgreSQL with Supabase-owned Auth/Storage schemas represented by test-only fixtures. Tests switch PostgreSQL roles and simulated verified request UIDs to exercise anonymous/ordinary/admin/service access, publication, SKU/price constraints, admin revocation, private writes, media ownership and promotion scheduling.

After approved development setup, separate read-only smoke checks verified the real PostgREST discovery RPCs, product search, locality filtering, previews and demo action restrictions. Phase 6 deployed the authorized Cloudflare preview and verified real response headers, routes, HTML metadata, public navigation, sample carts, demo checkout restrictions and protected API boundaries. Admin Auth/Storage workflows use isolated HTTP fixtures with the actual SQL/RLS; hosted password login and real Storage HTTP upload limits/byte validation remain unverified. No admin password or hosted business/media test fixture was used.

The migration-safety suite additionally checks inter-migration access, default function privileges, unrelated-object preservation, populated-schema compatibility, legacy Storage policy composition, administrator replacement, merchant/import-job consistency, and safe bucket failures. All fixtures run in memory and do not read application environment files or connect to a real database.

Dependencies are locked. Run npm audit after dependency changes and review any findings before adoption.

## Phase 5 catalog and spreadsheet boundary

The new public catalog/import RPCs are security invokers with empty search paths, authenticated-only EXECUTE and the existing database allowlist check. All 30 public admin RPCs at Phase 5 retain those properties; Phase 6 adds the same protections to the 31st, `admin_analytics`. Product writes use existing RLS and merchant-scoped foreign keys. Four private definer helpers prepare, lock or finish actor-owned import jobs and record versions, each requiring the current administrator before privileged access; no broad private write grant or exposed private schema is added. Existing Storage rules are unchanged.

The browser never sends a merchant ID from a spreadsheet. The selected dashboard merchant scopes every preview and update. SQL independently rejects unsupported keys, non-scalar cells, duplicates, invalid SKUs/prices/booleans/units/dietary values, archived SKUs, price-only extra fields/unknown SKUs, and foreign category/media references. Exact decimal prices become constrained integer minor units. Price-only changes cannot alter other fields or silently clear omitted original prices.

The server stores a bounded immutable payload, digest, plan, snapshot, actor and 30-minute expiry. Confirmation receives only the job identity, checks current authorization/actor/state, locks relevant records and verifies both the catalog fingerprint and each planned product identity/revision. A concurrent SKU rename cannot substitute a different target or turn an expected new row into an unintended update. A failed later row rolls back the entire catalog/version mutation before a failure report is recorded. Retrying a settled job returns the saved result; stale/expired previews require another review. Missing products and enquiry history are preserved. Existing triggers audit product/category changes.

Untrusted files are bounded to 5 MiB/1,000 data rows, parsed in a disposable same-origin module worker and never uploaded to Storage. ZIP validation checks central/local metadata, CRC, actual streamed expansion, safe unique paths and entry/byte limits. XML inspection rejects DTD/entities, ambiguous attribute namespaces, formula cells including cached formulas, external relationships, active content, merged cells and invalid or nonascending coordinates. Numeric Excel SKUs are rejected rather than losing identifier formatting. The bounded archive is repacked without compression before the universal cell reader runs, avoiding nested blob workers under `worker-src 'self'`. Parsing timeouts/cancellation terminate actual computation.

Formula-like imported strings are rejected independently in JS and SQL, and CSV exports defang executable leading characters. Rendered cells/errors/differences use the existing escaping utility. Templates/reports use temporary Blob downloads without permitting worker/script blob sources. The dashboard disables file/mode and report controls during confirmation and ignores late callbacks from old files, routes and preview pages.

Dependencies are pinned: read-excel-file 9.3.15, Papa Parse 5.7.1, fflate 0.8.3 and Saxen 11.1.0. The production build keeps parser code out of the public entry point and contains no matches for configured server-secret values. Final npm audit reports zero vulnerabilities. See [catalog architecture](catalog-architecture.md) for the parser source references and [Phase 5 report](phase-5-report.md) for executed adversarial tests and live read-only verification.

## Phase 6 analytics and public HTML

`/api/events` accepts same-origin JSON only, at most 8 KiB and 20 events. It validates event keys, known types and UUID targets before any SQL call. The service credential is used only by the trusted backend; request Authorization is never forwarded to it. SQL validates current public eligibility, derives city/advertisement associations and timestamps, and counts identical UUID retries once. Reusing an event UUID for a different type or target fails the entire batch. Anonymous and authenticated roles cannot execute the two writer/limiter RPCs or write event tables directly.

Analytics budgets are separate from checkout: 120 events per client/minute, 1,000 per client/hour and 5,000 globally/minute. Quota consumption commits before recording and survives a later event-validation failure. Denied clients do not consume the shared budget; an exhausted global window rejects new scopes. A daily domain-separated HMAC fingerprint of trusted ingress identity exists only in ephemeral limiter rows, never in activity records. Only limiter counters inactive for over two days are pruned. No scheduled event, enquiry or business-data purge is installed.

Event records contain no IP, visitor/session identity, query, referrer or user agent. The browser keeps a bounded memory-only queue and persists only an opt-out boolean. DNT, GPC and explicit opt-out suppress optional activity; analytics failure cannot block discovery or checkout. Ad impressions require a loaded active image, at least 50% viewport visibility for a continuous second, a visible document and no covering application modal. These remain approximate browser reports, not authenticated unique-visitor or advertising-billing evidence.

`admin_analytics` is an allowlist-guarded invoker with a maximum 90-day city-local date range. It returns aggregates, bounded top/recent records and no enquiry notes, contacts or item snapshots. Checkout initiation and handoff preparation come from existing trusted records, independently from browser events. Tests cover ordinary-user/anonymous denial, admin revocation, cross-city targets, idempotency, quota persistence and historical date semantics.

All public HTML, sitemap and media reads use the public key and existing RLS. Essential HTML/bootstrap data is escaped, bounded and reused by browser navigation. Dynamic responses are no-store; hashed assets are immutable. Preview/demo/search/filtered/error URLs remain noindex. Indexing requires explicit production flags, an HTTPS canonical origin matching the request and eligible real content. Robots permits crawlers to read noindex directives; preview sitemaps disclose no URLs.

Migration 9 preserves `discovery_home`'s invoker permissions, RLS, contract and locality/ranking behavior. It limits identities before card enrichment and disables JIT only for this function. No global database timeout, grant or policy was weakened to resolve the hosted homepage timeout.

The preview deployer verifies the target Cloudflare account and raw project production-branch metadata before upload. It publishes only to a separate preview branch and writes bindings only in the preview environment. Credentials pass through memory/stdin with redacted errors; Wrangler retains its normal local login profile. The built public artifacts were scanned against actual configured server-secret values with zero matches. No production target, custom domain, DNS or paid service was configured. See [Phase 6 setup](phase-6-setup.md) and [results](phase-6-report.md).

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Storage ownership](https://supabase.com/docs/guides/storage/security/ownership), [PostgreSQL policy composition](https://www.postgresql.org/docs/17/sql-createpolicy.html), [default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html), [JavaScript client initialization](https://supabase.com/docs/reference/javascript/initializing).

## Phase 7 verification and fixes

The admin operation runner now checks its page generation and active user before invoking a mutation, so an old confirmation resolving after navigation cannot submit a write. This UI guard complements the existing database allowlist/RLS; it does not replace authorization. Pending cart quotes are bound to their captured request/preference and invalidated by cart or fulfilment changes. Search suggestions discard old state immediately and cannot reopen after focus leaves.

Optional analytics preferences synchronize across open tabs through storage events and are refreshed when a tab becomes visible. Opt-out clears/aborts pending work, and changing the choice back cannot retry a discarded batch. If storage is blocked, the current tab still honors its in-memory preference. No visitor identifier or new event field was added.

The production preflight validates the project ref and compares the complete normalized HTTPS Supabase origin, rejecting suffix hosts, injected refs and unexpected ports before sending credentials to a backend. Actual public build and compiled Functions scans found no configured server-secret values.

Phase 7 adds no migration or hosted business-data test fixture. Read-only live checks retain 33 RLS tables, 31 guarded invoker admin RPCs, private buckets and service-only event writers. Local SQL/HTTP/browser tests cover role revocation, stale operations, privacy and checkout/import behavior. Hosted QA uses DNT and public reads; real password sign-in and Storage uploads remain operator verification before production. See [Phase 7 results](phase-7-report.md).
