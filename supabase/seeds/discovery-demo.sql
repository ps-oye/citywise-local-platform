-- OPT-IN fictional Phase 2 data. Run AFTER migration 20261112000400_discovery.sql.
-- Inserts/updates demonstration rows only; never deletes rows or writes private customer data.
begin;

insert into public.cities(id,name,slug,state,is_default)
values ('10000000-0000-4000-8000-000000000001','Rawatbhata','rawatbhata','Rajasthan',
  not exists (select 1 from public.cities where is_default))
on conflict (id) do nothing;
insert into public.platform_settings(singleton,brand_name) values (true,'Rawatbhata One') on conflict do nothing;

create temporary table discovery_demo_categories (
  slug text,name text,short_name text,kind public.listing_type,description text,asset text,
  facet_key text,facet_label text,facet_options jsonb,position integer
) on commit drop;
insert into discovery_demo_categories values
  ('food','Food & Restaurants','Food & drink','RESTAURANT','Good food, familiar flavours, and a table worth finding.','food','diet','Food preference','["Vegetarian","Vegetarian & non-vegetarian"]',1),
  ('sweets','Sweets & Bakeries','Sweets & bakes','RESTAURANT','A little sweetness for the everyday and the occasions in between.','sweets','speciality','Speciality','["Indian sweets","Bakery"]',2),
  ('grocery','Grocery & Daily Essentials','Groceries','COMMERCE','Your everyday essentials, a little closer to home.','grocery',null,null,null,3),
  ('hotels','Hotels & Stays','Stays','HOTEL','Unpack, unwind, and make yourself at home.','hotels','amenities','Amenities','["Wi-Fi","Parking","Breakfast"]',4),
  ('attractions','Attractions & Tourism','Places to explore','ATTRACTION','Slow afternoons, scenic corners, and something new around the bend.','attractions','experience','Experience','["Nature","Heritage","Walks"]',5),
  ('home-services','Home Services','Home services','SERVICE_PROVIDER','Find a helping hand for the things that keep your home running.','home-services','service','Service type','["Electrical","Plumbing","Cleaning","Appliance repair"]',6),
  ('fitness','Gyms & Fitness','Fitness','FITNESS','A fresh routine and space to move at your own pace.','fitness','training','Training style','["Strength","Yoga","Group classes","Personal training"]',7),
  ('beauty','Beauty & Wellness','Beauty & care','SERVICE_PROVIDER','Take a little time for yourself.','beauty',null,null,null,8),
  ('education','Education & Coaching','Learning','GENERAL_BUSINESS','Discover places to learn, practise, and grow.','education',null,null,null,9),
  ('shopping','Shopping & Retail','Shopping','COMMERCE','Thoughtful finds and the everyday things you love.','shopping',null,null,null,10),
  ('healthcare','Healthcare & Pharmacies','Health','GENERAL_BUSINESS','Explore local care and pharmacy listings.','healthcare',null,null,null,11),
  ('transport','Transportation & Travel','Travel','SERVICE_PROVIDER','Connections for your next journey.','transport',null,null,null,12),
  ('events','Events & Entertainment','Events','GENERAL_BUSINESS','Make room in your calendar for a little joy.','events',null,null,null,13),
  ('professional-services','Professional Services','Professionals','SERVICE_PROVIDER','Useful expertise for work and everyday life.','professional',null,null,null,14),
  ('local-essentials','Local Essentials & Public Information','Local essentials','INFORMATIONAL','A handy starting point for local information.','essentials',null,null,null,15);

insert into public.categories(id,name,short_name,slug,description,cover_image_path,display_order,is_demo)
select md5('rawatbhata-one-demo:category:'||slug)::uuid,name,short_name,slug,description,
  '/images/demo/'||asset||'-thumb.webp',position,true from discovery_demo_categories
on conflict (id) do update set name=excluded.name,short_name=excluded.short_name,
  description=excluded.description,cover_image_path=excluded.cover_image_path
