import './styles/main.css';
import { readEnvironment } from './config/environment.js';
import { applyBrand } from './components/brand.js';
import { createDiscoveryRepository } from './data/discovery-repository.js';
import { createMediaService } from './services/media-service.js';
import { mountDiscovery } from './pages/discovery.js';
import { createMerchantRepository } from './data/merchant-repository.js';
import { createCartStore } from './services/cart-store.js';
import { createCheckoutService } from './services/checkout-service.js';
import './styles/merchant.css';
import {createAnalytics} from './services/analytics.js';

const config = readEnvironment(import.meta.env);
applyBrand(config, 'Your town, rediscovered');
let client = null;
if (config.configured) {
  const { createSupabaseClient } = await import('./data/supabase-client.js');
  client = createSupabaseClient(config);
}
const cart=createCartStore({onPersistenceError:()=>{const toast=document.querySelector('[data-toast]');if(toast){toast.textContent='Browser storage is unavailable. Keep this page open to retain your cart.';toast.hidden=false;}}});
window.addEventListener('storage',event=>cart.sync(event));
mountDiscovery({ config, repository: createDiscoveryRepository(client), merchantRepository:createMerchantRepository(client), cart, checkout:createCheckoutService(), media: createMediaService(client, config.supabaseUrl),analytics:createAnalytics() });
