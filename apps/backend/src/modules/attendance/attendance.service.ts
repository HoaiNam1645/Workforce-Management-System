import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { Brackets, DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { Employee } from '../employees/entities/employee.entity';
import { Branch } from '../organization/entities/branch.entity';
import { ShiftAssignment } from '../schedules/entities/shift-assignment.entity';
import { Shift } from '../schedules/entities/shift.entity';
import { AttendanceHistoryQueryDto, CreateAttendanceAdjustmentDto, LiveShiftQueryDto, ReviewAttendanceAdjustmentDto } from './dto/attendance-history.dto';
import { ClockActionDto, UpdateBranchGeofenceDto } from './dto/clock-action.dto';
import { AttendanceAdjustmentRequest } from './entities/attendance-adjustment-request.entity';
import { AttendanceEvent } from './entities/attendance-event.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { AttendanceViolation } from './entities/attendance-violation.entity';

type RequestContext = {
  userAgent?: string;
  ipAddress: string;
};

type AttendanceEventType = 'check_in' | 'check_out' | 'break_start' | 'break_end';
type AttendanceScope = { unrestricted: boolean; branchIds: string[]; departmentIds: string[] };
type LiveShiftState = 'upcoming' | 'not_checked_in' | 'working' | 'on_break' | 'checked_out' | 'absent' | 'missing_checkout';
const sharp = require('sharp') as typeof import('sharp').default;
const LATE_GRACE_MINUTES = 15;

export type AttendanceSelfieFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly uploadRoot = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads');

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Shift) private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(AttendanceRecord) private readonly recordRepository: Repository<AttendanceRecord>,
    @InjectRepository(AttendanceEvent) private readonly eventRepository: Repository<AttendanceEvent>,
    @InjectRepository(AttendanceAdjustmentRequest) private readonly adjustmentRepository: Repository<AttendanceAdjustmentRequest>,
    @InjectRepository(AttendanceViolation) private readonly violationRepository: Repository<AttendanceViolation>,
    @InjectRepository(Branch) private readonly branchRepository: Repository<Branch>,
  ) {}

  async getMyAttendance(actor: AuthUser) {
    const employee = await this.getEmployee(actor);
    const now = new Date();
    await this.reconcileOpenRecords(employee.id, now);
    const currentRecord = await this.findOpenRecord(employee.id);
    const events = currentRecord
      ? await this.eventRepository.find({ where: { attendanceRecordId: currentRecord.id }, order: { occurredAt: 'ASC' } })
      : [];
    const nextAssignment = currentRecord?.shiftAssignment ?? await this.findClockableAssignment(employee.id, now);
    const outsideRecord = await this.recordRepository.findOneBy({
      employeeId: employee.id,
      shiftAssignmentId: IsNull(),
      workDate: this.dateInTimezone(now, employee.primaryBranch.timezone),
    });

    return this.toResponse(employee, currentRecord, events, nextAssignment, !outsideRecord?.actualCheckInAt, now);
  }

  async getEventSelfie(id: string, actor: AuthUser) {
    const event = await this.eventRepository.findOneBy({ id });
    if (!event?.photoUrl) throw new NotFoundException('Không tìm thấy ảnh selfie chấm công');
    const canReviewAttendance = actor.permissions.includes('attendance.adjust');
    if (event.employeeId !== actor.employeeId && !canReviewAttendance) {
      throw new ForbiddenException('Bạn không có quyền xem ảnh selfie này');
    }
    try {
      return await readFile(this.selfieAbsolutePath(event.photoUrl));
    } catch {
      throw new NotFoundException('File ảnh selfie không còn tồn tại');
    }
  }

  async checkIn(dto: ClockActionDto, actor: AuthUser, context: RequestContext, selfie?: AttendanceSelfieFile) {
    const preparedSelfie = await this.prepareSelfie(selfie);
    const employee = await this.getEmployee(actor);
    const now = new Date();
    await this.reconcileOpenRecords(employee.id, now);
    let photoUrl: string | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        const openRecord = await this.findOpenRecord(employee.id, manager, true);
        if (openRecord) throw new BadRequestException('Bạn đã check-in và chưa check-out ca hiện tại');

        const assignment = await this.findClockableAssignment(employee.id, now, manager);
        const branch = assignment?.shift.branch ?? employee.primaryBranch;
        if (!assignment && !dto.outsideScheduleReason?.trim()) {
          throw new BadRequestException('Hãy nhập lý do khi check-in ngoài lịch');
        }
        const workDate = this.dateInTimezone(assignment?.shift.startsAt ?? now, branch.timezone);
        const recordQuery = manager.getRepository(AttendanceRecord).createQueryBuilder('record')
          .setLock('pessimistic_write')
          .where('record.employee_id = :employeeId', { employeeId: employee.id })
          .andWhere('record.work_date = :workDate', { workDate });
        if (assignment) recordQuery.andWhere('record.shift_assignment_id = :assignmentId', { assignmentId: assignment.id });
        else recordQuery.andWhere('record.shift_assignment_id IS NULL');
        let record = await recordQuery.getOne();
        if (record?.actualCheckInAt) throw new BadRequestException('Ca làm này đã được check-in trước đó');

        const scheduledMinutes = assignment ? Math.max(
          Math.round((assignment.shift.endsAt.getTime() - assignment.shift.startsAt.getTime()) / 60_000) - assignment.shift.unpaidBreakMinutes,
          0,
        ) : 0;
        const lateMinutes = assignment ? Math.max(Math.floor((now.getTime() - assignment.shift.startsAt.getTime()) / 60_000), 0) : 0;
        record ??= manager.getRepository(AttendanceRecord).create({
          employeeId: employee.id,
          shiftAssignmentId: assignment?.id ?? null,
          branchId: branch.id,
          workDate,
          actualCheckOutAt: null,
          workedMinutes: 0,
          breakMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeMinutes: 0,
          source: 'system',
        });
        record.actualCheckInAt = now;
        record.actualCheckOutAt = null;
        record.scheduledMinutes = scheduledMinutes;
        record.lateMinutes = lateMinutes;
        record.status = 'open';
        record.updatedAt = now;
        record = await manager.save(record);
        await this.syncLateViolation(manager, record);
        photoUrl = await this.storeSelfie(preparedSelfie, employee.id, 'check_in', now);
        await this.createEvent(manager, record, branch, employee.id, 'check_in', now, dto, actor.id, context, photoUrl);
      });
    } catch (error) {
      if (photoUrl) await this.removeSelfie(photoUrl);
      throw error;
    }

    return this.getMyAttendance(actor);
  }

  async startBreak(dto: ClockActionDto, actor: AuthUser, context: RequestContext) {
    await this.runOnOpenRecord(dto, actor, context, async (manager, record, events, now) => {
      const lastEvent = events.at(-1);
      if (lastEvent?.eventType === 'break_start') throw new BadRequestException('Bạn đang trong thời gian nghỉ');
      if (events.some((event) => event.eventType === 'break_start')) {
        throw new BadRequestException('Mỗi ca chỉ được nghỉ một lần và bạn đã sử dụng lượt nghỉ của ca này');
      }
      if (!lastEvent || !['check_in', 'break_end'].includes(lastEvent.eventType)) {
        throw new BadRequestException('Không thể bắt đầu nghỉ ở trạng thái hiện tại');
      }
      this.validateBreakLocation(dto, record.branch);
      await this.createEvent(manager, record, record.branch, actor.employeeId!, 'break_start', now, dto, actor.id, context);
    });
    return this.getMyAttendance(actor);
  }

  async endBreak(dto: ClockActionDto, actor: AuthUser, context: RequestContext) {
    await this.runOnOpenRecord(dto, actor, context, async (manager, record, events, now) => {
      if (events.at(-1)?.eventType !== 'break_start') throw new BadRequestException('Bạn chưa bắt đầu thời gian nghỉ');
      this.validateBreakLocation(dto, record.branch);
      const newEvent = await this.createEvent(manager, record, record.branch, actor.employeeId!, 'break_end', now, dto, actor.id, context);
      record.breakMinutes = this.calculateBreakMinutes([...events, newEvent]);
      record.updatedAt = now;
      await manager.save(record);
      await this.syncBreakViolation(manager, record);
    });
    return this.getMyAttendance(actor);
  }

  async checkOut(dto: ClockActionDto, actor: AuthUser, context: RequestContext, selfie?: AttendanceSelfieFile) {
    const preparedSelfie = await this.prepareSelfie(selfie);
    let photoUrl: string | null = null;
    try {
      await this.runOnOpenRecord(dto, actor, context, async (manager, record, events, now) => {
        if (events.at(-1)?.eventType === 'break_start') {
          throw new BadRequestException('Hãy kết thúc thời gian nghỉ trước khi check-out');
        }
        if (!record.actualCheckInAt) throw new BadRequestException('Không tìm thấy thời gian check-in');
        const assignment = record.shiftAssignment;
        const breakMinutes = this.calculateBreakMinutes(events);
        const totalMinutes = Math.max(Math.floor((now.getTime() - record.actualCheckInAt.getTime()) / 60_000), 0);
        record.actualCheckOutAt = now;
        record.breakMinutes = breakMinutes;
        record.workedMinutes = Math.max(totalMinutes - breakMinutes, 0);
        record.earlyLeaveMinutes = assignment ? Math.max(Math.ceil((assignment.shift.endsAt.getTime() - now.getTime()) / 60_000), 0) : 0;
        record.overtimeMinutes = assignment ? Math.max(Math.floor((now.getTime() - assignment.shift.endsAt.getTime()) / 60_000), 0) : 0;
        record.status = 'completed';
        record.updatedAt = now;
        await manager.save(record);
        await this.syncBreakViolation(manager, record);
        photoUrl = await this.storeSelfie(preparedSelfie, actor.employeeId!, 'check_out', now);
        await this.createEvent(manager, record, record.branch, actor.employeeId!, 'check_out', now, dto, actor.id, context, photoUrl);
      });
    } catch (error) {
      if (photoUrl) await this.removeSelfie(photoUrl);
      throw error;
    }
    return this.getMyAttendance(actor);
  }

  async getMyHistory(query: AttendanceHistoryQueryDto, actor: AuthUser) {
    const employee = await this.getEmployee(actor);
    const now = new Date();
    const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const to = query.to ? new Date(query.to) : new Date(now.getTime() + 24 * 60 * 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('Khoảng thời gian lịch sử không hợp lệ');
    }

    const [records, assignments] = await Promise.all([
      this.recordRepository.createQueryBuilder('record')
        .leftJoinAndSelect('record.branch', 'branch')
        .leftJoinAndSelect('record.shiftAssignment', 'assignment')
        .leftJoinAndSelect('assignment.shift', 'shift')
        .where('record.employee_id = :employeeId', { employeeId: employee.id })
        .andWhere('record.work_date >= :fromDate AND record.work_date <= :toDate', {
          fromDate: this.dateInTimezone(from, employee.primaryBranch.timezone),
          toDate: this.dateInTimezone(to, employee.primaryBranch.timezone),
        })
        .getMany(),
      this.assignmentRepository.createQueryBuilder('assignment')
        .innerJoinAndSelect('assignment.shift', 'shift')
        .innerJoinAndSelect('shift.branch', 'branch')
        .where('assignment.employee_id = :employeeId', { employeeId: employee.id })
        .andWhere('assignment.assignment_status IN (:...statuses)', { statuses: ['assigned', 'confirmed'] })
        .andWhere("shift.status IN ('published', 'completed')")
        .andWhere('shift.deleted_at IS NULL')
        .andWhere('shift.starts_at >= :from AND shift.starts_at < :to', { from, to })
        .getMany(),
    ]);
    const recordIds = records.map((record) => record.id);
    const [events, adjustments, violations] = recordIds.length ? await Promise.all([
      this.eventRepository.find({ where: { attendanceRecordId: In(recordIds) }, order: { occurredAt: 'ASC' } }),
      this.adjustmentRepository.find({ where: { attendanceRecordId: In(recordIds) }, order: { requestedAt: 'DESC' } }),
      this.violationRepository.find({ where: { attendanceRecordId: In(recordIds) }, order: { detectedAt: 'DESC' } }),
    ]) : [[], [], []];
    const recordByAssignment = new Map(records.filter((record) => record.shiftAssignmentId).map((record) => [record.shiftAssignmentId!, record]));
    const eventsByRecord = this.groupBy(events, (event) => event.attendanceRecordId);
    const adjustmentsByRecord = this.groupBy(adjustments, (request) => request.attendanceRecordId);
    const violationsByRecord = this.groupBy(violations, (violation) => violation.attendanceRecordId!);
    const scheduledItems = assignments.map((assignment) => {
      const record = recordByAssignment.get(assignment.id) ?? null;
      return this.historyItem(record, assignment, eventsByRecord, adjustmentsByRecord, violationsByRecord, now);
    });
    const outsideItems = records
      .filter((record) => !record.shiftAssignmentId)
      .map((record) => this.historyItem(record, null, eventsByRecord, adjustmentsByRecord, violationsByRecord, now));
    return [...scheduledItems, ...outsideItems].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime()).map(({ sortAt: _sortAt, ...item }) => item);
  }

  async requestAdjustment(dto: CreateAttendanceAdjustmentDto, actor: AuthUser) {
    const employee = await this.getEmployee(actor);
    if (!dto.attendanceRecordId && !dto.shiftAssignmentId) {
      throw new BadRequestException('Cần chọn phiên chấm công hoặc ca làm cần điều chỉnh');
    }
    if (!dto.requestedCheckInAt && !dto.requestedCheckOutAt) {
      throw new BadRequestException('Cần nhập thời gian check-in hoặc check-out đề nghị');
    }

    let record = dto.attendanceRecordId
      ? await this.recordRepository.findOne({ where: { id: dto.attendanceRecordId, employeeId: employee.id }, relations: { shiftAssignment: { shift: { branch: true } } } })
      : null;
    if (!record && dto.shiftAssignmentId) {
      const assignment = await this.assignmentRepository.findOne({
        where: { id: dto.shiftAssignmentId, employeeId: employee.id },
        relations: { shift: { branch: true } },
      });
      if (!assignment) throw new NotFoundException('Không tìm thấy ca làm cần điều chỉnh');
      record = await this.recordRepository.findOne({ where: { employeeId: employee.id, shiftAssignmentId: assignment.id } });
      record ??= await this.recordRepository.save(this.recordRepository.create({
        employeeId: employee.id,
        shiftAssignmentId: assignment.id,
        branchId: assignment.shift.branchId,
        workDate: this.dateInTimezone(assignment.shift.startsAt, assignment.shift.branch.timezone),
        actualCheckInAt: null,
        actualCheckOutAt: null,
        scheduledMinutes: Math.max(Math.round((assignment.shift.endsAt.getTime() - assignment.shift.startsAt.getTime()) / 60_000) - assignment.shift.unpaidBreakMinutes, 0),
        workedMinutes: 0,
        breakMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        status: 'missing_check_in',
        source: 'system',
      }));
    }
    if (!record) throw new NotFoundException('Không tìm thấy dữ liệu chấm công cần điều chỉnh');
    const existing = await this.adjustmentRepository.findOneBy({ attendanceRecordId: record.id, employeeId: employee.id, status: 'pending' });
    if (existing) throw new BadRequestException('Phiên này đã có yêu cầu điều chỉnh đang chờ duyệt');

    const requestedCheckInAt = dto.requestedCheckInAt ? new Date(dto.requestedCheckInAt) : null;
    const requestedCheckOutAt = dto.requestedCheckOutAt ? new Date(dto.requestedCheckOutAt) : null;
    const effectiveCheckIn = requestedCheckInAt ?? record.actualCheckInAt;
    const effectiveCheckOut = requestedCheckOutAt ?? record.actualCheckOutAt;
    if (effectiveCheckIn && effectiveCheckOut && effectiveCheckOut < effectiveCheckIn) {
      throw new BadRequestException('Thời gian check-out phải sau thời gian check-in');
    }
    return this.adjustmentRepository.save(this.adjustmentRepository.create({
      attendanceRecordId: record.id,
      employeeId: employee.id,
      requestedCheckInAt,
      requestedCheckOutAt,
      reason: dto.reason.trim(),
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
    }));
  }

  async getAdjustmentRequests(_actor: AuthUser) {
    const requests = await this.adjustmentRepository.find({
      relations: { employee: true, attendanceRecord: { branch: true, shiftAssignment: { shift: true } } },
      order: { requestedAt: 'DESC' },
      take: 200,
    });
    const recordIds = [...new Set(requests.map((request) => request.attendanceRecordId))];
    const selfieEvents = recordIds.length
      ? await this.eventRepository.find({
        where: { attendanceRecordId: In(recordIds), eventType: In(['check_in', 'check_out']) },
        order: { occurredAt: 'ASC' },
      })
      : [];
    const selfiesByRecord = this.groupBy(selfieEvents, (event) => event.attendanceRecordId);
    return requests.map((request) => ({
      id: request.id,
      employee: { id: request.employee.id, employeeCode: request.employee.employeeCode, fullName: request.employee.preferredName || `${request.employee.lastName} ${request.employee.firstName}`.trim() },
      recordId: request.attendanceRecordId,
      workDate: request.attendanceRecord.workDate,
      shiftName: request.attendanceRecord.shiftAssignment?.shift.name ?? 'Ngoài lịch',
      branchName: request.attendanceRecord.branch.name,
      currentCheckInAt: request.attendanceRecord.actualCheckInAt,
      currentCheckOutAt: request.attendanceRecord.actualCheckOutAt,
      requestedCheckInAt: request.requestedCheckInAt,
      requestedCheckOutAt: request.requestedCheckOutAt,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewNote: request.reviewNote,
      selfies: (selfiesByRecord.get(request.attendanceRecordId) ?? [])
        .filter((event) => event.photoUrl)
        .map((event) => ({
          eventId: event.id,
          type: event.eventType,
          occurredAt: event.occurredAt,
          photoUrl: `/attendance/events/${event.id}/selfie`,
        })),
    }));
  }

  async getLiveShifts(query: LiveShiftQueryDto, actor: AuthUser) {
    const now = new Date();
    await this.reconcileOpenRecords(undefined, now);
    const workDate = query.date ?? this.dateInTimezone(now, 'Asia/Ho_Chi_Minh');
    const parsedDate = new Date(`${workDate}T00:00:00+07:00`);
    if (Number.isNaN(parsedDate.getTime()) || this.dateInTimezone(parsedDate, 'Asia/Ho_Chi_Minh') !== workDate) {
      throw new BadRequestException('Ngày theo dõi không hợp lệ');
    }

    const scope = await this.resolveAttendanceScope(actor);
    const shiftQuery = this.shiftRepository.createQueryBuilder('shift')
      .innerJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'shiftDepartment')
      .leftJoinAndSelect('shift.position', 'shiftPosition')
      .leftJoinAndSelect(
        'shift.assignments',
        'assignment',
        'assignment.assignment_status IN (:...assignmentStatuses)',
        { assignmentStatuses: ['assigned', 'confirmed'] },
      )
      .leftJoinAndSelect('assignment.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'employeeDepartment')
      .leftJoinAndSelect('employee.position', 'employeePosition')
      .where("shift.status IN ('published', 'completed')")
      .andWhere('shift.deleted_at IS NULL')
      .andWhere('DATE(shift.starts_at AT TIME ZONE branch.timezone) = :workDate', { workDate })
      .orderBy('shift.starts_at', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.first_name', 'ASC');

    if (!scope.unrestricted) {
      shiftQuery.andWhere(new Brackets((where) => {
        if (scope.branchIds.length) {
          where.where('shift.branch_id IN (:...scopeBranchIds)', { scopeBranchIds: scope.branchIds });
        }
        if (scope.departmentIds.length) {
          const method = scope.branchIds.length ? 'orWhere' : 'where';
          where[method]('shift.department_id IN (:...scopeDepartmentIds)', { scopeDepartmentIds: scope.departmentIds });
        }
      }));
    }

    const scopedShifts = await shiftQuery.getMany();
    const availableBranches = [...new Map(scopedShifts.map((shift) => [shift.branch.id, {
      id: shift.branch.id,
      code: shift.branch.code,
      name: shift.branch.name,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const availableDepartments = [...new Map(scopedShifts
      .filter((shift) => shift.department)
      .map((shift) => [shift.department!.id, {
        id: shift.department!.id,
        code: shift.department!.code,
        name: shift.department!.name,
      }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const shifts = scopedShifts.filter((shift) => (
      (!query.branchId || shift.branchId === query.branchId)
      && (!query.departmentId || shift.departmentId === query.departmentId)
      && (!query.shiftId || shift.id === query.shiftId)
    ));
    const assignments = shifts.flatMap((shift) => shift.assignments ?? []);
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const records = assignmentIds.length
      ? await this.recordRepository.find({
        where: { shiftAssignmentId: In(assignmentIds) },
        order: { updatedAt: 'DESC' },
      })
      : [];
    const recordByAssignment = new Map<string, AttendanceRecord>();
    for (const record of records) {
      if (record.shiftAssignmentId && !recordByAssignment.has(record.shiftAssignmentId)) {
        recordByAssignment.set(record.shiftAssignmentId, record);
      }
    }
    const recordIds = [...recordByAssignment.values()].map((record) => record.id);
    const events = recordIds.length
      ? await this.eventRepository.find({
        where: { attendanceRecordId: In(recordIds) },
        order: { occurredAt: 'ASC' },
      })
      : [];
    const eventsByRecord = this.groupBy(events, (event) => event.attendanceRecordId);

    const emptyCounts = (): Record<LiveShiftState, number> => ({
      upcoming: 0,
      not_checked_in: 0,
      working: 0,
      on_break: 0,
      checked_out: 0,
      absent: 0,
      missing_checkout: 0,
    });
    const overallCounts = emptyCounts();

    const items = shifts.map((shift) => {
      const counts = emptyCounts();
      const employees = (shift.assignments ?? []).map((assignment) => {
        const record = recordByAssignment.get(assignment.id) ?? null;
        const recordEvents = record ? eventsByRecord.get(record.id) ?? [] : [];
        const lastEvent = recordEvents.at(-1) ?? null;
        const breakState = this.calculateLiveBreak(recordEvents, now);
        const shiftWorkDate = this.dateInTimezone(shift.startsAt, shift.branch.timezone);
        const isAfterWorkDate = this.dateInTimezone(now, shift.branch.timezone) > shiftWorkDate;
        let state: LiveShiftState;
        if (record?.actualCheckOutAt) state = 'checked_out';
        else if (record?.actualCheckInAt && isAfterWorkDate) state = 'missing_checkout';
        else if (record?.actualCheckInAt && breakState.activeStartedAt) state = 'on_break';
        else if (record?.actualCheckInAt) state = 'working';
        else if (now >= shift.endsAt) state = 'absent';
        else if (now >= shift.startsAt) state = 'not_checked_in';
        else state = 'upcoming';

        counts[state] += 1;
        overallCounts[state] += 1;
        const minutesFromStart = Math.max(Math.floor((now.getTime() - shift.startsAt.getTime()) / 60_000), 0);
        const lateMinutes = record?.actualCheckInAt
          ? record.lateMinutes
          : ['not_checked_in', 'absent'].includes(state) ? minutesFromStart : 0;
        const badges: string[] = [];
        if (lateMinutes > LATE_GRACE_MINUTES) badges.push('late');
        if (record?.earlyLeaveMinutes && record.earlyLeaveMinutes > 0) badges.push('early_leave');
        if (recordEvents.some((event) => event.isWithinGeofence === false)) badges.push('outside_geofence');
        if (breakState.totalMinutes > shift.unpaidBreakMinutes) badges.push('excessive_break');

        return {
          assignmentId: assignment.id,
          state,
          badges,
          employee: {
            id: assignment.employee.id,
            employeeCode: assignment.employee.employeeCode,
            fullName: assignment.employee.preferredName || `${assignment.employee.lastName} ${assignment.employee.firstName}`.trim(),
            avatarUrl: assignment.employee.avatarUrl,
            department: assignment.employee.department ? {
              id: assignment.employee.department.id,
              name: assignment.employee.department.name,
            } : null,
            position: assignment.employee.position ? {
              id: assignment.employee.position.id,
              name: assignment.employee.position.name,
            } : null,
          },
          attendance: {
            recordId: record?.id ?? null,
            checkInAt: record?.actualCheckInAt ?? null,
            checkOutAt: record?.actualCheckOutAt ?? null,
            currentBreakStartedAt: breakState.activeStartedAt,
            breakMinutes: breakState.totalMinutes,
            allowedBreakMinutes: shift.unpaidBreakMinutes,
            lateMinutes,
            lastEvent: lastEvent ? {
              type: lastEvent.eventType,
              occurredAt: lastEvent.occurredAt,
            } : null,
          },
        };
      });

      return {
        id: shift.id,
        name: shift.name,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        operationalStatus: now < shift.startsAt ? 'upcoming' : now <= shift.endsAt ? 'in_progress' : 'finished',
        requiredHeadcount: shift.requiredHeadcount,
        assignedHeadcount: employees.length,
        missingHeadcount: Math.max(shift.requiredHeadcount - employees.length, 0),
        allowedBreakMinutes: shift.unpaidBreakMinutes,
        branch: {
          id: shift.branch.id,
          code: shift.branch.code,
          name: shift.branch.name,
          timezone: shift.branch.timezone,
        },
        department: shift.department ? {
          id: shift.department.id,
          code: shift.department.code,
          name: shift.department.name,
        } : null,
        position: shift.position ? {
          id: shift.position.id,
          code: shift.position.code,
          name: shift.position.name,
        } : null,
        counts,
        employees,
      };
    });

    return {
      generatedAt: now,
      workDate,
      refreshAfterSeconds: 20,
      policy: {
        lateGraceMinutes: LATE_GRACE_MINUTES,
        missingCheckoutAtEndOfDay: true,
        absenceAfterShiftEnds: true,
      },
      filters: {
        branches: availableBranches,
        departments: availableDepartments,
        shifts: scopedShifts.map((shift) => ({
          id: shift.id,
          name: shift.name,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          branchId: shift.branchId,
          departmentId: shift.departmentId,
        })),
      },
      summary: {
        shifts: items.length,
        assignments: items.reduce((total, shift) => total + shift.assignedHeadcount, 0),
        understaffedShifts: items.filter((shift) => shift.missingHeadcount > 0).length,
        counts: overallCounts,
      },
      items,
    };
  }

  async getLateViolations() {
    const violations = await this.violationRepository.find({
      where: { violationType: 'late' },
      relations: { employee: true, attendanceRecord: { branch: true }, shiftAssignment: { shift: true } },
      order: { detectedAt: 'DESC' },
      take: 200,
    });
    return violations.map((violation) => ({
      id: violation.id,
      employee: {
        id: violation.employee.id,
        employeeCode: violation.employee.employeeCode,
        fullName: violation.employee.preferredName || `${violation.employee.lastName} ${violation.employee.firstName}`.trim(),
      },
      workDate: violation.violationDate,
      shiftName: violation.shiftAssignment?.shift.name ?? 'Không xác định',
      branchName: violation.attendanceRecord?.branch.name ?? 'Không xác định',
      scheduledStartAt: violation.shiftAssignment?.shift.startsAt ?? null,
      checkInAt: violation.attendanceRecord?.actualCheckInAt ?? null,
      minutesLate: violation.minutesAffected,
      severity: violation.severity,
      detectedAt: violation.detectedAt,
    }));
  }

  async getBreakViolations() {
    const violations = await this.violationRepository.find({
      where: { violationType: 'excessive_break' },
      relations: { employee: true, attendanceRecord: { branch: true }, shiftAssignment: { shift: true } },
      order: { detectedAt: 'DESC' },
      take: 200,
    });
    return violations.map((violation) => {
      const allowedMinutes = violation.shiftAssignment?.shift.unpaidBreakMinutes ?? 0;
      return {
        id: violation.id,
        employee: {
          id: violation.employee.id,
          employeeCode: violation.employee.employeeCode,
          fullName: violation.employee.preferredName || `${violation.employee.lastName} ${violation.employee.firstName}`.trim(),
        },
        workDate: violation.violationDate,
        shiftName: violation.shiftAssignment?.shift.name ?? 'Không xác định',
        branchName: violation.attendanceRecord?.branch.name ?? 'Không xác định',
        allowedMinutes,
        actualMinutes: allowedMinutes + violation.minutesAffected,
        minutesOver: violation.minutesAffected,
        severity: violation.severity,
        detectedAt: violation.detectedAt,
      };
    });
  }

  async reviewAdjustment(id: string, dto: ReviewAttendanceAdjustmentDto, actor: AuthUser) {
    const request = await this.adjustmentRepository.findOne({
      where: { id },
      relations: { attendanceRecord: { shiftAssignment: { shift: true } } },
    });
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu điều chỉnh');
    if (request.status !== 'pending') throw new BadRequestException('Yêu cầu này đã được xử lý');
    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      request.status = dto.status;
      request.reviewedBy = actor.id;
      request.reviewedAt = now;
      request.reviewNote = dto.reviewNote.trim();
      request.updatedAt = now;
      await manager.save(request);
      if (dto.status === 'approved') {
        const record = request.attendanceRecord;
        record.actualCheckInAt = request.requestedCheckInAt ?? record.actualCheckInAt;
        record.actualCheckOutAt = request.requestedCheckOutAt ?? record.actualCheckOutAt;
        const shift = record.shiftAssignment?.shift;
        record.lateMinutes = record.actualCheckInAt && shift
          ? Math.max(Math.floor((record.actualCheckInAt.getTime() - shift.startsAt.getTime()) / 60_000), 0)
          : 0;
        if (record.actualCheckInAt && record.actualCheckOutAt) {
          record.workedMinutes = Math.max(Math.floor((record.actualCheckOutAt.getTime() - record.actualCheckInAt.getTime()) / 60_000) - record.breakMinutes, 0);
          record.earlyLeaveMinutes = shift ? Math.max(Math.ceil((shift.endsAt.getTime() - record.actualCheckOutAt.getTime()) / 60_000), 0) : 0;
          record.overtimeMinutes = shift ? Math.max(Math.floor((record.actualCheckOutAt.getTime() - shift.endsAt.getTime()) / 60_000), 0) : 0;
        }
        record.status = 'adjusted';
        record.updatedAt = now;
        await manager.save(record);
        await this.syncLateViolation(manager, record);
      }
    });
    return this.getAdjustmentRequests(actor);
  }

  async getBranchGeofences() {
    const branches = await this.branchRepository.find({ where: { isActive: true, deletedAt: IsNull() }, order: { name: 'ASC' } });
    return branches.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      address: branch.addressLine,
      enabled: branch.latitude !== null && branch.longitude !== null,
      latitude: branch.latitude === null ? null : Number(branch.latitude),
      longitude: branch.longitude === null ? null : Number(branch.longitude),
      radiusM: branch.geofenceRadiusM,
    }));
  }

  async updateBranchGeofence(id: string, dto: UpdateBranchGeofenceDto) {
    const branch = await this.branchRepository.findOneBy({ id, deletedAt: IsNull() });
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh');
    if (dto.enabled && (dto.latitude === undefined || dto.longitude === undefined)) {
      throw new BadRequestException('Cần nhập đầy đủ tọa độ khi bật geofence');
    }
    branch.latitude = dto.enabled ? String(dto.latitude) : null;
    branch.longitude = dto.enabled ? String(dto.longitude) : null;
    branch.geofenceRadiusM = dto.radiusM;
    branch.updatedAt = new Date();
    await this.branchRepository.save(branch);
    return this.getBranchGeofences();
  }

  private async runOnOpenRecord(
    dto: ClockActionDto,
    actor: AuthUser,
    context: RequestContext,
    action: (manager: EntityManager, record: AttendanceRecord, events: AttendanceEvent[], now: Date) => Promise<void>,
  ) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết với hồ sơ nhân viên');
    await this.reconcileOpenRecords(actor.employeeId);
    await this.dataSource.transaction(async (manager) => {
      const record = await this.findOpenRecord(actor.employeeId!, manager, true);
      if (!record) {
        const lockedRecord = await manager.getRepository(AttendanceRecord).findOne({
          where: { employeeId: actor.employeeId!, status: 'missing_check_out', actualCheckOutAt: IsNull() },
          order: { workDate: 'DESC', updatedAt: 'DESC' },
        });
        if (lockedRecord) {
          throw new BadRequestException('Phiên chấm công của ngày trước đã tự khóa lúc hết ngày vì chưa check-out');
        }
        throw new NotFoundException('Bạn chưa check-in ca làm nào');
      }
      const events = await manager.getRepository(AttendanceEvent).find({ where: { attendanceRecordId: record.id }, order: { occurredAt: 'ASC' } });
      await action(manager, record, events, new Date());
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredAttendanceSessions() {
    try {
      const closed = await this.reconcileOpenRecords();
      if (closed > 0) this.logger.log(`Đã tự khóa ${closed} phiên chấm công qua ngày chưa check-out`);
    } catch (error) {
      this.logger.error('Không thể tự khóa phiên chấm công qua ngày', error instanceof Error ? error.stack : String(error));
    }
  }

  private async reconcileOpenRecords(employeeId?: string, now = new Date()) {
    return this.dataSource.transaction(async (manager) => {
      const query = manager.getRepository(AttendanceRecord).createQueryBuilder('record')
        .innerJoinAndSelect('record.branch', 'branch')
        .where('record.actual_check_in_at IS NOT NULL')
        .andWhere('record.actual_check_out_at IS NULL')
        .andWhere('record.status IN (:...statuses)', { statuses: ['open', 'missing_check_out'] })
        .setLock('pessimistic_write', undefined, ['record']);
      if (employeeId) query.andWhere('record.employee_id = :employeeId', { employeeId });

      const records = await query.getMany();
      let closed = 0;
      for (const record of records) {
        const branchDate = this.dateInTimezone(now, record.branch.timezone);
        const expired = record.workDate < branchDate;
        const targetStatus = expired ? 'missing_check_out' : 'open';
        if (record.status !== targetStatus) {
          record.status = targetStatus;
          record.updatedAt = now;
          await manager.save(record);
          if (expired) {
            closed += 1;
            await this.syncMissingCheckoutViolation(manager, record, now);
          }
        }
      }
      return closed;
    });
  }

  private async createEvent(
    manager: EntityManager,
    record: AttendanceRecord,
    branch: Branch,
    employeeId: string,
    eventType: AttendanceEventType,
    occurredAt: Date,
    dto: ClockActionDto,
    userId: string,
    context: RequestContext,
    photoUrl: string | null = null,
  ) {
    const method = this.isMobile(context.userAgent) ? 'mobile' : 'web';
    const location = this.validateLocation(dto, branch, method);
    return manager.save(AttendanceEvent, manager.create(AttendanceEvent, {
      attendanceRecordId: record.id,
      employeeId,
      eventType,
      occurredAt,
      method,
      deviceId: dto.deviceId ?? null,
      ipAddress: context.ipAddress || null,
      latitude: dto.latitude === undefined ? null : String(dto.latitude),
      longitude: dto.longitude === undefined ? null : String(dto.longitude),
      locationAccuracyM: dto.locationAccuracyM === undefined ? null : String(dto.locationAccuracyM),
      distanceFromBranchM: location.distance === null ? null : String(Math.round(location.distance * 100) / 100),
      isWithinGeofence: location.within,
      photoUrl,
      note: dto.outsideScheduleReason?.trim() || null,
      metadata: {
        userAgent: context.userAgent ?? null,
        outsideSchedule: record.shiftAssignmentId === null,
        selfieRequired: eventType === 'check_in' || eventType === 'check_out',
      },
      createdBy: userId,
    }));
  }

  private async resolveAttendanceScope(actor: AuthUser): Promise<AttendanceScope> {
    const roleCodes = new Set(actor.roles.map((role) => role.code));
    if (roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMIN') || roleCodes.has('HR')) {
      return { unrestricted: true, branchIds: [], departmentIds: [] };
    }
    if (!roleCodes.has('MANAGER')) {
      throw new ForbiddenException('Tài khoản không có phạm vi theo dõi ca làm');
    }

    const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER');
    const branchIds = managerRoles.flatMap((role) => role.branchId ? [role.branchId] : []);
    const departmentIds = managerRoles.flatMap((role) => role.departmentId ? [role.departmentId] : []);
    if (branchIds.length === 0 && departmentIds.length === 0 && actor.employeeId) {
      const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
      if (employee) branchIds.push(employee.primaryBranchId);
    }
    if (branchIds.length === 0 && departmentIds.length === 0) {
      throw new ForbiddenException('Tài khoản quản lý chưa được gán phạm vi chi nhánh hoặc phòng ban');
    }
    return {
      unrestricted: false,
      branchIds: [...new Set(branchIds)],
      departmentIds: [...new Set(departmentIds)],
    };
  }

  private async getEmployee(actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết với hồ sơ nhân viên');
    const employee = await this.employeeRepository.findOne({
      where: { id: actor.employeeId, deletedAt: IsNull() },
      relations: { primaryBranch: true },
    });
    if (!employee) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
    if (employee.employmentStatus !== 'active') throw new ForbiddenException('Trạng thái nhân viên hiện không cho phép chấm công');
    return employee;
  }

  private async findOpenRecord(employeeId: string, manager?: EntityManager, lock = false) {
    const entityManager = manager ?? this.dataSource.manager;
    const query = entityManager.getRepository(AttendanceRecord).createQueryBuilder('record')
      .innerJoin('record.branch', 'recordBranch')
      .where('record.employee_id = :employeeId', { employeeId })
      .andWhere('record.actual_check_in_at IS NOT NULL')
      .andWhere('record.actual_check_out_at IS NULL')
      .andWhere('record.status = :status', { status: 'open' })
      .andWhere('record.work_date >= (CURRENT_TIMESTAMP AT TIME ZONE recordBranch.timezone)::date')
      .orderBy('record.actual_check_in_at', 'DESC');
    if (lock) query.setLock('pessimistic_write');
    const openRecord = await query.getOne();
    if (!openRecord) return null;
    return entityManager.getRepository(AttendanceRecord).findOne({
      where: { id: openRecord.id },
      relations: { branch: true, shiftAssignment: { shift: { branch: true } } },
    });
  }

  private findClockableAssignment(employeeId: string, now: Date, manager?: EntityManager) {
    const repository = manager?.getRepository(ShiftAssignment) ?? this.assignmentRepository;
    const earliestEnd = now;
    const latestStart = new Date(now.getTime() + 4 * 60 * 60_000);
    return repository.createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.shift', 'shift')
      .innerJoinAndSelect('shift.branch', 'branch')
      .where('assignment.employee_id = :employeeId', { employeeId })
      .andWhere('assignment.assignment_status IN (:...clockableStatuses)', { clockableStatuses: ['assigned', 'confirmed'] })
      .andWhere("shift.status = 'published'")
      .andWhere('shift.deleted_at IS NULL')
      .andWhere('shift.ends_at >= :earliestEnd', { earliestEnd })
      .andWhere('shift.starts_at <= :latestStart', { latestStart })
      .andWhere(`NOT EXISTS (
        SELECT 1
        FROM workforce.attendance_records existing_record
        WHERE existing_record.shift_assignment_id = assignment.id
          AND existing_record.employee_id = :employeeId
          AND existing_record.actual_check_in_at IS NOT NULL
      )`)
      .orderBy('shift.starts_at', 'ASC')
      .getOne();
  }

  private toResponse(
    employee: Employee,
    record: AttendanceRecord | null,
    events: AttendanceEvent[],
    nextAssignment: ShiftAssignment | null,
    canClockOutsideSchedule: boolean,
    serverTime: Date,
  ) {
    const active = Boolean(record?.actualCheckInAt && !record.actualCheckOutAt);
    const onBreak = active && events.at(-1)?.eventType === 'break_start';
    const breakUsed = events.some((event) => event.eventType === 'break_start');
    const awaitingNextShift = !active && Boolean(nextAssignment);
    const recordIsToday = record?.workDate === this.dateInTimezone(serverTime, employee.primaryBranch.timezone);
    const visibleRecord = awaitingNextShift || (!active && !recordIsToday) ? null : record;
    const visibleEvents = visibleRecord ? events : [];
    const assignment = active ? record?.shiftAssignment : nextAssignment ?? visibleRecord?.shiftAssignment;
    const shift = assignment?.shift;
    const clockBranch = active ? record?.branch ?? employee.primaryBranch : shift?.branch ?? employee.primaryBranch;
    const state = onBreak ? 'on_break' : active ? 'working' : nextAssignment ? 'not_started' : visibleRecord?.actualCheckOutAt ? 'completed' : 'not_started';
    return {
      serverTime,
      state,
      allowedActions: {
        checkIn: !active && (Boolean(nextAssignment) || canClockOutsideSchedule),
        checkOut: active && !onBreak,
        startBreak: active && !onBreak && !breakUsed,
        endBreak: onBreak,
      },
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.preferredName || `${employee.lastName} ${employee.firstName}`.trim(),
      },
      clockLocation: {
        branchId: clockBranch.id,
        branchName: clockBranch.name,
        address: clockBranch.addressLine,
        geofenceRequired: clockBranch.latitude !== null && clockBranch.longitude !== null,
        latitude: clockBranch.latitude === null ? null : Number(clockBranch.latitude),
        longitude: clockBranch.longitude === null ? null : Number(clockBranch.longitude),
        geofenceRadiusM: clockBranch.geofenceRadiusM,
      },
      requiresOutsideScheduleReason: !active && !nextAssignment && canClockOutsideSchedule,
      shift: shift ? {
        id: shift.id,
        assignmentId: assignment.id,
        name: shift.name,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        unpaidBreakMinutes: shift.unpaidBreakMinutes,
        branch: {
          id: shift.branch.id,
          code: shift.branch.code,
          name: shift.branch.name,
          address: shift.branch.addressLine,
          timezone: shift.branch.timezone,
        },
      } : null,
      record: visibleRecord ? {
        id: visibleRecord.id,
        workDate: visibleRecord.workDate,
        status: visibleRecord.status,
        checkInAt: visibleRecord.actualCheckInAt,
        checkOutAt: visibleRecord.actualCheckOutAt,
        scheduledMinutes: visibleRecord.scheduledMinutes,
        workedMinutes: visibleRecord.workedMinutes,
        breakMinutes: visibleRecord.breakMinutes,
        allowedBreakMinutes: shift?.unpaidBreakMinutes ?? 0,
        breakOverMinutes: Math.max(visibleRecord.breakMinutes - (shift?.unpaidBreakMinutes ?? 0), 0),
        hasExcessiveBreak: Boolean(shift) && visibleRecord.breakMinutes > (shift?.unpaidBreakMinutes ?? 0),
        lateMinutes: visibleRecord.lateMinutes,
        isLate: visibleRecord.lateMinutes > LATE_GRACE_MINUTES,
        lateGraceMinutes: LATE_GRACE_MINUTES,
        earlyLeaveMinutes: visibleRecord.earlyLeaveMinutes,
        overtimeMinutes: visibleRecord.overtimeMinutes,
      } : null,
      events: visibleEvents.map((event) => ({
        id: event.id,
        type: event.eventType,
        occurredAt: event.occurredAt,
        method: event.method,
        photoUrl: event.photoUrl ? `/attendance/events/${event.id}/selfie` : null,
      })),
    };
  }

  private calculateBreakMinutes(events: AttendanceEvent[]) {
    let startedAt: Date | null = null;
    let total = 0;
    for (const event of events) {
      if (event.eventType === 'break_start') startedAt = event.occurredAt;
      if (event.eventType === 'break_end' && startedAt) {
        total += Math.max(Math.floor((event.occurredAt.getTime() - startedAt.getTime()) / 60_000), 0);
        startedAt = null;
      }
    }
    return total;
  }

  private calculateLiveBreak(events: AttendanceEvent[], now: Date) {
    let activeStartedAt: Date | null = null;
    let totalMinutes = 0;
    for (const event of events) {
      if (event.eventType === 'break_start') activeStartedAt = event.occurredAt;
      if (event.eventType === 'break_end' && activeStartedAt) {
        totalMinutes += Math.max(Math.floor((event.occurredAt.getTime() - activeStartedAt.getTime()) / 60_000), 0);
        activeStartedAt = null;
      }
    }
    if (activeStartedAt) {
      totalMinutes += Math.max(Math.floor((now.getTime() - activeStartedAt.getTime()) / 60_000), 0);
    }
    return { totalMinutes, activeStartedAt };
  }

  private historyItem(
    record: AttendanceRecord | null,
    assignment: ShiftAssignment | null,
    eventsByRecord: Map<string, AttendanceEvent[]>,
    adjustmentsByRecord: Map<string, AttendanceAdjustmentRequest[]>,
    violationsByRecord: Map<string, AttendanceViolation[]>,
    now: Date,
  ) {
    const effectiveAssignment = assignment ?? record?.shiftAssignment ?? null;
    const shift = effectiveAssignment?.shift ?? null;
    const events = record ? eventsByRecord.get(record.id) ?? [] : [];
    const adjustments = record ? adjustmentsByRecord.get(record.id) ?? [] : [];
    const violations = record ? violationsByRecord.get(record.id) ?? [] : [];
    let displayStatus = record?.status ?? 'scheduled';
    if (!record && shift && shift.endsAt < now) displayStatus = 'missing_check_in';
    if (
      record?.actualCheckInAt
      && !record.actualCheckOutAt
      && shift
      && this.dateInTimezone(now, shift.branch.timezone) > record.workDate
    ) displayStatus = 'missing_check_out';
    return {
      sortAt: shift?.startsAt ?? record?.actualCheckInAt ?? new Date(`${record?.workDate ?? '1970-01-01'}T00:00:00Z`),
      id: record?.id ?? `shift:${effectiveAssignment?.id}`,
      recordId: record?.id ?? null,
      shiftAssignmentId: effectiveAssignment?.id ?? null,
      workDate: record?.workDate ?? (shift ? this.dateInTimezone(shift.startsAt, shift.branch.timezone) : null),
      status: displayStatus,
      outsideSchedule: !effectiveAssignment,
      shift: shift ? { id: shift.id, name: shift.name, startsAt: shift.startsAt, endsAt: shift.endsAt } : null,
      branch: record?.branch
        ? { id: record.branch.id, name: record.branch.name }
        : shift?.branch ? { id: shift.branch.id, name: shift.branch.name } : null,
      checkInAt: record?.actualCheckInAt ?? null,
      checkOutAt: record?.actualCheckOutAt ?? null,
      scheduledMinutes: record?.scheduledMinutes ?? (shift ? Math.max(Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000) - shift.unpaidBreakMinutes, 0) : 0),
      workedMinutes: record?.workedMinutes ?? 0,
      breakMinutes: record?.breakMinutes ?? 0,
      allowedBreakMinutes: shift?.unpaidBreakMinutes ?? 0,
      breakOverMinutes: Math.max((record?.breakMinutes ?? 0) - (shift?.unpaidBreakMinutes ?? 0), 0),
      hasExcessiveBreak: Boolean(shift) && (record?.breakMinutes ?? 0) > (shift?.unpaidBreakMinutes ?? 0),
      lateMinutes: record?.lateMinutes ?? 0,
      isLate: (record?.lateMinutes ?? 0) > LATE_GRACE_MINUTES,
      lateGraceMinutes: LATE_GRACE_MINUTES,
      earlyLeaveMinutes: record?.earlyLeaveMinutes ?? 0,
      overtimeMinutes: record?.overtimeMinutes ?? 0,
      events: events.map((event) => ({
        id: event.id,
        type: event.eventType,
        occurredAt: event.occurredAt,
        method: event.method,
        deviceId: event.deviceId,
        locationAccuracyM: event.locationAccuracyM === null ? null : Number(event.locationAccuracyM),
        distanceFromBranchM: event.distanceFromBranchM === null ? null : Number(event.distanceFromBranchM),
        isWithinGeofence: event.isWithinGeofence,
        photoUrl: event.photoUrl ? `/attendance/events/${event.id}/selfie` : null,
      })),
      adjustments: adjustments.map((request) => ({
        id: request.id,
        requestedCheckInAt: request.requestedCheckInAt,
        requestedCheckOutAt: request.requestedCheckOutAt,
        reason: request.reason,
        status: request.status,
        requestedAt: request.requestedAt,
        reviewNote: request.reviewNote,
      })),
      violations: violations.map((violation) => ({
        id: violation.id,
        type: violation.violationType,
        minutesAffected: violation.minutesAffected,
        severity: violation.severity,
        detectedAt: violation.detectedAt,
      })),
    };
  }

  private async syncLateViolation(manager: EntityManager, record: AttendanceRecord) {
    const repository = manager.getRepository(AttendanceViolation);
    const existing = await repository.findOneBy({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      violationType: 'late',
      violationDate: record.workDate,
    });
    if (!record.shiftAssignmentId || record.lateMinutes <= LATE_GRACE_MINUTES) {
      if (existing) await repository.remove(existing);
      return;
    }
    const violation = existing ?? repository.create({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      shiftAssignmentId: record.shiftAssignmentId,
      violationType: 'late',
      violationDate: record.workDate,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    violation.minutesAffected = record.lateMinutes;
    violation.severity = record.lateMinutes >= 60 ? 'critical' : 'warning';
    violation.status = 'accepted';
    violation.details = `Tự động ghi nhận check-in muộn ${record.lateMinutes} phút; thời gian cho phép là ${LATE_GRACE_MINUTES} phút.`;
    violation.detectedAt = new Date();
    await repository.save(violation);
  }

  private async syncBreakViolation(manager: EntityManager, record: AttendanceRecord) {
    const repository = manager.getRepository(AttendanceViolation);
    const existing = await repository.findOneBy({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      violationType: 'excessive_break',
      violationDate: record.workDate,
    });
    const allowedMinutes = record.shiftAssignment?.shift.unpaidBreakMinutes ?? 0;
    const minutesOver = Math.max(record.breakMinutes - allowedMinutes, 0);
    if (!record.shiftAssignmentId || minutesOver === 0) {
      if (existing) await repository.remove(existing);
      return;
    }
    const violation = existing ?? repository.create({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      shiftAssignmentId: record.shiftAssignmentId,
      violationType: 'excessive_break',
      violationDate: record.workDate,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    violation.minutesAffected = minutesOver;
    violation.severity = minutesOver >= 30 ? 'critical' : 'warning';
    violation.status = 'accepted';
    violation.details = `Tự động ghi nhận nghỉ quá ${minutesOver} phút; thời lượng break của ca là ${allowedMinutes} phút.`;
    violation.detectedAt = new Date();
    await repository.save(violation);
  }

  private async syncMissingCheckoutViolation(manager: EntityManager, record: AttendanceRecord, detectedAt: Date) {
    const repository = manager.getRepository(AttendanceViolation);
    const existing = await repository.findOneBy({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      violationType: 'missing_check_out',
      violationDate: record.workDate,
    });
    const violation = existing ?? repository.create({
      employeeId: record.employeeId,
      attendanceRecordId: record.id,
      shiftAssignmentId: record.shiftAssignmentId,
      violationType: 'missing_check_out',
      violationDate: record.workDate,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
    });
    violation.minutesAffected = 0;
    violation.severity = 'warning';
    violation.status = 'accepted';
    violation.details = 'Tự động ghi nhận thiếu check-out khi phiên chấm công qua hết ngày làm việc.';
    violation.detectedAt = detectedAt;
    await repository.save(violation);
  }

  private groupBy<T>(items: T[], key: (item: T) => string) {
    const groups = new Map<string, T[]>();
    for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
    return groups;
  }

  private async prepareSelfie(file?: AttendanceSelfieFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Bạn phải mở camera và chụp ảnh selfie trước khi chấm công');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Ảnh selfie phải có định dạng JPEG, PNG hoặc WebP');
    }
    if (file.size < 5_000) {
      throw new BadRequestException('Ảnh selfie không hợp lệ, hãy mở camera và chụp lại');
    }

    try {
      const source = sharp(file.buffer, { failOn: 'error' }).rotate();
      const metadata = await source.metadata();
      if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 240) {
        throw new BadRequestException('Ảnh selfie có độ phân giải quá thấp, hãy chụp lại để nhìn rõ khuôn mặt');
      }

      return source
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Không thể đọc ảnh selfie, vui lòng mở camera và chụp lại');
    }
  }

  private async storeSelfie(buffer: Buffer, employeeId: string, eventType: 'check_in' | 'check_out', occurredAt: Date) {
    const year = String(occurredAt.getFullYear());
    const month = String(occurredAt.getMonth() + 1).padStart(2, '0');
    const relativePath = `attendance/${year}/${month}/${employeeId}-${eventType}-${randomUUID()}.jpg`;
    const absolutePath = resolve(this.uploadRoot, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: 'wx' });
    return `/uploads/${relativePath}`;
  }

  private async removeSelfie(photoUrl: string) {
    const absolutePath = this.selfieAbsolutePath(photoUrl);
    await unlink(absolutePath).catch(() => undefined);
  }

  private selfieAbsolutePath(photoUrl: string) {
    const relativePath = photoUrl.replace(/^\/uploads\//, '');
    const absolutePath = resolve(this.uploadRoot, relativePath);
    if (!absolutePath.startsWith(`${this.uploadRoot}/`)) {
      throw new BadRequestException('Đường dẫn ảnh selfie không hợp lệ');
    }
    return absolutePath;
  }

  private dateInTimezone(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private validateLocation(dto: ClockActionDto, branch: Branch, method: string) {
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new BadRequestException('Vị trí chấm công chưa đầy đủ');
    const geofenceConfigured = branch.latitude !== null && branch.longitude !== null;
    const requiresGps = geofenceConfigured && ['mobile', 'web'].includes(method);
    if (requiresGps && (!hasLatitude || !hasLongitude)) {
      throw new BadRequestException('Chi nhánh yêu cầu bật GPS để chấm công');
    }
    if (!hasLatitude || !hasLongitude || !geofenceConfigured) return { distance: null, within: null };

    const distance = this.distanceInMeters(
      dto.latitude!,
      dto.longitude!,
      Number(branch.latitude),
      Number(branch.longitude),
    );
    const within = distance <= branch.geofenceRadiusM;
    if (!within && ['mobile', 'web'].includes(method)) {
      throw new BadRequestException(`Bạn đang cách khu vực chấm công khoảng ${Math.round(distance)}m; phạm vi cho phép là ${branch.geofenceRadiusM}m`);
    }
    return { distance, within };
  }

  private validateBreakLocation(dto: ClockActionDto, branch: Branch) {
    if (branch.latitude === null || branch.longitude === null) {
      throw new BadRequestException('Chi nhánh chưa cấu hình khu vực GPS nên chưa thể thực hiện nghỉ giữa ca');
    }
    if (dto.latitude === undefined || dto.longitude === undefined) {
      throw new BadRequestException('Bắt đầu và kết thúc nghỉ bắt buộc phải bật GPS');
    }
    this.validateLocation(dto, branch, 'web');
  }

  private distanceInMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
    const radians = (value: number) => value * Math.PI / 180;
    const earthRadius = 6_371_000;
    const deltaLatitude = radians(latitudeB - latitudeA);
    const deltaLongitude = radians(longitudeB - longitudeA);
    const a = Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private isMobile(userAgent?: string) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? '');
  }
}
