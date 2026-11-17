# Delivery checkout and single hosted environment update

## Audit

The current app already has independent merchant carts, authoritative cart quotes, a protected/rate-limited checkout endpoint, unique idempotency keys, private checkout/item snapshots, single-admin RLS, city-aware routes and local isolated tests. Merchant/product/image/ad/hours/import modules are retained.

The checkout checkbox is disabled for immutable fictional sample listings. Database safeguards also reject sample contacts/checkouts, unpublished/disabled shops, unverified WhatsApp contacts, unavailable products and configured closures. Eligible real commerce/restaurant merchants can already enable checkout, but food currently defaults to pickup or enquiry and delivery is initially disabled. These safeguards must remain; real eligible merchants need a coherent delivery workflow and clear setup guidance.

Existing private checkout tables already preserve historical merchant UUIDs and item/price snapshots, but the admin report lacks merchant filtering, monetary aggregates and item detail. Existing `admin_listings(all)` omits archived merchants and cannot supply a complete history filter.

The latest requirements replace the earlier platform-root and separate hosted database requirements. Keep the existing Supabase project and credentials, the existing Pages project and repository, and `main`. Local automated tests continue to use isolated fixtures. No new hosted project or staging site is required.

## Implementation plan

1. Prepare migration 10, leaving applied migrations 1–9 unchanged. Add a category food-catalog capability, inherit it through category ancestors, and treat restaurants as food merchants. Mark the existing food/sweets category capabilities without changing their identity/content. Add delivery-aware read/admin wrappers and authoritative food-delivery quote rules. Preserve non-food commerce preferences and informational contact actions.
2. Reuse the locked/idempotent initiation logic through a shared private core. New food initiation requires a server HMAC fingerprint of normalized delivery details; raw customer address/instructions are transient and never sent to database RPCs, analytics or internal URLs. Keep historical rows and references; generate new `SO-` references and accept historical `RB-` references.
3. Add authenticated/admin-guarded merchant-selection and tracking RPCs, date/status indexes and bounded paging. Aggregate intents before joining item rows. Include disabled/archived merchant history and precise monetary totals; return no private customer text.
4. Update the food confirmation dialog with mandatory validated multiline address and optional delivery instructions. Make delivery the only food fulfilment. Validate on client and server; preserve price/availability rechecks, closure explanations, idempotency, popup-blocker fallback and demo protections.
5. Make `/` temporarily route to the sole enabled city using an unfiltered city probe; restore city selection automatically with multiple enabled cities. Keep locality selection, merchant URLs and SEO/sitemaps consistent. Add the footer Contact Us email only.
6. Simplify to one hosted configuration, preserve origin/secret/public-server matching checks and explicit indexing/redirect opt-ins, retire preview deployment creation, and document `main` deployment plus local fixture testing.
7. Run local SQL/unit/browser regressions, builds, privacy checks and relevant performance checks. Prepare migration review, backup and rollback instructions. Do not apply migrations, write hosted records, change credentials/Cloudflare/DNS settings or deploy.

## Migration review and release boundary

Migration 10 is a pending local artifact until reviewed and explicitly applied. It must contain no table reset, merchant/product/history deletion, demo seed replay or RLS relaxation. The new app requires that migration before release. Backup schema and existing checkout/item data first; keep all additive columns and history during rollback. The detailed release/rollback guide will describe the exact functions and any replaced definitions.
