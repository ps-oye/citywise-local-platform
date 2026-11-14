-- OPT-IN Phase 3 fictional catalog enrichment. Apply after the discovery seed and migration 5.
-- Only demo merchants are changed. No rows, real contacts or private enquiries are created/deleted.
begin;
update public.products p set demo_image_path=l.demo_image_path
  from public.listings l where l.id=p.merchant_id and l.is_demo;

create temporary table merchant_demo_products (
  category_slug text,sku text,name text,description text,price bigint,unit text,dietary text,asset text,group_name text,available boolean
) on commit drop;
insert into merchant_demo_products values
('food','P3-F01','Sample Paneer Tikka','A fictional grilled paneer starter with a gentle spice blend.',18000,'plate','vegetarian','food-3','House favourites',true),
('food','P3-F02','Sample Dal Tadka','A fictional comforting lentil dish, served as a sample portion.',14000,'bowl','vegetarian','food','House favourites',true),
('food','P3-F03','Sample Seasonal Sabzi','A fictional seasonal vegetable preparation.',12000,'bowl','vegetarian','food-2','House favourites',true),
('food','P3-F04','Sample Jeera Rice','A fictional fragrant rice dish.',10000,'plate','vegetarian','food-4','House favourites',true),
('food','P3-F05','Sample Tandoori Roti','A fictional freshly prepared flatbread.',2500,'piece','vegetarian','food','House favourites',true),
('food','P3-F06','Sample Masala Dosa','A fictional crisp dosa with a comforting potato filling.',13000,'plate','vegetarian','food-2','House favourites',true),
('food','P3-F07','Sample Vegetable Pulao','A fictional rice and vegetable combination.',15000,'plate','vegetarian','food-4','House favourites',true),
('food','P3-F08','Sample Egg Toast','A fictional egg breakfast plate. Contains egg.',9000,'plate','egg','food-2','House favourites',true),
('food','P3-F09','Sample Chicken Curry','A fictional non-vegetarian curry for demonstrating dietary filters.',26000,'bowl','non_vegetarian','food-3','House favourites',true),
('food','P3-F10','Sample Family Platter','A fictional shared vegetarian meal. Currently unavailable.',48000,'platter','vegetarian','food','House favourites',false),
('food','P3-F11','Sample Masala Chai','A fictional cup of spiced tea.',4000,'cup','vegetarian','food-2','Drinks & extras',true),
('food','P3-F12','Sample Fresh Lime','A fictional refreshing lime drink.',6000,'glass','vegetarian','food-2','Drinks & extras',true),
('food','P3-F13','Sample Sweet Lassi','A fictional traditional yoghurt drink.',8000,'glass','vegetarian','food-4','Drinks & extras',true),
('food','P3-F14','Sample Gulab Jamun','A fictional sweet ending to your meal.',7000,'pair','vegetarian','sweets','Drinks & extras',true),
('food','P3-F15','Sample Garden Salad','A fictional side of crisp vegetables.',9000,'bowl','vegetarian','food-4','Drinks & extras',true),
('sweets','P3-S01','Sample Motichoor Laddoo','A fictional festive sweet box.',32000,'500 g box','vegetarian','sweets','Sweet boxes',true),
('sweets','P3-S02','Sample Besan Barfi','A fictional traditional sweet box.',28000,'500 g box','vegetarian','sweets-3','Sweet boxes',true),
('sweets','P3-S03','Sample Rasgulla','A fictional soft sweet in syrup.',22000,'box','vegetarian','sweets','Sweet boxes',true),
('sweets','P3-S04','Sample Celebration Box','A fictional assortment for sharing.',65000,'box','vegetarian','sweets-3','Sweet boxes',true),
('sweets','P3-S05','Sample Butter Croissant','A fictional buttery bakery treat.',12000,'piece','vegetarian','sweets-2','Bakery treats',true),
('sweets','P3-S06','Sample Chocolate Slice','A fictional slice of chocolate cake. Contains egg.',16000,'slice','egg','sweets-2','Bakery treats',true),
('sweets','P3-S07','Sample Celebration Cake','A fictional eggless cake. Currently unavailable.',85000,'500 g cake','vegetarian','sweets-2','Bakery treats',false),
('sweets','P3-S08','Sample Tea-time Cookies','A fictional box of crisp cookies.',18000,'box','vegetarian','sweets-2','Bakery treats',true),
('grocery','P3-G01','Sample Pantry Rice','An illustrative grocery product.',16000,'1 kg pack','not_applicable','grocery','Everyday essentials',true),
('grocery','P3-G02','Sample Wheat Flour','An illustrative pantry staple.',22000,'2 kg pack','not_applicable','grocery','Everyday essentials',true),
('grocery','P3-G03','Sample Lentils','An illustrative grocery product.',14000,'500 g pack','not_applicable','grocery','Everyday essentials',true),
('grocery','P3-G04','Sample Kitchen Staples','An illustrative essentials pack.',36000,'pack','not_applicable','grocery','Everyday essentials',false),
('shopping','P3-R01','Sample Canvas Tote','An illustrative reusable shopping bag.',35000,'item','not_applicable','shopping','Thoughtful finds',true),
('shopping','P3-R02','Sample Cotton Scarf','An illustrative retail product.',42000,'item','not_applicable','shopping','Thoughtful finds',true),
('shopping','P3-R03','Sample Desk Journal','An illustrative notebook for everyday plans.',24000,'item','not_applicable','shopping','Thoughtful finds',true),
('shopping','P3-R04','Sample Gift Set','An illustrative collection of small gifts.',68000,'set','not_applicable','shopping','Thoughtful finds',true);

