'use client';

import { AlertCircle, Check, CheckCheck, ChevronDown, LoaderCircle, LockKeyhole, RotateCcw, Save, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPermissionMatrix, updateRolePermissions, type PermissionItem, type RoleMatrixItem } from '@/lib/access-control-api';
import { cn } from '@/lib/utils';

const moduleLabels: Record<string, string> = {
  access_control: 'Tài khoản & phân quyền',
  employees: 'Nhân viên',
  employee_salary: 'Mức lương nhân viên',
  employee_history: 'Lịch sử làm việc',
  employee_access: 'Truy cập nhân viên',
  schedules: 'Lịch & phân ca',
  attendance: 'Chấm công',
  attendance_anomalies: 'Bất thường chấm công',
  timesheets: 'Bảng công',
  leave: 'Nghỉ phép',
  shift_swaps: 'Đổi ca',
  payroll: 'Payroll',
  reports: 'Báo cáo',
  organization: 'Tổ chức & chi nhánh',
  personal_schedule: 'Lịch cá nhân',
  settings: 'Cấu hình',
  audit: 'Audit log',
};

const actionLabels: Record<string, string> = {
  view: 'Xem',
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  manage: 'Quản lý',
  publish: 'Công bố',
  clock: 'Chấm công',
  adjust: 'Điều chỉnh',
  approve: 'Phê duyệt',
  lock: 'Khóa',
  request: 'Gửi yêu cầu',
  configure: 'Cấu hình',
  export: 'Xuất dữ liệu',
  self_view: 'Xem dữ liệu cá nhân',
  details_view: 'Xem chi tiết cách tính',
  location_view: 'Xem bằng chứng vị trí',
  exclude: 'Loại / khôi phục ngoại lệ',
  config_manage: 'Quản lý ngưỡng phát hiện',
};

