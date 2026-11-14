-- Baseline configuration only. Demo businesses are a separate, opt-in seed.
begin;
insert into public.cities(id, name, slug, state, country_code, timezone, is_default)
values ('10000000-0000-4000-8000-000000000001', 'Rawatbhata', 'rawatbhata', 'Rajasthan', 'IN', 'Asia/Kolkata', true)
on conflict (id) do nothing;
insert into public.platform_settings(singleton, brand_name)
values (true, 'Rawatbhata One')
on conflict (singleton) do nothing;
commit;
