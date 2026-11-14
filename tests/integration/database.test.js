import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDatabase, asRole, CITY_ID, ADMIN_ID, OTHER_ID } from '../helpers/database.js';

let db;
let foodId;
let foodCategoryId;
const fixtureId = (n) => '30000000-0000-4000-8000-' + String(n).padStart(12, '0');
const adId = (n) => '40000000-0000-4000-8000-' + String(n).padStart(12, '0');
const publicRows = async (sql, params = []) => (await asRole(db, 'anon', null, (tx) => tx.query(sql, params))).rows;
const adminQuery = (sql, params = []) => asRole(db, 'authenticated', ADMIN_ID, (tx) => tx.query(sql, params));
const codeIs = (expected) => (error) => error.code === expected;

before(async () => {
  db = await createTestDatabase();
  const seed = await readFile('supabase/seeds/demo.sql', 'utf8');
  await db.exec(seed);
  await db.exec(seed);
  foodId = (await db.query("select id from public.listings where slug = 'demo-food'")).rows[0].id;
  foodCategoryId = (await db.query("select id from public.categories where slug = 'food'")).rows[0].id;

  await db.query("insert into public.cities(id,name,slug,state,enabled) values ($1,'Disabled city','disabled-city','Test',false)", [fixtureId(90)]);
  await db.query("insert into public.categories(id,name,slug,enabled) values ($1,'Disabled category','disabled-category',false)", [fixtureId(91)]);
  await db.query("insert into public.localities(id,city_id,name,slug,enabled) values ($1,$2,'Disabled locality','disabled-locality',false)", [fixtureId(92), CITY_ID]);

  for (let n = 1; n <= 6; n++) {
    const id = fixtureId(n);
    await db.query(
      "insert into public.listings(id,city_id,locality_id,name,slug,listing_type,publication_status,enabled,archived_at) values ($1,$2,$3,'Private fixture',$4,'COMMERCE',$5,$6,$7)",
      [id, n === 6 ? fixtureId(90) : CITY_ID, n === 5 ? fixtureId(92) : null, 'private-' + n,
        n === 1 ? 'draft' : 'published', n !== 2, n === 3 ? new Date().toISOString() : null],
    );
    await db.query('insert into public.listing_categories(listing_id,category_id,is_primary) values ($1,$2,true)', [id, n === 4 ? fixtureId(91) : foodCategoryId]);
    await db.query("insert into public.products(merchant_id,sku,name,price_minor) values ($1,'PRIVATE','Private product',100)", [id]);
    await db.query("insert into public.business_hours(listing_id,weekday,opens_at,closes_at) values ($1,1,'09:00','17:00')", [id]);
    await db.query("insert into public.offerings(listing_id,kind,name) values ($1,'service','Private offering')", [id]);
    const special = await db.query("insert into public.special_hours(listing_id,on_date) values ($1,'2099-01-01') returning id", [id]);
    await db.query("insert into public.special_hour_intervals(special_hours_id,opens_at,closes_at) values ($1,'10:00','11:00')", [special.rows[0].id]);
    await db.query('insert into public.listing_actions(listing_id) values ($1)', [id]);
    await db.query("insert into public.listing_media(listing_id,object_path,alt_text) values ($1,$2,'Private image')", [id, id + '/photo.webp']);
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [id + '/photo.webp', ADMIN_ID]);
  }
  await db.query("insert into public.listing_media(listing_id,object_path,alt_text) values ($1,$2,'Public image')", [foodId, foodId + '/public.webp']);
  for (const filename of ['public.webp', 'unreferenced.webp']) {
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [foodId + '/' + filename, ADMIN_ID]);
  }

  for (let n = 1; n <= 6; n++) {
    await db.query(
      "insert into public.advertisements(id,city_id,listing_id,title,alt_text,desktop_image_path,starts_at,ends_at,enabled,archived_at) values ($1,$2,$3,'Test ad','Test banner',$4,now()+$5::interval,now()+$6::interval,$7,$8)",
      [adId(n), CITY_ID, n === 5 ? fixtureId(1) : null, adId(n) + '/banner.webp',
        n === 2 ? '1 day' : n === 3 ? '-2 days' : '-1 day', n === 3 ? '-1 day' : '2 days',
        n !== 4, n === 6 ? new Date().toISOString() : null],
    );
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('promotional-media',$1,$2)", [adId(n) + '/banner.webp', ADMIN_ID]);
  }
});

after(async () => { if (db) await db.close(); });

