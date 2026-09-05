const puppeteer = require('puppeteer');
const Hypher = require('hypher');
const ruPattern = require('hyphenation.ru');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667 });

  const paragraphs = [
    'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему. Все смешалось в доме Облонских.',
    'Жена узнала, что муж был в связи с бывшею в их доме француженкою-гувернанткой, и объявила мужу, что не может жить с ним в одном доме.',
    'Положение это продолжалось уже третий день и мучительно чувствовалось и самими супругами, и всеми членами семьи, и домочадцами.',
    'Все члены семьи и домочадцы чувствовали, что нет смысла в их сожительстве и что на каждом постоялом дворе случайно сошедшиеся люди более связаны между собой, чем они.',
    'Жена не выходила из своих комнат, мужа третий день не было дома. Дети бегали по всему дому, как потерянные; англичанка поссорилась с экономкой и написала записку приятельнице.',
    'В одном из отдаленных уголков нашей необъятной родины происходили самые удивительные и необыкновенные события, о которых мало кто подозревал.',
    'Сквозь узкие стрельчатые окна пробивался мерцающий свет старинного бронзового канделябра, освещая пыльные стеллажи с фолиантами.',
    'Никто из окрестных жителей не осмеливался приблизиться к этому странному жилищу после полуночи, опасаясь необъяснимых происшествий.',
    'Именно здесь хранилась тайна древней рукописи, способной изменить судьбы многих поколений исследователей и искателей приключений.',
    'Старик молча покачал головой и указал на пожелтевшую карту, лежавшую на массивном дубовом столе перед потрескивающим камином.'
  ];

  const h = new Hypher(ruPattern);
  const hyphHtml = paragraphs.map(p => '<p>' + h.hyphenateText(p) + '</p>').join('');

  for (const ls of ['0', '-0.01em', '-0.018em', '-0.025em']) {
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 16px; font-family: 'Literata', Georgia, serif; font-size: 18px; line-height: 1.55; }
          .reader-content { width: 343px; text-align: justify; text-justify: auto; }
          .reader-content p { text-indent: 1.5em; margin: 0 0 0.8em 0; letter-spacing: ${ls}; }
        </style>
      </head>
      <body>
        <div id="reader" class="reader-content">${hyphHtml}</div>
      </body>
      </html>
    `);

    const stats = await page.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('#reader p'));
      const spaces = [];
      ps.forEach(p => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let tn;
        while (tn = walker.nextNode()) {
          const text = tn.nodeValue;
          for (let i = 0; i < text.length; i++) {
            if (text[i] === ' ') {
              const range = document.createRange();
              range.setStart(tn, i);
              range.setEnd(tn, i + 1);
              const rects = range.getClientRects();
              if (rects.length > 0 && rects[0].width > 0.1) {
                spaces.push(rects[0].width);
              }
            }
          }
        }
      });
      const max = Math.max(...spaces);
      const avg = spaces.reduce((a, b) => a + b, 0) / spaces.length;
      const over10 = spaces.filter(s => s > 10).length;
      const over12 = spaces.filter(s => s > 12).length;
      const over14 = spaces.filter(s => s > 14).length;
      return { max, avg, total: spaces.length, over10, over12, over14 };
    });

    console.log(`ls=${ls.padEnd(9)}: max=${stats.max.toFixed(1)}px, avg=${stats.avg.toFixed(1)}px, >10px: ${stats.over10}, >12px: ${stats.over12}, >14px: ${stats.over14}`);
  }

  await browser.close();
})();
