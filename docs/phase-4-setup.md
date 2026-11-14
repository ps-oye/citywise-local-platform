# Phase 4 setup and migration effects

As of 13 November 2026 (Asia/Kolkata), the approved `rawatbhata-one-dev` project is configured through migration `20261112000600`. Only pending migration 6 was applied; no seed was replayed. The user-selected existing Auth account is active in the singleton allowlist and has a confirmed email. Public signup and anonymous sign-in are disabled while email/password authentication remains enabled. The existing 33 fictional listings and 110 products were preserved. A final dry run reports the remote database up to date. No production site was deployed.

Read-only live checks confirmed the allowlisted UID can read admin overview/context under the authenticated database role, anonymous HTTP admin calls fail with SQLSTATE 42501, public discovery remains accessible, the 19 new admin RPCs are invoker functions with no anonymous execution grant, and both platform buckets remain private. Password sign-in and upload workflows were executed against isolated Auth/Storage fixtures with the real SQL/RLS; the user's private password was not requested or handled.

## Start the dashboard

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173/admin/`. The Vite adapter serves both `/api/admin/media` and the earlier checkout/merchant HTML handlers. `npm.cmd run preview` provides the same adapters for the built frontend on port 4173.

The public environment values from earlier phases remain valid. No new dependency or privileged browser variable was introduced. The admin media endpoint needs the same project URL and public publishable key as the browser; locally these are read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Server environments may instead supply `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Keep the existing checkout service key and HMAC in ignored `.dev.vars`; image uploads do not use them.

For a later Cloudflare Pages deployment, provide those public URL/key runtime bindings alongside the earlier checkout bindings and include the repository's `functions/` directory. Public build configuration alone does not deploy the function. No site is deployed by Phase 4.

## Advance another development database

Review `supabase/migrations/20261112000600_admin.sql` first. An existing Phase 3 project needs only migration 6; a fresh project needs migrations 1–6 in order. Do not replay old migrations or reseed existing business content.

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
```

The explicit development target and normal CLI authentication are required. CLI 3 labels a project's default branch production even when it is a separately named development project. Do not target a real production project without separate authorization.

The migration adds two admin-query indexes, three restricted helper functions and 19 guarded security-invoker admin RPCs. A forward replacement of merchant_detail preserves its existing public contract and adds a bounded public logo reference under RLS. Existing table and Storage policies stay enabled, private buckets stay private, and public read/write permissions are not broadened. No new tables, Auth users, administrator rows or demo records are installed by this migration. It does not rewrite any applied migration.

## SQL deletion behavior

Applying migration 6 does not delete business data. Its function definitions contain deliberately scoped DELETE statements that run only when an authorized administrator invokes the corresponding operation:

- A merchant save removes deselected category/service-area/attribute memberships. It blocks removal of an actively featured category first. It does not delete merchant, product or private enquiry records.
- Saving hours replaces only the chosen merchant's weekly intervals. Special-date changes replace the intervals for explicitly edited dates and delete only explicitly removed exceptions, preserving omitted dates.
- A manual status change cancels only the chosen merchant's unstarted override. Its audit entry retains the action time. Started overrides are revoked with a real timestamp.
- Explicit taxonomy deletion removes the selected record subject to FK/default-city protection.
- Explicit image removal deletes the selected media reference after protecting product references; the authenticated HTTP endpoint then requests its Storage object deletion. Ads must be paused first.
- Merchant and promotion removal controls archive; they do not hard-delete those records. Ranking changes disable omitted placements and retain their history.

These are application operations, not destructive migration statements executed during installation. Every business mutation remains subject to allowlist checks, RLS, validation and database transactions; entity edits include revision checks.

## Account setup

In hosted Auth settings disable public signup and anonymous sign-in; keep email/password login enabled. The root TOML uses `[auth] enable_signup=false` and `[auth.email] enabled=true` for CLI 3. Push only reviewed, intentionally declared config changes; do not blindly replace unrelated hosted Auth settings.

Create the single user privately in Supabase Dashboard and use the guarded `supabase/provision-admin.sql` operator script with its UID. This checks that the Auth user exists and refuses to replace another administrator. Use a confirmed or Dashboard auto-confirmed account. Never send passwords to chat or put them in migrations, seeds, command history or public environment variables.

See [the admin guide](admin-guide.md) for workflows, revocation and deliberate replacement. Automated Auth/Storage HTTP fixtures exercise real SQL policies in an isolated database, not a live Auth provider. The actual account password should be entered only in your own browser.
