import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(6000); // allow game to reach server chooser
  await page.screenshot({ path: 'preview-screenshot.png', fullPage: false });
  console.log('Screenshot saved to preview-screenshot.png');
  await browser.close();
})();
