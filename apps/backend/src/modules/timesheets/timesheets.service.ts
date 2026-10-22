import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AttendanceRecord } from '../attendance/entities/attendance-record.entity';
import { Organization } from '../core/entities/organization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { ShiftAssignment } from '../schedules/entities/shift-assignment.entity';
import { EmployeePayroll } from '../payroll/entities/employee-payroll.entity';
import { AdjustTimesheetDto, GenerateTimesheetsDto, TimesheetActionDto } from './dto/timesheet-actions.dto';
import { TimesheetReportQueryDto } from './dto/timesheet-report-query.dto';
import { TimesheetAdjustment } from './entities/timesheet-adjustment.entity';
import { TimesheetApprovalHistory } from './entities/timesheet-approval-history.entity';
import { TimesheetEntry } from './entities/timesheet-entry.entity';
import { TimesheetPeriod } from './entities/timesheet-period.entity';
import { Timesheet } from './entities/timesheet.entity';

type TimesheetScope = {
  unrestricted: boolean;
  selfEmployeeId: string | null;
  branchIds: string[];
  departmentIds: string[];
};

type ReportEntry = {
  key: string;
  attendanceRecordId: string | null;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  departmentId: string | null;
  departmentName: string;
  shiftId: string | null;
  shiftName: string;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  actualCheckInAt: Date | null;
  actualCheckOutAt: Date | null;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  regularMinutes: number;
  overtimeCandidateMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  state: 'complete' | 'incomplete' | 'absent' | 'scheduled' | 'outside_schedule' | 'adjusted';
  warnings: string[];
  adjustment: { reason: string; adjustedAt: Date } | null;
};

