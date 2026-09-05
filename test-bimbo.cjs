const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
      console.log(msg.type(), msg.text());
  });
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    // switch to bimbo mode using local storage
    localStorage.setItem('cool_read_settings', JSON.stringify({ appStyle: 'Bimbo' }));
  });
  // reload to apply
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  const body = await page.$eval('body', el => el.innerHTML);
  console.log('HAS BIMBO STYLE?', body.includes('bimbo-mode'));
  
  console.log('RE-EVALUATING DOM...');
  await page.waitForTimeout(1000);
  
  await browser.close();
})();
