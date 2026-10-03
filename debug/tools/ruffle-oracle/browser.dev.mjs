// Shared headless-browser launcher for the dev-time checks.
//
// Everything on the page is our own engine — Ruffle is only ever used as an
// offline reference (oracle.html) and is never part of the product. The browser
// is launched over a pipe instead of a TCP debugging port so that running these
// checks never opens another preview port next to the app.
import puppeteer from 'puppeteer-core';

const EXE = process.env.CHROME ?? '/tmp/chromium/chrome';
const LIBS = process.env.CHROME_LIBS ?? '/tmp/al2023/lib';

export async function launch() {
  return puppeteer.launch({
    executablePath: EXE,
    headless: true,
    pipe: true,
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 180000,
    dumpio: !!process.env.DUMPIO,
    env: { ...process.env, LD_LIBRARY_PATH: [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none',
    ],
  });
}
