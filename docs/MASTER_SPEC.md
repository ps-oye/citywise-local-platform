# CODEX MASTER PROMPT
# Project: Rawatbhata Local Discovery Platform
# Build a Complete, Production-Ready, Lightweight Hyperlocal Website

## 1. ROLE AND OBJECTIVE

Act as a team consisting of:

- Principal Software Architect
- Senior Full-Stack Developer
- Senior UI/UX Designer
- PostgreSQL Database Architect
- Application Security Engineer
- QA Automation Engineer
- SEO and Performance Engineer

Your task is to DESIGN, IMPLEMENT, TEST and DOCUMENT a complete, functional, mobile-first local discovery platform initially targeting **Rawatbhata, Rajasthan, India**.

This is not just a business-directory website.

It should become a complete digital ecosystem where residents and visitors can:

- Discover local shops, businesses and services.
- Browse products and menus.
- Send orders directly through WhatsApp.
- Find nearby hotels and accommodation.
- Explore attractions and tourist destinations.
- Find gyms, coaching centres, salons and other facilities.
- Discover plumbers, electricians, maids, technicians and home-service providers.
- Filter businesses by category and locality.
- View accurate business timings and temporary closures.
- Get Google Maps directions.
- Find useful local information.

The website must support multiple cities in the future, although Rawatbhata will be the initial city.

**The application must be fully data-driven. Adding a new merchant, category, service provider or attraction through the admin dashboard should automatically create its public listing and detail page without writing additional code.**

The final result must be an attractive, modern, responsive, performant website, not a static demonstration.

---

## 2. MANDATORY TECHNOLOGY STACK

Use the following technologies.

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript (ES6+ modules)
- Native browser APIs
- Responsive layouts using CSS Grid and Flexbox
- Minimal external JavaScript dependencies
- CSS variables for design tokens and themes

Do NOT use:

- React
- Angular
- Vue
- Next.js
- jQuery
- Bootstrap
- Tailwind CSS
- Heavy UI component frameworks

A lightweight development/build tool is acceptable if necessary, but the frontend must remain HTML, CSS and Vanilla JavaScript.

### Backend and database

- Supabase PostgreSQL
- Supabase JavaScript SDK
- Supabase Authentication
- Supabase Storage
- PostgreSQL Row Level Security
- Supabase Edge Functions or Cloudflare Pages Functions where server-side security is required

### Hosting

- Cloudflare Pages for frontend hosting
- Supabase for data and media storage
- GitHub repository for source control

### Integrations

- WhatsApp Click-to-Chat for ordering and enquiries
- Google Maps URLs for directions, without a paid Maps API requirement
- Client-side Excel/CSV parsing with a lightweight, maintained library
- Browser localStorage for shopping-cart persistence

### Design principles

1. Fast initial page load.
2. Minimal JavaScript execution.
3. Lazy loading for images.
4. No unnecessary client-side dependencies.
5. Accessible HTML.
6. Reusable components.
7. Modular architecture.
8. Strong security.
9. Easily extensible database.
10. SEO-friendly public pages.

Prioritize free-tier-compatible solutions. Do not assume that production infrastructure is permanently free.

---

# PART A — PUBLIC WEBSITE

## 3. OVERALL VISUAL DESIGN

Create a premium-looking website inspired by the visual experience and content organization of BookMyShow.

Use BookMyShow only as an inspiration for:

- Attractive card-based layouts
- Horizontal category sections
- Promotional hero banners
- Clear content hierarchy
- Image-rich discovery experiences
- Smooth navigation
- Professional typography
- Modern mobile layouts

Do not copy BookMyShow branding, logos, proprietary artwork or its exact interface.

Create an original visual identity suitable for a town-wide local discovery platform.

### Design direction

- Modern, minimal and premium
- Visually appealing without being heavy
- Mobile-first
- Rounded cards and subtle shadows
- Attractive business photographs
- Good whitespace
- Consistent icons
- Professional navigation
- Tasteful transitions
- Responsive promotional banners

Use a configurable brand name. For the demo, use "Rawatbhata One" as the working title.

All colors, typography, spacing and border radii should be configurable using CSS design tokens.

Avoid excessive animations, autoplay video backgrounds, heavy carousels and unnecessary visual effects.

---

## 4. GLOBAL WEBSITE HEADER

Create a responsive sticky header.

### Desktop header

Include:

- Platform logo/name
- Global search bar
- Current city/locality selector
- Home navigation
- Explore/categories navigation
- Optional quick-access links
- Mobile-friendly menu behavior

### Mobile header

Include:

- Logo
- Compact search
- Location selector
- Hamburger menu

The header should be clean and remain usable on smaller screens.

The website must not require customers to register or log in.

---

## 5. HOMEPAGE — MAIN DISCOVERY DASHBOARD

This is the most important public-facing page.

Create a visually rich BookMyShow-inspired homepage using configurable, database-driven sections.

### Section 1 — Promotional advertisement slideshow

Immediately below the header, display a large promotional slideshow.