test('migrations enable RLS on every application table and keep helpers on an empty search path', async () => {
  const tables = await db.query("select schemaname, tablename, rowsecurity from pg_tables where schemaname in ('public','private')");
  assert.ok(tables.rows.length >= 25);
  assert.ok(tables.rows.every((row) => row.rowsecurity));
  const functions = await db.query("select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef");
  assert.ok(functions.rows.length);
  assert.ok(functions.rows.every((row) => row.proconfig?.some((value) => value.startsWith('search_path='))));
  const permissions = await db.query("select has_schema_privilege('authenticated','public','CREATE') allowed");
  assert.equal(permissions.rows[0].allowed, false);
});

test('demo installation is repeatable and uses only fictional, contact-free businesses', async () => {
  const result = await db.query('select * from public.listings where is_demo');
  assert.equal(result.rows.length, 15);
  assert.ok(result.rows.every((row) => row.name.startsWith('Demo ') && !row.phone_number && !row.whatsapp_number && !row.address && !row.latitude && !row.contact_verified_at));
  assert.equal((await db.query('select count(*)::int total from public.categories where is_demo')).rows[0].total, 15);
  assert.equal((await db.query('select count(*)::int total from public.listing_actions where checkout_enabled')).rows[0].total, 0);
});

test('anonymous reads include only published, enabled listings in visible locations and categories', async () => {
  const rows = await publicRows('select id from public.listings');
  assert.equal(rows.length, 15);
  assert.ok(rows.every((row) => !row.id.startsWith('30000000')));
  assert.equal((await publicRows('select id from public.cities')).length, 1);
  assert.equal((await publicRows('select id from public.localities')).length, 1);
  assert.equal((await publicRows('select id from public.categories')).length, 15);
});

test('hidden listing content cannot leak through related catalog, hours, media or action tables', async () => {
  for (const table of ['listing_categories', 'listing_media', 'business_hours', 'special_hours', 'offerings', 'listing_actions']) {
    const rows = await publicRows('select listing_id from public.' + table);
    assert.ok(rows.every((row) => !row.listing_id.startsWith('30000000')), table);
  }
  assert.equal((await publicRows('select * from public.special_hour_intervals')).length, 0);
  assert.equal((await publicRows("select * from public.products where sku='PRIVATE'")).length, 0);
  assert.equal((await publicRows('select public.is_listing_public($1) visible', [fixtureId(1)]))[0].visible, false);
});

test('ordinary authenticated users cannot impersonate the administrator or change public data', async () => {
  const check = await asRole(db, 'authenticated', OTHER_ID, async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ user_metadata: { role: 'admin' } })]);
    return tx.query('select public.is_admin() allowed');
  });
  assert.equal(check.rows[0].allowed, false);
  await assert.rejects(asRole(db, 'authenticated', OTHER_ID, (tx) =>
    tx.query("insert into public.listings(city_id,name,slug) values ($1,'Unauthorized','unauthorized')", [CITY_ID])), codeIs('42501'));
  const changed = await asRole(db, 'authenticated', OTHER_ID, (tx) =>
    tx.query("update public.products set price_minor=1 where merchant_id=$1 returning id", [foodId]));
  assert.equal(changed.rows.length, 0);
  const removed = await asRole(db, 'authenticated', OTHER_ID, (tx) =>
    tx.query('delete from public.listings where id=$1 returning id', [foodId]));
  assert.equal(removed.rows.length, 0);
});

test('anonymous writes and allowlist self-enrolment are forbidden', async () => {
  await assert.rejects(asRole(db, 'anon', null, (tx) =>
    tx.query("insert into public.categories(name,slug) values ('Bad','bad')")), codeIs('42501'));
  for (const uid of [OTHER_ID, ADMIN_ID]) {
    await assert.rejects(asRole(db, 'authenticated', uid, (tx) =>
      tx.query('insert into private.admin_users(user_id) values ($1)', [OTHER_ID])), codeIs('42501'));
  }
  await assert.rejects(db.query('insert into private.admin_users(user_id) values ($1)', [OTHER_ID]), codeIs('23505'));
  await assert.rejects(db.query('insert into private.admin_users(singleton,user_id) values (false,$1)', [OTHER_ID]), codeIs('23514'));
});

test('administrator CRUD and publication are enforced in the database and audited', async () => {
  const id = fixtureId(20);
  await adminQuery("insert into public.listings(id,city_id,name,slug) values ($1,$2,'Admin fixture','admin-fixture')", [id, CITY_ID]);
  assert.equal((await publicRows('select id from public.listings where id=$1', [id])).length, 0);
  await adminQuery('insert into public.listing_categories(listing_id,category_id,is_primary) values ($1,$2,true)', [id, foodCategoryId]);
  await adminQuery("update public.listings set publication_status='published',updated_at='2000-01-01' where id=$1", [id]);
  assert.equal((await publicRows('select id from public.listings where id=$1', [id])).length, 1);
  const updated = (await adminQuery('select updated_at from public.listings where id=$1', [id])).rows[0].updated_at;
  assert.ok(new Date(updated).getFullYear() > 2000);
  await adminQuery('delete from public.listings where id=$1', [id]);
  const audits = (await adminQuery("select operation,actor_id from private.admin_audit_logs where table_name='public.listings' and record_id=$1", [id])).rows;
  assert.deepEqual(audits.map((row) => row.operation).sort(), ['DELETE', 'INSERT', 'UPDATE']);
  assert.ok(audits.every((row) => row.actor_id === ADMIN_ID));
});

