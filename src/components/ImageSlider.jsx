import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

const ImageSlider = ({ images, onNavigate }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const touchMovedRef = useRef(false);
  const restoreAutoPlayRef = useRef(true);
  const suppressClickRef = useRef(false);
  const autoPlayEnabledRef = useRef(isAutoPlaying);

  useEffect(() => {
    autoPlayEnabledRef.current = isAutoPlaying;
  }, [isAutoPlaying]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prevIndex) => 
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    );
    setProgress(0);
  }, [images.length]);

  const goToPrevious = () => {
    setCurrentIndex(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
    setProgress(0);
  };

  // Auto-play and Progress bar logic
  useEffect(() => {
    if (!isAutoPlaying) return;

    const intervalTime = 5000; // 5 seconds per slide
    const updateFrequency = 100; // update every 100ms
    const step = (updateFrequency / intervalTime) * 100;

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNext();
          return 0;
        }
        return prev + step;
      });
    }, updateFrequency);

    return () => clearInterval(progressInterval);
  }, [isAutoPlaying, goToNext]);

  // If images length changes, keep currentIndex within bounds
  useEffect(() => {
    if (!images?.length) return;
    setCurrentIndex((prev) => Math.min(prev, images.length - 1));
    setProgress(0);
  }, [images?.length]);

  const handleTouchStart = (e) => {
    if (!e?.touches?.length) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchMovedRef.current = false;
    restoreAutoPlayRef.current = isAutoPlaying;
    // Pause auto-play during interaction.
    setIsAutoPlaying(false);
  };

  const handleTouchMove = (e) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const x = e?.touches?.[0]?.clientX;
    const y = e?.touches?.[0]?.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (Math.abs(x - touchStartXRef.current) > 8 || Math.abs(y - touchStartYRef.current) > 8) {
      touchMovedRef.current = true;
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const endX = e?.changedTouches?.[0]?.clientX;
    const endY = e?.changedTouches?.[0]?.clientY;
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (typeof endX !== 'number' || typeof startX !== 'number') return;
    const dx = endX - startX;
    const dy = typeof endY === 'number' && typeof startY === 'number' ? endY - startY : 0;

    const threshold = 45;
    const horizontalSwipe = Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);

    if (horizontalSwipe) {
      if (dx < 0) goToNext();
      else goToPrevious();
    } else if (!touchMovedRef.current && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      handleOpenGallery();
    }

    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 250);
    setIsAutoPlaying(restoreAutoPlayRef.current);
  };

  const handleOpenGallery = () => {
    if (typeof onNavigate === 'function') onNavigate('gallery');
  };

  const handleSliderClick = () => {
    if (suppressClickRef.current) return;
    handleOpenGallery();
  };

  return (
    <div className="relative w-full h-[220px] sm:h-[250px] overflow-hidden rounded-b-3xl shadow-[0_18px_45px_rgba(15,23,42,0.25)] group border-x border-b border-white/70">

      {/* Slider container */}
      <div
        className="relative w-full h-full bg-slate-900"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleSliderClick}
        style={{ touchAction: 'pan-y' }}
        role="button"
        aria-label="Open gallery"
      >
        {/* Soft glow + glass sheen */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 right-6 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/10" />
        </div>

        <div
          className="flex w-full h-full transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((image) => (
            <div
              key={image.id}
              className="relative w-full h-full flex-shrink-0 cursor-pointer"
            >
              <img
                src={image.url}
                alt={image.title}
                className="w-full h-full object-cover transform transition-transform duration-[10s] hover:scale-[1.08]"
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const parent = e.target.parentElement;
                  const placeholder = parent.querySelector('.image-placeholder');
                  if (placeholder) placeholder.style.display = 'flex';
                }}
              />

              {/* Overlay Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-transparent" />

              {/* Text overlay: folder name or title (bottom-left) */}
              <div className="absolute left-3 bottom-3 z-20 bg-black/55 backdrop-blur-sm text-white px-3 py-1.5 rounded-xl text-sm font-semibold truncate max-w-[74%] border border-white/15 shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                {image.folderName || image.title}
              </div>

              {/* Placeholder */}
              <div className="image-placeholder absolute inset-0 bg-gray-800 hidden items-center justify-center">
                <div className="text-gray-400 flex flex-col items-center">
                  <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
                  <span className="text-sm font-medium">Image not available</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-1 z-30 flex gap-1 px-3 pt-2">
        {images.map((_, index) => (
          <div key={index} className="h-full flex-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
            <div 
              className={`h-full bg-white transition-all duration-100 ease-linear ${
                index === currentIndex ? '' : index < currentIndex ? 'w-full' : 'w-0'
              }`}
              style={{ width: index === currentIndex ? `${progress}%` : undefined }}
            ></div>
          </div>
        ))}
      </div>

      {/* Slide Counter — always visible */}
      <div className="absolute bottom-3 right-3 z-30 flex items-baseline gap-0.5 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg">
        <span className="text-white text-[13px] font-bold">{(currentIndex + 1).toString().padStart(2, '0')}</span>
        <span className="text-white/60 text-[10px] mx-0.5">/</span>
        <span className="text-white/60 text-[10px]">{images.length.toString().padStart(2, '0')}</span>
      </div>

      {/* Auto-play status toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsAutoPlaying(!isAutoPlaying);
        }}
        className="absolute top-3 right-3 z-30 p-1.5 bg-black/30 backdrop-blur-md text-white rounded-lg border border-white/15 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white/10"
      >
        {isAutoPlaying ? (
          <div className="flex gap-0.5 items-center px-0.5">
            <div className="w-0.5 h-2.5 bg-white rounded-full animate-pulse"></div>
            <div className="w-0.5 h-2.5 bg-white rounded-full animate-pulse delay-75"></div>
          </div>
        ) : (
          <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-transparent border-l-[7px] border-l-white ml-0.5"></div>
        )}
      </button>

      <style>{`
        @keyframes rotate-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ImageSlider;
