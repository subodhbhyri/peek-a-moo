// Renders scripts/og-image.svg to public/og-image.png (1200x630) with a locally installed Chrome or Edge in
// headless mode: no npm dependency. Set CHROME_PATH to use a specific browser.
//   node scripts/og-image.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const svg = resolve(here, 'og-image.svg');
const out = resolve(here, '../public/og-image.png');

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error(
    'og-image: no Chrome/Edge found. Set CHROME_PATH, or open scripts/og-image.svg and export a 1200x630 PNG to public/og-image.png.',
  );
  process.exit(1);
}

// A page that shows the SVG at exactly 1200x630, so the screenshot has no browser chrome or margins.
const page = resolve(here, '.og-image.html');
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#030303}img{display:block}</style><img src="${pathToFileURL(svg)}" width="1200" height="630">`,
);
try {
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      `--screenshot=${out}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'inherit' },
  );
} finally {
  try {
    (await import('node:fs')).rmSync(page);
  } catch {
    // ignore
  }
}
const png = readFileSync(out);
const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
console.log(`og-image: wrote ${out} (${w}x${h})`);
if (w !== 1200 || h !== 630) {
  console.error('og-image: unexpected size; check the browser version and try again.');
  process.exit(1);
}
