import React, { useMemo } from 'react';
import { Type, Sun, Moon, Pilcrow, Zap, BookOpen, Scroll } from 'lucide-react';
import { Chapter } from '../types';

interface EBookControlsProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  chapterProgress: number; // 0-100
  bookProgress: number; // 0-100
  onOpenSearch?: () => void;
  chapterTitle?: string;
  chapters?: Chapter[];
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  show: boolean; // Controls visibility transition
  isStyledMode: boolean;
  onToggleStyledMode: () => void;
  isPdfSource?: boolean;
  currentBookFormat?: string | null;
  onTogglePdfFormat?: () => void;
  appStyle?: string;
  isBionic?: boolean;
  onToggleBionic?: () => void;
  isRsvpMode?: boolean;
  onToggleRsvpMode?: () => void;
  isPagedMode?: boolean;
  onTogglePagedMode?: () => void;
}

const EBookControls: React.FC<EBookControlsProps> = ({
  fontSize,
  setFontSize,
  chapterProgress,
  bookProgress,
  onOpenSearch, 
  chapterTitle,
  chapters,
  theme,
  onToggleTheme,
  show,
  isStyledMode,
  onToggleStyledMode,
  isPdfSource = false,
  currentBookFormat = null,
  onTogglePdfFormat,
  appStyle,
  isBionic = false,
  onToggleBionic,
  isRsvpMode = false,
  onToggleRsvpMode,
  isPagedMode = false,
  onTogglePagedMode
}) => {
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';
  const accentColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0ea5e9' : '#fffff0';

  const adjustFont = (delta: number) => {
      setFontSize(Math.max(0.5, Math.min(3.0, fontSize + delta)));
  };

  // Calculate ticks for chapter boundaries (ignoring notes/footnotes)
  const ticks = useMemo(() => {
    if (!chapters || chapters.length === 0) return [];
    
    const isNotesChapter = (name: string) => {
        const lower = (name || '').toLowerCase();
        return lower === 'сноски' || lower === 'notes' || lower === 'footnotes' || lower === 'примечания';
    };

    // Calculate total length of main chapters only (to match progress bar percentage logic)
    const totalLength = chapters.reduce((sum, ch) => {
        if (isNotesChapter(ch.name || '')) return sum;
        return sum + (ch.length || 0);
    }, 0);
    
    if (totalLength === 0) return [];

    let accumulated = 0;
    const t: number[] = [];
    
    // We want ticks at the start of each chapter (except the first one which is 0%)
    chapters.forEach((ch, idx) => {
        const isNotes = isNotesChapter(ch.name || '');
        if (idx > 0 && !isNotes) {
            t.push((accumulated / totalLength) * 100);
        }
        if (!isNotes) {
            accumulated += (ch.length || 0);
        }
    });
    
    return t;
  }, [chapters]);

  return (
    <div 
        className={`fixed bottom-0 left-0 right-0 w-full h-28 backdrop-blur-md border-t pb-safe pt-3 px-4 z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-in-out ${
            show ? 'translate-y-0' : 'translate-y-full'
        } ${isMarcel ? 'bg-[#F3EFFB]/95 border-[#C4B5E6]' : isBimbo ? 'bg-[#FFF0F5]/95 border-[#FBCFE8]' : isSurf ? 'bg-white/95 border-[#bae6fd]' : 'bg-[#23211f]/95 border-[#45413e]'}`}
    >
       
       <div className="max-w-4xl mx-auto w-full flex flex-col gap-3">
           
           {/* Top Row: Controls */}
           <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full gap-1 sm:gap-2">
               
               {/* Left Group: Font Controls */}
               <div className="flex justify-start">
                   {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                       <div className={`flex items-center gap-[1px] px-0.5 h-8 rounded-lg border flex-shrink-0 ${isMarcel ? 'bg-[#E8E0F5] border-[#C4B5E6]' : isBimbo ? 'bg-white border-[#FBCFE8]' : isSurf ? 'bg-sky-50 border-[#bae6fd]' : 'bg-[#2c2a28] border-[#45413e]'}`}>
                           <button 
                               onClick={() => adjustFont(-0.1)} 
                               className={`active:scale-90 transition-transform p-0.5 h-6 w-6 flex items-center justify-center rounded ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#888] hover:text-white'}`}
                               
                           >
                               <Type size={10} />
                           </button>
                           
                           <span className={`text-[11px] font-mono font-bold w-[20px] inline-block text-center tabular-nums ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#ddd]'}`}>{fontSize.toFixed(1)}</span>

                           <button 
                               onClick={() => adjustFont(0.1)} 
                               className={`active:scale-90 transition-transform p-0.5 h-6 w-6 flex items-center justify-center rounded ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#888] hover:text-white'}`}
                               
                           >
                               <Type size={13} />
                           </button>
                       </div>
                   )}
               </div>

               {/* Center: Style Toggles (Clean Group) */}
               <div className="flex justify-center items-center gap-[1px] sm:gap-1">
                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                    <button 
                      onClick={onToggleStyledMode}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                        isStyledMode 
                          ? (isMarcel ? 'text-red-700' : isBimbo ? 'text-red-600' : isSurf ? 'text-red-600' : 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      title="Formatted text mode (drop cap)"
                    >
                       <Pilcrow size={16} />
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && (
                    <button 
                      onClick={onToggleTheme}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                        theme === 'light' 
                          ? (isMarcel ? 'text-[#b45309]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]') 
                          : (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.6)]')
                      }`}
                      title={theme === 'light' ? "Light theme" : "Dark theme"}
                    >
                       {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onToggleBionic && (
                    <button 
                      onClick={onToggleBionic}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all select-none text-[15px] ${
                        isBionic 
                          ? `font-black ${isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-violet-400 drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]'}` 
                          : `font-normal ${isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70'}`
                      }`}
                      title="Bionic reading mode"
                    >
                       B
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onToggleRsvpMode && (
                    <button 
                      onClick={onToggleRsvpMode}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                        isRsvpMode ? (isMarcel ? 'text-[#b45309]' : isBimbo ? 'text-[#db2777]' : isSurf ? 'text-[#0284c7]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      
                    >
                       <Zap size={16} className={isRsvpMode ? 'fill-current' : ''} />
                    </button>
                  )}

                  {currentBookFormat !== 'pdf' && currentBookFormat !== 'comic' && onTogglePagedMode && (
                    <button 
                      onClick={onTogglePagedMode}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg active:scale-90 transition-all ${
                        isPagedMode ? (isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0284c7]' : 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]') 
                          : (isMarcel ? 'text-[#2F2440]/40 hover:text-[#2F2440]/70' : isBimbo ? 'text-[#BE123C]/40 hover:text-[#BE123C]/70' : isSurf ? 'text-[#7dd3fc] hover:text-[#0ea5e9]' : 'text-[#888] hover:text-[#fffff0]/70')
                      }`}
                      
                    >
                       {isPagedMode ? <BookOpen size={16} className="fill-current/20" /> : <Scroll size={16} />}
                    </button>
                  )}
               </div>

                {/* Right: Stats (Chapter % / Book %) */}
               <div className="flex justify-end">
                   <div className={`flex items-center text-xs font-mono tabular-nums ${isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0369a1]' : 'text-[#888]'}`}>
                       {(() => {
                           const isSpecialPdfOrComic = currentBookFormat === 'pdf' || currentBookFormat === 'comic';
                           const isDocWithChapters = currentBookFormat === 'pdf' && chapters?.some(ch => ch.isHeader);
                           if (!isSpecialPdfOrComic || isDocWithChapters) {
                               return (
                                   <>
                                       <span className={`font-bold tabular-nums inline-block w-[36px] text-right pr-1 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0ea5e9]' : 'text-[#fffff0]'}`}>
                                           {Math.round(chapterProgress)}%
                                       </span>
                                       <div className={`h-4 w-[1px] ${isMarcel ? 'bg-[#C4B5E6]' : isBimbo ? 'bg-[#FBCFE8]' : isSurf ? 'bg-sky-200' : 'bg-[#45413e]'}`}></div>
                                   </>
                               );
                           }
                           return null;
                       })()}
                       <span className={`font-bold tabular-nums inline-block w-[36px] text-right pl-1 ${isMarcel ? 'text-[#2F2440]' : isBimbo ? 'text-[#BE123C]' : isSurf ? 'text-[#0369a1]' : 'text-[#aaa]'}`}>
                           {Math.round(bookProgress)}%
                       </span>
                   </div>
               </div>
           </div>

           {/* Middle: Progress Bar with Ticks */}
           <div className={`w-full h-2 rounded-full overflow-hidden relative group ${isMarcel ? 'bg-[#DBD0EF]' : isBimbo ? 'bg-[#FBCFE8]' : isSurf ? 'bg-[#e0f2fe]' : 'bg-[#45413e]'}`}>
                {/* Real Ticks Layer */}
                {ticks.map((tick, i) => (
                    <div 
                        key={i}
                        className={`absolute top-0 bottom-0 w-[1px] z-20 opacity-50 ${isMarcel ? 'bg-[#F3EFFB]' : isBimbo ? 'bg-white' : isSurf ? 'bg-sky-200' : 'bg-[#23211f]'}`}
                        style={{ left: `${tick}%` }}
                    />
                ))}

                <div 
                    className="h-full absolute left-0 top-0 transition-all duration-300 z-10" 
                    style={{ width: `${Math.min(100, bookProgress)}%`, backgroundColor: accentColor }}
                ></div>
           </div>

           {/* Bottom: Chapter Title */}
           <div className="w-full text-center pb-2">
               <span className={`text-xs line-clamp-1 mt-1 ${isMarcel ? 'text-[#544372]' : isBimbo ? 'text-[#BE123C]/60' : isSurf ? 'text-[#0284c7]' : 'text-[#aaa]'}`}>
                  {chapterTitle || "Reading"}
               </span>
           </div>

       </div>
    </div>
  );
};

export default EBookControls;
