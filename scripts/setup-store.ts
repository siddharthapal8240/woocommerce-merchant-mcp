import { createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { compose, wp, secrets, storeUrl } from './local.js';

async function main() {
  const key = await secrets(true);
  console.log('Starting isolated WordPress and database containers…');
  await compose(['up', '-d', '--wait', 'db', 'wordpress', 'proxy']);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      if (
        (
          await fetch('http://localhost:8080', {
            redirect: 'manual',
            signal: AbortSignal.timeout(3000),
          })
        ).status < 500
      ) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await setTimeout(1500);
  }
  if (!ready) throw new Error('WordPress did not become ready on localhost:8080.');
  const ca = await compose([
    'exec',
    '-T',
    'proxy',
    'cat',
    '/data/caddy/pki/authorities/local/root.crt',
  ]);
  await writeFile('.local/root.crt', ca + '\n');
  try {
    await wp(['core', 'is-installed']);
  } catch {
    await wp([
      'core',
      'install',
      `--url=${storeUrl}`,
      '--title=Thread & Loom Demo',
      '--admin_user=merchant_demo',
      `--admin_password=${key.adminPassword}`,
      '--admin_email=admin@example.test',
      '--skip-email',
    ]);
  }
  await wp(['option', 'update', 'home', storeUrl]);
  await wp(['option', 'update', 'siteurl', storeUrl]);
  console.log('Installing pinned WooCommerce 10.2.2 and configuring the fictional store…');
  try {
    await wp(['plugin', 'is-installed', 'woocommerce']);
  } catch {
    await wp(['plugin', 'install', 'woocommerce', '--version=10.2.2']);
  }
  const version = await wp(['plugin', 'get', 'woocommerce', '--field=version']);
  if (version !== '10.2.2')
    throw new Error('Unexpected WooCommerce version. Use a fresh dedicated store.');
  await wp(['plugin', 'activate', 'woocommerce']);
  await wp(['rewrite', 'structure', '/%postname%/', '--hard']);
  await wp(['option', 'update', 'woocommerce_currency', 'INR']);
  await wp(['option', 'update', 'woocommerce_store_address', 'Fictional demo store']);
  await wp(['option', 'update', 'woocommerce_allow_tracking', 'no']);
  const id = await wp(['user', 'get', 'merchant_demo', '--field=ID']);
  if (!/^\d+$/.test(id)) throw new Error('Invalid local administrator ID.');
  // Test bootstrap only: create restricted keys in this dedicated database.
  // WooCommerce hashes consumer keys with HMAC-SHA256 using the literal salt "wc-api".
  // Production merchants must provision keys through WooCommerce's REST API settings UI.
  const rows = [
    [key.readKey, key.readSecret, 'read', 'merchant-mcp-reader'],
    [key.seedKey, key.seedSecret, 'read_write', 'merchant-mcp-seeder'],
  ];
  for (const [consumerKey, consumerSecret, permission, description] of rows) {
    if (
      !consumerKey ||
      !consumerSecret ||
      !/^ck_[a-f0-9]{40}$/.test(consumerKey) ||
      !/^cs_[a-f0-9]{40}$/.test(consumerSecret)
    )
      throw new Error('Invalid local credential format.');
    const hash = createHmac('sha256', 'wc-api').update(consumerKey).digest('hex');
    const sql = `INSERT INTO wp_woocommerce_api_keys (user_id,description,permissions,consumer_key,consumer_secret,truncated_key) SELECT ${id},'${description}','${permission}','${hash}','${consumerSecret}','${consumerKey.slice(-7)}' WHERE NOT EXISTS (SELECT 1 FROM wp_woocommerce_api_keys WHERE consumer_key='${hash}');`;
    await compose(
      ['exec', '-T', 'db', 'mariadb', '-uwordpress', '-plocal-demo-only', 'wordpress'],
      sql,
    );
  }
  const localEnv = `WC_STORE_URL=${storeUrl}\nWC_CONSUMER_KEY=${key.readKey}\nWC_CONSUMER_SECRET=${key.readSecret}\n`;
  await writeFile('.local/connector.env', localEnv, { mode: 0o600 });
  try {
    const existing = await readFile('.env', 'utf8');
    if (existing.includes(key.readKey)) await writeFile('.env', localEnv, { mode: 0o600 });
    else console.log('Existing .env preserved; local credentials are in .local/connector.env.');
  } catch {
    await writeFile('.env', localEnv, { mode: 0o600, flag: 'wx' });
  }
  console.log(
    'Store ready. Local-only credentials saved securely under .local/. Run npm run store:seed.',
  );
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
