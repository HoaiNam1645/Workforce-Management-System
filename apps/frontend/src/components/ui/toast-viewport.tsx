'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast';
import { cn } from '@/lib/utils';

type ToastItem = ToastPayload & { id: number };

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function receive(event: Event) {
      const payload = (event as CustomEvent<ToastPayload>).detail;
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-3), { ...payload, id }]);
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), payload.duration ?? 4200);
    }
    window.addEventListener(TOAST_EVENT, receive);
    return () => window.removeEventListener(TOAST_EVENT, receive);
  }, []);

  return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 top-20 z-[200] flex w-[calc(100%-2rem)] max-w-[390px] flex-col gap-2 sm:right-6">
    {items.map((item) => {
      const tone = item.tone ?? 'info';
      const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? AlertCircle : Info;
      return <div key={item.id} role={tone === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto relative overflow-hidden border bg-surface shadow-[0_18px_55px_rgba(22,52,86,0.18)]', tone === 'success' ? 'border-success/30' : tone === 'error' ? 'border-danger/30' : 'border-brand/25')}>
        <div className="flex items-start gap-3 p-4 pr-11"><div className={cn('grid size-9 shrink-0 place-items-center rounded-sm', tone === 'success' ? 'bg-success-soft text-success' : tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-brand')}><Icon className="size-[18px]" /></div><div className="min-w-0"><p className="text-sm font-extrabold">{item.title}</p>{item.description && <p className="mt-1 text-xs leading-5 text-muted">{item.description}</p>}</div></div>
        <button aria-label="Đóng thông báo" onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))} className="absolute right-3 top-3 grid size-7 place-items-center text-muted hover:bg-canvas hover:text-ink"><X className="size-3.5" /></button>
        <span className={cn('absolute inset-x-0 bottom-0 h-0.5 animate-[toast-progress_4.2s_linear_forwards]', tone === 'success' ? 'bg-success' : tone === 'error' ? 'bg-danger' : 'bg-brand')} />
      </div>;
    })}
  </div>;
}
