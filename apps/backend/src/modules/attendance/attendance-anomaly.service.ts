import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, DataSource, EntityManager, In, IsNull, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { Organization } from '../core/entities/organization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { ShiftAssignment } from '../schedules/entities/shift-assignment.entity';
import { AttendanceAnomalyQueryDto, UpdateAttendanceAnomalySettingsDto } from './dto/attendance-anomaly.dto';
import { AttendanceAnomalySetting } from './entities/attendance-anomaly-setting.entity';
import { AttendanceClockAttempt } from './entities/attendance-clock-attempt.entity';
import { AttendanceEvent } from './entities/attendance-event.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { AttendanceViolationHistory } from './entities/attendance-violation-history.entity';
import { AttendanceViolation } from './entities/attendance-violation.entity';

type AnomalyStatus = 'provisional' | 'active';
type AnomalySeverity = 'info' | 'warning' | 'critical';
type AnomalyType = 'late' | 'early_leave' | 'missing_check_in' | 'missing_check_out' | 'absence' | 'outside_geofence' | 'excessive_break' | 'insufficient_hours' | 'outside_schedule';
type DesiredAnomaly = {
  type: AnomalyType;
  status: AnomalyStatus;
  severity: AnomalySeverity;
  minutes: number;
  grace: number;
  details: string;
  snapshot: Record<string, unknown>;
};
type AttendanceScope = { unrestricted: boolean; branchIds: string[]; departmentIds: string[]; selfEmployeeId: string | null };

