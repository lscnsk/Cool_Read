import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { PersistedState } from '../types';

function resizeImage(imageUrl: string, maxWidth: number = 640, quality: number = 0.8): Promise<string> {
  return new Promise((resolve) => {
    // If it's a remote URL and not a blob or data, we can keep it as is (optional optimization)
    if (!imageUrl || (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:'))) {
      resolve(imageUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageUrl);
        return;
      }
      const scale = Math.min(1.0, maxWidth / img.width);
      if (scale >= 1.0 && imageUrl.startsWith('data:')) {
        // Image is already small and already base64, returning as is
        resolve(imageUrl);
        return;
      }
      
      const targetScale = Math.min(1.0, scale);
      canvas.width = img.width * targetScale;
      canvas.height = img.height * targetScale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(imageUrl);
    };
    img.src = imageUrl;
  });
}

export function useBookHistory() {
  const [bookProgressMap, setBookProgressMap] = useState<Record<string, PersistedState>>({});
  const [bookMetadataMap, setBookMetadataMap] = useState<Record<string, { title: string; author?: string; coverUrl?: string; format?: string }>>({});
  
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const loadHistory = async () => {
      let historyStr: string | null = null;
      let metadataStr: string | null = null;

      try {
        if (isNative) {
          const h = await Preferences.get({ key: 'cool_read_history' });
          const m = await Preferences.get({ key: 'cool_read_metadata' });
          historyStr = h.value;
          metadataStr = m.value;
        } else {
          historyStr = localStorage.getItem('cool_read_history');
          metadataStr = localStorage.getItem('cool_read_metadata');
        }
      } catch (e) {
        console.error('Failed to load storage values on init', e);
      }

      if (historyStr) {
        try {
          const parsed = JSON.parse(historyStr);
          setBookProgressMap(parsed);
        } catch (e) {
          console.error('Failed to parse history', e);
        }
      }

      if (metadataStr) {
        try {
          const parsed = JSON.parse(metadataStr);
          setBookMetadataMap(parsed);
        } catch (e) {
          console.error('Failed to parse metadata', e);
        }
      }
    };
    loadHistory();
  }, [isNative]);

  const saveMetadata = useCallback(async (id: string, title: string, author?: string, coverUrl?: string, format?: string) => {
    let finalCoverUrl = coverUrl;
    if (coverUrl && (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))) {
      try {
        finalCoverUrl = await resizeImage(coverUrl, 640, 0.8);
      } catch (e) {
        console.warn("Failed to compress cover image", e);
      }
    }

    setBookMetadataMap(prev => {
      const newMeta = { ...prev, [id]: { title, author, coverUrl: finalCoverUrl, format } };
      const saveStr = JSON.stringify(newMeta);
      
      try {
        if (isNative) {
          Preferences.set({ key: 'cool_read_metadata', value: saveStr }).catch(() => {});
        } else {
          localStorage.setItem('cool_read_metadata', saveStr);
        }
        return newMeta;
      } catch (e) {
        console.warn("Quota exceeded or storage failed while saving metadata, pruning old covers...", e);
        
        // Let's prune cover URLs of metadata other than the current book being saved
        const prunedMeta = { ...newMeta };
        Object.keys(prunedMeta).forEach(k => {
          if (k !== id && prunedMeta[k]) {
            prunedMeta[k] = { ...prunedMeta[k], coverUrl: undefined };
          }
        });
        
        const prunedStr = JSON.stringify(prunedMeta);
        try {
          if (isNative) {
            Preferences.set({ key: 'cool_read_metadata', value: prunedStr }).catch(() => {});
          } else {
            localStorage.setItem('cool_read_metadata', prunedStr);
          }
          return prunedMeta;
        } catch (e2) {
          console.error("Even pruned metadata storage failed, clearing all covers", e2);
          
          // Absolute safety first: clear current cover if it still errors
          const absoluteFallback = { ...prunedMeta };
          if (absoluteFallback[id]) {
            absoluteFallback[id] = { ...absoluteFallback[id], coverUrl: undefined };
          }
          try {
            const absoluteStr = JSON.stringify(absoluteFallback);
            if (isNative) {
              Preferences.set({ key: 'cool_read_metadata', value: absoluteStr }).catch(() => {});
            } else {
              localStorage.setItem('cool_read_metadata', absoluteStr);
            }
          } catch (e3) {
            console.error("Failed completely to write to localStorage for metadata", e3);
          }
          return absoluteFallback;
        }
      }
    });
  }, [isNative]);

  const updateProgress = useCallback(async (bookId: string, state: PersistedState) => {
    setBookProgressMap(prev => {
      const newMap = { ...prev, [bookId]: state };
      const saveStr = JSON.stringify(newMap);
      try {
        if (isNative) {
          Preferences.set({ key: 'cool_read_history', value: saveStr }).catch(() => {});
        } else {
          localStorage.setItem('cool_read_history', saveStr);
        }
      } catch (e) {
        console.error("Failed to save progress map to storage", e);
      }
      return newMap;
    });
  }, [isNative]);

  const deleteBookHistory = useCallback(async (bookId: string) => {
    setBookProgressMap(prev => {
      const newMap = { ...prev };
      delete newMap[bookId];
      const saveStr = JSON.stringify(newMap);
      try {
        if (isNative) {
          Preferences.set({ key: 'cool_read_history', value: saveStr }).catch(() => {});
        } else {
          localStorage.setItem('cool_read_history', saveStr);
        }
      } catch (e) {
        console.error("Failed to save progress map to storage", e);
      }
      return newMap;
    });

    setBookMetadataMap(prev => {
      const newMeta = { ...prev };
      delete newMeta[bookId];
      const saveStr = JSON.stringify(newMeta);
      try {
        if (isNative) {
          Preferences.set({ key: 'cool_read_metadata', value: saveStr }).catch(() => {});
        } else {
          localStorage.setItem('cool_read_metadata', saveStr);
        }
      } catch (e) {
        console.error("Failed to save metadata map to storage", e);
      }
      return newMeta;
    });
  }, [isNative]);

  return {
    bookProgressMap,
    setBookProgressMap,
    bookMetadataMap,
    setBookMetadataMap,
    saveMetadata,
    updateProgress,
    deleteBookHistory,
  };
}
