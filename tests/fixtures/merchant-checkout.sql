-- ISOLATED TEST DATABASE ONLY. Reserved fictional NANP 555-01xx contacts never enter hosted demo data.
insert into public.cities(id,name,slug,state) values('70000000-0000-4000-8000-000000000090','QA Town','qa-town','Test');
insert into public.listings(id,city_id,name,slug,listing_type,description,publication_status,whatsapp_number,phone_number,contact_verified_at)
values('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000090','QA Test Kitchen','qa-test-kitchen','RESTAURANT','An isolated checkout test fixture. Not a real business.','published','+12025550123','+12025550123',now()),
('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000090','QA Second Kitchen','qa-second-kitchen','RESTAURANT','An isolated second cart fixture.','published','+12025550124',null,now());
-- Null Island is a test destination, never a hosted demo business address.
update public.listings set latitude=0,longitude=0 where id='70000000-0000-4000-8000-000000000001';
insert into public.listing_categories(listing_id,category_id,is_primary)
select l.id,c.id,true from public.listings l cross join public.categories c where l.city_id='70000000-0000-4000-8000-000000000090' and c.slug='food';
insert into public.listing_actions(listing_id,checkout_enabled,pickup_available,delivery_available)
values('70000000-0000-4000-8000-000000000001',true,true,true),('70000000-0000-4000-8000-000000000002',true,true,false);
insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day)
select l.id,d,'00:00','00:00',true from public.listings l cross join generate_series(0,6) d where l.city_id='70000000-0000-4000-8000-000000000090';
insert into public.product_categories(id,merchant_id,name,slug) values
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Main plates','main-plates'),
('72000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','Small plates','small-plates');
insert into public.products(id,merchant_id,product_category_id,sku,name,price_minor,original_price_minor,unit,dietary_type,available,display_order)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'70000000-0000-4000-8000-000000000001',
 case when n<=9 then '72000000-0000-4000-8000-000000000001'::uuid else '72000000-0000-4000-8000-000000000002'::uuid end,
 'QA-'||n,case n when 1 then 'QA Vegetable Thali' when 2 then 'QA Egg Toast' when 3 then 'QA Chicken Plate' when 4 then 'QA Sold-out Snack' else 'QA Plate '||n end,
 n*1000,case when n=1 then 1500 else null end,'plate',case n when 2 then 'egg' when 3 then 'non_vegetarian' else 'vegetarian' end,n<>4,n from generate_series(1,17) n;
insert into public.products(id,merchant_id,sku,name,price_minor,unit)
values('71000000-0000-4000-8000-000000000090','70000000-0000-4000-8000-000000000002','QA-OTHER','QA Other Merchant Item',5000,'plate');