where categories.is_demo;

insert into public.localities(id,city_id,name,slug,is_demo) values
  (md5('rawatbhata-one-demo:locality')::uuid,'10000000-0000-4000-8000-000000000001','Demo Market Quarter','demo-neighbourhood',true),
  (md5('rawatbhata-one-demo:locality:2')::uuid,'10000000-0000-4000-8000-000000000001','Demo Lakeside','demo-lakeside',true),
  (md5('rawatbhata-one-demo:locality:3')::uuid,'10000000-0000-4000-8000-000000000001','Demo Green Quarter','demo-green-quarter',true)
on conflict (id) do update set name=excluded.name where localities.is_demo;

create temporary table discovery_demo_items (
  category_slug text,slot integer,name text,summary text,asset text,price bigint,price_unit text,facet_value jsonb,
  listing_id uuid
) on commit drop;
insert into discovery_demo_items(category_slug,slot,name,summary,asset,price,price_unit,facet_value) values
  ('food',1,'Demo Gulmohar Kitchen','Comforting thalis, slow-cooked curries, and a warm welcome.','food',22000,'meal','"Vegetarian"'),
  ('food',2,'Demo The Courtyard Café','Coffee, conversations, and a sunny corner to settle into.','food-2',16000,'dish','"Vegetarian"'),
  ('food',3,'Demo Tandoor & Tales','Smoky tandoori favourites and generous shared plates.','food-3',28000,'dish','"Vegetarian & non-vegetarian"'),
  ('food',4,'Demo Little Millet','Fresh bowls and thoughtful, seasonal ingredients.','food-4',18000,'bowl','"Vegetarian"'),
  ('sweets',1,'Demo Mishri Sweet Studio','Traditional Indian sweets, made for little celebrations.','sweets',45000,'box','"Indian sweets"'),
  ('sweets',2,'Demo Sunday Bakehouse','Fresh bakes, buttery layers, and afternoon treats.','sweets-2',12000,'piece','"Bakery"'),
  ('sweets',3,'Demo Saffron Sweets','Familiar favourites with a festive touch.','sweets-3',36000,'box','"Indian sweets"'),
  ('sweets',4,'Demo Butter & Crumb','Small-batch cakes and something sweet for your tea.','sweets-2',15000,'piece','"Bakery"'),
  ('hotels',1,'Demo Aranya Stay','A quiet room and an easy change of pace.','hotels',180000,'night','["Wi-Fi","Parking","Breakfast"]'),
  ('hotels',2,'Demo The Neem House','Warm interiors and a restful place to pause.','hotels-2',240000,'night','["Wi-Fi","Breakfast"]'),
  ('hotels',3,'Demo Riverside Rooms','A simple, comfortable base for a relaxed weekend.','hotels-3',140000,'night','["Wi-Fi","Parking"]'),
  ('hotels',4,'Demo Weekend Guesthouse','Unhurried mornings and a welcoming place to stay.','hotels-2',120000,'night','"Wi-Fi"'),
  ('attractions',1,'Demo Lakeside Escape','A fictional scenic spot for a slow afternoon outdoors.','attractions',null,null,'"Nature"'),
  ('attractions',2,'Demo Stone & Stories','A fictional heritage walk through art and architecture.','attractions-2',null,null,'"Heritage"'),
  ('attractions',3,'Demo The Green Trail','A fictional walking trail with plenty of room to breathe.','attractions-3',null,null,'"Walks"'),
  ('attractions',4,'Demo Sunset Corner','A fictional viewpoint for a little evening inspiration.','town-hero',null,null,'"Nature"'),
  ('home-services',1,'Demo BrightWire Care','Electrical repairs and practical help around the home.','home-services',35000,'visit','"Electrical"'),
  ('home-services',2,'Demo HandyHome Plumbing','A helping hand for leaks, fittings, and everyday repairs.','home-services',30000,'visit','"Plumbing"'),
  ('home-services',3,'Demo FreshNest Cleaning','Thoughtful cleaning support for a fresher-feeling home.','home-services',60000,'visit','"Cleaning"'),
  ('home-services',4,'Demo CoolAir Assist','Care for cooling and everyday home appliances.','home-services',45000,'visit','"Appliance repair"'),
  ('fitness',1,'Demo Momentum Studio','A welcoming space to build a stronger routine.','fitness',120000,'month','"Strength"'),
  ('fitness',2,'Demo Form & Flow','Mindful movement and an unhurried approach to fitness.','fitness',90000,'month','"Yoga"'),
  ('fitness',3,'Demo Sunrise Fitness','Find your rhythm with energising group sessions.','fitness',100000,'month','"Group classes"'),
  ('fitness',4,'Demo Ironwood Gym','Focused support for your personal fitness goals.','fitness',160000,'month','"Personal training"'),
  ('beauty',1,'Demo The Olive Room','A calm corner for grooming, care, and a little reset.','beauty',50000,'session',null),
  ('education',1,'Demo Little Oak Learning','A fictional learning centre for curious minds.','education',null,null,null),
  ('grocery',1,'Demo Everyday Basket','Pantry staples and everyday essentials in one place.','grocery',8000,'pack',null),
  ('shopping',1,'Demo The Corner Collective','Small discoveries for your wardrobe and your home.','shopping',35000,'item',null),
  ('healthcare',1,'Demo Care & Wellness','A fictional care listing for exploring the platform.','healthcare',null,null,null),
  ('transport',1,'Demo EasyTown Travel','A fictional travel service for planning local journeys.','transport',null,null,null),
  ('events',1,'Demo The Gathering Place','A fictional space for events and shared experiences.','events',null,null,null),
  ('professional-services',1,'Demo Paper & Plans','A fictional professional service for everyday support.','professional',null,null,null),
  ('local-essentials',1,'Demo Town Information Desk','A fictional starting point for useful local information.','essentials',null,null,null);
