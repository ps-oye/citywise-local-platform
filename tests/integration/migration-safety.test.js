import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSystemDatabase, createTestDatabase, applyMigration, asRole,
  CITY_ID, ADMIN_ID, OTHER_ID,
} from '../helpers/database.js';

const CORE = '20261112000100_core.sql';
const SECURITY = '20261112000200_security.sql';
const STORAGE = '20261112000300_storage.sql';
const id = (n) => '50000000-0000-4000-8000-' + String(n).padStart(12, '0');
const forbidden = (error) => error.code === '42501';
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

for (const legacyGrants of [false, true]) {
  test(`core commits with RLS enabled and no client grants (automatic grants: ${legacyGrants})`, async () => {
    const db = await createSystemDatabase({ legacyGrants });
    try {
      await applyMigration(db, CORE);
      const tables = (await db.query(`
        select a.schema_name, a.table_name, c.relrowsecurity,
          has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') anon_access,
          has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') authenticated_access
        from private.application_tables() a
        join pg_namespace n on n.nspname = a.schema_name
        join pg_class c on c.relnamespace = n.oid and c.relname = a.table_name
      `)).rows;
      assert.equal(tables.length, 30);
      assert.ok(tables.every((row) => row.relrowsecurity && !row.anon_access && !row.authenticated_access));
      await db.query("insert into public.cities(id,name,slug,state) values ($1,'Fixture city','fixture-city','Test')", [CITY_ID]);
      for (const [role, uid] of [['anon', null], ['authenticated', OTHER_ID]]) {
        await assert.rejects(asRole(db, role, uid, (tx) => tx.query('select * from public.cities')), forbidden);
        await assert.rejects(asRole(db, role, uid, (tx) => tx.query("insert into public.categories(name,slug) values ('Injected','injected')")), forbidden);
      }
      // Simulate stopping after core, then later resuming the security migration.
      await applyMigration(db, SECURITY);
      assert.equal((await asRole(db, 'anon', null, (tx) => tx.query('select id from public.cities'))).rows.length, 1);
      await assert.rejects(asRole(db, 'authenticated', OTHER_ID, (tx) => tx.query("insert into public.categories(name,slug) values ('Injected','injected')")), forbidden);
    } finally { await db.close(); }
  });
}

test('application migrations preserve unrelated table grants, policies, triggers and existing RPC permissions', async () => {
  let before;
  const snapshot = async (db) => (await db.query(`
    select n.nspname, c.relname, c.relrowsecurity, c.relacl::text,
      (select count(*)::int from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) trigger_count,
      (select count(*)::int from pg_policy p where p.polrelid=c.oid) policy_count
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relname='unrelated_records'
    order by n.nspname
  `)).rows;
  const db = await createTestDatabase({ beforeMigrations: async (system) => {
    await system.exec(`
      create schema private;
      grant usage on schema private to anon, authenticated;
      create table public.unrelated_records (id integer primary key, note text);
      create table private.unrelated_records (id integer primary key, note text);
      grant select on public.unrelated_records, private.unrelated_records to anon;
      grant select, update on public.unrelated_records, private.unrelated_records to authenticated;
      alter table private.unrelated_records enable row level security;
      create policy existing_read on private.unrelated_records for select to anon, authenticated using (true);
      create policy existing_update on private.unrelated_records for update to authenticated
        using (auth.uid()='${OTHER_ID}'::uuid) with check (auth.uid()='${OTHER_ID}'::uuid);
      insert into public.unrelated_records values (1,'public original');
      insert into private.unrelated_records values (1,'private original');
      create function public.existing_rpc() returns integer language sql as $$ select 7 $$;
      create function private.existing_rpc() returns integer language sql as $$ select 8 $$;
      grant execute on function public.existing_rpc(), private.existing_rpc() to anon, authenticated;
    `);
    before = await snapshot(system);
  } });
  try {
    assert.deepEqual(await snapshot(db), before);
    const rpc = await asRole(db, 'anon', null, (tx) => tx.query('select public.existing_rpc() public_value, private.existing_rpc() private_value'));
    assert.deepEqual(rpc.rows, [{ public_value: 7, private_value: 8 }]);
    for (const schema of ['public', 'private']) {
      const changed = await asRole(db, 'authenticated', OTHER_ID, (tx) =>
        tx.query(`update ${schema}.unrelated_records set note='ordinary user update' where id=1 returning note`));
      assert.equal(changed.rows.length, 1);
    }
    const denied = await asRole(db, 'authenticated', ADMIN_ID, (tx) =>
      tx.query("update private.unrelated_records set note='unexpected admin access' where id=1 returning id"));
    assert.equal(denied.rows.length, 0);
  } finally { await db.close(); }
});

