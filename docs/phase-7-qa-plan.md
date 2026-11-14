# Phase 7 QA plan

Scope: final QA and cleanup of the existing implementation, as requested on 13 November 2026 (Asia/Kolkata). Preserve the vanilla JavaScript/Supabase/Cloudflare architecture, existing development data and single administrator. Production release, real-business onboarding and destructive data changes are outside this phase.

1. Establish the current regression baseline with syntax, actual SQL/RLS integration, public/admin builds and desktop/mobile browser tests.
2. Review service authorization, publication/media rules, asynchronous UI state, cart/checkout and import boundaries. Reproduce concrete findings and add focused regression coverage for fixes.
3. Exercise narrow mobile, tablet and desktop layouts, keyboard/dialog controls, no-JavaScript content, demo restrictions and the five specified administrator workflows in isolated fixtures. Inspect representative screenshots and accessibility behavior.
4. Review direct dependency usage and audit findings. Remove only dependencies proven unused; retain packages required by parser, build, test and deployment workflows.
5. Compile Pages Functions, inspect public artifacts/security configuration and rerun Lighthouse against the actual local Pages runtime. Report measured scores with preview noindex retained.
6. Check the existing hosted preview and Supabase permissions without creating hosted test businesses or requesting an admin password. If application fixes change deployable output, refresh only the already authorized development preview and verify its returned URL.
7. Update current documentation, record files changed, executed tests, remaining external verification and production configuration. Stop after Phase 7; do not launch production automatically.

Test servers use their existing isolated ports and fixtures, with separate artifact directories. Environment values remain in ignored files; credentials are never printed. Historical phase reports remain historical. Final results and the acceptance matrix will be recorded in `phase-7-report.md`.

Completed on 14 November 2026 (Asia/Kolkata). See [Phase 7 results](phase-7-report.md) for fixes, executed verification, file inventory and remaining production/operator configuration.
