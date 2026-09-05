import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { 
  CustomFontItem, 
  getAllCustomFontsFromDB, 
  saveCustomFontToDB, 
  deleteCustomFontFromDB, 
  loadFontIntoDOM 
} from '../utils/fonts';

export function useSettings() {
  const [fontSize, setFontSize] = useState(1.2);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isStyledMode, setIsStyledMode] = useState<boolean>(true);
  const [isBionic, setIsBionic] = useState<boolean>(false);
  const [appStyle, setAppStyle] = useState<string>('Cool');
  const [isRsvpMode, setIsRsvpMode] = useState<boolean>(false);
  const [rsvpWpm, setRsvpWpm] = useState<number>(300);
  const [isPagedMode, setIsPagedMode] = useState<boolean>(false);
  const [readerFont, setReaderFont] = useState<string>('Literata');
  const [customFonts, setCustomFonts] = useState<CustomFontItem[]>([]);

  const isNative = Capacitor.isNativePlatform();
  const isSettingsLoadedRef = useRef<boolean>(false);

  // Load Custom Fonts from DB on start
  useEffect(() => {
    const loadFonts = async () => {
      try {
        const fonts = await getAllCustomFontsFromDB();
        setCustomFonts(fonts);
        for (const font of fonts) {
          await loadFontIntoDOM(font.name, font.dataUrl);
        }
      } catch (e) {
        console.error('Failed to load custom fonts', e);
      }
    };
    loadFonts();
  }, []);

  // Add Custom Font
  const addCustomFont = useCallback(async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUrl = e.target?.result as string;
          if (!dataUrl) return resolve();
          
          const rawName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
          const name = rawName || "Custom Font";

          await loadFontIntoDOM(name, dataUrl);
          await saveCustomFontToDB({ name, dataUrl });

          setCustomFonts(prev => {
            const filtered = prev.filter(f => f.name !== name);
            return [...filtered, { name, dataUrl }];
          });
          setReaderFont(name);
          resolve();
        } catch (err) {
          console.error("Failed adding custom font:", err);
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }, []);

  // Delete Custom Font
  const deleteCustomFont = useCallback(async (name: string) => {
    try {
      await deleteCustomFontFromDB(name);
      setCustomFonts(prev => prev.filter(f => f.name !== name));
      if (readerFont === name) {
        setReaderFont('Literata');
      }
    } catch (err) {
      console.error("Failed deleting custom font:", err);
    }
  }, [readerFont]);

  // Load Settings
  useEffect(() => {
    const loadSettings = async () => {
      let settingsStr: string | null = null;
      if (isNative) {
        const s = await Preferences.get({ key: 'cool_read_settings' });
        settingsStr = s.value;
      } else {
        settingsStr = localStorage.getItem('cool_read_settings');
      }

      if (settingsStr) {
        try {
          const parsed = JSON.parse(settingsStr);
          if (parsed.theme) setTheme(parsed.theme);
          if (typeof parsed.isStyledMode === 'boolean') setIsStyledMode(parsed.isStyledMode);
          if (typeof parsed.isBionic === 'boolean') setIsBionic(parsed.isBionic);
          if (parsed.appStyle) setAppStyle(parsed.appStyle);
          if (typeof parsed.rsvpWpm === 'number') setRsvpWpm(parsed.rsvpWpm);
          if (typeof parsed.isPagedMode === 'boolean') setIsPagedMode(parsed.isPagedMode);
          if (parsed.readerFont) setReaderFont(parsed.readerFont);
        } catch (e) {
          console.error('Failed to parse settings', e);
        }
      }
      
      // Delay setting the flag so the initial state updates can settle
      setTimeout(() => {
          isSettingsLoadedRef.current = true;
      }, 0);
    };
    loadSettings();
  }, [isNative]);

  // Save Settings
  useEffect(() => {
    const saveSettings = async () => {
      if (!isSettingsLoadedRef.current) return;
      
      const settings = { theme, isStyledMode, appStyle, isBionic, rsvpWpm, isPagedMode, readerFont };
      const str = JSON.stringify(settings);
      try {
        if (isNative) {
          await Preferences.set({ key: 'cool_read_settings', value: str });
        } else {
          localStorage.setItem('cool_read_settings', str);
        }
      } catch (e) {
        console.error('Failed to save settings to storage', e);
      }
    };
    saveSettings();
  }, [theme, isStyledMode, appStyle, isBionic, isRsvpMode, rsvpWpm, isPagedMode, readerFont, isNative]);

  return {
    fontSize,
    setFontSize,
    theme,
    setTheme,
    isStyledMode,
    setIsStyledMode,
    isBionic,
    setIsBionic,
    appStyle,
    setAppStyle,
    isRsvpMode,
    setIsRsvpMode,
    rsvpWpm,
    setRsvpWpm,
    isPagedMode,
    setIsPagedMode,
    readerFont,
    setReaderFont,
    customFonts,
    addCustomFont,
    deleteCustomFont,
    isSettingsLoadedRef
  };
}
