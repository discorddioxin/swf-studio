import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 });
  // Wait for canvas/game to render; give it time to reach server chooser
  await page.waitForTimeout(4000);
  // Also try taking after a bit more
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/preview_screenshot.png', fullPage: false });
  console.log('Screenshot saved to /tmp/preview_screenshot.png');
  await browser.close();
})();
