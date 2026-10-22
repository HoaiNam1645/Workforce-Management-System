"use client";

import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Eye,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserRoundMinus,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createEmployee,
  deleteEmployee,
  getEmployeeOptions,
  getEmployeeSummary,
  getEmployees,
  updateEmployee,
  type EmployeeListItem,
  type EmployeeOptions,
  type EmployeePayload,
  type EmploymentStatus,
} from "@/lib/employees-api";
import { cn } from "@/lib/utils";
import { generateBusinessCode } from "@/lib/business-code";
import { EmployeeProfilePanel } from "./employee-profile-panel";
import { useAuth } from "@/components/auth/auth-provider";

type StatusFilter = "all" | EmploymentStatus;

const statusLabels: Record<EmploymentStatus, string> = {
  active: "Đang làm",
  on_leave: "Tạm nghỉ",
  terminated: "Nghỉ việc",
};

const employeeSchema = z
  .object({
    employeeCode: z.string().trim().min(1, "Nhập mã nhân viên").max(30),
    firstName: z.string().trim().min(1, "Nhập tên").max(80),
    lastName: z.string().trim().min(1, "Nhập họ").max(80),
    workEmail: z.string().email("Email không hợp lệ").or(z.literal("")),
    phone: z.string().max(30),
    employmentType: z.enum(["full_time", "part_time"]),
    employmentStatus: z.enum(["active", "on_leave", "terminated"]),
    hireDate: z.string().min(1, "Chọn ngày bắt đầu"),
    terminationDate: z.string(),
    terminationReason: z.string(),
    primaryBranchId: z.string().min(1, "Chọn chi nhánh"),
    departmentId: z.string().min(1, "Chọn phòng ban"),
    positionId: z.string().min(1, "Chọn chức vụ"),
    createAccount: z.boolean(),
    loginEmail: z
      .string()
      .email("Email đăng nhập không hợp lệ")
      .or(z.literal("")),
    password: z.string(),
    confirmPassword: z.string(),
    roleIds: z.array(z.string()),
  })
  .superRefine((values, context) => {
    if (values.employmentStatus === "terminated" && !values.terminationDate) {
      context.addIssue({
        code: "custom",
        path: ["terminationDate"],
        message: "Chọn ngày nghỉ việc",
      });
    }
    if (values.createAccount) {
      if (!values.loginEmail)
        context.addIssue({
          code: "custom",
          path: ["loginEmail"],
          message: "Nhập email đăng nhập",
        });
      if (
        values.password.length < 8 ||
        !/[a-z]/.test(values.password) ||
        !/[A-Z]/.test(values.password) ||
        !/\d/.test(values.password)
      )
        context.addIssue({
          code: "custom",
          path: ["password"],
          message: "Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số",
        });
      if (values.password !== values.confirmPassword)
        context.addIssue({
          code: "custom",
          path: ["confirmPassword"],
          message: "Mật khẩu xác nhận không khớp",
        });
      if (!values.roleIds.length)
        context.addIssue({
          code: "custom",
          path: ["roleIds"],
          message: "Chọn ít nhất một vai trò",
        });
    }
  });

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const emptyForm: EmployeeFormValues = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  workEmail: "",
  phone: "",
  employmentType: "full_time",
  employmentStatus: "active",
  hireDate: "",
  terminationDate: "",
  terminationReason: "",
  primaryBranchId: "",
  departmentId: "",
  positionId: "",
  createAccount: false,
  loginEmail: "",
  password: "",
  confirmPassword: "",
  roleIds: [],
};

