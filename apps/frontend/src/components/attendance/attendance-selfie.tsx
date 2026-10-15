'use client';

import { Camera, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function AttendanceSelfie({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setSource(null);
    setFailed(false);
    void apiBlob(path)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) return <span className={cn('grid place-items-center border border-line bg-canvas text-muted', className)} title="Không tải được ảnh selfie"><Camera className="size-4" /></span>;
  if (!source) return <span className={cn('grid place-items-center border border-line bg-canvas text-muted', className)}><LoaderCircle className="size-4 animate-spin" /></span>;
  return <img src={source} alt={alt} className={cn('border border-line object-cover', className)} />;
}
