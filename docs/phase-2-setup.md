# Phase 2 development setup

## Configured project status

On 12 November 2026, after the user approved development database setup and local checks passed, the configured `rawatbhata-one-dev` project received:

1. `20261112000400_discovery.sql`, through the Supabase migration ledger.
2. `supabase/seeds/discovery-demo.sql`, as an explicit SQL transaction.

The preflight dry run listed only migration 4. Phase 1 migrations were already recorded and were not replayed. The CLI labels a project's default branch `production`; these operations targeted the explicitly approved development project named above. They did not publish a website or target a separate production project.

The real public SDK returned 15 categories, three localities, 33 listings, three active demo promotions, four initial homepage sections with four cards each, one Kaju Katli product-search match and the expected locality-filter result. Previews and disabled demo checkout/directions were verified. A browser smoke test against the built frontend passed on desktop and mobile without page errors.

The existing `.env` and `.env.local` were preserved. For this configured project, start the site with:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173/`. No further database setup is needed for the current Phase 2 demo.

## Another development environment

Use a dedicated Supabase development project and its public URL/publishable key in `.env.local`. Do not copy privileged keys into frontend variables. The project-local CLI 3.x requires account authentication for hosted SQL; a publishable key alone cannot migrate a database.

```powershell
npx.cmd supabase login
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
```

Review the target and pending migrations. A fresh database needs migrations 1–4; an existing Phase 1 database needs only migration 4. If the ledger disagrees with the existing schema, investigate it instead of replaying migrations or resetting the database.

After reviewing the plan:

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
npx.cmd supabase db query --remote=YOUR_DEVELOPMENT_PROJECT_REF --file supabase/seeds/discovery-demo.sql
```

The discovery seed includes baseline city/brand inserts; the smaller Phase 1 demo seed is not a prerequisite. CLI prompts confirm the selected target. `--remote` explicitly selects hosted Supabase, and `--skip-vault` avoids unrelated Vault configuration updates. Never use a database reset to install this demo over data you want to keep.

## Migration and seed effects

Migration 4 adds nullable constrained display fields, one index, a security-invoker view and four bounded read-only RPCs. It grants public SELECT/EXECUTE only. Existing foreign keys, administrator authorization, RLS and Storage policies remain in force.

The only `DROP` statement replaces the Phase 1 `advertisements_check1` image-presence constraint with `advertisements_image_required`. Enabled real ads still require a private Storage image reference; demo ads may use their constrained local image. The replacement occurs inside the migration transaction. No table, row, foreign key, bucket or uploaded file is deleted.

The seed inserts missing demo records and refreshes existing demo names, imagery, facets, prices, offerings, homepage ranks and advertisement dates. It preserves non-demo businesses. Re-running it deliberately restores sample ranks/promotions; it is not a way to preserve edits to demonstration content. Businesses are fictional, contact-free and clearly labeled, with ordering disabled. Images are illustrative licensed assets stored in the repository; no Storage upload is required.

## Demo removal

Review `supabase/seeds/remove-demo.sql` before manually executing it against the intended development project. It contains scoped `DELETE` statements for demo advertisements, sections, listings, localities and categories; dependent demo catalogs and metadata follow existing foreign keys. This is a destructive cleanup operation and was **not** executed against the hosted development project.

Automated cleanup tests ran only in disposable PostgreSQL and preserved baseline city/brand and administrator records. Operational/private or non-demo references can deliberately block cleanup, requiring review and reassignment. Auth users, the admin allowlist and stored files are not deleted by the cleanup script.

## Remaining external configuration

Phase 2 needs no administrator session. Real Auth login, administrator provisioning and upload workflows remain Phase 4. Cloudflare hosting is not deployed; see [deployment preparation](deployment-guide.md) when deployment is requested. Keep development `noindex`/robots restrictions until the SEO phase. The CLI currently emits a deprecation warning for `auth.email.enable_signup`; hosted Auth behavior was not modified by this database push, and provider configuration needs review before Phase 4 login work.
