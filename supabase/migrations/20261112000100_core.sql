-- Phase 1: relational foundation. Apply once through the migration ledger.
begin;

-- Do not make unrelated objects newly accessible when this application's schema
-- USAGE grants are added later. Empty/new schemas need no compatibility check.
do $$
declare target record;
begin
  for target in
    select n.oid, n.nspname, required.role_name
    from pg_catalog.pg_namespace n
    join (values ('public', 'anon'), ('public', 'authenticated'), ('private', 'authenticated'))
      as required(schema_name, role_name) on required.schema_name = n.nspname
    where not pg_catalog.has_schema_privilege(required.role_name, n.oid, 'USAGE')
      and (exists (select 1 from pg_catalog.pg_class c where c.relnamespace = n.oid)
        or exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = n.oid))
  loop
    raise exception 'Schema "%" already contains objects without USAGE for role "%". Refusing to broaden existing access; use a dedicated project or review schema permissions first.', target.nspname, target.role_name;
  end loop;
end;
$$;

create schema if not exists private;
-- Keep any existing schema USAGE permissions; individual application objects are secured below.
revoke create on schema public, private from public, anon, authenticated;

-- Defaults apply to the role running these migrations, not to existing objects.
-- PUBLIC's built-in function EXECUTE privilege can only be revoked globally for that role.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create domain public.slug_text as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(value) <= 120);
create domain public.money_minor as bigint
  check (value between 0 and 99999999999);
create type public.listing_type as enum (
  'COMMERCE', 'RESTAURANT', 'HOTEL', 'SERVICE_PROVIDER',
  'FITNESS', 'ATTRACTION', 'INFORMATIONAL', 'GENERAL_BUSINESS'
);
create type public.publication_status as enum ('draft', 'published', 'archived');

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug public.slug_text not null unique,
  state text not null check (length(trim(state)) between 1 and 120),
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'Asia/Kolkata',
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or enabled)
);
create unique index cities_single_default on public.cities (is_default) where is_default;

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  slug public.slug_text not null,
  enabled boolean not null default true,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug),
  unique (id, city_id),
  check ((latitude is null) = (longitude is null))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  slug public.slug_text not null unique,
  description text not null default '' check (length(description) <= 3000),
  icon_name public.slug_text,
  enabled boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index categories_parent_order on public.categories(parent_id, display_order, id);

create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  brand_name text not null default 'Rawatbhata One' check (length(trim(brand_name)) between 1 and 80),
  tagline text not null default 'Discover everything around you' check (length(tagline) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.category_attributes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  attribute_key public.slug_text not null,
  label text not null check (length(trim(label)) between 1 and 120),
  value_type text not null check (value_type in ('text', 'number', 'boolean', 'options')),
  options jsonb check (options is null or jsonb_typeof(options) = 'array'),
  filterable boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, attribute_key)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  locality_id uuid,
  name text not null check (length(trim(name)) between 1 and 180),
  slug public.slug_text not null,
  listing_type public.listing_type not null default 'GENERAL_BUSINESS',
  short_description text not null default '' check (length(short_description) <= 400),
  description text not null default '' check (length(description) <= 20000),
  address text check (length(address) <= 600),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  maps_place_id text check (length(maps_place_id) <= 300),
  phone_number text check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_number text check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  contact_verified_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  publication_status public.publication_status not null default 'draft',
  enabled boolean not null default true,
  sponsored boolean not null default false,
  is_demo boolean not null default false,
  verified_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug),
  unique (id, city_id),
  foreign key (locality_id, city_id) references public.localities(id, city_id) on delete restrict,
  check ((latitude is null) = (longitude is null)),
  check (not is_demo or (
    phone_number is null and whatsapp_number is null and contact_verified_at is null
    and address is null and latitude is null and maps_place_id is null
  ))
);
create index listings_discovery on public.listings(city_id, locality_id, id)
  where publication_status = 'published' and enabled and archived_at is null;
create index listings_locality_fk on public.listings(locality_id, city_id);
create index listings_search on public.listings using gin (
  to_tsvector('simple', name || ' ' || short_description || ' ' || description)
);

create table public.listing_categories (
  listing_id uuid not null references public.listings(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, category_id)
);
create unique index listing_one_primary_category on public.listing_categories(listing_id) where is_primary;
create index listing_categories_reverse on public.listing_categories(category_id, listing_id);

create table public.listing_slug_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  city_id uuid not null,
  old_slug public.slug_text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, old_slug),
  foreign key (listing_id, city_id) references public.listings(id, city_id) on delete cascade
);
create index listing_slug_history_listing on public.listing_slug_history(listing_id);

