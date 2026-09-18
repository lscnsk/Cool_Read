import React, { useState, useEffect } from 'react';

interface SmartCoverImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackComponent?: React.ReactNode;
}

export const SmartCoverImage: React.FC<SmartCoverImageProps> = ({
  src,
  alt,
  className = '',
  fallbackComponent
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError && fallbackComponent) {
    return <>{fallbackComponent}</>;
  }

  if (hasError) {
    return (
      <div className="w-full h-full min-h-0 bg-black/20 rounded flex items-center justify-center">
        <span className="text-sm opacity-40">📖</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
};