export function PermissionMatrix() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set(['access_control']));
  const query = useQuery({ queryKey: ['permission-matrix'], queryFn: getPermissionMatrix });

  useEffect(() => {
    if (query.data) {
      setDrafts(Object.fromEntries(query.data.roles.map((role) => [role.id, role.permissionIds])));
      setSelectedRoleId((current) => current || query.data.roles.find((role) => !role.locked)?.id || query.data.roles[0]?.id || '');
    }
  }, [query.data]);

  const mutation = useMutation({
    meta: { successMessage: 'Đã cập nhật quyền của vai trò' },
    mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => updateRolePermissions(roleId, permissionIds),
    onSuccess: (matrix) => {
      queryClient.setQueryData(['permission-matrix'], matrix);
      setDrafts(Object.fromEntries(matrix.roles.map((role) => [role.id, role.permissionIds])));
    },
  });

  const groups = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const filtered = (query.data?.permissions ?? []).filter((permission) => !normalized
      || permission.code.toLowerCase().includes(normalized)
      || permission.description?.toLowerCase().includes(normalized)
      || (moduleLabels[permission.module] ?? permission.module).toLowerCase().includes(normalized));
    return Object.entries(Object.groupBy(filtered, (permission) => permission.module))
      .map(([module, permissions]) => ({ module, permissions: permissions ?? [] }))
      .filter((group) => group.permissions.length);
  }, [query.data?.permissions, search]);

  if (query.isLoading) return <div className="grid min-h-[420px] place-items-center"><p className="flex items-center gap-2 text-sm font-semibold text-muted"><LoaderCircle className="size-4 animate-spin" /> Đang tải ma trận quyền...</p></div>;
  if (query.isError || !query.data) return <div className="flex items-start gap-3 border border-danger/20 bg-danger-soft p-4 text-sm text-danger"><AlertCircle className="mt-0.5 size-4" /><div><p className="font-extrabold">Không tải được phân quyền</p><p className="mt-1 text-xs">{query.error?.message}</p></div></div>;

  const editableRoles = query.data.roles.filter((role) => !role.locked);
  const dirtyCount = editableRoles.filter((role) => isDirty(role, drafts[role.id] ?? [])).length;
  const selectedRole = query.data.roles.find((role) => role.id === selectedRoleId) ?? query.data.roles[0];
  const effectiveOpenModules = search.trim() ? new Set(groups.map((group) => group.module)) : openModules;

  function toggleOpenModule(module: string) {
    setOpenModules((current) => {
      const next = new Set(current);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  function togglePermission(role: RoleMatrixItem, permissionId: string) {
    if (role.locked) return;
    setDrafts((current) => {
      const selected = current[role.id] ?? [];
      return { ...current, [role.id]: selected.includes(permissionId) ? selected.filter((id) => id !== permissionId) : [...selected, permissionId] };
    });
  }

  function toggleModule(role: RoleMatrixItem, permissions: PermissionItem[]) {
    if (role.locked) return;
    setDrafts((current) => {
      const selected = current[role.id] ?? [];
      const ids = permissions.map((permission) => permission.id);
      const hasAll = ids.every((id) => selected.includes(id));
      return { ...current, [role.id]: hasAll ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])] };
    });
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1720px] space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Identity & access</p><h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">Vai trò và phân quyền</h1><p className="mt-2 max-w-2xl text-sm text-muted">Cấu hình chức năng mỗi vai trò được phép sử dụng. Thay đổi có hiệu lực ngay ở API và giao diện.</p></div>
        <div className="flex items-center gap-2"><Badge variant={dirtyCount ? 'warning' : 'success'}>{dirtyCount ? `${dirtyCount} vai trò chưa lưu` : 'Đã đồng bộ'}</Badge></div>
      </section>

      <section className="grid grid-cols-3 overflow-hidden border border-line bg-surface shadow-panel">
        <Metric icon={ShieldCheck} label="Vai trò hệ thống" value={query.data.roles.length} detail="Super Admin được khóa bảo vệ" />
        <Metric icon={CheckCheck} label="Quyền chức năng" value={query.data.permissions.length} detail={`${groups.length} nhóm chức năng`} bordered />
        <Metric icon={UsersRound} label="Tài khoản đã gán" value={query.data.roles.reduce((sum, role) => sum + role.memberCount, 0)} detail="Tính theo vai trò, có thể trùng" bordered />
      </section>

      <section className="overflow-hidden border border-line bg-surface shadow-panel">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div><h2 className="font-extrabold">Ma trận quyền</h2><p className="mt-1 text-xs text-muted">Tích checkbox rồi lưu ở cột vai trò tương ứng.</p></div>
          <label className="flex h-10 w-full items-center gap-2 border border-line bg-surface px-3 sm:w-[320px]"><Search className="size-4 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm quyền hoặc chức năng..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        </div>

        <div className="lg:hidden">
          <div className="border-b border-line bg-canvas/35 p-4">
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-muted">Vai trò đang chỉnh</label>
            <select aria-label="Vai trò đang chỉnh" value={selectedRole?.id ?? ''} onChange={(event) => setSelectedRoleId(event.target.value)} className="mt-2 h-11 w-full border border-line bg-surface px-3 text-sm font-bold outline-none focus:border-brand">
              {query.data.roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {role.memberCount} tài khoản</option>)}
            </select>
            {selectedRole && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span>{selectedRole.locked ? 'Vai trò hệ thống, luôn có toàn quyền' : `${(drafts[selectedRole.id] ?? []).length}/${query.data.permissions.length} quyền đã chọn`}</span>{!selectedRole.locked && isDirty(selectedRole, drafts[selectedRole.id] ?? []) && <span className="font-bold text-warning">Chưa lưu</span>}</div>}
          </div>
          <div className="divide-y divide-line">
            {groups.map((group) => {
              const expanded = effectiveOpenModules.has(group.module);
              const selected = selectedRole ? drafts[selectedRole.id] ?? [] : [];
              const selectedCount = group.permissions.filter((permission) => selected.includes(permission.id)).length;
              return <section key={group.module}>
                <button className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={() => toggleOpenModule(group.module)}>
                  <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{moduleLabels[group.module] ?? group.module}</p><p className="mt-1 text-[11px] text-muted">{selectedCount}/{group.permissions.length} quyền đang bật</p></div>
                  <ChevronDown className={cn('size-4 text-muted transition', expanded && 'rotate-180')} />
                </button>
                {expanded && selectedRole && <div className="border-t border-line bg-canvas/25 px-4 py-2">
                  {!selectedRole.locked && <button onClick={() => toggleModule(selectedRole, group.permissions)} className="mb-2 text-xs font-bold text-brand">{selectedCount === group.permissions.length ? 'Bỏ chọn cả nhóm' : 'Chọn cả nhóm'}</button>}
                  <div className="divide-y divide-line border border-line bg-surface">{group.permissions.map((permission) => {
                    const checked = selectedRole.locked || selected.includes(permission.id);
                    return <label key={permission.id} className={cn('flex items-start gap-3 p-3', selectedRole.locked ? 'cursor-default' : 'cursor-pointer')}><input type="checkbox" checked={checked} disabled={selectedRole.locked} onChange={() => togglePermission(selectedRole, permission.id)} className="mt-0.5 size-4 accent-blue-600" /><span className="min-w-0"><span className="block text-sm font-bold">{actionLabels[permission.action] ?? permission.action}</span><span className="mt-1 block text-[11px] leading-4 text-muted">{permission.description ?? permission.code}</span></span></label>;
                  })}</div>
                </div>}
              </section>;
            })}
          </div>
          {selectedRole && !selectedRole.locked && <div className="sticky bottom-0 z-20 flex gap-2 border-t border-line bg-surface/95 p-4 backdrop-blur"><Button variant="outline" className="flex-1" disabled={!isDirty(selectedRole, drafts[selectedRole.id] ?? []) || mutation.isPending} onClick={() => setDrafts((current) => ({ ...current, [selectedRole.id]: selectedRole.permissionIds }))}><RotateCcw className="size-4" />Hoàn tác</Button><Button variant="brand" className="flex-1" loading={mutation.isPending && mutation.variables?.roleId === selectedRole.id} disabled={!isDirty(selectedRole, drafts[selectedRole.id] ?? [])} onClick={() => mutation.mutate({ roleId: selectedRole.id, permissionIds: drafts[selectedRole.id] ?? [] })}><Save className="size-4" />Lưu quyền</Button></div>}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1080px] border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-canvas">
              <tr className="border-b border-line">
                <th className="sticky left-0 z-30 min-w-[330px] border-r border-line bg-canvas px-5 py-4 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted">Chức năng / quyền</th>
                {query.data.roles.map((role) => {
                  const dirty = isDirty(role, drafts[role.id] ?? []);
                  const saving = mutation.isPending && mutation.variables?.roleId === role.id;
                  return <th key={role.id} className="min-w-[155px] border-r border-line px-3 py-3 text-center align-top last:border-r-0"><div className="flex min-h-[74px] flex-col items-center"><div className="flex items-center gap-1.5"><span className="text-xs font-extrabold text-ink">{role.name}</span>{role.locked && <LockKeyhole className="size-3 text-brand" />}</div><span className="mt-1 font-mono text-[9px] text-muted">{role.code} · {role.memberCount} TK</span>{role.locked ? <span className="mt-2 text-[9px] font-bold uppercase tracking-wider text-brand">Toàn quyền</span> : <div className="mt-2 flex gap-1"><button disabled={!dirty || saving} onClick={() => mutation.mutate({ roleId: role.id, permissionIds: drafts[role.id] ?? [] })} className="inline-flex h-7 items-center gap-1 border border-brand bg-brand px-2 text-[10px] font-extrabold text-white disabled:border-line disabled:bg-line disabled:text-muted">{saving ? <LoaderCircle className="size-3 animate-spin" /> : <Save className="size-3" />} Lưu</button><button disabled={!dirty || saving} onClick={() => setDrafts((current) => ({ ...current, [role.id]: role.permissionIds }))} className="grid size-7 place-items-center border border-line text-muted disabled:opacity-40"><RotateCcw className="size-3" /></button></div>}</div></th>;
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <ModuleRows key={group.module} module={group.module} permissions={group.permissions} roles={query.data.roles} drafts={drafts} expanded={effectiveOpenModules.has(group.module)} toggleExpanded={() => toggleOpenModule(group.module)} togglePermission={togglePermission} toggleModule={toggleModule} />
              ))}
            </tbody>
          </table>
        </div>

        {mutation.isError && <div className="flex items-center gap-2 border-t border-danger/20 bg-danger-soft px-5 py-3 text-xs font-semibold text-danger"><AlertCircle className="size-4" /> {mutation.error.message}</div>}
        <div className="border-t border-line bg-canvas/50 px-5 py-3 text-[11px] text-muted">Super Admin luôn có toàn bộ quyền và không thể chỉnh sửa. Quyền mới được thêm sau này cần được gán rõ ràng cho các vai trò khác.</div>
      </section>
    </div>
  );
}

