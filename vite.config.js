import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { readEnvironment } from './src/config/environment.js';
import { isPublicPath } from './src/config/public-routes.js';
import { applicationRuntime } from './scripts/vite-runtime.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {publicSecurityHeaders,PUBLIC_SECURITY_HEADERS} from './src/config/security-headers.js';

function discoveryRoutes() {
  const install = (server) => {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname !== '/' && isPublicPath(url.pathname)) request.url = '/index.html' + url.search;
      next();
    });
  };
  return { name: 'public-discovery-routes', configureServer: install, configurePreviewServer: install };
}

export default defineConfig(({ mode }) => {
  const config = readEnvironment(loadEnv(mode, process.cwd(), 'VITE_'));
  if (config.errors.length) throw new Error(config.errors.join('\n'));

  return {
    appType: 'mpa',
    plugins: [applicationRuntime(mode),discoveryRoutes(),{
      name:'configured-public-security-headers',
      async writeBundle(options){const path=resolve(options.dir||'dist','_headers'),headers=await readFile(path,'utf8');await writeFile(path,headers.replace(PUBLIC_SECURITY_HEADERS['Content-Security-Policy'],publicSecurityHeaders({VITE_SUPABASE_URL:config.supabaseUrl})['Content-Security-Policy']));},
    }],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    build: {
      target: 'es2022',
      sourcemap: false,
      rolldownOptions: {
        input: {
          public: fileURLToPath(new URL('./index.html', import.meta.url)),
          admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
        },
      },
    },
  };
});
