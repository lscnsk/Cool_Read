import React, { useEffect, useRef, useState } from 'react';
import { Book } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

const getAssetUrl = (path: string): string => {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/${path.replace(/^\//, '')}`;
    }
  } catch (e) {}
  return `/${path.replace(/^\//, '')}`;
};

pdfjsLib.GlobalWorkerOptions.workerSrc = getAssetUrl('pdf.worker.min.mjs');

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
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
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

  const activeRenderPageNumRef = useRef<number | null>(null);
  const isRenderingRef = useRef<boolean>(false);
  const queuedRenderArgsRef = useRef<{ pageNum: number } | null>(null);

  const isComic = book.format === 'comic';

  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [pdfPageSize, setPdfPageSize] = useState<{ width: number; height: number } | null>(null);
  const tapStartRef = useRef<number>(0);
  const restoredRef = useRef<boolean>(false);

  // Listen for container resize to scale PDF canvas properly
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setDimensions(prev => {
            if (Math.abs(prev.width - w) < 2 && Math.abs(prev.height - h) < 2) {
              return prev;
            }
            return { width: w, height: h };
          });
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
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

  const renderSequenceRef = useRef<number>(0);
  const currentRenderTaskRef = useRef<any>(null);

  // Load PDF file (Skip for Comics)
  useEffect(() => {
    if (isComic) {
      setIsLoading(false);
      return;
    }

    let isAborted = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;

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

        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          cMapUrl: getAssetUrl('cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: getAssetUrl('standard_fonts/'),
          wasmUrl: getAssetUrl('wasm/'),
          enableXfa: false,
        });
        const pdf = await loadingTask.promise;

        if (isAborted) {
          try { pdf.destroy(); } catch (e) {}
          return;
        }

        // Clean up previous PDF document proxy if existing
        if (pdfDocRef.current) {
          try { pdfDocRef.current.destroy(); } catch (e) {}
        }

        loadedDoc = pdf;
        pdfDocRef.current = pdf;
        setPdfDoc(pdf);
      } catch (err) {
        console.error("Error loading PDF", err);
      } finally {
        if (!isAborted) setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isAborted = true;
      if (loadedDoc) {
        try { loadedDoc.destroy(); } catch (e) {}
      } else if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch (e) {}
        pdfDocRef.current = null;
      }
    };
  }, [book.id, isComic]);

  // Render PDF Page onto canvas (Only for PDFs)
  useEffect(() => {
    if (isComic || !pdfDoc || dimensions.width === 0 || dimensions.height === 0) return;

    const pageNum = currentChapterIndex + 1; // 1-indexed
    if (pageNum > pdfDoc.numPages) return;

    // If we are ALREADY rendering the SAME page number, queue the update and do NOT cancel active render task!
    if (isRenderingRef.current && activeRenderPageNumRef.current === pageNum) {
      queuedRenderArgsRef.current = { pageNum };
      return;
    }

    // If page number CHANGED (e.g. turned page), cancel previous render task
    if (isRenderingRef.current && activeRenderPageNumRef.current !== pageNum) {
      if (currentRenderTaskRef.current) {
        try { currentRenderTaskRef.current.cancel(); } catch (e) {}
        currentRenderTaskRef.current = null;
      }
    }

    activeRenderPageNumRef.current = pageNum;
    isRenderingRef.current = true;
    queuedRenderArgsRef.current = null;

    const renderId = ++renderSequenceRef.current;

    const executeRender = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (renderId !== renderSequenceRef.current) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Base 1.0 viewport to compute scale to fit screen
        const baseViewport = page.getViewport({ scale: 1.0 });
        const scaleX = dimensions.width / baseViewport.width;
        const scaleY = dimensions.height / baseViewport.height;
        const scaleFit = Math.min(scaleX, scaleY);

        // Viewport at CSS display scale
        const displayViewport = page.getViewport({ scale: scaleFit });
        setPdfPageSize({ width: displayViewport.width, height: displayViewport.height });

        // High-DPI render viewport for crisp rasterization
        const dpr = window.devicePixelRatio || 1;
        const totalScale = scaleFit * dpr * renderedScale;
        const renderViewport = page.getViewport({ scale: totalScale });

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = Math.floor(displayViewport.width) + "px";
        canvas.style.height = Math.floor(displayViewport.height) + "px";
        canvas.style.backgroundColor = '#ffffff';

        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.style.width = canvas.style.width;
          textLayerDiv.style.height = canvas.style.height;
          textLayerDiv.style.setProperty("--total-scale-factor", `${displayViewport.scale}`);
          textLayerDiv.style.setProperty("--scale-round-x", `${1 / displayViewport.scale}px`);
          textLayerDiv.style.setProperty("--scale-round-y", `${1 / displayViewport.scale}px`);
          textLayerDiv.innerHTML = '';
        }

        const context = canvas.getContext('2d');
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: renderViewport,
          background: 'rgb(255, 255, 255)'
        };

        const renderTask = page.render(renderContext);
        currentRenderTaskRef.current = renderTask;

        await renderTask.promise;

        if (renderId !== renderSequenceRef.current) return;

        // Render selectable transparent text overlay
        if (textLayerDiv) {
          try {
            const textContent = await page.getTextContent();
            if (renderId !== renderSequenceRef.current) return;

            // @ts-ignore
            const textLayer = new pdfjsLib.TextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: displayViewport,
            });
            await textLayer.render();
          } catch (e) {
            console.warn("Text layer render warning:", e);
          }
        }

        onProgressUpdate(1);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error("Render page error:", err);
        }
      } finally {
        isRenderingRef.current = false;
        // If a re-render was requested while rendering (e.g., layout settled or scale updated), re-render now!
        if (queuedRenderArgsRef.current) {
          const queued = queuedRenderArgsRef.current;
          queuedRenderArgsRef.current = null;
          if (queued.pageNum === currentChapterIndex + 1) {
            // Trigger next frame render
            requestAnimationFrame(() => {
              if (activeRenderPageNumRef.current === queued.pageNum) {
                renderSequenceRef.current++;
                executeRender();
              }
            });
          }
        }
      }
    };

    executeRender();

    return () => {
      // Cleanup on unmount or page change
      if (activeRenderPageNumRef.current !== pageNum) {
        if (currentRenderTaskRef.current) {
          try { currentRenderTaskRef.current.cancel(); } catch (e) {}
          currentRenderTaskRef.current = null;
        }
      }
    };
  }, [pdfDoc, currentChapterIndex, isComic, dimensions, renderedScale]);

  // Extract comic image source blob URL
  const getComicImageUrl = (): string => {
    const chapter = book.chapters[currentChapterIndex];
    if (!chapter) return '';
    if (chapter.file instanceof Blob) {
      if (!chapter.url || !chapter.url.startsWith('blob:')) {
        chapter.url = URL.createObjectURL(chapter.file);
      }
      return chapter.url;
    }
    if (chapter.url && (chapter.url.startsWith('blob:') || chapter.url.startsWith('data:') || chapter.url.startsWith('http'))) {
      return chapter.url;
    }
    if (chapter.content) {
      const match = chapter.content.match(/src="([^"]+)"/);
      if (match) return match[1];
    }
    return '';
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
    // If text is currently selected, DO NOT flip page or toggle UI
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

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
                onError={(e) => {
                  const chapter = book.chapters[currentChapterIndex];
                  if (chapter?.file instanceof Blob) {
                    const freshUrl = URL.createObjectURL(chapter.file);
                    chapter.url = freshUrl;
                    chapter.content = `<img src="${freshUrl}" alt="page ${currentChapterIndex + 1}" style="width: 100%; height: auto;" />`;
                    (e.currentTarget as HTMLImageElement).src = freshUrl;
                  }
                }}
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
            <div 
              className="relative shadow-2xl overflow-hidden"
              style={{
                width: pdfPageSize ? Math.floor(pdfPageSize.width) + "px" : "auto",
                height: pdfPageSize ? Math.floor(pdfPageSize.height) + "px" : "auto",
                backgroundColor: '#ffffff',
              }}
            >
              <canvas 
                ref={canvasRef} 
                className="max-w-full max-h-full block pointer-events-none" 
                style={{ backgroundColor: '#ffffff' }}
              />
              <div ref={textLayerRef} className="textLayer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PDFReader;
