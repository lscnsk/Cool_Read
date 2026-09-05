const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText);
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const body = await page.$eval('body', el => el.innerHTML);
  console.log('BODY:', body.substring(0, 500));
  
  await browser.close();
})();
