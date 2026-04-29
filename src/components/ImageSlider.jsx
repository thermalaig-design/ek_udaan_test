import React, { useState, useEffect, useRef } from 'react';

const ImageSlider = ({ images, autoPlayInterval = 3000, onNavigate }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const sliderRef = useRef(null);
  const autoPlayRef = useRef(null);
  const dragDistanceRef = useRef(0);

  // Auto-play functionality
  useEffect(() => {
    if (images.length <= 1) return;
    
    autoPlayRef.current = setInterval(() => {
      if (!isDragging) {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }
    }, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [images.length, autoPlayInterval, isDragging]);

  // Touch/Mouse handlers
  const handleStart = (clientX) => {
    setIsDragging(true);
    setStartX(clientX);
    setTranslateX(0);
    dragDistanceRef.current = 0;
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    const diff = clientX - startX;
    setTranslateX(diff);
    dragDistanceRef.current = Math.max(dragDistanceRef.current, Math.abs(diff));
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 50;
    if (translateX < -threshold && currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (translateX > threshold && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
    
    setTranslateX(0);
    
    // Restart auto-play
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
    }
    autoPlayRef.current = setInterval(() => {
      if (!isDragging) {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }
    }, autoPlayInterval);
  };

  // Touch events
  const onTouchStart = (e) => handleStart(e.touches[0].clientX);
  const onTouchMove = (e) => handleMove(e.touches[0].clientX);
  const onTouchEnd = () => handleEnd();

  // Mouse events
  const onMouseDown = (e) => handleStart(e.clientX);
  const onMouseMove = (e) => {
    if (isDragging) handleMove(e.clientX);
  };
  const onMouseUp = () => handleEnd();
  const onMouseLeave = () => {
    if (isDragging) handleEnd();
  };

  const handleSliderClick = () => {
    if (dragDistanceRef.current > 8) return;
    if (typeof onNavigate === 'function') onNavigate('gallery');
  };

  if (!images || images.length === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl">
      {/* Slider container */}
      <div
        ref={sliderRef}
        className="flex transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(calc(-${currentIndex * 100}% + ${translateX}px))`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClick={handleSliderClick}
      >
        {images.map((image, index) => (
          <div
            key={index}
            className="w-full flex-shrink-0"
            style={{ minWidth: '100%' }}
          >
            <img
              src={image.url}
              alt={image.label || `Image ${index + 1}`}
              loading="lazy"
              className="w-full h-56 sm:h-64 object-cover bg-slate-100"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Navigation dots */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-white scale-125'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/50 text-white text-xs font-semibold">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
};

export default ImageSlider;
