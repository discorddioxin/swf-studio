// Screenshot the running app (dev server on :5173 by default) to /tmp.
//
//   node docs/debug/tools/screenshot.mjs [url] [outFile]
import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const url = process.argv[2] ?? 'http://localhost:5173/';
  const out = process.argv[3] ?? '/tmp/preview_screenshot.png';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // let the app settle (the canvas renders on rAF)
  await page.waitForTimeout(4000);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`Screenshot saved to ${out}`);
  await browser.close();
})();
