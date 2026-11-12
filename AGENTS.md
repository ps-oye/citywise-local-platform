# AGENTS.md — Rawatbhata One

## 1. Project Overview

Project Name: Rawatbhata One

Project Type: Hyperlocal Discovery Platform

Initial Location: Rawatbhata, Rajasthan, India

The objective is to develop a lightweight, responsive and scalable local discovery platform.

It will help users discover:

- Restaurants and sweet shops
- Grocery and retail shops
- Hotels and guest houses
- Tourist attractions
- Gyms and fitness centres
- Home-service providers
- Coaching and education centres
- Local services and essential information

The complete product requirements are defined in:

`docs/MASTER_SPEC.md`

**Always read `docs/MASTER_SPEC.md` before implementing a new feature or making architectural changes.**

The master specification is the source of truth for product requirements.

---

## 2. Role and Responsibilities

Act as an experienced:

- Software Architect
- Full-Stack Developer
- UI/UX Engineer
- Database Architect
- Security Engineer
- QA Engineer

Prioritize maintainability, lightweight implementation, security and user experience.

Implement actual functioning features rather than disconnected mockups.

Do not make unnecessary architectural changes.

---

## 3. Mandatory Technology Stack

### Frontend

Use:

- HTML5
- CSS3
- Vanilla JavaScript (ES6+ modules)
- Native browser APIs

Do not use:

- React
- Angular
- Vue
- Next.js
- jQuery
- Bootstrap
- Tailwind CSS
- Heavy frontend frameworks

Vite is permitted as a lightweight build tool.

### Backend

Use:

- Supabase PostgreSQL
- Supabase Authentication
- Supabase Storage
- Supabase JavaScript SDK
- PostgreSQL Row Level Security

Use Supabase Edge Functions or Cloudflare Pages Functions only when trusted server-side operations are necessary.

### Hosting

- Cloudflare Pages
- Supabase

### External integrations

- WhatsApp Click-to-Chat
- Google Maps Directions URLs
- Excel/CSV parsing

Do not introduce a payment gateway without explicit approval.

---

## 4. Architecture Rules

Follow a modular architecture.

Separate:

- Public website
- Admin dashboard
- Shared UI components
- Database access
- Business logic
- Services
- Utilities
- Styles

Avoid duplicating logic.

Use reusable components wherever practical.

The application must be data-driven.

Do not hardcode merchants, products, categories or attractions directly into public page templates.

Every listing must be generated from database content.

Adding a merchant through the admin dashboard must not require changes to source code.

Support multiple cities in the data model, even though Rawatbhata is the initial city.

---

## 5. UI/UX Standards

The website should have a premium, modern, attractive design inspired by BookMyShow's content-discovery experience.

Do not copy BookMyShow's proprietary branding or design assets.

Design requirements:

- Mobile-first layout
- Responsive design
- Beautiful image-based listing cards
- Consistent spacing
- Clear typography
- Rounded corners
- Subtle shadows
- Accessible contrast
- Intuitive navigation
- Lightweight transitions
- Professional loading and empty states

Use CSS variables for design tokens.

Avoid excessive animations and unnecessary JavaScript.

All important interactive elements must work on mobile and desktop.

---

## 6. Homepage Rules

The homepage must contain:

1. Responsive navigation header
2. Global search
3. Locality selector
4. Sponsored advertisement carousel
5. Category shortcuts
6. Category-wise listing sections
7. See All links
8. Featured listing cards

Each homepage category section must show a maximum of four listings.

Admin controls:

- Homepage visibility
- Display ranking
- Listing enable/disable status
- Sponsored advertisements
- Advertisement priority

Never show disabled or unpublished listings publicly.

Paid placements must be clearly labeled Sponsored.

---

## 7. Listing and Merchant Rules

Use a reusable listing page system.

Supported listing types include:

- Commerce
- Restaurant
- Hotel
- Home Service
- Fitness
- Attraction
- Informational
- General Business

Each listing should support applicable information:

- Name
- Description
- Banner
- Gallery
- Category
- Locality
- Opening hours
- Address
- Contact number
- WhatsApp number
- Google Maps directions
- Products, services or packages
- Availability
- Publication status

Do not show irrelevant sections for a listing type.

For example:

- Restaurants use product catalogs.
- Hotels use room information.
- Gyms use membership information.
- Service providers use services and service areas.
- Attractions use visiting information and directions.

---

## 8. Shopping Cart Rules

Use browser localStorage for cart persistence.

Maintain separate carts for separate merchants.

Products must be fetched from Supabase.

Features:

- Add/remove products
- Update quantities
- Calculate totals
- Validate prices before checkout
- Handle unavailable products

Never trust prices submitted by the browser.

Use server-authoritative values for checkout calculations.

---

## 9. WhatsApp Checkout Rules

The customer journey is:

1. Browse merchant products.
2. Add products to cart.
3. Review cart.
4. Click WhatsApp checkout.
5. View a confirmation modal.
6. Confirm the enquiry.
7. Record checkout initiation securely.
8. Open WhatsApp with a prefilled message.

Use WhatsApp Click-to-Chat.

Do not implement a payment gateway.

Do not automatically mark an enquiry as an accepted or completed order.

A WhatsApp link cannot confirm that the customer actually sent the message.

Track only verifiable events, such as checkout initiation and link handoff.

---

## 10. Business Hours Rules

Support:

- Different weekly schedules
- Multiple shifts per day
- Weekly holidays
- Special-date opening hours
- Emergency closures
- Manual reopening
- Automatic calculation of opening status

