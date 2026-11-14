import test from 'node:test';
import assert from 'node:assert/strict';
import { readEnvironment, parseOrigin, isPublicSupabaseKey } from '../../src/config/environment.js';
import { createSupabaseClient } from '../../src/data/supabase-client.js';
import { checkPlatformConnection } from '../../src/services/platform-service.js';
import { safeDestination } from '../../src/utils/urls.js';
import { escapeHtml } from '../../src/utils/dom.js';
import { formatMoney } from '../../src/utils/format.js';

const publicEnv = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture',
};
const jwt = (role) => 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ role })) + '.fixture';

test('missing credentials produce an explicit unconfigured client', () => {
  const config = readEnvironment();
  assert.equal(config.configured, false);
  assert.deepEqual(config.errors, []);
  assert.equal(createSupabaseClient(config), null);
});

test('configuration accepts public keys and local Supabase origins', () => {
  assert.equal(readEnvironment(publicEnv).configured, true);
  assert.equal(readEnvironment({ ...publicEnv, VITE_SUPABASE_URL: 'http://127.0.0.1:54321/' }).configured, true);
  assert.equal(isPublicSupabaseKey(jwt('anon')), true);
  assert.equal(readEnvironment({ ...publicEnv, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).configured, true);
});

test('configuration rejects privileged credentials without echoing their values', () => {
  for (const key of ['sb_secret_do_not_print', jwt('service_role'), jwt('authenticated'), 'not-a-key']) {
    const config = readEnvironment({ ...publicEnv, VITE_SUPABASE_PUBLISHABLE_KEY: key });
    assert.equal(config.configured, false);
    assert.ok(config.errors.length);
    assert.ok(!config.errors.join(' ').includes(key));
  }
  assert.equal(readEnvironment({ ...publicEnv, VITE_UNEXPECTED_KEY: 'do-not-bundle' }).configured, false);
  const config = readEnvironment({ ...publicEnv, VITE_DATABASE_URL: 'private-secret' });
  assert.equal(config.configured, false);
  assert.ok(!config.errors.join(' ').includes('private-secret'));
});

test('configuration rejects partial credentials and unsafe origins', () => {
  assert.ok(readEnvironment({ VITE_SUPABASE_URL: publicEnv.VITE_SUPABASE_URL }).errors.length);
  for (const origin of ['http://example.com', 'https://user:pass@example.com', 'javascript:alert(1)', 'https://example.com/path', 'https://example.com?q=1', 'https://example.com/#x']) {
    assert.equal(parseOrigin(origin), null);
  }
  assert.equal(parseOrigin('https://example.com/'), 'https://example.com');
  assert.ok(readEnvironment({ VITE_SITE_URL: 'http://example.com' }).errors.length);
});

test('public SDK client never persists or refreshes administrator sessions', () => {
  const client = createSupabaseClient(readEnvironment(publicEnv));
  assert.equal(client.auth.persistSession, false);
  assert.equal(client.auth.autoRefreshToken, false);
  assert.equal(client.auth.detectSessionInUrl, false);
});

test('the connection service uses the actual SDK with a bounded, safe public query', async () => {
  let requestUrl;
  const client = createSupabaseClient(readEnvironment(publicEnv), {
    fetch: async (input) => {
      requestUrl = new URL(input);
      return new Response(JSON.stringify([{ id: 'fixture', name: 'Rawatbhata', slug: 'rawatbhata', timezone: 'Asia/Kolkata' }]), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  const result = await checkPlatformConnection(client);
  assert.equal(result.state, 'connected');
  assert.equal(requestUrl.pathname, '/rest/v1/cities');
  assert.equal(requestUrl.searchParams.get('limit'), '1');
  assert.equal(requestUrl.searchParams.get('enabled'), 'eq.true');
  assert.equal(requestUrl.searchParams.get('is_default'), 'eq.true');
  assert.equal(requestUrl.searchParams.get('select'), 'id,name,slug,timezone');
});

test('connection service handles an empty database and hides backend details on failure', async () => {
  const empty = createSupabaseClient(readEnvironment(publicEnv), {
    fetch: async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
  });
  assert.equal((await checkPlatformConnection(empty)).state, 'empty');
  const broken = createSupabaseClient(readEnvironment(publicEnv), {
    fetch: async () => new Response(JSON.stringify({ message: 'internal-private-detail', code: '42501' }), { status: 403 }),
  });
  await assert.rejects(checkPlatformConnection(broken), (error) => !error.message.includes('internal-private-detail'));
});

test('HTML escaping protects all markup boundaries', () => {
  assert.equal(escapeHtml('<img src="x" onerror=\'alert(1)\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('destinations allow same-origin paths and HTTPS links, rejecting executable or ambiguous input', () => {
  const origin = 'https://rawatbhata.example';
  assert.equal(safeDestination('/rawatbhata/food?q=tea', origin), '/rawatbhata/food?q=tea');
  assert.equal(safeDestination('/', origin), '/');
  assert.equal(safeDestination('https://example.com/path', origin), 'https://example.com/path');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', 'https://user:pass@example.com', 'http://example.com', ' /admin', 'https://example.com/has space']) {
    assert.equal(safeDestination(value, origin), null);
  }
});

test('money formatting accepts integer minor units without silently rounding inputs', () => {
  assert.equal(formatMoney(12345), '₹123.45');
  assert.equal(formatMoney(0), '₹0.00');
  for (const amount of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatMoney(amount), RangeError);
  }
});
