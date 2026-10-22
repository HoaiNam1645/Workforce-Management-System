'use client';

import {
  AlertCircle,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  History,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  createSalaryRate,
  getEmployee,
  getEmployeeAccess,
  getEmployeeWorkHistory,
  getSalaryRates,
  updateEmployeeAccess,
  type EmployeeAccess,
  type EmployeeListItem,
} from '@/lib/employees-api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';

type ProfileTab = 'profile' | 'salary' | 'history' | 'access';

const tabs: Array<{ id: ProfileTab; label: string; icon: typeof UserRound }> = [
  { id: 'profile', label: 'Hồ sơ', icon: UserRound },
  { id: 'salary', label: 'Mức lương', icon: BadgeDollarSign },
  { id: 'history', label: 'Lịch sử làm việc', icon: History },
  { id: 'access', label: 'Quyền truy cập', icon: KeyRound },
];

const fieldClassName = 'h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10';

function formatDate(date: string | null) {
  if (!date) return 'Hiện tại';
  const [year, month, day] = date.split('-');
  return day && month && year ? `${day}/${month}/${year}` : date;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value);
}

function avatarColor(id: string) {
  const colors = ['#dceaff', '#dff3ed', '#fff0cc', '#e8e5ff', '#ffe5df', '#d9eef7'];
  const score = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return colors[score % colors.length];
}

