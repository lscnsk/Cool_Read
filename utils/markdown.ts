import { Chapter } from '../types';

/**
 * Converts chapter HTML content to clean Markdown text,
 * stripping bionic reading artifacts and dropcaps.
 */
export function convertChapterToMarkdown(chapter: Chapter, sourceHtml?: string): string {
  if (!chapter && !sourceHtml) return '';

  const rawHtml = sourceHtml || chapter?.content || '';
  if (!rawHtml.trim()) {
    return chapter?.name ? `# ${chapter.name}\n` : '';
  }

  // Strip xml declaration if present
  let cleanHtml = rawHtml.replace(/^<\?xml[^>]*\?>/i, '').trim();

  // Parse HTML into a temporary DOM tree
  const parser = new DOMParser();
  let doc: Document;
  if (/<!DOCTYPE/i.test(cleanHtml) || /<html[\s>]/i.test(cleanHtml) || /<body[\s>]/i.test(cleanHtml)) {
    doc = parser.parseFromString(cleanHtml, 'text/html');
  } else {
    doc = parser.parseFromString(`<!DOCTYPE html><html><head></head><body>${cleanHtml}</body></html>`, 'text/html');
  }

  const root = doc.body || doc.documentElement;
  if (!root) return '';

  // 1. Remove non-content elements
  root.querySelectorAll('script, style, svg, noscript').forEach(el => el.remove());

  // 2. Strip Bionic Reading tags (b.font-bold created by bionic formatter)
  root.querySelectorAll('b.font-bold').forEach(b => {
    const textNode = doc.createTextNode(b.textContent || '');
    b.parentNode?.replaceChild(textNode, b);
  });

  // 3. Strip Dropcaps, reader-dash, and typographic wrapper spans into plain text
  root.querySelectorAll('.dropcap, .drop-cap, .reader-dropcap, .first-letter, .dash-word-lead, .dash-fixed, .dash-space, .reader-dash, .reader-dash-glyph, .punct-tight, .punct-dots, .punct-mark').forEach(el => {
    const text = el.textContent || '';
    const textNode = doc.createTextNode(text);
    el.parentNode?.replaceChild(textNode, el);
  });

  // 4. Recursive conversion
  function nodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
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

    if (el.classList.contains('empty-line')) {
      return '\n\n';
    }

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
        if (el.classList.contains('verse')) {
          const text = getChildrenMd().trim();
          return text ? `${text}  \n` : '\n';
        }
        const text = getChildrenMd().trim();
        return text ? `${text}\n\n` : '';
      }
      case 'v': {
        const text = getChildrenMd().trim();
        return text ? `${text}  \n` : '\n';
      }
      case 'stanza': {
        const text = getChildrenMd().trim();
        return text ? `${text}\n\n` : '';
      }
      case 'poem': {
        const text = getChildrenMd().trim();
        return text ? `${text}\n\n` : '';
      }
      case 'blockquote':
      case 'cite':
      case 'epigraph':
      case 'annotation': {
        const text = getChildrenMd().trim();
        if (!text) return '';
        const lines = text.split('\n');
        return lines.map(l => `> ${l}`).join('\n') + '\n\n';
      }
      case 'text-author': {
        const text = getChildrenMd().trim();
        return text ? `> – *${text}*\n\n` : '';
      }
      case 'subtitle': {
        const text = getChildrenMd().trim();
        return text ? `### ${text}\n\n` : '';
      }
      case 'date': {
        const text = getChildrenMd().trim();
        return text ? `*${text}*\n\n` : '';
      }
      case 'section':
      case 'article':
      case 'main':
      case 'header':
      case 'footer':
      case 'aside':
      case 'details':
      case 'figure':
      case 'figcaption':
      case 'center': {
        const text = getChildrenMd().trim();
        return text ? `${text}\n\n` : '';
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
      case 'b':
      case 'strong-text': {
        const text = getChildrenMd().trim();
        return text ? `**${text}**` : '';
      }
      case 'em':
      case 'i':
      case 'emphasis': {
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
      case 'table': {
        let res = '';
        const rows = el.querySelectorAll('tr');
        rows.forEach(tr => {
          const cells = Array.from(tr.querySelectorAll('th, td')).map(c => nodeToMarkdown(c).trim());
          if (cells.length > 0) {
            res += `| ${cells.join(' | ')} |\n`;
          }
        });
        return res ? `${res}\n` : '';
      }
      case 'title': {
        const text = getChildrenMd().trim();
        return text ? `## ${text}\n\n` : '';
      }
      case 'div': {
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
          return text ? `> – *${text}*\n\n` : '';
        }
        if (el.classList.contains('poem') || el.classList.contains('stanza')) {
          const text = getChildrenMd().trim();
          return text ? `${text}\n\n` : '';
        }
        const text = getChildrenMd();
        return text ? `${text}\n` : '';
      }
      default: {
        return getChildrenMd();
      }
    }
  }

  let markdown = '';
  root.childNodes.forEach(child => {
    markdown += nodeToMarkdown(child);
  });

  // Clean up excessive newlines while preserving markdown block structure
  markdown = markdown
    .replace(/[^\S\r\n]{2,}(?!\n)/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If chapter title is provided and not already at start of markdown, prepend it
  const title = (chapter?.name || '').trim();
  if (title && title !== '-' && title.toLowerCase() !== 'cover') {
    const firstLine = markdown.split('\n')[0]?.trim() || '';
    const cleanFirstLine = firstLine.replace(/^#+\s*/, '').trim();
    if (cleanFirstLine.toLowerCase() !== title.toLowerCase()) {
      markdown = `# ${title}\n\n${markdown}`;
    }
  }

  return markdown;
}