update discovery_demo_items set listing_id = case when slot=1
  then md5('rawatbhata-one-demo:listing:'||category_slug)::uuid
  else md5('rawatbhata-one-demo:listing:'||category_slug||':'||slot)::uuid end;

insert into public.listings(id,city_id,locality_id,name,slug,listing_type,short_description,description,
  publication_status,enabled,is_demo,sponsored,demo_image_path)
select d.listing_id,'10000000-0000-4000-8000-000000000001',
  case when d.slot%3=2 then md5('rawatbhata-one-demo:locality:2')::uuid
       when d.slot%3=0 then md5('rawatbhata-one-demo:locality:3')::uuid
       else md5('rawatbhata-one-demo:locality')::uuid end,
  d.name,'demo-'||d.category_slug||case when d.slot=1 then '' else '-'||d.slot end,c.kind,d.summary,
  d.summary||' This is a fictional sample listing. Images and prices are illustrative. No real business contact, address or map location is provided.',
  'published',true,true,(d.category_slug in ('food','hotels') and d.slot=1),'/images/demo/'||d.asset||'.webp'
from discovery_demo_items d join discovery_demo_categories c on c.slug=d.category_slug
on conflict (id) do update set name=excluded.name,locality_id=excluded.locality_id,
  short_description=excluded.short_description,description=excluded.description,
  demo_image_path=excluded.demo_image_path,sponsored=excluded.sponsored
where listings.is_demo;

insert into public.listing_categories(listing_id,category_id,is_primary)
select d.listing_id,md5('rawatbhata-one-demo:category:'||d.category_slug)::uuid,true
from discovery_demo_items d join public.listings l on l.id=d.listing_id and l.is_demo on conflict do nothing;

