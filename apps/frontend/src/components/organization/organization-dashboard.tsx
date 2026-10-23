"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  LoaderCircle,
  MapPin,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  assignBranchManager,
  changeBranchStatus,
  changeDepartmentStatus,
  changePositionStatus,
  endBranchManager,
  getBranch,
  getBranches,
  getDepartments,
  geocodeAddress,
  getPositions,
  grantBranchScope,
  revokeBranchScope,
  saveBranch,
  saveDepartment,
  saveOperatingHours,
  savePosition,
  setBranchDepartments,
  type Branch,
  type BranchDetail,
  type BranchPayload,
  type Department,
  type OperatingException,
  type OperatingHour,
  type Position,
} from "@/lib/organization-api";
import { cn } from "@/lib/utils";
import { generateBusinessCode } from "@/lib/business-code";

const GeofenceMap = dynamic(
  () => import("@/components/attendance/geofence-map"),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-80 place-items-center bg-canvas">
        <LoaderCircle className="size-5 animate-spin text-brand" />
      </div>
    ),
  },
);
type View = "branches" | "departments" | "positions";

export function OrganizationDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const view = (params.get("view") as View) || "branches";
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "all";
  const gps = params.get("gps") ?? "all";
  const [form, setForm] = useState<
    "new" | Branch | Department | Position | null
  >(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const updateQuery = useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(values).forEach(([key, value]) =>
        value && value !== "all" ? next.set(key, value) : next.delete(key),
      );
      router.replace(next.size ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );
  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Dữ liệu tổ chức
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Chi nhánh, phòng ban và vị trí
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Một nguồn dữ liệu thống nhất cho nhân viên, phân ca, chấm công GPS,
            bảng công, payroll và phạm vi quản lý.
          </p>
        </div>
        {((view === "branches" && hasPermission("branches.manage")) ||
          (view === "departments" && hasPermission("departments.manage")) ||
          (view === "positions" && hasPermission("positions.manage"))) && (
          <Button variant="brand" onClick={() => setForm("new")}>
            <Plus className="size-4" />
            {view === "branches"
              ? "Thêm chi nhánh"
              : view === "departments"
                ? "Thêm phòng ban"
                : "Thêm vị trí"}
          </Button>
        )}
      </header>
      <nav className="flex overflow-x-auto border-b border-line bg-surface px-2">
        {(
          [
            ["branches", "Chi nhánh & địa điểm", Building2],
            ["departments", "Cơ cấu phòng ban", Network],
            ["positions", "Vị trí công việc", UsersRound],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() =>
              updateQuery({
                view: key === "branches" ? null : key,
                search: null,
                status: null,
                gps: null,
              })
            }
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold",
              view === key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      {view === "branches" && (
        <Branches
          search={search}
          status={status}
          gps={gps}
          updateQuery={updateQuery}
          edit={setForm}
          open={setBranchId}
        />
      )}
      {view === "departments" && (
        <Departments
          search={search}
          status={status}
          updateQuery={updateQuery}
          edit={setForm}
        />
      )}
      {view === "positions" && (
        <Positions
          search={search}
          status={status}
          updateQuery={updateQuery}
          edit={setForm}
        />
      )}
      {form && view === "branches" && (
        <BranchForm
          item={form === "new" ? null : (form as Branch)}
          close={() => setForm(null)}
        />
      )}
      {form && view === "departments" && (
        <DepartmentForm
          item={form === "new" ? null : (form as Department)}
          close={() => setForm(null)}
        />
      )}
      {form && view === "positions" && (
        <PositionForm
          item={form === "new" ? null : (form as Position)}
          close={() => setForm(null)}
        />
      )}
      {branchId && (
        <BranchDrawer
          id={branchId}
          close={() => setBranchId(null)}
          edit={(item) => {
            setBranchId(null);
            setForm(item);
          }}
        />
      )}
    </div>
  );
}

function Branches({
  search,
  status,
  gps,
  updateQuery,
  edit,
  open,
}: {
  search: string;
  status: string;
  gps: string;
  updateQuery: (v: Record<string, string | null>) => void;
  edit: (v: Branch) => void;
  open: (id: string) => void;
}) {
  const { hasPermission } = useAuth();
  const query = useQuery({
    queryKey: ["organization-branches", search, status, gps],
    queryFn: () => getBranches({ search: search || undefined, status, gps }),
  });
  return (
    <>
      <Summary
        cards={[
          [
            "Tổng chi nhánh",
            query.data?.summary.total ?? 0,
            `${query.data?.summary.active ?? 0} đang hoạt động`,
            Building2,
          ],
          [
            "Nhân viên",
            query.data?.summary.employees ?? 0,
            "Theo chi nhánh chính",
            UsersRound,
          ],
          [
            "Đã bật geofence",
            query.data?.summary.geofence ?? 0,
            "Sẵn sàng kiểm tra GPS",
            MapPin,
          ],
          [
            "Cần hoàn thiện",
            query.data?.summary.missingConfiguration ?? 0,
            "Thiếu quản lý hoặc cấu hình",
            AlertTriangle,
          ],
        ]}
      />
      <Filters
        search={search}
        status={status}
        gps={gps}
        update={updateQuery}
        showGps
      />
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox message={query.error.message} retry={() => query.refetch()} />
      ) : query.data?.items.length ? (
        <section className="overflow-hidden border border-line bg-surface shadow-panel">
          <div className="hidden grid-cols-[1.35fr_1.2fr_120px_140px_150px_80px] gap-4 border-b border-line bg-canvas/60 px-5 py-3 text-[10px] font-extrabold uppercase text-muted xl:grid">
            <span>Chi nhánh</span>
            <span>Địa chỉ</span>
            <span>Nhân sự</span>
            <span>Geofence</span>
            <span>Trạng thái</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {query.data.items.map((branch) => (
              <article
                key={branch.id}
                className="grid gap-3 p-4 sm:p-5 xl:grid-cols-[1.35fr_1.2fr_120px_140px_150px_80px] xl:items-center"
              >
                <button
                  className="min-w-0 text-left"
                  onClick={() => open(branch.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-extrabold">
                      {branch.name}
                    </p>
                    {branch.isHeadOffice && (
                      <Badge variant="info">Trụ sở chính</Badge>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {branch.code} · {typeLabel(branch.branchType)} ·{" "}
                    {branch.timezone}
                  </p>
                </button>
                <Cell label="Địa chỉ">
                  <p className="line-clamp-2 text-xs font-bold">
                    {branch.addressLine}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    {branch.manager
                      ? `QL: ${branch.manager.fullName}`
                      : "Chưa có quản lý"}
                  </p>
                </Cell>
                <Cell label="Nhân sự">
                  <p className="font-mono text-sm font-black">
                    {branch.counts.employees}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    {branch.counts.departments} phòng ban
                  </p>
                </Cell>
                <Cell label="Geofence">
                  {branch.geofenceEnabled ? (
                    <>
                      <Badge variant="success">
                        {branch.geofenceRadiusM} m
                      </Badge>
                      <p className="mt-1 font-mono text-[9px] text-muted">
                        {branch.latitude}, {branch.longitude}
                      </p>
                    </>
                  ) : (
                    <Badge variant="warning">Chưa bật</Badge>
                  )}
                </Cell>
                <Cell label="Trạng thái">
                  <Badge
                    variant={
                      branch.isActive
                        ? branch.warnings.length
                          ? "warning"
                          : "success"
                        : "neutral"
                    }
                  >
                    {branch.isActive
                      ? branch.warnings.length
                        ? `${branch.warnings.length} cảnh báo`
                        : "Đang hoạt động"
                      : "Ngừng hoạt động"}
                  </Badge>
                </Cell>
                <div className="flex justify-end gap-1">
                  {hasPermission("branches.manage") && (
                    <button
                      onClick={() => edit(branch)}
                      className="grid size-8 place-items-center border border-line text-muted hover:text-brand"
                    >
                      <Settings2 className="size-4" />
                    </button>
                  )}
                  <button
                    onClick={() => open(branch.id)}
                    className="grid size-8 place-items-center text-muted"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <Empty icon={Building2} title="Chưa có chi nhánh phù hợp" />
      )}
    </>
  );
}

function Departments({
  search,
  status,
  updateQuery,
  edit,
}: {
  search: string;
  status: string;
  updateQuery: (v: Record<string, string | null>) => void;
  edit: (v: Department) => void;
}) {
  const { hasPermission } = useAuth();
  const query = useQuery({
    queryKey: ["organization-departments", search, status],
    queryFn: () => getDepartments({ search: search || undefined, status }),
  });
  const [tree, setTree] = useState(true);
  return (
    <>
      <Summary
        cards={[
          [
            "Tổng phòng ban",
            query.data?.summary.total ?? 0,
            `${query.data?.summary.active ?? 0} đang hoạt động`,
            Network,
          ],
          [
            "Đơn vị gốc",
            query.data?.summary.roots ?? 0,
            "Cấp cao nhất trong cơ cấu",
            GitBranch,
          ],
          [
            "Chưa có nhân viên",
            query.data?.summary.withoutEmployees ?? 0,
            "Cần rà soát phạm vi",
            AlertTriangle,
          ],
          [
            "Cơ cấu",
            tree ? "Dạng cây" : "Dạng bảng",
            "Có thể chuyển chế độ xem",
            ShieldCheck,
          ],
        ]}
      />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Filters
            search={search}
            status={status}
            gps="all"
            update={updateQuery}
          />
        </div>
        <Button variant="outline" onClick={() => setTree(!tree)}>
          {tree ? "Xem bảng" : "Xem cây"}
        </Button>
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.data?.items.length ? (
        tree ? (
          <section className="border border-line bg-surface p-4 sm:p-5">
            <DepartmentTree
              items={query.data.tree}
              edit={hasPermission("departments.manage") ? edit : undefined}
            />
          </section>
        ) : (
          <section className="divide-y divide-line border border-line bg-surface">
            {query.data.items.map((item) => (
              <DepartmentRow
                key={item.id}
                item={item}
                edit={hasPermission("departments.manage") ? edit : undefined}
              />
            ))}
          </section>
        )
      ) : (
        <Empty icon={Network} title="Chưa có phòng ban phù hợp" />
      )}
    </>
  );
}
function DepartmentTree({
  items,
  edit,
  depth = 0,
}: {
  items: Department[];
  edit?: (v: Department) => void;
  depth?: number;
}) {
  return (
    <div className={cn(depth > 0 && "ml-5 border-l border-line pl-4")}>
      {items.map((item) => (
        <div key={item.id}>
          <DepartmentRow item={item} edit={edit} compact />
          {item.children?.length ? (
            <DepartmentTree
              items={item.children}
              edit={edit}
              depth={depth + 1}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
function DepartmentRow({
  item,
  edit,
  compact,
}: {
  item: Department;
  edit?: (v: Department) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 py-3",
        !compact && "p-4 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-center",
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold">{item.name}</p>
          <Badge variant={item.isActive ? "success" : "neutral"}>
            {item.isActive ? "Hoạt động" : "Ngừng"}
          </Badge>
        </div>
        <p className="mt-1 font-mono text-[10px] text-muted">{item.code}</p>
      </div>
      {!compact && (
        <>
          <Cell label="Quy mô">
            <p className="text-xs font-bold">
              {item.counts.employees} nhân viên · {item.counts.children} đơn vị
              con
            </p>
          </Cell>
          <Cell label="Phạm vi">
            <p className="text-xs text-muted">
              {item.branches.map((v) => v.name).join(", ") ||
                "Chưa gán chi nhánh"}
            </p>
          </Cell>
        </>
      )}
      {edit && (
        <button
          onClick={() => edit(item)}
          className="justify-self-end px-2 py-1 text-xs font-bold text-brand"
        >
          Chỉnh sửa
        </button>
      )}
    </div>
  );
}

function Positions({
  search,
  status,
  updateQuery,
  edit,
}: {
  search: string;
  status: string;
  updateQuery: (v: Record<string, string | null>) => void;
  edit: (v: Position) => void;
}) {
  const { hasPermission } = useAuth();
  const query = useQuery({
    queryKey: ["organization-positions", search, status],
    queryFn: () => getPositions({ search: search || undefined, status }),
  });
  return (
    <>
      <Summary
        cards={[
          [
            "Tổng vị trí",
            query.data?.summary.total ?? 0,
            `${query.data?.summary.active ?? 0} đang sử dụng`,
            UsersRound,
          ],
          [
            "Vị trí quản lý",
            query.data?.summary.managers ?? 0,
            "Không tự động cấp quyền",
            ShieldCheck,
          ],
          [
            "Chưa có nhân viên",
            query.data?.summary.unused ?? 0,
            "Vị trí chưa được sử dụng",
            AlertTriangle,
          ],
          ["Phạm vi", "Doanh nghiệp", "Giới hạn theo phòng ban", Building2],
        ]}
      />
      <Filters search={search} status={status} gps="all" update={updateQuery} />
      {query.isLoading ? (
        <Loading />
      ) : query.data?.items.length ? (
        <section className="overflow-hidden border border-line bg-surface">
          <div className="hidden grid-cols-[1.3fr_1fr_130px_130px_110px] gap-4 border-b border-line bg-canvas/60 px-5 py-3 text-[10px] font-extrabold uppercase text-muted lg:grid">
            <span>Vị trí</span>
            <span>Phòng ban áp dụng</span>
            <span>Nhân viên</span>
            <span>Ca tương lai</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {query.data.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[1.3fr_1fr_130px_130px_110px] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-extrabold">{item.name}</p>
                    {item.isManager && <Badge variant="info">Quản lý</Badge>}
                    <Badge variant={item.isActive ? "success" : "neutral"}>
                      {item.isActive ? "Hoạt động" : "Ngừng"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {item.code}
                  </p>
                </div>
                <Cell label="Phòng ban">
                  <p className="text-xs text-muted">
                    {item.departments.map((v) => v.name).join(", ") ||
                      "Dùng toàn doanh nghiệp"}
                  </p>
                </Cell>
                <Cell label="Nhân viên">
                  <p className="font-mono text-sm font-black">
                    {item.counts.employees}
                  </p>
                </Cell>
                <Cell label="Ca tương lai">
                  <p className="font-mono text-sm font-black">
                    {item.counts.shifts}
                  </p>
                </Cell>
                {hasPermission("positions.manage") && (
                  <button
                    onClick={() => edit(item)}
                    className="justify-self-end px-2 py-1 text-xs font-bold text-brand"
                  >
                    Chỉnh sửa
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <Empty icon={UsersRound} title="Chưa có vị trí phù hợp" />
      )}
    </>
  );
}

function BranchForm({
  item,
  close,
}: {
  item: Branch | null;
  close: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManageGeofence = hasPermission("branches.geofence.manage");
  const qc = useQueryClient();
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState("");
  const [form, setForm] = useState<BranchPayload>(
    item
      ? { ...item }
      : {
          code: generateBusinessCode("CN"),
          name: "",
          email: null,
          phone: null,
          addressLine: "",
          ward: null,
          district: null,
          province: null,
          countryCode: "VN",
          postalCode: null,
          branchType: "office",
          latitude: null,
          longitude: null,
          geofenceEnabled: false,
          geofenceRadiusM: 100,
          locationAccuracyM: 100,
          timezone: "Asia/Ho_Chi_Minh",
          isHeadOffice: false,
          isActive: true,
          notes: null,
          version: 1,
        },
  );
  const mutation = useMutation({
    mutationFn: () => saveBranch(form, item?.id),
    meta: {
      successMessage: item ? "Đã cập nhật chi nhánh" : "Đã tạo chi nhánh",
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-branches"] });
      close();
    },
  });
  const valid =
    form.code.trim().length >= 2 &&
    form.name.trim().length >= 2 &&
    form.addressLine.trim().length >= 3 &&
    (!form.geofenceEnabled ||
      (form.latitude != null &&
        form.longitude != null &&
        form.geofenceRadiusM >= 20));
  const addressQuery = [
    form.addressLine,
    form.ward,
    form.district,
    form.province,
    form.countryCode === "VN" ? "Việt Nam" : form.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  const findAddress = async () => {
    if (!canManageGeofence) return;
    if (form.addressLine.trim().length < 3) {
      setMapError("Nhập địa chỉ đầy đủ trước khi tìm trên bản đồ.");
      return;
    }
    setGeocoding(true);
    setMapError("");
    try {
      // A full address may already contain its country (for example a US address),
      // so do not silently append the form's default country before trying it.
      const rawAddress = form.addressLine.trim();
      const result = await geocodeAddress(rawAddress)
        ?? (addressQuery !== rawAddress ? await geocodeAddress(addressQuery) : null);
      if (!result) {
        setMapError(
          "Không tìm thấy địa chỉ. Hãy bổ sung quận, tỉnh hoặc kéo ghim đến vị trí đúng.",
        );
        return;
      }
      setForm({
        ...form,
        latitude: result.latitude,
        longitude: result.longitude,
      });
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "Không thể tìm địa chỉ.",
      );
    } finally {
      setGeocoding(false);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setMapError("Trình duyệt không hỗ trợ lấy vị trí hiện tại.");
      return;
    }
    setLocating(true);
    setMapError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm({
          ...form,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setMapError(
          "Không lấy được vị trí. Hãy cấp quyền vị trí cho trình duyệt.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true },
    );
  };
  return (
    <Modal
      title={item ? "Cập nhật chi nhánh" : "Thêm chi nhánh"}
      subtitle="Thông tin địa điểm được dùng xuyên suốt lịch, GPS và báo cáo"
      close={close}
      wide
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-5">
          <FormSection title="Thông tin nhận diện">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Mã chi nhánh"
                value={form.code}
                disabled
                change={(v) => setForm({ ...form, code: v.toUpperCase() })}
              />
              <Input
                label="Tên chi nhánh"
                value={form.name}
                change={(v) => setForm({ ...form, name: v })}
              />
              <Select
                label="Loại địa điểm"
                value={form.branchType}
                change={(v) => setForm({ ...form, branchType: v })}
                options={branchTypes}
              />
              <Select
                label="Múi giờ"
                value={form.timezone}
                change={(v) => setForm({ ...form, timezone: v })}
                options={timezones}
              />
            </div>
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-extrabold text-brand">
                Thông tin liên hệ
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Email"
                  value={form.email ?? ""}
                  change={(v) => setForm({ ...form, email: v || null })}
                />
                <Input
                  label="Điện thoại"
                  value={form.phone ?? ""}
                  change={(v) => setForm({ ...form, phone: v || null })}
                />
              </div>
            </details>
            <Toggle
              label="Trụ sở chính"
              checked={form.isHeadOffice}
              change={(v) =>
                setForm({
                  ...form,
                  isHeadOffice: v,
                  branchType: v
                    ? "head_office"
                    : form.branchType === "head_office"
                      ? "office"
                      : form.branchType,
                })
              }
            />
            <Toggle
              label="Đang hoạt động"
              checked={form.isActive}
              change={(v) => setForm({ ...form, isActive: v })}
            />
          </FormSection>
          <FormSection title="Địa chỉ">
            <Input
              label="Địa chỉ đầy đủ"
              value={form.addressLine}
              change={(v) => setForm({ ...form, addressLine: v })}
            />
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-extrabold text-brand">
                Địa chỉ chi tiết
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Phường / xã"
                  value={form.ward ?? ""}
                  change={(v) => setForm({ ...form, ward: v || null })}
                />
                <Input
                  label="Quận / huyện"
                  value={form.district ?? ""}
                  change={(v) => setForm({ ...form, district: v || null })}
                />
                <Input
                  label="Tỉnh / thành phố"
                  value={form.province ?? ""}
                  change={(v) => setForm({ ...form, province: v || null })}
                />
                <Input
                  label="Mã bưu chính"
                  value={form.postalCode ?? ""}
                  change={(v) => setForm({ ...form, postalCode: v || null })}
                />
              </div>
            </details>
            <Button
              className="mt-4 w-full"
              variant="outline"
              disabled={!canManageGeofence}
              loading={geocoding}
              loadingText="Đang tìm địa chỉ"
              onClick={findAddress}
            >
              <Search className="size-4" />
              Tìm địa chỉ trên bản đồ
            </Button>
          </FormSection>
        </div>
        <FormSection title="GPS và geofence">
          <Toggle
            label="Bắt buộc geofence khi chấm công"
            checked={form.geofenceEnabled}
            disabled={!canManageGeofence}
            change={(v) => setForm({ ...form, geofenceEnabled: v })}
          />
          {!canManageGeofence && (
            <p className="mt-3 border border-line bg-canvas p-3 text-xs text-muted">
              Bạn chỉ có quyền xem cấu hình GPS. Cần quyền quản lý geofence để
              thay đổi vị trí hoặc bán kính.
            </p>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-extrabold text-brand">
              Tọa độ và sai số nâng cao
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Input
                label="Vĩ độ"
                type="number"
                disabled={!canManageGeofence}
                value={form.latitude?.toString() ?? ""}
                change={(v) =>
                  setForm({ ...form, latitude: v ? Number(v) : null })
                }
              />
              <Input
                label="Kinh độ"
                type="number"
                disabled={!canManageGeofence}
                value={form.longitude?.toString() ?? ""}
                change={(v) =>
                  setForm({ ...form, longitude: v ? Number(v) : null })
                }
              />
              <Input
                label="Bán kính (m)"
                type="number"
                disabled={!canManageGeofence}
                value={String(form.geofenceRadiusM)}
                change={(v) => setForm({ ...form, geofenceRadiusM: Number(v) })}
              />
              <Input
                label="Sai số GPS tối đa (m)"
                type="number"
                disabled={!canManageGeofence}
                value={String(form.locationAccuracyM)}
                change={(v) =>
                  setForm({ ...form, locationAccuracyM: Number(v) })
                }
              />
            </div>
          </details>
          <div className="mt-4 overflow-hidden border border-line">
            <div className="min-h-[360px]">
              <GeofenceMap
                latitude={form.latitude}
                longitude={form.longitude}
                radiusM={Math.max(20, form.geofenceRadiusM)}
                onPositionChange={(latitude, longitude) =>
                  canManageGeofence && setForm({ ...form, latitude, longitude })
                }
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-line bg-canvas/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted">
                Tìm theo địa chỉ, sau đó kéo ghim hoặc bấm trực tiếp trên bản đồ
                để chỉnh vị trí chính xác.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!canManageGeofence}
                loading={locating}
                loadingText="Đang định vị"
                onClick={locate}
              >
                <MapPin className="size-4" />
                Vị trí hiện tại
              </Button>
            </div>
          </div>
          {mapError && (
            <p className="mt-3 border border-warning/30 bg-warning-soft p-3 text-xs font-bold text-warning-strong">
              {mapError}
            </p>
          )}
          {form.latitude != null && form.longitude != null && (
            <p className="mt-3 bg-info-soft p-3 font-mono text-xs text-brand">
              {form.latitude.toFixed(7)}, {form.longitude.toFixed(7)} · bán kính{" "}
              {form.geofenceRadiusM}m
            </p>
          )}
        </FormSection>
      </div>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={valid}
        close={close}
        save={() => mutation.mutate()}
      />
    </Modal>
  );
}

function BranchDrawer({
  id,
  close,
  edit,
}: {
  id: string;
  close: () => void;
  edit: (v: Branch) => void;
}) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [hoursOpen, setHoursOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [endingManager, setEndingManager] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ["organization-branch", id],
    queryFn: () => getBranch(id),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["organization-branch", id] });
    qc.invalidateQueries({ queryKey: ["organization-branches"] });
  };
  const data = query.data;
  return (
    <Modal
      title={data?.name ?? "Chi tiết chi nhánh"}
      subtitle={
        data ? `${data.code} · ${data.addressLine}` : "Đang tải dữ liệu"
      }
      close={close}
      wide
    >
      {query.isLoading ? (
        <Loading />
      ) : data ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-line pb-4">
            {[
              ["overview", "Tổng quan"],
              ["employees", `Nhân viên (${data.employees.length})`],
              [
                "departments",
                `Phòng ban (${data.departments.filter((v) => v.isActive).length})`,
              ],
              ["shifts", `Ca sắp tới (${data.shifts.length})`],
              ...(hasPermission("branches.scope.manage")
                ? [["access", "Phạm vi quyền"]]
                : []),
              ...(hasPermission("audit.view") ? [["history", "Lịch sử"]] : []),
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 py-2 text-xs font-bold",
                  tab === key ? "bg-info-soft text-brand" : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <div className="mt-5 space-y-5">
              <Summary
                cards={[
                  [
                    "Nhân viên",
                    data.counts.employees,
                    `${data.counts.departments} phòng ban`,
                    UsersRound,
                  ],
                  [
                    "Ca tương lai",
                    data.counts.shifts,
                    "Nháp và đã công bố",
                    CalendarClock,
                  ],
                  [
                    "Geofence",
                    data.geofenceEnabled
                      ? `${data.geofenceRadiusM}m`
                      : "Chưa bật",
                    data.geofenceEnabled
                      ? "Đang kiểm soát GPS"
                      : "Cần cấu hình",
                    MapPin,
                  ],
                  [
                    "Quản lý",
                    data.manager?.fullName ?? "Chưa có",
                    data.timezone,
                    ShieldCheck,
                  ],
                ]}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="border border-line p-4">
                  <h3 className="text-sm font-extrabold">Địa điểm</h3>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {data.addressLine}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-muted">
                    {data.latitude ?? "—"}, {data.longitude ?? "—"}
                  </p>
                  {data.latitude != null && data.longitude != null && (
                    <div className="mt-4 h-72 overflow-hidden border border-line">
                      <GeofenceMap
                        latitude={data.latitude}
                        longitude={data.longitude}
                        radiusM={data.geofenceRadiusM}
                        onPositionChange={() => {}}
                      />
                    </div>
                  )}
                </section>
                <section className="border border-line p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold">Giờ hoạt động</h3>
                    {hasPermission("branches.operating_hours.manage") && (
                      <button
                        onClick={() => setHoursOpen(true)}
                        className="text-xs font-bold text-brand"
                      >
                        Cấu hình
                      </button>
                    )}
                  </div>
                  <div className="mt-3 divide-y divide-line">
                    {data.operatingHours.map((hour) => (
                      <div
                        key={hour.dayOfWeek}
                        className="flex justify-between py-2 text-xs"
                      >
                        <b>{dayNames[hour.dayOfWeek]}</b>
                        <span className="text-muted">
                          {hour.isClosed
                            ? "Đóng cửa"
                            : `${hour.opensAt?.slice(0, 5)} - ${hour.closesAt?.slice(0, 5)}${hour.spansNextDay ? " (+1)" : ""}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="border border-line p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold">
                      Người quản lý chi nhánh
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Phân công vận hành tách biệt với role truy cập hệ thống.
                    </p>
                  </div>
                  {hasPermission("branches.managers.manage") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManagerOpen(true)}
                    >
                      <Plus className="size-3.5" />
                      Phân công
                    </Button>
                  )}
                </div>
                <div className="mt-3 divide-y divide-line">
                  {data.managers.length ? (
                    data.managers.map((manager) => (
                      <div
                        key={manager.id}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1">
                          <p className="text-xs font-extrabold">
                            {manager.employee.fullName}{" "}
                            {manager.isPrimary && (
                              <Badge variant="info">Chính</Badge>
                            )}
                          </p>
                          <p className="mt-1 text-[10px] text-muted">
                            {manager.responsibility} ·{" "}
                            {date(manager.effectiveFrom)} →{" "}
                            {manager.effectiveTo
                              ? date(manager.effectiveTo)
                              : "Hiện tại"}
                          </p>
                        </div>
                        <Badge variant={manager.active ? "success" : "neutral"}>
                          {manager.active ? "Đang phụ trách" : "Đã kết thúc"}
                        </Badge>
                        {manager.active &&
                          hasPermission("branches.managers.manage") && (
                            <button
                              onClick={() =>
                                setEndingManager({
                                  id: manager.id,
                                  name: manager.employee.fullName,
                                })
                              }
                              className="text-[10px] font-bold text-danger"
                            >
                              Kết thúc
                            </button>
                          )}
                      </div>
                    ))
                  ) : (
                    <p className="py-5 text-center text-xs text-muted">
                      Chưa có người quản lý.
                    </p>
                  )}
                </div>
              </section>
              <div className="flex flex-wrap justify-end gap-2">
                {hasPermission("departments.manage") && (
                  <Button
                    variant="outline"
                    onClick={() => setDepartmentsOpen(true)}
                  >
                    Gán phòng ban
                  </Button>
                )}
                {hasPermission("branches.manage") && (
                  <>
                    <Button variant="outline" onClick={() => edit(data)}>
                      Chỉnh sửa
                    </Button>
                    <Button
                      variant={data.isActive ? "outline" : "brand"}
                      onClick={() => setStatusOpen(true)}
                    >
                      {data.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          {tab === "employees" && (
            <SimpleTable
              rows={data.employees.map((v) => [
                v.fullName,
                v.employeeCode,
                v.position?.name ?? "—",
                v.employmentStatus,
              ])}
              headers={["Nhân viên", "Mã", "Vị trí", "Trạng thái"]}
            />
          )}
          {tab === "departments" && (
            <SimpleTable
              rows={data.departments.map((v) => [
                v.department.name,
                v.department.code,
                v.isActive ? "Đang hoạt động" : "Ngừng",
              ])}
              headers={["Phòng ban", "Mã", "Trạng thái"]}
            />
          )}
          {tab === "shifts" && (
            <SimpleTable
              rows={data.shifts.map((v) => [
                v.name,
                format(new Date(v.startsAt), "dd/MM/yyyy HH:mm"),
                v.department ?? "Mọi phòng ban",
                v.status,
              ])}
              headers={["Ca", "Bắt đầu", "Phòng ban", "Trạng thái"]}
            />
          )}
          {tab === "access" && (
            <BranchScopesPanel branch={data} saved={refresh} />
          )}
          {tab === "history" && (
            <div className="mt-5 divide-y divide-line border border-line">
              {data.history.map((v) => (
                <div key={v.id} className="p-4">
                  <p className="text-xs font-extrabold">{v.action}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {v.actor} ·{" "}
                    {format(new Date(v.createdAt), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
          {hoursOpen && (
            <HoursForm
              branch={data}
              close={() => setHoursOpen(false)}
              saved={() => {
                setHoursOpen(false);
                refresh();
              }}
            />
          )}
          {managerOpen && (
            <ManagerForm
              branch={data}
              close={() => setManagerOpen(false)}
              saved={() => {
                setManagerOpen(false);
                refresh();
              }}
            />
          )}
          {departmentsOpen && (
            <BranchDepartmentsForm
              branch={data}
              close={() => setDepartmentsOpen(false)}
              saved={() => {
                setDepartmentsOpen(false);
                refresh();
              }}
            />
          )}
          {statusOpen && (
            <BranchStatusForm
              branch={data}
              close={() => setStatusOpen(false)}
              saved={() => {
                setStatusOpen(false);
                refresh();
              }}
            />
          )}
          {endingManager && (
            <EndManagerForm
              branchId={data.id}
              manager={endingManager}
              close={() => setEndingManager(null)}
              saved={() => {
                setEndingManager(null);
                refresh();
              }}
            />
          )}
        </>
      ) : (
        <ErrorBox
          message={query.error?.message ?? "Không thể tải chi nhánh"}
          retry={() => query.refetch()}
        />
      )}
    </Modal>
  );
}

function BranchStatusForm({
  branch,
  close,
  saved,
}: {
  branch: BranchDetail;
  close: () => void;
  saved: () => void;
}) {
  const [reason, setReason] = useState("");
  const active = !branch.isActive;
  const mutation = useMutation({
    mutationFn: () => changeBranchStatus(branch.id, active, reason.trim()),
    meta: {
      successMessage: active
        ? "Đã kích hoạt lại chi nhánh"
        : "Đã ngừng hoạt động chi nhánh",
    },
    onSuccess: saved,
  });

  return (
    <NestedModal
      title={active ? "Kích hoạt lại chi nhánh" : "Ngừng hoạt động chi nhánh"}
      close={close}
    >
      <p className="border border-line bg-canvas p-3 text-xs leading-5 text-muted">
        {active
          ? `Mở lại chi nhánh ${branch.name}.`
          : `Ngừng hoạt động chi nhánh ${branch.name}.`}
      </p>
      <label className="mt-4 block">
        <FieldLabel>Lý do thay đổi trạng thái</FieldLabel>
        <textarea
          className="input min-h-28 resize-y"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Nhập lý do để lưu vào lịch sử kiểm tra..."
        />
      </label>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={reason.trim().length >= 3}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function EndManagerForm({
  branchId,
  manager,
  close,
  saved,
}: {
  branchId: string;
  manager: { id: string; name: string };
  close: () => void;
  saved: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManageScope = hasPermission("branches.scope.manage");
  const [effectiveTo, setEffectiveTo] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [reason, setReason] = useState("");
  const [revokeManagerScope, setRevokeManagerScope] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      endBranchManager(branchId, manager.id, {
        effectiveTo,
        reason: reason.trim(),
        revokeManagerScope,
      }),
    meta: { successMessage: "Đã kết thúc phân công quản lý" },
    onSuccess: saved,
  });

  return (
    <NestedModal title={`Kết thúc phân công · ${manager.name}`} close={close}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Ngày kết thúc"
          type="date"
          value={effectiveTo}
          change={setEffectiveTo}
        />
        <label className="sm:col-span-2">
          <FieldLabel>Lý do kết thúc</FieldLabel>
          <textarea
            className="input min-h-28 resize-y"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: thay đổi người phụ trách vận hành..."
          />
        </label>
      </div>
      {canManageScope && (
        <Toggle
          label="Thu hồi role MANAGER tại chi nhánh này"
          checked={revokeManagerScope}
          change={setRevokeManagerScope}
        />
      )}
      <p className="mt-3 text-[11px] leading-5 text-muted">
        Kết thúc phân công không xóa lịch sử. Quyền truy cập chỉ bị thu hồi khi
        bạn chủ động chọn tùy chọn trên.
      </p>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={Boolean(effectiveTo && reason.trim().length >= 3)}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function BranchScopesPanel({
  branch,
  saved,
}: {
  branch: BranchDetail;
  saved: () => void;
}) {
  const [grantOpen, setGrantOpen] = useState(false);
  const [revoking, setRevoking] = useState<
    BranchDetail["scopes"][number] | null
  >(null);

  return (
    <section className="mt-5 border border-line">
      <div className="flex items-center justify-between border-b border-line bg-canvas/50 p-4">
        <div>
          <h3 className="text-sm font-extrabold">Phạm vi truy cập chi nhánh</h3>
          <p className="mt-1 text-xs text-muted">
            Role chức năng và phạm vi dữ liệu được quản lý độc lập.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setGrantOpen(true)}>
          <Plus className="size-3.5" />
          Cấp phạm vi
        </Button>
      </div>
      {branch.scopes.length ? (
        <div className="divide-y divide-line">
          {branch.scopes.map((scope) => (
            <div
              key={scope.id}
              className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_120px_110px_auto] sm:items-center"
            >
              <p className="text-xs font-extrabold">{scope.userName}</p>
              <p className="text-xs text-muted">{scope.email}</p>
              <Badge variant="info">{scope.role}</Badge>
              <p className="font-mono text-[10px] text-muted">
                {format(new Date(scope.grantedAt), "dd/MM/yyyy")}
              </p>
              <button
                className="text-left text-xs font-bold text-danger sm:text-right"
                onClick={() => setRevoking(scope)}
              >
                Thu hồi
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-8 text-center text-xs text-muted">
          Chưa có tài khoản được cấp phạm vi riêng tại chi nhánh.
        </p>
      )}
      {grantOpen && (
        <GrantBranchScopeForm
          branch={branch}
          close={() => setGrantOpen(false)}
          saved={() => {
            setGrantOpen(false);
            saved();
          }}
        />
      )}
      {revoking && (
        <RevokeBranchScopeForm
          branchId={branch.id}
          scope={revoking}
          close={() => setRevoking(null)}
          saved={() => {
            setRevoking(null);
            saved();
          }}
        />
      )}
    </section>
  );
}

function GrantBranchScopeForm({
  branch,
  close,
  saved,
}: {
  branch: BranchDetail;
  close: () => void;
  saved: () => void;
}) {
  const scopedUserIds = new Set(branch.scopes.map((scope) => scope.userId));
  const candidates = branch.employees.filter(
    (employee) => employee.userId && !scopedUserIds.has(employee.userId),
  );
  const [userId, setUserId] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      grantBranchScope(branch.id, { userId, roleCode: "MANAGER" }),
    meta: { successMessage: "Đã cấp phạm vi chi nhánh" },
    onSuccess: saved,
  });

  return (
    <NestedModal title="Cấp phạm vi truy cập chi nhánh" close={close}>
      <Select
        label="Tài khoản nhân viên"
        value={userId}
        change={setUserId}
        options={[
          ["", "Chọn tài khoản"],
          ...candidates.map(
            (employee) =>
              [
                employee.userId!,
                `${employee.employeeCode} · ${employee.fullName}`,
              ] as [string, string],
          ),
        ]}
      />
      <div className="mt-4 border border-line bg-canvas p-3 text-xs leading-5 text-muted">
        Vai trò được cấp: <b className="text-ink">MANAGER</b>. Tài khoản chỉ xem
        hoặc thao tác dữ liệu chi nhánh khi role này có permission tương ứng.
      </div>
      {!candidates.length && (
        <FormError message="Không còn nhân viên có tài khoản phù hợp để cấp phạm vi." />
      )}
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={Boolean(userId)}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function RevokeBranchScopeForm({
  branchId,
  scope,
  close,
  saved,
}: {
  branchId: string;
  scope: BranchDetail["scopes"][number];
  close: () => void;
  saved: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => revokeBranchScope(branchId, scope.id, reason.trim()),
    meta: { successMessage: "Đã thu hồi phạm vi chi nhánh" },
    onSuccess: saved,
  });

  return (
    <NestedModal title={`Thu hồi quyền · ${scope.userName}`} close={close}>
      <label className="block">
        <FieldLabel>Lý do thu hồi</FieldLabel>
        <textarea
          className="input min-h-28 resize-y"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Nhập lý do để lưu audit log..."
        />
      </label>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={reason.trim().length >= 3}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function HoursForm({
  branch,
  close,
  saved,
}: {
  branch: BranchDetail;
  close: () => void;
  saved: () => void;
}) {
  const initial = dayNames.map(
    (_, day) =>
      branch.operatingHours.find((v) => v.dayOfWeek === day) ?? {
        dayOfWeek: day,
        isClosed: day === 0 || day === 6,
        opensAt: day === 0 || day === 6 ? null : "08:00",
        closesAt: day === 0 || day === 6 ? null : "17:00",
        spansNextDay: false,
      },
  );
  const [hours, setHours] = useState<OperatingHour[]>(initial);
  const [exceptions, setExceptions] = useState<OperatingException[]>(
    branch.operatingExceptions,
  );
  const mutation = useMutation({
    mutationFn: () => saveOperatingHours(branch.id, hours, exceptions),
    meta: { successMessage: "Đã cập nhật giờ hoạt động" },
    onSuccess: saved,
  });
  const update = (day: number, values: Partial<OperatingHour>) =>
    setHours((current) =>
      current.map((v) => (v.dayOfWeek === day ? { ...v, ...values } : v)),
    );
  return (
    <NestedModal title="Giờ hoạt động và ngày ngoại lệ" close={close}>
      <div className="divide-y divide-line border border-line">
        {hours.map((hour) => (
          <div
            key={hour.dayOfWeek}
            className="grid gap-3 p-3 sm:grid-cols-[100px_100px_1fr_1fr_110px] sm:items-center"
          >
            <b className="text-xs">{dayNames[hour.dayOfWeek]}</b>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={hour.isClosed}
                onChange={(e) =>
                  update(hour.dayOfWeek, { isClosed: e.target.checked })
                }
              />
              Đóng cửa
            </label>
            <input
              type="time"
              disabled={hour.isClosed}
              value={hour.opensAt?.slice(0, 5) ?? ""}
              onChange={(e) =>
                update(hour.dayOfWeek, { opensAt: e.target.value })
              }
              className="input"
            />
            <input
              type="time"
              disabled={hour.isClosed}
              value={hour.closesAt?.slice(0, 5) ?? ""}
              onChange={(e) =>
                update(hour.dayOfWeek, { closesAt: e.target.value })
              }
              className="input"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                disabled={hour.isClosed}
                checked={hour.spansNextDay}
                onChange={(e) =>
                  update(hour.dayOfWeek, { spansNextDay: e.target.checked })
                }
              />
              Qua đêm
            </label>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-extrabold">Ngày ngoại lệ</h4>
          <p className="mt-1 text-xs text-muted">
            Ngày lễ, bảo trì hoặc mở cửa đặc biệt.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setExceptions([
              ...exceptions,
              {
                exceptionDate: format(new Date(), "yyyy-MM-dd"),
                isClosed: true,
                opensAt: null,
                closesAt: null,
                spansNextDay: false,
                name: "",
                note: null,
              },
            ])
          }
        >
          <Plus className="size-3.5" />
          Thêm ngày
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {exceptions.map((item, index) => (
          <div
            key={`${item.exceptionDate}-${index}`}
            className="grid gap-2 border border-line p-3 sm:grid-cols-2 xl:grid-cols-[145px_1fr_110px_120px_120px_100px_auto] xl:items-center"
          >
            <input
              type="date"
              className="input"
              value={item.exceptionDate}
              onChange={(e) =>
                setExceptions(
                  exceptions.map((v, i) =>
                    i === index ? { ...v, exceptionDate: e.target.value } : v,
                  ),
                )
              }
            />
            <input
              className="input"
              placeholder="Tên ngày ngoại lệ"
              value={item.name}
              onChange={(e) =>
                setExceptions(
                  exceptions.map((v, i) =>
                    i === index ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.isClosed}
                onChange={(e) =>
                  setExceptions(
                    exceptions.map((v, i) =>
                      i === index ? { ...v, isClosed: e.target.checked } : v,
                    ),
                  )
                }
              />
              Đóng cửa
            </label>
            <input
              type="time"
              className="input"
              disabled={item.isClosed}
              value={item.opensAt?.slice(0, 5) ?? ""}
              onChange={(event) =>
                setExceptions(
                  exceptions.map((value, itemIndex) =>
                    itemIndex === index
                      ? { ...value, opensAt: event.target.value }
                      : value,
                  ),
                )
              }
            />
            <input
              type="time"
              className="input"
              disabled={item.isClosed}
              value={item.closesAt?.slice(0, 5) ?? ""}
              onChange={(event) =>
                setExceptions(
                  exceptions.map((value, itemIndex) =>
                    itemIndex === index
                      ? { ...value, closesAt: event.target.value }
                      : value,
                  ),
                )
              }
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                disabled={item.isClosed}
                checked={item.spansNextDay}
                onChange={(event) =>
                  setExceptions(
                    exceptions.map((value, itemIndex) =>
                      itemIndex === index
                        ? { ...value, spansNextDay: event.target.checked }
                        : value,
                    ),
                  )
                }
              />
              Qua đêm
            </label>
            <button
              className="text-xs font-bold text-danger"
              onClick={() =>
                setExceptions(exceptions.filter((_, i) => i !== index))
              }
            >
              Xóa
            </button>
          </div>
        ))}
      </div>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={
          hours.length === 7 &&
          exceptions.every(
            (v) =>
              v.name.trim().length >= 2 &&
              (v.isClosed || Boolean(v.opensAt && v.closesAt)),
          )
        }
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function ManagerForm({
  branch,
  close,
  saved,
}: {
  branch: BranchDetail;
  close: () => void;
  saved: () => void;
}) {
  const { hasPermission } = useAuth();
  const canManageScope = hasPermission("branches.scope.manage");
  const candidates = branch.employees.filter(
    (v) => v.employmentStatus === "active",
  );
  const [form, setForm] = useState({
    employeeId: "",
    responsibility: "Quản lý chi nhánh",
    isPrimary: !branch.managers.some((v) => v.active && v.isPrimary),
    effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    grantManagerScope: canManageScope,
  });
  const mutation = useMutation({
    mutationFn: () => assignBranchManager(branch.id, form),
    meta: { successMessage: "Đã phân công quản lý chi nhánh" },
    onSuccess: saved,
  });
  return (
    <NestedModal title="Phân công quản lý chi nhánh" close={close}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Nhân viên"
          value={form.employeeId}
          change={(v) => setForm({ ...form, employeeId: v })}
          options={[
            ["", "Chọn nhân viên"],
            ...candidates.map(
              (v) =>
                [v.id, `${v.employeeCode} · ${v.fullName}`] as [string, string],
            ),
          ]}
        />
        <Input
          label="Trách nhiệm"
          value={form.responsibility}
          change={(v) => setForm({ ...form, responsibility: v })}
        />
        <Input
          label="Hiệu lực từ"
          type="date"
          value={form.effectiveFrom}
          change={(v) => setForm({ ...form, effectiveFrom: v })}
        />
      </div>
      <Toggle
        label="Quản lý chính"
        checked={form.isPrimary}
        change={(v) => setForm({ ...form, isPrimary: v })}
      />
      {canManageScope && (
        <Toggle
          label="Cấp role MANAGER theo chi nhánh"
          checked={form.grantManagerScope}
          change={(v) => setForm({ ...form, grantManagerScope: v })}
        />
      )}
      {!candidates.length && (
        <FormError message="Chi nhánh chưa có nhân viên đang hoạt động để phân công." />
      )}
      <Actions
        pending={mutation.isPending}
        valid={Boolean(form.employeeId && form.responsibility.length >= 2)}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function BranchDepartmentsForm({
  branch,
  close,
  saved,
}: {
  branch: BranchDetail;
  close: () => void;
  saved: () => void;
}) {
  const query = useQuery({
    queryKey: ["organization-departments", "", "active"],
    queryFn: () => getDepartments({ status: "active" }),
  });
  const [selected, setSelected] = useState(
    branch.departments.filter((v) => v.isActive).map((v) => v.departmentId),
  );
  const mutation = useMutation({
    mutationFn: () => setBranchDepartments(branch.id, selected),
    meta: { successMessage: "Đã cập nhật phòng ban tại chi nhánh" },
    onSuccess: saved,
  });
  return (
    <NestedModal title="Phòng ban tại chi nhánh" close={close}>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {query.data?.items.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-3 bg-surface p-3 text-xs font-bold"
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, item.id]
                    : selected.filter((v) => v !== item.id),
                )
              }
            />
            {item.name}
            <span className="ml-auto font-mono text-[9px] text-muted">
              {item.code}
            </span>
          </label>
        ))}
      </div>
      <Actions
        pending={mutation.isPending}
        valid
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

function DepartmentForm({
  item,
  close,
}: {
  item: Department | null;
  close: () => void;
}) {
  const qc = useQueryClient();
  const deps = useQuery({
    queryKey: ["organization-departments", "", "all"],
    queryFn: () => getDepartments({ status: "all" }),
  });
  const branches = useQuery({
    queryKey: ["organization-branches", "", "active", "all"],
    queryFn: () => getBranches({ status: "active" }),
  });
  const [form, setForm] = useState({
    code: item?.code ?? generateBusinessCode("PB"),
    name: item?.name ?? "",
    parentId: item?.parentId ?? "",
    description: item?.description ?? "",
    isActive: item?.isActive ?? true,
    branchIds: item?.branches.map((v) => v.id) ?? [],
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      saveDepartment({ ...form, parentId: form.parentId || null }, item?.id),
    meta: {
      successMessage: item ? "Đã cập nhật phòng ban" : "Đã tạo phòng ban",
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-departments"] });
      close();
    },
  });
  return (
    <Modal
      title={item ? "Cập nhật phòng ban" : "Thêm phòng ban"}
      subtitle="Cơ cấu tối đa 5 cấp và không cho phép vòng lặp"
      close={close}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Mã phòng ban"
          value={form.code}
          disabled
          change={(v) => setForm({ ...form, code: v.toUpperCase() })}
        />
        <Input
          label="Tên phòng ban"
          value={form.name}
          change={(v) => setForm({ ...form, name: v })}
        />
        <Select
          label="Phòng ban cha"
          value={form.parentId}
          change={(v) => setForm({ ...form, parentId: v })}
          options={[
            ["", "Không có"],
            ...(deps.data?.items
              .filter((v) => v.id !== item?.id && v.isActive)
              .map((v) => [v.id, v.name] as [string, string]) ?? []),
          ]}
        />
        <Input
          label="Mô tả"
          value={form.description}
          change={(v) => setForm({ ...form, description: v })}
        />
      </div>
      <MultiCheck
        title="Hoạt động tại chi nhánh"
        items={
          branches.data?.items.map((v) => ({ id: v.id, name: v.name })) ?? []
        }
        selected={form.branchIds}
        change={(branchIds) => setForm({ ...form, branchIds })}
      />
      {mutation.isError && <FormError message={mutation.error.message} />}
      <div className="flex items-center justify-between border-t border-line pt-4 mt-5">
        {item ? (
          <Button variant="outline" onClick={() => setStatusOpen(true)}>
            {item.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            variant="brand"
            loading={mutation.isPending}
            disabled={form.code.length < 2 || form.name.length < 2}
            onClick={() => mutation.mutate()}
          >
            Lưu phòng ban
          </Button>
        </div>
      </div>
      {item && statusOpen && (
        <EntityStatusForm
          title={item.name}
          entityLabel="phòng ban"
          active={!item.isActive}
          close={() => setStatusOpen(false)}
          submit={(reason) =>
            changeDepartmentStatus(item.id, !item.isActive, reason)
          }
          saved={() => {
            qc.invalidateQueries({ queryKey: ["organization-departments"] });
            close();
          }}
        />
      )}
    </Modal>
  );
}

function PositionForm({
  item,
  close,
}: {
  item: Position | null;
  close: () => void;
}) {
  const qc = useQueryClient();
  const deps = useQuery({
    queryKey: ["organization-departments", "", "active"],
    queryFn: () => getDepartments({ status: "active" }),
  });
  const [form, setForm] = useState({
    code: item?.code ?? generateBusinessCode("VT"),
    name: item?.name ?? "",
    description: item?.description ?? "",
    isManager: item?.isManager ?? false,
    isActive: item?.isActive ?? true,
    departmentIds: item?.departments.map((v) => v.id) ?? [],
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => savePosition(form, item?.id),
    meta: { successMessage: item ? "Đã cập nhật vị trí" : "Đã tạo vị trí" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-positions"] });
      close();
    },
  });
  return (
    <Modal
      title={item ? "Cập nhật vị trí" : "Thêm vị trí"}
      subtitle="Vị trí công việc không tự động cấp role hệ thống"
      close={close}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Mã vị trí"
          value={form.code}
          disabled
          change={(v) => setForm({ ...form, code: v.toUpperCase() })}
        />
        <Input
          label="Tên vị trí"
          value={form.name}
          change={(v) => setForm({ ...form, name: v })}
        />
        <Input
          label="Mô tả"
          value={form.description}
          change={(v) => setForm({ ...form, description: v })}
        />
      </div>
      <Toggle
        label="Đây là vị trí quản lý"
        checked={form.isManager}
        change={(v) => setForm({ ...form, isManager: v })}
      />
      <MultiCheck
        title="Phòng ban được sử dụng"
        items={deps.data?.items.map((v) => ({ id: v.id, name: v.name })) ?? []}
        selected={form.departmentIds}
        change={(departmentIds) => setForm({ ...form, departmentIds })}
      />
      {mutation.isError && <FormError message={mutation.error.message} />}
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        {item ? (
          <Button variant="outline" onClick={() => setStatusOpen(true)}>
            {item.isActive ? "Ngừng hoạt động" : "Kích hoạt lại"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            variant="brand"
            loading={mutation.isPending}
            disabled={form.code.length < 2 || form.name.length < 2}
            onClick={() => mutation.mutate()}
          >
            Lưu vị trí
          </Button>
        </div>
      </div>
      {item && statusOpen && (
        <EntityStatusForm
          title={item.name}
          entityLabel="vị trí"
          active={!item.isActive}
          close={() => setStatusOpen(false)}
          submit={(reason) =>
            changePositionStatus(item.id, !item.isActive, reason)
          }
          saved={() => {
            qc.invalidateQueries({ queryKey: ["organization-positions"] });
            close();
          }}
        />
      )}
    </Modal>
  );
}

function EntityStatusForm({
  title,
  entityLabel,
  active,
  close,
  submit,
  saved,
}: {
  title: string;
  entityLabel: string;
  active: boolean;
  close: () => void;
  submit: (reason: string) => Promise<unknown>;
  saved: () => void;
}) {
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => submit(reason.trim()),
    meta: {
      successMessage: active
        ? `Đã kích hoạt lại ${entityLabel}`
        : `Đã ngừng hoạt động ${entityLabel}`,
    },
    onSuccess: saved,
  });

  return (
    <NestedModal
      title={`${active ? "Kích hoạt lại" : "Ngừng hoạt động"} ${entityLabel}`}
      close={close}
    >
      <p className="border border-line bg-canvas p-3 text-xs text-muted">
        {title} · thao tác được kiểm tra dữ liệu đang sử dụng trước khi áp dụng.
      </p>
      <label className="mt-4 block">
        <FieldLabel>Lý do thay đổi trạng thái</FieldLabel>
        <textarea
          className="input min-h-28 resize-y"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Nhập lý do để lưu vào lịch sử kiểm tra..."
        />
      </label>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <Actions
        pending={mutation.isPending}
        valid={reason.trim().length >= 3}
        close={close}
        save={() => mutation.mutate()}
      />
    </NestedModal>
  );
}

const branchTypes: Array<[string, string]> = [
  ["head_office", "Trụ sở chính"],
  ["office", "Văn phòng"],
  ["store", "Cửa hàng"],
  ["factory", "Nhà máy"],
  ["warehouse", "Kho vận"],
  ["project_site", "Địa điểm dự án"],
  ["other", "Khác"],
];
const timezones: Array<[string, string]> = [
  ["Asia/Ho_Chi_Minh", "Việt Nam · Asia/Ho_Chi_Minh"],
  ["Asia/Bangkok", "Bangkok"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Tokyo", "Tokyo"],
  ["Europe/London", "London"],
  ["America/New_York", "New York"],
];
const dayNames = [
  "Chủ nhật",
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
];
function typeLabel(v: string) {
  return branchTypes.find(([key]) => key === v)?.[1] ?? v;
}
function date(v: string) {
  return format(new Date(`${v}T00:00:00`), "dd/MM/yyyy");
}
function Filters({
  search,
  status,
  gps,
  update,
  showGps,
}: {
  search: string;
  status: string;
  gps: string;
  update: (v: Record<string, string | null>) => void;
  showGps?: boolean;
}) {
  return (
    <section
      className={cn(
        "grid gap-px border border-line bg-line",
        showGps ? "md:grid-cols-[1fr_220px_220px]" : "md:grid-cols-[1fr_240px]",
      )}
    >
      <label className="relative bg-surface p-3">
        <FieldLabel>Tìm kiếm</FieldLabel>
        <Search className="absolute bottom-5 left-6 size-4 text-muted" />
        <input
          className="input border-0 pl-9"
          value={search}
          onChange={(e) => update({ search: e.target.value || null })}
          placeholder="Tên hoặc mã..."
        />
      </label>
      <label className="bg-surface p-3">
        <FieldLabel>Trạng thái</FieldLabel>
        <select
          className="input border-0"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="all">Tất cả</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngừng hoạt động</option>
        </select>
      </label>
      {showGps && (
        <label className="bg-surface p-3">
          <FieldLabel>GPS</FieldLabel>
          <select
            className="input border-0"
            value={gps}
            onChange={(e) => update({ gps: e.target.value })}
          >
            <option value="all">Tất cả</option>
            <option value="configured">Đã bật geofence</option>
            <option value="missing">Chưa bật geofence</option>
          </select>
        </label>
      )}
    </section>
  );
}
function Summary({
  cards,
}: {
  cards: Array<[string, string | number, string, typeof Building2]>;
}) {
  return (
    <section className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, note, Icon]) => (
        <div key={label} className="bg-surface p-4 sm:p-5">
          <Icon className="size-5 text-brand" />
          <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
            {label}
          </p>
          <p className="mt-1 font-mono text-2xl font-black">{value}</p>
          <p className="mt-1 text-[11px] text-muted">{note}</p>
        </div>
      ))}
    </section>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
  wide,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 sm:items-center sm:p-5">
      <button className="absolute inset-0" onClick={close} />
      <section
        className={cn(
          "relative z-10 max-h-[95vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl",
          wide ? "sm:max-w-6xl" : "sm:max-w-3xl",
        )}
      >
        <header className="sticky top-0 z-20 flex items-start justify-between border-b border-line bg-surface p-5">
          <div>
            <h2 className="text-lg font-black">{title}</h2>
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          </div>
          <button onClick={close}>
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
function NestedModal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/55 p-4">
      <button className="absolute inset-0" onClick={close} />
      <section className="relative z-10 max-h-[92vh] w-full max-w-5xl overflow-y-auto border border-line bg-surface shadow-2xl">
        <header className="flex justify-between border-b border-line p-4">
          <h3 className="font-black">{title}</h3>
          <button onClick={close}>
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line">
      <h3 className="border-b border-line bg-canvas/50 px-4 py-3 text-xs font-extrabold uppercase">
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}
function Input({
  label,
  value,
  change,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        disabled={disabled}
        value={value}
        onChange={(e) => change(e.target.value)}
        className="input"
      />
    </label>
  );
}
function Select({
  label,
  value,
  change,
  options,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="input"
      >
        {options.map(([key, labelValue]) => (
          <option key={key} value={key}>
            {labelValue}
          </option>
        ))}
      </select>
    </label>
  );
}
function Toggle({
  label,
  checked,
  change,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  change: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs font-bold">
      <span>{label}</span>
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => change(e.target.checked)}
        className="size-4 accent-blue-600"
      />
    </label>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[9px] font-extrabold uppercase tracking-[0.1em] text-muted">
      {children}
    </span>
  );
}
function MultiCheck({
  title,
  items,
  selected,
  change,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  selected: string[];
  change: (v: string[]) => void;
}) {
  return (
    <section className="mt-5">
      <FieldLabel>{title}</FieldLabel>
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-3 bg-surface p-3 text-xs font-bold"
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                change(
                  e.target.checked
                    ? [...selected, item.id]
                    : selected.filter((v) => v !== item.id),
                )
              }
            />
            {item.name}
          </label>
        ))}
      </div>
    </section>
  );
}
function Actions({
  pending,
  valid,
  close,
  save,
}: {
  pending: boolean;
  valid: boolean;
  close: () => void;
  save: () => void;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
      <Button variant="outline" disabled={pending} onClick={close}>
        Hủy
      </Button>
      <Button
        variant="brand"
        loading={pending}
        loadingText="Đang lưu"
        disabled={!valid}
        onClick={save}
      >
        Lưu thay đổi
      </Button>
    </div>
  );
}
function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block text-[9px] font-extrabold uppercase text-muted xl:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}
function FormError({ message }: { message: string }) {
  return (
    <p className="mt-4 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">
      {message}
    </p>
  );
}
function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <section className="mt-5 overflow-x-auto border border-line">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-canvas text-[9px] uppercase text-muted">
          <tr>
            {headers.map((v) => (
              <th key={v} className="p-3">
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j} className="p-3">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Loading() {
  return (
    <div className="grid min-h-64 place-items-center border border-line bg-surface">
      <LoaderCircle className="size-6 animate-spin text-brand" />
    </div>
  );
}
function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="border border-danger/20 bg-danger-soft p-8 text-center">
      <p className="text-sm font-bold text-danger">{message}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
}: {
  icon: typeof Building2;
  title: string;
}) {
  return (
    <div className="border border-line bg-surface p-14 text-center">
      <Icon className="mx-auto size-7 text-muted" />
      <p className="mt-3 text-sm font-extrabold">{title}</p>
    </div>
  );
}
