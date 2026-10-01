import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const git = (args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .split('\0')
  .filter(Boolean);
const localSecrets: string[] = existsSync('.local/credentials.json')
  ? Object.values(
      JSON.parse(readFileSync('.local/credentials.json', 'utf8')) as Record<string, string>,
    )
  : [];
const hasSecret = (text: string) =>
  /(?:ck|cs)_[a-f0-9]{40}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text) ||
  localSecrets.some((secret) => text.includes(secret));
const flagged = files.filter(
  (file) =>
    existsSync(file) &&
    (file.startsWith('.local/') ||
      (file.startsWith('.env') && file !== '.env.example') ||
      hasSecret(readFileSync(file, 'utf8'))),
);
if (flagged.length) {
  console.error('Potential secrets/private runtime files detected in:', flagged.join(', '));
  process.exitCode = 1;
} else if (
  process.argv.includes('--history') &&
  hasSecret(git(['log', '--all', '--format=', '-p']))
) {
  console.error('Potential secret detected in Git history.');
  process.exitCode = 1;
} else
  console.log(
    `Secret checks passed across ${files.length} candidate files${process.argv.includes('--history') ? ' and Git history' : ''}. This is a focused check, not a general secret-scanning guarantee.`,
  );