insert into public.listing_actions(listing_id,checkout_enabled,directions_enabled)
select d.listing_id,false,false from discovery_demo_items d
join public.listings l on l.id=d.listing_id and l.is_demo
on conflict (listing_id) do update set checkout_enabled=false,directions_enabled=false
where exists (select 1 from public.listings l where l.id=excluded.listing_id and l.is_demo);

insert into public.category_attributes(id,category_id,attribute_key,label,value_type,options,filterable)
select md5('rawatbhata-one-demo:attribute:'||c.slug)::uuid,
  md5('rawatbhata-one-demo:category:'||c.slug)::uuid,c.facet_key,c.facet_label,'options',c.facet_options,true
from discovery_demo_categories c join public.categories actual on actual.id=md5('rawatbhata-one-demo:category:'||c.slug)::uuid
where c.facet_key is not null and actual.is_demo on conflict (id) do nothing;
insert into public.listing_attributes(listing_id,attribute_id,value)
select d.listing_id,md5('rawatbhata-one-demo:attribute:'||d.category_slug)::uuid,d.facet_value
from discovery_demo_items d join public.listings l on l.id=d.listing_id and l.is_demo
where d.facet_value is not null
on conflict (listing_id,attribute_id) do update set value=excluded.value;

insert into public.products(id,merchant_id,sku,name,description,price_minor,unit,dietary_type)
select case when d.slot=1 then md5('rawatbhata-one-demo:product:'||d.category_slug)::uuid
  else md5('rawatbhata-one-demo:product:'||d.category_slug||':'||d.slot)::uuid end,
  d.listing_id,'DEMO-001',
  case when d.category_slug='sweets' and d.slot=1 then 'Sample Kaju Katli'
    when d.category_slug='food' then (array['Sample Rajasthani Thali','Sample Masala Dosa','Sample Tandoori Platter','Sample Millet Bowl'])[d.slot]
    when d.category_slug='sweets' then 'Sample sweet treat'
    when d.category_slug='grocery' then 'Sample daily essentials pack' else 'Sample retail item' end,
  'Fictional demonstration product. Not available to order.',d.price,d.price_unit,
  case when c.kind='RESTAURANT' then 'vegetarian' else 'not_applicable' end
from discovery_demo_items d join discovery_demo_categories c on c.slug=d.category_slug
join public.listings l on l.id=d.listing_id and l.is_demo
where c.kind in ('COMMERCE','RESTAURANT')
on conflict (merchant_id,sku) do update set name=excluded.name,price_minor=excluded.price_minor,unit=excluded.unit
where exists (select 1 from public.listings l where l.id=excluded.merchant_id and l.is_demo);

insert into public.offerings(id,listing_id,kind,name,description,indicative_price_minor,price_unit,details)
select case when d.slot=1 then md5('rawatbhata-one-demo:offering:'||d.category_slug)::uuid
  else md5('rawatbhata-one-demo:offering:'||d.category_slug||':'||d.slot)::uuid end,
  d.listing_id,case c.kind when 'HOTEL' then 'room' when 'FITNESS' then 'membership'
    when 'ATTRACTION' then 'visiting_info' else 'service' end,
  case c.kind when 'HOTEL' then 'Sample room' when 'FITNESS' then 'Sample membership'
    when 'ATTRACTION' then 'Sample visiting information' else 'Sample service' end,
  d.summary,d.price,d.price_unit,'{"sample":true}'::jsonb
from discovery_demo_items d join discovery_demo_categories c on c.slug=d.category_slug
join public.listings l on l.id=d.listing_id and l.is_demo
where c.kind in ('HOTEL','FITNESS','ATTRACTION','SERVICE_PROVIDER')
on conflict (id) do update set name=excluded.name,description=excluded.description,
  indicative_price_minor=excluded.indicative_price_minor,price_unit=excluded.price_unit;

insert into public.listing_service_areas(listing_id,locality_id,city_id)
select d.listing_id,p.id,p.city_id from discovery_demo_items d
join public.listings l on l.id=d.listing_id and l.is_demo
join public.localities p on p.city_id=l.city_id and p.is_demo
where d.category_slug='home-services' on conflict do nothing;

