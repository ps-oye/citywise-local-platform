// Never await a Supabase query inside onAuthStateChange: the SDK holds its auth lock.
export function createAdminSession(client, onChange) {
  let generation = 0, timer, heartbeat, subscription, stopped = false, checking;
  function verify() {
    if(checking)return checking;
    const attempt = generation;
    checking = (async()=>{
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error('Sign in to continue.');
      const role = await client.rpc('is_admin');
      if (role.error || role.data !== true) throw new Error('This account is not the platform administrator.');
      if (!stopped && attempt === generation) onChange({ user: data.user });
      return !stopped && attempt === generation;
    } catch (error) {
      if (!stopped && attempt === generation) {
        onChange({ user: null, message: error.message === 'This account is not the platform administrator.' ? error.message : '' });
      }
      return false;
    }
    })().finally(()=>{checking=null;});
    return checking;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(verify, 0); }
  function visible() { if (document.visibilityState === 'visible') schedule(); }
  return {
    async start() {
      subscription = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') { ++generation; onChange({user:null}); }
        else if(event!=='INITIAL_SESSION') schedule();
      }).data.subscription;
      heartbeat = setInterval(schedule, 60000);
      document.addEventListener('visibilitychange', visible);
      return verify();
    },
    async signIn(email, password) {
      const result = await client.auth.signInWithPassword({email:email.trim(),password});
      if (result.error) throw new Error('Sign-in failed. Check your email and password.');
      clearTimeout(timer);
      if(checking)await checking;
      if (!await verify()) { await client.auth.signOut({scope:'local'}); throw new Error('This account is not the platform administrator.'); }
    },
    async signOut() {
      ++generation;
      onChange({user:null});
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) throw new Error('Could not clear the session. Close this tab to end access.');
    },
    async token() { const {data,error}=await client.auth.getSession(); if(error || !data.session)throw new Error('Sign in again to continue.'); return data.session.access_token; },
    verify,
    destroy() { stopped=true; ++generation; clearTimeout(timer);clearInterval(heartbeat);subscription?.unsubscribe();document.removeEventListener('visibilitychange',visible); },
  };
}