const fieldClassName =
  "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10";

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}/${month}/${year}` : date;
}

function avatarColor(id: string) {
  const colors = [
    "#dceaff",
    "#dff3ed",
    "#fff0cc",
    "#e8e5ff",
    "#ffe5df",
    "#d9eef7",
  ];
  const score = [...id].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return colors[score % colors.length];
}

function EmployeeAvatar({
  employee,
}: Readonly<{ employee: EmployeeListItem }>) {
  return (
    <div
      className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold text-ink"
      style={{ backgroundColor: avatarColor(employee.id) }}
    >
      {employee.initials || employee.fullName.slice(0, 2).toUpperCase()}
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: EmploymentStatus }>) {
  const variant =
    status === "active"
      ? "success"
      : status === "on_leave"
        ? "warning"
        : "neutral";
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

function EmployeeFormModal({
  employee,
  options,
  onClose,
}: Readonly<{
  employee: EmployeeListItem | null;
  options: EmployeeOptions;
  onClose: () => void;
}>) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: emptyForm,
  });

  useEffect(() => {
    reset(
      employee
        ? {
            employeeCode: employee.employeeCode,
            firstName: employee.firstName,
            lastName: employee.lastName,
            workEmail: employee.workEmail ?? "",
            phone: employee.phone ?? "",
            employmentType: employee.employmentType,
            employmentStatus: employee.employmentStatus,
            hireDate: employee.hireDate,
            terminationDate: employee.terminationDate ?? "",
            terminationReason: "",
            primaryBranchId: employee.branch.id,
            departmentId: employee.department.id,
            positionId: employee.position.id,
            createAccount: false,
            loginEmail: "",
            password: "",
            confirmPassword: "",
            roleIds: [],
          }
        : {
            ...emptyForm,
            employeeCode: generateBusinessCode("NV"),
            roleIds: options.roles.find((role) => role.code === "EMPLOYEE")
              ? [options.roles.find((role) => role.code === "EMPLOYEE")!.id]
              : [],
          },
    );
  }, [employee, options.roles, reset]);

  const saveMutation = useMutation({
    meta: {
      successMessage: employee
        ? "Đã cập nhật hồ sơ nhân viên"
        : "Đã tạo nhân viên mới",
    },
    mutationFn: (values: EmployeeFormValues) => {
      const {
        createAccount,
        loginEmail,
        password,
        confirmPassword,
        roleIds,
        ...employeeValues
      } = values;
      void confirmPassword;
      const payload: EmployeePayload = {
        ...employeeValues,
        workEmail: values.workEmail || null,
        phone: values.phone || null,
        terminationDate:
          values.employmentStatus === "terminated"
            ? values.terminationDate || null
            : null,
        terminationReason:
          values.employmentStatus === "terminated"
            ? values.terminationReason || null
            : null,
        createAccount: !employee && createAccount,
        loginEmail: !employee && createAccount ? loginEmail : undefined,
        password: !employee && createAccount ? password : undefined,
        roleIds: !employee && createAccount ? roleIds : undefined,
      };
      return employee
        ? updateEmployee(employee.id, payload)
        : createEmployee(payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["employee-summary"] }),
      ]);
      onClose();
    },
  });

  const status = watch("employmentStatus");
  const createAccount = watch("createAccount");

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/35 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <button
        aria-label="Đóng biểu mẫu"
        className="absolute inset-0"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
        className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-w-[720px] sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold">
              {employee ? "Cập nhật nhân viên" : "Thêm nhân viên"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Thông tin hồ sơ và vị trí công việc hiện tại.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md text-muted hover:bg-canvas"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <input type="hidden" {...register("employeeCode")} />
          <FormField
            label="Mã nhân viên tự động"
            error={errors.employeeCode?.message}
          >
            <div className="flex h-10 items-center border border-line bg-canvas px-3 font-mono text-sm font-bold text-brand">
              {watch("employeeCode")}
            </div>
          </FormField>
          <FormField label="Ngày bắt đầu" error={errors.hireDate?.message}>
            <input
              {...register("hireDate")}
              type="date"
              className={fieldClassName}
            />
          </FormField>
          <FormField label="Họ" error={errors.lastName?.message}>
            <input
              {...register("lastName")}
              className={fieldClassName}
              placeholder="Nguyễn"
            />
          </FormField>
          <FormField label="Tên" error={errors.firstName?.message}>
            <input
              {...register("firstName")}
              className={fieldClassName}
              placeholder="Minh Anh"
            />
          </FormField>
          <FormField label="Email công việc" error={errors.workEmail?.message}>
            <input
              {...register("workEmail")}
              type="email"
              className={fieldClassName}
              placeholder="nhanvien@congty.vn"
            />
          </FormField>
          <FormField label="Số điện thoại" error={errors.phone?.message}>
            <input
              {...register("phone")}
              className={fieldClassName}
              placeholder="090..."
            />
          </FormField>
          <FormField label="Chi nhánh" error={errors.primaryBranchId?.message}>
            <select {...register("primaryBranchId")} className={fieldClassName}>
              <option value="">Chọn chi nhánh</option>
              {options.branches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Phòng ban" error={errors.departmentId?.message}>
            <select {...register("departmentId")} className={fieldClassName}>
              <option value="">Chọn phòng ban</option>
              {options.departments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Chức vụ" error={errors.positionId?.message}>
            <select {...register("positionId")} className={fieldClassName}>
              <option value="">Chọn chức vụ</option>
              {options.positions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Loại nhân viên"
            error={errors.employmentType?.message}
          >
            <select {...register("employmentType")} className={fieldClassName}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
            </select>
          </FormField>
          <FormField
            label="Trạng thái"
            error={errors.employmentStatus?.message}
          >
            <select
              {...register("employmentStatus")}
              className={fieldClassName}
            >
              <option value="active">Đang làm</option>
              <option value="on_leave">Tạm nghỉ</option>
              <option value="terminated">Nghỉ việc</option>
            </select>
          </FormField>
          {status === "terminated" && (
            <>
              <FormField
                label="Ngày nghỉ việc"
                error={errors.terminationDate?.message}
              >
                <input
                  {...register("terminationDate")}
                  type="date"
                  className={fieldClassName}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField
                  label="Lý do nghỉ việc"
                  error={errors.terminationReason?.message}
                >
                  <textarea
                    {...register("terminationReason")}
                    className="min-h-20 w-full rounded-md border border-line bg-surface p-3 text-sm outline-none focus:border-brand"
                  />
                </FormField>
              </div>
            </>
          )}
          {!employee && options.roles.length > 0 && (
            <div className="sm:col-span-2 border-t border-line pt-5">
              <label className="flex cursor-pointer items-start gap-3 border border-brand/20 bg-info-soft p-4">
                <input
                  {...register("createAccount")}
                  type="checkbox"
                  className="mt-1 size-4"
                />
                <span>
                  <span className="block text-sm font-extrabold">
                    Tạo tài khoản đăng nhập ngay
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Nhân viên có thể đăng nhập ngay sau khi hồ sơ được tạo.
                  </span>
                </span>
              </label>
            </div>
          )}
          {!employee && createAccount && (
            <div className="sm:col-span-2 grid gap-5 border border-line bg-canvas/35 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-extrabold uppercase tracking-wider text-brand">
                  Thông tin tài khoản
                </p>
              </div>
              <FormField
                label="Email đăng nhập"
                error={errors.loginEmail?.message}
              >
                <input
                  {...register("loginEmail")}
                  type="email"
                  className={fieldClassName}
                  placeholder="nhanvien@congty.vn"
                />
              </FormField>
              <div />
              <FormField
                label="Mật khẩu ban đầu"
                error={errors.password?.message}
              >
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  className={fieldClassName}
                  placeholder="Tối thiểu 8 ký tự"
                />
              </FormField>
              <FormField
                label="Xác nhận mật khẩu"
                error={errors.confirmPassword?.message}
              >
                <input
                  {...register("confirmPassword")}
                  type="password"
                  autoComplete="new-password"
                  className={fieldClassName}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField
                  label="Vai trò truy cập"
                  error={errors.roleIds?.message}
                >
                  <div className="grid border border-line bg-surface sm:grid-cols-2">
                    {options.roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex cursor-pointer items-start gap-3 border-b border-r border-line p-3 last:border-b-0"
                      >
                        <input
                          {...register("roleIds")}
                          type="checkbox"
                          value={role.id}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-extrabold">
                            {role.name}
                          </span>
                          <span className="mt-1 block text-[11px] text-muted">
                            {role.description ?? role.code}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </FormField>
              </div>
              <div className="sm:col-span-2 border border-warning/25 bg-warning/10 p-3 text-xs text-muted">
                Mật khẩu chỉ hiển thị trong lúc nhập. Hãy bàn giao bằng kênh an
                toàn và yêu cầu nhân viên đổi mật khẩu sau lần đăng nhập đầu
                tiên.
              </div>
            </div>
          )}
        </div>

        {saveMutation.isError && (
          <div className="mx-5 mb-4 flex items-start gap-2 border border-danger/20 bg-danger-soft px-3 py-2.5 text-xs font-semibold text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />{" "}
            {saveMutation.error.message}
          </div>
        )}

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="brand"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <LoaderCircle className="size-4 animate-spin" />
            )}
            {employee ? "Lưu thay đổi" : "Tạo nhân viên"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: Readonly<{ label: string; error?: string; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-extrabold">{label}</span>
      {children}
      {error && (
        <span className="mt-1.5 block text-[11px] font-semibold text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

export function EmployeeDirectory() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canCreateEmployee = hasPermission("employees.create");
  const canUpdateEmployee = hasPermission("employees.update");
  const canDeleteEmployee = hasPermission("employees.delete");
  const [query, setQuery] = useState(() => searchParams.get("search") ?? "");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>(() => {
    const value = searchParams.get("status");
    return value === "active" || value === "on_leave" || value === "terminated" ? value : "all";
  });
  const [branchId, setBranchId] = useState(() => searchParams.get("branchId") ?? "");
  const [departmentId, setDepartmentId] = useState(() => searchParams.get("departmentId") ?? "");
  const [page, setPage] = useState(() => Math.max(Number(searchParams.get("page")) || 1, 1));
  const filtersInitialized = useRef(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] =
    useState<EmployeeListItem | null>(null);
  const [profileEmployee, setProfileEmployee] =
    useState<EmployeeListItem | null>(null);
  const [deletingEmployee, setDeletingEmployee] =
    useState<EmployeeListItem | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["employee-options"],
    queryFn: getEmployeeOptions,
  });
  const summaryQuery = useQuery({
    queryKey: ["employee-summary"],
    queryFn: getEmployeeSummary,
  });
  const employeesQuery = useQuery({
    queryKey: [
      "employees",
      deferredQuery,
      status,
      branchId,
      departmentId,
      page,
    ],
    queryFn: () =>
      getEmployees({
        search: deferredQuery || undefined,
        status: status === "all" ? undefined : status,
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
        page,
        limit: 20,
      }),
  });

  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      return;
    }
    setPage(1);
  }, [deferredQuery, status, branchId, departmentId]);
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const values: Record<string, string> = {
      search: deferredQuery.trim(),
      status: status === "all" ? "" : status,
      branchId,
      departmentId,
      page: page > 1 ? String(page) : "",
    };
    Object.entries(values).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    const queryString = params.toString();
    if (queryString !== searchParams.toString()) router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [branchId, deferredQuery, departmentId, page, pathname, router, searchParams, status]);

  const deleteMutation = useMutation({
    meta: { successMessage: "Đã xóa hồ sơ nhân viên" },
    mutationFn: deleteEmployee,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["employee-summary"] }),
      ]);
      setDeletingEmployee(null);
    },
  });

  function openCreateForm() {
    setEditingEmployee(null);
    setIsFormOpen(true);
  }

  function openEditForm(employee: EmployeeListItem) {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  }

  function requestDelete(employee: EmployeeListItem) {
    setDeletingEmployee(employee);
  }

  const columns = useMemo(() => {
    const columnHelper = createColumnHelper<EmployeeListItem>();
    return [
      columnHelper.accessor("fullName", {
        header: "Nhân viên",
        cell: ({ row }) => (
          <div className="flex min-w-[235px] items-center gap-3">
            <EmployeeAvatar employee={row.original} />
            <div className="min-w-0">
              <p className="font-extrabold text-ink">{row.original.fullName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                <Mail className="size-3" />{" "}
                {row.original.email ?? "Chưa có email"}
              </p>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("position.name", {
        header: "Vị trí",
        cell: ({ row }) => (
          <div className="min-w-[145px]">
            <p className="font-bold text-ink">{row.original.position.name}</p>
            <p className="mt-1 text-[11px] text-muted">
              {row.original.department.name}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor("branch.name", {
        header: "Địa điểm",
        cell: (info) => (
          <span className="flex min-w-[145px] items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-3.5" /> {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("employmentType", {
        header: "Loại",
        cell: (info) => (
          <span className="text-sm font-semibold text-ink">
            {info.getValue() === "full_time" ? "Full-time" : "Part-time"}
          </span>
        ),
      }),
      columnHelper.accessor("employmentStatus", {
        header: "Trạng thái",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("hireDate", {
        header: "Ngày bắt đầu",
        cell: (info) => (
          <span className="whitespace-nowrap text-sm text-muted">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              aria-label="Xem hồ sơ nhân viên"
              onClick={() => setProfileEmployee(row.original)}
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-info-soft hover:text-brand"
            >
              <Eye className="size-3.5" />
            </button>
            {canUpdateEmployee && (
              <button
                aria-label="Sửa nhân viên"
                onClick={() => openEditForm(row.original)}
                className="grid size-8 place-items-center rounded-md text-muted hover:bg-info-soft hover:text-brand"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {canDeleteEmployee && (
              <button
                aria-label="Xóa nhân viên"
                onClick={() => requestDelete(row.original)}
                className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ),
      }),
    ];
  }, [canDeleteEmployee, canUpdateEmployee]);

  const employees = employeesQuery.data?.items ?? [];
  const pagination = employeesQuery.data?.pagination;
  const table = useReactTable({
    data: employees,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const summary = summaryQuery.data ?? {
    total: 0,
    active: 0,
    onLeave: 0,
    terminated: 0,
    fullTime: 0,
    partTime: 0,
  };
  const options = optionsQuery.data;
  const organizationReady = Boolean(
    options?.organization &&
      options.branches.length &&
      options.departments.length &&
      options.positions.length,
  );
  const missingOrganizationData = options
    ? [
        !options.organization ? "doanh nghiệp" : null,
        !options.branches.length ? "chi nhánh" : null,
        !options.departments.length ? "phòng ban" : null,
        !options.positions.length ? "vị trí công việc" : null,
      ].filter((value): value is string => Boolean(value))
    : [];
  const organizationSetupHref =
    !options?.organization || !options?.branches.length
      ? "/admin/organization"
      : !options.departments.length
        ? "/admin/organization?view=departments"
        : "/admin/organization?view=positions";
  const canCreate = canCreateEmployee && organizationReady;

  const statusOptions: Array<{
    label: string;
    value: StatusFilter;
    count: number;
  }> = [
    { label: "Tất cả", value: "all", count: summary.total },
    { label: "Đang làm", value: "active", count: summary.active },
    { label: "Tạm nghỉ", value: "on_leave", count: summary.onLeave },
    { label: "Nghỉ việc", value: "terminated", count: summary.terminated },
  ];

  const metrics = [
    {
      label: "Tổng nhân viên",
      value: summary.total,
      detail: `${summary.fullTime} full-time`,
      icon: UsersRound,
      tone: "bg-info-soft text-info",
    },
    {
      label: "Đang làm việc",
      value: summary.active,
      detail: summary.total
        ? `${Math.round((summary.active / summary.total) * 100)}% nhân sự`
        : "Chưa có dữ liệu",
      icon: UserCheck,
      tone: "bg-success-soft text-success",
    },
    {
      label: "Tạm nghỉ",
      value: summary.onLeave,
      detail: "Đang tạm vắng",
      icon: UserRoundMinus,
      tone: "bg-warning-soft text-warning-strong",
    },
    {
      label: "Nghỉ việc",
      value: summary.terminated,
      detail: "Hồ sơ đã kết thúc",
      icon: UserRoundX,
      tone: "bg-danger-soft text-danger",
    },
  ];

  const loadError =
    employeesQuery.error ?? summaryQuery.error ?? optionsQuery.error;

  return (
    <div className="mx-auto min-w-0 max-w-[1560px] space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">
            Quản lý đội ngũ
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Nhân viên
          </h1>
          <p className="mt-2 text-sm text-muted">
            Quản lý hồ sơ, vị trí, trạng thái và phân bổ nhân sự.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="brand"
            onClick={openCreateForm}
            disabled={!canCreate}
          >
            <UserPlus className="size-4" /> Thêm nhân viên
          </Button>
        </div>
      </section>

      {loadError && (
        <div className="flex items-start gap-3 border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-extrabold">Không tải được dữ liệu nhân viên</p>
            <p className="mt-1 text-xs">
              {loadError.message}. Kiểm tra backend tại
              `http://localhost:4000/api`.
            </p>
          </div>
        </div>
      )}

      {!optionsQuery.isLoading && options && !organizationReady && (
        <div className="flex flex-col gap-3 border border-info/20 bg-info-soft px-4 py-3 text-sm text-info sm:flex-row sm:items-center">
          <Building2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">
              Còn thiếu: {missingOrganizationData.join(", ")}
            </p>
            <p className="mt-1 text-xs">
              {missingOrganizationData.length === 1 &&
              missingOrganizationData[0] === "vị trí công việc"
                ? `Đã có ${options.branches.length} chi nhánh và ${options.departments.length} phòng ban, nhưng cần ít nhất một vị trí công việc đang hoạt động để tạo hồ sơ nhân viên.`
                : "Hãy hoàn tất các dữ liệu nền còn thiếu trước khi tạo hồ sơ nhân viên."}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={organizationSetupHref}>Cấu hình ngay</Link>
          </Button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-panel xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="flex min-w-0 items-center gap-3 bg-surface p-4 sm:gap-4 sm:p-5"
            >
              <div
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-md",
                  metric.tone,
                )}
              >
                <Icon className="size-[18px]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-lg font-semibold tracking-[-0.04em] sm:text-xl">
                  {summaryQuery.isLoading ? "—" : metric.value}
                </p>
                <p className="mt-1 truncate text-[11px] font-extrabold sm:text-xs">{metric.label}</p>
                <p className="mt-1 truncate text-[9px] text-muted sm:text-[10px]">{metric.detail}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
        <div className="border-b border-line px-4 pt-4 sm:px-5">
          <div className="flex gap-5 overflow-x-auto">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatus(option.value)}
                className={cn(
                  "relative shrink-0 pb-3 text-sm font-bold text-muted transition hover:text-ink",
                  status === option.value && "text-ink",
                )}
              >
                {option.label}{" "}
                <span className="ml-1 font-mono text-[11px] text-muted">
                  {option.count}
                </span>
                {status === option.value && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line bg-canvas/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 sm:max-w-[380px]">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên, mã, vị trí, phòng ban..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/75"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto">
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-10 shrink-0 rounded-md border border-line bg-surface px-3 text-sm font-semibold outline-none"
            >
              <option value="">Tất cả phòng ban</option>
              {options?.departments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-10 shrink-0 rounded-md border border-line bg-surface px-3 text-sm font-semibold outline-none"
            >
              <option value="">Tất cả chi nhánh</option>
              {options?.branches.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {employeesQuery.isLoading ? (
          <div className="grid min-h-64 place-items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted">
              <LoaderCircle className="size-4 animate-spin" /> Đang tải nhân
              viên...
            </div>
          </div>
        ) : employees.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-line bg-canvas/55"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="whitespace-nowrap px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-line/80 transition last:border-0 hover:bg-canvas/45"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3.5 text-sm">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-line md:hidden">
              {employees.map((employee) => (
                <article key={employee.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <EmployeeAvatar employee={employee} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold">{employee.fullName}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted">
                            {employee.employeeCode}
                          </p>
                        </div>
                        <StatusBadge status={employee.employmentStatus} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted">
                        <p className="flex items-center gap-2">
                          <BriefcaseBusiness className="size-3.5" />{" "}
                          {employee.position.name} · {employee.department.name}
                        </p>
                        <p className="flex items-center gap-2">
                          <MapPin className="size-3.5" /> {employee.branch.name}
                        </p>
                        <p>Bắt đầu: {formatDate(employee.hireDate)}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProfileEmployee(employee)}
                        >
                          <Eye className="size-3.5" /> Hồ sơ
                        </Button>
                        {canUpdateEmployee && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditForm(employee)}
                          >
                            <Pencil className="size-3.5" /> Sửa
                          </Button>
                        )}
                        {canDeleteEmployee && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => requestDelete(employee)}
                          >
                            <Trash2 className="size-3.5" /> Xóa
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="grid min-h-72 place-items-center px-5 py-12 text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand">
                <UsersRound className="size-5" />
              </div>
              <p className="mt-4 font-extrabold">
                {summary.total === 0
                  ? "Chưa có nhân viên"
                  : "Không tìm thấy kết quả"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {summary.total === 0
                  ? "Cấu hình dữ liệu tổ chức và thêm nhân viên đầu tiên."
                  : "Thử thay đổi từ khóa hoặc bộ lọc."}
              </p>
              {canCreate && summary.total === 0 && (
                <Button
                  variant="brand"
                  className="mt-4"
                  onClick={openCreateForm}
                >
                  <UserPlus className="size-4" /> Thêm nhân viên
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-line bg-canvas/35 px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            Hiển thị {employees.length} trong {pagination?.total ?? 0} nhân viên
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Trước
            </Button>
            <span className="px-2 font-mono font-semibold">
              Trang {page} / {Math.max(pagination?.totalPages ?? 0, 1)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= (pagination?.totalPages ?? 0)}
              onClick={() => setPage((current) => current + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      </section>

      {isFormOpen && options && (
        <EmployeeFormModal
          employee={editingEmployee}
          options={options}
          onClose={() => setIsFormOpen(false)}
        />
      )}
      {profileEmployee && (
        <EmployeeProfilePanel
          employee={profileEmployee}
          onClose={() => setProfileEmployee(null)}
        />
      )}
      {deletingEmployee && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4">
          <button
            aria-label="Đóng"
            className="absolute inset-0"
            onClick={() => setDeletingEmployee(null)}
          />
          <div className="relative w-full max-w-md rounded-sm border border-line bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line p-4">
              <div>
                <h2 className="font-extrabold">Xóa hồ sơ nhân viên</h2>
                <p className="mt-1 text-xs text-muted">
                  Xác nhận thay đổi dữ liệu nhân sự
                </p>
              </div>
              <button
                onClick={() => setDeletingEmployee(null)}
                className="grid size-8 place-items-center"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="p-5">
              <div className="border border-danger/20 bg-danger-soft p-4">
                <p className="font-extrabold text-danger">
                  {deletingEmployee.fullName}
                </p>
                <p className="mt-1 font-mono text-xs text-muted">
                  {deletingEmployee.employeeCode}
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                Hồ sơ sẽ được xóa mềm và không còn xuất hiện trong danh sách
                hoạt động. Dữ liệu lịch sử vẫn được giữ lại để phục vụ đối soát.
              </p>
              {deleteMutation.isError && (
                <div className="mt-4 flex gap-2 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">
                  <AlertCircle className="size-4" />
                  {deleteMutation.error.message}
                </div>
              )}
            </div>
            <footer className="flex justify-end gap-2 border-t border-line p-4">
              <Button
                variant="outline"
                onClick={() => setDeletingEmployee(null)}
              >
                Hủy
              </Button>
              <Button
                className="bg-danger hover:bg-danger/90"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingEmployee.id)}
              >
                {deleteMutation.isPending && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}{" "}
                Xóa hồ sơ
              </Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
