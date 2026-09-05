import React, { useRef } from 'react';

interface EmptyStateProps {
  isLoading: boolean;
  booksCount: number;
  mode: 'ebook' | 'audio';
  isNative: boolean;
  appStyle: string;
  onExternalFilePicked?: (files: FileList | File[] | File) => void;
  onExternalFolderPicked?: (files: File[] | FileList) => void;
  currentBook: any;
  onOpenCatalog?: () => void;
}

export function EmptyState({ 
  isLoading, 
  booksCount, 
  mode, 
  isNative, 
  appStyle,
  onExternalFilePicked,
  onExternalFolderPicked,
  currentBook,
  onOpenCatalog
}: EmptyStateProps) {
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';

  const bookInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 z-0 relative">
        <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
            isBimbo ? 'border-pink-200 border-t-pink-600' : 
            isSurf ? 'border-sky-200 border-t-sky-600' : 
            isDragon ? 'border-orange-200 border-t-orange-600' :
            'border-[#fffff0]/20 border-t-[#fffff0]'
        }`}></div>
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 mt-16 z-0 relative">
        <div className="text-4xl emoji">
           {mode === 'audio' ? '💿' : '📄'}
        </div>
        <div className="max-w-xs w-full space-y-4">
           {mode === 'ebook' ? (
             <div className="space-y-4">
               <button 
                 onClick={() => bookInputRef.current?.click()}
                 className={`w-full py-6 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-3 group ${isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
               >
                 <span className="text-4xl group-hover:scale-110 transition-transform emoji">➕</span>
                 <div className="flex flex-col items-center">
                    <span className="text-lg font-bold uppercase tracking-widest">Add books</span>
                    <span className="text-xs opacity-60 font-mono">fb2, epub, pdf, cbz, cbr</span>
                 </div>
               </button>

               {onOpenCatalog && (
                 <button 
                   onClick={onOpenCatalog}
                   className={`w-full py-5 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-2 group ${isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
                 >
                   <span className="text-3xl group-hover:scale-110 transition-transform emoji">📥</span>
                   <div className="flex flex-col items-center">
                      <span className="text-base font-bold uppercase tracking-widest">DOWNLOAD BOOKS</span>
                      <span className="text-[11px] opacity-60 font-mono">lscnsk</span>
                   </div>
                 </button>
               )}
             </div>
           ) : (
             <button 
               onClick={() => bookInputRef.current?.click()}
               className={`w-full py-6 px-4 border-2 border-dashed rounded-2xl transition-all flex flex-col items-center gap-3 group ${isBimbo ? 'border-[#FBCFE8] bg-white/30 text-[#BE123C] hover:bg-white/50' : isSurf ? 'border-[#BAE6FD] bg-white/40 text-[#0c4a6e] hover:bg-white/60 hover:border-[#7dd3fc]' : 'border-[#45413e] bg-[#23211f]/30 text-[#888] hover:text-[#fffff0] hover:bg-[#363330]'}`}
             >
               <span className="text-4xl group-hover:scale-110 transition-transform emoji">➕</span>
               <div className="flex flex-col items-center">
                  <span className="text-lg font-bold uppercase tracking-widest">Add audiobook files</span>
                  <span className="text-xs opacity-60 font-mono text-center">Select all mp3 files (and cover) from the audiobook folder, or m4b, m4a, mp4</span>
               </div>
             </button>
           )}
        </div>

        <input 
          type="file" 
          ref={bookInputRef} 
          className="hidden" 
          multiple
          accept={mode === 'audio' ? ".mp3,.m4b,.m4a,.mp4,audio/*,.jpg,.jpeg,.png,.webp,.bmp" : ".fb2,.epub,.pdf,.cbz,.cbr,.bin"}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              if (mode === 'audio') {
                 const hasAudio = Array.from(files).some(f => f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));
                 if (hasAudio && onExternalFolderPicked) onExternalFolderPicked(files);
              } else {
                 const filteredFiles = Array.from(files).filter(f => !f.name.toLowerCase().match(/\.(mp3|m4b|m4a|mp4)$/));
                 if (filteredFiles.length > 0 && onExternalFilePicked) {
                    onExternalFilePicked(filteredFiles);
                 }
              }
            }
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-[#444] space-y-4 mt-16 z-0 relative">
      <div className="text-6xl emoji">
        {mode === 'audio'
          ? isDragon ? '📯' : isFF ? '🎼' : isBimbo ? '💅' : isSurf ? '🏄‍♂️' : '💿'
          : isDragon ? '📜' : isFF ? '📜' : isBimbo ? '🩰' : isSurf ? '🌊' : '📄'}
      </div>
      <p>
        {isDragon
          ? 'Select a scroll or artifact 🛡️'
          : isFF
          ? 'Select a tome or crystall 🔮'
          : isBimbo
          ? 'Pick something bestie 💖'
          : isSurf
          ? 'Catch a wave 🏄'
          : `Select ${mode === 'audio' ? 'an audiobook' : 'an ebook'}`}
      </p>
    </div>
  );
}
