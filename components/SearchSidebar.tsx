import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Trash2 } from 'lucide-react';
import { Chapter } from '../types';

interface SearchSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  onResultClick: (chapterIndex: number, text: string, matchIndex: number) => void;
  onClearHighlight: () => void;
}

const SearchSidebar: React.FC<SearchSidebarProps> = ({
  isOpen,
  onClose,
  chapters,
  onResultClick,
  onClearHighlight
}) => {
  const [query, setQuery] = useState('');
  const [allResults, setAllResults] = useState<{chapterIndex: number, snippet: string, textToFind: string, matchIndex: number}[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
     if (!query.trim()) return;
     setIsSearching(true);
     setAllResults([]);
     setVisibleCount(5);
     
     // Async search
     setTimeout(() => {
         const hits: typeof allResults = [];
         
         // Pre-compile regex for performance
         const tagRegex = /<[^>]*>/g;
         const lowerQuery = query.toLowerCase();

         for (let idx = 0; idx < chapters.length; idx++) {
             const ch = chapters[idx];
             if (!ch.content) continue;

             // Optimization: Use Regex to strip HTML tags. 
             // Faster than DOMParser or creating DIVs for large iterations.
             const text = ch.content.replace(tagRegex, ' ').replace(/\s+/g, ' ');
             
             const lowerText = text.toLowerCase();
             let pos = 0;
             let localMatchCount = 0;
             
             while (pos < lowerText.length) {
                 const found = lowerText.indexOf(lowerQuery, pos);
                 if (found === -1) break;
                 
                 const start = Math.max(0, found - 30);
                 const end = Math.min(text.length, found + query.length + 30);
                 const snippet = "..." + text.substring(start, end) + "...";
                 
                 hits.push({ 
                     chapterIndex: idx, 
                     snippet,
                     textToFind: query,
                     matchIndex: localMatchCount 
                 });
                 
                 localMatchCount++;
                 pos = found + query.length;
                 if (hits.length > 100) break; // Hard limit per book
             }
             if (hits.length > 200) break; // Global limit
         }
         
         setAllResults(hits);
         setIsSearching(false);
     }, 100);
  };

  const showMore = () => {
      setVisibleCount(prev => prev + 5);
  };

  return (
    <div className={`fixed inset-y-0 right-0 z-40 w-full md:w-96 bg-[#2c2a28] border-l border-[#45413e] transform transition-transform duration-300 shadow-2xl flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
       <div className="p-4 border-b border-[#45413e] flex items-center justify-between bg-[#23211f]">
           <h2 className="font-bold flex items-center gap-2 text-[#fffff0]">
                <span className="text-xl">🔍</span> Search in Book
           </h2>
           <div className="flex items-center gap-2">
                <button onClick={onClose} className="text-[#888] hover:text-white"><X /></button>
           </div>
       </div>
       
       <div className="p-4 flex-1 flex flex-col min-h-0">
           <div className="flex gap-2 mb-4 shrink-0">
              <input 
                 className="flex-1 bg-[#1c1917] border border-[#45413e] rounded px-3 py-2 text-sm text-[#fffff0] focus:outline-none focus:border-[#78716c]"
                 placeholder="Type to search..."
                 value={query}
                 onChange={(e) => setQuery(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch} className="bg-[#45413e] text-[#fffff0] px-4 rounded hover:bg-[#57534e] font-medium">Go</button>
           </div>
           
           <div className="flex-1 overflow-y-auto custom-scroll pr-1">
               {isSearching && <div className="text-center text-[#666] py-10">Searching...</div>}
               
               {!isSearching && allResults.length === 0 && query && (
                   <div className="text-center text-[#555] py-10">No matches found.</div>
               )}

               <div className="space-y-3">
                   {allResults.slice(0, visibleCount).map((res, i) => (
                       <div 
                         key={i} 
                         onClick={() => { onResultClick(res.chapterIndex, res.textToFind, res.matchIndex); onClose(); }}
                         className="bg-[#363330] p-3 rounded cursor-pointer hover:bg-[#45413e] border border-transparent active:scale-[0.98] transition-all"
                       >
                           <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-[#888] bg-[#23211f] px-1.5 py-0.5 rounded">Ch. {res.chapterIndex + 1}</span>
                           </div>
                           <div className="text-sm text-[#d6d3d1] leading-snug font-serif">
                               {res.snippet.split(new RegExp(`(${query})`, 'gi')).map((part, idx) => 
                                   part.toLowerCase() === query.toLowerCase() 
                                   ? <span key={idx} className="text-[#fcd34d] font-bold bg-[#fcd34d]/10">{part}</span> 
                                   : part
                               )}
                           </div>
                       </div>
                   ))}
               </div>

               {/* Load More Button */}
               {!isSearching && visibleCount < allResults.length && (
                   <button 
                       onClick={showMore}
                       className="w-full mt-4 py-3 bg-[#363330] text-[#888] hover:text-white rounded flex items-center justify-center gap-2 transition-colors"
                   >
                       <span>Show next 5 results</span>
                       <ChevronDown size={16} />
                   </button>
               )}
           </div>
       </div>
    </div>
  );
};

export default SearchSidebar;