Features:

- Auto-rotating banner advertisements.
- Previous/next controls.
- Navigation dots.
- Pause on hover where appropriate.
- Pause/respect reduced-motion settings.
- Responsive desktop/mobile image support.
- Optional destination URLs.
- Merchant detail page linking.
- External advertisement linking.
- Start and expiry dates.
- Banner priority and display order.
- Enable/disable controls.
- Clearly visible "Sponsored" label for paid content.

Advertisements will eventually be paid placements.

The admin dashboard must control these advertisements.

Track impressions and clicks in a privacy-conscious manner.

Do not count impressions merely because advertisements exist in the database. Count qualified visible impressions.

For the demo, create three attractive sample promotional banners, clearly identified as demonstration content.

### Section 2 — Welcome and global discovery

Display an engaging introduction, such as:

"Discover Everything Around You"

Supporting text:

"Explore local shops, food, stays, services and attractions in Rawatbhata."

Include a prominent search interface.

### Section 3 — Category shortcuts

Display attractive thumbnail-based category shortcuts.

For demo purposes, implement all of the following categories:

1. Food & Restaurants
2. Sweets & Bakeries
3. Grocery & Daily Essentials
4. Hotels & Stays
5. Attractions & Tourism
6. Home Services
7. Gyms & Fitness
8. Beauty & Wellness
9. Education & Coaching
10. Shopping & Retail
11. Healthcare & Pharmacies
12. Transportation & Travel
13. Events & Entertainment
14. Professional Services
15. Local Essentials & Public Information

Use thumbnail images or tasteful icons.

Each category should have its own detail/listing page.

### Section 4 — Category-wise merchant sections

Below the category shortcuts, display category-specific content rows.

Example:

**Food & Restaurants**  
[Merchant 1] [Merchant 2] [Merchant 3] [Merchant 4]  
See All

**Hotels & Stays**  
[Hotel 1] [Hotel 2] [Hotel 3] [Hotel 4]  
See All

**Home Services**  
[Provider 1] [Provider 2] [Provider 3] [Provider 4]  
See All

Continue for all enabled categories.

Rules:

- Display a maximum of four featured merchants/listings per category on the homepage.
- Admin controls which listings appear.
- Admin controls the display ranking.
- Disabled or unpublished listings must never appear.
- If fewer than four eligible listings exist, show only the available listings.
- Never invent filler listings to reach four.
- Include a "See All" link at the top-right of every section.
- Make sections horizontally scrollable where appropriate on mobile.
- Support optional section ordering from admin.

### Merchant card design

Each merchant card should contain applicable information:

- Featured image
- Business name
- Category
- Locality
- Short description
- Open/closed status
- Indicative price or price range, where relevant
- Sponsored label if applicable

Cards should have image aspect ratios that remain consistent and should use graceful placeholders.

Clicking any listing must open its own dedicated detail page.

---

# PART B — SEARCH AND DISCOVERY

## 6. GLOBAL SEARCH

Implement a functional global search across all published content.

Searchable entities include:

- Merchant/business name
- Product name
- Category
- Subcategory
- Service offered
- Locality
- Attraction name
- Relevant descriptive keywords

Example searches:

- Kaju Katli
- Sweet shops
- Hotel
- Electrician
- Plumber
- Gym
- Baroli Temples
- Grocery
- Cake
- Anu Deep Colony

Search requirements:

- Case-insensitive matching
- Debounced suggestions
- Keyboard navigation
- Enter to submit
- Search results page
- Category filters
- Locality filters
- Empty-state handling
- Proper loading and error states

Use PostgreSQL search capabilities initially.

Avoid introducing Elasticsearch or other search infrastructure.

Where useful, provide matching products alongside their associated merchant.

---

## 7. CATEGORY LISTING PAGES

Create a reusable category page template.

Example routes:

/rawatbhata/food

/rawatbhata/hotels

/rawatbhata/home-services

/rawatbhata/attractions

Each page should display:

- Category banner/title
- Short category description
- Relevant subcategories
- Search within category
- Locality filter
- Appropriate category-specific filters
- Sort controls
- Grid/list of merchants
- Open/closed indicator
- Pagination or incremental loading
- Empty states

### Examples of category-specific filters

Food:

- Vegetarian
- Non-vegetarian
- Contains egg, if appropriate
- Price range
- Open now
- Product type

Hotels:

- Indicative price range
- Facilities
- Property type
- Locality

Gyms:

- Membership price range
- Facilities
- Training options
- Locality

Home Services:

- Service type
- Locality served
- Working hours
- Contact availability

Attractions:

- Attraction type
- Distance
- Entry fee, if applicable
- Visiting hours, if known

Only display filters relevant to the selected category.

---

# PART C — DYNAMIC MERCHANT DETAIL PAGES

## 8. GENERIC DETAIL PAGE ENGINE

Every merchant or listing must have its own shareable URL.

Example:

/rawatbhata/food/demo-restaurant

/rawatbhata/sweets/demo-sweet-shop