Default timezone: `Asia/Kolkata`.

An active emergency closure overrides the normal schedule.

Closed businesses should appear visually muted but remain accessible unless the admin disables their listing.

Never claim real-time availability without a reliable status source.

---

## 11. Admin Dashboard Rules

Initially, the application supports exactly one administrator.

Do not implement:

- Public customer login
- Merchant login
- Merchant self-registration
- Public admin signup

Use Supabase Auth with database-backed admin authorization.

The admin dashboard must support:

- Merchant CRUD
- Category management
- Locality management
- Product catalogs
- Excel/CSV imports
- Image management
- Advertisements
- Homepage ranking
- Opening schedules
- Emergency closures
- Listing publication
- Analytics

Admin operations must be protected by Row Level Security or trusted backend authorization.

Frontend checks alone are not sufficient.

---

## 12. Excel Import Rules

Support Excel `.xlsx` and CSV files.

Required behavior:

1. Parse uploaded file.
2. Validate column names.
3. Validate rows.
4. Detect duplicate SKUs.
5. Preview proposed changes.
6. Confirm before updating.
7. Apply authorized database updates.
8. Show success/error report.

Use `(merchant_id, sku)` as the unique product identifier.

Support:

- New product imports
- Existing product updates
- Price-only updates

Never delete existing products merely because they are absent from an uploaded file.

Do not execute spreadsheet formulas.

---

## 13. Database Rules

Use PostgreSQL relational tables for core entities.

Database migrations must be version-controlled.

Requirements:

- Primary keys
- Foreign keys
- Unique constraints
- Appropriate indexes
- Row Level Security
- created_at and updated_at timestamps
- Appropriate data validation

Use JSONB only for genuinely flexible category-specific attributes.

Keep customer/private data separate from public business data.

Do not run destructive database migrations without explicit approval.

---

## 14. Security Requirements

Security is mandatory.

Never:

- Commit real credentials
- Expose service-role keys
- Disable RLS for convenience
- Trust client-provided prices
- Allow unauthorized admin changes
- Insert unsanitized merchant content into HTML
- Use unvalidated redirect URLs

Always:

- Validate inputs
- Enforce authorization
- Restrict upload types and sizes
- Use environment variables
- Protect administrative operations
- Apply secure database policies
- Avoid unnecessary collection of personal data
- Review dependencies for known vulnerabilities

---

## 15. SEO Requirements

Public pages should be search-engine friendly.

Include:

- Descriptive URLs
- Page titles
- Meta descriptions
- Canonical URLs
- Open Graph metadata
- Structured data where applicable
- XML sitemap
- robots.txt
- Accessible HTML

Dynamic listing pages must expose meaningful HTML to search engines.

Do not rely exclusively on browser-side JavaScript for essential SEO content.

Use a lightweight pre-rendering or server-rendering approach where necessary.

---

## 16. Performance Requirements

Keep the application lightweight.

Prefer:

- Native JavaScript
- Small dependencies
- Optimized images
- Lazy loading
- Minimal network requests
- Static asset caching
- Efficient database queries
- Pagination/incremental loading
- Debounced search

Avoid loading unnecessary data.

Do not fetch every merchant or product on initial page load.

Target good Core Web Vitals and strong Lighthouse scores.

---

## 17. Demo Data Requirements

Create fictional demonstration data for all major categories.

Demo data must:

- Be clearly identified as sample data
- Not impersonate real businesses
- Avoid real-looking unverified phone numbers
- Avoid fabricated precise addresses
- Use properly licensed or placeholder images

Actual WhatsApp checkout must be disabled for demo-only merchants without verified contact details.

Demo data must be removable before production.

---

## 18. Development Workflow

Before implementing a feature:

1. Read the relevant sections of `docs/MASTER_SPEC.md`.
2. Inspect existing code.
3. Identify shared components and utilities.
4. Make an implementation plan.
5. Implement the feature.
6. Run relevant tests.
7. Fix errors.
8. Update documentation.

Do not rewrite unrelated modules unnecessarily.

Do not introduce dependencies without a clear reason.

Keep code readable and maintainable.

---

## 19. Testing Standards

Write tests for:

- Cart calculations
- Product filtering
- Sorting
- Opening-hours logic
- Excel imports
- Homepage ranking
- Search behavior
- Checkout tracking
- Authentication and authorization
- Admin CRUD operations

Run relevant tests after meaningful changes.

Do not claim tests passed unless they actually executed successfully.

---

## 20. Codex Execution Rules

Follow the development phases in `docs/MASTER_SPEC.md`.

Implement only the phase requested in the current task.

Do not automatically jump to later phases.

When the current phase is complete:

- Summarize changes
- List files created or modified
- Report tests performed
- Report remaining issues
- Explain manual configuration required
- State which phase is ready next

Do not automatically deploy to production.

Do not execute destructive migrations or delete production data without explicit approval.

Do not invent external credentials or claim integrations are configured when they are not.

Use reasonable defaults when requirements are clear.

---

## 21. Project Success Criteria

The final application should:

- Be lightweight and visually attractive
- Work on mobile and desktop
- Support a unified local discovery experience
- Support dynamic merchant pages
- Support WhatsApp ordering
- Support Excel catalog imports
- Support automatic business timings
- Support a single secure admin dashboard
- Support sponsored advertisements
- Support homepage listing rankings
- Support locality-based discovery
- Be expandable to multiple cities
- Be deployable on Cloudflare Pages and Supabase

**Always prioritize working functionality, security, user experience and maintainability.**