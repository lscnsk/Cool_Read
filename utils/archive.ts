import { Archive } from 'libarchive.js/dist/libarchive.js';
import { Book, Chapter } from '../types';
import JSZip from 'jszip';

try {
    Archive.init({ workerUrl: '/libarchive/worker-bundle.js' });
} catch (e) {
    console.error("Failed to initialize libarchive:", e);
}

const getMimeType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream';
    }
};

const extractComicCover = async (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                resolve("");
                return;
            }
            // Scale down for thumbnail
            const MAX_WIDTH = 300;
            const scale = Math.min(1, MAX_WIDTH / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/webp', 0.8);
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve("");
        };
        img.src = url;
    });
};

export const parseComic = async (file: Blob, bookId: string): Promise<Partial<Book>> => {
    const stripPath = (name: string) => name.split('/').pop() || name;
    const fileName = stripPath((file as File).name || bookId || "Unknown Comic");
    const lowerName = fileName.toLowerCase();
    
    // Check if zip by name, type or magic bytes
    let isZip = lowerName.endsWith('.cbz') || lowerName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-cbz';
    
    if (!isZip) {
        try {
            const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
            if (header[0] === 0x50 && header[1] === 0x4B) {
                isZip = true;
            }
        } catch (e) {
            console.error("Failed to read magic bytes for comic archive detection:", e);
        }
    }

    const chapters: Chapter[] = [];
    let coverUrl = "";

    if (isZip) {
        try {
            console.log("Parsing CBZ via JSZip...");
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const imageFiles: { path: string, blob: Blob }[] = [];

            const promises: Promise<void>[] = [];
            zip.forEach((relativePath, fileEntry) => {
                if (!fileEntry.dir && /\.(jpg|jpeg|png|webp|gif)$/i.test(relativePath)) {
                    promises.push(
                        fileEntry.async('blob').then(blob => {
                            imageFiles.push({
                                path: relativePath,
                                blob: new Blob([blob], { type: getMimeType(relativePath) })
                            });
                        })
                    );
                }
            });

            await Promise.all(promises);

            if (imageFiles.length === 0) {
                throw new Error("No images found in CBZ archive.");
            }

            // Sort images numerically/alphabetically
            imageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

            // Extract cover: look for specific cover image first, otherwise use first page
            const coverEntry = imageFiles.find(f => {
                const name = f.path.toLowerCase();
                return name.includes('cover') || name.includes('folder') || name.includes('front');
            }) || imageFiles[0];

            if (coverEntry) {
                coverUrl = await extractComicCover(coverEntry.blob);
            }

            imageFiles.forEach((f, idx) => {
                chapters.push({
                    name: `Page ${idx + 1}`,
                    url: '',
                    content: `<img src="${URL.createObjectURL(f.blob)}" alt="page ${idx+1}" style="width: 100%; height: auto;" />`,
                    level: 0,
                    length: f.blob.size || 1
                });
            });

            return {
                title: fileName.replace(/\.[^/.]+$/, ""),
                author: "Unknown",
                coverUrl,
                type: 'ebook',
                format: 'comic',
                chapters
            };

        } catch (err) {
            console.error("JSZip parsing failed, falling back:", err);
        }
    }

    // CBR or other archives - GENERAL FALLBACK TO LIBARCHIVE
    console.log("Parsing CBR/RAR via libarchive.js...");
    try {
        const archive = await Archive.open(file);
        const files = await archive.extractFiles();
        
        const flattenArchivedFiles = (obj: any, path: string = ''): any[] => {
            let result: any[] = [];
            for (const [key, value] of Object.entries(obj)) {
                if (value instanceof File) {
                    result.push({ path: path + key, file: value });
                } else if (value && typeof value === 'object') {
                    result = [...result, ...flattenArchivedFiles(value, path + key + '/')];
                }
            }
            return result;
        };
        
        let allFiles = flattenArchivedFiles(files);
        allFiles = allFiles.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.path));
        allFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
        
        if (allFiles.length === 0) {
            throw new Error("No image files found in archive.");
        }

        if (allFiles.length > 0) {
            const coverEntry = allFiles.find(f => {
                const name = f.path.toLowerCase();
                return name.includes('cover') || name.includes('folder') || name.includes('front');
            }) || allFiles[0];

            if (coverEntry) {
                coverUrl = await extractComicCover(coverEntry.file);
            }
        }

        allFiles.forEach((f, idx) => {
            chapters.push({
                name: `Page ${idx + 1}`,
                url: '',
                content: `<img src="${URL.createObjectURL(f.file)}" alt="page ${idx+1}" style="width: 100%; height: auto;" />`,
                level: 0,
                length: f.file.size || 1
            });
        });

        return {
            title: fileName.replace(/\.[^/.]+$/, ""),
            author: "Unknown",
            coverUrl,
            type: 'ebook',
            format: 'comic',
            chapters
        };
    } catch (err) {
        console.error("libarchive decoding failed:", err);
        throw err;
    }
};
