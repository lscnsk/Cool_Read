import JSZip from 'jszip';
import { Book, Chapter } from '../types';

// Helper to create the cover chapter
const createCoverChapter = (title: string, author: string, coverUrl?: string): Chapter => {
    return {
        name: "Cover",
        url: '',
        content: `
            <div class="book-cover-page">
                ${coverUrl ? `<img src="${coverUrl}" alt="Cover" />` : ''}
                <h1>${title}</h1>
                <h2>${author}</h2>
            </div>
        `,
        length: 200, // Small weight
        level: 0
    };
};

const getMimeType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'svg': return 'image/svg+xml';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
};

// Helper: Case-insensitive file lookup in ZIP
const getFileFromZip = (zip: JSZip, path: string) => {
    const direct = zip.file(path);
    if (direct) return direct;
    
    const lower = path.toLowerCase();
    for (const key of Object.keys(zip.files)) {
        if (key.toLowerCase() === lower) return zip.files[key];
    }
    return null;
};

// --- PATH RESOLUTION HELPERS ---
const resolvePath = (basePath: string, relativePath: string): string => {
    try {
        if (!relativePath) return "";
        relativePath = decodeURIComponent(relativePath);
        relativePath = relativePath.split('#')[0].split('?')[0];

        if (relativePath.startsWith('/')) return relativePath.substring(1);

        const stack = basePath.split('/');
        stack.pop(); 
        
        const parts = relativePath.split('/');
        
        for (const part of parts) {
            if (part === '.' || part === '') continue;
            if (part === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        return stack.join('/');
    } catch(e) {
        return relativePath;
    }
};


// --- TOC PARSING HELPERS ---

interface TocItem {
    label: string;
    href: string; // This should be the FULL ZIP PATH
    level: number;
}

const parseNCX = (xmlString: string, ncxFullPath: string): TocItem[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const items: TocItem[] = [];

    const processNavPoint = (point: Element, level: number) => {
        const label = point.querySelector("navLabel > text")?.textContent?.trim() || "-";
        let contentSrc = point.querySelector("content")?.getAttribute("src") || "";
        
        if (contentSrc) {
            const fullPath = resolvePath(ncxFullPath, contentSrc);
            items.push({ label, href: fullPath, level });
        }

        const children = Array.from(point.children).filter(c => c.tagName.toLowerCase() === 'navpoint');
        children.forEach(child => processNavPoint(child, level + 1));
    };

    const rootPoints = Array.from(doc.querySelectorAll("navMap > navPoint"));
    rootPoints.forEach(p => processNavPoint(p, 0));
    
    return items;
};

const parseNavHtml = (htmlString: string, navFullPath: string): TocItem[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "application/xhtml+xml");
    const items: TocItem[] = [];

    const nav = doc.querySelector('nav[epub\\:type="toc"]') || doc.querySelector('nav[role="doc-toc"]') || doc.querySelector('nav');
    
    if (!nav) return [];

    const processOl = (ol: Element, level: number) => {
        const lis = Array.from(ol.children).filter(c => c.tagName.toLowerCase() === 'li');
        lis.forEach(li => {
            const anchor = li.querySelector(':scope > a') || li.querySelector(':scope > span'); 
            const nestedOl = li.querySelector(':scope > ol');

            if (anchor) {
                const label = anchor.textContent?.trim() || "-";
                const href = anchor.getAttribute("href");
                if (href) {
                     const fullPath = resolvePath(navFullPath, href);
                     items.push({ label, href: fullPath, level });
                } else if (nestedOl) {
                     items.push({ label, href: '', level });
                }
            }

            if (nestedOl) {
                processOl(nestedOl, level + 1);
            }
        });
    };

    const rootOl = nav.querySelector('ol');
    if (rootOl) processOl(rootOl, 0);

    return items;
};


export const parseFb2 = async (file: Blob, bookId: string): Promise<Partial<Book>> => {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");
  
  // Extract Title
  const title = doc.querySelector('description title-info book-title')?.textContent || "Unknown Title";
  
  // Extract Author
  let author = "";
  const authorNode = doc.querySelector('description title-info author');
  if (authorNode) {
      const first = authorNode.querySelector('first-name')?.textContent || "";
      const last = authorNode.querySelector('last-name')?.textContent || "";
      const middle = authorNode.querySelector('middle-name')?.textContent || "";
      author = [first, middle, last].filter(Boolean).join(" ");
  }

  // Extract Series
  let series = "";
  const seriesNode = doc.querySelector('description title-info sequence') || doc.querySelector('description title-info series') || doc.querySelector('description publish-info sequence') || doc.querySelector('description publish-info series');
  if (seriesNode) {
      const name = seriesNode.getAttribute('name');
      const number = seriesNode.getAttribute('number');
      if (name) {
          series = number ? `${name.trim()} #${number}` : name.trim();
      } else {
          series = seriesNode.textContent?.trim() || "";
      }
  }

  // Extract Images (Binaries)
  const binaries = Array.from(doc.querySelectorAll('binary'));
  const imageMap = new Map<string, string>();
  
  binaries.forEach(bin => {
      const id = bin.getAttribute('id');
      const contentType = bin.getAttribute('content-type') || 'image/jpeg';
      const content = bin.textContent?.trim();
      if (id && content) {
          imageMap.set(id, `data:${contentType};base64,${content}`);
      }
  });

  // Try to find cover
  let coverUrl: string | undefined = undefined;
  const coverImageNode = doc.querySelector('coverpage image') || doc.querySelector('description title-info coverpage image');
  if (coverImageNode) {
      let href = coverImageNode.getAttribute('l:href') || 
                 coverImageNode.getAttribute('xlink:href') || 
                 coverImageNode.getAttribute('href') ||
                 coverImageNode.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!href) {
          for (let i = 0; i < coverImageNode.attributes.length; i++) {
              const attr = coverImageNode.attributes[i];
              if (attr.name.toLowerCase().endsWith('href')) {
                  href = attr.value;
                  break;
              }
          }
      }
      if (href) {
          const cleanId = href.startsWith('#') ? href.substring(1) : href;
          coverUrl = imageMap.get(cleanId);
      }
  }
  if (!coverUrl) {
      const coverId = Array.from(imageMap.keys()).find(k => k.toLowerCase().includes('cover') || k.toLowerCase().includes('image1'));
      if (coverId) coverUrl = imageMap.get(coverId);
  }
  if (!coverUrl && imageMap.size > 0) {
      coverUrl = imageMap.values().next().value;
  }

  // --- 1. INDEX FOOTNOTES GLOBALLY ---
  const notesMap = new Map<string, string>();
  
  const notesBody = doc.querySelector('body[name="notes"]');
  if (notesBody) {
      const sections = Array.from(notesBody.querySelectorAll('section'));
      for (let i = 0; i < sections.length; i++) {
          if (i % 50 === 0) await new Promise(r => setTimeout(r, 0)); // Yield
          const section = sections[i];
          const id = section.getAttribute('id');
          if (id) {
             const titleNode = section.querySelector('title');
             const ps = Array.from(section.querySelectorAll('p')).filter(p => {
                 let parent = p.parentElement;
                 while (parent && parent !== section) {
                     if (parent.tagName.toLowerCase() === 'title') return false;
                     parent = parent.parentElement;
                 }
                 return true;
             });
             
             const titleText = titleNode ? (titleNode.textContent || "").trim() : "";
             
             let noteHtml = ``;
             if (titleText) {
                 noteHtml += `<strong>${titleText}</strong> `;
             }
             
             const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
             
             ps.forEach((p, index) => {
                 let text = (p.textContent || "").trim();
                 if (index === 0 && titleText && text.toLowerCase().startsWith(titleText.toLowerCase())) {
                     const regex = new RegExp(`^${escapeRegExp(titleText)}\\s*[\\.\\)\\-]*\\s*`, 'i');
                     text = text.replace(regex, "");
                 }
                 if (text) {
                     noteHtml += `<span>${text}</span> `;
                 }
             });
             
             notesMap.set(id, noteHtml);
          }
      }
  }

  // --- 2. PARSE CHAPTERS ---
  const bodies = Array.from(doc.querySelectorAll('body'));
  const chapters: Chapter[] = [];
  
  chapters.push(createCoverChapter(title, author, coverUrl));

  const getSectionLevel = (sec: Element): number => {
      let lvl = 0;
      let p = sec.parentElement;
      while (p && p.tagName.toLowerCase() === 'section') {
          lvl++;
          p = p.parentElement;
      }
      return lvl;
  };

  for (const body of bodies) {
      if (body.getAttribute('name') === 'notes') continue; 

      const allSections = Array.from(body.querySelectorAll('section'));
      const sections = allSections.filter(sec => getSectionLevel(sec) < 2);

      for (let idx = 0; idx < sections.length; idx++) {
          await new Promise(r => setTimeout(r, 0)); // Yield per section
          const section = sections[idx];
          const titleNode = section.querySelector('title');
          const sectionTitle = titleNode?.textContent?.trim() || "-";
          
          let level = getSectionLevel(section);
          
          // Image replacements
          const images = Array.from(section.querySelectorAll('image'));
          images.forEach(img => {
              const href = img.getAttribute('l:href') || img.getAttribute('xlink:href');
              if (href && href.startsWith('#')) {
                  const src = imageMap.get(href.substring(1));
                  if (src) img.setAttribute('src', src);
              }
          });

          // Link Handling
          const links = Array.from(section.querySelectorAll('a'));
          links.forEach((a) => {
              const href = a.getAttribute('l:href') || a.getAttribute('xlink:href');
              if (href && href.startsWith('#')) {
                  const id = href.substring(1);
                  a.setAttribute('href', href);
                  a.removeAttribute('l:href');
                  a.removeAttribute('xlink:href');
                  
                  // Ensure href points to the global note ID
                  if (notesMap.has(id)) {
                      a.setAttribute('href', `#note-${id}`);
                      // ADDED: Create a reference ID so we can jump back
                      a.setAttribute('id', `ref-${id}`);
                  }
              }
          });

          const serializer = new XMLSerializer();
          
          const serializeNode = (node: Element, curLevel: number): { html: string, chars: number } => {
              let html = "";
              let chars = 0;
              
              Array.from(node.children).forEach(child => {
                  const tag = child.tagName.toLowerCase();
                  
                  if (tag === 'section') {
                      if (getSectionLevel(child) < 2) {
                          return;
                      }
                      const subRes = serializeNode(child, curLevel + 1);
                      html += subRes.html;
                      chars += subRes.chars;
                      return;
                  }
                  
                  if (tag === 'title') {
                      const headingClass = curLevel === level ? 'title h2' : (curLevel === level + 1 ? 'title h3' : 'title h4');
                      const titleDiv = doc.createElement('div');
                      titleDiv.className = headingClass;
                      const pElements = child.querySelectorAll('p');
                      if (pElements.length > 0) {
                          titleDiv.innerHTML = child.innerHTML;
                      } else {
                          const textContent = (child.textContent || '').trim();
                          titleDiv.innerHTML = textContent ? `<p>${child.innerHTML}</p>` : '';
                      }
                      html += serializer.serializeToString(titleDiv);
                      chars += (child.textContent || "").length;
                      return;
                  }
                  
                  if (tag === 'empty-line') {
                      html += '<div class="empty-line">&nbsp;</div>'; 
                      return;
                  }
                  
                  html += serializer.serializeToString(child);
                  chars += (child.textContent || "").length;
              });
              
              return { html, chars };
          };

          const result = serializeNode(section, level);
          let content = result.html;
          let charCount = result.chars;
          
          // Cleanup
          // Clean up self-closing emphasis and strong-text to avoid dangling unclosed tags in HTML
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?emphasis\s*\/>/gi, '');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?strong-text\s*\/>/gi, '');

          content = content.replace(/<(?:[a-zA-Z0-9]+:)?emphasis[^>]*>/gi, '<em>').replace(/<\/(?:[a-zA-Z0-9]+:)?emphasis>/gi, '</em>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?strong-text[^>]*>/gi, '<strong>').replace(/<\/(?:[a-zA-Z0-9]+:)?strong-text>/gi, '</strong>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?subtitle[^>]*>(.*?)<\/(?:[a-zA-Z0-9]+:)?subtitle>/gis, '<h3 class="subtitle">$1</h3>');
          content = content.replace(/<empty-line\s*\/>/gi, '<div class="empty-line">&nbsp;</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?epigraph[^>]*>/gi, '<div class="epigraph">').replace(/<\/(?:[a-zA-Z0-9]+:)?epigraph>/gi, '</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?cite[^>]*>/gi, '<blockquote class="cite">').replace(/<\/(?:[a-zA-Z0-9]+:)?cite>/gi, '</blockquote>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?annotation[^>]*>/gi, '<div class="annotation">').replace(/<\/(?:[a-zA-Z0-9]+:)?annotation>/gi, '</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?poem[^>]*>/gi, '<div class="poem">').replace(/<\/(?:[a-zA-Z0-9]+:)?poem>/gi, '</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?text-author[^>]*>/gi, '<div class="text-author">').replace(/<\/(?:[a-zA-Z0-9]+:)?text-author>/gi, '</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?date[^>]*>/gi, '<div class="date">').replace(/<\/(?:[a-zA-Z0-9]+:)?date>/gi, '</div>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?v[^>]*>/gi, '<p class="verse">').replace(/<\/(?:[a-zA-Z0-9]+:)?v>/gi, '</p>');
          content = content.replace(/<(?:[a-zA-Z0-9]+:)?stanza[^>]*>/gi, '<div class="stanza">').replace(/<\/(?:[a-zA-Z0-9]+:)?stanza>/gi, '</div>');
          content = content.replace(/<p>\s*<h3/gi, '<h3').replace(/<\/h3>\s*<\/p>/gi, '</h3>');
          content = content.replace(/l:href/g, 'href').replace(/xlink:href/g, 'href');
          content = content.replace(/xmlns="[^"]*"/g, '');

          // Markdown and Lib.ru style formatting fallbacks
          content = content.replace(/\(\*([^*<>]+)\*\)/g, '<em>$1</em>'); // (* text *)
          content = content.replace(/(^|[^\*])\*\*([^*<>]+)\*\*(?=[^\*]|$)/g, '$1<strong>$2</strong>'); // **text**
          content = content.replace(/(^|[^\*])\*([^*<>]+)\*(?=[^\*]|$)/g, '$1<em>$2</em>'); // *text*

          chapters.push({
             name: sectionTitle,
             url: '',
             content: content,
             length: charCount,
             level: level
          });
      }
  }

  // --- 3. CREATE NOTES CHAPTER ---
  if (notesMap.size > 0) {
      let notesContent = `<h1 class="title">Сноски</h1><div class="notes-list">`;
      notesMap.forEach((html, id) => {
          notesContent += `
            <div class="note-entry" id="note-${id}">
                <div class="note-header">
                     <a href="#ref-${id}" class="note-back-link">^</a>
                </div>
                <div class="note-content">${html}</div>
                <hr class="note-divider"/>
            </div>
          `;
      });
      notesContent += `</div>`;

      chapters.push({
          name: "Сноски",
          url: '',
          content: notesContent,
          length: notesContent.length,
          level: 0
      });
  }

  return { title, author, series, coverUrl, chapters, type: 'ebook' };
};

