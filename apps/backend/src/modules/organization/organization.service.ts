import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThan,
  Repository,
} from "typeorm";
import { AuthUser } from "../access-control/auth-user.type";
import { Role } from "../access-control/entities/role.entity";
import { UserRole } from "../access-control/entities/user-role.entity";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { Organization } from "../core/entities/organization.entity";
import { Employee } from "../employees/entities/employee.entity";
import { Shift } from "../schedules/entities/shift.entity";
import {
  AssignBranchManagerDto,
  BranchStatusDto,
  EndBranchManagerDto,
  GrantBranchScopeDto,
  MoveDepartmentDto,
  OrganizationQueryDto,
  SaveBranchDto,
  SaveDepartmentDto,
  SaveOperatingHoursDto,
  SaveOrganizationDto,
  SavePositionDto,
  SetBranchDepartmentsDto,
  RevokeBranchScopeDto,
} from "./dto/organization.dto";
import { BranchDepartment } from "./entities/branch-department.entity";
import { BranchManagerAssignment } from "./entities/branch-manager-assignment.entity";
import { BranchOperatingException } from "./entities/branch-operating-exception.entity";
import { BranchOperatingHour } from "./entities/branch-operating-hour.entity";
import { Branch } from "./entities/branch.entity";
import { DepartmentPosition } from "./entities/department-position.entity";
import { Department } from "./entities/department.entity";
import { Position } from "./entities/position.entity";
import tzLookup = require("tz-lookup");

