'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpRight, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Approval = {
  employee: string;
  initials: string;
  color: string;
  request: string;
  detail: string;
  submitted: string;
  status: 'Chờ duyệt' | 'Cần bổ sung' | 'Ưu tiên';
};

const approvals: Approval[] = [
  {
    employee: 'Minh Anh',
    initials: 'MA',
    color: '#dceaff',
    request: 'Nghỉ phép',
    detail: '14–15/10 · 2 ngày',
    submitted: '12 phút trước',
    status: 'Chờ duyệt',
  },
  {
    employee: 'Quang Huy',
    initials: 'QH',
    color: '#dff3ed',
    request: 'Điều chỉnh giờ công',
    detail: '09/10 · Check-out',
    submitted: '34 phút trước',
    status: 'Cần bổ sung',
  },
  {
    employee: 'Hoàng Lan',
    initials: 'HL',
    color: '#fff0cc',
    request: 'Đổi ca',
    detail: 'Ca tối thứ Bảy',
    submitted: '1 giờ trước',
    status: 'Ưu tiên',
  },
  {
    employee: 'Tuấn Kiệt',
    initials: 'TK',
    color: '#e8e5ff',
    request: 'Nghỉ phép',
    detail: '18/10 · Nửa ngày',
    submitted: '2 giờ trước',
    status: 'Chờ duyệt',
  },
];

const columnHelper = createColumnHelper<Approval>();

const columns = [
  columnHelper.accessor('employee', {
    header: 'Nhân viên',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div
          className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-ink"
          style={{ backgroundColor: row.original.color }}
        >
          {row.original.initials}
        </div>
        <span className="font-bold text-ink">{row.original.employee}</span>
      </div>
    ),
  }),
  columnHelper.accessor('request', {
    header: 'Yêu cầu',
    cell: ({ row }) => (
      <div>
        <p className="font-bold text-ink">{row.original.request}</p>
        <p className="mt-1 text-xs text-muted">{row.original.detail}</p>
      </div>
    ),
  }),
  columnHelper.accessor('submitted', {
    header: 'Thời gian gửi',
    cell: (info) => <span className="text-sm text-muted">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: 'Trạng thái',
    cell: (info) => {
      const status = info.getValue();
      const variant = status === 'Ưu tiên' ? 'danger' : status === 'Cần bổ sung' ? 'warning' : 'info';
      return <Badge variant={variant}>{status}</Badge>;
    },
  }),
  columnHelper.display({
    id: 'actions',
    cell: () => (
      <button className="grid size-8 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink">
        <MoreHorizontal className="size-4" />
      </button>
    ),
  }),
];

export function ApprovalsTable() {
  const table = useReactTable({
    data: approvals,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-extrabold tracking-[-0.02em]">Yêu cầu chờ duyệt</h2>
          <p className="mt-1 text-xs text-muted">Được sắp xếp theo mức độ ưu tiên</p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-success hover:text-success/75">
          Xem tất cả <ArrowUpRight className="size-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-line bg-canvas/60">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted sm:px-6"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-line/80 last:border-0 hover:bg-canvas/55">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-3.5 text-sm sm:px-6">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
