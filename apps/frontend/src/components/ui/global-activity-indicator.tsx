'use client';

import { LoaderCircle } from 'lucide-react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

export function GlobalActivityIndicator() {
  const mutations = useIsMutating();
  const queries = useIsFetching();
  if (!mutations && !queries) return null;
  return <>
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[250] h-0.5 overflow-hidden bg-brand/15"><span className="block h-full w-1/3 animate-[global-loading_1s_ease-in-out_infinite] bg-brand" /></div>
    {mutations > 0 && <div role="status" className="pointer-events-none fixed bottom-5 right-5 z-[190] flex items-center gap-2 border border-brand/20 bg-surface px-3 py-2 text-xs font-bold text-brand shadow-lg"><LoaderCircle className="size-3.5 animate-spin" /> Đang xử lý dữ liệu...</div>}
  </>;
}