/rawatbhata/hotels/demo-guest-house

/rawatbhata/home-services/demo-electrician

/rawatbhata/attractions/demo-attraction

Do NOT create a separate hardcoded HTML file for every merchant.

Use a common dynamic page renderer with data from Supabase.

The URL must resolve automatically once a new listing is published.

Use SEO-friendly slugs, stable listing IDs internally and a strategy for handling slug changes.

### Generic detail page layout

#### A. Hero banner

Display a large merchant/business image at the top.

Support:

- One primary banner
- Optional image gallery
- Mobile-friendly responsive images
- Fallback image
- Image lazy loading

#### B. Business introduction

Show:

- Business name
- Category and subcategory
- Locality
- Short description
- Open/closed status
- Opening hours
- Relevant badges
- Additional category-specific information

#### C. Main content

Render different content according to listing type.

Commerce listings show a product catalog.

Hotels show rooms, amenities and enquiry options.

Gyms show facilities, membership packages and trial information.

Service providers show services, coverage areas and indicative charges.

Attractions show descriptions, visiting information, photographs and directions.

The same reusable page system must support all these types.

#### D. Contact and information section

At the bottom of every page, display available relevant details:

- Full address
- Locality
- Opening hours
- Phone number
- WhatsApp button
- Google Maps directions
- Available services
- Additional information
- Last updated/verified date, if available

Do not display empty fields.

For mobile, use a sticky bottom action bar where appropriate.

---

## 9. PRODUCT CATALOG AND SHOPPING CART

For commerce-type merchants, build a complete product browsing and cart experience.

Each product may contain:

- Product ID
- Merchant ID
- SKU
- Product name
- Description
- Image
- Category
- Price
- Original price, optional
- Unit
- Quantity options
- Vegetarian/non-vegetarian/egg classification, where applicable
- Availability
- Display order
- Active/inactive flag

### Product browsing features

- Product image
- Name and description
- Current price
- Add to cart
- Increase/decrease quantity
- Out-of-stock indicator
- Category filters
- Vegetarian/non-vegetarian filters
- Sort by price ascending
- Sort by price descending
- Sort by name
- Search within merchant products

### Cart functionality

- Cart maintained in browser localStorage.
- Quantity adjustments.
- Remove items.
- Estimated subtotal.
- Clear cart.
- Persistent cart after refresh.
- Mobile cart summary.
- Empty-cart state.

Important:

Each merchant must have a separate cart.

Do not mix products from different merchants into one WhatsApp checkout.

Stored product prices should be revalidated against current database values before checkout.

Show the user any price or availability changes.

---

## 10. WHATSAPP CHECKOUT WITH CONFIRMATION POPUP

Do not implement a payment gateway.

Do not integrate a native WhatsApp Business cart for the MVP.

Use WhatsApp Click-to-Chat with a prefilled order message.

### Checkout flow

Step 1: Customer adds products to cart.

Step 2: Customer clicks "Order on WhatsApp".

Step 3: Display a confirmation modal.

The confirmation modal must show:

- Merchant name
- Selected products
- Quantities
- Individual prices
- Estimated total
- Delivery/pickup preference, if supported
- Optional customer instructions
- Notice that final prices and availability are confirmed by the merchant

Step 4: Customer reviews the order.

Step 5: Customer clicks "Confirm & Open WhatsApp".

Step 6: Create a checkout initiation record through a protected backend endpoint.

Step 7: Generate a readable order enquiry reference.

Step 8: Open WhatsApp with the prefilled order.

Example WhatsApp text:

Hello Demo Sweet Shop,

I would like to enquire about the following order:

Order Ref: RB-XXXXXX

1. Kaju Katli (500 g) x 1 — Rs. 450
2. Gulab Jamun (1 box) x 2 — Rs. 360

Estimated Total: Rs. 810

Please confirm availability, final amount and delivery/pickup options.

Sent via Rawatbhata One.

Use the merchant's configured WhatsApp number.

### Critical tracking requirement

An ordinary WhatsApp deep link cannot detect whether the customer actually presses Send inside WhatsApp.

Therefore:

- Track checkout initiation.
- Track successful creation of the handoff record.
- Do not mark the order as sent, received, accepted or completed without independent confirmation.
- Admin analytics should label these events accurately as "WhatsApp Checkout Initiated" or "WhatsApp Enquiry Clicks".
- The user interface must not falsely claim that an order was successfully placed.

Avoid storing customer names, phone numbers or addresses unless explicitly necessary and consented to.

Implement idempotency and rate limiting for public checkout events.

Do not trust cart prices or totals submitted by the browser. Recalculate using authoritative product data server-side.

Handle WhatsApp popup blockers and failed network requests gracefully.

---

# PART D — BUSINESS OPERATING HOURS

## 11. AUTOMATIC BUSINESS STATUS

Implement automatic open/closed status using configurable business schedules.

Support:

