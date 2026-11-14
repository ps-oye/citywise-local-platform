# Admin dashboard — through Phase 7

Open `/admin/` while the local Vite server is running. Sign in with the email/password of the manually created Supabase Auth account. Only the active UID in `private.admin_users` is authorized. There is no signup, merchant login or customer login.

## First account and development setup

See [Phase 4 setup](phase-4-setup.md) for migration and environment steps. In Supabase Dashboard → Authentication → Users, create the administrator with your own email and a strong password, without sending an invitation. Keep the password private. Copy the existing user's UID into [the guarded provisioning script](../supabase/provision-admin.sql) and execute it from a trusted SQL editor. It refuses a missing Auth user or a different existing administrator. This operator script is neither a migration nor a seed.

Disable public signup and anonymous sign-ins in the hosted project's Auth settings; keep email/password authentication enabled. Local TOML does not configure a hosted project automatically. A confirmed email or Dashboard auto-confirmed manually created user is needed for password login.

Admin sessions use sessionStorage in the current tab. Refresh preserves the session; sign out or closing the tab ends its local persistence. Public browsing uses a separate sessionless SDK client. The dashboard verifies the session with Auth getUser() and the database is_admin() check. Every write is still protected by RLS. Revocation blocks the next server operation immediately; the displayed workspace is rechecked on returning to the tab and every minute.

## Merchants

1. Select the city in the header, then open Merchants → Add merchant.
2. Enter a name, stable URL slug, listing type, category checklist and primary category. Supply the locality, accurate description and optional address/destination.
3. Enter actual phone/WhatsApp numbers in international format. Mark contacts verified only after checking them with the business. Editing a number clears verification and checkout selection.
4. Complete the category-specific fields. Service providers can cover several localities. Hotels, fitness providers, services and attractions have relevant offering forms. Commerce/restaurants use Products & imports for their product catalogs after the merchant is saved.
5. Create the draft. Use Manage images for the banner, logo and gallery; Set business hours for schedules.
6. Publish and enable deliberately. A public page is generated automatically at its city/category/merchant URL. Existing merchant slug changes retain redirects.
7. Use Homepage ranking to select featured placement separately. Sponsored listings are labelled publicly.

Publication, enablement, sponsorship, featuring and operational closure remain independent. The editor shows whether the record is publicly discoverable. A disabled city, locality or category can hide an otherwise published listing.

Archive removes a merchant from discovery and retains its catalog, images and private enquiry history. Restore returns it to a disabled draft. There is no hard-delete merchant control. Existing merchant city and sample identity are fixed. Changing cities exits the current entity editor; a merchant from another city cannot be edited using the wrong locality choices.

Fictional samples remain labelled; their contact actions and checkout are disabled. Do not add real-looking unverified contacts or fabricated coordinates to samples. Homepage placements survive normal category edits; remove an active featured category placement before removing that category membership.

## Photographs

Save the parent record first. Media library manages merchant images; advertisement images live in their promotion editor. Choose the role, describe the photograph for assistive technology and upload JPEG, PNG or WebP.

Inputs are limited to 5 MiB, 16 megapixels and 8192 pixels on either edge. Native browser decoding and canvas encoding resize the longest edge to at most 1600 pixels, produce WebP and strip embedded ICC/EXIF/XMP metadata. The authenticated endpoint validates the resulting container, size, dimensions and allowed chunks; this structural validator is not a server image-codec decoder. Only the trusted administrator can submit it. SVG, HTML, animation chunks and metadata are rejected by the endpoint.

The server verifies the caller's JWT and allowlist membership and uploads to private Storage with that same user's RLS permissions. It never uses the checkout service key for uploads. File paths are random names under the entity UUID. Merchant banner/logo replacements retain the old image as a gallery item. Alt text, role, order and visibility can be edited. A listing holds up to 100 managed images.

Image mutations check the parent revision, so another tab's edits cannot be overwritten by a later form save. An upload advances the advertisement's revision while preserving its unsaved form values. Explicit removal unlinks metadata, protects product references, then deletes the object. Ads must be paused first. If Storage deletion fails, the UI reports that the object remains private and needs cleanup in Supabase Storage.

A lost network response can be ambiguous: reload the record before retrying. Files are compensated only after a known database rejection; an uncertain commit never triggers deletion of a potentially referenced image. Replaced ad objects and interrupted unreferenced uploads may remain private; inspect references before manually cleaning them up. Already issued signed URLs can remain usable for up to 60 seconds.

## Promotions and homepage ranking

Create an advertisement paused, upload its desktop banner and optional mobile variant, then enable it. Set a title, subtitle, CTA, safe same-site path or HTTPS destination, optional merchant association, priority, start and optional expiry. The editor uses the city's IANA timezone, not the browser's timezone. Lower priority numbers display first. Sponsored is an explicit label. Archive pauses the promotion while retaining its images; editing and saving can restore it.