create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  bucket_id text not null default 'listing-media' check (bucket_id = 'listing-media'),
  object_path text not null unique,
  alt_text text not null check (length(trim(alt_text)) between 1 and 240),
  media_role text not null default 'gallery' check (media_role in ('banner', 'logo', 'gallery', 'product')),
  display_order integer not null default 0 check (display_order >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, listing_id),
  check (split_part(object_path, '/', 1) = listing_id::text),
  check (object_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$')
);
create index listing_media_listing on public.listing_media(listing_id, display_order, id);

create table public.listing_attributes (
  listing_id uuid not null references public.listings(id) on delete cascade,
  attribute_id uuid not null references public.category_attributes(id) on delete cascade,
  value jsonb not null check (jsonb_typeof(value) in ('string', 'number', 'boolean', 'array') and pg_column_size(value) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, attribute_id)
);
create index listing_attributes_definition on public.listing_attributes(attribute_id);

create table public.listing_service_areas (
  listing_id uuid not null,
  locality_id uuid not null,
  city_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, locality_id),
  foreign key (listing_id, city_id) references public.listings(id, city_id) on delete cascade,
  foreign key (locality_id, city_id) references public.localities(id, city_id) on delete restrict
);
create index listing_service_areas_locality on public.listing_service_areas(locality_id, city_id);

create table public.listing_actions (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  checkout_enabled boolean not null default false,
  enquiries_while_closed boolean not null default false,
  delivery_available boolean not null default false,
  pickup_available boolean not null default true,
  directions_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null check (kind in ('service', 'room', 'membership', 'package', 'visiting_info')),
  name text not null check (length(trim(name)) between 1 and 180),
  description text not null default '' check (length(description) <= 5000),
  indicative_price_minor public.money_minor,
  price_unit text check (length(price_unit) <= 80),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  available boolean not null default true,
  enabled boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index offerings_listing on public.offerings(listing_id, display_order, id);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.listings(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  slug public.slug_text not null,
  enabled boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, slug),
  unique (id, merchant_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.listings(id) on delete cascade,
  product_category_id uuid,
  sku text not null check (sku = trim(sku) and length(sku) between 1 and 80),
  name text not null check (length(trim(name)) between 1 and 180),
  description text not null default '' check (length(description) <= 5000),
  price_minor public.money_minor not null,
  original_price_minor public.money_minor,
  currency text not null default 'INR' check (currency = 'INR'),
  unit text not null default 'item' check (length(trim(unit)) between 1 and 80),
  dietary_type text not null default 'not_applicable' check (dietary_type in ('vegetarian', 'non_vegetarian', 'egg', 'not_applicable')),
  image_media_id uuid,
  available boolean not null default true,
  active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, sku),
  unique (id, merchant_id),
  foreign key (product_category_id, merchant_id) references public.product_categories(id, merchant_id) on delete restrict,
  foreign key (image_media_id, merchant_id) references public.listing_media(id, listing_id) on delete restrict,
  check (original_price_minor is null or original_price_minor >= price_minor)
);
create index products_catalog on public.products(merchant_id, product_category_id, display_order, id) where active and archived_at is null;
create index products_category_fk on public.products(product_category_id, merchant_id);
create index products_image_fk on public.products(image_media_id, merchant_id);
create index products_search on public.products using gin (to_tsvector('simple', name || ' ' || description));

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  ends_next_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, weekday, opens_at),
  check ((not ends_next_day and closes_at > opens_at) or (ends_next_day and closes_at <= opens_at))
);

create table public.special_hours (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  on_date date not null,
  closed boolean not null default false,
  label text check (length(label) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, on_date)
);
create table public.special_hour_intervals (
  id uuid primary key default gen_random_uuid(),
  special_hours_id uuid not null references public.special_hours(id) on delete cascade,
  opens_at time not null,
  closes_at time not null,
  ends_next_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (special_hours_id, opens_at),
  check ((not ends_next_day and closes_at > opens_at) or (ends_next_day and closes_at <= opens_at))
);
create table public.temporary_status_overrides (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  status text not null check (status in ('open', 'closed')),
  reason text check (length(reason) <= 240),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);
create index status_overrides_listing on public.temporary_status_overrides(listing_id, starts_at desc);
-- One unrevoked manual override; a new override must explicitly revoke the previous one.
create unique index status_one_unrevoked on public.temporary_status_overrides(listing_id) where revoked_at is null;

