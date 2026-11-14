import { getDefaultCity } from '../data/platform-repository.js';

export async function checkPlatformConnection(client, options) {
  const city = await getDefaultCity(client, options);
  if (!city) return { state: 'empty', message: 'Connected. No enabled default city has been configured yet.' };
  return { state: 'connected', message: `Connected to ${city.name}.`, city };
}