test('revoking the allowlist immediately removes authorization from an existing UID', async () => {
  await db.query('update private.admin_users set active=false where user_id=$1', [ADMIN_ID]);
  try {
    assert.equal((await adminQuery('select public.is_admin() allowed')).rows[0].allowed, false);
    await assert.rejects(adminQuery("insert into public.categories(name,slug) values ('Revoked','revoked')"), codeIs('42501'));
    assert.equal((await adminQuery('select id from public.listings where id=$1', [fixtureId(1)])).rows.length, 0);
  } finally {
    await db.query('update private.admin_users set active=true where user_id=$1', [ADMIN_ID]);
  }
});

test('prices, per-merchant SKUs, timezone and cross-city references are constrained', async () => {
  await assert.rejects(adminQuery("insert into public.products(merchant_id,sku,name,price_minor) values ($1,'NEG','Invalid',-1)", [foodId]), codeIs('23514'));
  await assert.rejects(adminQuery("insert into public.products(merchant_id,sku,name,price_minor) values ($1,'DEMO-001','Duplicate',1)", [foodId]), codeIs('23505'));
  await assert.rejects(adminQuery("update public.listings set timezone='Mars/Unknown' where id=$1", [foodId]), codeIs('23514'));
  await assert.rejects(adminQuery('update public.listings set city_id=$1,locality_id=$2 where id=$3', [fixtureId(90), fixtureId(92), fixtureId(6)]), codeIs('23503'));
  await assert.rejects(adminQuery("insert into public.products(merchant_id,sku,name,price_minor,original_price_minor) values ($1,'BAD-PRICE','Invalid',100,50)", [foodId]), codeIs('23514'));
});

test('demo checkout cannot be enabled and contacts cannot be fabricated in sample data', async () => {
  await assert.rejects(adminQuery('update public.listing_actions set checkout_enabled=true where listing_id=$1', [foodId]), codeIs('23514'));
  await assert.rejects(adminQuery("update public.listings set phone_number='+919999999999' where id=$1", [foodId]), codeIs('23514'));
});

test('temporary closure remains distinct from publication, and schedule intervals are validated', async () => {
  await adminQuery("insert into public.temporary_status_overrides(listing_id,status,reason) values ($1,'closed','Sample emergency closure')", [foodId]);
  assert.equal((await publicRows('select id from public.listings where id=$1', [foodId])).length, 1);
  assert.equal((await publicRows('select status from public.temporary_status_overrides where listing_id=$1', [foodId]))[0].status, 'closed');
  await assert.rejects(adminQuery("insert into public.business_hours(listing_id,weekday,opens_at,closes_at) values ($1,7,'09:00','18:00')", [foodId]), codeIs('23514'));
  await assert.rejects(adminQuery("insert into public.business_hours(listing_id,weekday,opens_at,closes_at) values ($1,1,'22:00','06:00')", [fixtureId(1)]), codeIs('23514'));
  await adminQuery("insert into public.business_hours(listing_id,weekday,opens_at,closes_at,ends_next_day) values ($1,1,'22:00','06:00',true)", [fixtureId(1)]);
});

test('advertisement reads exclude future, expired, disabled, archived and hidden-listing promotions', async () => {
  assert.deepEqual((await publicRows('select id from public.advertisements')).map((row) => row.id), [adId(1)]);
  for (const url of ['javascript:alert(1)', '//evil.example', 'https://user:pass@evil.example', '/\\evil.example']) {
    await assert.rejects(adminQuery('update public.advertisements set destination_url=$1 where id=$2', [url, adId(1)]), codeIs('23514'));
  }
});

test('private storage exposes only referenced images of public content', async () => {
  const rows = await publicRows('select bucket_id,name from storage.objects order by name');
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.name === foodId + '/public.webp'));
  assert.ok(rows.some((row) => row.name === adId(1) + '/banner.webp'));
  assert.ok(!rows.some((row) => row.name.includes('unreferenced')));
  await adminQuery("update public.listings set publication_status='draft' where id=$1", [foodId]);
  try {
    assert.equal((await publicRows("select name from storage.objects where bucket_id='listing-media'")).length, 0);
  } finally {
    await adminQuery("update public.listings set publication_status='published' where id=$1", [foodId]);
  }
  const buckets = (await db.query('select public,file_size_limit,allowed_mime_types from storage.buckets')).rows;
  assert.ok(buckets.every((row) => !row.public && Number(row.file_size_limit) === 5242880 && !row.allowed_mime_types.includes('image/svg+xml')));
});

