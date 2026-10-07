// Shared headless-browser launcher for the dev-time checks.
//
// Everything on the page is our own engine — Ruffle is only ever used as an
// offline reference (oracle.html) and is never part of the product. The browser
// is launched over a pipe instead of a TCP debugging port so that running these
// checks never opens another preview port next to the app.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

let bundledChromium = null;
let inflate = null;
if (!process.env.CHROME) {
  // Ask the bundled Chromium package to extract its AL2023 shared libraries as
  // well as the browser. This makes the dev-only Puppeteer tools work from a
  // clean checkout without depending on a pre-populated /tmp/chromium.
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';
  ({ default: bundledChromium, inflate } = await import('@sparticuz/chromium'));
}

export async function launch() {
  let executablePath = process.env.CHROME;
  let args;
  let libs = process.env.CHROME_LIBS;

  if (bundledChromium) {
    const packageEntry = fileURLToPath(import.meta.resolve('@sparticuz/chromium'));
    const binDir = path.resolve(path.dirname(packageEntry), '..', 'bin');
    const tmp = os.tmpdir();
    const chromiumPath = path.join(tmp, 'chromium');
    const fontsPath = path.join(tmp, 'fonts');
    const swiftshaderPath = path.join(tmp, 'libGLESv2.so');
    const runtimeLibPath = path.join(tmp, 'al2023', 'lib');

    if (!fs.existsSync(chromiumPath)) {
      executablePath = await bundledChromium.executablePath();
    } else {
      executablePath = chromiumPath;
      if (!fs.existsSync(fontsPath)) await inflate(path.join(binDir, 'fonts.tar.br'));
      if (!fs.existsSync(swiftshaderPath)) await inflate(path.join(binDir, 'swiftshader.tar.br'));
      if (!fs.existsSync(path.join(runtimeLibPath, 'libnss3.so'))) {
        fs.rmSync(path.join(tmp, 'al2023'), { recursive: true, force: true });
        await inflate(path.join(binDir, 'al2023.tar.br'));
      }
    }

    libs ??= runtimeLibPath;
    args = bundledChromium.args;
  } else {
    executablePath ??= fs.existsSync('/tmp/chromium/chrome') ? '/tmp/chromium/chrome' : '/tmp/chromium';
    libs ??= '/tmp/al2023/lib';
    args = [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--hide-scrollbars', '--mute-audio', '--font-render-hinting=none',
    ];
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    pipe: true,
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 180000,
    dumpio: !!process.env.DUMPIO,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
    args: [...args, '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio'],
  });
}