function ModuleRows({ module, permissions, roles, drafts, expanded, toggleExpanded, togglePermission, toggleModule }: Readonly<{ module: string; permissions: PermissionItem[]; roles: RoleMatrixItem[]; drafts: Record<string, string[]>; expanded: boolean; toggleExpanded: () => void; togglePermission: (role: RoleMatrixItem, permissionId: string) => void; toggleModule: (role: RoleMatrixItem, permissions: PermissionItem[]) => void }>) {
  return <>
    <tr className="border-b border-line bg-[#f4f8fd]"><td className="sticky left-0 z-10 border-r border-line bg-[#f4f8fd] px-5 py-2.5"><button onClick={toggleExpanded} className="flex w-full items-center justify-between gap-3 text-left"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-brand">{moduleLabels[module] ?? module} · {permissions.length}</span><ChevronDown className={cn('size-3.5 text-muted transition', expanded && 'rotate-180')} /></button></td>{roles.map((role) => { const selected = drafts[role.id] ?? []; const all = permissions.every((permission) => selected.includes(permission.id)); const some = !all && permissions.some((permission) => selected.includes(permission.id)); return <td key={role.id} className="border-r border-line px-3 py-2 text-center last:border-r-0"><button aria-label={`${role.name}: chọn nhóm ${moduleLabels[module] ?? module}`} disabled={role.locked} onClick={() => toggleModule(role, permissions)} className={cn('mx-auto grid size-5 place-items-center border transition', all ? 'border-brand bg-brand text-white' : some ? 'border-brand bg-info-soft text-brand' : 'border-line bg-white', role.locked && 'cursor-not-allowed opacity-70')}>{all && <Check className="size-3.5" />}{some && <span className="h-0.5 w-2.5 bg-brand" />}</button></td>; })}</tr>
    {expanded && permissions.map((permission) => <tr key={permission.id} className="border-b border-line/80 hover:bg-canvas/35"><td className="sticky left-0 z-10 border-r border-line bg-surface px-5 py-3.5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-ink">{actionLabels[permission.action] ?? permission.action}</p><p className="mt-1 text-[11px] text-muted">{permission.description ?? permission.code}</p></div><code className="shrink-0 bg-canvas px-1.5 py-1 text-[9px] text-muted">{permission.code}</code></div></td>{roles.map((role) => { const selected = role.locked || (drafts[role.id] ?? []).includes(permission.id); return <td key={role.id} className="border-r border-line px-3 py-3 text-center last:border-r-0"><button aria-label={`${role.name}: ${permission.code}`} disabled={role.locked} onClick={() => togglePermission(role, permission.id)} className={cn('mx-auto grid size-6 place-items-center border transition', selected ? 'border-brand bg-brand text-white shadow-[0_2px_8px_rgba(37,99,235,0.2)]' : 'border-line bg-white hover:border-brand/50', role.locked && 'cursor-not-allowed opacity-70')}>{selected && <Check className="size-4" />}</button></td>; })}</tr>)}
  </>;
}

function Metric({ icon: Icon, label, value, detail, bordered }: Readonly<{ icon: typeof ShieldCheck; label: string; value: number; detail: string; bordered?: boolean }>) {
  return <div className={cn('flex min-w-0 flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-5', bordered && 'border-l border-line')}><div className="grid size-8 place-items-center rounded-md bg-info-soft text-brand sm:size-10"><Icon className="size-4 sm:size-[18px]" /></div><div className="min-w-0"><p className="font-mono text-lg font-semibold sm:text-xl">{value}</p><p className="mt-1 text-[10px] font-extrabold sm:text-xs">{label}</p><p className="mt-1 hidden text-[10px] text-muted sm:block">{detail}</p></div></div>;
}

function isDirty(role: RoleMatrixItem, draft: string[]) {
  return [...role.permissionIds].sort().join(',') !== [...draft].sort().join(',');
}
