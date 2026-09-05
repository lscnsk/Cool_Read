import React, { useEffect, useRef, useState } from 'react';
import { Book } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PDFReaderProps {
  book: Book;
  currentChapterIndex: number;
  initialProgressRatio: number;
  theme: 'dark' | 'light';
  uiVisible: boolean;
  appStyle?: string;
  onToggleUI: () => void;
  onProgressUpdate: (ratio: number) => void;
  onChapterChange: (index: number, align: 'start' | 'end') => void;
  onExternalLinkClick?: (href: string) => void;
}

const PDFReader: React.FC<PDFReaderProps> = ({
  book,
  currentChapterIndex,
  theme,
  appStyle,
  onToggleUI,
  onProgressUpdate,
  onChapterChange,
  initialProgressRatio
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Gesture & Zoom States
  const [scale, setScale] = useState<number>(1.0);
  const [renderedScale, setRenderedScale] = useState<number>(1.0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1.0);

  // Resize boundaries
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const isComic = book.format === 'comic';

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pdfPageSize, setPdfPageSize] = useState<{ width: number; height: number } | null>(null);
  const tapStartRef = useRef<number>(0);
  const restoredRef = useRef<boolean>(false);

  // Listen for container resize to scale PDF canvas properly
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    // Execute a slight delay to let DOM adjust first
    const timer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

  // Detect if scrolling is needed when loaded or resized
  useEffect(() => {
    if (!isComic || !containerRef.current) return;
    // Small timeout to allow DOM to layout the image
    const timer = setTimeout(() => {
        const container = containerRef.current;
        if (container) {
            // Wait until the scroll has actually restored before we start measuring progress
            if (!restoredRef.current && initialProgressRatio > 0) {
                return;
            }
            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll > 0) {
                const ratio = container.scrollTop / maxScroll;
                onProgressUpdate(ratio);
            }
            // Do NOT report 1 (100%) here just because maxScroll is 0, 
            // as the image might still be loading or it might just be a small page.
        }
    }, 150);
    return () => clearTimeout(timer);
  }, [isComic, currentChapterIndex, dimensions, imageSize, onProgressUpdate]);

  // Reset Scale, Offset and Scroll position on page turn
  useEffect(() => {
    setScale(1.0);
    setRenderedScale(1.0);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    
    // Reset restored ref for the new page / chapter load
    restoredRef.current = false;
    
    if (containerRef.current) {
      if (isComic && initialProgressRatio > 1e-4) {
        // Wait for images to load usually, but let's try a small delay or immediate if possible
        const scroll = () => {
          const el = containerRef.current;
          if (el) {
            const maxScroll = el.scrollHeight - el.clientHeight;
            if (maxScroll > 0) {
                el.scrollTop = initialProgressRatio * maxScroll;
                restoredRef.current = true;
            } else if (imageSize) {
                // If image size known but maxScroll is 0, then we are at the top and it is restored
                el.scrollTop = 0;
                restoredRef.current = true;
            }
          }
        };
        // Multiple attempts at scroll restoration as images load
        setTimeout(scroll, 50); 
        setTimeout(scroll, 150);
        setTimeout(scroll, 400);
      } else {
        containerRef.current.scrollTop = 0;
        restoredRef.current = true;
      }
    }
  }, [currentChapterIndex, isComic, book.id]); // Added book.id to be safe

  // Debounce scale changes to re-render PDF canvas at higher quality only when zoom stops
  useEffect(() => {
    if (isComic) return;
    const timer = setTimeout(() => {
      setRenderedScale(scale);
    }, 250);
    return () => clearTimeout(timer);
  }, [scale, isComic]);

  // Handle scroll events to save progress for comics
  useEffect(() => {
    if (!isComic) return;
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: any = null;
    const handleScroll = () => {
      // Don't save 0/low progress while still restoring the scroll position
      if (!restoredRef.current && initialProgressRatio > 0) {
        return;
      }
      
      if (scrollTimeout) return;
      
      scrollTimeout = setTimeout(() => {
          const el = containerRef.current;
          if (el && restoredRef.current) {
              const maxScroll = el.scrollHeight - el.clientHeight;
              if (maxScroll > 0) {
                  const ratio = el.scrollTop / maxScroll;
                  onProgressUpdate(ratio);
              } else {
                  // If it fits on screen, progress within the chapter is effectively "complete" 
                  // but we should only report this if we are sure it fits naturally
                  if (imageSize) onProgressUpdate(0); 
              }
          }
          scrollTimeout = null;
      }, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
        container.removeEventListener('scroll', handleScroll);
        if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [isComic, onProgressUpdate, initialProgressRatio, imageSize]);

  // Load PDF file (Skip for Comics)
  useEffect(() => {
    if (isComic) {
      setIsLoading(false);
      return;
    }

    const loadPdf = async () => {
      setIsLoading(true);
      try {
        let file = book.chapters[0]?.file;
        let arrayBuffer: ArrayBuffer | null = null;
        
        if (!file && book.chapters[0]?.path) {
            const { Capacitor } = await import('@capacitor/core');
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            
            const uriResult = await Filesystem.getUri({ 
                path: book.chapters[0].path, 
                directory: Directory.ExternalStorage 
            });
            const webViewSrc = Capacitor.convertFileSrc(uriResult.uri);
            const res = await fetch(webViewSrc);
            arrayBuffer = await res.arrayBuffer();
        } else if (file) {
            arrayBuffer = await file.arrayBuffer();
        } else if ((book as any).pdfBlob) {
            arrayBuffer = await ((book as any).pdfBlob as Blob).arrayBuffer();
        }
        
        if (!arrayBuffer) {
            console.error("No file source for PDF.");
            return;
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
      } catch (err) {
        console.error("Error loading PDF", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadPdf();
  }, [book.id, isComic]);

  // Render PDF Page onto canvas (Only for PDFs)
  useEffect(() => {
    if (isComic || !pdfDoc || dimensions.width === 0 || dimensions.height === 0) return;
    let renderTask: any = null;

    const renderPage = async () => {
      const pageNum = currentChapterIndex + 1; // 1-indexed
      if (pageNum > pdfDoc.numPages) return;

      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Perfect fullscreen fitting calculation
        const viewportTemp = page.getViewport({ scale: 1.0 });
        const scaleX = dimensions.width / viewportTemp.width;
        const scaleY = dimensions.height / viewportTemp.height;
        const scaleFit = Math.min(scaleX, scaleY);

        const viewport = page.getViewport({ scale: scaleFit });
        setPdfPageSize({ width: viewport.width, height: viewport.height });
        const outputScale = Math.min(5, (window.devicePixelRatio || 1) * renderedScale);

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        if (textLayerRef.current) {
          textLayerRef.current.style.width = canvas.style.width;
          textLayerRef.current.style.height = canvas.style.height;
          textLayerRef.current.innerHTML = '';
        }

        const context = canvas.getContext('2d');
        if (!context) return;
        
        const transform = outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null;

        const renderContext = {
          canvasContext: context,
          transform: transform as any,
          viewport: viewport
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
            const textContent = await page.getTextContent();
            
            try {
              // @ts-ignore
              const textLayer = new pdfjsLib.TextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
              });
              await textLayer.render();
            } catch (e) {
              console.error("Text layer render failed:", e);
            }
        }

        onProgressUpdate(1); // Progress is tracked by current index
      } catch (err) {
        console.error("Render page error", err);
      }
    };
    renderPage();
    return () => {
        if (renderTask) {
            try { renderTask.cancel(); } catch (e) {}
        }
    };
  }, [pdfDoc, currentChapterIndex, isComic, dimensions, renderedScale]);

  // Extract comic image source blob URL
  const getComicImageUrl = (): string => {
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter || !chapter.content) return '';
    const match = chapter.content.match(/src="([^"]+)"/);
    return match ? match[1] : '';
  };

  // Touch Gesture Utilities represent pinch scaling distances
  const getDistance = (t1: Touch, t2: Touch) => {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const constrainOffset = (x: number, y: number, currentScale: number) => {
    if (currentScale <= 1.0) {
      return { x: 0, y: 0 };
    }
    
    let renderedW = dimensions.width || window.innerWidth;
    let renderedH = dimensions.height || window.innerHeight;
    
    if (isComic && imageSize && imageSize.width > 0) {
      const maxLimit = Math.min(dimensions.width || window.innerWidth, 768);
      renderedW = maxLimit;
      renderedH = imageSize.height * (maxLimit / imageSize.width);
    } else if (!isComic && pdfPageSize) {
      renderedW = pdfPageSize.width;
      renderedH = pdfPageSize.height;
    }
    
    const screenW = dimensions.width || window.innerWidth;
    const screenH = dimensions.height || window.innerHeight;
    
    const scaledW = renderedW * currentScale;
    const scaledH = renderedH * currentScale;
    
    let maxX = 0;
    if (scaledW > screenW) {
      maxX = (scaledW - screenW) / 2;
    }
    
    let maxY = 0;
    if (scaledH > screenH) {
      maxY = (scaledH - screenH) / 2;
    }

    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y))
    };
  };

  // TAP & CLICK Paging handlers
  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    // If we've dragged or are currently zoomed in, don't tap-to-turn
    if (scale > 1.0) return;

    // If click/tap took too long, it was likely a scroll or drag, so ignore
    if (Date.now() - tapStartRef.current > 250) {
      return;
    }

    const width = window.innerWidth;
    const x = e.clientX;

    // Outer left 25% -> Prev
    if (x < width * 0.25) {
      if (currentChapterIndex > 0) {
        onChapterChange(currentChapterIndex - 1, 'start');
      }
    } 
    // Outer right 25% -> Next
    else if (x > width * 0.75) {
      if (currentChapterIndex < book.chapters.length - 1) {
        onChapterChange(currentChapterIndex + 1, 'start');
      }
    } 
    // Middle 50% -> Toggle App header / progress controls
    else {
      onToggleUI();
    }
  };

  // ZOOM Handling — Mouse drag & swipe panning
  const handleMouseDown = (e: React.MouseEvent) => {
    tapStartRef.current = Date.now();
    if (scale <= 1.0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1.0) return;
    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    setOffset(constrainOffset(rawX, rawY, scale));
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1.0) {
      setScale(1.0);
      setOffset({ x: 0, y: 0 });
    } else {
      const newScale = 2.5;
      // Zoom centered on clicked relative point
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;
      setScale(newScale);
      setOffset(constrainOffset(-clickX * 1.5, -clickY * 1.5, newScale));
    }
  };

  // Touch zoom: Multi-touch pinch controls and single finger drag
  const handleTouchStart = (e: React.TouchEvent) => {
    tapStartRef.current = Date.now();
    if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = getDistance(e.touches[0], e.touches[1]);
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
    } else if (e.touches.length === 1 && scale > 1.0) {
      const touch = e.touches[0];
      setIsDragging(true);
      dragStartRef.current = { x: touch.clientX - offset.x, y: touch.clientY - offset.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const nextScale = Math.min(Math.max(touchStartScaleRef.current * (dist / touchStartDistRef.current), 1.0), 4.0);
      setScale(nextScale);
      if (nextScale === 1.0) {
        setOffset({ x: 0, y: 0 });
      } else {
        setOffset(prev => constrainOffset(prev.x, prev.y, nextScale));
      }
    } else if (e.touches.length === 1 && isDragging && scale > 1.0) {
      const touch = e.touches[0];
      const rawX = touch.clientX - dragStartRef.current.x;
      const rawY = touch.clientY - dragStartRef.current.y;
      setOffset(constrainOffset(rawX, rawY, scale));
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
    setIsDragging(false);
  };

  const containerClasses = 'bg-[#111111] text-[#fffff0]';

  const comicSrc = isComic ? getComicImageUrl() : '';

  const isVerticallyOverflown = isComic && imageSize && imageSize.width > 0 && 
    (imageSize.height * (Math.min(dimensions.width || window.innerWidth, 768) / imageSize.width)) > (dimensions.height || window.innerHeight);

  const containerFlexClasses = isComic
    ? `flex-1 relative w-full h-full flex flex-col items-center ${isVerticallyOverflown ? 'justify-start pt-4 pb-24' : 'justify-center'} transition-colors duration-300 select-none ${containerClasses}`
    : `flex-1 relative w-full h-full flex items-center justify-center transition-colors duration-300 ${containerClasses}`;

  return (
    <div 
      ref={containerRef}
      onClick={handleTap}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={containerFlexClasses}
      style={{
        touchAction: scale > 1.0 ? 'none' : 'pan-y',
        overflowY: (isComic && scale <= 1.0) ? 'auto' : 'hidden',
      }}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 transition-opacity">
            <div className={`w-12 h-12 border-4 rounded-full animate-spin ${
                appStyle === 'Bimbo' ? 'border-pink-200 border-t-pink-600' : 
                appStyle === 'Surf' ? 'border-sky-200 border-t-sky-600' : 
                appStyle === 'Dragon' ? 'border-orange-200 border-t-orange-600' :
                appStyle === 'Marcel' ? 'border-[#C4B5E6] border-t-[#766594]' :
                'border-[#fffff0]/20 border-t-[#fffff0]'
            }`}></div>
        </div>
      )}
      {!isLoading && (
        <div 
          className="relative max-w-full flex items-center justify-center pointer-events-auto"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            width: '100%',
            height: isComic ? 'auto' : '100%',
            transition: isDragging ? 'none' : 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onDoubleClick={handleDoubleTap}
        >
          {isComic ? (
            comicSrc ? (
              <img 
                src={comicSrc} 
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                  
                  // Restore scroll if not already restored and we have an initial position
                  if (!restoredRef.current && isComic && initialProgressRatio > 0) {
                    const container = containerRef.current;
                    if (container) {
                      const maxScroll = container.scrollHeight - container.clientHeight;
                      if (maxScroll > 0) {
                        container.scrollTop = initialProgressRatio * maxScroll;
                        restoredRef.current = true;
                      }
                    }
                    
                    // Also perform a secondary check in the next frames in case rendering/layout reflows
                    setTimeout(() => {
                      const container = containerRef.current;
                      if (container) {
                        const maxScroll = container.scrollHeight - container.clientHeight;
                        if (maxScroll > 0) {
                          container.scrollTop = initialProgressRatio * maxScroll;
                          restoredRef.current = true;
                        }
                      }
                    }, 50);
                    setTimeout(() => {
                      const container = containerRef.current;
                      if (container) {
                        const maxScroll = container.scrollHeight - container.clientHeight;
                        if (maxScroll > 0) {
                          container.scrollTop = initialProgressRatio * maxScroll;
                          restoredRef.current = true;
                        }
                      }
                    }, 150);
                  } else {
                    restoredRef.current = true;
                  }
                }}
                className="w-full max-w-3xl h-auto pointer-events-none select-none shadow-2xl"
                alt="Comic Page" 
              />
            ) : (
              <div className="text-red-500 text-xs text-center p-4">Comic page image not found.</div>
            )
          ) : (
            <div className="relative max-h-full">
              <canvas ref={canvasRef} className="shadow-2xl max-w-full max-h-full object-contain pointer-events-none" />
              <div ref={textLayerRef} className="textLayer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PDFReader;
