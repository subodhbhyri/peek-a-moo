// Writes public/version.json (gitignored) so the debug report can say which build it came from.
// Git short sha when available (Vercel exposes it as VERCEL_GIT_COMMIT_SHA), else the build time.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const builtAt = new Date().toISOString();
let sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
if (!sha) {
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    sha = null;
  }
}
mkdirSync('public', { recursive: true });
writeFileSync('public/version.json', JSON.stringify({ version: sha ?? builtAt, builtAt }) + '\n');