test('storage upload, path and ownership policies apply to administrator and ordinary sessions', async () => {
  const insert = (role, uid, path, owner = uid) => asRole(db, role, uid, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name,owner_id) values ('listing-media',$1,$2)", [path, owner]));
  await assert.rejects(insert('anon', null, foodId + '/anon.webp'), codeIs('42501'));
  await assert.rejects(insert('authenticated', OTHER_ID, foodId + '/other.webp'), codeIs('42501'));
  await assert.rejects(insert('authenticated', ADMIN_ID, foodId + '/unsafe.svg'), codeIs('42501'));
  await assert.rejects(insert('authenticated', ADMIN_ID, foodId + '/safe.webp', OTHER_ID), codeIs('42501'));
  await assert.rejects(insert('authenticated', ADMIN_ID, fixtureId(999) + '/missing.webp'), codeIs('42501'));
  await insert('authenticated', ADMIN_ID, foodId + '/admin-upload.webp');
  await assert.rejects(asRole(db, 'authenticated', ADMIN_ID, (tx) =>
    tx.query('update storage.objects set name=$1 where name=$2', [foodId + '/unsafe.svg', foodId + '/admin-upload.webp'])), codeIs('42501'));
  const removed = await asRole(db, 'authenticated', ADMIN_ID, (tx) =>
    tx.query('delete from storage.objects where name=$1 returning id', [foodId + '/admin-upload.webp']));
  assert.equal(removed.rows.length, 1);
});

test('private enquiry and analytics writes require a trusted backend; the admin only reads', async () => {
  const id = fixtureId(70);
  const key = fixtureId(71);
  const insert = (tx) => tx.query(
    "insert into private.checkout_intents(id,merchant_id,reference,idempotency_key,total_minor) values ($1,$2,'RB-TEST0001',$3,5000)",
    [id, foodId, key],
  );
  await assert.rejects(asRole(db, 'anon', null, insert), codeIs('42501'));
  await assert.rejects(asRole(db, 'authenticated', OTHER_ID, insert), codeIs('42501'));
  await assert.rejects(asRole(db, 'authenticated', ADMIN_ID, insert), codeIs('42501'));
  await asRole(db, 'service_role', null, insert);
  assert.equal((await asRole(db, 'authenticated', OTHER_ID, (tx) => tx.query('select id from private.checkout_intents'))).rows.length, 0);
  assert.equal((await adminQuery('select id from private.checkout_intents')).rows.length, 1);
  await assert.rejects(asRole(db, 'service_role', null, insert), codeIs('23505'));
  await assert.rejects(db.query("update private.checkout_intents set state='sent' where id=$1", [id]), codeIs('23514'));
  await assert.rejects(asRole(db, 'authenticated', OTHER_ID, (tx) =>
    tx.query("insert into private.analytics_events(city_id,listing_id,event_type,event_key) values ($1,$2,'listing_view',$3)", [CITY_ID, foodId, fixtureId(72)])), codeIs('42501'));
});

test('homepage featured references cannot cross categories or cities', async () => {
  const section = (await db.query("select id from public.homepage_sections where category_id=$1", [foodCategoryId])).rows[0].id;
  const otherCategory = (await db.query("select id from public.categories where slug='hotels'")).rows[0].id;
  await assert.rejects(adminQuery(
    'insert into public.homepage_featured_listings(section_id,listing_id,city_id,category_id) values ($1,$2,$3,$4)',
    [section, fixtureId(1), CITY_ID, otherCategory],
  ), codeIs('23503'));
});

test('demo removal is scoped, preserves platform configuration and never runs against production', async () => {
  const isolated = await createTestDatabase();
  try {
    await isolated.exec(await readFile('supabase/seeds/demo.sql', 'utf8'));
    await isolated.exec(await readFile('supabase/seeds/remove-demo.sql', 'utf8'));
    assert.equal((await isolated.query('select count(*)::int total from public.listings')).rows[0].total, 0);
    assert.equal((await isolated.query('select count(*)::int total from public.categories')).rows[0].total, 0);
    assert.equal((await isolated.query('select count(*)::int total from public.cities')).rows[0].total, 1);
    assert.equal((await isolated.query('select count(*)::int total from private.admin_users')).rows[0].total, 1);
  } finally { await isolated.close(); }
});
