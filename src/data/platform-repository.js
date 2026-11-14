export async function getDefaultCity(client, { signal } = {}) {
  if (!client) throw new Error('The data connection has not been configured.');
  const { data, error } = await client
    .from('cities')
    .select('id,name,slug,timezone')
    .eq('is_default', true)
    .eq('enabled', true)
    .limit(1)
    .abortSignal(signal ?? AbortSignal.timeout(8000))
    .maybeSingle();
  if (error) throw new Error('The city could not be loaded. Check the connection and database setup.');
  return data;
}