type Aggregate = {
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  regularMinutes: number;
  overtimeCandidateMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  entries: number;
  issues: number;
};

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Branch) private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department) private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(AttendanceRecord) private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(TimesheetPeriod) private readonly periodRepository: Repository<TimesheetPeriod>,
    @InjectRepository(Timesheet) private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetEntry) private readonly entryRepository: Repository<TimesheetEntry>,
    @InjectRepository(TimesheetAdjustment) private readonly adjustmentRepository: Repository<TimesheetAdjustment>,
    @InjectRepository(TimesheetApprovalHistory) private readonly approvalHistoryRepository: Repository<TimesheetApprovalHistory>,
    @InjectRepository(AuditLog) private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(EmployeePayroll) private readonly employeePayrollRepository: Repository<EmployeePayroll>,
    private readonly dataSource: DataSource,
  ) {}

  async getReport(query: TimesheetReportQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const range = this.resolveRange(query, organization.timezone);
    const scope = await this.resolveScope(actor);
    const [assignments, records, period, branches, departments] = await Promise.all([
      this.findAssignments(organization.id, range, query, scope),
      this.findAttendanceRecords(organization.id, range, query, scope),
      this.periodRepository.findOneBy({ organizationId: organization.id, startsOn: range.from, endsOn: range.to }),
      this.branchRepository.find({ where: { organizationId: organization.id, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      this.departmentRepository.find({ where: { organizationId: organization.id, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
    ]);

    const persistedTimesheets = period ? await this.timesheetRepository.findBy({ periodId: period.id }) : [];
    const statusByEmployee = new Map(persistedTimesheets.map((item) => [item.employeeId, item]));
    const timesheetIds = persistedTimesheets.map((item) => item.id);
    const [adjustments, snapshotEntries] = timesheetIds.length ? await Promise.all([
      this.adjustmentRepository.findBy({ timesheetId: In(timesheetIds) }),
      this.entryRepository.findBy({ timesheetId: In(timesheetIds) }),
    ]) : [[], []];
    const adjustmentsBySource = new Map(adjustments.map((item) => [`${item.timesheetId}:${item.sourceKey}`, item]));
    const recordByAssignment = new Map<string, AttendanceRecord>();
    records.forEach((record) => {
      if (!record.shiftAssignmentId) return;
      const current = recordByAssignment.get(record.shiftAssignmentId);
      if (!current || record.updatedAt > current.updatedAt) recordByAssignment.set(record.shiftAssignmentId, record);
    });

    const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
    let sourceEntries = [
      ...assignments.map((assignment) => this.assignmentEntry(assignment, recordByAssignment.get(assignment.id) ?? null, organization.timezone)),
      ...records.filter((record) => !record.shiftAssignmentId || !assignmentIds.has(record.shiftAssignmentId))
        .map((record) => this.outsideScheduleEntry(record)),
    ].sort((a, b) => a.workDate.localeCompare(b.workDate)
      || (a.scheduledStartAt?.getTime() ?? a.actualCheckInAt?.getTime() ?? 0) - (b.scheduledStartAt?.getTime() ?? b.actualCheckInAt?.getTime() ?? 0)
      || a.employeeName.localeCompare(b.employeeName, 'vi'));
    const lockedTimesheets = persistedTimesheets.filter((item) => item.status === 'locked');
    if (lockedTimesheets.length) {
      const lockedEmployeeIds = new Set(lockedTimesheets.map((item) => item.employeeId));
      const timesheetById = new Map(lockedTimesheets.map((item) => [item.id, item]));
      const lockedEntries = snapshotEntries
        .flatMap((item) => (item.snapshotData ?? []).map((snapshot) => this.hydrateSnapshot(snapshot, timesheetById.get(item.timesheetId)?.employeeId)))
        .filter((entry) => this.snapshotMatches(entry, query, scope));
      sourceEntries = [...sourceEntries.filter((entry) => !lockedEmployeeIds.has(entry.employeeId)), ...lockedEntries]
        .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeName.localeCompare(b.employeeName, 'vi'));
    }
    const entries = sourceEntries.map((entry) => {
      const timesheet = statusByEmployee.get(entry.employeeId);
      const adjustment = timesheet ? adjustmentsBySource.get(`${timesheet.id}:${entry.key}`) : undefined;
      if (!adjustment) return entry;
      return {
        ...entry,
        breakMinutes: adjustment.breakMinutes,
        regularMinutes: adjustment.regularMinutes,
        overtimeMinutes: adjustment.overtimeMinutes,
        state: 'adjusted' as const,
        warnings: entry.warnings.filter((warning) => ['LATE', 'EARLY_LEAVE'].includes(warning)),
        adjustment: { reason: adjustment.reason, adjustedAt: adjustment.updatedAt },
      };
    });

    const employeeGroups = this.group(entries, (entry) => entry.employeeId).map(([employeeId, employeeEntries]) => {
      const branches = new Map(employeeEntries.map((entry) => [entry.branchId, entry.branchName]));
      const departments = new Map(employeeEntries.map((entry) => [entry.departmentId ?? 'unassigned', entry.departmentName]));
      return {
        employee: {
          id: employeeId,
          employeeCode: employeeEntries[0].employeeCode,
          fullName: employeeEntries[0].employeeName,
          branch: branches.size === 1
            ? { id: employeeEntries[0].branchId, name: employeeEntries[0].branchName }
            : { id: '', name: `${branches.size} chi nhánh` },
          department: departments.size === 1
            ? { id: employeeEntries[0].departmentId, name: employeeEntries[0].departmentName }
            : { id: null, name: `${departments.size} phòng ban` },
        },
        id: statusByEmployee.get(employeeId)?.id ?? null,
        status: statusByEmployee.get(employeeId)?.status ?? 'unpersisted',
        totals: this.aggregate(employeeEntries),
        entries: employeeEntries,
      };
    }).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName, 'vi'));

    return {
      generatedAt: new Date(),
      range: { ...range, timezone: organization.timezone },
      period: period ? { id: period.id, name: period.name, status: period.status } : null,
      summary: { employees: employeeGroups.length, ...this.aggregate(entries) },
      options: {
        branches: branches.filter((branch) => this.inBranchScope(branch.id, scope)).map(({ id, code, name }) => ({ id, code, name })),
        departments: departments.filter((department) => this.inDepartmentScope(department.id, scope)).map(({ id, code, name }) => ({ id, code, name })),
        employees: employeeGroups.map(({ employee }) => ({ id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName })),
      },
      timesheets: employeeGroups,
      byDay: this.aggregateBy(entries, (entry) => entry.workDate, (key) => this.dateLabel(key)),
      byWeek: this.aggregateBy(entries, (entry) => this.weekKey(entry.workDate), (key) => `Tuần từ ${this.dateLabel(key)}`),
      byMonth: this.aggregateBy(entries, (entry) => entry.workDate.slice(0, 7), (key) => this.monthLabel(key)),
      byDepartment: this.aggregateDimension(entries, (entry) => entry.departmentId ?? 'unassigned', (entry) => entry.departmentName),
      byBranch: this.aggregateDimension(entries, (entry) => entry.branchId, (entry) => entry.branchName),
      byShift: this.aggregateDimension(entries, (entry) => entry.shiftId ?? 'outside-schedule', (entry) => entry.shiftName),
    };
  }

  async generate(dto: GenerateTimesheetsDto, actor: AuthUser) {
    const report = await this.getReport(dto, actor);
    if (!report.timesheets.length) throw new BadRequestException('Không có dữ liệu để tổng hợp bảng công trong kỳ đã chọn');
    const organization = await this.resolveOrganization(actor);
    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const periodRepository = manager.getRepository(TimesheetPeriod);
      let period = await periodRepository.findOneBy({ organizationId: organization.id, startsOn: dto.from, endsOn: dto.to });
      if (period?.status === 'locked') throw new BadRequestException('Kỳ công đã khóa, không thể tổng hợp lại');
      period ??= periodRepository.create({
        organizationId: organization.id,
        name: `Bảng công ${this.dateLabel(dto.from)} - ${this.dateLabel(dto.to)}`,
        startsOn: dto.from,
        endsOn: dto.to,
        status: 'processing',
        lockedAt: null,
        lockedBy: null,
      });
      period.status = 'processing';
      period.updatedAt = now;
      period = await periodRepository.save(period);

      for (const item of report.timesheets) {
        const timesheetRepository = manager.getRepository(Timesheet);
        let timesheet = await timesheetRepository.findOneBy({ periodId: period.id, employeeId: item.employee.id });
        if (timesheet && ['approved', 'locked'].includes(timesheet.status)) continue;
        const previousStatus = timesheet?.status ?? null;
        timesheet ??= timesheetRepository.create({ periodId: period.id, employeeId: item.employee.id });
        Object.assign(timesheet, {
          status: 'draft',
          scheduledMinutes: item.totals.scheduledMinutes,
          workedMinutes: item.totals.workedMinutes,
          breakMinutes: item.totals.breakMinutes,
          regularMinutes: item.totals.regularMinutes,
          overtimeMinutes: item.totals.overtimeMinutes,
          paidLeaveMinutes: 0,
          unpaidLeaveMinutes: 0,
          lateMinutes: item.totals.lateMinutes,
          earlyLeaveMinutes: item.totals.earlyLeaveMinutes,
          submittedAt: null,
          approvedBy: null,
          approvedAt: null,
          lockedAt: null,
          updatedAt: now,
        });
        timesheet = await timesheetRepository.save(timesheet);

        await manager.getRepository(TimesheetEntry).delete({ timesheetId: timesheet.id });
        const grouped = this.group(item.entries, (entry) => entry.attendanceRecordId ?? `date:${entry.workDate}`);
        const snapshots = grouped.map(([, groupEntries]) => {
          const totals = this.aggregate(groupEntries);
          return manager.getRepository(TimesheetEntry).create({
            timesheetId: timesheet.id,
            attendanceRecordId: groupEntries[0].attendanceRecordId,
            workDate: groupEntries[0].workDate,
            entryType: 'work',
            scheduledMinutes: totals.scheduledMinutes,
            workedMinutes: totals.workedMinutes,
            breakMinutes: totals.breakMinutes,
            regularMinutes: totals.regularMinutes,
            overtimeMinutes: totals.overtimeMinutes,
            note: JSON.stringify({ sourceKeys: groupEntries.map((entry) => entry.key), states: groupEntries.map((entry) => entry.state), warnings: [...new Set(groupEntries.flatMap((entry) => entry.warnings))] }),
            snapshotData: groupEntries.map((entry) => this.serializeSnapshot(entry)),
            updatedAt: now,
          });
        });
        if (snapshots.length) await manager.getRepository(TimesheetEntry).save(snapshots);
        await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
          actorUserId: actor.id,
          action: previousStatus ? 'timesheet_regenerated' : 'timesheet_generated',
          entityType: 'timesheet',
          entityId: timesheet.id,
          oldValues: previousStatus ? { status: previousStatus } : null,
          newValues: { status: 'draft', from: dto.from, to: dto.to, totals: item.totals },
        }));
      }
    });
    return this.getReport(dto, actor);
  }

  async adjust(id: string, dto: AdjustTimesheetDto, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    if (!['draft', 'rejected'].includes(timesheet.status)) throw new BadRequestException('Chỉ được điều chỉnh bảng công nháp hoặc đã trả lại');
    const report = await this.getReport({ from: timesheet.period.startsOn, to: timesheet.period.endsOn, employeeId: timesheet.employeeId }, actor);
    const source = report.timesheets[0]?.entries.find((entry) => entry.key === dto.sourceKey && entry.workDate === dto.workDate);
    if (!source) throw new NotFoundException('Không tìm thấy dòng công cần điều chỉnh trong phạm vi kỳ công');
    const existing = await this.adjustmentRepository.findOneBy({ timesheetId: id, sourceKey: dto.sourceKey });
    const oldValues = existing ? this.adjustmentValues(existing) : {
      sourceKey: source.key,
      workDate: source.workDate,
      breakMinutes: source.breakMinutes,
      regularMinutes: source.regularMinutes,
      overtimeMinutes: source.overtimeMinutes,
    };
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const adjustment = existing ?? manager.getRepository(TimesheetAdjustment).create({ timesheetId: id, sourceKey: dto.sourceKey, workDate: dto.workDate });
      Object.assign(adjustment, {
        breakMinutes: dto.breakMinutes,
        regularMinutes: dto.regularMinutes,
        overtimeMinutes: dto.overtimeMinutes,
        reason: dto.reason.trim(),
        adjustedBy: actor.id,
        updatedAt: now,
      });
      await manager.getRepository(TimesheetAdjustment).save(adjustment);
      if (timesheet.status === 'rejected') {
        timesheet.status = 'draft';
        timesheet.approvedAt = null;
        timesheet.approvedBy = null;
        timesheet.updatedAt = now;
        await manager.getRepository(Timesheet).save(timesheet);
      }
      await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
        actorUserId: actor.id,
        action: existing ? 'timesheet_adjustment_updated' : 'timesheet_adjusted',
        entityType: 'timesheet',
        entityId: id,
        oldValues,
        newValues: { sourceKey: dto.sourceKey, workDate: dto.workDate, breakMinutes: dto.breakMinutes, regularMinutes: dto.regularMinutes, overtimeMinutes: dto.overtimeMinutes, reason: dto.reason.trim() },
      }));
    });
    await this.refreshTimesheetTotals(id, actor);
    return this.getReport({ from: timesheet.period.startsOn, to: timesheet.period.endsOn, employeeId: timesheet.employeeId }, actor);
  }

  async approve(id: string, dto: TimesheetActionDto, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    if (!['draft', 'pending_approval', 'rejected'].includes(timesheet.status)) throw new BadRequestException('Bảng công không ở trạng thái có thể duyệt');
    const today = this.dateInTimezone(new Date(), timesheet.employee.organization.timezone);
    if (timesheet.period.endsOn >= today) throw new BadRequestException('Chỉ được duyệt sau khi kỳ công đã kết thúc');
    const report = await this.getReport({ from: timesheet.period.startsOn, to: timesheet.period.endsOn, employeeId: timesheet.employeeId }, actor);
    const blocking = report.timesheets[0]?.entries.filter((entry) => (
      ['incomplete', 'outside_schedule', 'scheduled'].includes(entry.state)
      || (entry.overtimeCandidateMinutes > 0 && !entry.adjustment)
    )) ?? [];
    if (blocking.length) throw new BadRequestException(`Còn ${blocking.length} dòng công chưa hoàn chỉnh hoặc overtime chưa được xử lý`);
    await this.changeStatus(timesheet, 'approved', dto.note, actor, { approvedBy: actor.id, approvedAt: new Date(), submittedAt: timesheet.submittedAt ?? new Date() }, 'timesheet_approved');
    return { id, status: 'approved' };
  }

  async returnTimesheet(id: string, dto: TimesheetActionDto, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    if (timesheet.status === 'locked') throw new BadRequestException('Phải mở khóa trước khi trả lại bảng công');
    if (!['draft', 'pending_approval', 'approved'].includes(timesheet.status)) throw new BadRequestException('Bảng công không ở trạng thái có thể trả lại');
    await this.changeStatus(timesheet, 'rejected', dto.note, actor, { approvedBy: null, approvedAt: null }, 'timesheet_rejected');
    return { id, status: 'rejected' };
  }

  async lock(id: string, dto: TimesheetActionDto, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    if (timesheet.status !== 'approved') throw new BadRequestException('Chỉ được khóa bảng công đã duyệt');
    const now = new Date();
    const report = await this.getReport({ from: timesheet.period.startsOn, to: timesheet.period.endsOn, employeeId: timesheet.employeeId }, actor);
    const item = report.timesheets[0];
    if (!item) throw new BadRequestException('Không thể tạo snapshot bảng công');
    await this.saveTimesheetSnapshot(timesheet, item.entries, item.totals);
    await this.changeStatus(timesheet, 'locked', dto.note, actor, { lockedAt: now }, 'timesheet_locked');
    const remaining = await this.timesheetRepository.count({ where: { periodId: timesheet.periodId, status: In(['draft', 'employee_confirmed', 'pending_approval', 'approved', 'rejected']) } });
    if (remaining === 0) await this.periodRepository.update(timesheet.periodId, { status: 'locked', lockedAt: now, lockedBy: actor.id, updatedAt: now });
    return { id, status: 'locked' };
  }

  async unlock(id: string, dto: TimesheetActionDto, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    if (timesheet.status !== 'locked') throw new BadRequestException('Bảng công chưa bị khóa');
    const payroll = await this.employeePayrollRepository.findOne({ where: { timesheetId: id }, relations: { payrollPeriod: true } });
    if (payroll && (['approved', 'paid'].includes(payroll.status) || ['approved', 'locked', 'paid'].includes(payroll.payrollPeriod.status))) {
      throw new BadRequestException('Bảng công đã được dùng trong payroll đã duyệt, khóa hoặc đã trả; cần xử lý liên phân hệ');
    }
    await this.changeStatus(timesheet, 'approved', dto.note, actor, { lockedAt: null }, 'timesheet_unlocked');
    await this.periodRepository.update(timesheet.periodId, { status: 'processing', lockedAt: null, lockedBy: null, updatedAt: new Date() });
    return { id, status: 'approved' };
  }

  async getHistory(id: string, actor: AuthUser) {
    await this.getScopedTimesheet(id, actor);
    const [statuses, audits] = await Promise.all([
      this.approvalHistoryRepository.find({ where: { timesheetId: id }, relations: { actionByUser: true }, order: { createdAt: 'DESC' } }),
      this.auditRepository.find({ where: { entityType: 'timesheet', entityId: id }, relations: { actorUser: true }, order: { createdAt: 'DESC' } }),
    ]);
    return [
      ...statuses.map((item) => ({ id: `status:${item.id}`, type: 'status', action: `${item.fromStatus ?? 'new'} → ${item.toStatus}`, note: item.note, actor: item.actionByUser.displayName, createdAt: item.createdAt, oldValues: null, newValues: null })),
      ...audits.map((item) => ({ id: `audit:${item.id}`, type: 'change', action: item.action, note: (item.newValues?.reason as string | undefined) ?? null, actor: item.actorUser?.displayName ?? 'Hệ thống', createdAt: item.createdAt, oldValues: item.oldValues, newValues: item.newValues })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async exportCsv(query: TimesheetReportQueryDto, actor: AuthUser) {
    const report = await this.getReport(query, actor);
    const rows = [['Ngày', 'Mã nhân viên', 'Nhân viên', 'Phòng ban', 'Chi nhánh', 'Ca', 'Giờ dự kiến', 'Check-in', 'Check-out', 'Phút dự kiến', 'Phút thực tế', 'Phút break', 'Phút tính công', 'OT đề xuất', 'OT duyệt', 'Trạng thái']];
    report.timesheets.forEach((timesheet) => timesheet.entries.forEach((entry) => rows.push([
      entry.workDate, entry.employeeCode, entry.employeeName, entry.departmentName, entry.branchName, entry.shiftName,
      `${entry.scheduledStartAt?.toISOString() ?? ''} - ${entry.scheduledEndAt?.toISOString() ?? ''}`,
      entry.actualCheckInAt?.toISOString() ?? '', entry.actualCheckOutAt?.toISOString() ?? '',
      String(entry.scheduledMinutes), String(entry.workedMinutes), String(entry.breakMinutes), String(entry.regularMinutes),
      String(entry.overtimeCandidateMinutes), String(entry.overtimeMinutes), entry.state,
    ])));
    return `\uFEFF${rows.map((row) => row.map((value) => this.csv(value)).join(',')).join('\r\n')}`;
  }

  private async refreshTimesheetTotals(id: string, actor: AuthUser) {
    const timesheet = await this.getScopedTimesheet(id, actor);
    const report = await this.getReport({ from: timesheet.period.startsOn, to: timesheet.period.endsOn, employeeId: timesheet.employeeId }, actor);
    const totals = report.timesheets[0]?.totals;
    if (!totals) throw new BadRequestException('Không thể tính lại tổng bảng công');
    await this.timesheetRepository.update(id, {
      scheduledMinutes: totals.scheduledMinutes,
      workedMinutes: totals.workedMinutes,
      breakMinutes: totals.breakMinutes,
      regularMinutes: totals.regularMinutes,
      overtimeMinutes: totals.overtimeMinutes,
      lateMinutes: totals.lateMinutes,
      earlyLeaveMinutes: totals.earlyLeaveMinutes,
      updatedAt: new Date(),
    });
  }

  private async saveTimesheetSnapshot(timesheet: Timesheet, entries: ReportEntry[], totals: Aggregate) {
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(TimesheetEntry).delete({ timesheetId: timesheet.id });
      const grouped = this.group(entries, (entry) => entry.attendanceRecordId ?? `date:${entry.workDate}`);
      const snapshots = grouped.map(([, groupEntries]) => {
        const groupTotals = this.aggregate(groupEntries);
        return manager.getRepository(TimesheetEntry).create({
          timesheetId: timesheet.id,
          attendanceRecordId: groupEntries[0].attendanceRecordId,
          workDate: groupEntries[0].workDate,
          entryType: 'work',
          scheduledMinutes: groupTotals.scheduledMinutes,
          workedMinutes: groupTotals.workedMinutes,
          breakMinutes: groupTotals.breakMinutes,
          regularMinutes: groupTotals.regularMinutes,
          overtimeMinutes: groupTotals.overtimeMinutes,
          note: JSON.stringify({ lockedSnapshot: true, sourceKeys: groupEntries.map((entry) => entry.key) }),
          snapshotData: groupEntries.map((entry) => this.serializeSnapshot(entry)),
          updatedAt: now,
        });
      });
      if (snapshots.length) await manager.getRepository(TimesheetEntry).save(snapshots);
      await manager.getRepository(Timesheet).update(timesheet.id, {
        scheduledMinutes: totals.scheduledMinutes,
        workedMinutes: totals.workedMinutes,
        breakMinutes: totals.breakMinutes,
        regularMinutes: totals.regularMinutes,
        overtimeMinutes: totals.overtimeMinutes,
        lateMinutes: totals.lateMinutes,
        earlyLeaveMinutes: totals.earlyLeaveMinutes,
        updatedAt: now,
      });
    });
  }

  private serializeSnapshot(entry: ReportEntry) {
    return {
      ...entry,
      scheduledStartAt: entry.scheduledStartAt?.toISOString() ?? null,
      scheduledEndAt: entry.scheduledEndAt?.toISOString() ?? null,
      actualCheckInAt: entry.actualCheckInAt?.toISOString() ?? null,
      actualCheckOutAt: entry.actualCheckOutAt?.toISOString() ?? null,
      adjustment: entry.adjustment ? { ...entry.adjustment, adjustedAt: entry.adjustment.adjustedAt.toISOString() } : null,
    };
  }

  private hydrateSnapshot(snapshot: Record<string, unknown>, employeeId?: string): ReportEntry {
    const value = snapshot as unknown as Omit<ReportEntry, 'scheduledStartAt' | 'scheduledEndAt' | 'actualCheckInAt' | 'actualCheckOutAt' | 'adjustment'> & {
      scheduledStartAt: string | null;
      scheduledEndAt: string | null;
      actualCheckInAt: string | null;
      actualCheckOutAt: string | null;
      adjustment: { reason: string; adjustedAt: string } | null;
    };
    return {
      ...value,
      employeeId: value.employeeId || employeeId || '',
      scheduledStartAt: value.scheduledStartAt ? new Date(value.scheduledStartAt) : null,
      scheduledEndAt: value.scheduledEndAt ? new Date(value.scheduledEndAt) : null,
      actualCheckInAt: value.actualCheckInAt ? new Date(value.actualCheckInAt) : null,
      actualCheckOutAt: value.actualCheckOutAt ? new Date(value.actualCheckOutAt) : null,
      adjustment: value.adjustment ? { reason: value.adjustment.reason, adjustedAt: new Date(value.adjustment.adjustedAt) } : null,
    };
  }

  private async changeStatus(timesheet: Timesheet, toStatus: string, note: string, actor: AuthUser, changes: Partial<Timesheet>, auditAction: string) {
    const fromStatus = timesheet.status;
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      Object.assign(timesheet, changes, { status: toStatus, updatedAt: now });
      await manager.getRepository(Timesheet).save(timesheet);
      await manager.getRepository(TimesheetApprovalHistory).save(manager.getRepository(TimesheetApprovalHistory).create({
        timesheetId: timesheet.id,
        fromStatus,
        toStatus,
        actionBy: actor.id,
        note: note.trim(),
      }));
      await manager.getRepository(AuditLog).save(manager.getRepository(AuditLog).create({
        actorUserId: actor.id,
        action: auditAction,
        entityType: 'timesheet',
        entityId: timesheet.id,
        oldValues: { status: fromStatus },
        newValues: { status: toStatus, reason: note.trim() },
      }));
    });
  }

  private async getScopedTimesheet(id: string, actor: AuthUser) {
    const timesheet = await this.timesheetRepository.findOne({
      where: { id },
      relations: { period: true, employee: { organization: true, primaryBranch: true, department: true } },
    });
    if (!timesheet) throw new NotFoundException('Không tìm thấy bảng công');
    const organization = await this.resolveOrganization(actor);
    if (timesheet.employee.organizationId !== organization.id) throw new ForbiddenException('Bảng công nằm ngoài doanh nghiệp của bạn');
    const scope = await this.resolveScope(actor);
    if (scope.unrestricted) return timesheet;
    if (scope.selfEmployeeId === timesheet.employeeId) return timesheet;
    if (scope.branchIds.includes(timesheet.employee.primaryBranchId) || scope.departmentIds.includes(timesheet.employee.departmentId)) return timesheet;
    throw new ForbiddenException('Bảng công nằm ngoài phạm vi quản lý của bạn');
  }

  private adjustmentValues(item: TimesheetAdjustment) {
    return {
      sourceKey: item.sourceKey,
      workDate: item.workDate,
      breakMinutes: item.breakMinutes,
      regularMinutes: item.regularMinutes,
      overtimeMinutes: item.overtimeMinutes,
      reason: item.reason,
    };
  }

  private csv(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private async findAssignments(organizationId: string, range: { from: string; to: string; fromDate: Date; toExclusive: Date }, query: TimesheetReportQueryDto, scope: TimesheetScope) {
    const qb = this.assignmentRepository.createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.employee', 'employee')
      .innerJoinAndSelect('employee.department', 'employeeDepartment')
      .innerJoinAndSelect('employee.position', 'employeePosition')
      .innerJoinAndSelect('employee.primaryBranch', 'employeeBranch')
      .innerJoinAndSelect('assignment.shift', 'shift')
      .innerJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department')
      .leftJoinAndSelect('shift.position', 'position')
      .where('employee.organization_id = :organizationId', { organizationId })
      .andWhere('employee.deleted_at IS NULL')
      .andWhere("assignment.assignment_status IN ('assigned', 'confirmed')")
      .andWhere("shift.status IN ('published', 'completed')")
      .andWhere('shift.deleted_at IS NULL')
      .andWhere('shift.starts_at >= :fromDate AND shift.starts_at < :toExclusive', { fromDate: range.fromDate, toExclusive: range.toExclusive });
    this.applyScope(qb, scope, 'shift.branch_id', 'shift.department_id', 'employee.id');
    this.applyFilters(qb, query, 'shift.branch_id', 'shift.department_id', 'employee.id', 'shift.id');
    if (query.search?.trim()) {
      qb.andWhere('(employee.employee_code ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.preferred_name ILIKE :search OR shift.name ILIKE :search)', { search: `%${query.search.trim()}%` });
    }
    return qb.orderBy('shift.starts_at', 'ASC').addOrderBy('employee.last_name', 'ASC').getMany();
  }

  private async findAttendanceRecords(organizationId: string, range: { from: string; to: string }, query: TimesheetReportQueryDto, scope: TimesheetScope) {
    const qb = this.attendanceRepository.createQueryBuilder('record')
      .innerJoinAndSelect('record.employee', 'employee')
      .innerJoinAndSelect('employee.department', 'employeeDepartment')
      .innerJoinAndSelect('employee.position', 'employeePosition')
      .innerJoinAndSelect('employee.primaryBranch', 'employeeBranch')
      .innerJoinAndSelect('record.branch', 'branch')
      .leftJoinAndSelect('record.shiftAssignment', 'assignment')
      .leftJoinAndSelect('assignment.shift', 'shift')
      .leftJoinAndSelect('shift.branch', 'shiftBranch')
      .leftJoinAndSelect('shift.department', 'shiftDepartment')
      .leftJoinAndSelect('shift.position', 'shiftPosition')
      .where('employee.organization_id = :organizationId', { organizationId })
      .andWhere('employee.deleted_at IS NULL')
      .andWhere('record.work_date >= :from AND record.work_date <= :to', { from: range.from, to: range.to });
    this.applyScope(qb, scope, 'record.branch_id', 'COALESCE(shift.department_id, employee.department_id)', 'employee.id');
    this.applyFilters(qb, query, 'record.branch_id', 'COALESCE(shift.department_id, employee.department_id)', 'employee.id', 'shift.id');
    if (query.search?.trim()) {
      qb.andWhere('(employee.employee_code ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.preferred_name ILIKE :search OR shift.name ILIKE :search)', { search: `%${query.search.trim()}%` });
    }
    return qb.orderBy('record.work_date', 'ASC').addOrderBy('employee.last_name', 'ASC').getMany();
  }

  private assignmentEntry(assignment: ShiftAssignment, record: AttendanceRecord | null, fallbackTimezone: string): ReportEntry {
    const { shift, employee } = assignment;
    const scheduledMinutes = Math.max(Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000) - shift.unpaidBreakMinutes, 0);
    const state = this.entryState(record, shift.startsAt, shift.endsAt);
    const completed = Boolean(record && ['completed', 'adjusted'].includes(record.status) && record.actualCheckInAt && record.actualCheckOutAt);
    const workedMinutes = record?.workedMinutes ?? 0;
    const overtimeCandidateMinutes = completed
      ? Math.min(workedMinutes, Math.max(workedMinutes - scheduledMinutes, record?.overtimeMinutes ?? 0))
      : 0;
    const regularMinutes = completed ? Math.min(Math.max(workedMinutes - overtimeCandidateMinutes, 0), scheduledMinutes) : 0;
    const warnings = this.warnings(record, state, overtimeCandidateMinutes);
    return {
      key: `assignment:${assignment.id}`,
      attendanceRecordId: record?.id ?? null,
      workDate: this.dateInTimezone(shift.startsAt, shift.branch.timezone || fallbackTimezone),
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: this.employeeName(employee),
      branchId: shift.branch.id,
      branchName: shift.branch.name,
      departmentId: shift.department?.id ?? employee.departmentId,
      departmentName: shift.department?.name ?? employee.department.name,
      shiftId: shift.id,
      shiftName: shift.name,
      scheduledStartAt: shift.startsAt,
      scheduledEndAt: shift.endsAt,
      actualCheckInAt: record?.actualCheckInAt ?? null,
      actualCheckOutAt: record?.actualCheckOutAt ?? null,
      scheduledMinutes,
      workedMinutes,
      breakMinutes: record?.breakMinutes ?? 0,
      regularMinutes,
      overtimeCandidateMinutes,
      overtimeMinutes: 0,
      lateMinutes: record?.lateMinutes ?? 0,
      earlyLeaveMinutes: record?.earlyLeaveMinutes ?? 0,
      state,
      warnings,
      adjustment: null,
    };
  }

  private outsideScheduleEntry(record: AttendanceRecord): ReportEntry {
    const employee = record.employee;
    const completed = ['completed', 'adjusted'].includes(record.status) && record.actualCheckInAt && record.actualCheckOutAt;
    return {
      key: `record:${record.id}`,
      attendanceRecordId: record.id,
      workDate: record.workDate,
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: this.employeeName(employee),
      branchId: record.branch.id,
      branchName: record.branch.name,
      departmentId: employee.departmentId,
      departmentName: employee.department.name,
      shiftId: null,
      shiftName: 'Ngoài lịch',
      scheduledStartAt: null,
      scheduledEndAt: null,
      actualCheckInAt: record.actualCheckInAt,
      actualCheckOutAt: record.actualCheckOutAt,
      scheduledMinutes: 0,
      workedMinutes: record.workedMinutes,
      breakMinutes: record.breakMinutes,
      regularMinutes: 0,
      overtimeCandidateMinutes: 0,
      overtimeMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      state: completed ? 'outside_schedule' : 'incomplete',
      warnings: completed ? ['OUTSIDE_SCHEDULE'] : ['OUTSIDE_SCHEDULE', 'INCOMPLETE'],
      adjustment: null,
    };
  }

  private entryState(record: AttendanceRecord | null, shiftStartsAt: Date, shiftEndsAt: Date): ReportEntry['state'] {
    if (!record) {
      const now = new Date();
      if (shiftEndsAt < now) return 'absent';
      return shiftStartsAt <= now ? 'incomplete' : 'scheduled';
    }
    if (record.status === 'absent' || record.status === 'missing_check_in') return 'absent';
    if (['completed', 'adjusted'].includes(record.status) && record.actualCheckInAt && record.actualCheckOutAt) return 'complete';
    return 'incomplete';
  }

  private warnings(record: AttendanceRecord | null, state: ReportEntry['state'], overtimeCandidateMinutes: number) {
    const warnings: string[] = [];
    if (state === 'absent') warnings.push('ABSENT');
    if (state === 'incomplete') warnings.push(record?.actualCheckInAt ? 'MISSING_CHECK_OUT' : 'INCOMPLETE');
    if ((record?.lateMinutes ?? 0) > 15) warnings.push('LATE');
    if ((record?.earlyLeaveMinutes ?? 0) > 0) warnings.push('EARLY_LEAVE');
    if (overtimeCandidateMinutes > 0) warnings.push('OVERTIME_CANDIDATE');
    return warnings;
  }

  private aggregate(entries: ReportEntry[]): Aggregate {
    return entries.reduce<Aggregate>((total, entry) => ({
      scheduledMinutes: total.scheduledMinutes + entry.scheduledMinutes,
      workedMinutes: total.workedMinutes + entry.workedMinutes,
      breakMinutes: total.breakMinutes + entry.breakMinutes,
      regularMinutes: total.regularMinutes + entry.regularMinutes,
      overtimeCandidateMinutes: total.overtimeCandidateMinutes + entry.overtimeCandidateMinutes,
      overtimeMinutes: total.overtimeMinutes + entry.overtimeMinutes,
      lateMinutes: total.lateMinutes + entry.lateMinutes,
      earlyLeaveMinutes: total.earlyLeaveMinutes + entry.earlyLeaveMinutes,
      entries: total.entries + 1,
      issues: total.issues + (entry.warnings.length ? 1 : 0),
    }), { scheduledMinutes: 0, workedMinutes: 0, breakMinutes: 0, regularMinutes: 0, overtimeCandidateMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, entries: 0, issues: 0 });
  }

  private aggregateBy(entries: ReportEntry[], key: (entry: ReportEntry) => string, label: (key: string) => string) {
    return this.group(entries, key).map(([groupKey, groupEntries]) => ({ key: groupKey, label: label(groupKey), ...this.aggregate(groupEntries) }));
  }

  private aggregateDimension(entries: ReportEntry[], key: (entry: ReportEntry) => string, label: (entry: ReportEntry) => string) {
    return this.group(entries, key).map(([groupKey, groupEntries]) => ({ id: groupKey, name: label(groupEntries[0]), employees: new Set(groupEntries.map((entry) => entry.employeeId)).size, ...this.aggregate(groupEntries) }))
      .sort((a, b) => b.regularMinutes - a.regularMinutes || a.name.localeCompare(b.name, 'vi'));
  }

  private group<T>(items: T[], key: (item: T) => string) {
    const groups = new Map<string, T[]>();
    items.forEach((item) => {
      const value = key(item);
      groups.set(value, [...(groups.get(value) ?? []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  private resolveRange(query: TimesheetReportQueryDto, timezone: string) {
    const now = this.dateInTimezone(new Date(), timezone);
    const from = query.from ?? `${now.slice(0, 7)}-01`;
    const to = query.to ?? now;
    const fromDate = new Date(`${from}T00:00:00+07:00`);
    const toDate = new Date(`${to}T00:00:00+07:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) throw new BadRequestException('Khoảng thời gian bảng công không hợp lệ');
    if ((toDate.getTime() - fromDate.getTime()) / 86_400_000 > 366) throw new BadRequestException('Khoảng xem bảng công tối đa là 366 ngày');
    return { from, to, fromDate, toExclusive: new Date(toDate.getTime() + 86_400_000) };
  }

  private async resolveOrganization(actor: AuthUser) {
    if (actor.employeeId) {
      const employee = await this.employeeRepository.findOne({ where: { id: actor.employeeId, deletedAt: IsNull() }, relations: { organization: true } });
      if (employee) return employee.organization;
    }
    const organization = await this.organizationRepository.createQueryBuilder('organization')
      .orderBy('organization.created_at', 'ASC')
      .getOne();
    if (!organization) throw new BadRequestException('Doanh nghiệp chưa được cấu hình');
    return organization;
  }

  private async resolveScope(actor: AuthUser): Promise<TimesheetScope> {
    const codes = new Set(actor.roles.map((role) => role.code));
    if (codes.has('SUPER_ADMIN') || codes.has('ADMIN') || codes.has('HR') || codes.has('PAYROLL')) {
      return { unrestricted: true, selfEmployeeId: null, branchIds: [], departmentIds: [] };
    }
    if (codes.has('MANAGER')) {
      const roles = actor.roles.filter((role) => role.code === 'MANAGER');
      const branchIds = roles.flatMap((role) => role.branchId ? [role.branchId] : []);
      const departmentIds = roles.flatMap((role) => role.departmentId ? [role.departmentId] : []);
      if (!branchIds.length && !departmentIds.length && actor.employeeId) {
        const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
        if (employee) branchIds.push(employee.primaryBranchId);
      }
      if (!branchIds.length && !departmentIds.length) throw new ForbiddenException('Tài khoản quản lý chưa được gán phạm vi');
      return { unrestricted: false, selfEmployeeId: null, branchIds: [...new Set(branchIds)], departmentIds: [...new Set(departmentIds)] };
    }
    if (actor.employeeId) return { unrestricted: false, selfEmployeeId: actor.employeeId, branchIds: [], departmentIds: [] };
    throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ nhân viên');
  }

  private applyScope(qb: ReturnType<Repository<ShiftAssignment>['createQueryBuilder']> | ReturnType<Repository<AttendanceRecord>['createQueryBuilder']>, scope: TimesheetScope, branchColumn: string, departmentColumn: string, employeeColumn: string) {
    if (scope.unrestricted) return;
    if (scope.selfEmployeeId) {
      qb.andWhere(`${employeeColumn} = :selfEmployeeId`, { selfEmployeeId: scope.selfEmployeeId });
      return;
    }
    qb.andWhere(new Brackets((where) => {
      if (scope.branchIds.length) where.where(`${branchColumn} IN (:...scopeBranchIds)`, { scopeBranchIds: scope.branchIds });
      if (scope.departmentIds.length) {
        const method = scope.branchIds.length ? 'orWhere' : 'where';
        where[method](`${departmentColumn} IN (:...scopeDepartmentIds)`, { scopeDepartmentIds: scope.departmentIds });
      }
    }));
  }

  private applyFilters(qb: ReturnType<Repository<ShiftAssignment>['createQueryBuilder']> | ReturnType<Repository<AttendanceRecord>['createQueryBuilder']>, query: TimesheetReportQueryDto, branchColumn: string, departmentColumn: string, employeeColumn: string, shiftColumn: string) {
    if (query.branchId) qb.andWhere(`${branchColumn} = :branchId`, { branchId: query.branchId });
    if (query.departmentId) qb.andWhere(`${departmentColumn} = :departmentId`, { departmentId: query.departmentId });
    if (query.employeeId) qb.andWhere(`${employeeColumn} = :employeeId`, { employeeId: query.employeeId });
    if (query.shiftId) qb.andWhere(`${shiftColumn} = :shiftId`, { shiftId: query.shiftId });
  }

  private inBranchScope(id: string, scope: TimesheetScope) {
    return scope.unrestricted || scope.selfEmployeeId !== null || scope.branchIds.includes(id);
  }

  private inDepartmentScope(id: string, scope: TimesheetScope) {
    return scope.unrestricted || scope.selfEmployeeId !== null || scope.departmentIds.length === 0 || scope.departmentIds.includes(id);
  }

  private snapshotMatches(entry: ReportEntry, query: TimesheetReportQueryDto, scope: TimesheetScope) {
    if (scope.selfEmployeeId && entry.employeeId !== scope.selfEmployeeId) return false;
    if (!scope.unrestricted && !scope.selfEmployeeId && !scope.branchIds.includes(entry.branchId) && !(entry.departmentId && scope.departmentIds.includes(entry.departmentId))) return false;
    if (query.employeeId && entry.employeeId !== query.employeeId) return false;
    if (query.branchId && entry.branchId !== query.branchId) return false;
    if (query.departmentId && entry.departmentId !== query.departmentId) return false;
    if (query.shiftId && entry.shiftId !== query.shiftId) return false;
    if (query.search?.trim()) {
      const search = query.search.trim().toLocaleLowerCase('vi');
      if (![entry.employeeCode, entry.employeeName, entry.shiftName].some((value) => value.toLocaleLowerCase('vi').includes(search))) return false;
    }
    return true;
  }

  private employeeName(employee: Employee) {
    return employee.preferredName?.trim() || `${employee.lastName} ${employee.firstName}`.trim();
  }

  private dateInTimezone(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private weekKey(date: string) {
    const value = new Date(`${date}T00:00:00Z`);
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() - day + 1);
    return value.toISOString().slice(0, 10);
  }

  private dateLabel(date: string) {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  }

  private monthLabel(month: string) {
    return new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  }
}
