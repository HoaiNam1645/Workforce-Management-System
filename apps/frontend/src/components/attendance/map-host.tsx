'use client';

import { forwardRef, memo } from 'react';

export const MapHost = memo(forwardRef<HTMLDivElement>(function MapHost(_, ref) {
  return <div ref={ref} className="absolute inset-0" />;
}));
