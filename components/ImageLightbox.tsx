import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  onClose: () => void;
  illustrations: string[];
  onNavigate: (newSrc: string) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  src,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[65] bg-black/95 flex flex-col items-center justify-center select-none animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div className="relative max-w-full max-h-full flex items-center justify-center p-4">
          <img 
            src={src} 
            className="max-w-full max-h-full object-contain select-none shadow-2xl"
            alt="Full view" 
          />
      </div>
    </div>
  );
};
