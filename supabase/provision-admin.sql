-- Manual operator script, NOT a migration or seed. Run only against the intended project.
-- Replace the all-zero UUID with the existing Auth user's UID. Never put a password here.
begin;
do $$
declare target uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not exists(select 1 from auth.users where id=target) then raise exception 'Create this Auth user in Supabase first'; end if;
  if exists(select 1 from private.admin_users where user_id<>target) then raise exception 'Another administrator is already configured'; end if;
  insert into private.admin_users(user_id,active) values(target,true)
    on conflict(singleton) do update set active=true where private.admin_users.user_id=excluded.user_id;
end;
$$;
commit;