@Injectable()
export class AttendanceAnomalyService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceAnomalyService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AttendanceViolation) private readonly violationRepository: Repository<AttendanceViolation>,
    @InjectRepository(AttendanceViolationHistory) private readonly historyRepository: Repository<AttendanceViolationHistory>,
    @InjectRepository(AttendanceAnomalySetting) private readonly settingRepository: Repository<AttendanceAnomalySetting>,
    @InjectRepository(AttendanceRecord) private readonly recordRepository: Repository<AttendanceRecord>,
    @InjectRepository(AttendanceEvent) private readonly eventRepository: Repository<AttendanceEvent>,
    @InjectRepository(AttendanceClockAttempt) private readonly clockAttemptRepository: Repository<AttendanceClockAttempt>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(LeaveRequest) private readonly leaveRequestRepository: Repository<LeaveRequest>,
  ) {}

  async onModuleInit() {
    await this.refreshAnomalies();
  }

  async getOverview(query: AttendanceAnomalyQueryDto, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const builder = this.buildListQuery(query, scope);
    const [total, items] = await Promise.all([
      builder.clone().getCount(),
      builder.clone().skip((query.page - 1) * query.pageSize).take(query.pageSize).getMany(),
    ]);
    const all = await this.buildListQuery({ ...query, page: 1, pageSize: 200 } as AttendanceAnomalyQueryDto, scope).getMany();
    const active = all.filter((item) => item.status === 'active');
    const types = Object.fromEntries((['late', 'early_leave', 'missing_check_in', 'missing_check_out', 'absence', 'outside_geofence', 'excessive_break', 'insufficient_hours', 'outside_schedule'] as AnomalyType[]).map((type) => [type, active.filter((item) => item.violationType === type).length]));
    return {
      summary: {
        totalActive: active.length,
        provisional: all.filter((item) => item.status === 'provisional').length,
        affectedEmployees: new Set(active.map((item) => item.employeeId)).size,
        minutesAffected: active.reduce((sum, item) => sum + item.minutesAffected, 0),
        critical: active.filter((item) => item.severity === 'critical').length,
        types,
      },
      pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(Math.ceil(total / query.pageSize), 1) },
      items: items.map((item) => this.listItem(item)),
    };
  }

  async getOptions(actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const builder = this.employeeRepository.createQueryBuilder('employee')
      .innerJoinAndSelect('employee.primaryBranch', 'branch')
      .innerJoinAndSelect('employee.department', 'department')
      .where('employee.deletedAt IS NULL');
    this.applyScope(builder, scope, 'employee');
    const employees = await builder.orderBy('employee.lastName', 'ASC').addOrderBy('employee.firstName', 'ASC').getMany();
    return {
      employees: employees.map((employee) => ({ id: employee.id, employeeCode: employee.employeeCode, fullName: this.employeeName(employee) })),
      branches: [...new Map(employees.map((employee) => [employee.primaryBranchId, { id: employee.primaryBranchId, name: employee.primaryBranch.name }])).values()],
      departments: [...new Map(employees.map((employee) => [employee.departmentId, { id: employee.departmentId, name: employee.department.name }])).values()],
    };
  }

  async getDetail(id: string, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const violation = await this.buildBaseQuery().andWhere('violation.id = :id', { id }).getOne();
    if (!violation) throw new NotFoundException('Không tìm thấy bất thường chấm công');
    this.assertScope(violation.employee, scope);
    const attemptIds = Array.isArray(violation.calculationSnapshot.attemptIds)
      ? violation.calculationSnapshot.attemptIds.filter((value): value is string => typeof value === 'string')
      : [];
    const [history, events, attempts] = await Promise.all([
      this.historyRepository.find({ where: { attendanceViolationId: id }, relations: { actorUser: true }, order: { createdAt: 'DESC' } }),
      violation.attendanceRecordId ? this.eventRepository.find({ where: { attendanceRecordId: violation.attendanceRecordId }, order: { occurredAt: 'ASC' } }) : [],
      attemptIds.length ? this.clockAttemptRepository.find({ where: { id: In(attemptIds) }, relations: { branch: true }, order: { attemptedAt: 'ASC' } }) : [],
    ]);
    const canViewLocation = actor.permissions.includes('attendance_anomalies.location.view') || violation.employeeId === actor.employeeId;
    return {
      ...this.listItem(violation),
      details: violation.details,
      graceMinutes: violation.graceMinutes,
      calculationVersion: violation.calculationVersion,
      calculation: violation.calculationSnapshot,
      exclusion: { by: violation.excludedByUser?.displayName ?? null, at: violation.excludedAt, reason: violation.exclusionReason },
      events: [...events.map((event) => ({
        id: event.id, type: event.eventType, occurredAt: event.occurredAt, method: event.method,
        deviceId: event.deviceId, photoUrl: event.photoUrl ? `/attendance/events/${event.id}/selfie` : null,
        latitude: canViewLocation && event.latitude !== null ? Number(event.latitude) : null,
        longitude: canViewLocation && event.longitude !== null ? Number(event.longitude) : null,
        accuracyM: canViewLocation && event.locationAccuracyM !== null ? Number(event.locationAccuracyM) : null,
        distanceM: canViewLocation && event.distanceFromBranchM !== null ? Number(event.distanceFromBranchM) : null,
        withinGeofence: canViewLocation ? event.isWithinGeofence : null,
        rejected: false, rejectionReason: null,
      })), ...attempts.map((attempt) => ({
        id: attempt.id, type: attempt.eventType, occurredAt: attempt.attemptedAt, method: attempt.method,
        deviceId: attempt.deviceId, photoUrl: null,
        latitude: canViewLocation ? Number(attempt.latitude) : null,
        longitude: canViewLocation ? Number(attempt.longitude) : null,
        accuracyM: canViewLocation && attempt.locationAccuracyM !== null ? Number(attempt.locationAccuracyM) : null,
        distanceM: canViewLocation ? Number(attempt.distanceFromBranchM) : null,
        withinGeofence: canViewLocation ? false : null,
        rejected: true, rejectionReason: attempt.rejectionMessage,
      }))].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
      geofence: canViewLocation && (violation.attendanceRecord?.branch || attempts[0]?.branch) ? {
        latitude: (violation.attendanceRecord?.branch ?? attempts[0].branch).latitude === null ? null : Number((violation.attendanceRecord?.branch ?? attempts[0].branch).latitude),
        longitude: (violation.attendanceRecord?.branch ?? attempts[0].branch).longitude === null ? null : Number((violation.attendanceRecord?.branch ?? attempts[0].branch).longitude),
        radiusM: attempts[0]?.geofenceRadiusM ?? violation.attendanceRecord!.branch.geofenceRadiusM,
      } : null,
      history: history.map((item) => ({ id: item.id, eventType: item.eventType, oldValues: item.oldValues, newValues: item.newValues, source: item.source, reason: item.reason, actor: item.actorUser?.displayName ?? 'Hệ thống', createdAt: item.createdAt })),
    };
  }

  async getMyAnomalies(query: AttendanceAnomalyQueryDto, actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết nhân viên');
    query.employeeId = actor.employeeId;
    return this.getOverview(query, actor);
  }

  async getStatistics(query: AttendanceAnomalyQueryDto, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const items = await this.buildListQuery({ ...query, status: 'active' } as AttendanceAnomalyQueryDto, scope).getMany();
    const byType = Object.values(items.reduce<Record<string, { type: string; count: number; minutes: number; employees: Set<string> }>>((result, item) => {
      result[item.violationType] ??= { type: item.violationType, count: 0, minutes: 0, employees: new Set<string>() };
      result[item.violationType].count += 1;
      result[item.violationType].minutes += item.minutesAffected;
      result[item.violationType].employees.add(item.employeeId);
      return result;
    }, {})).map((item) => ({ ...item, employees: item.employees.size })).sort((a, b) => b.count - a.count);
    const daily = Object.values(items.reduce<Record<string, { date: string; count: number; late: number; absence: number }>>((result, item) => {
      result[item.violationDate] ??= { date: item.violationDate, count: 0, late: 0, absence: 0 };
      result[item.violationDate].count += 1;
      if (item.violationType === 'late') result[item.violationDate].late += 1;
      if (item.violationType === 'absence') result[item.violationDate].absence += 1;
      return result;
    }, {})).sort((a, b) => a.date.localeCompare(b.date));
    const scheduledShifts = await this.countScheduledShifts(query, scope);
    const absence = items.filter((item) => item.violationType === 'absence').length;
    return { scheduledShifts, absence, absenceRate: scheduledShifts ? Number(((absence / scheduledShifts) * 100).toFixed(2)) : 0, byType, daily };
  }

  async exclude(id: string, reason: string, actor: AuthUser) {
    const violation = await this.violationRepository.findOne({ where: { id }, relations: { employee: true } });
    if (!violation) throw new NotFoundException('Không tìm thấy bất thường');
    this.assertScope(violation.employee, await this.resolveScope(actor));
    if (!['active', 'provisional'].includes(violation.status)) throw new BadRequestException('Chỉ có thể loại bất thường đang hiệu lực');
    const oldValues = this.violationSnapshot(violation);
    violation.status = 'excluded';
    violation.excludedBy = actor.id;
    violation.excludedAt = new Date();
    violation.exclusionReason = reason.trim();
    await this.violationRepository.save(violation);
    await this.historyRepository.save(this.historyRepository.create({ attendanceViolationId: id, eventType: 'excluded', oldValues, newValues: this.violationSnapshot(violation), actorUserId: actor.id, source: 'user', reason: reason.trim(), operationId: randomUUID() }));
    return this.getDetail(id, actor);
  }

  async restore(id: string, actor: AuthUser) {
    const violation = await this.violationRepository.findOne({ where: { id }, relations: { employee: true } });
    if (!violation) throw new NotFoundException('Không tìm thấy bất thường');
    this.assertScope(violation.employee, await this.resolveScope(actor));
    if (violation.status !== 'excluded') throw new BadRequestException('Bất thường này không ở trạng thái đã loại');
    const oldValues = this.violationSnapshot(violation);
    violation.status = violation.finalizedAt ? 'active' : 'provisional';
    violation.excludedBy = null;
    violation.excludedAt = null;
    violation.exclusionReason = null;
    await this.violationRepository.save(violation);
    await this.historyRepository.save(this.historyRepository.create({ attendanceViolationId: id, eventType: 'restored', oldValues, newValues: this.violationSnapshot(violation), actorUserId: actor.id, source: 'user', reason: 'Khôi phục vào thống kê', operationId: randomUUID() }));
    if (violation.attendanceRecordId) await this.recalculateRecord(violation.attendanceRecordId, undefined, Boolean(violation.finalizedAt));
    return this.getDetail(id, actor);
  }

  async recalculate(id: string, actor: AuthUser) {
    const violation = await this.violationRepository.findOne({ where: { id }, relations: { employee: true } });
    if (!violation) throw new NotFoundException('Không tìm thấy bất thường');
    this.assertScope(violation.employee, await this.resolveScope(actor));
    if (violation.attendanceRecordId) {
      await this.recalculateRecord(violation.attendanceRecordId, undefined, Boolean(violation.finalizedAt), actor.id);
    } else if (violation.violationType === 'outside_geofence') {
      const attemptIds = Array.isArray(violation.calculationSnapshot.attemptIds)
        ? violation.calculationSnapshot.attemptIds.filter((value): value is string => typeof value === 'string')
        : [];
      if (!attemptIds.length) throw new BadRequestException('Không còn bằng chứng vị trí để tính lại bất thường');
      await this.recordRejectedGeofenceAttempt(attemptIds.at(-1)!);
    } else {
      throw new BadRequestException('Cảnh báo chưa có phiên chấm công để tính lại');
    }
    return this.getDetail(id, actor);
  }

  async getSettings() {
    return this.ensureSettings();
  }

  async recalculateAll() {
    const result = await this.dataSource.transaction(async (manager) => {
      const [lock] = await manager.query<Array<{ locked: boolean }>>('SELECT pg_try_advisory_xact_lock($1) AS locked', [72007001]);
      if (!lock?.locked) throw new BadRequestException('Tiến trình tính bất thường khác đang chạy, vui lòng thử lại sau');
      await this.finalizePastAssignments(manager);
      await this.refreshMissingCheckInWarnings(manager);
      await this.refreshOpenRecords(manager);
      const records = await manager.getRepository(AttendanceRecord).createQueryBuilder('record')
        .where('record.workDate >= :from', { from: this.dateInTimezone(new Date(Date.now() - 60 * 24 * 60 * 60_000), 'Asia/Ho_Chi_Minh') })
        .getMany();
      for (const record of records) await this.recalculateRecord(record.id, manager, ['completed', 'adjusted', 'missing_check_out', 'absent'].includes(record.status));
      return records.length;
    });
    return { recalculatedRecords: result, completedAt: new Date() };
  }

  async updateSettings(dto: UpdateAttendanceAnomalySettingsDto) {
    const setting = await this.ensureSettings();
    Object.assign(setting, dto, { updatedAt: new Date() });
    await this.settingRepository.save(setting);
    await this.organizationRepository.update(setting.organizationId, { lateGraceMinutes: dto.lateGraceMinutes, earlyLeaveGraceMinutes: dto.earlyLeaveGraceMinutes, updatedAt: new Date() });
    return setting;
  }

  async recordRejectedGeofenceAttempt(attemptId: string) {
    await this.dataSource.transaction(async (manager) => {
      const attempt = await manager.getRepository(AttendanceClockAttempt).findOne({
        where: { id: attemptId },
        relations: { employee: true, shiftAssignment: { shift: true } },
      });
      if (!attempt) return;
      const attempts = await manager.getRepository(AttendanceClockAttempt).createQueryBuilder('attempt')
        .where('attempt.employeeId = :employeeId', { employeeId: attempt.employeeId })
        .andWhere('attempt.workDate = :workDate', { workDate: attempt.workDate })
        .andWhere('attempt.rejectionReason = :reason', { reason: 'outside_geofence' })
        .andWhere(attempt.shiftAssignmentId ? 'attempt.shiftAssignmentId = :assignmentId' : 'attempt.shiftAssignmentId IS NULL', { assignmentId: attempt.shiftAssignmentId })
        .orderBy('attempt.attemptedAt', 'ASC')
        .getMany();
      const repository = manager.getRepository(AttendanceViolation);
      let violation = await repository.findOneBy({
        employeeId: attempt.employeeId,
        attendanceRecordId: IsNull(),
        shiftAssignmentId: attempt.shiftAssignmentId ? attempt.shiftAssignmentId : IsNull(),
        violationType: 'outside_geofence',
        violationDate: attempt.workDate,
      });
      const now = new Date();
      const snapshot = {
        attemptIds: attempts.map((item) => item.id),
        eventTypes: attempts.map((item) => item.eventType),
        maxDistanceM: Math.max(...attempts.map((item) => Number(item.distanceFromBranchM))),
        radiusM: attempt.geofenceRadiusM,
        rejectedAttempts: attempts.length,
      };
      const oldValues = violation ? this.violationSnapshot(violation) : null;
      violation ??= repository.create({
        employeeId: attempt.employeeId,
        attendanceRecordId: null,
        shiftAssignmentId: attempt.shiftAssignmentId,
        violationType: 'outside_geofence',
        violationDate: attempt.workDate,
        firstDetectedAt: attempt.attemptedAt,
        detectedAt: attempt.attemptedAt,
        excludedBy: null,
        excludedAt: null,
        exclusionReason: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
      });
      violation.minutesAffected = 0;
      violation.severity = 'critical';
      if (violation.status !== 'excluded') violation.status = 'active';
      violation.details = `${attempts.length} lần chấm công bị từ chối do nằm ngoài khu vực cho phép.`;
      violation.scheduledStartAt = attempt.shiftAssignment?.shift.startsAt ?? null;
      violation.scheduledEndAt = attempt.shiftAssignment?.shift.endsAt ?? null;
      violation.actualStartAt = null;
      violation.actualEndAt = null;
      violation.graceMinutes = 0;
      violation.calculationSnapshot = snapshot;
      violation.calculationVersion = 1;
      violation.lastDetectedAt = attempt.attemptedAt;
      violation.finalizedAt = violation.finalizedAt ?? now;
      violation.clearedAt = null;
      violation.clearedReason = null;
      violation.sourceUpdatedAt = attempt.createdAt;
      violation = await repository.save(violation);
      await manager.save(AttendanceViolationHistory, manager.create(AttendanceViolationHistory, {
        attendanceViolationId: violation.id,
        eventType: oldValues ? 'recalculated' : 'detected',
        oldValues,
        newValues: this.violationSnapshot(violation),
        actorUserId: null,
        source: 'system',
        reason: oldValues ? 'Ghi nhận thêm lần chấm công ngoài khu vực bị từ chối' : 'Phát hiện lần chấm công ngoài khu vực bị từ chối',
        operationId: randomUUID(),
      }));
    });
  }

  async recalculateRecord(recordId: string, suppliedManager?: EntityManager, forceFinalized = false, actorUserId: string | null = null): Promise<void> {
    if (!suppliedManager) {
      await this.dataSource.transaction((manager) => this.recalculateRecord(recordId, manager, forceFinalized, actorUserId));
      return;
    }
    const manager = suppliedManager;
    const record = await manager.getRepository(AttendanceRecord).findOne({
      where: { id: recordId },
      relations: { employee: true, branch: true, shiftAssignment: { shift: true } },
    });
    if (!record) return;
    const [events, settings, rejectedAttempts] = await Promise.all([
      manager.getRepository(AttendanceEvent).find({ where: { attendanceRecordId: record.id }, order: { occurredAt: 'ASC' } }),
      this.ensureSettings(manager, record.employee.organizationId),
      manager.getRepository(AttendanceClockAttempt).createQueryBuilder('attempt')
        .where('attempt.employeeId = :employeeId', { employeeId: record.employeeId })
        .andWhere('attempt.workDate = :workDate', { workDate: record.workDate })
        .andWhere('attempt.rejectionReason = :reason', { reason: 'outside_geofence' })
        .andWhere(record.shiftAssignmentId ? 'attempt.shiftAssignmentId = :assignmentId' : 'attempt.shiftAssignmentId IS NULL', { assignmentId: record.shiftAssignmentId })
        .orderBy('attempt.attemptedAt', 'ASC')
        .getMany(),
    ]);
    const shift = record.shiftAssignment?.shift ?? null;
    const finalized = forceFinalized || Boolean(record.actualCheckOutAt) || ['completed', 'adjusted', 'missing_check_out', 'absent'].includes(record.status);
    const desired: DesiredAnomaly[] = [];
    const operationId = randomUUID();
    const add = (item: DesiredAnomaly) => desired.push(item);
    const outsideEvents = events.filter((event) => event.isWithinGeofence === false);

    if (!shift) {
      add({ type: 'outside_schedule', status: 'active', severity: 'info', minutes: record.workedMinutes, grace: 0, details: 'Phiên chấm công được tạo khi nhân viên không có phân ca phù hợp.', snapshot: { reason: events.find((event) => event.note)?.note ?? null, attendanceRecordId: record.id } });
    } else {
      const scheduledDuration = Math.max(Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000), 0);
      const approvedLeaveMinutes = await this.approvedLeaveMinutes(manager, record.employeeId, shift.startsAt, shift.endsAt);
      const expectedMinutes = Math.max(scheduledDuration - shift.unpaidBreakMinutes - approvedLeaveMinutes, 0);
      const fullyCoveredByLeave = approvedLeaveMinutes >= scheduledDuration;

      if (record.actualCheckInAt) {
        const lateMinutes = Math.max(Math.floor((record.actualCheckInAt.getTime() - shift.startsAt.getTime()) / 60_000), 0);
        if (lateMinutes > settings.lateGraceMinutes && !(await this.isCoveredByLeave(manager, record.employeeId, shift.startsAt, record.actualCheckInAt))) {
          add({ type: 'late', status: 'active', severity: lateMinutes >= settings.lateCriticalMinutes ? 'critical' : lateMinutes < 15 ? 'info' : 'warning', minutes: lateMinutes, grace: settings.lateGraceMinutes, details: `Check-in muộn ${lateMinutes} phút; thời gian cho phép là ${settings.lateGraceMinutes} phút.`, snapshot: { scheduledStartAt: shift.startsAt, actualCheckInAt: record.actualCheckInAt, lateMinutes, graceMinutes: settings.lateGraceMinutes, exceededGraceMinutes: Math.max(lateMinutes - settings.lateGraceMinutes, 0) } });
        }
      }

      if (record.actualCheckOutAt) {
        const earlyMinutes = Math.max(Math.ceil((shift.endsAt.getTime() - record.actualCheckOutAt.getTime()) / 60_000), 0);
        if (earlyMinutes > settings.earlyLeaveGraceMinutes && !(await this.isCoveredByLeave(manager, record.employeeId, record.actualCheckOutAt, shift.endsAt))) {
          add({ type: 'early_leave', status: 'active', severity: earlyMinutes >= settings.earlyLeaveCriticalMinutes ? 'critical' : 'warning', minutes: earlyMinutes, grace: settings.earlyLeaveGraceMinutes, details: `Check-out sớm ${earlyMinutes} phút; thời gian cho phép là ${settings.earlyLeaveGraceMinutes} phút.`, snapshot: { scheduledEndAt: shift.endsAt, actualCheckOutAt: record.actualCheckOutAt, earlyMinutes, graceMinutes: settings.earlyLeaveGraceMinutes } });
        }
      }

      if (finalized && !record.actualCheckInAt && !fullyCoveredByLeave) {
        const type: AnomalyType = events.length ? 'missing_check_in' : 'absence';
        add({ type, status: 'active', severity: type === 'absence' ? 'critical' : 'warning', minutes: expectedMinutes, grace: settings.missingCheckInReminderMinutes, details: type === 'absence' ? 'Không có check-in hợp lệ và không có nghỉ phép bao phủ toàn bộ ca.' : 'Phiên có dữ liệu nhưng thiếu sự kiện check-in hợp lệ.', snapshot: { scheduledMinutes: expectedMinutes, approvedLeaveMinutes, eventIds: events.map((event) => event.id) } });
      }
      if (finalized && record.actualCheckInAt && !record.actualCheckOutAt) {
        add({ type: 'missing_check_out', status: 'active', severity: 'warning', minutes: 0, grace: 0, details: 'Phiên đã qua thời điểm đóng ngày nhưng chưa có check-out hợp lệ.', snapshot: { actualCheckInAt: record.actualCheckInAt, workDate: record.workDate, closePolicy: 'end_of_operational_day' } });
      }
      if (record.actualCheckInAt && record.actualCheckOutAt && record.workedMinutes + settings.insufficientToleranceMinutes < expectedMinutes) {
        const missing = expectedMinutes - record.workedMinutes;
        add({ type: 'insufficient_hours', status: 'active', severity: missing >= settings.insufficientCriticalMinutes ? 'critical' : 'warning', minutes: missing, grace: settings.insufficientToleranceMinutes, details: `Thiếu ${missing} phút so với thời lượng phải làm sau khi trừ break chuẩn và nghỉ phép.`, snapshot: { scheduledDuration, unpaidBreakMinutes: shift.unpaidBreakMinutes, approvedLeaveMinutes, expectedMinutes, workedMinutes: record.workedMinutes, toleranceMinutes: settings.insufficientToleranceMinutes, missingMinutes: missing } });
      }
    }

    const breakUntil = finalized
      ? (record.actualCheckOutAt ?? this.endOfWorkDate(record.workDate, record.branch.timezone))
      : new Date();
    const breakState = this.calculateBreak(events, breakUntil);
    const allowedBreak = shift?.unpaidBreakMinutes ?? 0;
    const breakOver = Math.max(breakState.minutes - allowedBreak, 0);
    if (shift && breakOver > 0) {
      add({ type: 'excessive_break', status: finalized || !breakState.active ? 'active' : 'provisional', severity: breakOver >= settings.breakCriticalMinutes ? 'critical' : 'warning', minutes: breakOver, grace: allowedBreak, details: `Nghỉ quá ${breakOver} phút so với thời lượng ${allowedBreak} phút của ca.`, snapshot: { allowedMinutes: allowedBreak, actualMinutes: breakState.minutes, minutesOver: breakOver, activeBreak: breakState.active, breakEventIds: events.filter((event) => event.eventType.startsWith('break_')).map((event) => event.id) } });
    }
    if (outsideEvents.length || rejectedAttempts.length) {
      const maxDistance = Math.max(0, ...outsideEvents.map((event) => Number(event.distanceFromBranchM ?? 0)), ...rejectedAttempts.map((attempt) => Number(attempt.distanceFromBranchM)));
      const count = outsideEvents.length + rejectedAttempts.length;
      add({ type: 'outside_geofence', status: 'active', severity: outsideEvents.some((event) => Number(event.locationAccuracyM ?? 0) > settings.maxLocationAccuracyM) ? 'warning' : 'critical', minutes: 0, grace: 0, details: `${count} lần chấm công nằm ngoài khu vực cho phép${rejectedAttempts.length ? `; ${rejectedAttempts.length} lần đã bị chặn` : ''}.`, snapshot: { eventIds: outsideEvents.map((event) => event.id), attemptIds: rejectedAttempts.map((attempt) => attempt.id), eventTypes: [...outsideEvents.map((event) => event.eventType), ...rejectedAttempts.map((attempt) => attempt.eventType)], maxDistanceM: maxDistance, radiusM: rejectedAttempts[0]?.geofenceRadiusM ?? record.branch.geofenceRadiusM, rejectedAttempts: rejectedAttempts.length, maxLocationAccuracyM: settings.maxLocationAccuracyM } });
    }
    await this.syncDesired(manager, record, desired, finalized, operationId, actorUserId);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshAnomalies() {
    try {
      await this.dataSource.transaction(async (manager) => {
        const [lock] = await manager.query<Array<{ locked: boolean }>>('SELECT pg_try_advisory_xact_lock($1) AS locked', [72007001]);
        if (!lock?.locked) return;
        await this.finalizePastAssignments(manager);
        await this.refreshMissingCheckInWarnings(manager);
        await this.refreshOpenRecords(manager);
      });
    } catch (error) {
      this.logger.error('Không thể cập nhật bất thường chấm công', error instanceof Error ? error.stack : String(error));
    }
  }

  private async finalizePastAssignments(manager: EntityManager) {
    const since = new Date(Date.now() - 60 * 24 * 60 * 60_000);
    const assignments = await manager.getRepository(ShiftAssignment).createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.shift', 'shift')
      .innerJoinAndSelect('shift.branch', 'branch')
      .innerJoinAndSelect('assignment.employee', 'employee')
      .where("assignment.assignmentStatus IN ('assigned','confirmed')")
      .andWhere("shift.status IN ('published','completed')")
      .andWhere('shift.deletedAt IS NULL')
      .andWhere('shift.startsAt >= :since AND shift.startsAt < :now', { since, now: new Date() })
      .getMany();
    for (const assignment of assignments) {
      const workDate = this.dateInTimezone(assignment.shift.startsAt, assignment.shift.branch.timezone);
      if (workDate >= this.dateInTimezone(new Date(), assignment.shift.branch.timezone)) continue;
      let record = await manager.getRepository(AttendanceRecord).findOneBy({ employeeId: assignment.employeeId, shiftAssignmentId: assignment.id, workDate });
      if (!record) {
        const scheduledDuration = Math.max(Math.round((assignment.shift.endsAt.getTime() - assignment.shift.startsAt.getTime()) / 60_000), 0);
        if (await this.approvedLeaveMinutes(manager, assignment.employeeId, assignment.shift.startsAt, assignment.shift.endsAt) >= scheduledDuration) {
          await this.clearAssignmentWarnings(manager, assignment, workDate, 'Ca được bao phủ bởi nghỉ phép đã duyệt');
          continue;
        }
        record = await manager.save(AttendanceRecord, manager.create(AttendanceRecord, {
          employeeId: assignment.employeeId, shiftAssignmentId: assignment.id, branchId: assignment.shift.branchId, workDate,
          actualCheckInAt: null, actualCheckOutAt: null,
          scheduledMinutes: Math.max(scheduledDuration - assignment.shift.unpaidBreakMinutes, 0), workedMinutes: 0, breakMinutes: 0,
          lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'absent', source: 'system',
        }));
      }
      await this.recalculateRecord(record.id, manager, true);
    }
  }

  private async refreshMissingCheckInWarnings(manager: EntityManager) {
    const now = new Date();
    const assignments = await manager.getRepository(ShiftAssignment).createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.shift', 'shift')
      .innerJoinAndSelect('shift.branch', 'branch')
      .innerJoinAndSelect('assignment.employee', 'employee')
      .where("assignment.assignmentStatus IN ('assigned','confirmed')")
      .andWhere("shift.status IN ('published','completed')")
      .andWhere('shift.deletedAt IS NULL')
      .andWhere('shift.startsAt <= :now AND shift.startsAt >= :recent', { now, recent: new Date(now.getTime() - 36 * 60 * 60_000) })
      .getMany();
    for (const assignment of assignments) {
      const settings = await this.ensureSettings(manager, assignment.employee.organizationId);
      if (now.getTime() <= assignment.shift.startsAt.getTime() + settings.missingCheckInReminderMinutes * 60_000) continue;
      const workDate = this.dateInTimezone(assignment.shift.startsAt, assignment.shift.branch.timezone);
      if (workDate !== this.dateInTimezone(now, assignment.shift.branch.timezone)) continue;
      const record = await manager.getRepository(AttendanceRecord).findOneBy({ shiftAssignmentId: assignment.id, employeeId: assignment.employeeId, workDate });
      if (record?.actualCheckInAt) continue;
      if (await this.isCoveredByLeave(manager, assignment.employeeId, assignment.shift.startsAt, assignment.shift.endsAt)) continue;
      await this.upsertAssignmentWarning(manager, assignment, workDate, settings);
    }
  }

  private async refreshOpenRecords(manager: EntityManager) {
    const activeRecords = await manager.getRepository(AttendanceRecord).createQueryBuilder('record')
      .where('record.actualCheckInAt IS NOT NULL AND record.actualCheckOutAt IS NULL')
      .andWhere("record.status = 'open'")
      .getMany();
    for (const record of activeRecords) await this.recalculateRecord(record.id, manager, false);
  }

  private async upsertAssignmentWarning(manager: EntityManager, assignment: ShiftAssignment, workDate: string, settings: AttendanceAnomalySetting) {
    const repository = manager.getRepository(AttendanceViolation);
    let violation = await repository.findOneBy({ employeeId: assignment.employeeId, attendanceRecordId: IsNull(), shiftAssignmentId: assignment.id, violationType: 'missing_check_in', violationDate: workDate });
    const now = new Date();
    const snapshot = { scheduledStartAt: assignment.shift.startsAt, reminderMinutes: settings.missingCheckInReminderMinutes, warningAt: now };
    if (!violation) {
      violation = await repository.save(repository.create({ employeeId: assignment.employeeId, attendanceRecordId: null, shiftAssignmentId: assignment.id, violationType: 'missing_check_in', violationDate: workDate, minutesAffected: Math.max(Math.floor((now.getTime() - assignment.shift.startsAt.getTime()) / 60_000), 0), severity: 'warning', status: 'provisional', details: 'Nhân viên chưa check-in sau giờ bắt đầu ca.', scheduledStartAt: assignment.shift.startsAt, scheduledEndAt: assignment.shift.endsAt, actualStartAt: null, actualEndAt: null, graceMinutes: settings.missingCheckInReminderMinutes, calculationSnapshot: snapshot, calculationVersion: 1, firstDetectedAt: now, lastDetectedAt: now, finalizedAt: null, clearedAt: null, clearedReason: null, excludedBy: null, excludedAt: null, exclusionReason: null, sourceUpdatedAt: assignment.shift.updatedAt, detectedAt: now, resolvedBy: null, resolvedAt: null, resolutionNote: null }));
      await manager.save(AttendanceViolationHistory, manager.create(AttendanceViolationHistory, { attendanceViolationId: violation.id, eventType: 'detected', oldValues: null, newValues: this.violationSnapshot(violation), actorUserId: null, source: 'system', reason: null, operationId: randomUUID() }));
      if (assignment.employee.userId) await manager.save(Notification, manager.create(Notification, { userId: assignment.employee.userId, eventType: 'attendance.reminder.missing_check_in', title: 'Bạn chưa check-in', message: `Ca ${assignment.shift.name} đã bắt đầu. Hãy check-in nếu bạn đang làm việc.`, data: { attendanceViolationId: violation.id, shiftAssignmentId: assignment.id }, actionUrl: '/attendance', readAt: null, expiresAt: assignment.shift.endsAt }));
    } else if (violation.status === 'provisional') {
      violation.minutesAffected = Math.max(Math.floor((now.getTime() - assignment.shift.startsAt.getTime()) / 60_000), 0);
      violation.lastDetectedAt = now;
      violation.calculationSnapshot = snapshot;
      await repository.save(violation);
    }
  }

  private async syncDesired(manager: EntityManager, record: AttendanceRecord, desired: DesiredAnomaly[], finalized: boolean, operationId: string, actorUserId: string | null) {
    const repository = manager.getRepository(AttendanceViolation);
    const existing = await repository.createQueryBuilder('violation')
      .where('violation.employeeId = :employeeId', { employeeId: record.employeeId })
      .andWhere('violation.violationDate = :date', { date: record.workDate })
      .andWhere('(violation.attendanceRecordId = :recordId OR (violation.attendanceRecordId IS NULL AND violation.shiftAssignmentId = :assignmentId))', { recordId: record.id, assignmentId: record.shiftAssignmentId ?? '00000000-0000-0000-0000-000000000000' })
      .getMany();
    const desiredTypes = new Set(desired.map((item) => item.type));
    for (const item of desired) {
      let violation = existing.find((entry) => entry.violationType === item.type && (entry.attendanceRecordId === record.id || entry.attendanceRecordId === null));
      const now = new Date();
      if (!violation) {
        violation = repository.create({ employeeId: record.employeeId, attendanceRecordId: record.id, shiftAssignmentId: record.shiftAssignmentId, violationType: item.type, violationDate: record.workDate, firstDetectedAt: now, detectedAt: now, resolvedBy: null, resolvedAt: null, resolutionNote: null, excludedBy: null, excludedAt: null, exclusionReason: null });
      }
      const oldValues = violation.id ? this.violationSnapshot(violation) : null;
      violation.attendanceRecordId = record.id;
      violation.shiftAssignmentId = record.shiftAssignmentId;
      violation.minutesAffected = item.minutes;
      violation.severity = item.severity;
      if (violation.status !== 'excluded') violation.status = item.status;
      violation.details = item.details;
      violation.scheduledStartAt = record.shiftAssignment?.shift.startsAt ?? null;
      violation.scheduledEndAt = record.shiftAssignment?.shift.endsAt ?? null;
      violation.actualStartAt = record.actualCheckInAt;
      violation.actualEndAt = record.actualCheckOutAt;
      violation.graceMinutes = item.grace;
      violation.calculationSnapshot = item.snapshot;
      violation.calculationVersion = 1;
      violation.lastDetectedAt = now;
      violation.finalizedAt = item.status === 'active' && finalized ? (violation.finalizedAt ?? now) : null;
      violation.clearedAt = null;
      violation.clearedReason = null;
      violation.sourceUpdatedAt = record.updatedAt;
      violation = await repository.save(violation);
      const newValues = this.violationSnapshot(violation);
      if (!oldValues || JSON.stringify(oldValues) !== JSON.stringify(newValues)) {
        await manager.save(AttendanceViolationHistory, manager.create(AttendanceViolationHistory, { attendanceViolationId: violation.id, eventType: oldValues ? 'recalculated' : 'detected', oldValues, newValues, actorUserId, source: actorUserId ? 'user' : 'system', reason: actorUserId ? 'Tính lại theo yêu cầu người dùng' : null, operationId }));
        if (!oldValues && item.status === 'active' && ['absence', 'missing_check_out'].includes(item.type) && record.employee.userId) {
          await manager.save(Notification, manager.create(Notification, { userId: record.employee.userId, eventType: `attendance_anomaly.${item.type}`, title: item.type === 'absence' ? 'Ca làm được ghi nhận vắng mặt' : 'Phiên chấm công thiếu check-out', message: item.details, data: { attendanceViolationId: violation.id, attendanceRecordId: record.id }, actionUrl: '/attendance', readAt: null, expiresAt: null }));
        }
      }
    }
    for (const violation of existing.filter((entry) => !desiredTypes.has(entry.violationType as AnomalyType) && ['active', 'provisional', 'excluded'].includes(entry.status))) {
      const oldValues = this.violationSnapshot(violation);
      violation.status = 'cleared';
      violation.clearedAt = new Date();
      violation.clearedReason = 'Dữ liệu nguồn đã thay đổi hoặc điều kiện bất thường không còn đúng';
      violation.lastDetectedAt = new Date();
      await repository.save(violation);
      await manager.save(AttendanceViolationHistory, manager.create(AttendanceViolationHistory, { attendanceViolationId: violation.id, eventType: 'cleared', oldValues, newValues: this.violationSnapshot(violation), actorUserId, source: actorUserId ? 'user' : 'system', reason: violation.clearedReason, operationId }));
    }
  }

  private async clearAssignmentWarnings(manager: EntityManager, assignment: ShiftAssignment, workDate: string, reason: string) {
    const violations = await manager.getRepository(AttendanceViolation).findBy({ employeeId: assignment.employeeId, shiftAssignmentId: assignment.id, violationDate: workDate, status: 'provisional' });
    for (const violation of violations) {
      const oldValues = this.violationSnapshot(violation);
      violation.status = 'cleared'; violation.clearedAt = new Date(); violation.clearedReason = reason;
      await manager.save(violation);
      await manager.save(AttendanceViolationHistory, manager.create(AttendanceViolationHistory, { attendanceViolationId: violation.id, eventType: 'cleared', oldValues, newValues: this.violationSnapshot(violation), actorUserId: null, source: 'system', reason, operationId: randomUUID() }));
    }
  }

  private buildListQuery(query: AttendanceAnomalyQueryDto, scope: AttendanceScope) {
    const builder = this.buildBaseQuery();
    this.applyScope(builder, scope, 'employee');
    if (query.from) builder.andWhere('violation.violationDate >= :from', { from: query.from });
    if (query.to) builder.andWhere('violation.violationDate <= :to', { to: query.to });
    if (query.type) builder.andWhere('violation.violationType = :type', { type: query.type });
    if (query.status) builder.andWhere('violation.status = :status', { status: query.status });
    else builder.andWhere("violation.status IN ('active','provisional')");
    if (query.severity) builder.andWhere('violation.severity = :severity', { severity: query.severity });
    if (query.employeeId) builder.andWhere('violation.employeeId = :employeeId', { employeeId: query.employeeId });
    if (query.branchId) builder.andWhere('employee.primaryBranchId = :branchId', { branchId: query.branchId });
    if (query.departmentId) builder.andWhere('employee.departmentId = :departmentId', { departmentId: query.departmentId });
    if (query.search?.trim()) builder.andWhere("(employee.employeeCode ILIKE :search OR CONCAT(employee.lastName, ' ', employee.firstName) ILIKE :search)", { search: `%${query.search.trim()}%` });
    return builder.orderBy('violation.violationDate', 'DESC').addOrderBy('violation.lastDetectedAt', 'DESC');
  }

  private buildBaseQuery() {
    return this.violationRepository.createQueryBuilder('violation')
      .innerJoinAndSelect('violation.employee', 'employee')
      .innerJoinAndSelect('employee.primaryBranch', 'employeeBranch')
      .innerJoinAndSelect('employee.department', 'employeeDepartment')
      .leftJoinAndSelect('violation.attendanceRecord', 'record')
      .leftJoinAndSelect('record.branch', 'recordBranch')
      .leftJoinAndSelect('violation.shiftAssignment', 'assignment')
      .leftJoinAndSelect('assignment.shift', 'shift')
      .leftJoinAndSelect('violation.excludedByUser', 'excludedByUser');
  }

  private listItem(item: AttendanceViolation) {
    const shift = item.shiftAssignment?.shift;
    return {
      id: item.id, type: item.violationType, date: item.violationDate, status: item.status, severity: item.severity,
      minutesAffected: item.minutesAffected, details: item.details, detectedAt: item.detectedAt, lastDetectedAt: item.lastDetectedAt,
      scheduledStartAt: item.scheduledStartAt, scheduledEndAt: item.scheduledEndAt, actualStartAt: item.actualStartAt, actualEndAt: item.actualEndAt,
      employee: { id: item.employee.id, employeeCode: item.employee.employeeCode, fullName: this.employeeName(item.employee), branch: { id: item.employee.primaryBranchId, name: item.employee.primaryBranch.name }, department: { id: item.employee.departmentId, name: item.employee.department.name } },
      shift: shift ? { id: shift.id, name: shift.name, startsAt: shift.startsAt, endsAt: shift.endsAt } : null,
      attendanceRecordId: item.attendanceRecordId,
    };
  }

  private async approvedLeaveMinutes(manager: EntityManager, employeeId: string, startsAt: Date, endsAt: Date) {
    const requests = await manager.getRepository(LeaveRequest).createQueryBuilder('request')
      .where('request.employeeId = :employeeId', { employeeId })
      .andWhere("request.status = 'approved'")
      .andWhere('request.startsAt < :endsAt AND request.endsAt > :startsAt', { startsAt, endsAt })
      .getMany();
    return Math.min(requests.reduce((sum, request) => {
      const overlapStart = Math.max(startsAt.getTime(), request.startsAt.getTime());
      const overlapEnd = Math.min(endsAt.getTime(), request.endsAt.getTime());
      return sum + Math.max(Math.round((overlapEnd - overlapStart) / 60_000), 0);
    }, 0), Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
  }

  private async isCoveredByLeave(manager: EntityManager, employeeId: string, startsAt: Date, endsAt: Date) {
    const duration = Math.max(Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000), 0);
    return duration > 0 && await this.approvedLeaveMinutes(manager, employeeId, startsAt, endsAt) >= duration;
  }

  private calculateBreak(events: AttendanceEvent[], until: Date) {
    let start: Date | null = null;
    let minutes = 0;
    for (const event of events) {
      if (event.eventType === 'break_start') start = event.occurredAt;
      if (event.eventType === 'break_end' && start) { minutes += Math.max(Math.floor((event.occurredAt.getTime() - start.getTime()) / 60_000), 0); start = null; }
    }
    if (start) minutes += Math.max(Math.floor((until.getTime() - start.getTime()) / 60_000), 0);
    return { minutes, active: Boolean(start) };
  }

  private endOfWorkDate(workDate: string, timezone: string) {
    const localEndAsUtc = new Date(`${workDate}T23:59:59.999Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(localEndAsUtc);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    const timezoneOffsetMs = representedAsUtc - localEndAsUtc.getTime();
    return new Date(localEndAsUtc.getTime() - timezoneOffsetMs);
  }

  private async ensureSettings(manager?: EntityManager, organizationId?: string) {
    const organization = organizationId ? null : await this.organizationRepository.find({ order: { createdAt: 'ASC' }, take: 1 }).then((items) => items[0]);
    const id = organizationId ?? organization?.id;
    if (!id) throw new NotFoundException('Chưa cấu hình doanh nghiệp');
    const repository = manager ? manager.getRepository(AttendanceAnomalySetting) : this.settingRepository;
    let setting = await repository.findOneBy({ organizationId: id });
    if (!setting) setting = await repository.save(repository.create({ organizationId: id, lateGraceMinutes: 15, earlyLeaveGraceMinutes: 0, insufficientToleranceMinutes: 0, missingCheckInReminderMinutes: 15, maxLocationAccuracyM: 100, lateCriticalMinutes: 60, earlyLeaveCriticalMinutes: 60, breakCriticalMinutes: 30, insufficientCriticalMinutes: 60 }));
    return setting;
  }

  private async resolveScope(actor: AuthUser): Promise<AttendanceScope> {
    const roles = new Set(actor.roles.map((role) => role.code));
    if (roles.has('SUPER_ADMIN') || roles.has('ADMIN') || roles.has('HR') || roles.has('PAYROLL')) return { unrestricted: true, branchIds: [], departmentIds: [], selfEmployeeId: null };
    if (roles.has('MANAGER')) {
      const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER');
      const branchIds = managerRoles.flatMap((role) => role.branchId ? [role.branchId] : []);
      const departmentIds = managerRoles.flatMap((role) => role.departmentId ? [role.departmentId] : []);
      if (!branchIds.length && !departmentIds.length && actor.employeeId) {
        const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
        if (employee) branchIds.push(employee.primaryBranchId);
      }
      return { unrestricted: false, branchIds, departmentIds, selfEmployeeId: null };
    }
    if (actor.employeeId) return { unrestricted: false, branchIds: [], departmentIds: [], selfEmployeeId: actor.employeeId };
    throw new ForbiddenException('Tài khoản không có phạm vi xem bất thường');
  }

  private applyScope<T extends ObjectLiteral>(builder: SelectQueryBuilder<T>, scope: AttendanceScope, employeeAlias: string) {
    if (scope.unrestricted) return builder;
    if (scope.selfEmployeeId) return builder.andWhere(`${employeeAlias}.id = :scopeEmployeeId`, { scopeEmployeeId: scope.selfEmployeeId });
    if (!scope.branchIds.length && !scope.departmentIds.length) return builder.andWhere('1 = 0');
    return builder.andWhere(new Brackets((where) => {
      if (scope.branchIds.length) where.where(`${employeeAlias}.primaryBranchId IN (:...scopeBranchIds)`, { scopeBranchIds: scope.branchIds });
      if (scope.departmentIds.length) (scope.branchIds.length ? where.orWhere.bind(where) : where.where.bind(where))(`${employeeAlias}.departmentId IN (:...scopeDepartmentIds)`, { scopeDepartmentIds: scope.departmentIds });
    }));
  }

  private assertScope(employee: Employee, scope: AttendanceScope) {
    if (scope.unrestricted) return;
    if (scope.selfEmployeeId === employee.id) return;
    if (scope.branchIds.includes(employee.primaryBranchId) || scope.departmentIds.includes(employee.departmentId)) return;
    throw new NotFoundException('Không tìm thấy bất thường trong phạm vi được phép');
  }

  private async countScheduledShifts(query: AttendanceAnomalyQueryDto, scope: AttendanceScope) {
    const builder = this.assignmentRepository.createQueryBuilder('assignment').innerJoin('assignment.shift', 'shift').innerJoin('assignment.employee', 'employee')
      .where("assignment.assignmentStatus IN ('assigned','confirmed')").andWhere("shift.status IN ('published','completed')").andWhere('shift.deletedAt IS NULL');
    this.applyScope(builder, scope, 'employee');
    if (query.from) builder.andWhere('DATE(shift.startsAt AT TIME ZONE :timezone) >= :from', { timezone: 'Asia/Ho_Chi_Minh', from: query.from });
    if (query.to) builder.andWhere('DATE(shift.startsAt AT TIME ZONE :timezone) <= :to', { timezone: 'Asia/Ho_Chi_Minh', to: query.to });
    if (query.employeeId) builder.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    if (query.branchId) builder.andWhere('employee.primaryBranchId = :branchId', { branchId: query.branchId });
    if (query.departmentId) builder.andWhere('employee.departmentId = :departmentId', { departmentId: query.departmentId });
    return builder.getCount();
  }

  private violationSnapshot(violation: AttendanceViolation) {
    return { status: violation.status, severity: violation.severity, minutesAffected: violation.minutesAffected, details: violation.details, graceMinutes: violation.graceMinutes, calculationSnapshot: violation.calculationSnapshot, finalizedAt: violation.finalizedAt, clearedAt: violation.clearedAt, excludedAt: violation.excludedAt };
  }

  private employeeName(employee: Employee) { return employee.preferredName?.trim() || `${employee.lastName} ${employee.firstName}`.trim(); }
  private dateInTimezone(date: Date, timezone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
}
