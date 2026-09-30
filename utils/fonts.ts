import { initDB } from './db';

export interface CustomFontItem {
  name: string;
  dataUrl: string;
}

export interface FontOption {
  id: string;
  name: string;
  css: string;
  isCustom?: boolean;
}

export const PRESET_FONTS: FontOption[] = [
  { id: 'Literata', name: 'Literata', css: "'Literata', serif" },
];

export function getFontFamilyCSS(fontName: string): string {
  if (!fontName) return "'Literata', serif";
  const preset = PRESET_FONTS.find(f => f.id === fontName || f.name === fontName);
  if (preset) return preset.css;
  return `"${fontName}", serif`;
}

function processFontDataUrl(name: string, dataUrl: string): { cleanDataUrl: string; format: string } {
  let format = 'truetype';
  const nameLower = name.toLowerCase();
  
  if (nameLower.endsWith('.otf') || dataUrl.includes('font/otf') || dataUrl.includes('font/opentype') || dataUrl.includes('application/x-font-opentype')) {
    format = 'opentype';
  } else if (nameLower.endsWith('.woff2') || dataUrl.includes('font/woff2')) {
    format = 'woff2';
  } else if (nameLower.endsWith('.woff') || dataUrl.includes('font/woff')) {
    format = 'woff';
  }

  let cleanDataUrl = dataUrl;
  if (dataUrl.startsWith('data:application/octet-stream') || dataUrl.startsWith('data:;') || dataUrl.startsWith('data:application/x-font')) {
    const mime = format === 'opentype' ? 'font/otf' : format === 'woff2' ? 'font/woff2' : format === 'woff' ? 'font/woff' : 'font/ttf';
    cleanDataUrl = dataUrl.replace(/^data:[^;]*/, `data:${mime}`);
  }

  return { cleanDataUrl, format };
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64Index = dataUrl.indexOf(',');
  const base64 = base64Index !== -1 ? dataUrl.slice(base64Index + 1) : dataUrl;
  const cleanBase64 = base64.replace(/\s/g, '');
  const binaryString = window.atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export const loadFontIntoDOM = async (name: string, dataUrl: string) => {
  if (!name || !dataUrl) return;

  const { cleanDataUrl, format } = processFontDataUrl(name, dataUrl);
  const styleId = `custom-font-style-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      @font-face {
        font-family: "${name}";
        src: url("${cleanDataUrl}") format("${format}"), url("${cleanDataUrl}");
        font-display: swap;
      }
    `;
    document.head.appendChild(styleEl);
  }

  try {
    let existing = false;
    document.fonts.forEach(f => {
      if (f.family === name || f.family === `"${name}"`) existing = true;
    });

    if (!existing && typeof FontFace !== 'undefined') {
      try {
        const fontFace = new FontFace(name, `url("${cleanDataUrl}")`);
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
      } catch (err) {
        try {
          const buffer = dataUrlToArrayBuffer(cleanDataUrl);
          const fontFace = new FontFace(name, buffer);
          const loaded = await fontFace.load();
          document.fonts.add(loaded);
        } catch (e2) {
          // Style tag injection handles the fallback
        }
      }
    }
  } catch (e) {
    // Style tag injection handles the fallback
  }
};

const FONTS_STORE = 'fonts';

export const saveCustomFontToDB = async (fontObj: CustomFontItem) => {
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains(FONTS_STORE)) return;
    const tx = db.transaction(FONTS_STORE, 'readwrite');
    await tx.objectStore(FONTS_STORE).put(fontObj);
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Error saving font to DB:", e);
  }
};

export const deleteCustomFontFromDB = async (name: string) => {
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains(FONTS_STORE)) return;
    const tx = db.transaction(FONTS_STORE, 'readwrite');
    await tx.objectStore(FONTS_STORE).delete(name);
  } catch (e) {
    console.error("Error deleting font from DB:", e);
  }
};

export const getAllCustomFontsFromDB = async (): Promise<CustomFontItem[]> => {
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains(FONTS_STORE)) return [];
    return new Promise<CustomFontItem[]>((resolve, reject) => {
      const tx = db.transaction(FONTS_STORE, 'readonly');
      const req = tx.objectStore(FONTS_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
};
