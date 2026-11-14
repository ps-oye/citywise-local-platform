import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

export const CITY_ID = '10000000-0000-4000-8000-000000000001';
export const ADMIN_ID = '20000000-0000-4000-8000-000000000001';
export const OTHER_ID = '20000000-0000-4000-8000-000000000002';

export async function createSystemDatabase({ legacyGrants = true } = {}) {
  const db = new PGlite();
  await db.exec(await readFile('tests/fixtures/supabase-system.sql', 'utf8'));
  if (legacyGrants) {
    await db.exec(`
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    `);
  }
  return db;
}

export async function applyMigration(db, file) {
  try { await db.exec(await readFile('supabase/migrations/' + file, 'utf8')); }
  catch (error) {
    await db.exec('rollback');
    throw new Error(file + ': ' + error.message, { cause: error });
  }
}

export async function applyMigrations(db) {
  const files = (await readdir('supabase/migrations')).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) await applyMigration(db, file);
}

export async function createTestDatabase({ legacyGrants = true, beforeMigrations } = {}) {
  const db = await createSystemDatabase({ legacyGrants });
  try {
    if (beforeMigrations) await beforeMigrations(db);
    await applyMigrations(db);
    await db.exec(await readFile('supabase/seed.sql', 'utf8'));
    await db.query('insert into auth.users(id) values ($1), ($2)', [ADMIN_ID, OTHER_ID]);
    await db.query('insert into private.admin_users(user_id) values ($1)', [ADMIN_ID]);
    return db;
  } catch (error) { await db.close(); throw error; }
}

export async function asRole(db, role, userId, action) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error('Invalid test role');
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    await tx.exec('set local role ' + role);
    return action(tx);
  });
}
