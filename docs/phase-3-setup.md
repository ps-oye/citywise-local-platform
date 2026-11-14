# Phase 3 setup and SQL effects

## Current development workspace

On 12 November 2026, the approved `rawatbhata-one-dev` project received only pending migration `20261112000500_merchants.sql` and the opt-in `supabase/seeds/merchant-demo.sql`. Migrations 1–4 were not replayed. The existing public environment files were preserved.

The current workspace also has an ignored `.dev.vars` with the same development project's trusted server key and a dedicated HMAC secret. Credential values were not printed or placed in public configuration. The public build was checked for these actual values and contained none.

Start locally:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173/`, then choose a merchant, or visit `/rawatbhata/food/demo-food` directly. The Vite adapter provides public merchant HTML and the trusted `/api/checkout` handler. `npm.cmd run preview` provides the same behavior for the built frontend on port 4173.

The database contains 33 fictional listings and 110 products across 15 categories. Products, dietary/group/availability filters, carts and confirmation work with this dataset. Actual WhatsApp checkout remains disabled for every demo merchant. This is intentional, not missing credentials.

## Another development database

Configure the intended project's public URL/publishable key in `.env.local`. Authenticate the project-local Supabase CLI using the account's normal login; public browser credentials cannot authorize migrations.

```powershell
npx.cmd supabase login
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault --dry-run
```

Review the target and migration list. An existing Phase 2 project needs only migration 5; a new project needs migrations 1–5. A ledger/schema discrepancy requires investigation, not a reset or replay of already-applied SQL.

```powershell
npx.cmd supabase db push --remote=YOUR_DEVELOPMENT_PROJECT_REF --skip-vault
# For a new development dataset, install discovery first:
npx.cmd supabase db query --remote=YOUR_DEVELOPMENT_PROJECT_REF --file supabase/seeds/discovery-demo.sql
npx.cmd supabase db query --remote=YOUR_DEVELOPMENT_PROJECT_REF --file supabase/seeds/merchant-demo.sql
```

`--remote` selects the hosted project explicitly; `--skip-vault` avoids unrelated Vault updates. Supabase CLI labels the default branch `production` even in the separately named development project. The operations completed here targeted `rawatbhata-one-dev`, not a separate production service or frontend deployment.

The discovery seed can refresh its original prices, ranks and advertisements; apply the merchant seed afterwards to restore the richer catalogs. Both seeds preserve non-demo businesses. No fake phone, precise address, map coordinate, customer or Auth account is installed by these demo seeds. The verified-contact QA town/phone/map fixtures under `tests/fixtures/` are strictly isolated test data and must never be installed in a hosted project.

## Trusted server bindings

For another workspace, copy `.dev.vars.example` to `.dev.vars` and set:

| Binding | Purpose |
| --- | --- |
| `SUPABASE_URL` | Same project origin as the public configuration; local runtime can otherwise use `VITE_SUPABASE_URL` |
| `SUPABASE_SECRET_KEY` | Privileged Supabase secret key for trusted operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy alternative to `SUPABASE_SECRET_KEY`; configure one privileged key |
| `CHECKOUT_HMAC_SECRET` | Dedicated random secret of at least 32 characters for daily client fingerprints; the server can fall back to its privileged key |

Never use a `VITE_` prefix for privileged values. `.dev.vars` and variants are ignored by Git; only the blank example is tracked. Restart Vite after changing server bindings. Without trusted bindings, discovery/catalog/cart remain usable but actual checkout returns a safe unavailable response.

For a later Cloudflare deployment, configure these as Pages server bindings and deploy the repository's `functions/` directory with `dist/`. The public renderer also needs the public project URL/key and optional site/brand configuration. Local `.dev.vars` does not configure Cloudflare secrets. No hosting secrets, account, domain or production deployment were provisioned here. See [Pages secret bindings](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

The Pages handler accepts only its real ingress address, ignoring caller-supplied forwarding chains; the local adapter uses the socket address. Do not place the local adapter behind an untrusted proxy and treat a forwarded header as authenticated identity.

## Checkout behavior

1. Add products to a per-merchant cart. Browser prices are estimates.
2. Review a fresh database quote. Changes update the review; unavailable lines must be removed.
3. Choose a supported pickup/delivery/enquiry preference and optional short note.
4. Confirm. The same-origin server consumes a persistent request allowance, then independently checks merchant/contact/closure/product eligibility and current prices.
5. A changed quote returns to review and requires another explicit confirmation. Retries of the same request reuse its initiation record.
6. The server prepares a link from the verified database number, marks handoff creation and returns the enquiry reference/link. A fallback remains available if the browser blocks the popup.

Fixed-window defaults: 12 attempts per client/minute, 60 per client/hour, 40 per merchant/minute and 120 globally/minute. Client hashes rotate daily; no raw IP is stored in the application limiter. Persistent counters commit separately from business validation. Limited clients do not consume shared quotas, and an exhausted global window prevents creation of further client scopes.

Successful checkout requires a real, public, enabled commerce/restaurant listing, verified WhatsApp contact, enabled checkout action, permitted fulfilment, eligible operating status and active available products. No verified real merchant was invented for this phase. The complete successful journey was tested only in disposable PostgreSQL with reserved test contacts and no outgoing WhatsApp navigation.

Records mean **initiation** and **link preparation**. They never prove that WhatsApp opened, a customer pressed Send, a business accepted an order or a payment occurred. Carts remain saved after handoff until the user clears them.

## Migration and destructive-statement review

Migration 5 adds nullable/constrained fields, snapshots, triggers, public read functions, service-only checkout functions and one private infrastructure table. It replaces the discovery view definition while retaining its invoker security and existing grants. Existing business data, foreign keys, administrator allowlist and Storage policies are preserved. There is no `DROP`, `TRUNCATE` or business-data deletion in this migration.

`checkout_consume_limit` contains a scoped `DELETE` for its own ephemeral limiter counters whose `updated_at` is older than two days. This runs only when the trusted limiter is invoked; it never deletes merchant, product, enquiry, admin or Storage records. The migration merely creates this function.

The merchant seed inserts/upserts demo catalog groups, products and illustrative hours; it changes existing demo image/schedule metadata and prices for its own catalog SKUs. It deletes no records and leaves real merchants untouched.

`supabase/seeds/remove-demo.sql` remains a separate destructive manual cleanup. It was tested against the expanded 110-product dataset only in disposable PostgreSQL and was not run on the hosted project. Real/private references can block it by design. Review and reassign such references before any intentional production cleanup.

## Remaining configuration

The current development workspace needs no additional Phase 3 credentials. Real merchant onboarding and administrator Auth/CRUD are Phase 4. Hosted Auth provider settings, including the CLI's `auth.email.enable_signup` deprecation warning, still need review before login work. Real uploaded Storage HTTP behavior, Cloudflare delivery, general analytics, production SEO and deployment remain in their specified later phases.