test('future application-schema tables and functions receive no client grants, including implicit PUBLIC EXECUTE', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec(`
      create function public.future_rpc() returns integer language sql security definer set search_path='' as $$ select 42 $$;
      create function private.future_rpc() returns integer language sql security definer set search_path='' as $$ select 43 $$;
      create table public.future_table(id integer);
      create table private.future_table(id integer);
    `);
    for (const role of ['anon', 'authenticated']) {
      for (const schema of ['public', 'private']) {
        const result = await db.query(`
          select has_function_privilege($1,$2,'EXECUTE') can_execute,
            has_table_privilege($1,$3,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') table_access
        `, [role, `${schema}.future_rpc()`, `${schema}.future_table`]);
        assert.deepEqual(result.rows, [{ can_execute: false, table_access: false }]);
      }
      await assert.rejects(asRole(db, role, role === 'anon' ? null : OTHER_ID, (tx) => tx.query('select public.future_rpc()')), forbidden);
    }
    await assert.rejects(asRole(db, 'authenticated', ADMIN_ID, (tx) => tx.query('select * from private.application_tables()')), forbidden);
  } finally { await db.close(); }
});

test('a populated schema without client USAGE is rejected without widening existing access', async () => {
  const db = await createSystemDatabase();
  try {
    await db.exec(`
      create schema private;
      create function private.existing_secret() returns integer language sql as $$ select 7 $$;
    `);
    await assert.rejects(applyMigration(db, CORE), /Refusing to broaden existing access/);
    assert.equal((await db.query("select has_schema_privilege('authenticated','private','USAGE') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select to_regclass('public.cities') created_table")).rows[0].created_table, null);
    assert.equal((await db.query('select private.existing_secret() value')).rows[0].value, 7);
    await assert.rejects(asRole(db, 'authenticated', OTHER_ID, (tx) => tx.query('select private.existing_secret()')), forbidden);
  } finally { await db.close(); }
});

