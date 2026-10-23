'use client';

import { forwardRef, memo } from 'react';

export const MapHost = memo(forwardRef<HTMLDivElement, { className: string }>(function MapHost({ className }, ref) {
  return <div ref={ref} className={className} />;
}));
