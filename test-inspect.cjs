const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3000', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));

  // Switch mode to ebook
  const headerBtn = await page.$('button.whitespace-nowrap');
  if (headerBtn) {
    await headerBtn.click();
    await new Promise(r => setTimeout(r, 1500));
  }

  // Check content inside .reader-content
  const data = await page.evaluate(() => {
    const reader = document.querySelector('.reader-content');
    if (!reader) return { error: 'no reader' };
    const ps = Array.from(reader.querySelectorAll('p')).slice(0, 10);
    return {
      pCount: reader.querySelectorAll('p').length,
      sampleP: ps.map(p => ({
        text: p.innerText.slice(0, 120),
        computedAlign: window.getComputedStyle(p).textAlign,
        computedJustify: window.getComputedStyle(p).textJustify,
        computedLetterSpacing: window.getComputedStyle(p).letterSpacing,
        computedWordSpacing: window.getComputedStyle(p).wordSpacing,
      }))
    };
  });

  console.log('Data:', JSON.stringify(data, null, 2));
  await browser.close();
})();
