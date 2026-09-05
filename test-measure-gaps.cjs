const puppeteer = require('puppeteer');
const Hypher = require('hypher');
const ruPattern = require('hyphenation.ru');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });

  const sampleText = `
    В одном из отдаленных уголков нашей необъятной родины происходили самые удивительные и необыкновенные события, о которых мало кто подозревал.
    Когда сумерки опускались на тихие провинциальные улочки, старинный дом на краю оврага словно оживал собственной таинственной жизнью.
    Сквозь узкие стрельчатые окна пробивался мерцающий свет старинного бронзового канделябра, освещая пыльные стеллажи с фолиантами.
    Никто из окрестных жителей не осмеливался приблизиться к этому странному жилищу после полуночи, опасаясь необъяснимых происшествий.
    Именно здесь хранилась тайна древней рукописи, способной изменить судьбы многих поколений исследователей и искателей приключений.
  `;

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 16px; font-family: serif; font-size: 19px; line-height: 1.6; }
        .test-box { width: 340px; }
        .justified {
          text-align: justify;
          text-justify: auto;
          hyphens: auto;
          -webkit-hyphens: auto;
        }
        .with-hypher {
          text-align: justify;
          text-justify: auto;
        }
      </style>
    </head>
    <body>
      <div class="test-box">
        <h3>1. Standard CSS justify (no shy)</h3>
        <div id="box1" class="justified">${sampleText.split('\n').filter(s => s.trim()).map(s => '<p>' + s.trim() + '</p>').join('')}</div>

        <h3>2. With Hypher soft-hyphens</h3>
        <div id="box2" class="with-hypher"></div>
      </div>
    </body>
    </html>
  `);

  const h = new Hypher(ruPattern);
  const hyphText = sampleText.split('\n').filter(s => s.trim()).map(s => '<p>' + h.hyphenateText(s.trim()) + '</p>').join('');

  await page.evaluate((html) => {
    document.getElementById('box2').innerHTML = html;
  }, hyphText);

  // Measure lines and word spaces in box1 and box2!
  const measureGaps = await page.evaluate(() => {
    function getSpaceWidths(container) {
      const results = [];
      const ps = container.querySelectorAll('p');
      ps.forEach((p, pIdx) => {
        // Wrap each word in a span and check distances
        const text = p.innerText;
        // Let's use Range to measure spaces
        // or walk words
      });
      return { pCount: ps.length };
    }
    return {
      box1: getSpaceWidths(document.getElementById('box1')),
      box2: getSpaceWidths(document.getElementById('box2'))
    };
  });

  console.log('Measure:', measureGaps);

  // Now let's take a screenshot to see what it looks like
  await page.screenshot({ path: 'test-gaps.png', fullPage: true });
  console.log('Screenshot saved to test-gaps.png');

  await browser.close();
})();