test('restrictive storage guards withstand an existing allow-all policy and preserve unrelated buckets', async () => {
  const db = await createTestDatabase({ beforeMigrations: async (system) => {
    await system.exec(`
      create policy legacy_allow_all on storage.objects for all to anon, authenticated using (true) with check (true);
      insert into storage.buckets(id,name,public) values ('unrelated-uploads','unrelated-uploads',true);
    `);
  } });
  try {
    await db.query("insert into public.categories(id,name,slug) values ($1,'Fixture category','fixture-category')", [id(1)]);
    for (const [listing, slug, status] of [[id(2), 'visible-fixture', 'published'], [id(3), 'hidden-fixture', 'draft']]) {
      await db.query('insert into public.listings(id,city_id,name,slug,publication_status) values ($1,$2,$3,$4,$5)', [listing, CITY_ID, slug, slug, status]);
      await db.query('insert into public.listing_categories(listing_id,category_id) values ($1,$2)', [listing, id(1)]);
      await db.query("insert into public.listing_media(listing_id,object_path,alt_text) values ($1,$2,'Fixture image')", [listing, listing + '/image.webp']);
      await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [listing + '/image.webp', ADMIN_ID]);
    }
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [id(2) + '/unreferenced.webp', ADMIN_ID]);
    for (const [advertisement, enabled] of [[id(4), true], [id(5), false]]) {
      await db.query("insert into public.advertisements(id,city_id,title,alt_text,enabled,desktop_image_path) values ($1,$2,'Fixture ad','Fixture banner',$3,$4)", [advertisement, CITY_ID, enabled, advertisement + '/banner.webp']);
      await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('promotional-media',$1,$2)", [advertisement + '/banner.webp', ADMIN_ID]);
    }
    for (const [role, uid] of [['anon', null], ['authenticated', OTHER_ID]]) {
      const visible = await asRole(db, role, uid, (tx) => tx.query('select name from storage.objects order by name'));
      assert.deepEqual(visible.rows.map((row) => row.name), [id(2) + '/image.webp', id(4) + '/banner.webp']);
      for (const [bucket, parent] of [['listing-media', id(2)], ['promotional-media', id(4)]]) {
        await assert.rejects(asRole(db, role, uid, (tx) => tx.query(
          'insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', [bucket, parent + '/outsider.webp', uid],
        )), forbidden);
      }
      const changed = await asRole(db, role, uid, (tx) => tx.query("update storage.objects set metadata='{}' returning id"));
      assert.equal(changed.rows.length, 0);
      const deleted = await asRole(db, role, uid, (tx) => tx.query('delete from storage.objects returning id'));
      assert.equal(deleted.rows.length, 0);
      // Operations in an unrelated bucket must continue to obey its existing policy.
      const outsideName = role + '-unrelated.txt';
      await asRole(db, role, uid, (tx) => tx.query("insert into storage.objects(bucket_id,name) values ('unrelated-uploads',$1)", [outsideName]));
      await assert.rejects(asRole(db, role, uid, (tx) => tx.query(
        "update storage.objects set bucket_id='listing-media',name=$1 where bucket_id='unrelated-uploads' and name=$2",
        [id(2) + '/moved.webp', outsideName],
      )), forbidden);
      const outsideUpdate = await asRole(db, role, uid, (tx) => tx.query(
        "update storage.objects set metadata='{}' where bucket_id='unrelated-uploads' and name=$1 returning id", [outsideName],
      ));
      assert.equal(outsideUpdate.rows.length, 1);
      assert.equal((await asRole(db, role, uid, (tx) => tx.query(
        "delete from storage.objects where bucket_id='unrelated-uploads' and name=$1 returning id", [outsideName],
      ))).rows.length, 1);
    }
    await assert.rejects(asRole(db, 'authenticated', ADMIN_ID, (tx) => tx.query(
      "insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [id(2) + '/unsafe.svg', ADMIN_ID],
    )), forbidden);
    await assert.rejects(asRole(db, 'authenticated', ADMIN_ID, (tx) => tx.query(
      "insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [id(2) + '/wrong-owner.webp', OTHER_ID],
    )), forbidden);
  } finally { await db.close(); }
});

test('the active replacement admin can manage platform media with an old or missing owner', async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into public.listings(id,city_id,name,slug) values ($1,$2,'Fixture','fixture')", [id(10), CITY_ID]);
    await db.query("insert into public.advertisements(id,city_id,title,alt_text) values ($1,$2,'Fixture','Fixture')", [id(11), CITY_ID]);
    const paths = [];
    for (const [bucket, parent] of [['listing-media', id(10)], ['promotional-media', id(11)]]) {
      for (const [index, owner] of [null, ADMIN_ID, OTHER_ID].entries()) {
        const path = parent + '/owner-' + index + '.webp';
        await db.query('insert into storage.objects(bucket_id,name,owner_id) values ($1,$2,$3)', [bucket, path, owner]);
        paths.push(path);
      }
    }
    await db.query('update private.admin_users set user_id=$1 where singleton=true', [OTHER_ID]);
    assert.equal((await asRole(db, 'authenticated', ADMIN_ID, (tx) => tx.query("update storage.objects set metadata='{}' returning id"))).rows.length, 0);
    for (const path of paths) {
      assert.equal((await asRole(db, 'authenticated', OTHER_ID, (tx) => tx.query(
        "update storage.objects set metadata='{\"replaced\":true}' where name=$1 returning id", [path],
      ))).rows.length, 1);
      assert.equal((await asRole(db, 'authenticated', OTHER_ID, (tx) => tx.query('delete from storage.objects where name=$1 returning id', [path]))).rows.length, 1);
    }
  } finally { await db.close(); }
});

