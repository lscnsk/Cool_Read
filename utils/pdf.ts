import * as pdfjsLib from 'pdfjs-dist';
import { Book, Chapter } from '../types';

// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const parsePdf = async (file: Blob, bookId: string): Promise<Partial<Book>> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const stripPath = (name: string) => name.split('/').pop() || name;
    const fileName = stripPath((file as File).name || bookId || "Unknown PDF");
    let title = "";
    let author = "Unknown";
    let coverUrl = "";
    
    try {
        const metadata = await pdf.getMetadata();
        if (metadata.info) {
            if (metadata.info.Title && metadata.info.Title.trim()) {
                title = metadata.info.Title;
            }
            if (metadata.info.Author && metadata.info.Author.trim()) {
                author = metadata.info.Author;
            }
        }
    } catch(e) {}

    if (!title) {
        title = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    }

    // Try to extract cover from first page
    try {
        const firstPage = await pdf.getPage(1);
        const originalViewport = firstPage.getViewport({ scale: 1.0 });
        const MAX_WIDTH = 240;
        const scale = Math.min(1.0, MAX_WIDTH / originalViewport.width);
        const viewport = firstPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await firstPage.render({ canvasContext: context, viewport }).promise;
            coverUrl = canvas.toDataURL('image/webp', 0.6);
        }
    } catch(e) {
        console.warn("Failed to extract PDF cover:", e);
    }

    const numPages = pdf.numPages;
    const chapters: Chapter[] = [];
    
    let outlineItems: { title: string; pageIndex: number; level: number }[] = [];
    try {
        const rawOutline = await pdf.getOutline();
        if (rawOutline && rawOutline.length > 0) {
            const tempItems: { title: string; pageIndex: number; level: number }[] = [];
            
            const traverse = async (items: any[], level: number) => {
                for (const item of items) {
                    let pageIndex = -1;
                    if (item.dest) {
                        try {
                            let dest = item.dest;
                            if (typeof dest === 'string') {
                                dest = await pdf.getDestination(dest);
                            }
                            if (Array.isArray(dest) && dest.length > 0) {
                                const ref = dest[0];
                                if (ref && typeof ref === 'object') {
                                    const idx = await pdf.getPageIndex(ref);
                                    if (typeof idx === 'number' && idx >= 0) {
                                        pageIndex = idx;
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn("Could not resolve heading destination page number:", err);
                        }
                    }
                    if (pageIndex >= 0 && pageIndex < numPages) {
                        tempItems.push({
                            title: item.title,
                            pageIndex,
                            level
                        });
                    }
                    if (item.items && item.items.length > 0) {
                        await traverse(item.items, level + 1);
                    }
                }
            };
            
            await traverse(rawOutline, 0);
            outlineItems = tempItems;
        }
    } catch (e) {
        console.error("PDF outline parsing failed:", e);
    }

    // Map starting outline items to specific pages
    const pageOutlineMap: Record<number, { title: string; level: number }[]> = {};
    outlineItems.forEach(item => {
        if (!pageOutlineMap[item.pageIndex]) {
            pageOutlineMap[item.pageIndex] = [];
        }
        pageOutlineMap[item.pageIndex].push(item);
    });

    const getPageHeight = async (pageNum: number) => {
        try {
            const tempPage = await pdf.getPage(pageNum);
            const view = tempPage.view;
            return view[3] || 1;
        } catch {
            return 1;
        }
    };

    for (let i = 0; i < numPages; i++) {
        const pageNum = i + 1;
        const pageOutlines = pageOutlineMap[i];
        const pageLength = await getPageHeight(pageNum);
        
        if (pageOutlines && pageOutlines.length > 0) {
            const mainOutline = pageOutlines[0];
            chapters.push({
                name: mainOutline.title || `Page ${pageNum}`,
                url: '',
                content: '',
                level: mainOutline.level || 0,
                isHeader: true,
                length: pageLength
            });
        } else {
            chapters.push({
                name: `Page ${pageNum}`,
                url: '',
                content: '', 
                level: 0,
                length: pageLength
            });
        }
    }

    return {
        title,
        author,
        coverUrl,
        type: 'ebook',
        format: 'pdf',
        chapters
    };
};

export const parsePdfAsText = async (file: Blob, bookId: string): Promise<Partial<Book>> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const stripPath = (name: string) => name.split('/').pop() || name;
    const fileName = stripPath((file as File).name || bookId || "Unknown PDF");
    let title = "";
    let author = "Unknown";
    let coverUrl = "";
    
    try {
        const metadata = await pdf.getMetadata();
        if (metadata.info) {
            if (metadata.info.Title && metadata.info.Title.trim()) {
                title = metadata.info.Title;
            }
            if (metadata.info.Author && metadata.info.Author.trim()) {
                author = metadata.info.Author;
            }
        }
    } catch(e) {}

    if (!title) {
        title = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    }

    // Try to extract cover from first page
    try {
        const firstPage = await pdf.getPage(1);
        const originalViewport = firstPage.getViewport({ scale: 1.0 });
        const MAX_WIDTH = 240;
        const scale = Math.min(1.0, MAX_WIDTH / originalViewport.width);
        const viewport = firstPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await firstPage.render({ canvasContext: context, viewport }).promise;
            coverUrl = canvas.toDataURL('image/webp', 0.6);
        }
    } catch(e) {
        console.warn("Failed to extract PDF cover:", e);
    }

    const numPages = pdf.numPages;
    const chapters: Chapter[] = [];
    
    // Cover page
    chapters.push({
        name: "Cover",
        url: '',
        level: 0,
        isHeader: true, // Always show cover
        content: `
            <div class="book-cover-page">
                <div style="font-size: 5rem; margin-bottom: 2rem;">📖</div>
                <h1>${title}</h1>
                <h2>${author}</h2>
                <p style="text-align: center; color: #888; font-style: italic; margin-top: 1.5em; text-indent: 0;">Reflowable EBook Mode</p>
            </div>
        `,
        length: 200
    });

    let outlineItems: { title: string; pageIndex: number; level: number }[] = [];
    try {
        const rawOutline = await pdf.getOutline();
        if (rawOutline && rawOutline.length > 0) {
            const tempItems: { title: string; pageIndex: number; level: number }[] = [];
            const traverse = async (items: any[], level: number) => {
                for (const item of items) {
                    let pageIndex = -1;
                    if (item.dest) {
                        try {
                            let dest = item.dest;
                            if (typeof dest === 'string') {
                                dest = await pdf.getDestination(dest);
                            }
                            if (Array.isArray(dest) && dest.length > 0) {
                                const ref = dest[0];
                                if (ref && typeof ref === 'object') {
                                    const idx = await pdf.getPageIndex(ref);
                                    if (typeof idx === 'number' && idx >= 0) pageIndex = idx;
                                }
                            }
                        } catch (err) {}
                    }
                    if (pageIndex >= 0 && pageIndex < numPages) {
                        tempItems.push({ title: item.title, pageIndex, level });
                    }
                    if (item.items && item.items.length > 0) await traverse(item.items, level + 1);
                }
            };
            await traverse(rawOutline, 0);
            outlineItems = tempItems.sort((a, b) => a.pageIndex - b.pageIndex);
        }
    } catch (e) {}

    const extractTextForPages = async (startPage: number, endPage: number) => {
        let allLines: { text: string, y: number, x: number, page: number }[] = [];

        for (let i = startPage; i <= endPage; i++) {
            try {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                const pageHeight = viewport.height;
                const textContent = await page.getTextContent();
                
                let lineMap: Map<number, {text: string, x: number}[]> = new Map();
                
                for (const item of (textContent.items as any[])) {
                    const text = item.str.trim();
                    if (!text) continue;
                    
                    const x = item.transform[4];
                    const y = item.transform[5];
                    
                    // Exclude headers, footers, page numbers, technical info
                    const isMargin = (y > pageHeight * 0.92) || (y < pageHeight * 0.08);
                    const isNumber = /^\d+$/.test(text);
                    const isShort = text.length < 60;
                    
                    if (isMargin && (isNumber || isShort)) {
                        continue;
                    }
                    
                    let matchedY = null;
                    for (const [keyY] of lineMap) {
                        if (Math.abs(keyY - y) <= 4) {
                            matchedY = keyY;
                            break;
                        }
                    }
                    if (matchedY !== null) {
                        lineMap.get(matchedY)!.push({ text, x });
                    } else {
                        lineMap.set(y, [{ text, x }]);
                    }
                }
                
                let pageLines = [];
                for (const [y, items] of lineMap) {
                    items.sort((a,b) => a.x - b.x);
                    pageLines.push({
                        text: items.map(it => it.text).join(' ').replace(/\s+/g, ' '),
                        y: y,
                        x: items[0].x,
                        page: i
                    });
                }
                
                pageLines.sort((a, b) => b.y - a.y);
                allLines.push(...pageLines);
            } catch (e) {
                console.warn(`Error reading page ${i}`, e);
            }
        }
        
        const pageLeftMargins = new Map<number, number>();
        allLines.forEach(l => {
             if (!pageLeftMargins.has(l.page)) {
                 const linesOnPage = allLines.filter(cl => cl.page === l.page);
                 if (linesOnPage.length > 0) {
                     const xs = linesOnPage.map(cl => cl.x).sort((a,b) => a-b);
                     const leftMargin = xs[Math.floor(xs.length * 0.1)] || 0;
                     pageLeftMargins.set(l.page, leftMargin);
                 } else {
                     pageLeftMargins.set(l.page, 0);
                 }
             }
        });

        let paragraphs: string[] = [];
        let currentParagraph = "";
        let prevLine: { text: string, y: number, x: number, page: number } | null = null;
        
        for (const line of allLines) {
            if (!prevLine) {
                currentParagraph = line.text;
            } else {
                let isNewParagraph = false;
                const endsWithPunctuation = /[.!?»"']$/.test(prevLine.text.trim());
                const isDialogue = /^[—–-]\s/.test(line.text.trim());
                const leftMargin = pageLeftMargins.get(line.page) || 0;
                
                if (isDialogue) {
                    isNewParagraph = true;
                } else if (line.page === prevLine.page) {
                    const yGap = prevLine.y - line.y;
                    if (yGap > 22) { 
                        isNewParagraph = true;
                    } else if (line.x > leftMargin + 12) { 
                        isNewParagraph = true;
                    } else if (prevLine.text.length < 50 && endsWithPunctuation) { 
                        isNewParagraph = true;
                    }
                } else {
                    // Cross-page sentence stitching
                    if (line.x > leftMargin + 12) {
                        isNewParagraph = true;
                    } else if (prevLine.text.length < 40 && endsWithPunctuation) {
                        isNewParagraph = true;
                    }
                }
                
                if (isNewParagraph) {
                    if (currentParagraph) paragraphs.push(currentParagraph.trim());
                    currentParagraph = line.text;
                } else {
                    if (currentParagraph.endsWith('-')) {
                        if (currentParagraph.endsWith(' -')) {
                            currentParagraph += ' ' + line.text;
                        } else {
                            currentParagraph = currentParagraph.slice(0, -1) + line.text;
                        }
                    } else {
                        currentParagraph += ' ' + line.text;
                    }
                }
            }
            prevLine = line;
        }
        
        if (currentParagraph) {
            paragraphs.push(currentParagraph.trim());
        }
        
        return paragraphs.map(p => {
             let text = p;
             if (text.length < 100 && (text === text.toUpperCase() || text.startsWith('Chapter') || text.startsWith('Глава'))) {
                 return `<h3 class="title">${text}</h3>`;
             }
             return `<p>${text}</p>`;
        }).join('\n');
    };

    if (outlineItems.length > 0) {
        // Use outline to create chapters
        for (let i = 0; i < outlineItems.length; i++) {
            const item = outlineItems[i];
            const nextItem = outlineItems[i + 1];
            const startPage = item.pageIndex + 1;
            const endPage = nextItem ? Math.max(startPage, nextItem.pageIndex) : numPages;
            
            let combinedContent = await extractTextForPages(startPage, endPage);

            chapters.push({
                name: item.title,
                url: '',
                content: combinedContent,
                level: item.level + 1,
                isHeader: true,
                length: combinedContent.length
            });
        }
    } else {
        // One continuous chapter as requested ("без всяких разделений на главы")
        let fullContent = await extractTextForPages(1, numPages);
        
        chapters.push({
            name: "Full Book",
            url: '',
            content: fullContent,
            level: 1,
            length: fullContent.length
        });
    }

    return {
        title,
        author,
        coverUrl,
        type: 'ebook',
        format: 'fb2', // Formats as fb2 so EBookReader handles it!
        chapters
    };
};

