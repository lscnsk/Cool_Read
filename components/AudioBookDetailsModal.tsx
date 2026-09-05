import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';

interface AudioBookDetailsModalProps {
  isOpen: boolean;
  suggestedTitle: string;
  suggestedAuthor?: string;
  appStyle: string;
  onConfirm: (title: string, author: string) => void;
  onCancel: () => void;
}

export const AudioBookDetailsModal: React.FC<AudioBookDetailsModalProps> = ({
  isOpen,
  suggestedTitle,
  suggestedAuthor,
  appStyle,
  onConfirm,
  onCancel
}) => {
  const [title, setTitle] = useState(suggestedTitle);
  const [author, setAuthor] = useState(suggestedAuthor || '');

  const isBimbo = appStyle === 'Bimbo';
  const isFF = appStyle === 'Final Fantasy' || appStyle === 'Final';
  const isDragon = appStyle === 'Dragon';

  useEffect(() => {
    if (isOpen) {
      setTitle(suggestedTitle);
      setAuthor(suggestedAuthor || '');
    }
  }, [isOpen, suggestedTitle, suggestedAuthor]);

  const handleConfirm = () => {
    onConfirm(title || suggestedTitle, author);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className={`relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${
              isBimbo 
                ? 'bg-[#FFF1F2] border-[#FBCFE8] text-[#BE123C]' 
                : isDragon 
                ? 'bg-[#1a1c1e] border-[#3f474f] text-[#fffff0]'
                : isFF
                ? 'bg-[#00051a] border-[#1a3a6e] text-[#fffff0]'
                : 'bg-[#23211f] border-[#45413e] text-[#fffff0]'
            }`}
          >
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h3 className={`text-2xl font-bold tracking-tight ${isBimbo ? 'font-bimbo font-normal text-4xl tracking-wider' : (isFF ? 'font-ff font-normal text-xl tracking-widest' : (isDragon ? 'font-dragon font-normal text-3xl text-[#fffff0] tracking-wider' : ''))}`}>
                  Audio Book Details
                </h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-60">Title</label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter book title..."
                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all ${
                      isBimbo 
                        ? 'bg-white/50 border-[#FBCFE8] focus:ring-[#BE123C]/30 text-[#BE123C] placeholder-[#BE123C]/30' 
                        : 'bg-black/20 border-[#45413e] focus:ring-[#fffff0]/10 text-[#fffff0] placeholder-[#888]'
                    }`}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest opacity-60">Author</label>
                  <input 
                    type="text" 
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter author name..."
                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all ${
                      isBimbo 
                        ? 'bg-white/50 border-[#FBCFE8] focus:ring-[#BE123C]/30 text-[#BE123C] placeholder-[#BE123C]/30' 
                        : 'bg-black/20 border-[#45413e] focus:ring-[#fffff0]/10 text-[#fffff0] placeholder-[#888]'
                    }`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={onCancel}
                  className="flex-1 py-3.5 px-4 transition-all flex items-center justify-center hover:scale-110 opacity-70 hover:opacity-100 focus:outline-none border-0 bg-transparent shadow-none outline-none focus:ring-0 select-none pb-4 pt-4"
                >
                  <span className="text-3xl emoji">❌</span>
                </button>
                <button 
                  onClick={handleConfirm}
                  className="flex-1 py-3.5 px-4 transition-all flex items-center justify-center hover:scale-110 opacity-70 hover:opacity-100 focus:outline-none border-0 bg-transparent shadow-none outline-none focus:ring-0 select-none pb-4 pt-4"
                >
                   <span className="text-3xl emoji">✅</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
