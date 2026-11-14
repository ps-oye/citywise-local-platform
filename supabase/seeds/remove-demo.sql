-- REVIEW AND RUN MANUALLY ONLY against the intended development database.
-- No CASCADE/TRUNCATE: references from real operational records deliberately abort the transaction.
begin;
delete from public.advertisements where is_demo;
delete from public.homepage_sections
  where category_id in (select id from public.categories where is_demo);
delete from public.listings where is_demo;
delete from public.localities where is_demo;
-- Child categories are deleted first; non-demo references prevent accidental deletion.
delete from public.categories where is_demo and parent_id is not null;
delete from public.categories where is_demo;
commit;