type Scope = {
  unrestricted: boolean;
  branchIds: string[];
  departmentIds: string[];
};

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(BranchDepartment)
    private readonly branchDepartmentRepository: Repository<BranchDepartment>,
    @InjectRepository(BranchOperatingHour)
    private readonly hoursRepository: Repository<BranchOperatingHour>,
    @InjectRepository(BranchOperatingException)
    private readonly exceptionRepository: Repository<BranchOperatingException>,
    @InjectRepository(BranchManagerAssignment)
    private readonly managerRepository: Repository<BranchManagerAssignment>,
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    private readonly dataSource: DataSource,
  ) {}

  async getProfile() {
    const organization = await this.organizationRepository
      .createQueryBuilder("organization")
      .orderBy("organization.created_at", "ASC")
      .getOne();
    return {
      configured: Boolean(organization),
      organization: organization ? this.organizationView(organization) : null,
    };
  }

  async getTimeContext() {
    const profile = await this.getProfile();
    return {
      timezone: profile.organization?.timezone ?? "UTC",
      weekStartsOn: profile.organization?.weekStartsOn ?? 1,
      currencyCode: profile.organization?.currencyCode ?? "USD",
    };
  }

  async resolveTimezone(query: string) {
    const location = await this.geocode(query);
    if (!location) {
      throw new BadRequestException(
        "Không tìm thấy địa chỉ để xác định múi giờ",
      );
    }
    return {
      ...location,
      timezone: tzLookup(location.latitude, location.longitude),
    };
  }

  async createProfile(dto: SaveOrganizationDto, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(92731001)");
      const existing = await manager.getRepository(Organization).findOne({
        order: { createdAt: "ASC" },
      });
      if (existing) {
        throw new ConflictException("Doanh nghiệp đã được thiết lập");
      }
      const organization = manager.create(Organization, {
        code: `ORG-${Date.now().toString(36).toUpperCase()}`,
        ...this.organizationPayload(dto),
        attendanceRoundingMinutes: 1,
        lateGraceMinutes: 15,
        earlyLeaveGraceMinutes: 0,
      });
      await manager.save(organization);
      await this.audit(
        manager,
        actor.id,
        "organization.created",
        "organization",
        organization.id,
        null,
        this.organizationView(organization),
      );
      return this.organizationView(organization);
    });
  }

  async updateProfile(dto: SaveOrganizationDto, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Organization);
      const organization = await repository.findOne({
        order: { createdAt: "ASC" },
      });
      if (!organization) {
        throw new BadRequestException("Hãy thiết lập doanh nghiệp trước");
      }
      const before = this.organizationView(organization);
      Object.assign(organization, this.organizationPayload(dto), {
        updatedAt: new Date(),
      });
      await repository.save(organization);
      await this.audit(
        manager,
        actor.id,
        "organization.updated",
        "organization",
        organization.id,
        before,
        this.organizationView(organization),
      );
      return this.organizationView(organization);
    });
  }

  private organizationPayload(dto: SaveOrganizationDto) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException("Múi giờ không hợp lệ");
    }
    return {
      name: dto.name.trim(),
      legalName: dto.legalName?.trim() || null,
      taxCode: dto.taxCode?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      timezone: dto.timezone,
      currencyCode: dto.currencyCode.toUpperCase(),
      weekStartsOn: dto.weekStartsOn,
    };
  }

  private organizationView(organization: Organization) {
    return {
      id: organization.id,
      code: organization.code,
      name: organization.name,
      legalName: organization.legalName,
      taxCode: organization.taxCode,
      email: organization.email,
      phone: organization.phone,
      address: organization.address,
      timezone: organization.timezone,
      currencyCode: organization.currencyCode.trim(),
      weekStartsOn: organization.weekStartsOn,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }

  async getDashboard(actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const organizationDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: organization.timezone,
    }).format(new Date());
    const [setup] = await this.dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM workforce.branches WHERE organization_id=$1 AND deleted_at IS NULL) branches,
        (SELECT count(*)::int FROM workforce.departments WHERE organization_id=$1 AND deleted_at IS NULL) departments,
        (SELECT count(*)::int FROM workforce.positions WHERE organization_id=$1 AND deleted_at IS NULL) positions,
        (SELECT count(*)::int FROM workforce.employees WHERE organization_id=$1 AND deleted_at IS NULL) employees,
        (SELECT count(*)::int FROM workforce.shift_templates WHERE organization_id=$1 AND is_active=true) shift_templates,
        (SELECT count(*)::int FROM workforce.leave_types WHERE organization_id=$1 AND is_active=true) leave_types,
        (SELECT count(*)::int FROM workforce.timesheets t JOIN workforce.timesheet_periods p ON p.id=t.period_id WHERE p.organization_id=$1 AND t.status IN ('draft','pending_approval','rejected')) draft_timesheets,
        (SELECT count(*)::int FROM workforce.timesheets t JOIN workforce.timesheet_periods p ON p.id=t.period_id WHERE p.organization_id=$1 AND t.status='approved') approved_timesheets,
        (SELECT count(*)::int FROM workforce.timesheets t JOIN workforce.timesheet_periods p ON p.id=t.period_id WHERE p.organization_id=$1 AND t.status='locked') locked_timesheets`,
      [organization.id],
    );
    const [today] = await this.dataSource.query(
      `SELECT
        count(DISTINCT s.id)::int shifts,
        coalesce(sum(s.required_headcount),0)::int required,
        count(sa.id) FILTER (WHERE sa.assignment_status IN ('assigned','confirmed'))::int assigned,
        count(ar.id) FILTER (WHERE ar.status='open')::int working,
        count(ar.id) FILTER (WHERE ar.status IN ('missing_check_in','absent'))::int missing,
        count(v.id) FILTER (WHERE v.status IN ('active','provisional'))::int anomalies
       FROM workforce.shifts s
       JOIN workforce.branches b ON b.id=s.branch_id
       LEFT JOIN workforce.shift_assignments sa ON sa.shift_id=s.id
       LEFT JOIN workforce.attendance_records ar ON ar.shift_assignment_id=sa.id AND ar.work_date=$1::date
       LEFT JOIN workforce.attendance_violations v ON v.shift_assignment_id=sa.id AND v.violation_date=$1::date
       WHERE s.deleted_at IS NULL AND s.status='published'
         AND DATE(s.starts_at AT TIME ZONE b.timezone) <= $1::date
         AND DATE(s.ends_at AT TIME ZONE b.timezone) >= $1::date`,
      [organizationDate],
    );
    const [pending] = await this.dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM workforce.leave_requests WHERE status='pending') leave_requests,
        (SELECT count(*)::int FROM workforce.timesheets WHERE status='pending_approval') timesheets`,
    );
    const chart = await this.dataSource.query(
      `WITH days AS (
        SELECT generate_series($1::date-6, $1::date, interval '1 day')::date AS work_date
      )
      SELECT to_char(d.work_date,'YYYY-MM-DD') work_day,
        coalesce((SELECT sum(greatest(extract(epoch FROM (s.ends_at-s.starts_at))/60-s.unpaid_break_minutes,0)) FROM workforce.shifts s WHERE s.deleted_at IS NULL AND s.status='published' AND s.starts_at::date=d.work_date),0)::int planned,
        coalesce((SELECT sum(ar.worked_minutes) FROM workforce.attendance_records ar WHERE ar.work_date=d.work_date),0)::int actual
      FROM days d ORDER BY d.work_date`,
      [organizationDate],
    );
    return {
      setup: {
        branches: Number(setup.branches),
        departments: Number(setup.departments),
        positions: Number(setup.positions),
        employees: Number(setup.employees),
        shiftTemplates: Number(setup.shift_templates),
        leaveTypes: Number(setup.leave_types),
        draftTimesheets: Number(setup.draft_timesheets),
        approvedTimesheets: Number(setup.approved_timesheets),
        lockedTimesheets: Number(setup.locked_timesheets),
      },
      today: Object.fromEntries(
        Object.entries(today).map(([key, value]) => [key, Number(value)]),
      ),
      pending: {
        leaveRequests: Number(pending.leave_requests),
        timesheets: Number(pending.timesheets),
      },
      chart: chart.map(
        (row: { work_day: string; planned: number; actual: number }) => ({
          day: row.work_day,
          planned: Number(row.planned),
          actual: Number(row.actual),
        }),
      ),
    };
  }

  async geocode(rawQuery: string) {
    const query = rawQuery
      ?.trim()
      .replace(/Hoa Kỳ/gi, "United States")
      .replace(/Mỹ/gi, "United States");
    if (!query || query.length < 3) {
      throw new BadRequestException("Địa chỉ tìm kiếm phải có ít nhất 3 ký tự");
    }
    const simplifiedQuery = query
      .replace(/\b(?:suite|ste|unit|room)\s+#?[A-Za-z0-9-]+\b/gi, "")
      .replace(
        /\b(Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln)\s+[A-Za-z]+\d+\b/gi,
        "$1",
      )
      .replace(/\s+,/g, ",")
      .trim();
    const candidates = [...new Set([query, simplifiedQuery])];
    const mapTilerKey = process.env.MAPTILER_API_KEY?.trim();
    if (mapTilerKey) {
      for (const candidate of candidates) {
        try {
          const response = await fetch(
            `https://api.maptiler.com/geocoding/${encodeURIComponent(candidate)}.json?${new URLSearchParams({ key: mapTilerKey, limit: "1", language: "vi" })}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!response.ok) continue;
          const result = (await response.json()) as {
            features?: Array<{
              center: [number, number];
              place_name?: string;
              place_type?: string[];
            }>;
          };
          const feature = result.features?.[0];
          if (!feature) continue;
          if (
            candidate === query &&
            candidates.length > 1 &&
            !feature.place_type?.includes("address")
          )
            continue;
          return {
            latitude: feature.center[1],
            longitude: feature.center[0],
            displayName: feature.place_name ?? candidate,
          };
        } catch {
          // Continue with the simplified query or the OSM fallback below.
        }
      }
    }
    const params = new URLSearchParams({
      q: simplifiedQuery,
      format: "jsonv2",
      limit: "1",
    });
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Language": "vi,en",
            "User-Agent": "Workzen Workforce Management/0.1",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
      const [result] = (await response.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;
      if (!result) return null;
      return {
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        displayName: result.display_name,
      };
    } catch {
      try {
        const parts = query.split(",").map((part) => part.trim());
        const candidates = parts.map((_, index) =>
          parts.slice(index).join(", "),
        );
        let feature:
          | {
              geometry: { coordinates: [number, number] };
              properties?: { name?: string; city?: string; state?: string };
            }
          | undefined;
        for (const candidate of candidates) {
          const response = await fetch(
            `https://photon.komoot.io/api/?${new URLSearchParams({ q: candidate, limit: "1" })}`,
            { signal: AbortSignal.timeout(8000) },
          );
          if (!response.ok) continue;
          const result = (await response.json()) as {
            features?: Array<NonNullable<typeof feature>>;
          };
          feature = result.features?.[0];
          if (feature) break;
        }
        if (!feature) return null;
        const [longitude, latitude] = feature.geometry.coordinates;
        return {
          latitude,
          longitude,
          displayName: [
            feature.properties?.name,
            feature.properties?.city,
            feature.properties?.state,
          ]
            .filter(Boolean)
            .join(", "),
        };
      } catch {
        throw new BadRequestException(
          "Dịch vụ tìm địa chỉ đang tạm thời không khả dụng. Bạn vẫn có thể kéo ghim trên bản đồ.",
        );
      }
    }
  }

  async getBranches(query: OrganizationQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const scope = this.resolveScope(actor);
    const qb = this.branchRepository
      .createQueryBuilder("branch")
      .where(
        "branch.organization_id=:organizationId AND branch.deleted_at IS NULL",
        { organizationId: organization.id },
      );
    if (!scope.unrestricted) {
      if (!scope.branchIds.length)
        return {
          summary: {
            total: 0,
            active: 0,
            geofence: 0,
            missingConfiguration: 0,
            employees: 0,
          },
          items: [],
        };
      qb.andWhere("branch.id IN (:...branchIds)", {
        branchIds: scope.branchIds,
      });
    }
    if (query.search?.trim())
      qb.andWhere(
        "(branch.code ILIKE :search OR branch.name ILIKE :search OR branch.address_line ILIKE :search)",
        { search: `%${query.search.trim()}%` },
      );
    if (query.status === "active") qb.andWhere("branch.is_active=true");
    if (query.status === "inactive") qb.andWhere("branch.is_active=false");
    if (query.gps === "configured") qb.andWhere("branch.geofence_enabled=true");
    if (query.gps === "missing") qb.andWhere("branch.geofence_enabled=false");
    const branches = await qb
      .orderBy("branch.is_head_office", "DESC")
      .addOrderBy("branch.name", "ASC")
      .getMany();
    const items = await Promise.all(
      branches.map((branch) => this.branchSummary(branch)),
    );
    return {
      summary: {
        total: items.length,
        active: items.filter((item) => item.isActive).length,
        geofence: items.filter((item) => item.geofenceEnabled).length,
        missingConfiguration: items.filter((item) => item.warnings.length)
          .length,
        employees: items.reduce((sum, item) => sum + item.counts.employees, 0),
      },
      items,
    };
  }

  async getBranch(id: string, actor: AuthUser) {
    const branch = await this.getScopedBranch(id, actor);
    const today = await this.today();
    const [
      summary,
      hours,
      exceptions,
      managers,
      departments,
      employees,
      shifts,
      scopedUsers,
      audits,
    ] = await Promise.all([
      this.branchSummary(branch),
      this.hoursRepository.find({
        where: { branchId: id },
        order: { dayOfWeek: "ASC" },
      }),
      this.exceptionRepository.find({
        where: { branchId: id },
        order: { exceptionDate: "ASC" },
      }),
      this.managerRepository.find({
        where: { branchId: id },
        relations: { employee: true, createdByUser: true },
        order: { isPrimary: "DESC", effectiveFrom: "DESC" },
      }),
      this.branchDepartmentRepository.find({
        where: { branchId: id },
        relations: { department: true },
        order: { department: { name: "ASC" } },
      }),
      this.employeeRepository.find({
        where: { primaryBranchId: id, deletedAt: IsNull() },
        relations: { department: true, position: true, manager: true },
        order: { lastName: "ASC", firstName: "ASC" },
      }),
      this.shiftRepository.find({
        where: {
          branchId: id,
          startsAt: MoreThan(new Date()),
          deletedAt: IsNull(),
        },
        relations: { department: true, position: true },
        order: { startsAt: "ASC" },
        take: 50,
      }),
      actor.permissions.includes("branches.scope.manage")
        ? this.dataSource.getRepository(UserRole).find({
            where: { branchId: id },
            relations: { user: true, role: true },
            order: { grantedAt: "DESC" },
          })
        : Promise.resolve([]),
      actor.permissions.includes("audit.view")
        ? this.dataSource.getRepository(AuditLog).find({
            where: {
              entityType: In([
                "branch",
                "branch_geofence",
                "branch_operating_hours",
                "branch_manager",
              ]),
              entityId: id,
            },
            relations: { actorUser: true },
            order: { createdAt: "DESC" },
            take: 50,
          })
        : Promise.resolve([]),
    ]);
    return {
      ...summary,
      operatingHours: hours,
      operatingExceptions: exceptions,
      managers: managers.map((item) => ({
        ...item,
        employee: this.employeeView(item.employee),
        active:
          item.effectiveFrom <= today &&
          (!item.effectiveTo || item.effectiveTo >= today),
        createdByName: item.createdByUser?.displayName ?? "Hệ thống",
      })),
      departments: departments.map((item) => ({
        ...item,
        department: item.department,
      })),
      employees: employees.map((item) => ({
        ...this.employeeView(item),
        position: item.position
          ? { id: item.position.id, name: item.position.name }
          : null,
        manager: item.manager
          ? { id: item.manager.id, name: this.employeeName(item.manager) }
          : null,
      })),
      shifts: shifts.map((item) => ({
        id: item.id,
        name: item.name,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        status: item.status,
        department: item.department?.name ?? null,
        position: item.position?.name ?? null,
        requiredHeadcount: item.requiredHeadcount,
      })),
      scopes: scopedUsers.map((item) => ({
        id: item.id,
        userId: item.userId,
        userName: item.user.displayName,
        email: item.user.email,
        role: item.role.code,
        grantedAt: item.grantedAt,
      })),
      history: audits.map((item) => ({
        id: item.id,
        action: item.action,
        actor: item.actorUser?.displayName ?? "Hệ thống",
        oldValues: item.oldValues,
        newValues: item.newValues,
        createdAt: item.createdAt,
      })),
    };
  }

  async createBranch(dto: SaveBranchDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    this.validateBranch(dto);
    if (dto.geofenceEnabled || dto.latitude != null || dto.longitude != null) {
      this.requirePermission(actor, "branches.geofence.manage");
    }
    const code = dto.code.trim().toUpperCase();
    if (
      await this.branchRepository.findOneBy({
        organizationId: organization.id,
        code,
      })
    )
      throw new ConflictException("Mã chi nhánh đã tồn tại");
    return this.dataSource.transaction(async (manager) => {
      if (dto.isHeadOffice)
        await manager.update(
          Branch,
          { organizationId: organization.id, isHeadOffice: true },
          { isHeadOffice: false, updatedAt: new Date() },
        );
      const branch = await manager.save(
        Branch,
        manager.create(Branch, this.branchInput(organization.id, dto)),
      );
      const defaultHours = Array.from({ length: 7 }, (_, day) =>
        manager.create(BranchOperatingHour, {
          branchId: branch.id,
          dayOfWeek: day,
          isClosed: day === 0 || day === 6,
          opensAt: day === 0 || day === 6 ? null : "08:00",
          closesAt: day === 0 || day === 6 ? null : "17:00",
          spansNextDay: false,
        }),
      );
      await manager.save(BranchOperatingHour, defaultHours);
      await this.audit(
        manager,
        actor.id,
        "organization.branch.created",
        "branch",
        branch.id,
        null,
        branch,
      );
      return branch;
    });
  }

  async updateBranch(id: string, dto: SaveBranchDto, actor: AuthUser) {
    const branch = await this.getScopedBranch(id, actor);
    this.validateBranch(dto);
    const geofenceChanged =
      branch.geofenceEnabled !== dto.geofenceEnabled ||
      Number(branch.latitude) !== Number(dto.latitude) ||
      Number(branch.longitude) !== Number(dto.longitude) ||
      branch.geofenceRadiusM !== dto.geofenceRadiusM ||
      branch.locationAccuracyM !== dto.locationAccuracyM;
    if (geofenceChanged)
      this.requirePermission(actor, "branches.geofence.manage");
    if (dto.version && dto.version !== branch.version)
      throw new ConflictException(
        "Chi nhánh đã được người khác cập nhật. Hãy tải lại dữ liệu.",
      );
    const duplicate = await this.branchRepository.findOneBy({
      organizationId: branch.organizationId,
      code: dto.code.trim().toUpperCase(),
    });
    if (duplicate && duplicate.id !== id)
      throw new ConflictException("Mã chi nhánh đã tồn tại");
    return this.dataSource.transaction(async (manager) => {
      const old = { ...branch };
      if (dto.isHeadOffice)
        await manager
          .createQueryBuilder()
          .update(Branch)
          .set({ isHeadOffice: false, updatedAt: new Date() })
          .where("organization_id=:organizationId AND id<>:id", {
            organizationId: branch.organizationId,
            id,
          })
          .execute();
      Object.assign(branch, this.branchInput(branch.organizationId, dto), {
        updatedAt: new Date(),
      });
      const saved = await manager.save(Branch, branch);
      await this.audit(
        manager,
        actor.id,
        "organization.branch.updated",
        "branch",
        id,
        old,
        saved,
      );
      if (
        old.latitude !== saved.latitude ||
        old.longitude !== saved.longitude ||
        old.geofenceRadiusM !== saved.geofenceRadiusM ||
        old.geofenceEnabled !== saved.geofenceEnabled
      ) {
        await this.audit(
          manager,
          actor.id,
          "organization.branch.geofence_updated",
          "branch_geofence",
          id,
          {
            latitude: old.latitude,
            longitude: old.longitude,
            radiusM: old.geofenceRadiusM,
            enabled: old.geofenceEnabled,
          },
          {
            latitude: saved.latitude,
            longitude: saved.longitude,
            radiusM: saved.geofenceRadiusM,
            enabled: saved.geofenceEnabled,
          },
        );
      }
      return saved;
    });
  }

  async changeBranchStatus(
    id: string,
    active: boolean,
    dto: BranchStatusDto,
    actor: AuthUser,
  ) {
    const branch = await this.getScopedBranch(id, actor);
    if (branch.isActive === active) return branch;
    if (!active) {
      const [employees, shifts] = await Promise.all([
        this.employeeRepository.count({
          where: {
            primaryBranchId: id,
            employmentStatus: In(["active", "on_leave"]),
            deletedAt: IsNull(),
          },
        }),
        this.shiftRepository.count({
          where: {
            branchId: id,
            startsAt: MoreThan(new Date()),
            status: In(["draft", "published"]),
            deletedAt: IsNull(),
          },
        }),
      ]);
      if (employees || shifts)
        throw new BadRequestException(
          `Chưa thể ngừng chi nhánh: còn ${employees} nhân viên và ${shifts} ca tương lai cần xử lý`,
        );
      if (branch.isHeadOffice)
        throw new BadRequestException(
          "Không thể ngừng trụ sở chính trước khi chọn trụ sở chính khác",
        );
    }
    const old = { isActive: branch.isActive };
    branch.isActive = active;
    branch.updatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Branch, branch);
      await this.audit(
        manager,
        actor.id,
        active
          ? "organization.branch.reactivated"
          : "organization.branch.deactivated",
        "branch",
        id,
        old,
        { isActive: active, reason: dto.reason.trim() },
      );
    });
    return branch;
  }

  async saveOperatingHours(
    id: string,
    dto: SaveOperatingHoursDto,
    actor: AuthUser,
  ) {
    await this.getScopedBranch(id, actor);
    this.validateHours(dto);
    return this.dataSource.transaction(async (manager) => {
      const old = await manager.find(BranchOperatingHour, {
        where: { branchId: id },
        order: { dayOfWeek: "ASC" },
      });
      await manager.delete(BranchOperatingHour, { branchId: id });
      await manager.save(
        BranchOperatingHour,
        dto.hours.map((item) =>
          manager.create(BranchOperatingHour, {
            branchId: id,
            ...item,
            opensAt: item.isClosed ? null : item.opensAt,
            closesAt: item.isClosed ? null : item.closesAt,
            spansNextDay: item.isClosed ? false : Boolean(item.spansNextDay),
          }),
        ),
      );
      await manager.delete(BranchOperatingException, { branchId: id });
      if (dto.exceptions?.length)
        await manager.save(
          BranchOperatingException,
          dto.exceptions.map((item) =>
            manager.create(BranchOperatingException, {
              branchId: id,
              ...item,
              id: item.id,
              opensAt: item.isClosed ? null : item.opensAt,
              closesAt: item.isClosed ? null : item.closesAt,
              spansNextDay: item.isClosed ? false : Boolean(item.spansNextDay),
              note: item.note?.trim() || null,
            }),
          ),
        );
      const current = await manager.find(BranchOperatingHour, {
        where: { branchId: id },
        order: { dayOfWeek: "ASC" },
      });
      await this.audit(
        manager,
        actor.id,
        "organization.branch.operating_hours_updated",
        "branch_operating_hours",
        id,
        { hours: old },
        { hours: current, exceptions: dto.exceptions ?? [] },
      );
      return {
        hours: current,
        exceptions: await manager.find(BranchOperatingException, {
          where: { branchId: id },
          order: { exceptionDate: "ASC" },
        }),
      };
    });
  }

  async assignManager(
    branchId: string,
    dto: AssignBranchManagerDto,
    actor: AuthUser,
  ) {
    const branch = await this.getScopedBranch(branchId, actor);
    if (dto.grantManagerScope)
      this.requirePermission(actor, "branches.scope.manage");
    const employee = await this.employeeRepository.findOneBy({
      id: dto.employeeId,
      organizationId: branch.organizationId,
      employmentStatus: "active",
      deletedAt: IsNull(),
    });
    if (!employee)
      throw new BadRequestException(
        "Người quản lý phải là nhân viên đang hoạt động",
      );
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom)
      throw new BadRequestException("Ngày kết thúc không hợp lệ");
    const overlap = await this.managerRepository
      .createQueryBuilder("assignment")
      .where("assignment.branch_id = :branchId", { branchId })
      .andWhere("assignment.employee_id = :employeeId", {
        employeeId: employee.id,
      })
      .andWhere("lower(assignment.responsibility) = lower(:responsibility)", {
        responsibility: dto.responsibility.trim(),
      })
      .andWhere(
        "assignment.effective_from <= COALESCE(:effectiveTo, 'infinity'::date)",
        {
          effectiveTo: dto.effectiveTo ?? null,
        },
      )
      .andWhere(
        "assignment.effective_to IS NULL OR assignment.effective_to >= :effectiveFrom",
        {
          effectiveFrom: dto.effectiveFrom,
        },
      )
      .getOne();
    if (overlap)
      throw new ConflictException(
        "Nhân viên đã có phân công cùng trách nhiệm bị trùng thời gian tại chi nhánh",
      );
    return this.dataSource.transaction(async (manager) => {
      if (dto.isPrimary)
        await manager
          .createQueryBuilder()
          .update(BranchManagerAssignment)
          .set({ isPrimary: false })
          .where("branch_id=:branchId AND effective_to IS NULL", { branchId })
          .execute();
      const assignment = await manager.save(
        BranchManagerAssignment,
        manager.create(BranchManagerAssignment, {
          branchId,
          employeeId: employee.id,
          responsibility: dto.responsibility.trim(),
          isPrimary: dto.isPrimary,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo || null,
          createdBy: actor.id,
        }),
      );
      if (dto.grantManagerScope && employee.userId)
        await this.grantManagerScope(
          manager,
          employee.userId,
          branchId,
          actor.id,
        );
      await this.audit(
        manager,
        actor.id,
        "organization.branch.manager_assigned",
        "branch_manager",
        branchId,
        null,
        {
          assignmentId: assignment.id,
          employeeId: employee.id,
          grantManagerScope: dto.grantManagerScope,
        },
      );
      return assignment;
    });
  }

  async endManager(
    branchId: string,
    assignmentId: string,
    dto: EndBranchManagerDto,
    actor: AuthUser,
  ) {
    await this.getScopedBranch(branchId, actor);
    if (dto.revokeManagerScope)
      this.requirePermission(actor, "branches.scope.manage");
    const assignment = await this.managerRepository.findOne({
      where: { id: assignmentId, branchId },
      relations: { employee: true },
    });
    if (!assignment)
      throw new NotFoundException("Không tìm thấy phân công quản lý");
    if (dto.effectiveTo < assignment.effectiveFrom)
      throw new BadRequestException(
        "Ngày kết thúc không được trước ngày bắt đầu",
      );
    return this.dataSource.transaction(async (manager) => {
      assignment.effectiveTo = dto.effectiveTo;
      assignment.isPrimary = false;
      await manager.save(BranchManagerAssignment, assignment);
      if (dto.revokeManagerScope && assignment.employee.userId) {
        const managerRole = await manager.findOne(Role, {
          where: { code: "MANAGER" },
        });
        if (managerRole) {
          await manager.delete(UserRole, {
            userId: assignment.employee.userId,
            roleId: managerRole.id,
            branchId,
          });
        }
      }
      await this.audit(
        manager,
        actor.id,
        "organization.branch.manager_ended",
        "branch_manager",
        branchId,
        null,
        {
          assignmentId,
          effectiveTo: dto.effectiveTo,
          reason: dto.reason.trim(),
          revokeManagerScope: dto.revokeManagerScope,
        },
      );
      return assignment;
    });
  }

  async setBranchDepartments(
    branchId: string,
    dto: SetBranchDepartmentsDto,
    actor: AuthUser,
  ) {
    const branch = await this.getScopedBranch(branchId, actor);
    const ids = [...new Set(dto.departmentIds)];
    const departments = ids.length
      ? await this.departmentRepository.findBy({
          id: In(ids),
          organizationId: branch.organizationId,
          isActive: true,
          deletedAt: IsNull(),
        })
      : [];
    if (departments.length !== ids.length)
      throw new BadRequestException(
        "Danh sách phòng ban có mục không hợp lệ hoặc đã ngừng hoạt động",
      );
    const current = await this.branchDepartmentRepository.findBy({
      branchId,
      isActive: true,
    });
    const removed = current
      .filter((item) => !ids.includes(item.departmentId))
      .map((item) => item.departmentId);
    if (removed.length) {
      const affected = await this.employeeRepository.count({
        where: {
          primaryBranchId: branchId,
          departmentId: In(removed),
          employmentStatus: In(["active", "on_leave"]),
          deletedAt: IsNull(),
        },
      });
      if (affected)
        throw new BadRequestException(
          `Còn ${affected} nhân viên thuộc các phòng ban sắp gỡ khỏi chi nhánh`,
        );
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.update(
        BranchDepartment,
        { branchId },
        { isActive: false, effectiveTo: await this.today() },
      );
      for (const departmentId of ids) {
        const existing = await manager.findOne(BranchDepartment, {
          where: { branchId, departmentId },
        });
        await manager.save(
          BranchDepartment,
          existing
            ? Object.assign(existing, { isActive: true, effectiveTo: null })
            : manager.create(BranchDepartment, {
                branchId,
                departmentId,
                isActive: true,
                effectiveFrom: await this.today(),
                effectiveTo: null,
              }),
        );
      }
      await this.audit(
        manager,
        actor.id,
        "organization.branch.departments_updated",
        "branch",
        branchId,
        { departmentIds: current.map((item) => item.departmentId) },
        { departmentIds: ids },
      );
      return manager.find(BranchDepartment, {
        where: { branchId, isActive: true },
        relations: { department: true },
      });
    });
  }

  async grantBranchScope(
    branchId: string,
    dto: GrantBranchScopeDto,
    actor: AuthUser,
  ) {
    const branch = await this.getScopedBranch(branchId, actor);
    const employee = await this.employeeRepository.findOneBy({
      userId: dto.userId,
      organizationId: branch.organizationId,
      employmentStatus: In(["active", "on_leave"]),
      deletedAt: IsNull(),
    });
    if (!employee)
      throw new BadRequestException(
        "Tài khoản phải thuộc một nhân viên đang hoạt động trong doanh nghiệp",
      );
    const role = await this.dataSource.getRepository(Role).findOneBy({
      code: dto.roleCode,
    });
    if (!role) throw new BadRequestException("Vai trò chưa được cấu hình");
    const repository = this.dataSource.getRepository(UserRole);
    const existing = await repository.findOneBy({
      userId: dto.userId,
      roleId: role.id,
      branchId,
      departmentId: IsNull(),
    });
    if (existing)
      throw new ConflictException("Tài khoản đã có vai trò này tại chi nhánh");

    return this.dataSource.transaction(async (manager) => {
      const scope = await manager.save(
        UserRole,
        manager.create(UserRole, {
          userId: dto.userId,
          roleId: role.id,
          branchId,
          departmentId: null,
          grantedBy: actor.id,
        }),
      );
      await this.audit(
        manager,
        actor.id,
        "organization.branch.scope_granted",
        "branch",
        branchId,
        null,
        { scopeId: scope.id, userId: dto.userId, roleCode: role.code },
      );
      return scope;
    });
  }

  async revokeBranchScope(
    branchId: string,
    scopeId: string,
    dto: RevokeBranchScopeDto,
    actor: AuthUser,
  ) {
    await this.getScopedBranch(branchId, actor);
    const scope = await this.dataSource.getRepository(UserRole).findOne({
      where: { id: scopeId, branchId },
      relations: { role: true, user: true },
    });
    if (!scope) throw new NotFoundException("Không tìm thấy phạm vi quyền");
    if (scope.userId === actor.id)
      throw new BadRequestException(
        "Không thể tự thu hồi phạm vi quyền của tài khoản đang đăng nhập",
      );

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(UserRole, { id: scope.id });
      await this.audit(
        manager,
        actor.id,
        "organization.branch.scope_revoked",
        "branch",
        branchId,
        {
          scopeId: scope.id,
          userId: scope.userId,
          roleCode: scope.role.code,
        },
        { reason: dto.reason.trim() },
      );
      return { success: true };
    });
  }

  async getDepartments(query: OrganizationQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const scope = this.resolveScope(actor);
    const qb = this.departmentRepository
      .createQueryBuilder("department")
      .where(
        "department.organization_id=:organizationId AND department.deleted_at IS NULL",
        { organizationId: organization.id },
      );
    if (!scope.unrestricted) {
      const scopeConditions: string[] = [];
      if (scope.departmentIds.length) {
        scopeConditions.push("department.id IN (:...scopeDepartmentIds)");
        qb.setParameter("scopeDepartmentIds", scope.departmentIds);
      }
      if (scope.branchIds.length) {
        scopeConditions.push(
          "EXISTS (SELECT 1 FROM workforce.branch_departments scoped_bd WHERE scoped_bd.department_id = department.id AND scoped_bd.branch_id IN (:...scopeBranchIds) AND scoped_bd.is_active = true)",
        );
        qb.setParameter("scopeBranchIds", scope.branchIds);
      }
      if (!scopeConditions.length) {
        return {
          summary: { total: 0, active: 0, roots: 0, withoutEmployees: 0 },
          items: [],
          tree: [],
        };
      }
      qb.andWhere(`(${scopeConditions.join(" OR ")})`);
    }
    if (query.search?.trim())
      qb.andWhere(
        "(department.code ILIKE :search OR department.name ILIKE :search)",
        { search: `%${query.search.trim()}%` },
      );
    if (query.status === "active") qb.andWhere("department.is_active=true");
    if (query.status === "inactive") qb.andWhere("department.is_active=false");
    if (query.parentId)
      qb.andWhere("department.parent_id=:parentId", {
        parentId: query.parentId,
      });
    const departments = await qb.orderBy("department.name", "ASC").getMany();
    const items = await Promise.all(
      departments.map(async (department) => {
        const [employees, children, branches, positions] = await Promise.all([
          this.employeeRepository.count({
            where: {
              departmentId: department.id,
              employmentStatus: In(["active", "on_leave"]),
              deletedAt: IsNull(),
            },
          }),
          this.departmentRepository.count({
            where: { parentId: department.id, deletedAt: IsNull() },
          }),
          this.branchDepartmentRepository.find({
            where: { departmentId: department.id, isActive: true },
            relations: { branch: true },
          }),
          this.departmentPositionRepository.find({
            where: { departmentId: department.id, isActive: true },
            relations: { position: true },
          }),
        ]);
        return {
          ...department,
          counts: {
            employees,
            children,
            branches: branches.length,
            positions: positions.length,
          },
          branches: branches.map((item) => ({
            id: item.branch.id,
            name: item.branch.name,
          })),
          positions: positions.map((item) => ({
            id: item.position.id,
            name: item.position.name,
          })),
        };
      }),
    );
    return {
      summary: {
        total: items.length,
        active: items.filter((item) => item.isActive).length,
        roots: items.filter((item) => !item.parentId).length,
        withoutEmployees: items.filter((item) => item.counts.employees === 0)
          .length,
      },
      items,
      tree: this.departmentTree(items),
    };
  }

  async createDepartment(dto: SaveDepartmentDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.saveDepartment(null, organization.id, dto, actor);
  }
  async updateDepartment(id: string, dto: SaveDepartmentDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.saveDepartment(id, organization.id, dto, actor);
  }

  async moveDepartment(id: string, dto: MoveDepartmentDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const department = await this.departmentRepository.findOneBy({
      id,
      organizationId: organization.id,
      deletedAt: IsNull(),
    });
    if (!department) throw new NotFoundException("Không tìm thấy phòng ban");
    await this.assertValidParent(id, dto.parentId ?? null, organization.id);
    const old = department.parentId;
    department.parentId = dto.parentId ?? null;
    department.updatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Department, department);
      await this.audit(
        manager,
        actor.id,
        "organization.department.moved",
        "department",
        id,
        { parentId: old },
        { parentId: department.parentId },
      );
    });
    return department;
  }

  async changeDepartmentStatus(
    id: string,
    active: boolean,
    dto: BranchStatusDto,
    actor: AuthUser,
  ) {
    const organization = await this.resolveOrganization(actor);
    const department = await this.departmentRepository.findOneBy({
      id,
      organizationId: organization.id,
      deletedAt: IsNull(),
    });
    if (!department) throw new NotFoundException("Không tìm thấy phòng ban");
    if (!active) {
      const [employees, children] = await Promise.all([
        this.employeeRepository.count({
          where: {
            departmentId: id,
            employmentStatus: In(["active", "on_leave"]),
            deletedAt: IsNull(),
          },
        }),
        this.departmentRepository.count({
          where: { parentId: id, isActive: true, deletedAt: IsNull() },
        }),
      ]);
      if (employees || children)
        throw new BadRequestException(
          `Chưa thể ngừng phòng ban: còn ${employees} nhân viên và ${children} phòng ban con`,
        );
    }
    department.isActive = active;
    department.updatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Department, department);
      await this.audit(
        manager,
        actor.id,
        active
          ? "organization.department.reactivated"
          : "organization.department.deactivated",
        "department",
        id,
        null,
        { isActive: active, reason: dto.reason.trim() },
      );
    });
    return department;
  }

  async getPositions(query: OrganizationQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const scope = this.resolveScope(actor);
    const qb = this.positionRepository
      .createQueryBuilder("position")
      .where(
        "position.organization_id=:organizationId AND position.deleted_at IS NULL",
        { organizationId: organization.id },
      );
    if (!scope.unrestricted) {
      const scopeConditions: string[] = [];
      if (scope.departmentIds.length) {
        scopeConditions.push(
          "EXISTS (SELECT 1 FROM workforce.department_positions scoped_dp WHERE scoped_dp.position_id = position.id AND scoped_dp.department_id IN (:...scopeDepartmentIds) AND scoped_dp.is_active = true)",
        );
        scopeConditions.push(
          "EXISTS (SELECT 1 FROM workforce.employees scoped_employee WHERE scoped_employee.position_id = position.id AND scoped_employee.department_id IN (:...scopeDepartmentIds) AND scoped_employee.deleted_at IS NULL)",
        );
        qb.setParameter("scopeDepartmentIds", scope.departmentIds);
      }
      if (scope.branchIds.length) {
        scopeConditions.push(
          "EXISTS (SELECT 1 FROM workforce.department_positions scoped_dp JOIN workforce.branch_departments scoped_bd ON scoped_bd.department_id = scoped_dp.department_id AND scoped_bd.is_active = true WHERE scoped_dp.position_id = position.id AND scoped_dp.is_active = true AND scoped_bd.branch_id IN (:...scopeBranchIds))",
        );
        scopeConditions.push(
          "EXISTS (SELECT 1 FROM workforce.employees scoped_employee WHERE scoped_employee.position_id = position.id AND scoped_employee.primary_branch_id IN (:...scopeBranchIds) AND scoped_employee.deleted_at IS NULL)",
        );
        qb.setParameter("scopeBranchIds", scope.branchIds);
      }
      if (!scopeConditions.length) {
        return {
          summary: { total: 0, active: 0, managers: 0, unused: 0 },
          items: [],
        };
      }
      qb.andWhere(`(${scopeConditions.join(" OR ")})`);
    }
    if (query.search?.trim())
      qb.andWhere(
        "(position.code ILIKE :search OR position.name ILIKE :search)",
        { search: `%${query.search.trim()}%` },
      );
    if (query.status === "active") qb.andWhere("position.is_active=true");
    if (query.status === "inactive") qb.andWhere("position.is_active=false");
    const positions = await qb.orderBy("position.name", "ASC").getMany();
    const items = await Promise.all(
      positions.map(async (position) => {
        const [employees, shifts, departments] = await Promise.all([
          this.employeeRepository.count({
            where: {
              positionId: position.id,
              employmentStatus: In(["active", "on_leave"]),
              deletedAt: IsNull(),
            },
          }),
          this.shiftRepository.count({
            where: {
              positionId: position.id,
              startsAt: MoreThan(new Date()),
              status: In(["draft", "published"]),
              deletedAt: IsNull(),
            },
          }),
          this.departmentPositionRepository.find({
            where: { positionId: position.id, isActive: true },
            relations: { department: true },
          }),
        ]);
        return {
          ...position,
          counts: { employees, shifts, departments: departments.length },
          departments: departments.map((item) => ({
            id: item.department.id,
            name: item.department.name,
          })),
        };
      }),
    );
    return {
      summary: {
        total: items.length,
        active: items.filter((item) => item.isActive).length,
        managers: items.filter((item) => item.isManager).length,
        unused: items.filter((item) => item.counts.employees === 0).length,
      },
      items,
    };
  }

  async createPosition(dto: SavePositionDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.savePosition(null, organization.id, dto, actor);
  }
  async updatePosition(id: string, dto: SavePositionDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.savePosition(id, organization.id, dto, actor);
  }
  async changePositionStatus(
    id: string,
    active: boolean,
    dto: BranchStatusDto,
    actor: AuthUser,
  ) {
    const organization = await this.resolveOrganization(actor);
    const position = await this.positionRepository.findOneBy({
      id,
      organizationId: organization.id,
      deletedAt: IsNull(),
    });
    if (!position) throw new NotFoundException("Không tìm thấy vị trí");
    if (!active) {
      const [employees, shifts] = await Promise.all([
        this.employeeRepository.count({
          where: {
            positionId: id,
            employmentStatus: In(["active", "on_leave"]),
            deletedAt: IsNull(),
          },
        }),
        this.shiftRepository.count({
          where: {
            positionId: id,
            startsAt: MoreThan(new Date()),
            status: In(["draft", "published"]),
            deletedAt: IsNull(),
          },
        }),
      ]);
      if (employees || shifts)
        throw new BadRequestException(
          `Chưa thể ngừng vị trí: còn ${employees} nhân viên và ${shifts} ca tương lai`,
        );
    }
    position.isActive = active;
    position.updatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Position, position);
      await this.audit(
        manager,
        actor.id,
        active
          ? "organization.position.reactivated"
          : "organization.position.deactivated",
        "position",
        id,
        null,
        { isActive: active, reason: dto.reason.trim() },
      );
    });
    return position;
  }

  private async saveDepartment(
    id: string | null,
    organizationId: string,
    dto: SaveDepartmentDto,
    actor: AuthUser,
  ) {
    const current = id
      ? await this.departmentRepository.findOneBy({
          id,
          organizationId,
          deletedAt: IsNull(),
        })
      : null;
    if (id && !current) throw new NotFoundException("Không tìm thấy phòng ban");
    const duplicate = await this.departmentRepository.findOneBy({
      organizationId,
      code: dto.code.trim().toUpperCase(),
    });
    if (duplicate && duplicate.id !== id)
      throw new ConflictException("Mã phòng ban đã tồn tại");
    await this.assertValidParent(id, dto.parentId ?? null, organizationId);
    return this.dataSource.transaction(async (manager) => {
      const old = current ? { ...current } : null;
      const department =
        current ?? manager.create(Department, { organizationId });
      Object.assign(department, {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        updatedAt: new Date(),
      });
      const saved = await manager.save(Department, department);
      if (dto.branchIds) {
        const branches = dto.branchIds.length
          ? await manager.find(Branch, {
              where: {
                id: In(dto.branchIds),
                organizationId,
                isActive: true,
                deletedAt: IsNull(),
              },
            })
          : [];
        if (branches.length !== new Set(dto.branchIds).size)
          throw new BadRequestException("Danh sách chi nhánh không hợp lệ");
        await manager.update(
          BranchDepartment,
          { departmentId: saved.id },
          { isActive: false, effectiveTo: await this.today() },
        );
        for (const branch of branches) {
          const link = await manager.findOne(BranchDepartment, {
            where: { branchId: branch.id, departmentId: saved.id },
          });
          await manager.save(
            BranchDepartment,
            link
              ? Object.assign(link, { isActive: true, effectiveTo: null })
              : manager.create(BranchDepartment, {
                  branchId: branch.id,
                  departmentId: saved.id,
                  effectiveFrom: await this.today(),
                  isActive: true,
                }),
          );
        }
      }
      await this.audit(
        manager,
        actor.id,
        current
          ? "organization.department.updated"
          : "organization.department.created",
        "department",
        saved.id,
        old,
        saved,
      );
      return saved;
    });
  }

  private async savePosition(
    id: string | null,
    organizationId: string,
    dto: SavePositionDto,
    actor: AuthUser,
  ) {
    const current = id
      ? await this.positionRepository.findOneBy({
          id,
          organizationId,
          deletedAt: IsNull(),
        })
      : null;
    if (id && !current) throw new NotFoundException("Không tìm thấy vị trí");
    const duplicate = await this.positionRepository.findOneBy({
      organizationId,
      code: dto.code.trim().toUpperCase(),
    });
    if (duplicate && duplicate.id !== id)
      throw new ConflictException("Mã vị trí đã tồn tại");
    return this.dataSource.transaction(async (manager) => {
      const old = current ? { ...current } : null;
      const position = current ?? manager.create(Position, { organizationId });
      Object.assign(position, {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isManager: dto.isManager,
        isActive: dto.isActive ?? true,
        updatedAt: new Date(),
      });
      const saved = await manager.save(Position, position);
      if (dto.departmentIds) {
        const departments = dto.departmentIds.length
          ? await manager.find(Department, {
              where: {
                id: In(dto.departmentIds),
                organizationId,
                isActive: true,
                deletedAt: IsNull(),
              },
            })
          : [];
        if (departments.length !== new Set(dto.departmentIds).size)
          throw new BadRequestException("Danh sách phòng ban không hợp lệ");
        await manager.delete(DepartmentPosition, { positionId: saved.id });
        if (departments.length)
          await manager.save(
            DepartmentPosition,
            departments.map((department) =>
              manager.create(DepartmentPosition, {
                positionId: saved.id,
                departmentId: department.id,
                isActive: true,
              }),
            ),
          );
      }
      await this.audit(
        manager,
        actor.id,
        current
          ? "organization.position.updated"
          : "organization.position.created",
        "position",
        saved.id,
        old,
        saved,
      );
      return saved;
    });
  }

  private async branchSummary(branch: Branch) {
    const today = await this.today();
    const [employees, departments, shifts, manager] = await Promise.all([
      this.employeeRepository.count({
        where: {
          primaryBranchId: branch.id,
          employmentStatus: In(["active", "on_leave"]),
          deletedAt: IsNull(),
        },
      }),
      this.branchDepartmentRepository.count({
        where: { branchId: branch.id, isActive: true },
      }),
      this.shiftRepository.count({
        where: {
          branchId: branch.id,
          startsAt: MoreThan(new Date()),
          status: In(["draft", "published"]),
          deletedAt: IsNull(),
        },
      }),
      this.managerRepository
        .createQueryBuilder("assignment")
        .leftJoinAndSelect("assignment.employee", "employee")
        .where(
          "assignment.branch_id=:id AND assignment.effective_from<=:today AND (assignment.effective_to IS NULL OR assignment.effective_to>=:today)",
          { id: branch.id, today },
        )
        .orderBy("assignment.is_primary", "DESC")
        .getOne(),
    ]);
    const warnings: string[] = [];
    if (!branch.geofenceEnabled) warnings.push("Chưa bật geofence");
    if (
      !branch.openingTime &&
      !(await this.hoursRepository.count({ where: { branchId: branch.id } }))
    )
      warnings.push("Chưa có giờ hoạt động");
    if (!manager) warnings.push("Chưa có quản lý");
    return {
      ...branch,
      latitude: branch.latitude == null ? null : Number(branch.latitude),
      longitude: branch.longitude == null ? null : Number(branch.longitude),
      manager: manager ? this.employeeView(manager.employee) : null,
      counts: { employees, departments, shifts },
      warnings,
    };
  }

  private validateBranch(dto: SaveBranchDto) {
    try {
      new Intl.DateTimeFormat("vi-VN", { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException("Múi giờ không hợp lệ");
    }
    if (dto.geofenceEnabled && (dto.latitude == null || dto.longitude == null))
      throw new BadRequestException("Cần đủ tọa độ khi bật geofence");
    if ((dto.latitude == null) !== (dto.longitude == null))
      throw new BadRequestException(
        "Vĩ độ và kinh độ phải được nhập cùng nhau",
      );
  }
  private branchInput(organizationId: string, dto: SaveBranchDto) {
    return {
      organizationId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      email: dto.email?.trim() || null,
      phone: dto.phone?.trim() || null,
      addressLine: dto.addressLine.trim(),
      ward: dto.ward?.trim() || null,
      district: dto.district?.trim() || null,
      province: dto.province?.trim() || null,
      countryCode: (dto.countryCode ?? "VN").toUpperCase(),
      postalCode: dto.postalCode?.trim() || null,
      branchType: dto.branchType,
      latitude: dto.latitude == null ? null : String(dto.latitude),
      longitude: dto.longitude == null ? null : String(dto.longitude),
      geofenceEnabled: dto.geofenceEnabled,
      geofenceRadiusM: dto.geofenceRadiusM,
      locationAccuracyM: dto.locationAccuracyM,
      timezone: dto.timezone,
      isHeadOffice: dto.isHeadOffice,
      isActive: dto.isActive ?? true,
      notes: dto.notes?.trim() || null,
      updatedAt: new Date(),
      deletedAt: null,
    } as Partial<Branch>;
  }
  private validateHours(dto: SaveOperatingHoursDto) {
    if (
      dto.hours.length !== 7 ||
      new Set(dto.hours.map((item) => item.dayOfWeek)).size !== 7 ||
      dto.hours.some((item) => item.dayOfWeek < 0 || item.dayOfWeek > 6)
    )
      throw new BadRequestException("Lịch hoạt động phải có đủ 7 ngày");
    for (const item of [...dto.hours, ...(dto.exceptions ?? [])]) {
      if (!item.isClosed && (!item.opensAt || !item.closesAt))
        throw new BadRequestException("Ngày mở cửa cần có giờ mở và đóng");
      if (
        !item.isClosed &&
        !item.spansNextDay &&
        item.closesAt! <= item.opensAt!
      )
        throw new BadRequestException(
          "Giờ đóng phải sau giờ mở nếu không phải khung qua đêm",
        );
    }
  }
  private async assertValidParent(
    id: string | null,
    parentId: string | null,
    organizationId: string,
  ) {
    if (!parentId) return;
    if (parentId === id)
      throw new BadRequestException("Phòng ban không thể là cha của chính nó");
    const parent = await this.departmentRepository.findOneBy({
      id: parentId,
      organizationId,
      isActive: true,
      deletedAt: IsNull(),
    });
    if (!parent) throw new BadRequestException("Phòng ban cha không hợp lệ");
    if (!id) return;
    let cursor: Department | null = parent;
    let depth = 1;
    while (cursor?.parentId) {
      if (cursor.parentId === id)
        throw new BadRequestException(
          "Không thể tạo vòng lặp trong cơ cấu phòng ban",
        );
      cursor = await this.departmentRepository.findOneBy({
        id: cursor.parentId,
        organizationId,
        deletedAt: IsNull(),
      });
      depth += 1;
      if (depth >= 5)
        throw new BadRequestException("Cơ cấu phòng ban tối đa 5 cấp");
    }
  }
  private departmentTree<T extends { id: string; parentId: string | null }>(
    items: T[],
  ) {
    const map = new Map(
      items.map((item) => [item.id, { ...item, children: [] as unknown[] }]),
    );
    const roots: unknown[] = [];
    map.forEach((item) => {
      if (item.parentId && map.has(item.parentId))
        map.get(item.parentId)!.children.push(item);
      else roots.push(item);
    });
    return roots;
  }
  private async grantManagerScope(
    manager: EntityManager,
    userId: string,
    branchId: string,
    grantedBy: string,
  ) {
    const role = await manager.findOne(Role, { where: { code: "MANAGER" } });
    if (!role) throw new BadRequestException("Role MANAGER chưa được cấu hình");
    const exists = await manager.findOne(UserRole, {
      where: { userId, roleId: role.id, branchId },
    });
    if (!exists)
      await manager.save(
        UserRole,
        manager.create(UserRole, {
          userId,
          roleId: role.id,
          branchId,
          departmentId: null,
          grantedBy,
        }),
      );
  }
  private async getScopedBranch(id: string, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const branch = await this.branchRepository.findOneBy({
      id,
      organizationId: organization.id,
      deletedAt: IsNull(),
    });
    if (!branch) throw new NotFoundException("Không tìm thấy chi nhánh");
    const scope = this.resolveScope(actor);
    if (!scope.unrestricted && !scope.branchIds.includes(id))
      throw new ForbiddenException("Không có quyền truy cập chi nhánh này");
    return branch;
  }
  private requirePermission(actor: AuthUser, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException(`Thiếu quyền ${permission}`);
  }
  private resolveScope(actor: AuthUser): Scope {
    const codes = new Set(actor.roles.map((role) => role.code));
    if (
      codes.has("SUPER_ADMIN") ||
      codes.has("ADMIN") ||
      codes.has("HR") ||
      codes.has("PAYROLL")
    )
      return { unrestricted: true, branchIds: [], departmentIds: [] };
    return {
      unrestricted: false,
      branchIds: [
        ...new Set(
          actor.roles.flatMap((role) => (role.branchId ? [role.branchId] : [])),
        ),
      ],
      departmentIds: [
        ...new Set(
          actor.roles.flatMap((role) =>
            role.departmentId ? [role.departmentId] : [],
          ),
        ),
      ],
    };
  }
  private async resolveOrganization(actor: AuthUser) {
    if (actor.employeeId) {
      const employee = await this.employeeRepository.findOne({
        where: { id: actor.employeeId, deletedAt: IsNull() },
        relations: { organization: true },
      });
      if (employee) return employee.organization;
    }
    const organization = await this.organizationRepository
      .createQueryBuilder("organization")
      .orderBy("organization.created_at", "ASC")
      .getOne();
    if (!organization)
      throw new BadRequestException("Doanh nghiệp chưa được cấu hình");
    return organization;
  }
  private employeeView(employee: Employee) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: this.employeeName(employee),
      userId: employee.userId,
      departmentId: employee.departmentId,
      branchId: employee.primaryBranchId,
      employmentStatus: employee.employmentStatus,
    };
  }
  private employeeName(employee: Employee) {
    return (
      employee.preferredName ||
      `${employee.lastName} ${employee.firstName}`.trim()
    );
  }
  private async today() {
    const organization = await this.organizationRepository
      .createQueryBuilder("organization")
      .orderBy("organization.created_at", "ASC")
      .getOne();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: organization?.timezone ?? "UTC",
    }).format(new Date());
  }
  private async audit(
    manager: EntityManager,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
  ) {
    await manager.save(
      AuditLog,
      manager.create(AuditLog, {
        actorUserId,
        action,
        entityType,
        entityId,
        oldValues: oldValues as Record<string, unknown> | null,
        newValues: newValues as Record<string, unknown> | null,
      }),
    );
  }
}
