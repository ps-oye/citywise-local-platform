import { defineConfig, devices } from '@playwright/test';
const port=Number(process.env.PLAYWRIGHT_PORT)||5173;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a valid local Playwright port.');
const baseURL='http://127.0.0.1:'+port;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: [{
    command: 'node tests/helpers/discovery-server.mjs',
    env:{FIXTURE_APP_ORIGIN:baseURL},
    url: 'http://127.0.0.1:54329/health',
    timeout: 30000,
    reuseExistingServer: false,
  }, {
    command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} run dev -- --mode test --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54329',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_phase1_local_fixture',
      VITE_BRAND_NAME: 'ShaharOne',
      VITE_SITE_URL: '',
      SUPABASE_URL:'http://127.0.0.1:54329',
      SUPABASE_SERVICE_ROLE_KEY:'server_only_phase3_fixture_key',
      SUPABASE_SECRET_KEY:'server_only_phase3_fixture_key',
      SUPABASE_PUBLISHABLE_KEY:'sb_publishable_phase1_local_fixture',
      SITE_URL:'',SITE_INDEXING_ENABLED:'false',SITE_REDIRECTS_ENABLED:'false',
      CHECKOUT_HMAC_SECRET:'isolated_phase3_hmac_secret_for_tests_only',
    },
  }],
});