export function EmployeeProfilePanel({
  employee,
  onClose,
}: Readonly<{
  employee: EmployeeListItem;
  onClose: () => void;
}>) {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('profile');
  const visibleTabs = tabs.filter((item) => item.id === 'profile'
    || (item.id === 'salary' && hasPermission('employees.salary.view'))
    || (item.id === 'history' && hasPermission('employees.history.view'))
    || (item.id === 'access' && hasPermission('employees.access.manage')));

  return (
    <div className="fixed inset-0 z-[80] bg-ink/35 backdrop-blur-[2px]">
      <button aria-label="Đóng hồ sơ" className="absolute inset-0" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:max-w-[760px]">
        <header className="flex items-start justify-between border-b border-line px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="grid size-12 shrink-0 place-items-center rounded-full text-sm font-black text-ink"
              style={{ backgroundColor: avatarColor(employee.id) }}
            >
              {employee.initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-black tracking-[-0.03em]">{employee.fullName}</h2>
                <Badge variant={employee.employmentStatus === 'active' ? 'success' : employee.employmentStatus === 'on_leave' ? 'warning' : 'neutral'}>
                  {employee.employmentStatus === 'active' ? 'Đang làm' : employee.employmentStatus === 'on_leave' ? 'Tạm nghỉ' : 'Nghỉ việc'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{employee.employeeCode} · {employee.position.name} · {employee.department.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"><X className="size-4" /></button>
        </header>

        <nav className="flex overflow-x-auto border-b border-line px-4 sm:px-7">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'relative flex shrink-0 items-center gap-2 px-3 py-4 text-xs font-extrabold text-muted transition hover:text-ink',
                  tab === item.id && 'text-brand',
                )}
              >
                <Icon className="size-4" /> {item.label}
                {tab === item.id && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-brand" />}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/30 p-5 sm:p-7">
          {tab === 'profile' && <ProfileTabContent employeeId={employee.id} />}
          {tab === 'salary' && <SalaryTab employeeId={employee.id} canManage={hasPermission('employees.salary.manage')} />}
          {tab === 'history' && <WorkHistoryTab employeeId={employee.id} />}
          {tab === 'access' && <AccessTab employeeId={employee.id} />}
        </div>
      </aside>
    </div>
  );
}

function ProfileTabContent({ employeeId }: Readonly<{ employeeId: string }>) {
  const query = useQuery({ queryKey: ['employee-detail', employeeId], queryFn: () => getEmployee(employeeId) });
  if (query.isLoading) return <LoadingState label="Đang tải hồ sơ..." />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message ?? 'Không tải được hồ sơ'} />;
  const employee = query.data;

  return (
    <div className="space-y-5">
      <Section title="Thông tin công việc" description="Vị trí và đơn vị công tác hiện tại.">
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          <InfoCell icon={BriefcaseBusiness} label="Chức vụ" value={employee.position.name} />
          <InfoCell icon={Building2} label="Phòng ban" value={employee.department.name} />
          <InfoCell icon={MapPin} label="Chi nhánh" value={employee.branch.name} />
          <InfoCell icon={UserRound} label="Quản lý trực tiếp" value={employee.manager?.name ?? 'Chưa chỉ định'} />
          <InfoCell icon={CalendarDays} label="Ngày bắt đầu" value={formatDate(employee.hireDate)} />
          <InfoCell icon={Clock3} label="Loại nhân viên" value={employee.employmentType === 'full_time' ? 'Full-time' : 'Part-time'} />
        </div>
      </Section>

      <Section title="Thông tin liên hệ" description="Thông tin dùng cho trao đổi công việc.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Detail label="Email công việc" value={employee.workEmail} />
          <Detail label="Email cá nhân" value={employee.personalEmail} />
          <Detail label="Số điện thoại" value={employee.phone} />
          <Detail label="Địa chỉ" value={employee.address} />
        </div>
      </Section>

      <Section title="Liên hệ khẩn cấp">
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="Họ tên" value={employee.emergencyContact.name} />
          <Detail label="Điện thoại" value={employee.emergencyContact.phone} />
          <Detail label="Mối quan hệ" value={employee.emergencyContact.relationship} />
        </div>
      </Section>
    </div>
  );
}

function SalaryTab({ employeeId, canManage }: Readonly<{ employeeId: string; canManage: boolean }>) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [payType, setPayType] = useState<'hourly' | 'monthly'>('monthly');
  const [baseRate, setBaseRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const query = useQuery({ queryKey: ['employee-salary-rates', employeeId], queryFn: () => getSalaryRates(employeeId) });
  const mutation = useMutation({
    meta: { successMessage: 'Đã cập nhật mức lương' },
    mutationFn: () => createSalaryRate(employeeId, {
      payType,
      baseRate: Number(baseRate),
      currencyCode: 'VND',
      effectiveFrom,
      note: note || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employee-salary-rates', employeeId] });
      setBaseRate('');
      setNote('');
      setIsAdding(false);
    },
  });

  if (query.isLoading) return <LoadingState label="Đang tải mức lương..." />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message ?? 'Không tải được mức lương'} />;

  return (
    <div className="space-y-5">
      <section className="border border-line bg-surface p-5 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted">Mức lương hiện tại</p>
            {query.data.current ? (
              <>
                <p className="mt-3 text-3xl font-black tracking-[-0.04em] text-ink">{formatMoney(query.data.current.baseRate, query.data.current.currencyCode)}</p>
                <p className="mt-1 text-xs text-muted">{query.data.current.payType === 'hourly' ? 'Theo giờ' : 'Theo tháng'} · Áp dụng từ {formatDate(query.data.current.effectiveFrom)}</p>
              </>
            ) : (
              <p className="mt-3 text-sm font-semibold text-muted">Chưa cấu hình mức lương</p>
            )}
          </div>
          {canManage && <Button variant="brand" size="sm" onClick={() => setIsAdding((value) => !value)}>
            <BadgeDollarSign className="size-4" /> {query.data.current ? 'Cập nhật' : 'Thiết lập'}
          </Button>}
        </div>
      </section>

      {isAdding && (
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="border border-brand/25 bg-info-soft/40 p-5">
          <div className="mb-4"><h3 className="font-extrabold">Thiết lập mức lương mới</h3><p className="mt-1 text-xs text-muted">Mức hiện tại sẽ tự kết thúc trước ngày áp dụng mới.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Hình thức trả lương">
              <select value={payType} onChange={(event) => setPayType(event.target.value as 'hourly' | 'monthly')} className={fieldClassName}>
                <option value="monthly">Lương theo tháng</option>
                <option value="hourly">Lương theo giờ</option>
              </select>
            </FormField>
            <FormField label="Mức lương (VND)">
              <input required min="0" step="1" type="number" value={baseRate} onChange={(event) => setBaseRate(event.target.value)} className={fieldClassName} placeholder="VD: 12000000" />
            </FormField>
            <FormField label="Ngày áp dụng">
              <input required type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={fieldClassName} />
            </FormField>
            <FormField label="Ghi chú">
              <input value={note} onChange={(event) => setNote(event.target.value)} className={fieldClassName} placeholder="Lý do điều chỉnh..." />
            </FormField>
          </div>
          {mutation.isError && <InlineError message={mutation.error.message} />}
          <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsAdding(false)}>Hủy</Button><Button type="submit" variant="brand" disabled={mutation.isPending || !baseRate}>{mutation.isPending && <LoaderCircle className="size-4 animate-spin" />} Lưu mức lương</Button></div>
        </form>
      )}

      <Section title="Lịch sử mức lương" description="Toàn bộ thay đổi theo thời gian.">
        {query.data.history.length ? (
          <div className="divide-y divide-line border border-line">
            {query.data.history.map((rate) => (
              <div key={rate.id} className="flex flex-col gap-2 bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-extrabold">{formatMoney(rate.baseRate, rate.currencyCode)} <span className="text-xs font-semibold text-muted">/ {rate.payType === 'hourly' ? 'giờ' : 'tháng'}</span></p><p className="mt-1 text-xs text-muted">{rate.note || 'Không có ghi chú'}</p></div>
                <div className="text-left sm:text-right"><p className="text-xs font-bold">{formatDate(rate.effectiveFrom)} — {formatDate(rate.effectiveTo)}</p>{!rate.effectiveTo && <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wider text-success">Đang áp dụng</p>}</div>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={BadgeDollarSign} title="Chưa có lịch sử lương" description="Thiết lập mức lương đầu tiên cho nhân viên này." />}
      </Section>
    </div>
  );
}

function WorkHistoryTab({ employeeId }: Readonly<{ employeeId: string }>) {
  const query = useQuery({ queryKey: ['employee-work-history', employeeId], queryFn: () => getEmployeeWorkHistory(employeeId) });
  if (query.isLoading) return <LoadingState label="Đang tải lịch sử làm việc..." />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  if (!query.data?.length) return <EmptyState icon={History} title="Chưa có lịch sử" description="Các thay đổi vị trí và đơn vị công tác sẽ xuất hiện tại đây." />;

  return (
    <Section title="Dòng thời gian công tác" description="Lịch sử vị trí, phòng ban, chi nhánh và loại nhân viên.">
      <div className="relative ml-2 border-l border-line pl-6">
        {query.data.map((item, index) => (
          <article key={item.id} className={cn('relative pb-7', index === query.data.length - 1 && 'pb-0')}>
            <span className={cn('absolute -left-[31px] top-1 size-3 rounded-full border-2 border-surface', item.effectiveTo ? 'bg-muted' : 'bg-brand ring-4 ring-info-soft')} />
            <div className="border border-line bg-surface p-4 shadow-panel">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="font-extrabold">{item.position.name}</p><p className="mt-1 text-xs text-muted">{item.department.name} · {item.branch.name}</p></div>
                <Badge variant={item.effectiveTo ? 'neutral' : 'success'}>{item.effectiveTo ? 'Đã kết thúc' : 'Hiện tại'}</Badge>
              </div>
              <div className="mt-4 grid gap-3 border-t border-line pt-3 text-xs sm:grid-cols-2">
                <p><span className="text-muted">Thời gian:</span> <span className="font-bold">{formatDate(item.effectiveFrom)} — {formatDate(item.effectiveTo)}</span></p>
                <p><span className="text-muted">Quản lý:</span> <span className="font-bold">{item.manager?.name ?? 'Chưa chỉ định'}</span></p>
                <p><span className="text-muted">Loại:</span> <span className="font-bold">{item.employmentType === 'full_time' ? 'Full-time' : 'Part-time'}</span></p>
                <p><span className="text-muted">Lý do:</span> <span className="font-bold">{item.reason ?? 'Cập nhật công việc'}</span></p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function AccessTab({ employeeId }: Readonly<{ employeeId: string }>) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['employee-access', employeeId], queryFn: () => getEmployeeAccess(employeeId) });
  if (query.isLoading) return <LoadingState label="Đang tải quyền truy cập..." />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message ?? 'Không tải được quyền truy cập'} />;
  return <AccessForm key={`${employeeId}-${query.data.status}-${query.data.roles.map((role) => role.id).join('-')}`} employeeId={employeeId} access={query.data} onSaved={() => queryClient.invalidateQueries({ queryKey: ['employee-access', employeeId] })} />;
}

function AccessForm({ employeeId, access, onSaved }: Readonly<{ employeeId: string; access: EmployeeAccess; onSaved: () => Promise<unknown> }>) {
  const [enabled, setEnabled] = useState(access.enabled);
  const [email, setEmail] = useState(access.email ?? '');
  const [status, setStatus] = useState<'invited' | 'active' | 'locked'>(access.status && access.status !== 'disabled' ? access.status : 'active');
  const [roleIds, setRoleIds] = useState(access.roles.map((role) => role.id));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const isNewAccount = access.status === null;
  const passwordValid = !password || (password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password));
  const passwordMatches = password === confirmPassword;
  const mutation = useMutation({
    meta: { successMessage: 'Đã lưu quyền truy cập' },
    mutationFn: () => updateEmployeeAccess(employeeId, { enabled, email, status, roleIds, password: password || undefined }),
    onSuccess: async () => { await onSaved(); },
  });

  function toggleRole(roleId: string) {
    setRoleIds((current) => current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]);
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="space-y-5">
      <section className="border border-line bg-surface p-5 shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3"><div className={cn('grid size-10 shrink-0 place-items-center rounded-md', enabled ? 'bg-success-soft text-success' : 'bg-canvas text-muted')}>{enabled ? <ShieldCheck className="size-5" /> : <LockKeyhole className="size-5" />}</div><div><h3 className="font-extrabold">Tài khoản hệ thống</h3><p className="mt-1 text-xs text-muted">Cho phép nhân viên đăng nhập và sử dụng chức năng theo vai trò.</p></div></div>
          <button type="button" onClick={() => setEnabled((value) => !value)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition', enabled ? 'bg-brand' : 'bg-line')}><span className={cn('absolute top-1 size-4 rounded-full bg-white shadow transition', enabled ? 'left-6' : 'left-1')} /></button>
        </div>
      </section>

      {enabled && (
        <>
          <Section title="Thông tin đăng nhập">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email đăng nhập"><div className="relative"><Mail className="absolute left-3 top-3 size-4 text-muted" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={cn(fieldClassName, 'pl-9')} /></div></FormField>
              <FormField label="Trạng thái tài khoản"><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={fieldClassName}><option value="invited">Đã mời</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></FormField>
              <FormField label={isNewAccount ? 'Mật khẩu ban đầu' : 'Mật khẩu mới (không bắt buộc)'}><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClassName} placeholder="Tối thiểu 8 ký tự" />{!passwordValid && <span className="mt-1 block text-[11px] font-bold text-danger">Cần chữ hoa, chữ thường và chữ số.</span>}</FormField>
              <FormField label="Xác nhận mật khẩu"><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={fieldClassName} />{!passwordMatches && <span className="mt-1 block text-[11px] font-bold text-danger">Mật khẩu xác nhận không khớp.</span>}</FormField>
            </div>
          </Section>

          <Section title="Vai trò truy cập" description="Một nhân viên có thể được gán nhiều vai trò.">
            <div className="divide-y divide-line border border-line bg-surface">
              {access.availableRoles.map((role) => {
                const selected = roleIds.includes(role.id);
                return <label key={role.id} className="flex cursor-pointer items-start gap-3 px-4 py-3.5 hover:bg-canvas/60"><input type="checkbox" checked={selected} onChange={() => toggleRole(role.id)} className="sr-only" /><span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center border', selected ? 'border-brand bg-brand text-white' : 'border-line bg-surface')}>{selected && <Check className="size-3.5" />}</span><span><span className="block text-sm font-extrabold">{role.name}</span><span className="mt-1 block text-xs text-muted">{role.description ?? role.code}</span></span></label>;
              })}
            </div>
          </Section>
        </>
      )}

      {mutation.isError && <InlineError message={mutation.error.message} />}
      <div className="sticky bottom-0 flex justify-end border-t border-line bg-canvas/95 py-4 backdrop-blur"><Button type="submit" variant="brand" disabled={mutation.isPending || (enabled && (!email || roleIds.length === 0 || (isNewAccount && !password) || !passwordValid || !passwordMatches))}>{mutation.isPending && <LoaderCircle className="size-4 animate-spin" />} Lưu quyền truy cập</Button></div>
    </form>
  );
}

function Section({ title, description, children }: Readonly<{ title: string; description?: string; children: React.ReactNode }>) {
  return <section><div className="mb-3"><h3 className="text-sm font-extrabold">{title}</h3>{description && <p className="mt-1 text-xs text-muted">{description}</p>}</div>{children}</section>;
}

function InfoCell({ icon: Icon, label, value }: Readonly<{ icon: typeof UserRound; label: string; value: string }>) {
  return <div className="flex items-start gap-3 bg-surface p-4"><Icon className="mt-0.5 size-4 shrink-0 text-brand" /><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div></div>;
}

function Detail({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return <div className="border-b border-line pb-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{label}</p><p className="mt-1.5 text-sm font-semibold">{value || 'Chưa cập nhật'}</p></div>;
}

function FormField({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <label className="block"><span className="mb-2 block text-xs font-extrabold">{label}</span>{children}</label>;
}

function LoadingState({ label }: Readonly<{ label: string }>) {
  return <div className="grid min-h-52 place-items-center"><p className="flex items-center gap-2 text-sm font-semibold text-muted"><LoaderCircle className="size-4 animate-spin" /> {label}</p></div>;
}

function ErrorState({ message }: Readonly<{ message: string }>) {
  return <div className="flex items-start gap-3 border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div><p className="font-extrabold">Không tải được dữ liệu</p><p className="mt-1 text-xs">{message}</p></div></div>;
}

function InlineError({ message }: Readonly<{ message: string }>) {
  return <div className="mt-4 flex items-center gap-2 border border-danger/20 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger"><AlertCircle className="size-4 shrink-0" /> {message}</div>;
}

function EmptyState({ icon: Icon, title, description }: Readonly<{ icon: typeof History; title: string; description: string }>) {
  return <div className="grid min-h-52 place-items-center border border-dashed border-line bg-surface px-5 text-center"><div><div className="mx-auto grid size-11 place-items-center rounded-full bg-info-soft text-brand"><Icon className="size-5" /></div><p className="mt-3 font-extrabold">{title}</p><p className="mt-1 text-xs text-muted">{description}</p></div></div>;
}
