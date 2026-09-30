import React from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw,
  RotateCw,
  Gauge,
  Plus,
  Minus
} from './Icons';
import { formatTime } from '../utils/time';
import { Book } from '../types';

interface PlayerControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  playbackRate: number;
  onRateChange: (rate: number) => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  totalProgress: number;
  currentBook: Book | null;
  currentChapterIndex: number;
  appStyle?: string;
  globalCurrentTime?: number;
  globalDuration?: number;
  onGlobalSeek?: (time: number) => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  playbackRate,
  onRateChange,
  currentTime,
  duration,
  onSeek,
  totalProgress,
  currentBook,
  currentChapterIndex,
  appStyle,
  globalCurrentTime,
  globalDuration,
  onGlobalSeek
}) => {
  
  const isBimbo = appStyle === 'Bimbo';
  const isSurf = appStyle === 'Surf';
  const isMarcel = appStyle === 'Marcel';
  
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };

  const skipForward10 = () => {
    onSeek(currentTime + 10);
  };

  const skipBack10 = () => {
    onSeek(currentTime - 10);
  };

  const handleSpeedSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
      onRateChange(parseFloat(e.target.value));
  };

  const adjustSpeed = (delta: number) => {
      // Clamp between 1.0 and 4.0 based on new requirements
      const newRate = Math.round((playbackRate + delta) * 100) / 100;
      onRateChange(Math.max(1.0, Math.min(4.0, newRate)));
  };

  const hasChapters = currentBook && currentBook.chapters && currentBook.chapters.length > 1;
  const isGlobalMode = false;

  const barMax = duration || 100;
  const barValue = currentTime;
  const barProgressPercent = barMax ? (barValue / barMax) * 100 : 0;

  // Calculate remaining time for the entire book adjusted by speed
  const calculateRemainingTime = () => {
    if (!currentBook) return "00:00";
    
    // Remaining time in current chapter
    const remainingCurrent = Math.max(0, duration - currentTime);
    
    // Sum duration of future chapters (if known)
    let remainingFuture = 0;
    if (currentBook.chapters) {
        for (let i = currentChapterIndex + 1; i < currentBook.chapters.length; i++) {
            // Use metadata duration if available, else 0
            remainingFuture += (currentBook.chapters[i].duration || 0);
        }
    }

    // Ensure we don't divide by zero, though min speed is 1.0 now
    const effectiveRate = playbackRate > 0 ? playbackRate : 1;
    
    // We add remainingCurrent + remainingFuture to get total raw seconds left, 
    // then divide by speed to get "listening time left"
    const totalRemainingRealTime = (remainingCurrent + remainingFuture) / effectiveRate;
    return formatTime(totalRemainingRealTime);
  };

  const accentColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0ea5e9' : '#fffff0';
  const trackBg = isMarcel ? '#C4B5E6' : isBimbo ? '#FBCFE8' : isSurf ? '#e0f2fe' : '#333';
  const controlColor = isMarcel ? '#544372' : isBimbo ? '#BE123C' : isSurf ? '#0284c7' : '#666';
  const textColor = isMarcel ? '#2F2440' : isBimbo ? '#BE123C' : isSurf ? '#0c4a6e' : '#fffff0';
  const secondaryTextColor = isMarcel ? '#766594' : isBimbo ? '#BE123C/70' : isSurf ? '#0369a1' : '#777';
  const dimControlColor = isMarcel ? '#9B8EAE' : isBimbo ? '#BE123C/40' : isSurf ? '#7dd3fc' : '#444';

  return (
    <div className="w-full flex flex-col gap-3 md:gap-6 select-none">
      
      {/* Track Progress Bar */}
      <div className="flex flex-col gap-1.5 w-full group relative">
        <div className="relative w-full h-1.5 flex items-center mb-1">
          {/* Main Range Input (Transparent background for customizable tick markings underneath) */}
          <input
            type="range"
            min={0}
            max={barMax}
            value={barValue}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (isGlobalMode && onGlobalSeek) {
                onGlobalSeek(val);
              } else {
                onSeek(val);
              }
            }}
            className="absolute left-0 top-0 w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all z-20"
            style={{
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              outline: 'none',
              // @ts-ignore
              '--thumb-bg': accentColor
            }}
          />

          {/* Styled Visual Track (Underneath the input to show played color + ticks) */}
          <div className="absolute left-0 right-0 top-0 h-1.5 rounded-full pointer-events-none overflow-hidden z-10 flex items-center" style={{ backgroundColor: trackBg }}>
            <div 
              className="h-full" 
              style={{ 
                width: `${barProgressPercent}%`, 
                backgroundColor: accentColor 
              }} 
            />
          </div>


        </div>

        <style>{`
          input[type=range]::-webkit-slider-thumb {
            appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: ${accentColor} !important;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.6);
          }
          input[type=range]::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: ${accentColor} !important;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.6);
            border: none;
          }
        `}</style>
        <div className="flex justify-between text-xs font-sans tracking-wide" style={{ color: isMarcel ? '#766594' : isBimbo ? '#BE123C' : isSurf ? '#0ea5e9' : '#777' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

        {/* Main Controls Container */}
        <div className="flex flex-col md:flex-row items-end md:items-center justify-between gap-y-4 md:gap-0">
          
          {/* Play/Pause/Skip Controls */}
          <div className="order-1 md:order-2 w-full md:w-auto flex items-center justify-center gap-6 md:gap-8">
            <button onClick={onPrev} className="transition-colors active:scale-95 transform" style={{ color: controlColor }} >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            
            <button onClick={skipBack10} className="transition-colors active:scale-95 transform p-2" style={{ color: controlColor }} >
              <RotateCcw className="w-6 h-6" />
            </button>
            
            <button 
              onClick={onTogglePlay} 
              className="w-16 h-16 md:w-20 md:h-20 rounded-full hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg transition-all duration-300"
              style={{ backgroundColor: accentColor, color: isMarcel ? '#F3EFFB' : isBimbo ? '#FFFFFF' : isSurf ? '#FFFFFF' : '#1c1c1c' }}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" />
              ) : (
                <Play className="w-6 h-6 md:w-8 md:h-8 fill-current ml-1" />
              )}
            </button>
  
            <button onClick={skipForward10} className="transition-colors active:scale-95 transform p-2" style={{ color: controlColor }} >
              <RotateCw className="w-6 h-6" />
            </button>
  
            <button onClick={onNext} className="transition-colors active:scale-95 transform" style={{ color: controlColor }} >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
          </div>


        {/* Bottom Row Wrapper */}
        <div className="order-2 w-full flex flex-row md:contents items-end justify-between px-2 md:px-0 relative mt-2 md:mt-0">
          
          {/* Speed Control Layout */}
          <div className="md:order-1 flex flex-col items-center w-40 gap-1">
              {/* Top Row: - Icon/Value + */}
              <div className="flex items-center justify-between w-full px-2">
                  <button onClick={() => adjustSpeed(-0.25)} className="hover:text-white active:scale-90 p-1" style={{ color: controlColor }}>
                     <Minus size={18} />
                  </button>
                  
                  <div className="flex items-center gap-1.5" style={{ color: textColor }}>
                      <Gauge className="w-5 h-5 opacity-90" />
                      <span className="text-lg font-bold font-sans tracking-tight w-10 text-center">{playbackRate.toFixed(2)}x</span>
                  </div>
 
                  <button onClick={() => adjustSpeed(0.25)} className="hover:text-white active:scale-90 p-1" style={{ color: controlColor }}>
                     <Plus size={18} />
                  </button>
              </div>

             {/* Bottom Row: Ruler Slider */}
             <div className="relative w-full h-8 flex items-center justify-center">
                 {/* Ruler Line (Connecting ticks) */}
                 <div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#444] -translate-y-1/2 z-0"></div>

                 {/* Ruler Ticks */}
                 <div className="absolute top-1/2 left-0 w-full h-4 -translate-y-1/2 flex justify-between items-center px-1 pointer-events-none z-0">
                     {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((tick) => (
                         <div key={tick} className="flex flex-col items-center gap-1 relative">
                            {/* Tick mark */}
                            <div className={`w-0.5 bg-[#444] ${Number.isInteger(tick) ? 'h-3' : 'h-1.5'}`}></div>
                         </div>
                     ))}
                 </div>
                 
                 {/* Slider */}
                 <input 
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={Math.max(1.0, playbackRate)}
                    onChange={handleSpeedSlider}
                    className="relative z-10 w-full h-8 bg-transparent appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-[#fffff0] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1c1c1c] [&::-webkit-slider-thumb]:rounded-[2px] hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95 transition-all"
                />
             </div>
          </div>

          {/* Book Time Remaining - INCREASED SIZE */}
          <div className="md:order-3 md:w-40 flex flex-col items-end gap-0.5 md:gap-1" style={{ color: controlColor }}>
            <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold font-sans tracking-tight leading-none" style={{ color: textColor }}>
                   -{calculateRemainingTime()}
                </span>
            </div>
            <span className="text-sm font-medium opacity-70">
              {Math.round(totalProgress)}% Complete
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PlayerControls;