create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  listing_id uuid,
  title text not null check (length(trim(title)) between 1 and 180),
  subtitle text check (length(subtitle) <= 400),
  cta_text text check (length(cta_text) <= 80),
  destination_url text,
  desktop_image_path text,
  mobile_image_path text,
  alt_text text not null check (length(trim(alt_text)) between 1 and 240),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  priority integer not null default 0 check (priority >= 0),
  sponsored boolean not null default true,
  enabled boolean not null default false,
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, city_id),
  foreign key (listing_id, city_id) references public.listings(id, city_id) on delete restrict,
  check (ends_at is null or ends_at > starts_at),
  check (not enabled or desktop_image_path is not null),
  check (destination_url is null or (
    length(destination_url) <= 2048 and destination_url !~ '[[:space:]\\]'
    and (destination_url = '/' or destination_url ~ '^/[^/\\]' or destination_url ~ '^https://[^/@\\]+([/?#]|$)')
  )),
  check (desktop_image_path is null or (split_part(desktop_image_path, '/', 1) = id::text
    and desktop_image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$')),
  check (mobile_image_path is null or (split_part(mobile_image_path, '/', 1) = id::text
    and mobile_image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(jpg|jpeg|png|webp|avif)$'))
);
create index advertisements_schedule on public.advertisements(city_id, priority, starts_at, id) where enabled and archived_at is null;
create index advertisements_listing_fk on public.advertisements(listing_id, city_id);

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  title text check (length(trim(title)) between 1 and 180),
  enabled boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, category_id),
  unique (id, city_id, category_id)
);
create index homepage_sections_category on public.homepage_sections(category_id);

create table public.homepage_featured_listings (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  listing_id uuid not null,
  city_id uuid not null,
  category_id uuid not null,
  rank integer not null default 0 check (rank >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, listing_id),
  foreign key (section_id, city_id, category_id) references public.homepage_sections(id, city_id, category_id) on delete cascade,
  foreign key (listing_id, city_id) references public.listings(id, city_id) on delete cascade,
  foreign key (listing_id, category_id) references public.listing_categories(listing_id, category_id) on delete cascade
);
create index homepage_featured_ranking on public.homepage_featured_listings(section_id, rank, listing_id) where enabled;
create index homepage_featured_listing_fk on public.homepage_featured_listings(listing_id, city_id);
create index homepage_featured_category_fk on public.homepage_featured_listings(listing_id, category_id);

-- Private operational records: never mix customer enquiries with public business data.
create table private.admin_users (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.product_import_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.listings(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('upsert', 'price_only')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'failed')),
  row_count integer not null default 0 check (row_count between 0 and 10000),
  applied_count integer not null default 0 check (applied_count between 0 and row_count),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, merchant_id)
);
create index import_jobs_actor on private.product_import_jobs(actor_id);
create index import_jobs_merchant on private.product_import_jobs(merchant_id, created_at desc);
create table private.product_import_errors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.product_import_jobs(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  column_name text check (length(column_name) <= 120),
  error_code text not null check (length(error_code) between 1 and 100),
  message text not null check (length(message) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index import_errors_job on private.product_import_errors(job_id);
create table private.catalog_versions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.listings(id) on delete restrict,
  import_job_id uuid,
  version integer not null check (version > 0),
  storage_path text check (length(storage_path) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, version),
  foreign key (import_job_id, merchant_id) references private.product_import_jobs(id, merchant_id) on delete restrict
);
create index catalog_versions_import on private.catalog_versions(import_job_id);
create table private.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.listings(id) on delete restrict,
  reference text not null unique check (reference ~ '^RB-[A-Z0-9]{8,20}$'),
  idempotency_key uuid not null unique,
  state text not null default 'initiated' check (state in ('initiated', 'handoff_created')),
  total_minor public.money_minor not null,
  currency text not null default 'INR' check (currency = 'INR'),
  fulfilment text not null default 'enquiry' check (fulfilment in ('enquiry', 'pickup', 'delivery')),
  instructions text check (length(instructions) <= 1000),
  handoff_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, merchant_id),
  check ((state = 'handoff_created') = (handoff_created_at is not null))
);
create index checkout_intents_merchant on private.checkout_intents(merchant_id, created_at desc);
create table private.checkout_intent_items (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null,
  merchant_id uuid not null,
  product_id uuid not null,
  product_name text not null check (length(product_name) between 1 and 180),
  quantity integer not null check (quantity between 1 and 999),
  unit_price_minor public.money_minor not null,
  line_total_minor public.money_minor not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intent_id, product_id),
  foreign key (intent_id, merchant_id) references private.checkout_intents(id, merchant_id) on delete cascade,
  foreign key (product_id, merchant_id) references public.products(id, merchant_id) on delete restrict,
  check (line_total_minor = quantity * unit_price_minor)
);
create index checkout_items_product on private.checkout_intent_items(product_id, merchant_id);
-- A unified, typed event log avoids three nearly identical event tables.
create table private.analytics_events (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  listing_id uuid,
  advertisement_id uuid,
  event_type text not null check (event_type in ('listing_view', 'phone_click', 'directions_click', 'whatsapp_click', 'ad_visible_impression', 'ad_click')),
  event_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, city_id) references public.listings(id, city_id) on delete restrict,
  foreign key (advertisement_id, city_id) references public.advertisements(id, city_id) on delete restrict,
  check ((event_type in ('ad_visible_impression', 'ad_click')) = (advertisement_id is not null)),
  check (listing_id is not null or advertisement_id is not null)
);
create index analytics_city_time on private.analytics_events(city_id, created_at desc);
create index analytics_listing_time on private.analytics_events(listing_id, created_at desc);
create index analytics_ad_time on private.analytics_events(advertisement_id, created_at desc);
create table private.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_audit_actor on private.admin_audit_logs(actor_id);
create index admin_audit_time on private.admin_audit_logs(created_at desc);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function private.validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown IANA timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger cities_timezone before insert or update on public.cities
  for each row execute function private.validate_timezone();
