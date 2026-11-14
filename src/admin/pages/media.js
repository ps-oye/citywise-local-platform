import {merchantPicker} from '../merchant-picker.js';
import {mountMediaManager} from '../media-manager.js';
import {heading,e} from '../ui.js';
export async function mediaPage(app,id) {
  if(!id)return merchantPicker(app,'media','Media library','Choose a merchant to manage its banner, logo and gallery. Promotion images are managed under Advertisements.');
  const record=await app.repo.listing(id);if(!record)throw new Error('This merchant could not be found.');
  if(!app.mount(heading('Media library',record.name,'Keep images focused, descriptive and useful.',`<a class="button button-secondary" href="#merchants/${e(id)}">← Merchant details</a>`)+'<section class="admin-card" data-media-manager></section>'))return;
  app.setCleanup(mountMediaManager(app,app.root.querySelector('[data-media-manager]'),{entity:'listing',record}));
}
