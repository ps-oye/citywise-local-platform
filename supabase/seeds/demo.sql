-- OPT-IN LOCAL/TEST FIXTURES. No real businesses, contacts, addresses or coordinates.
-- Run after seed.sql. Idempotent: existing rows are not overwritten.
begin;

insert into public.localities(id, city_id, name, slug, is_demo)
values (
  md5('rawatbhata-one-demo:locality')::uuid, '10000000-0000-4000-8000-000000000001',
  'Sample neighbourhood (demo)', 'demo-neighbourhood', true
) on conflict do nothing;

create temporary table demo_categories (slug text, name text, kind public.listing_type, position integer) on commit drop;
insert into demo_categories values
  ('food', 'Food & Restaurants', 'RESTAURANT', 1),
  ('sweets', 'Sweets & Bakeries', 'RESTAURANT', 2),
  ('grocery', 'Grocery & Daily Essentials', 'COMMERCE', 3),
  ('hotels', 'Hotels & Stays', 'HOTEL', 4),
  ('attractions', 'Attractions & Tourism', 'ATTRACTION', 5),
  ('home-services', 'Home Services', 'SERVICE_PROVIDER', 6),
  ('fitness', 'Gyms & Fitness', 'FITNESS', 7),
  ('beauty', 'Beauty & Wellness', 'SERVICE_PROVIDER', 8),
  ('education', 'Education & Coaching', 'GENERAL_BUSINESS', 9),
  ('shopping', 'Shopping & Retail', 'COMMERCE', 10),
  ('healthcare', 'Healthcare & Pharmacies', 'GENERAL_BUSINESS', 11),
  ('transport', 'Transportation & Travel', 'SERVICE_PROVIDER', 12),
  ('events', 'Events & Entertainment', 'GENERAL_BUSINESS', 13),
  ('professional-services', 'Professional Services', 'SERVICE_PROVIDER', 14),
  ('local-essentials', 'Local Essentials & Public Information', 'INFORMATIONAL', 15);

insert into public.categories(id, name, slug, display_order, is_demo)
select md5('rawatbhata-one-demo:category:' || slug)::uuid, name, slug, position, true
from demo_categories on conflict do nothing;

insert into public.listings(id, city_id, locality_id, name, slug, listing_type, short_description, description, publication_status, is_demo)
select md5('rawatbhata-one-demo:listing:' || slug)::uuid, '10000000-0000-4000-8000-000000000001',
  md5('rawatbhata-one-demo:locality')::uuid, 'Demo ' || name, 'demo-' || slug, kind,
  'Fictional sample listing. This is not a real business.',
  'Demonstration content for local development. No verified contact, address or location is provided.',
  'published', true
from demo_categories on conflict do nothing;

insert into public.listing_categories(listing_id, category_id, is_primary)
select md5('rawatbhata-one-demo:listing:' || slug)::uuid,
  md5('rawatbhata-one-demo:category:' || slug)::uuid, true
from demo_categories on conflict do nothing;

insert into public.listing_actions(listing_id, checkout_enabled, directions_enabled)
select md5('rawatbhata-one-demo:listing:' || slug)::uuid, false, false
from demo_categories on conflict do nothing;

insert into public.product_categories(id, merchant_id, name, slug)
select md5('rawatbhata-one-demo:product-category:' || slug)::uuid,
  md5('rawatbhata-one-demo:listing:' || slug)::uuid, 'Sample catalog', 'sample-catalog'
from demo_categories where kind in ('COMMERCE', 'RESTAURANT') on conflict do nothing;

insert into public.products(id, merchant_id, product_category_id, sku, name, description, price_minor, unit, dietary_type)
select md5('rawatbhata-one-demo:product:' || slug)::uuid,
  md5('rawatbhata-one-demo:listing:' || slug)::uuid,
  md5('rawatbhata-one-demo:product-category:' || slug)::uuid,
  'DEMO-001', 'Sample item (demo)', 'Fictional item and illustrative price. Not available to order.',
  5000, 'item', case when kind = 'RESTAURANT' then 'vegetarian' else 'not_applicable' end
from demo_categories where kind in ('COMMERCE', 'RESTAURANT') on conflict do nothing;

insert into public.offerings(id, listing_id, kind, name, description, details)
select md5('rawatbhata-one-demo:offering:' || slug)::uuid,
  md5('rawatbhata-one-demo:listing:' || slug)::uuid,
  case kind when 'HOTEL' then 'room' when 'FITNESS' then 'membership'
    when 'ATTRACTION' then 'visiting_info' else 'service' end,
  'Sample offering (demo)', 'Fictional demonstration information.', '{"sample":true}'::jsonb
from demo_categories where kind in ('HOTEL', 'FITNESS', 'ATTRACTION', 'SERVICE_PROVIDER') on conflict do nothing;

insert into public.business_hours(id, listing_id, weekday, opens_at, closes_at)
select md5('rawatbhata-one-demo:hours:' || d.slug || ':' || day::text)::uuid,
  md5('rawatbhata-one-demo:listing:' || d.slug)::uuid, day, '09:00', '18:00'
from demo_categories d cross join generate_series(0, 6) day on conflict do nothing;

insert into public.homepage_sections(id, city_id, category_id, display_order)
select md5('rawatbhata-one-demo:section:' || slug)::uuid, '10000000-0000-4000-8000-000000000001',
  md5('rawatbhata-one-demo:category:' || slug)::uuid, position
from demo_categories on conflict do nothing;

insert into public.homepage_featured_listings(id, section_id, listing_id, city_id, category_id, rank)
select md5('rawatbhata-one-demo:feature:' || slug)::uuid,
  md5('rawatbhata-one-demo:section:' || slug)::uuid, md5('rawatbhata-one-demo:listing:' || slug)::uuid,
  '10000000-0000-4000-8000-000000000001', md5('rawatbhata-one-demo:category:' || slug)::uuid, 1
from demo_categories on conflict do nothing;

-- Image upload and slideshow presentation belong to Phase 2/4; these are disabled records.
insert into public.advertisements(id, city_id, title, subtitle, alt_text, enabled, is_demo)
select md5('rawatbhata-one-demo:advertisement:' || n::text)::uuid,
  '10000000-0000-4000-8000-000000000001', 'Demo promotion ' || n::text,
  'Fictional sample promotion', 'Demonstration banner placeholder', false, true
from generate_series(1, 3) n on conflict do nothing;

commit;
