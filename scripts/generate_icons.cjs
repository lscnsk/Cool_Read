const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');
  const svgPath = path.join(publicDir, 'icon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
        svg { width: 100vw; height: 100vh; display: block; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  await page.setContent(html);

  const targets = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png', size: 64 },
  ];

  for (const target of targets) {
    await page.setViewport({ width: target.size, height: target.size });
    const outPath = path.join(publicDir, target.name);
    await page.screenshot({ path: outPath, omitBackground: false });
    console.log(`Generated ${target.name} (${target.size}x${target.size})`);
  }

  await browser.close();
  console.log('Icon generation complete!');
}

generateIcons().catch(err => {
  console.error(err);
  process.exit(1);
});