const isFootnoteLink = (a: HTMLAnchorElement) => {
    if (a.getAttribute('epub:type') === 'noteref') return true;
    if (a.getAttribute('role') === 'doc-noteref') return true;
    
    const href = a.getAttribute('href');
    if (!href || !href.includes('#')) return false;
    
    const text = a.textContent?.trim() || '';
    if (/^\[?\d+\]?$/.test(text) || /^\*+$/.test(text)) return true;
    
    if (a.parentElement?.tagName.toLowerCase() === 'sup') return true;
    
    return false;
};

export const parseEpub = async (file: Blob, bookId: string): Promise<Partial<Book>> => {
    // Standard Epub Implementation
    const zip = await JSZip.loadAsync(file);
    const container = await zip.file("META-INF/container.xml")?.async("string");
    if (!container) throw new Error("Invalid EPUB");
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(container, "text/xml");
    const opfPath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
    if (!opfPath) throw new Error("No OPF found");
    const opfContent = await zip.file(opfPath)?.async("string");
    if (!opfContent) throw new Error("OPF Missing");
    const opfDoc = parser.parseFromString(opfContent, "text/xml");
    const title = opfDoc.querySelector("metadata title")?.textContent || "Unknown";
    const author = opfDoc.querySelector("metadata creator")?.textContent || "";
    
    // Extract series (calibre specific meta tag)
    let series = "";
    const metaSeries = opfDoc.querySelector('metadata meta[name="calibre:series"]');
    if (metaSeries) {
        series = metaSeries.getAttribute("content") || "";
        const metaSeriesIndex = opfDoc.querySelector('metadata meta[name="calibre:series_index"]');
        if (metaSeriesIndex && series) {
            const index = metaSeriesIndex.getAttribute("content");
            if (index) series = `${series} #${index}`;
        }
    }
    
    const manifestItems = Array.from(opfDoc.querySelectorAll("manifest item"));
    const manifest: Record<string, string> = {};
    let coverHref: string | undefined;
    let navHref: string | undefined;
    let ncxHref: string | undefined;
    manifestItems.forEach(item => {
        const id = item.getAttribute("id")!;
        const href = item.getAttribute("href")!;
        const properties = item.getAttribute("properties") || "";
        const mediaType = item.getAttribute("media-type");
        manifest[id] = href;
        if (properties.includes("cover-image") || id.toLowerCase().includes("cover")) coverHref = href;
        if (properties.includes("nav")) navHref = href;
        if (mediaType === "application/x-dtbncx+xml") ncxHref = href;
    });
    if (!ncxHref) {
        const spineTag = opfDoc.querySelector("spine");
        const tocId = spineTag?.getAttribute("toc");
        if (tocId && manifest[tocId]) ncxHref = manifest[tocId];
    }
    if (!coverHref) {
        const metaCover = opfDoc.querySelector('metadata meta[name="cover"]');
        if (metaCover) {
            const coverId = metaCover.getAttribute("content");
            if (coverId && manifest[coverId]) coverHref = manifest[coverId];
        }
    }
    let coverUrl: string | undefined;
    if (coverHref) {
        const fullPath = resolvePath(opfPath, coverHref);
        const imgFile = getFileFromZip(zip, fullPath);
        if (imgFile) {
            try {
                const base64 = await imgFile.async("base64");
                const mime = getMimeType(fullPath);
                coverUrl = `data:${mime};base64,${base64}`;
            } catch (e) {}
        }
    }
    let tocItems: TocItem[] = [];
    if (navHref) {
        const fullNavPath = resolvePath(opfPath, navHref);
        const navContent = await zip.file(fullNavPath)?.async("string");
        if (navContent) tocItems = parseNavHtml(navContent, fullNavPath);
    } else if (ncxHref) {
        const fullNcxPath = resolvePath(opfPath, ncxHref);
        const ncxContent = await zip.file(fullNcxPath)?.async("string");
        if (ncxContent) tocItems = parseNCX(ncxContent, fullNcxPath);
    }
    const spineItems = Array.from(opfDoc.querySelectorAll("spine itemref"));
    const chapters: Chapter[] = [];
    chapters.push(createCoverChapter(title, author, coverUrl));

    const parsedDocsCache = new Map<string, Document>();
    const epubNotesMap = new Map<string, string>();
    
    const getParsedDoc = async (path: string) => {
        if (parsedDocsCache.has(path)) return parsedDocsCache.get(path)!;
        const fileData = await zip.file(path)?.async("string");
        if (!fileData) return null;
        const doc = parser.parseFromString(fileData, "application/xhtml+xml");
        parsedDocsCache.set(path, doc);
        return doc;
    };

    for (const item of spineItems) {
        await new Promise(r => setTimeout(r, 0)); // Yield to main thread
        const idRef = item.getAttribute("idref");
        if (idRef && manifest[idRef]) {
            const href = manifest[idRef];
            const fullPath = resolvePath(opfPath, href);
            
            const chDoc = await getParsedDoc(fullPath);
            if (chDoc) {
                 const images = Array.from(chDoc.querySelectorAll('img, image'));
                 for (const img of images) {
                     const src = img.getAttribute('src') || img.getAttribute('xlink:href');
                     if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                         const imgPath = resolvePath(fullPath, src);
                         const imgFile = getFileFromZip(zip, imgPath);
                         if (imgFile) {
                             const base64 = await imgFile.async("base64");
                             const mime = getMimeType(imgPath);
                             const newSrc = `data:${mime};base64,${base64}`;
                             if (img.tagName.toLowerCase() === 'image') img.setAttribute('xlink:href', newSrc);
                             else img.setAttribute('src', newSrc);
                         }
                     }
                 }

                 // Process footnotes
                 const links = Array.from(chDoc.querySelectorAll('a'));
                 for (const a of links) {
                     if (isFootnoteLink(a)) {
                         const aHref = a.getAttribute('href');
                         if (!aHref) continue;
                         const [relPath, hash] = aHref.split('#');
                         if (!hash) continue;
                         
                         const targetFullPath = relPath ? resolvePath(fullPath, relPath) : fullPath;
                         const safeNoteId = `${targetFullPath}-${hash}`.replace(/[^a-zA-Z0-9-]/g, '-');
                         
                         if (!epubNotesMap.has(safeNoteId)) {
                             const targetDoc = await getParsedDoc(targetFullPath);
                             if (targetDoc) {
                                 const noteEl = targetDoc.getElementById(hash) || targetDoc.querySelector(`[name="${hash}"]`);
                                 if (noteEl) {
                                     const backLinks = Array.from(noteEl.querySelectorAll('a')).filter(backA => {
                                         const backHref = backA.getAttribute('href');
                                         return backHref && backHref.includes('#');
                                     });
                                     backLinks.forEach(bl => {
                                         if (/^\^|back|назад|возврат/i.test(bl.textContent?.trim() || '')) {
                                             bl.remove();
                                         }
                                     });
                                     
                                     epubNotesMap.set(safeNoteId, noteEl.innerHTML);
                                     noteEl.remove(); // Remove from document
                                 }
                             }
                         }
                         
                         a.setAttribute('href', `#note-${safeNoteId}`);
                         a.setAttribute('id', `ref-${safeNoteId}`);
                     }
                 }

                 const body = chDoc.querySelector("body");
                 if (body) {
                     let chTitle = chDoc.querySelector("h1, h2, h3")?.textContent?.trim() || "-";
                     let chLevel = 0;
                     const tocMatch = tocItems.find(t => t.href === fullPath);
                     if (tocMatch) { chTitle = tocMatch.label; chLevel = tocMatch.level; }
                     const serializer = new XMLSerializer();
                     const processedContent = serializer.serializeToString(body);
                     const cleanContent = processedContent.replace(/xmlns="[^"]*"/g, '');
                     
                     // Only add if there's actual content left (sometimes note files become empty)
                     if (cleanContent.replace(/<[^>]*>/g, '').trim().length > 0 || cleanContent.includes('<img')) {
                         chapters.push({
                             name: chTitle,
                             url: '',
                             content: cleanContent, 
                             length: (body.textContent || "").length,
                             level: chLevel
                         });
                     }
                 }
            }
        }
    }

    // --- CREATE NOTES CHAPTER ---
    if (epubNotesMap.size > 0) {
        let notesContent = `<h1 class="title">Сноски</h1><div class="notes-list">`;
        epubNotesMap.forEach((html, id) => {
            notesContent += `
              <div class="note-entry" id="note-${id}">
                  <div class="note-header">
                       <a href="#ref-${id}" class="note-back-link">^</a>
                  </div>
                  <div class="note-content">${html}</div>
                  <hr class="note-divider"/>
              </div>
            `;
        });
        notesContent += `</div>`;

        chapters.push({
            name: "Сноски",
            url: '',
            content: notesContent,
            length: notesContent.length,
            level: 0
        });
    }

    return { title, author, series, coverUrl, chapters, type: 'ebook' };
}