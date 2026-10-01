import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { request } from 'node:https';

export const storeUrl = 'https://localhost:8443';
export interface LocalSecrets {
  adminPassword: string;
  readKey: string;
  readSecret: string;
  seedKey: string;
  seedSecret: string;
}
export async function secrets(create = false): Promise<LocalSecrets> {
  try {
    return JSON.parse(await readFile('.local/credentials.json', 'utf8')) as LocalSecrets;
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Run npm run store:setup to create local credentials.');
    const value = {
      adminPassword: randomBytes(24).toString('hex'),
      readKey: `ck_${randomBytes(20).toString('hex')}`,
      readSecret: `cs_${randomBytes(20).toString('hex')}`,
      seedKey: `ck_${randomBytes(20).toString('hex')}`,
      seedSecret: `cs_${randomBytes(20).toString('hex')}`,
    };
    await mkdir('.local', { recursive: true, mode: 0o700 });
    await writeFile('.local/credentials.json', JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    return value;
  }
}

// Argument arrays avoid shell interpolation; capture output to avoid logging credentials.
export function command(bin: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const overrides =
      existsSync('.local/docker-env.json') && ['docker', 'docker-compose'].includes(bin)
        ? (JSON.parse(readFileSync('.local/docker-env.json', 'utf8')) as Record<string, string>)
        : {};
    const child = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...overrides },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', () => {});
    child.on('error', () =>
      reject(new Error(`Unable to start ${bin}. Check the documented prerequisites.`)),
    );
    child.on('close', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(
            new Error(`${bin} failed with exit code ${code}; inspect the local service state.`),
          ),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
let composeDriver: { bin: string; prefix: string[] } | undefined;
export async function compose(args: string[], input?: string) {
  if (!composeDriver) {
    try {
      await command('docker', ['compose', 'version']);
      composeDriver = { bin: 'docker', prefix: ['compose'] };
    } catch {
      await command('docker-compose', ['version']);
      composeDriver = { bin: 'docker-compose', prefix: [] };
    }
  }
  return command(composeDriver.bin, [...composeDriver.prefix, ...args], input);
}
export const wp = (args: string[]) => compose(['run', '--rm', '-T', 'cli', 'wp', ...args]);

export async function localApi(path: string, init: RequestInit = {}, write = false) {
  if (!/^(orders|products)(\/\d+(\/variations(\/\d+)?)?)?(\?.*)?$/.test(path))
    throw new Error('Unsupported fixture endpoint.');
  const key = await secrets();
  const pair = write ? `${key.seedKey}:${key.seedSecret}` : `${key.readKey}:${key.readSecret}`;
  const ca = await readFile('.local/root.crt');
  const response = await new Promise<Response>((resolve, reject) => {
    const req = request(
      new URL(`${storeUrl}/wp-json/wc/v3/${path}`),
      {
        method: init.method ?? 'GET',
        ca,
        timeout: 30_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(pair).toString('base64')}`,
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () =>
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500 })),
        );
        res.on('error', () => reject(new Error('Local HTTPS response failed.')));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Local HTTPS request timed out.')));
    req.on('error', () =>
      reject(new Error('Local HTTPS request failed; check the store and project certificate.')),
    );
    req.end(init.body);
  });
  return response;
}
export async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Local fixture API returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}