Homepage ranking lets you choose a category, section title/order and visibility. Find merchants in that category, add placements, and use the accessible up/down buttons to reorder them. Featured checkboxes control membership. Ineligible or hidden placements retain their position but never appear publicly. Each public section shows at most four eligible featured records; no filler is invented.

## Weekly hours and urgent changes

Business hours starts with a bounded merchant search. Configure up to five split intervals per weekday and overnight shifts with Ends next day. No interval means closed that day; an entirely unknown schedule is labelled hours unavailable. Overlaps, including Saturday-to-Sunday overnight overlaps, are rejected atomically.

Special dates take priority over the weekly schedule. Add holidays or special intervals, then save. Up to 40 current/future dates are shown and editable at once; omitted older/later dates are preserved. Only clicking Remove date requests its deletion.

Manual status can temporarily close, manually open or return to automatic hours. Empty start applies immediately; an expiry returns to the schedule. An active override takes priority over special and weekly hours. You can choose whether closed businesses accept future WhatsApp enquiries. A closure keeps the public business page accessible.

Replacing a started override records the real revocation timestamp. Cancelling a future override removes only that unstarted override, with an audit record. The dashboard explicitly confirms status changes and warns before discarding unsaved schedule edits.

## Categories, localities and cities

Create, edit or disable categories and localities without editing source. Category parent relationships, order and names are editable; existing slugs stay fixed. Cities support state, country, timezone, enablement and an atomic default-city choice. Unused records can be explicitly deleted; foreign keys protect linked records and the default city cannot be deleted. Prefer disablement when retaining relationships.

## Stale edits and access replacement

Another tab or operator can change a record while you edit. Stale saves fail with a reload message; do not repeatedly submit an old form. Unsaved primary forms have navigation, city-change and sign-out guards.

A trusted SQL operator can revoke the single account:

```sql
update private.admin_users set active=false where singleton=true;
```

For deliberate replacement, update that row to the new existing Auth UID through a trusted SQL editor and revoke the old Auth sessions in Dashboard. Browser clients cannot enroll or replace themselves. The replacement admin can manage platform images with a previous or missing owner.

## Products and imports

Choose Products & imports, then select a commerce/restaurant merchant in the current city. Products supports search, paging, add/edit and explicit archive/restore. Product categories belong only to this merchant and can be created, reordered or disabled. Product photographs are selected from its existing media library. Save changes with an expected row revision; another tab's edit requires a reload.

Import files provides Excel/CSV templates, worksheet selection, insert/update and price-only modes, validation, paged before/after previews and explicit confirmation. Every invalid row blocks the import. Missing products are preserved, archived SKUs require explicit restoration, and a price-only file cannot alter product details or create new SKUs. A failed application rolls back every product change and retains an error report. Import history exposes prepared/applied/failed results and downloadable formula-safe CSV reports.

Read [the catalog guide](catalog-guide.md) before the first upload, particularly the difference between omitted columns and blank cells, SKU text formatting, original-price constraints and file limits. [Phase 5 setup](phase-5-setup.md) describes the additive migration; the configured development project already has it.

## Enquiries and analytics

Choose Enquiries & analytics for the selected city. Set an inclusive date range of up to 90 days, or choose the 7/30/90-day presets. Dates/trends use the city's timezone. Demo activity is excluded by default; enable its checkbox deliberately to inspect fictional sample usage.

Cards show reported views/contact clicks, qualified visible promotion impressions/clicks, CTR, and separate trusted enquiry initiation/link-preparation counts. Daily figures include zero-activity days. Top listing/promotion tables and recent enquiry references/states are bounded. No customer contacts or enquiry notes appear. Browser counts are approximate, not unique visitors or billing figures; a WhatsApp link does not establish that a message was sent or an order accepted. CTR is unavailable without impressions and may exceed 100% with repeated clicks.

The overview adds the last 30 days of non-demo views and WhatsApp link clicks. Zero is a real empty state, not a populated demo chart. Report controls lock during loading, and city switching clears the prior workspace before another action can use it. The server rechecks authorization on every report request.

Open the [development preview](https://de486908.rawatbhata-one.pages.dev/admin/) with the existing administrator email/password. Enter the password only in your own browser. The preview, SEO and analytics workflow are described in [Phase 6 guide](phase-6-guide.md). [Phase 7 results](phase-7-report.md) records final QA and fixes. Production launch remains a separate action.

Confirmations apply to the workspace where they were opened. If you navigate away with browser history before accepting, the old dialog cannot submit that page's change. Return to the intended merchant before starting another action. The database still verifies administrator authorization on every write.
