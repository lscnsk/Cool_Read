import React from 'react';
import { motion } from 'motion/react';
import { Book, AppMode } from '../types';

interface AppHeaderProps {
  isImmersive: boolean;
  mode: AppMode;
  appStyle: string;
  libraryClickKey: number;
  titleClickKey: number;
  chaptersClickKey: number;
  currentBook: Book | null;
  onToggleLibrary: () => void;
  onSwitchMode: () => void;
  onToggleChapters: () => void;
  isCatalogOpen?: boolean;
  onBackFromCatalog?: () => void;
  onToggleCatalogSidebar?: () => void;
}

export function AppHeader({
  isImmersive,
  mode,
  appStyle,
  libraryClickKey,
  titleClickKey,
  chaptersClickKey,
  currentBook,
  onToggleLibrary,
  onSwitchMode,
  onToggleChapters,
  isCatalogOpen = false,
  onBackFromCatalog,
  onToggleCatalogSidebar
}: AppHeaderProps) {
  const isDragon = appStyle === 'Dragon';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';

  return (
    <div
      className={`bimbo-header bimbo-panel absolute top-0 left-0 right-0 h-20 bg-[#23211f]/95 backdrop-blur-sm border-b border-[#45413e] px-4 z-30 transition-transform duration-300 shadow-[0_5px_15px_rgba(0,0,0,0.15)] ${
        !isImmersive || mode === 'audio' ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="max-w-4xl mx-auto h-full w-full flex items-center justify-between relative">
        <div className="flex items-center gap-2 relative">
          {isCatalogOpen ? (
            <button
              onClick={onBackFromCatalog}
              className="p-2 flex items-center justify-center text-3xl hover:scale-105 active:scale-95 transition-transform"
              title="Назад к чтению (Back)"
            >
              <span className="inline-block emoji">⬅️</span>
            </button>
          ) : (
            <button
              onClick={onToggleLibrary}
              className="p-2 flex items-center justify-center text-3xl"
              title="Библиотека (Library)"
            >
              <motion.span
                key={`library-pulse-${libraryClickKey}`}
                animate={libraryClickKey > 0 ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="inline-block emoji"
              >
                {isMarcel ? '🪶' : isDragon ? '🍻' : isFF ? '🎒' : isBimbo ? '💖' : isSurf ? '🏖️' : '📚'}
              </motion.span>
            </button>
          )}
        </div>

        <button
          onClick={onSwitchMode}
          className={`absolute left-1/2 top-0 h-full -translate-x-1/2 flex items-center justify-center w-[220px] md:w-[260px] transition-all active:opacity-50 duration-100 z-10 whitespace-nowrap ${
            isMarcel
              ? 'font-marcel font-medium text-[26px] md:text-[34px] text-[#2F2440]'
              : isDragon
              ? 'font-dragon text-2xl md:text-3xl text-[#fcd34d] drop-shadow-md'
              : isFF
              ? 'font-ff font-normal text-2xl md:text-3xl text-[#f0deba] tracking-widest drop-shadow-md'
              : isBimbo
              ? 'font-bimbo font-normal text-3xl md:text-4xl text-[#fb7185] drop-shadow-md'
              : isSurf
              ? 'font-surf font-normal text-4xl md:text-5xl text-[#0ea5e9] drop-shadow-md'
              : 'font-bold text-2xl md:text-3xl tracking-wide text-[#fffff0] font-literata'
          }`}
          
        >
          {isMarcel ? (
            <div className="flex items-center justify-center text-3xl pt-1">
              <span>MarcelRead</span>
              <motion.span
                key={`title-emoji-${titleClickKey}`}
                animate={titleClickKey > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className="shrink-0 relative z-10 inline-block emoji ml-1 -translate-y-0.5"
              >
                ☕
              </motion.span>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center text-center w-full">
              <span className={`text-right shrink-0 truncate ${
                isBimbo ? 'tracking-normal' : 
                isSurf ? 'tracking-normal pr-1.5 md:pr-2' : 
                isFF ? 'tracking-normal' : 
                isDragon ? 'tracking-[0.15em]' : 
                'tracking-[0.05em]'
              }`}>
                {isDragon ? 'Roll' : isFF ? 'Final' : isBimbo ? 'Bimbo' : isSurf ? 'Surf' : 'Cool'}
              </span>
              <motion.span
                key={`title-emoji-${titleClickKey}`}
                animate={titleClickKey > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                className={`shrink-0 relative z-10 inline-block emoji ${
                  isBimbo ? 'text-4.5xl md:text-5.5xl' : isSurf ? 'text-4.5xl md:text-5.5xl' : isFF ? 'text-3.5xl md:text-4.5xl' : 'text-4.5xl md:text-5.5xl'
                } ${isDragon ? 'pt-0.5' : isFF ? 'pt-0' : 'pt-0.5'} ${isSurf ? 'mx-1 md:mx-2' : 'mx-1 md:mx-2'}`}
              >
                {isDragon ? '🐉' : isFF ? '☄️' : isBimbo ? '👑' : isSurf ? '🌊' : '💀'}
              </motion.span>
              <span className={`text-left shrink-0 truncate ${
                isBimbo ? 'tracking-[0.08em]' : 
                isSurf ? 'tracking-normal pl-0.5' : 
                isFF ? 'tracking-normal' : 
                isDragon ? 'tracking-[0.05em]' : 
                'tracking-[0.05em]'
              }`}>
                Read
              </span>
            </div>
          )}
        </button>

        <div className="flex items-center gap-2">
          {isCatalogOpen ? (
            <button
              onClick={onToggleCatalogSidebar || onToggleChapters}
              className="p-2 rounded-lg flex items-center justify-center text-3xl hover:scale-105 active:scale-95 transition-transform"
              title="Catalog"
            >
              <span className="inline-block emoji">
                🗂️
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                if (currentBook) {
                  onToggleChapters();
                }
              }}
              className={`p-2 rounded-lg flex items-center justify-center text-3xl ${
                !currentBook ? 'opacity-30' : ''
              }`}
              disabled={!currentBook}
              title="Главы (Chapters)"
            >
              <motion.span
                key={`chapters-pulse-${chaptersClickKey}`}
                animate={chaptersClickKey > 0 ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                className="inline-block emoji"
              >
                {isMarcel ? '🪻' : isDragon ? '🏰' : isFF ? '📜' : isBimbo ? '💎' : isSurf ? '🐚' : '📖'}
              </motion.span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
