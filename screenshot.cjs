const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({ path: 'screenshot.png' });
  
  const body = await page.$eval('body', el => el.innerHTML);
  fs.writeFileSync('body.html', body);
  
  await browser.close();
})();