insert into public.homepage_sections(id,city_id,category_id,title,display_order)
select md5('rawatbhata-one-demo:section:'||c.slug)::uuid,'10000000-0000-4000-8000-000000000001',
  md5('rawatbhata-one-demo:category:'||c.slug)::uuid,c.name,
  case c.slug when 'food' then 1 when 'sweets' then 2 when 'hotels' then 3
    when 'attractions' then 4 when 'home-services' then 5 when 'fitness' then 6 else c.position+6 end
from discovery_demo_categories c
on conflict (city_id,category_id) do update set title=excluded.title,display_order=excluded.display_order
where exists (select 1 from public.categories c where c.id=excluded.category_id and c.is_demo);
insert into public.homepage_featured_listings(id,section_id,listing_id,city_id,category_id,rank)
select case when d.slot=1 then md5('rawatbhata-one-demo:feature:'||d.category_slug)::uuid
  else md5('rawatbhata-one-demo:feature:'||d.category_slug||':'||d.slot)::uuid end,
  md5('rawatbhata-one-demo:section:'||d.category_slug)::uuid,d.listing_id,
  '10000000-0000-4000-8000-000000000001',md5('rawatbhata-one-demo:category:'||d.category_slug)::uuid,d.slot
from discovery_demo_items d join public.listings l on l.id=d.listing_id and l.is_demo
on conflict (section_id,listing_id) do update set rank=excluded.rank;

insert into public.advertisements(id,city_id,title,subtitle,cta_text,destination_url,alt_text,
  demo_image_path,demo_mobile_image_path,starts_at,ends_at,priority,enabled,is_demo,sponsored)
values
  (md5('rawatbhata-one-demo:advertisement:1')::uuid,'10000000-0000-4000-8000-000000000001',
    'Good food. Great company.','Find your next favourite table, just around the corner.','Explore food & drink','/rawatbhata/food',
    'Illustrative Indian food photography for a fictional promotion','/images/demo/food.webp','/images/demo/food.webp',
    now()-interval '1 day',now()+interval '1 year',1,true,true,true),
  (md5('rawatbhata-one-demo:advertisement:2')::uuid,'10000000-0000-4000-8000-000000000001',
    'A little escape, closer to home.','Take the scenic route to your next local discovery.','Explore nearby places','/rawatbhata/attractions',
    'Illustrative Rajasthan landscape, not an actual Rawatbhata attraction','/images/demo/town-hero.webp','/images/demo/attractions.webp',
    now()-interval '1 day',now()+interval '1 year',2,true,true,true),
  (md5('rawatbhata-one-demo:advertisement:3')::uuid,'10000000-0000-4000-8000-000000000001',
    'Check in. Slow down.','Discover welcoming places for your next unhurried weekend.','Discover stays','/rawatbhata/hotels',
    'Illustrative guest room for a fictional accommodation promotion','/images/demo/hotels.webp','/images/demo/hotels.webp',
    now()-interval '1 day',now()+interval '1 year',3,true,true,true)
on conflict (id) do update set title=excluded.title,subtitle=excluded.subtitle,cta_text=excluded.cta_text,
  destination_url=excluded.destination_url,alt_text=excluded.alt_text,demo_image_path=excluded.demo_image_path,
  demo_mobile_image_path=excluded.demo_mobile_image_path,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  priority=excluded.priority,enabled=true where advertisements.is_demo;

-- One sample operational closure demonstrates muted-but-accessible cards without claiming live hours.
insert into public.temporary_status_overrides(id,listing_id,status,reason)
select md5('rawatbhata-one-demo:closure')::uuid,d.listing_id,'closed','Demonstration closure, not a real business status'
from discovery_demo_items d join public.listings l on l.id=d.listing_id and l.is_demo
where d.category_slug='fitness' and d.slot=4 on conflict do nothing;

commit;

