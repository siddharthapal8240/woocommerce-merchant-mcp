export interface Config {
  storeUrl: URL;
  consumerKey: string;
  consumerSecret: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value || value.startsWith('replace_with_')) throw new Error(`Configure ${name} in your local environment.`);
    return value;
  };
  let storeUrl: URL;
  try { storeUrl = new URL(required('WC_STORE_URL')); }
  catch { throw new Error('WC_STORE_URL must be a valid store URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(storeUrl.hostname);
  if (storeUrl.protocol !== 'https:' && !(storeUrl.protocol === 'http:' && local && env.WC_ALLOW_LOCAL_HTTP === 'true')) {
    throw new Error('Use HTTPS; local HTTP requires WC_ALLOW_LOCAL_HTTP=true.');
  }
  if (storeUrl.username || storeUrl.password || storeUrl.search || storeUrl.hash) {
    throw new Error('Store URL must not include credentials, query parameters, or fragments.');
  }
  storeUrl.pathname = `${storeUrl.pathname.replace(/\/$/, '')}/wp-json/wc/v3/`;
  return { storeUrl, consumerKey: required('WC_CONSUMER_KEY'), consumerSecret: required('WC_CONSUMER_SECRET') };
}
