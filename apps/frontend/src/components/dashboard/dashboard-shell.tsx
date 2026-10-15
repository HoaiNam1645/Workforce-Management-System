'use client';

import {
  Bell,
  Blocks,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';
import { getNotifications, markNotificationRead } from '@/lib/notifications-api';

type NavigationItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  href?: string;
  permission?: string;
};

const adminNavigation: NavigationItem[] = [
  { label: 'Tổng quan', icon: LayoutDashboard, href: '/admin' },
  { label: 'Lịch của tôi', icon: CalendarDays, href: '/my-schedule', permission: 'schedules.self.view' },
  { label: 'Nhân viên', icon: UsersRound, href: '/admin/employees', permission: 'employees.view' },
  { label: 'Lịch & phân ca', icon: CalendarDays, href: '/admin/schedule', permission: 'schedules.view' },
  { label: 'Chấm công của tôi', icon: Fingerprint, href: '/attendance', permission: 'attendance.clock' },
  { label: 'Theo dõi ca', icon: Radio, href: '/admin/attendance/live', permission: 'attendance.view' },
  { label: 'Duyệt chấm công', icon: ClipboardCheck, href: '/admin/attendance', permission: 'attendance.adjust' },
  { label: 'Bảng công', icon: Clock3 },
  { label: 'Nghỉ phép', icon: ClipboardCheck, count: 7 },
  { label: 'Payroll', icon: WalletCards },
  { label: 'Báo cáo', icon: FileBarChart },
];

const superAdminNavigation: NavigationItem[] = [
  { label: 'Tổng quan hệ thống', icon: CircleGauge, href: '/super-admin' },
  { label: 'Tài khoản & quyền', icon: ShieldCheck, href: '/super-admin/access', permission: 'access.view' },
  { label: 'Chi nhánh', icon: Building2 },
  { label: 'Cấu hình', icon: Settings2 },
  { label: 'Tích hợp', icon: Blocks },
  { label: 'Audit log', icon: FileBarChart, count: 12 },
];