- Different hours per weekday
- Multiple opening intervals in a day
- Lunch/afternoon breaks
- Evening-only shops
- Weekly closed days
- Overnight operating hours
- Holiday exceptions
- Special festival hours
- Emergency/manual closure
- Scheduled reopening

All schedule calculations must use the merchant's configured IANA timezone, defaulting to `Asia/Kolkata`.

### Status priority

1. Active manual override
2. Special-date schedule
3. Regular weekly schedule

Provide calculated states such as:

- Open Now
- Closed — Opens at 5:00 PM
- Closed Today
- Temporarily Closed
- Hours Not Available

### UI behavior

When a merchant is open:

- Normal card appearance
- Positive open indicator
- Normal ordering actions

When closed:

- Slightly greyed-out/dimmed card
- Clearly visible closed status
- Next opening time where known
- Store detail page remains accessible
- Contact and directions remain available
- Checkout disabled or converted to future enquiry depending on merchant configuration

Do not hide closed merchants automatically.

### Admin management

Admin must be able to:

- Configure weekly hours
- Add split opening intervals
- Set closed days
- Add holidays
- Temporarily close a merchant
- Configure closure expiry
- Reopen a merchant manually
- Select whether WhatsApp enquiries remain available while closed

No merchant login is required.

Store hours must be managed entirely through the admin dashboard during the first version.

---

# PART E — ONE ADMIN DASHBOARD

## 12. ADMIN AUTHENTICATION

Create a secure admin portal.

Example:

/admin

Initially there will be **only one administrator**.

There must be:

- No public signup.
- No merchant login.
- No customer login.
- No public admin registration.

Use Supabase Auth.

Create the administrator manually through Supabase.

Authorization must use a private admin allowlist or equivalent database-backed role verification tied to the authenticated user's UID.

Do not rely on a frontend-only email comparison.

All admin writes must be protected using PostgreSQL RLS or server-side authorization.

Never expose Supabase service-role keys in frontend code.

---

## 13. ADMIN DASHBOARD HOME

Create a professional admin homepage.

Display overview cards:

- Total merchants
- Active merchants
- Disabled merchants
- Published listings
- Draft listings
- Total categories
- Active advertisements
- Product count
- Checkout initiations
- Listing views
- WhatsApp click events

Include charts or trends where useful.

Keep charting lightweight, using simple SVG/CSS or a small dependency only if necessary.

Provide navigation to:

1. Dashboard
2. Merchants/Listings
3. Categories
4. Products & Catalogs
5. Advertisements
6. Homepage Ranking
7. Business Hours
8. Localities
9. Enquiries & Analytics
10. Media Library
11. Settings

---

## 14. ADMIN MERCHANT MANAGEMENT

Create complete merchant CRUD functionality.

Admin should be able to:

- Add merchant
- Edit merchant
- Delete/archive merchant
- Publish/unpublish merchant
- Enable/disable listing
- Upload banner image
- Upload logo
- Upload gallery images
- Add description
- Add address
- Select city and locality
- Add latitude/longitude
- Add Google Maps link or map coordinates
- Add phone number
- Add WhatsApp number
- Assign categories/subcategories
- Configure listing type
- Manage category-specific details
- Configure opening hours
- Assign homepage rank
- Enable/disable homepage visibility
- Configure checkout and enquiry actions

### Important visibility distinctions

Implement these separately:

**Published:** Listing is publicly available.

**Enabled:** Business listing is operationally active on the platform.

**Homepage Featured:** Listing can appear in the homepage category row.

**Homepage Rank:** Determines listing order within the category.

**Sponsored:** Listing has a paid promotion flag, clearly labeled.

**Temporarily Closed:** Business is closed operationally but remains publicly discoverable.

These states must not be conflated.

### Ranking rules

- Only published and enabled listings can appear publicly.
- Only featured listings are eligible for homepage category rails.
- Sort eligible listings using admin-defined ranking.
- Show a maximum of four per category.
- Provide deterministic tie-breaking.
- Sponsored placements must be visibly labeled.
- Admin should be able to reorder listings easily.

If practical, implement drag-and-drop ranking with an accessible alternative using up/down buttons.

---

## 15. GENERIC LISTING TYPES

Admin must be able to create a listing under different business types.

Recommended types:

- COMMERCE
- RESTAURANT
- HOTEL
- SERVICE_PROVIDER
- FITNESS
- ATTRACTION
- INFORMATIONAL
- GENERAL_BUSINESS

Do not build one completely separate CRUD application for each type.

Use:

- Common listing fields
- Type-specific forms
- Type-specific catalog/offerings
- Configurable actions
- Category-specific filters

Examples:

A sweet shop should have products.

A hotel should have rooms/packages.

A gym should have memberships.

A plumber should have services and coverage areas.

An attraction should have information, images and directions.

The admin system must make these distinctions automatically.

---

# PART F — EXCEL AND CSV UPLOAD

## 16. BULK PRODUCT MANAGEMENT

Implement Excel/CSV upload within the admin dashboard.

Supported formats:

- `.xlsx`
- `.csv`

