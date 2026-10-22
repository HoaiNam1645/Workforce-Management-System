'use client';

import { CalendarCheck2, WalletCards } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LeaveBalanceDashboard } from './leave-balance-dashboard';
import { LeaveTypeDashboard } from './leave-type-dashboard';
import { cn } from '@/lib/utils';

export function LeaveManagementDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const section = searchParams.get('section') === 'balances' ? 'balances' : 'types';
  const setSection = (value: 'types' | 'balances') => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'types') params.delete('section'); else params.set('section', value);
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };
  return <div className="space-y-5">
    <nav className="flex gap-1 overflow-x-auto border-b border-line">
      <button onClick={() => setSection('types')} className={cn('flex h-11 items-center gap-2 border-b-2 px-4 text-xs font-extrabold', section === 'types' ? 'border-brand text-brand' : 'border-transparent text-muted')}><CalendarCheck2 className="size-4" />Loại nghỉ & hạn mức</button>
      <button onClick={() => setSection('balances')} className={cn('flex h-11 items-center gap-2 border-b-2 px-4 text-xs font-extrabold', section === 'balances' ? 'border-brand text-brand' : 'border-transparent text-muted')}><WalletCards className="size-4" />Số dư nhân viên</button>
    </nav>
    {section === 'types' ? <LeaveTypeDashboard /> : <LeaveBalanceDashboard />}
  </div>;
}