insert into public.product_categories(id,merchant_id,name,slug,display_order)
select distinct md5('r1:p3:product-category:'||l.id::text||':'||d.group_name)::uuid,l.id,d.group_name,
  lower(regexp_replace(d.group_name,'[^A-Za-z0-9]+','-','g')),case when d.group_name in ('Drinks & extras','Bakery treats') then 2 else 1 end
from merchant_demo_products d join public.categories c on c.slug=d.category_slug
join public.listing_categories lc on lc.category_id=c.id join public.listings l on l.id=lc.listing_id and l.is_demo
on conflict(id) do nothing;
insert into public.products(id,merchant_id,product_category_id,sku,name,description,price_minor,original_price_minor,unit,dietary_type,demo_image_path,available,display_order)
select md5('r1:p3:product:'||l.id::text||':'||d.sku)::uuid,l.id,md5('r1:p3:product-category:'||l.id::text||':'||d.group_name)::uuid,
  d.sku,d.name,d.description,d.price,case when d.sku in ('P3-F01','P3-S04') then d.price+2000 else null end,d.unit,d.dietary,
  '/images/demo/'||d.asset||'.webp',d.available,right(d.sku,2)::integer
from merchant_demo_products d join public.categories c on c.slug=d.category_slug
join public.listing_categories lc on lc.category_id=c.id join public.listings l on l.id=lc.listing_id and l.is_demo
on conflict(merchant_id,sku) do update set product_category_id=excluded.product_category_id,name=excluded.name,
  description=excluded.description,price_minor=excluded.price_minor,original_price_minor=excluded.original_price_minor,
  unit=excluded.unit,dietary_type=excluded.dietary_type,demo_image_path=excluded.demo_image_path,available=excluded.available;

insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day)
select l.id,d,
  case when l.listing_type='HOTEL' then '00:00'::time when l.listing_type='FITNESS' then '06:00'::time else '09:00'::time end,
  case when l.listing_type='HOTEL' then '00:00'::time when l.listing_type='FITNESS' then '11:00'::time
    when l.listing_type='RESTAURANT' then '13:00'::time else '18:00'::time end,l.listing_type='HOTEL'
from public.listings l cross join generate_series(0,6) d where l.is_demo and (d<>0 or l.listing_type='HOTEL')
on conflict(listing_id,weekday,opens_at) do update set closes_at=excluded.closes_at,ends_next_day=excluded.ends_next_day;
insert into public.business_hours(listing_id,weekday,opens_at,closes_at)
select l.id,d,case when l.listing_type='FITNESS' then '16:00'::time else '17:00'::time end,'22:00'::time
from public.listings l cross join generate_series(1,6) d where l.is_demo and l.listing_type in ('RESTAURANT','FITNESS')
on conflict(listing_id,weekday,opens_at) do nothing;
insert into public.special_hours(listing_id,on_date,closed,label)
select l.id,(now() at time zone l.timezone)::date+3,true,'Sample schedule exception'
from public.listings l where l.is_demo and l.slug='demo-food'
on conflict(listing_id,on_date) do nothing;
commit;
