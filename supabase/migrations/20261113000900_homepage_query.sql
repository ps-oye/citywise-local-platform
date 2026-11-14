-- Phase 6 performance: bound ranked public identities before enriching display cards.
-- Same RPC contract and invoker/RLS authorization; no data, grants or policies are changed.
begin;
create or replace function public.discovery_home(
  p_city_id uuid,p_locality_id uuid default null,p_offset integer default 0,p_limit integer default 4
) returns jsonb
language plpgsql stable security invoker set search_path='' set jit=off as $$
begin
  if p_city_id is null or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 6 then
    raise exception 'Invalid section pagination' using errcode='22023';
  end if;
  return(with eligible_sections as materialized(
    select s.id,s.category_id,s.display_order,coalesce(s.title,c.name) as title,c.description,c.slug,c.short_name
    from public.homepage_sections s join public.categories c on c.id=s.category_id
    where s.city_id=p_city_id and s.enabled and public.is_city_public(s.city_id) and public.is_category_public(c.id)
  ), page as materialized(select * from eligible_sections order by display_order,id limit p_limit offset p_offset),
  chosen as materialized(
    select s.id as section_id,f.listing_id,f.rank from page s cross join lateral(
      select f.listing_id,f.rank from public.homepage_featured_listings f join public.listings l on l.id=f.listing_id
      where f.section_id=s.id and f.enabled and l.city_id=p_city_id and public.is_listing_public(l.id)
        and (p_locality_id is null or l.locality_id=p_locality_id or exists(
          select 1 from public.listing_service_areas a join public.localities area on area.id=a.locality_id and area.enabled
          where a.listing_id=l.id and a.locality_id=p_locality_id))
      order by f.rank,l.id limit 4
    ) f
  ), cards as materialized(
    select card.* from(select distinct listing_id from chosen) targets cross join lateral(
      -- OFFSET 0 retains a parameterized point lookup through the security-barrier view.
      select c.* from public.discovery_listing_cards c where c.id=targets.listing_id offset 0
    ) card
  )
  select jsonb_build_object('sections',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'category_id',s.category_id,'title',s.title,'description',s.description,'slug',s.slug,'short_name',s.short_name,
    'items',coalesce((select jsonb_agg((to_jsonb(c)-'description'-'search_text'-'category_ids'-'service_locality_ids')||jsonb_build_object('rank',f.rank) order by f.rank,c.id)
      from chosen f join cards c on c.id=f.listing_id where f.section_id=s.id),'[]'::jsonb)
  ) order by s.display_order,s.id) from page s),'[]'::jsonb),
    'has_more',(select count(*) from eligible_sections)>p_offset+p_limit,'next_offset',p_offset+p_limit));
end;
$$;
notify pgrst,'reload schema';
commit;
