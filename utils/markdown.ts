import { Chapter } from '../types';

/**
 * Converts chapter HTML content to clean Markdown text,
 * stripping bionic reading artifacts and dropcaps.
 */
export function convertChapterToMarkdown(chapter: Chapter): string {
  if (!chapter) return '';

  const rawHtml = chapter.content || '';
  if (!rawHtml.trim()) {
    return chapter.name ? `# ${chapter.name}\n` : '';
  }

  // Parse HTML into a temporary DOM tree
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');
  const body = doc.body;

  // 1. Remove script, style, and svg elements
  body.querySelectorAll('script, style, svg').forEach(el => el.remove());

  // 2. Strip Bionic Reading tags (b.font-bold created by bionic formatter)
  body.querySelectorAll('b.font-bold').forEach(b => {
    const textNode = doc.createTextNode(b.textContent || '');
    b.parentNode?.replaceChild(textNode, b);
  });

  // 3. Strip Dropcaps and merge them cleanly into surrounding text
  body.querySelectorAll('.dropcap, .drop-cap, .first-letter, .dash-word-lead, .dash-fixed, .dash-space, .punct-tight').forEach(el => {
    const text = el.textContent || '';
    const textNode = doc.createTextNode(text);
    el.parentNode?.replaceChild(textNode, el);
  });

  // 4. Helper function to recursively convert DOM nodes to Markdown
  function nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      // Clean soft hyphens, zero-width spaces, and normalize non-breaking spaces
      const val = node.nodeValue || '';
      return val
        .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    // Check for dropcap or dash lead inside an element
    if (el.classList.contains('empty-line')) {
      return '\n\n';
    }

    // Children markdown
    const getChildrenMd = (): string => {
      let res = '';
      node.childNodes.forEach(child => {
        res += nodeToMarkdown(child);
      });
      return res;
    };

    switch (tagName) {
      case 'h1': {
        const text = getChildrenMd().trim();
        return text ? `# ${text}\n\n` : '';
      }
      case 'h2': {
        const text = getChildrenMd().trim();
        return text ? `## ${text}\n\n` : '';
      }
      case 'h3': {
        const text = getChildrenMd().trim();
        return text ? `### ${text}\n\n` : '';
      }
      case 'h4': {
        const text = getChildrenMd().trim();
        return text ? `#### ${text}\n\n` : '';
      }
      case 'h5': {
        const text = getChildrenMd().trim();
        return text ? `##### ${text}\n\n` : '';
      }
      case 'h6': {
        const text = getChildrenMd().trim();
        return text ? `###### ${text}\n\n` : '';
      }
      case 'p': {
        // Check if this paragraph is a verse in a poem
        if (el.classList.contains('verse')) {
          const text = getChildrenMd().trim();
          return text ? `${text}  \n` : '\n';
        }
        const text = getChildrenMd().trim();
        return text ? `${text}\n\n` : '';
      }
      case 'blockquote':
      case 'cite': {
        const text = getChildrenMd().trim();
        if (!text) return '';
        const lines = text.split('\n');
        return lines.map(l => `> ${l}`).join('\n') + '\n\n';
      }
      case 'ul': {
        let res = '';
        el.querySelectorAll(':scope > li').forEach(li => {
          const itemText = nodeToMarkdown(li).trim();
          if (itemText) res += `- ${itemText}\n`;
        });
        return res ? `${res}\n` : '';
      }
      case 'ol': {
        let res = '';
        let idx = 1;
        el.querySelectorAll(':scope > li').forEach(li => {
          const itemText = nodeToMarkdown(li).trim();
          if (itemText) {
            res += `${idx}. ${itemText}\n`;
            idx++;
          }
        });
        return res ? `${res}\n` : '';
      }
      case 'li': {
        return getChildrenMd().trim();
      }
      case 'strong':
      case 'b': {
        const text = getChildrenMd().trim();
        return text ? `**${text}**` : '';
      }
      case 'em':
      case 'i': {
        const text = getChildrenMd().trim();
        return text ? `*${text}*` : '';
      }
      case 'code': {
        const text = getChildrenMd();
        return `\`${text}\``;
      }
      case 'pre': {
        const text = el.textContent || '';
        return `\`\`\`\n${text.trim()}\n\`\`\`\n\n`;
      }
      case 'hr': {
        return '---\n\n';
      }
      case 'br': {
        return '  \n';
      }
      case 'a': {
        const text = getChildrenMd().trim();
        const href = el.getAttribute('href');
        if (!text) return '';
        // If it's a footnote reference (e.g. #note-1 or [1])
        if (href && href.startsWith('#')) {
          return text;
        }
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          return `[${text}](${href})`;
        }
        return text;
      }
      case 'img': {
        const alt = el.getAttribute('alt') || 'Image';
        const src = el.getAttribute('src') || '';
        if (!src) return '';
        return `![${alt}](${src})\n\n`;
      }
      case 'div': {
        // Special div handling (titles, epigraphs, poems, subtitles)
        if (el.classList.contains('title')) {
          const text = getChildrenMd().trim();
          if (!text) return '';
          if (el.classList.contains('h1')) return `# ${text}\n\n`;
          if (el.classList.contains('h2')) return `## ${text}\n\n`;
          if (el.classList.contains('h3')) return `### ${text}\n\n`;
          return `## ${text}\n\n`;
        }
        if (el.classList.contains('subtitle')) {
          const text = getChildrenMd().trim();
          return text ? `### ${text}\n\n` : '';
        }
        if (el.classList.contains('epigraph') || el.classList.contains('annotation')) {
          const text = getChildrenMd().trim();
          if (!text) return '';
          return text.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        }
        if (el.classList.contains('text-author')) {
          const text = getChildrenMd().trim();
          return text ? `> — *${text}*\n\n` : '';
        }
        if (el.classList.contains('poem') || el.classList.contains('stanza')) {
          const text = getChildrenMd().trim();
          return text ? `${text}\n\n` : '';
        }
        // Generic div: process children
        const text = getChildrenMd();
        return text ? `${text}\n` : '';
      }
      default: {
        return getChildrenMd();
      }
    }
  }

  let markdown = '';
  body.childNodes.forEach(child => {
    markdown += nodeToMarkdown(child);
  });

  // Clean up excessive whitespace and newlines
  markdown = markdown
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If chapter title is not already present as first heading, prepend it
  const title = (chapter.name || '').trim();
  if (title && title !== '-' && title.toLowerCase() !== 'cover') {
    const firstLine = markdown.split('\n')[0]?.trim() || '';
    const cleanFirstLine = firstLine.replace(/^#+\s*/, '').trim();
    if (cleanFirstLine.toLowerCase() !== title.toLowerCase()) {
      markdown = `# ${title}\n\n${markdown}`;
    }
  }

  return markdown;
}
