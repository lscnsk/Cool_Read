// @ts-ignore
import Hypher from 'hypher';
// @ts-ignore
import ruPattern from 'hyphenation.ru';

export interface CatalogBook {
  id: string;
  filename: string;
  title: string;
  author: string;
  series?: string;
  year?: number | string;
  description?: string;
  coverBg?: string;
  coverTextColor?: string;
  coverUrl?: string;
  downloadUrl: string;
  fallbackUrl?: string;
  fileSize: string;
  format?: string;
  pageCount?: number;
}

export interface CatalogSeries {
  id: string;
  name: string;
  authors: string[];
}

let ruHypher: any = null;
try {
  ruHypher = new Hypher(ruPattern);
} catch (e) {
  console.warn('Could not initialize Russian hypher:', e);
}

/**
 * Formats Russian text according to traditional typography rules:
 * - Proper Russian guillemets « »
 * - Em-dash — instead of hyphens
 * - Non-breaking spaces after short prepositions and conjunctions
 * - Soft hyphens for proper word wrapping
 */
export function formatTypography(text: string): string {
  if (!text) return '';
  let res = text
    // Replace quotes
    .replace(/(^|[\s(\[{<])"([a-zA-Zа-яА-ЯёЁ0-9])/g, '$1«$2')
    .replace(/([a-zA-Zа-яА-ЯёЁ0-9.,!?:;])"/g, '$1»')
    .replace(/"/g, '»')
    // Replace hyphens to em-dashes
    .replace(/\s+-\s+/g, ' — ')
    .replace(/\s+--\s+/g, ' — ')
    .replace(/(\d+)-(\d+)/g, '$1–$2');

  // Bind short prepositions and conjunctions with non-breaking space
  res = res.replace(/(^|[\s(«])([вВнНиИкКуУсСоОаАяЯ]|об|Обиз|Из|за|За|от|От|до|До|по|По|не|Не|ни|Ни|же|ли|бы)\s+/g, '$1$2\u00A0');

  // Apply hyphenation with Hypher
  if (ruHypher) {
    try {
      res = ruHypher.hyphenateText(res);
    } catch (e) {
      // Ignore hyphenation errors
    }
  }

  return res;
}

export function extractChronologyYear(book: CatalogBook): number | null {
  if (book.year !== undefined && book.year !== null) {
    const str = String(book.year).trim();
    const match = str.match(/\b(1\d{3}|20\d{2})\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const num = parseFloat(str);
    if (!isNaN(num) && num > 0 && num < 3000) {
      return num;
    }
  }
  return null;
}

export function sortBooksChronologically(books: CatalogBook[]): CatalogBook[] {
  return [...books].sort((a, b) => {
    const yearA = extractChronologyYear(a);
    const yearB = extractChronologyYear(b);
    if (yearA !== null && yearB !== null) {
      return yearA - yearB;
    }
    if (yearA !== null) return -1;
    if (yearB !== null) return 1;
    return a.title.localeCompare(b.title, 'ru');
  });
}

export function getApproximatePageCount(book: CatalogBook): number {
  if (book.pageCount && book.pageCount > 0) return book.pageCount;
  return 0;
}

export const CATALOG_SERIES: CatalogSeries[] = [
  {
    id: 'troisieme-republique',
    name: 'Troisième République',
    authors: ['Эмиль Дюркгейм', 'Марсель Мосс', 'Люсьен Леви-Брюль']
  },
  {
    id: 'the-greater-britain',
    name: 'The Greater Britain',
    authors: ['Эдит Уортон', 'Рафаэль Сабатини', 'Фрэнсис Фицджеральд']
  }
];

export const CATALOG_BOOKS: CatalogBook[] = [
  {
    id: 'dm',
    filename: 'dm.fb2',
    title: 'Предмет и метод социологии. Избранное',
    author: 'Эмиль Дюркгейм',
    series: 'Troisième République',
    year: '1888-1925',
    description: 'Издание объединяет программные труды Французской социологической школы. Книгу открывают ранние тексты Эмиля Дюркгейма: лекция (1888) на первом во Франции курсе социальной науки и диссертация о Монтескье (1892), утверждающая необходимость применения сравнительного метода.\n\nВ центре сборника — трактат «Правила социологического метода» (1895). Во втором издании (1901) автор отвечает критикам и обосновывает социологию как новую эмпирическую науку, строго отделяя ее от философии и психологии. Эту линию продолжают статья Поля Фоконне и Марселя Мосса (1901), впервые вводящая понятие социального института, и работа «Социология и социальные науки» (1903), закрепляющая за дисциплиной статус единой системы.\n\nЗавершает издание манифест Марселя Мосса «О подразделениях социологии» (1925) для послевоенного «Социологического ежегодника». Текст анализирует состояние школы после смерти ее основателя и утверждает программу ее реформы: интеграцию исследований техники, языка, эстетики и политики.',
    coverBg: 'from-[#1e293b] to-[#0f172a]',
    coverTextColor: '#93c5fd',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/dm.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/dm.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/dm.fb2',
    fileSize: '2.9 МБ',
    format: 'fb2',
    pageCount: 436
  },
  {
    id: 'dr',
    filename: 'dr.fb2',
    title: 'О разделении общественного труда. Избранное',
    author: 'Эмиль Дюркгейм',
    series: 'Troisième République',
    year: '1887-1917',
    description: 'Издание объединяет труды Эмиля Дюркгейма по социологии морали, права и эволюции социальных институтов. Открывает книгу обзор «Позитивная наука о морали в Германии» (1887), утверждающий переход от философской этики к эмпирической науке о нравах.\n\nЦентральное место занимает второе издание (1902) фундаментальной работы Дюркгейма «О разделении общественного труда» (1893): анализируя переход от механической солидарности к органической, автор прослеживает трансформацию права и причины аномии. Работа дополняется статьей «Два закона эволюции наказания».\n\nЗавершают издание лекционные курсы, реконструированные учениками и легшие в основу «О разделении общественного труда». В их числе — вводная и заключительная лекции по социологии семьи (последняя восстановлена Марселем Моссом) и материалы «Физики нравов и права» о природе государства, собственности и договора.\n\nИздание дополняет неоконченная работа «Введение в мораль» (1917), восстановленная Марселем Моссом.',
    coverBg: 'from-[#2d1b4e] to-[#130b24]',
    coverTextColor: '#e9d5ff',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/dr.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/dr.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/dr.fb2',
    fileSize: '4.7 МБ',
    format: 'fb2',
    pageCount: 935
  },
  {
    id: 'mr',
    filename: 'mr.fb2',
    title: 'Руководство по этнографии. Избранное',
    author: 'Марсель Мосс',
    series: 'Troisième République',
    year: '1902-1934',
    description: 'Издание объединяет методологические труды французского социолога и этнолога Марселя Мосса (1872–1950). Сборник открывают программные работы: «Очерк общей теории магии» (1902–1903, в соавторстве с Анри Юбером), обосновывающий коллективную природу магических верований через понятие «мана», и статья «Этнография во Франции и за рубежом» (1913) — призыв к созданию во Франции передовых научных этнографических институтов.\n\nВ центре сборника — «Руководство по этнографии», составленное по конспектам и стенограммам лекций, прочитанных в 1926–1939 годах. Обосновывая метод «интенсивной этнографии», Мосс учит фиксировать общество как тотальность, где материальная культура неразрывно связана с правом и религией. Изложенный в руководстве курс, по задумке Мосса, завершает «Фрагмент плана описательной общей социологии» (1934), переводящий эмпирический опыт в теоретическую рамку.\n\nИздание дополняет приложение — практическая инструкция (1931), созданная для проведения экспедиции Дакар—Джибути.',
    coverBg: 'from-[#1b3a2f] to-[#0b1f18]',
    coverTextColor: '#a7f3d0',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/mr.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/mr.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/mr.fb2',
    fileSize: '2.8 МБ',
    format: 'fb2',
    pageCount: 395
  },
  {
    id: 'pm',
    filename: 'pm.fb2',
    title: 'Первобытная ментальность. Ментальные функции в низших обществах',
    author: 'Люсьен Леви-Брюль',
    series: 'Troisième République',
    year: '1910-1922',
    description: 'Издание объединяет два фундаментальных труда Люсьена Леви-Брюля — «Ментальные функции в низших обществах» (1910) и «Первобытная ментальность» (1922), задуманные автором как единое концептуальное введение в теорию первобытного мышления.\n\nФранцузский философ применяет строгий сравнительный социологический метод к обширному этнографическому материалу и доказывает, что логика «первобытных» обществ не является инфантильной формой современного разума, а представляет собой самостоятельную когерентную систему, основанную на пралогическом восприятии и законе мистической сопричастности.\n\nСборник предваряется впервые публикуемым на русском языке очерком психолога Шарля Блонделя (1922), который служит научно-популярным изложением концепции Леви-Брюля.',
    coverBg: 'from-[#3a2f1b] to-[#1f190b]',
    coverTextColor: '#fde68a',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/pm.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/pm.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/pm.fb2',
    fileSize: '5.0 МБ',
    format: 'fb2',
    pageCount: 968
  },
  {
    id: 'ps',
    filename: 'ps.fb2',
    title: 'Первобытная душа. Сверхъестественное и природа в первобытной ментальности',
    author: 'Люсьен Леви-Брюль',
    series: 'Troisième République',
    year: '1927-1931',
    description: 'Издание объединяет взаимосвязанные труды французского антрополога Люсьена Леви-Брюля: «Первобытная душа» (1927) и «Сверхъестественное и природа в первобытной ментальности» (1931). В них автор развивает исследования, начатые в «Ментальных функциях в низших обществах» (1910) и «Первобытной ментальности» (1922).\n\nОпираясь на широчайшую источниковую базу, Леви-Брюль углубляет критику представлений об анимизме первобытных народов и детально разрабатывает проблематику аффективной категории сверхъестественного.\n\nКнигу предваряет лекция 1931 года, служащая емким и последовательным ответом на критику концепции Леви-Брюля в академической среде.',
    coverBg: 'from-[#3b1d1d] to-[#1c0c0c]',
    coverTextColor: '#fca5a5',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/ps.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/ps.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/ps.fb2',
    fileSize: '4.5 МБ',
    format: 'fb2',
    pageCount: 844
  },
  {
    id: 'pt',
    filename: 'pt.fb2',
    title: 'Первобытная мифология. Мистический опыт и символы у первобытных людей',
    author: 'Люсьен Леви-Брюль',
    series: 'Troisième République',
    year: '1934-1939',
    description: 'Настоящее издание завершает публикацию классического наследия французского философа и антрополога Люсьена Леви-Брюля и объединяет его поздние монографии: «Первобытная мифология» (1935) и «Мистический опыт и символы у первобытных людей» (1938). В этих трудах автор смещает фокус с логики на феноменологию: он исследует миф как актуально проживаемую реальность и анализирует символы сквозь призму мистического опыта, неразрывно вплетенного в повседневность.\n\nСборник открывает письмо Эванс-Притчарду (1934), в котором Леви-Брюль дает личный ответ своему знаменитому английскому коллеге и оппоненту. В завершение даны посмертно опубликованные «Тетради» (1938–1939) с предисловием этнолога Мориса Ленхардта — черновик работы, подводящей итоги тридцатилетнему исследованию. В ней Леви-Брюль возвращается к проблемам, поставленным еще в «Ментальных функциях», радикально переосмысляет понятия «пралогический» и «сопричастность» и утверждает универсальность структуры человеческого разума.',
    coverBg: 'from-[#1e333a] to-[#0d1a1e]',
    coverTextColor: '#bae6fd',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/pt.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/pt.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/pt.fb2',
    fileSize: '4.3 МБ',
    format: 'fb2',
    pageCount: 819
  },
  {
    id: 'ge',
    filename: 'ge.fb2',
    title: 'Пробный камень. Избранное',
    author: 'Эдит Уортон',
    series: 'The Greater Britain',
    year: '1899-1901',
    description: 'Издание объединяет раннюю прозу Эдит Уортон (1862–1937): сборники новелл «Сильнейшая склонность» (1899) и «Решающие мгновения» (1901), а также повесть «Пробный камень» (1900).\n\nНаписанные на рубеже веков и отмеченные безупречным чувством меры и психологической зоркостью, эти произведения обращаются к скрытым драмам человеческой души, где за отточенным светским этикетом и внешней невозмутимостью разворачивается невидимая миру борьба между подлинным чувством, жаждой успеха и суровым судом собственной совести, требующей платить сполна за каждый нравственный компромисс.',
    coverBg: 'from-[#3a2027] to-[#1e1014]',
    coverTextColor: '#f7ceda',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/ge.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/ge.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/ge.fb2',
    fileSize: '2.1 МБ',
    format: 'fb2',
    pageCount: 391
  },
  {
    id: 'sh',
    filename: 'sh.fb2',
    title: 'Морской ястреб',
    author: 'Рафаэль Сабатини',
    series: 'The Greater Britain',
    year: '1915',
    description: '«Морской ястреб» (1915) — один из самых захватывающих и известных исторических приключенческих романов Рафаэля Сабатини.\n\nАнглия, эпоха Елизаветы I. Сэр Оливер Трессилиан — отважный корнуоллский дворянин, снискавший славу на море и готовящийся к свадьбе с прекрасной Розамундой Годолфин. Его жизнь кажется безупречной, а будущее — безоблачным.\n\nОднако внезапная трагедия, ложное обвинение в преступлении и предательство тех, кому он доверял больше всего, в один миг рушат его счастье. Лишенный чести, дома и свободы, сэр Оливер проходит через горнило тяжелейших испытаний и перерождается в грозного предводителя пиратов — Морского Ястреба, наводящего ужас на все Средиземноморье.\n\nНо сумеет ли он заглушить в сердце тоску по родине и любовь к женщине, чье неверие ранило его больнее любого клинка?',
    coverBg: 'from-[#1e293b] to-[#0f172a]',
    coverTextColor: '#93c5fd',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/sh.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/sh.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/sh.fb2',
    fileSize: '2.6 МБ',
    format: 'fb2',
    pageCount: 336
  },
  {
    id: 'ff',
    filename: 'ff.fb2',
    title: 'Флэпперы и философы. Сказки века джаза',
    author: 'Фрэнсис Фицджеральд',
    series: 'The Greater Britain',
    year: '1920-1922',
    description: 'В книгу вошли два первых авторских сборника Фрэнсиса Скотта Фицджеральда — «Флэпперы и философы» (1920) и «Сказки века джаза» (1922).\n\nНаписанные для ведущих журналов эпохи (The Saturday Evening Post, The Smart Set, Collier’s), эти девятнадцать историй создавались на волне шумного успеха дебютного романа автора и сочетали коммерческие сюжеты о дерзкой молодежи с глубокими социальными драмами и сатирой. Настоящее издание включает весь корпус произведений в их оригинальном составе — от ранних новелл («Ледяной дворец», «Первое мая») до гротескных шедевров («Алмаз величиной с отель „Ритц“», «Загадочная история Бенджамина Баттона»), а также две одноактные пьесы, литературную пародию «Джемина» и авторские комментарии 1922 года.',
    coverBg: 'from-[#3a2f1b] to-[#1f190b]',
    coverTextColor: '#fde68a',
    coverUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/covers/ff.jpg',
    downloadUrl: 'https://raw.githubusercontent.com/lscnsk/lscnsk_library/main/ff.fb2',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/lscnsk/lscnsk_library@main/ff.fb2',
    fileSize: '2.0 МБ',
    format: 'fb2',
    pageCount: 433
  }
];