export function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout, hasPermission, hasRole } = useAuth();
  const isSuperAdmin = pathname.startsWith('/super-admin');
  const isEmployeesPage = pathname === '/admin/employees';
  const isSchedulePage = pathname === '/admin/schedule';
  const isMySchedulePage = pathname === '/my-schedule';
  const isAttendancePage = pathname === '/attendance' || pathname.startsWith('/admin/attendance');
  const navigation = useMemo(
    () => (isSuperAdmin ? superAdminNavigation : adminNavigation).filter((item) => !item.permission || hasPermission(item.permission)),
    [hasPermission, isSuperAdmin],
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, enabled: Boolean(user), refetchInterval: 60_000 });
  const readNotification = useMutation({ meta: { successMessage: false, errorMessage: false }, mutationFn: markNotificationRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const [activeItem, setActiveItem] = useState(navigation[0].label);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
      return;
    }
    if (!isLoading && user && isSuperAdmin && !hasRole('SUPER_ADMIN') && !hasPermission('access.view')) {
      router.replace('/admin');
      return;
    }
    if (navigation.length === 0) return;
    const matchedItem = navigation.find((item) => item.href === pathname);
    setActiveItem(matchedItem?.label ?? navigation[0].label);
    setIsMobileOpen(false);
  }, [hasPermission, hasRole, isLoading, isSuperAdmin, navigation, pathname, router, user]);

  const today = useMemo(
    () => format(new Date(), "EEEE, 'ngày' d 'tháng' M", { locale: vi }),
    [],
  );

  if (isLoading || !user) {
    return <div className="grid min-h-screen place-items-center bg-canvas"><div className="size-8 animate-spin rounded-full border-2 border-line border-t-brand" /></div>;
  }

  const canOpenSystem = hasRole('SUPER_ADMIN') || hasPermission('access.view');
  const initials = user.displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('');

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink">
      {isMobileOpen && (
        <button
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/8 bg-sidebar text-white transition-[width,transform] duration-300',
          isCollapsed ? 'w-[76px]' : 'w-[252px]',
          isMobileOpen
            ? 'visible translate-x-0'
            : 'invisible -translate-x-full lg:visible lg:translate-x-0',
        )}
      >
        <div className="flex h-[72px] items-center gap-3 border-b border-white/8 px-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-white shadow-[0_8px_24px_rgba(59,130,246,0.34)]">
            <Sparkles className="size-[18px]" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-[-0.02em]">Workzen</p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Workforce OS
              </p>
            </div>
          )}
          <button
            className="ml-auto grid size-8 place-items-center rounded-md text-white/50 hover:bg-white/8 hover:text-white lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-3 pt-4">
          <Link
            href={isSuperAdmin ? '/admin' : canOpenSystem ? '/super-admin' : '/admin'}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-md border border-white/8 bg-white/[0.055] px-3 text-left transition hover:bg-white/10',
              isCollapsed && 'justify-center px-2',
            )}
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-white/10">
              {isSuperAdmin ? <ShieldCheck className="size-4" /> : <Building2 className="size-4" />}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">
                  {isSuperAdmin ? 'Super Admin' : 'Lemiex'}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-white/45">
                  {isSuperAdmin ? 'Quản trị hệ thống' : user.roles.map((role) => role.code).join(', ')}
                </p>
              </div>
            )}
            {!isCollapsed && <ChevronDown className="size-3.5 text-white/40" />}
          </Link>
        </div>

        <nav className="mt-5 flex-1 overflow-y-auto px-3">
          {!isCollapsed && (
            <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/30">
              Không gian làm việc
            </p>
          )}
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeItem === item.label;
              const content = (
                <>
                  <Icon className={cn('size-[17px] shrink-0', active && 'text-brand-light')} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                  {!isCollapsed && item.count && (
                    <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-white">
                      {item.count}
                    </span>
                  )}
                </>
              );
              const className = cn(
                'group flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-white/55 transition hover:bg-white/[0.065] hover:text-white',
                active && 'bg-white/12 text-white shadow-[inset_3px_0_0_#93c5fd]',
                isCollapsed && 'justify-center px-2',
              );

              return item.href ? (
                <Link key={item.label} href={item.href} title={isCollapsed ? item.label : undefined} className={className}>
                  {content}
                </Link>
              ) : (
                <button
                  key={item.label}
                  title={isCollapsed ? item.label : undefined}
                  onClick={() => setActiveItem(item.label)}
                  className={className}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/8 p-3">
          <button
            className={cn(
              'mb-2 hidden h-9 w-full items-center gap-3 rounded-md px-3 text-xs font-semibold text-white/45 hover:bg-white/8 hover:text-white lg:flex',
              isCollapsed && 'justify-center px-2',
            )}
            onClick={() => setIsCollapsed((value) => !value)}
          >
            {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!isCollapsed && 'Thu gọn menu'}
          </button>

          <div className={cn('flex items-center gap-3 rounded-md px-2 py-2', isCollapsed && 'justify-center')}>
            <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-[#dbeafe] text-xs font-extrabold text-[#214f86]">
              {initials || 'U'}
              <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-sidebar bg-success" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{user.displayName}</p>
                <p className="mt-0.5 truncate text-[10px] text-white/40">
                  {user.email}
                </p>
              </div>
            )}
            {!isCollapsed && <button aria-label="Đăng xuất" onClick={logout} className="grid size-8 place-items-center rounded-md text-white/35 hover:bg-white/8 hover:text-white"><LogOut className="size-3.5" /></button>}
          </div>
        </div>
      </aside>

      <div
        className={cn(
          'min-w-0 transition-[padding] duration-300',
          isCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[252px]',
        )}
      >
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-line/80 bg-canvas/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            className="mr-3 grid size-10 place-items-center rounded-md border border-line bg-surface text-ink lg:hidden"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden md:block">
            <p className="text-sm font-extrabold tracking-[-0.02em]">
              {isSuperAdmin ? 'Trung tâm điều hành' : activeItem}
            </p>
            <p className="mt-0.5 text-xs capitalize text-muted">{today}</p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button className="hidden h-10 w-[260px] items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted shadow-[0_1px_0_rgba(35,80,130,0.04)] transition hover:border-brand/30 lg:flex">
              <Search className="size-4" />
              <span>Tìm nhân viên, ca làm...</span>
              <kbd className="ml-auto rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd>
            </button>
            <button onClick={() => setNotificationsOpen((value) => !value)} className="relative grid size-10 place-items-center rounded-md border border-line bg-surface text-muted transition hover:text-ink">
              <Bell className="size-[18px]" />
              {Boolean(notifications.data?.unread) && <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-surface bg-brand" />}
            </button>
            {notificationsOpen && <div className="absolute right-4 top-16 z-50 w-[360px] border border-line bg-surface shadow-2xl sm:right-6 lg:right-8"><div className="flex items-center justify-between border-b border-line p-4"><b className="text-sm">Thông báo</b><span className="text-xs text-muted">{notifications.data?.unread ?? 0} chưa đọc</span></div><div className="max-h-[420px] overflow-y-auto">{notifications.data?.items.length ? notifications.data.items.map((item) => <button key={item.id} onClick={() => { if (!item.readAt) readNotification.mutate(item.id); if (item.actionUrl) router.push(item.actionUrl); setNotificationsOpen(false); }} className={cn('block w-full border-b border-line p-4 text-left hover:bg-canvas', !item.readAt && 'bg-info-soft/60')}><p className="text-xs font-extrabold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted">{item.message}</p><p className="mt-2 text-[10px] text-muted">{format(new Date(item.createdAt), 'dd/MM/yyyy HH:mm')}</p></button>) : <p className="p-8 text-center text-sm text-muted">Chưa có thông báo.</p>}</div></div>}
            {!isEmployeesPage && !isMySchedulePage && !isAttendancePage && (
              <Button variant="brand" className="hidden sm:inline-flex">
                {isSuperAdmin ? 'Tạo tài khoản' : isSchedulePage ? 'Tạo ca mới' : 'Tạo lịch mới'}
              </Button>
            )}
          </div>
        </header>

        <main className="min-h-[calc(100vh-72px)] min-w-0 max-w-full overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