Provide a downloadable sample template.

### Example product columns

- SKU
- Product Name
- Description
- Category
- Price
- Original Price
- Unit
- Dietary Type
- Available
- Active
- Display Order
- Image Reference

Merchant ID must come from the selected merchant context, not from arbitrary client-controlled spreadsheet data.

### Upload workflow

1. Admin selects merchant.
2. Admin downloads template if required.
3. Admin uploads Excel/CSV.
4. JavaScript parses the file.
5. Validate all rows.
6. Display preview table.
7. Compare imported SKUs with existing products.
8. Identify new, updated, unchanged and invalid rows.
9. Show validation errors with row numbers.
10. Admin confirms import.
11. Execute secure database upsert.
12. Show final import summary.

### Validation requirements

- SKU required and unique per merchant.
- Product name required.
- Valid non-negative price.
- Valid quantity/unit.
- Valid dietary classification.
- Valid active/availability values.
- Reject duplicate SKUs in the upload.
- Reject unsupported file types.
- Enforce file size and row limits.
- Do not execute spreadsheet formulas.
- Avoid CSV formula injection when exporting.
- Handle empty spreadsheets gracefully.

Use a unique database constraint on `(merchant_id, sku)`.

### Import modes

Implement:

**Insert/Update:** Add new products and update matching products. Missing products are untouched.

**Price-Only Update:** Update prices using SKU and price columns.

**Explicit Full Replacement:** Optional, with a strong confirmation and backup/versioning strategy.

Do not silently delete products missing from a spreadsheet.

Use transactional backend processing for confirmed imports so partial failures do not corrupt the catalog.

Images should be uploaded to Supabase Storage separately and associated with product records.

Provide manual add/edit/delete product controls as well.

---

# PART G — ADVERTISEMENT MANAGEMENT

## 17. SPONSORED HOMEPAGE BANNERS

Create a complete advertisement management module.

Admin features:

- Create advertisement
- Edit advertisement
- Upload image
- Desktop/mobile image variants
- Configure title
- Configure subtitle
- Configure CTA text
- Configure internal or external URL
- Set start date
- Set end date
- Set display priority
- Enable/disable advertisement
- Preview advertisement
- Delete/archive advertisement
- View impressions
- View clicks

Store the advertisements in PostgreSQL.

Only show advertisements that are enabled and within their configured date range.

Use an accessible slideshow.

Clearly mark paid placements as Sponsored.

Track clicks without collecting unnecessary personal information.

Do not automatically redirect users or display intrusive full-screen advertisements.

Keep advertisements separate from organic merchant rankings.

Support future pricing/billing metadata without implementing a payment gateway.

---

# PART H — LOCALITY AND LOCATION

## 18. CITY AND LOCALITY MANAGEMENT

The platform should support multiple cities in the database even though the first release targets Rawatbhata.

Required data:

- City ID
- City name
- State
- Country
- Timezone
- Locality ID
- Locality name
- Optional latitude/longitude
- Optional service-area boundaries

Admin must be able to:

- Add a city
- Add localities
- Assign listings to localities
- Assign service providers to multiple service areas
- Enable/disable localities
- Configure default city

### Nearby discovery

For MVP:

Use locality-based filtering.

For future expansion:

Allow geographic radius queries.

Do not request a visitor's precise location without user action or permission.

---

## 19. GOOGLE MAPS DIRECTIONS

Do not integrate paid Google Maps APIs for the MVP.

Use standard Google Maps Directions URLs.

Each applicable listing should have a "Get Directions" button.

Use stored coordinates or a verified destination reference.

Opening directions should launch Google Maps in a new tab or supported application.

Do not expose fake precise map coordinates in production demo content.

Admin should be able to edit location information.

Support optional map links for attractions.

---

# PART I — DATABASE ARCHITECTURE

## 20. SUPABASE POSTGRESQL SCHEMA

Design a normalized, extensible PostgreSQL schema.

At minimum, consider the following entities:

### Platform

- cities
- localities
- categories
- category_attributes
- platform_settings

### Listings

- listings
- listing_categories
- listing_media
- listing_attributes
- listing_service_areas
- listing_actions

### Commerce

- products
- product_categories
- product_import_jobs
- product_import_errors
- catalog_versions

### Business timing

- business_hours
- special_hours
- temporary_status_overrides

### Promotions

- advertisements
- advertisement_events
- homepage_sections
- homepage_featured_listings

### Enquiries and analytics

- checkout_intents
- listing_events
- contact_events

### Administration

- admin_users
- admin_audit_logs

Use appropriate primary keys, foreign keys, indexes and constraints.

### Database design rules

- UUID primary keys where appropriate.
- Use timestamps with timezone.
- Store prices as integer minor units or correctly constrained numeric values.
- Include created_at and updated_at fields.
- Use stable identifiers internally.
- Use SEO-friendly slugs for URLs.
- Use unique constraints.
- Add appropriate indexes for categories, localities, publication and ranking.
- Avoid unbounded JSON fields for core relational data.
- Use JSONB selectively for category-specific attributes.
- Implement soft delete/archive where appropriate.
- Make migrations repeatable and version-controlled.

