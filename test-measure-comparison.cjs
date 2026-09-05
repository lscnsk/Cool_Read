const puppeteer = require('puppeteer');
const Hypher = require('hypher');
const ruPattern = require('hyphenation.ru');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });

  const paragraphs = [
    'В одном из отдаленных уголков нашей необъятной родины происходили самые удивительные и необыкновенные события, о которых мало кто подозревал.',
    'Когда сумерки опускались на тихие провинциальные улочки, старинный дом на краю оврага словно оживал собственной таинственной жизнью.',
    'Сквозь узкие стрельчатые окна пробивался мерцающий свет старинного бронзового канделябра, освещая пыльные стеллажи с фолиантами.',
    'Никто из окрестных жителей не осмеливался приблизиться к этому странному жилищу после полуночи, опасаясь необъяснимых происшествий.',
    'Именно здесь хранилась тайна древней рукописи, способной изменить судьбы многих поколений исследователей и искателей приключений.'
  ];

  const h = new Hypher(ruPattern);
  const hyphHtml = paragraphs.map(p => '<p>' + h.hyphenateText(p) + '</p>').join('');

  await page.setContent(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 16px; font-family: Georgia, serif; font-size: 19px; line-height: 1.6; }
        .box { width: 343px; border: 1px solid #ccc; margin-bottom: 20px; }
        .justified { text-align: justify; text-justify: auto; }
        .p-normal p { margin: 0 0 1em 0; text-indent: 1.5em; }
        .p-micro p { margin: 0 0 1em 0; text-indent: 1.5em; letter-spacing: -0.015em; word-spacing: -0.01em; }
      </style>
    </head>
    <body>
      <div id="box-normal" class="box justified p-normal">${hyphHtml}</div>
      <div id="box-micro" class="box justified p-micro">${hyphHtml}</div>
    </body>
    </html>
  `);

  const results = await page.evaluate(() => {
    function measureSpacesInBox(boxId) {
      const box = document.getElementById(boxId);
      const ps = Array.from(box.querySelectorAll('p'));
      const lineGaps = [];

      ps.forEach((p, pi) => {
        // Find line breaks and space widths
        const text = p.innerText;
        // Wrap each word in a span
        const words = text.split(' ');
        p.innerHTML = words.map((w, i) => `<span class="w" id="${boxId}_w_${pi}_${i}">${w}</span>`).join(' ');
        
        const wordSpans = Array.from(p.querySelectorAll('.w'));
        // Group by line (offsetTop)
        let curLine = [];
        let curTop = null;
        const lines = [];

        wordSpans.forEach(span => {
          const top = span.offsetTop;
          if (curTop === null || Math.abs(top - curTop) > 5) {
            if (curLine.length > 0) lines.push(curLine);
            curLine = [span];
            curTop = top;
          } else {
            curLine.push(span);
          }
        });
        if (curLine.length > 0) lines.push(curLine);

        // For each line (except the last line of the paragraph which is left-aligned in justify):
        lines.slice(0, -1).forEach((lineSpans, li) => {
          if (lineSpans.length > 1) {
            const gaps = [];
            for (let i = 0; i < lineSpans.length - 1; i++) {
              const r1 = lineSpans[i].getBoundingClientRect();
              const r2 = lineSpans[i+1].getBoundingClientRect();
              const gap = r2.left - r1.right;
              gaps.push(gap);
            }
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const maxGap = Math.max(...gaps);
            lineGaps.push({ pi, li, wordCount: lineSpans.length, avgGap, maxGap, gaps });
          }
        });
      });
      return lineGaps;
    }

    return {
      normal: measureSpacesInBox('box-normal'),
      micro: measureSpacesInBox('box-micro')
    };
  });

  console.log('Normal gaps summary:');
  const normalMax = Math.max(...results.normal.map(l => l.maxGap));
  const normalAvg = results.normal.reduce((a, b) => a + b.avgGap, 0) / results.normal.length;
  console.log(`Normal: max=${normalMax.toFixed(1)}px, avg=${normalAvg.toFixed(1)}px`);
  results.normal.filter(l => l.maxGap > 12).forEach(l => console.log(`  Line (words: ${l.wordCount}): max gap = ${l.maxGap.toFixed(1)}px`));

  console.log('Micro gaps summary:');
  const microMax = Math.max(...results.micro.map(l => l.maxGap));
  const microAvg = results.micro.reduce((a, b) => a + b.avgGap, 0) / results.micro.length;
  console.log(`Micro: max=${microMax.toFixed(1)}px, avg=${microAvg.toFixed(1)}px`);
  results.micro.filter(l => l.maxGap > 12).forEach(l => console.log(`  Line (words: ${l.wordCount}): max gap = ${l.maxGap.toFixed(1)}px`));

  await browser.close();
})();
