`discovery.js` contains DOM-independent search normalization, URL filter state, deterministic top-four featured selection, advertisement eligibility, controlled demo asset paths and honest availability labels. Database search, filtering and ranking remain authoritative in the discovery RPCs.

`cart.js` validates quantities, normalizes stored carts, computes estimated totals and reconciles authoritative quotes. `merchant.js` handles URL filters, display-only time/status wording and safe contact/directions destinations. `whatsapp.js` formats validated enquiry snapshots and the verified database contact into an encoded link. Actual price/stock validation and operating-hours calculations run in PostgreSQL and are shared by merchant reads and checkout.

Imports belong to Phase 5. Keep shared business rules independent of DOM and database access.