Document the schema and relationships.

---

## 21. DATABASE SECURITY

Security is mandatory.

Implement PostgreSQL Row Level Security.

### Public visitors

Can:

- Read published, enabled public listings.
- Read visible categories.
- Read available public catalog items.
- Read active advertisement information.
- Initiate controlled checkout events through a protected endpoint.

Cannot:

- Edit merchants.
- Modify prices.
- Change rankings.
- Upload media.
- Read private admin data.
- Read unpublished listings.
- Modify opening schedules.
- Directly manipulate analytics events.

### Administrator

Can:

- Manage all listings.
- Manage categories.
- Manage products.
- Manage advertisements.
- Manage rankings.
- Manage business hours.
- Manage platform settings.
- View analytics.

Authorization must be verified by database policy or trusted server-side code.

Do not expose secret keys, including Supabase service-role credentials, to the browser.

Use environment variables and provide `.env.example`.

For public checkout event creation, implement rate limiting, payload validation and server-side price verification.

For media uploads, enforce file type, size and ownership rules.

Prevent XSS when rendering merchant-supplied descriptions, product names or URLs.

---

# PART J — SEO AND PERFORMANCE

## 22. SEARCH ENGINE OPTIMIZATION

The public website must be SEO-friendly.

Requirements:

- Readable URLs
- Unique page titles
- Unique meta descriptions
- Canonical URLs
- Open Graph tags
- Structured data where appropriate
- XML sitemap
- robots.txt
- Descriptive image alt text
- Category landing pages
- Business detail pages
- Proper heading hierarchy

Use relevant Schema.org structured data where applicable, such as LocalBusiness, Restaurant or LodgingBusiness.

Do not publish false ratings, prices, availability or review counts in structured data.

### Critical architectural requirement

The website uses Vanilla JavaScript, but public merchant pages must not depend exclusively on client-side rendering for essential SEO content.

Implement a lightweight server-rendering or pre-rendering strategy compatible with Cloudflare Pages.

Newly published merchant pages must become accessible immediately without manual HTML file creation.

Ensure that the rendered HTML exposes useful merchant metadata and public content to crawlers.

Keep the implementation as simple and cost-efficient as possible.

---

## 23. PERFORMANCE

Optimize for mobile users and slower internet connections.

Requirements:

- Small JavaScript bundles
- Minimal CSS
- Lazy-loaded images
- WebP/AVIF support
- Responsive image sizes
- Image compression
- Static asset caching
- Minimal network requests
- Code splitting where appropriate
- Reduced layout shifts
- No unnecessary third-party scripts
- Accessible loading skeletons
- Graceful error handling

Target Lighthouse scores of at least 90 for Performance, Accessibility, Best Practices and SEO where realistically achievable, and report measured results rather than assuming them.

Respect Core Web Vitals.

Avoid loading every merchant and product on the homepage.

Fetch only the records needed for each section.

---

# PART K — DEMO DATA

## 24. COMPLETE DEMONSTRATION DATASET

Create development seed data so the entire application can be demonstrated immediately.

Populate all requested categories.

At minimum, include one appropriate sample listing in every category.

For major categories such as Food, Sweets, Hotels, Attractions, Home Services and Gyms, include up to four sample listings to demonstrate homepage ranking.

### Example demo content

Food:
- Demo Family Restaurant
- Demo Snacks Corner

Sweets:
- Demo Sweet Shop
- Demo Bakery

Hotels:
- Demo Guest House
- Demo City Hotel

Home Services:
- Demo Electrician
- Demo Plumber
- Demo Appliance Technician
- Demo Cleaning Service

Gyms:
- Demo Fitness Studio
- Demo Gym

Attractions:
- Demo Heritage Attraction
- Demo Nature Spot

Also create example listings for:

- Grocery
- Beauty
- Coaching
- Retail
- Healthcare
- Transport
- Entertainment
- Professional Services
- Local Essentials

Include sample products, service offerings, gym packages, hotel room types, opening schedules, images/placeholders and promotional banners.

### Important demo-data rules

- Clearly mark fictional listings as demo content.
- Do not misrepresent sample businesses as real Rawatbhata businesses.
- Do not use real-looking but unverified merchant phone numbers.
- Disable actual WhatsApp checkout when no verified merchant number exists.
- Do not invent precise addresses or coordinates.
- Avoid copyrighted or unlicensed imagery.
- Use local placeholder assets, permissively licensed images or user-provided assets.
- Provide a clear method to remove demo data before production launch.

The first page load should look visually complete, even before real merchants have been onboarded.

---

# PART L — COMPLETE ADMIN WORKFLOWS

## 25. EXPECTED ADMIN EXPERIENCE

The administrator should be able to complete the following without editing code.

### Workflow A — Add a new sweet shop