create trigger listings_timezone before insert or update on public.listings
  for each row execute function private.validate_timezone();

-- Enforce a verified, non-demo contact even when an administrator enables checkout directly.
create function private.validate_checkout_configuration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'listing_actions' then
    if new.checkout_enabled and not exists (
      select 1 from public.listings l where l.id = new.listing_id and not l.is_demo
        and l.whatsapp_number is not null and l.contact_verified_at is not null
        and l.listing_type in ('COMMERCE', 'RESTAURANT')
    ) then
      raise exception 'Checkout requires a verified commerce contact and cannot be enabled for demo listings' using errcode = '23514';
    end if;
  elsif (new.is_demo or new.whatsapp_number is null or new.contact_verified_at is null
    or new.listing_type not in ('COMMERCE', 'RESTAURANT')) and exists (
    select 1 from public.listing_actions a where a.listing_id = new.id and a.checkout_enabled
  ) then
    raise exception 'Disable checkout before removing the verified contact' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger listing_actions_checkout before insert or update on public.listing_actions
  for each row execute function private.validate_checkout_configuration();
create trigger listings_checkout before update on public.listings
  for each row execute function private.validate_checkout_configuration();

create function private.validate_category_tree() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and exists (
    with recursive parents as (
      select id, parent_id from public.categories where id = new.parent_id
      union
      select c.id, c.parent_id from public.categories c join parents p on c.id = p.parent_id
    )
    select 1 from parents where id = new.id
  ) then
    raise exception 'Category hierarchy must not contain cycles' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger categories_tree before insert or update on public.categories
  for each row execute function private.validate_category_tree();

-- Explicit ownership manifest: never scan entire schemas when changing grants or triggers.
create function private.application_tables()
returns table (schema_name text, table_name text)
language sql immutable set search_path = '' as $$
  values
    ('public', 'cities'),
    ('public', 'localities'),
    ('public', 'categories'),
    ('public', 'platform_settings'),
    ('public', 'category_attributes'),
    ('public', 'listings'),
    ('public', 'listing_categories'),
    ('public', 'listing_slug_history'),
    ('public', 'listing_media'),
    ('public', 'listing_attributes'),
    ('public', 'listing_service_areas'),
    ('public', 'listing_actions'),
    ('public', 'offerings'),
    ('public', 'product_categories'),
    ('public', 'products'),
    ('public', 'business_hours'),
    ('public', 'special_hours'),
    ('public', 'special_hour_intervals'),
    ('public', 'temporary_status_overrides'),
    ('public', 'advertisements'),
    ('public', 'homepage_sections'),
    ('public', 'homepage_featured_listings'),
    ('private', 'admin_users'),
    ('private', 'product_import_jobs'),
    ('private', 'product_import_errors'),
    ('private', 'catalog_versions'),
    ('private', 'checkout_intents'),
    ('private', 'checkout_intent_items'),
    ('private', 'analytics_events'),
    ('private', 'admin_audit_logs');
$$;

-- Fail closed before this migration commits, even if the security migration is never applied.
do $$
declare target record;
begin
  for target in select * from private.application_tables()
  loop
    execute format('alter table %I.%I enable row level security', target.schema_name, target.table_name);
    execute format('revoke all on table %I.%I from public, anon, authenticated', target.schema_name, target.table_name);
    execute format('create trigger touch_updated_at before update on %I.%I for each row execute function private.touch_updated_at()', target.schema_name, target.table_name);
  end loop;
end;
$$;

revoke all on function private.touch_updated_at(), private.validate_timezone(),
  private.validate_checkout_configuration(), private.validate_category_tree(),
  private.application_tables() from public, anon, authenticated;
commit;