test('catalog versions must reference an import job belonging to the same merchant', async () => {
  const db = await createTestDatabase();
  try {
    await db.query("insert into public.listings(id,city_id,name,slug) values ($1,$3,'First','first'),($2,$3,'Second','second')", [id(20), id(21), CITY_ID]);
    await asRole(db, 'service_role', null, (tx) => tx.query(
      "insert into private.product_import_jobs(id,merchant_id,mode) values ($1,$2,'upsert')", [id(22), id(20)],
    ));
    await assert.rejects(asRole(db, 'service_role', null, (tx) => tx.query(
      'insert into private.catalog_versions(merchant_id,import_job_id,version) values ($1,$2,1)', [id(21), id(22)],
    )), (error) => error.code === '23503');
    await asRole(db, 'service_role', null, (tx) => tx.query(
      'insert into private.catalog_versions(merchant_id,import_job_id,version) values ($1,$2,1)', [id(20), id(22)],
    ));
    await asRole(db, 'service_role', null, (tx) => tx.query(
      'insert into private.catalog_versions(merchant_id,version) values ($1,1)', [id(21)],
    ));
  } finally { await db.close(); }
});

test('storage migration aborts incompatible existing buckets without changing their data', async () => {
  const db = await createSystemDatabase();
  try {
    await applyMigration(db, CORE);
    await applyMigration(db, SECURITY);
    await db.query("insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('listing-media','listing-media',true,5242880,$1)", [mimeTypes]);
    for (const settings of [
      { public: true, size: 5242880, types: mimeTypes },
      { public: false, size: 10485760, types: mimeTypes },
      { public: false, size: 5242880, types: null },
      { public: false, size: 5242880, types: ['image/svg+xml'] },
    ]) {
      await db.query("update storage.buckets set public=$1,file_size_limit=$2,allowed_mime_types=$3 where id='listing-media'", [settings.public, settings.size, settings.types]);
      const before = (await db.query('select * from storage.buckets')).rows;
      await assert.rejects(applyMigration(db, STORAGE), /incompatible settings/);
      assert.deepEqual((await db.query('select * from storage.buckets')).rows, before);
      assert.equal((await db.query("select to_regprocedure('public.can_read_media(text,text)') as helper")).rows[0].helper, null);
    }
  } finally { await db.close(); }
});

test('storage migration refuses disabled Storage RLS without changing the existing configuration', async () => {
  const db = await createSystemDatabase();
  try {
    await applyMigration(db, CORE);
    await applyMigration(db, SECURITY);
    await db.exec('alter table storage.objects disable row level security');
    await assert.rejects(applyMigration(db, STORAGE), /RLS must be enabled on storage.objects/);
    assert.equal((await db.query('select count(*)::int total from storage.buckets')).rows[0].total, 0);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='storage.objects'::regclass")).rows[0].relrowsecurity, false);
  } finally { await db.close(); }
});

test('compatible existing storage buckets are reused without overwriting their settings', async () => {
  let before;
  const db = await createTestDatabase({ beforeMigrations: async (system) => {
    await system.query("insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('listing-media','listing-media',false,5242880,$1)", [[...mimeTypes].reverse()]);
    before = (await system.query("select * from storage.buckets where id='listing-media'")).rows;
  } });
  try {
    assert.deepEqual((await db.query("select * from storage.buckets where id='listing-media'")).rows, before);
    assert.equal((await db.query('select count(*)::int total from storage.buckets')).rows[0].total, 2);
  } finally { await db.close(); }
});