1. Log in.
2. Open Merchants.
3. Click Add Merchant.
4. Select category Sweets.
5. Enter merchant information.
6. Upload merchant banner.
7. Enter contact information.
8. Set business timings.
9. Upload product Excel file.
10. Review products.
11. Set homepage visibility and rank.
12. Publish merchant.
13. Open the automatically created public URL.

### Workflow B — Close a shop urgently

1. Log in.
2. Search merchant.
3. Open merchant details.
4. Click Temporarily Close.
5. Choose reopening date/time.
6. Save.
7. Public website immediately reflects the temporary closure.

### Workflow C — Update prices

1. Log in.
2. Select merchant.
3. Open Products.
4. Upload price-update Excel/CSV.
5. Preview differences.
6. Confirm.
7. Updated prices become available on the storefront.

### Workflow D — Add sponsored advertisement

1. Log in.
2. Open Advertisements.
3. Upload banner.
4. Select destination.
5. Set start/end dates.
6. Set priority.
7. Publish.
8. Advertisement becomes eligible for the homepage slideshow.

### Workflow E — Change homepage ranking

1. Log in.
2. Select category.
3. View eligible merchants.
4. Reorder or change rank.
5. Save.
6. Homepage displays the top four eligible merchants in the new order.

All five workflows must work end-to-end.

---

# PART M — TESTING AND QUALITY

## 26. TEST REQUIREMENTS

Implement automated tests for critical business logic.

### Unit tests

Test:

- Cart calculations
- Quantity validation
- WhatsApp message generation
- Price sorting
- Dietary filtering
- Search normalization
- Opening-hours calculations
- Split business hours
- Overnight schedules
- Temporary closures
- Holiday overrides
- Excel validation
- Merchant ranking
- Homepage top-four selection

### Integration tests

Test:

- Merchant CRUD
- Product import
- Listing publication
- Admin authorization
- Checkout initiation
- Advertisement scheduling
- Category filtering

### End-to-end tests

Test:

1. Open homepage.
2. Search for a merchant.
3. Open merchant page.
4. Filter products.
5. Add products to cart.
6. Open confirmation modal.
7. Confirm WhatsApp checkout.
8. Verify checkout initiation was recorded.

Also test:

- Admin login
- Add merchant
- Upload Excel
- Publish listing
- Change ranking
- Close merchant
- Enable/disable listing

Test mobile and desktop layouts.

Include accessibility checks.

Use a local/test Supabase environment or isolated fixtures; tests must not corrupt production data.

---

# PART N — PROJECT STRUCTURE

## 27. PROPOSED REPOSITORY ORGANIZATION

Use a clean structure similar to:

rawatbhata-platform/

- public/
  - index.html
  - assets/
  - images/
  - icons/

- src/
  - css/
    - tokens.css
    - base.css
    - layout.css
    - components.css
    - responsive.css
  - js/
    - app.js
    - router.js
    - supabase-client.js
    - search.js
    - cart.js
    - whatsapp.js
    - business-hours.js
    - filters.js
    - maps.js
    - analytics.js
  - components/
  - pages/
  - admin/
  - utils/

- functions/
  - public-pages/
  - checkout/
  - analytics/

- supabase/
  - migrations/
  - functions/
  - seed.sql

- scripts/
  - seed-demo-data.js

- tests/
  - unit/
  - integration/
  - e2e/

- docs/
  - architecture.md
  - database-schema.md
  - admin-guide.md
  - deployment-guide.md

- AGENTS.md
- package.json
- .env.example
- README.md

Adjust the exact folder structure where appropriate, but preserve a modular, maintainable architecture.

Do not duplicate business logic between public and admin modules.

---

# PART O — DEVELOPMENT EXECUTION PLAN

## 28. IMPLEMENT THE PROJECT IN PHASES

You must implement working code, not just describe the solution.

### Phase 1 — Architecture and foundation

- Inspect the repository.
- Define architecture.
- Create folder structure.
- Configure Supabase client.
- Create SQL migrations.
- Define database policies.
- Implement shared utilities.
- Create design system.
- Add demo seed-data infrastructure.
- Create environment configuration.

Deliver a runnable foundation.

### Phase 2 — Public homepage and discovery

- Responsive header
- Global search
- Promotional slideshow
- Category shortcuts
- Category-wise merchant rows
- See All links
- Merchant cards
- Category pages
- Locality filters

Make the visual design polished.

### Phase 3 — Merchant pages and WhatsApp checkout

- Dynamic merchant pages
- Product catalog
- Filters and sorting
- Shopping cart
- Confirmation modal
- WhatsApp message generation
- Protected checkout tracking
- Directions
- Business information
- Opening-hours display

Test the complete customer journey.

### Phase 4 — Admin dashboard

- Secure admin login
- Admin overview
- Merchant CRUD
- Category CRUD
- Image uploads
- Listing visibility management
- Ranking management
- Business-hours management
- Temporary closures
- Advertisement management

Test admin authorization.

### Phase 5 — Excel import and catalog management

- Excel/CSV template download
- File parsing
- Validation
- Import preview
- Secure database upsert
- Price-only updates
- Import reports
- Manual product editing

### Phase 6 — SEO, analytics and deployment

- SEO-friendly dynamic pages
- Metadata
- Structured data
- Sitemap
- Event tracking
- Dashboard analytics
- Performance optimization
- Cloudflare configuration
- Supabase configuration
- Production documentation

### Phase 7 — Final QA and cleanup

- Execute tests.
- Fix bugs.
- Verify responsive layouts.
- Verify access control.
- Verify demo flows.
- Review page performance.
- Remove unused dependencies.
- Update documentation.

---

## 29. ACCEPTANCE CRITERIA

Consider the application complete only when all these requirements are satisfied:

1. Homepage looks attractive and professional.
2. Site works on desktop, tablet and mobile.
3. Homepage advertisements rotate correctly.
4. Advertisements are admin-managed.
5. All demo categories are visible.
6. Category rows show at most four featured listings.
7. See All opens the correct category.
8. Global search functions.
9. Every published listing has a working unique URL.
10. Merchant pages dynamically use database content.
11. Product filters and sorting work.
12. Cart works without customer login.
13. WhatsApp confirmation modal works.
14. Checkout initiation is recorded accurately.
15. Google Maps directions work.
16. Business opening status calculates correctly.
17. Temporary closures override normal timings.
18. Admin login is secure.
19. No unauthorized user can edit merchant data.
20. Admin can create and publish merchants.
21. New listings become publicly accessible automatically.
22. Admin can upload and manage images.
23. Excel/CSV imports work with preview and validation.
24. Admin can adjust homepage ranking.
25. Admin can enable/disable merchants.
26. Admin can manage categories and localities.
27. Demo data covers all categories.
28. Website remains lightweight.
29. Public pages are SEO-friendly.
30. Project runs locally and is deployable.
31. Documentation is complete.
32. Automated tests pass.

---

# PART P — DEVELOPER EXPERIENCE AND DOCUMENTATION

## 30. README AND SETUP

Provide a detailed README containing:

- Project overview
- Architecture
- Technology stack
- Prerequisites
- Local development setup
- Environment variables
- Supabase project setup
- Database migration commands
- Storage bucket setup
- Admin account creation
- Demo data installation
- Starting the local development server
- Running automated tests
- Cloudflare Pages deployment
- Production configuration checklist
- Troubleshooting

Provide `.env.example` without actual credentials.

Document manual steps when external service configuration is required.

Never invent credentials or claim that external configuration has been completed.

---

## 31. AGENTS.MD

Create an `AGENTS.md` file containing persistent project instructions for future Codex sessions.

Include:

- Architecture principles
- Frontend technology restrictions
- Naming conventions
- Shared component patterns
- Database security rules
- Testing requirements
- Accessibility standards
- Performance standards
- Commit and verification guidelines

Future Codex changes must follow these instructions.

---

# PART Q — FINAL DEVELOPMENT RULES

## 32. NON-NEGOTIABLE REQUIREMENTS

1. Write actual working code.
2. Do not stop after producing mockups.
3. Do not build disconnected frontend-only demos.
4. Do not introduce heavyweight frameworks.
5. Do not hardcode merchant listings into HTML.
6. Do not create separate source-code pages for individual merchants.
7. Do not expose Supabase secret keys.
8. Do not allow unauthorized public writes.
9. Do not implement a payment gateway.
10. Do not require customer registration.
11. Do not create merchant login functionality.
12. Do not falsely claim WhatsApp messages were sent.
13. Do not count checkout clicks as confirmed orders.
14. Do not require paid Google Maps APIs.
15. Do not delete catalog items silently during Excel import.
16. Do not hide closed merchants unless administratively disabled.
17. Do not invent real merchant contact information.
18. Do not use copyrighted branding or unlicensed assets.
19. Keep the system configurable and extensible.
20. Keep implementation practical for a small-town pilot and future multi-city expansion.

---

## 33. HOW TO BEGIN

Start by performing these actions:

1. Inspect the current repository and identify existing files.
2. Create a concise architecture and implementation plan.
3. Document important technical decisions.
4. Define the database schema.
5. Create the initial project structure.
6. Implement the application in the phases described above.
7. Run relevant tests after each phase.
8. Fix failing tests before proceeding.
9. Document completed work and remaining limitations.
10. Finish with a runnable, tested end-to-end application.

Do not merely provide implementation instructions. Create the files and implement the project in the repository.

When external credentials or deployment permissions are unavailable, complete all locally implementable work and document the exact configuration steps.

Use reasonable defaults where details are unspecified. Avoid unnecessary clarification requests.

Prioritize a clean, functional, secure, attractive application over excessive engineering.

**Final goal: A working, lightweight, responsive, production-oriented Rawatbhata Local Discovery Platform with one admin dashboard, dynamic category and merchant pages, sponsored advertisements, Excel catalog management, locality discovery, business timing management and WhatsApp-based checkout.**