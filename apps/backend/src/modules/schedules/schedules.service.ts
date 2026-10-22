import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuthUser } from '../access-control/auth-user.type';
import { Employee } from '../employees/entities/employee.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { Position } from '../organization/entities/position.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { ApplyScheduleTemplateDto, CreateScheduleTemplateDto, SaveScheduleTemplateFromRangeDto } from './dto/schedule-template.dto';
import { CopyScheduleDto } from './dto/copy-schedule.dto';
import { PublishScheduleDto, ScheduleRangeDto } from './dto/schedule-range.dto';
import { RepeatShiftDto } from './dto/repeat-shift.dto';
import { AssignEmployeesDto } from './dto/assign-employees.dto';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { CreateShiftDto } from './dto/create-shift.dto';
import { ShiftQueryDto } from './dto/shift-query.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { ShiftTemplate } from './entities/shift-template.entity';
import { ScheduleTemplate } from './entities/schedule-template.entity';
import { ScheduleTemplateItem } from './entities/schedule-template-item.entity';

type ScheduleScope = { unrestricted: boolean; branchIds: string[]; departmentIds: string[] };

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Shift) private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(ShiftTemplate) private readonly shiftTemplateRepository: Repository<ShiftTemplate>,
    @InjectRepository(ScheduleTemplate) private readonly scheduleTemplateRepository: Repository<ScheduleTemplate>,
    @InjectRepository(ScheduleTemplateItem) private readonly scheduleTemplateItemRepository: Repository<ScheduleTemplateItem>,
    @InjectRepository(Branch) private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department) private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position) private readonly positionRepository: Repository<Position>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveRequest) private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(Notification) private readonly notificationRepository: Repository<Notification>,
    private readonly dataSource: DataSource,
  ) {}

  async getOptions(actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const firstBranch = await this.branchRepository.findOne({ where: { deletedAt: IsNull() }, order: { createdAt: 'ASC' } });
    if (!firstBranch) return { branches: [], departments: [], positions: [] };
    const organizationId = firstBranch.organizationId;
    const [branches, departments, positions] = await Promise.all([
      this.branchRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      this.departmentRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      this.positionRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
    ]);
    return {
      branches: branches.filter((branch) => scope.unrestricted || scope.branchIds.includes(branch.id)).map((branch) => ({ id: branch.id, code: branch.code, name: branch.name, timezone: branch.timezone })),
      departments: departments.filter((department) => scope.unrestricted || scope.departmentIds.length === 0 || scope.departmentIds.includes(department.id)).map(({ id, code, name }) => ({ id, code, name })),
      positions: positions.map(({ id, code, name }) => ({ id, code, name })),
    };
  }

  async findAll(query: ShiftQueryDto, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const qb = this.shiftRepository
      .createQueryBuilder('shift')
      .leftJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department')
      .leftJoinAndSelect('shift.position', 'position')
      .where('shift.deleted_at IS NULL');

    this.applyScope(qb, scope);
    if (query.from) qb.andWhere('shift.starts_at >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('shift.starts_at < :to', { to: new Date(query.to) });
    if (query.branchId) qb.andWhere('shift.branch_id = :branchId', { branchId: query.branchId });
    if (query.departmentId) qb.andWhere('shift.department_id = :departmentId', { departmentId: query.departmentId });
    if (query.status) qb.andWhere('shift.status = :status', { status: query.status });
    if (query.search?.trim()) {
      qb.andWhere('(shift.name ILIKE :search OR branch.name ILIKE :search OR department.name ILIKE :search OR position.name ILIKE :search)', { search: `%${query.search.trim()}%` });
    }

    qb.orderBy('shift.starts_at', 'ASC').addOrderBy('shift.name', 'ASC')
      .skip((query.page - 1) * query.limit).take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    const assignmentCounts = await this.getAssignmentCounts(items.map((shift) => shift.id));
    const mapped = items.map((shift) => this.toResponse(shift, assignmentCounts.get(shift.id) ?? 0));
    return {
      items: mapped,
      summary: {
        total,
        draft: mapped.filter((shift) => shift.status === 'draft').length,
        published: mapped.filter((shift) => shift.status === 'published').length,
        requiredHeadcount: mapped.reduce((sum, shift) => sum + shift.requiredHeadcount, 0),
        assignedHeadcount: mapped.reduce((sum, shift) => sum + shift.assignmentCount, 0),
      },
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async getEmployeeGrid(query: ShiftQueryDto, actor: AuthUser) {
    const [shiftPage, scope, organizationId] = await Promise.all([
      this.findAll({ ...query, page: 1, limit: 200 }, actor),
      this.resolveScope(actor),
      this.actorOrganizationId(actor),
    ]);
    const shiftIds = shiftPage.items.map((shift) => shift.id);
    const assignments = shiftIds.length
      ? await this.assignmentRepository.find({
        where: { shiftId: In(shiftIds), assignmentStatus: Not('cancelled') },
        relations: { employee: { department: true, position: true, primaryBranch: true } },
        order: { assignedAt: 'ASC' },
      })
      : [];

    const employeeQuery = this.employeeRepository.createQueryBuilder('employee')
      .innerJoinAndSelect('employee.department', 'department')
      .innerJoinAndSelect('employee.position', 'position')
      .innerJoinAndSelect('employee.primaryBranch', 'branch')
      .where('employee.organization_id = :organizationId', { organizationId })
      .andWhere('employee.deleted_at IS NULL')
      .andWhere("employee.employment_status <> 'terminated'");
    if (!scope.unrestricted) {
      employeeQuery.andWhere(new Brackets((where) => {
        if (scope.branchIds.length) where.where('employee.primary_branch_id IN (:...scopeBranchIds)', { scopeBranchIds: scope.branchIds });
        if (scope.departmentIds.length) {
          const method = scope.branchIds.length ? 'orWhere' : 'where';
          where[method]('employee.department_id IN (:...scopeDepartmentIds)', { scopeDepartmentIds: scope.departmentIds });
        }
      }));
    }
    if (query.branchId) employeeQuery.andWhere('employee.primary_branch_id = :branchId', { branchId: query.branchId });
    if (query.departmentId) employeeQuery.andWhere('employee.department_id = :departmentId', { departmentId: query.departmentId });
    const employees = await employeeQuery
      .orderBy('department.name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.first_name', 'ASC')
      .getMany();

    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    assignments.forEach((assignment) => employeeMap.set(assignment.employee.id, assignment.employee));
    return {
      shifts: shiftPage.items,
      employees: [...employeeMap.values()].map((employee) => ({
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: this.employeeName(employee),
        initials: this.initials(this.employeeName(employee)),
        employmentType: employee.employmentType,
        employmentStatus: employee.employmentStatus,
        department: { id: employee.department.id, name: employee.department.name },
        position: { id: employee.position.id, name: employee.position.name },
        branch: { id: employee.primaryBranch.id, name: employee.primaryBranch.name },
      })),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        shiftId: assignment.shiftId,
        employeeId: assignment.employeeId,
        status: assignment.assignmentStatus,
      })),
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const shift = await this.getShiftEntity(id);
    await this.assertShiftInScope(shift, actor);
    return this.getShiftResponse(id);
  }

  async create(dto: CreateShiftDto, actor: AuthUser) {
    this.validateTimes(dto.startsAt, dto.endsAt, dto.unpaidBreakMinutes);
    const references = await this.validateReferences(dto.branchId, dto.departmentId, dto.positionId);
    await this.assertReferencesInScope(dto.branchId, dto.departmentId ?? null, actor);

    const shift = this.shiftRepository.create({
      shiftTemplateId: null,
      branchId: references.branch.id,
      departmentId: references.department?.id ?? null,
      positionId: references.position?.id ?? null,
      name: dto.name.trim(),
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      unpaidBreakMinutes: dto.unpaidBreakMinutes,
      requiredHeadcount: dto.requiredHeadcount,
      status: 'draft',
      recurrenceGroupId: null,
      notes: dto.notes?.trim() || null,
      publishedAt: null,
      publishedBy: null,
      createdBy: actor.id,
      deletedAt: null,
    });
    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.save(Shift, shift);
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'shift.created',
        entityType: 'shift',
        entityId: result.id,
        oldValues: null,
        newValues: this.auditValues(result),
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
      return result;
    });
    return this.getShiftResponse(saved.id);
  }

  async update(id: string, dto: UpdateShiftDto, actor: AuthUser) {
    const shift = await this.getShiftEntity(id);
    await this.assertShiftInScope(shift, actor);
    this.assertShiftCanBeChanged(shift, 'chỉnh sửa');

    const branchId = dto.branchId ?? shift.branchId;
    const departmentId = dto.departmentId === undefined ? shift.departmentId : dto.departmentId;
    const positionId = dto.positionId === undefined ? shift.positionId : dto.positionId;
    await this.validateReferences(branchId, departmentId, positionId);
    await this.assertReferencesInScope(branchId, departmentId ?? null, actor);

    const startsAt = dto.startsAt ?? shift.startsAt.toISOString();
    const endsAt = dto.endsAt ?? shift.endsAt.toISOString();
    const breakMinutes = dto.unpaidBreakMinutes ?? shift.unpaidBreakMinutes;
    this.validateTimes(startsAt, endsAt, breakMinutes);
    if (shift.status !== 'draft' && new Date(startsAt) <= new Date()) {
      throw new BadRequestException('Không thể chuyển ca về thời điểm đã bắt đầu hoặc trong quá khứ');
    }
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      await this.assertAssignedEmployeesAvailable(shift, new Date(startsAt), new Date(endsAt));
    }
    const before = this.auditValues(shift);

    if (dto.name !== undefined) shift.name = dto.name.trim();
    shift.branchId = branchId;
    shift.departmentId = departmentId ?? null;
    shift.positionId = positionId ?? null;
    shift.startsAt = new Date(startsAt);
    shift.endsAt = new Date(endsAt);
    shift.unpaidBreakMinutes = breakMinutes;
    if (dto.requiredHeadcount !== undefined) shift.requiredHeadcount = dto.requiredHeadcount;
    if (dto.notes !== undefined) shift.notes = dto.notes?.trim() || null;
    shift.updatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Shift, shift);
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'shift.updated',
        entityType: 'shift',
        entityId: shift.id,
        oldValues: before,
        newValues: this.auditValues(shift),
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    if (shift.status === 'published') {
      await this.notifyAssignedEmployees([shift], 'schedule.changed', 'Lịch làm việc đã thay đổi', `Ca ${shift.name} vừa được cập nhật.`);
    }
    return this.getShiftResponse(id);
  }

  async remove(id: string, actor: AuthUser) {
    const shift = await this.getShiftEntity(id);
    await this.assertShiftInScope(shift, actor);
    this.assertShiftCanBeChanged(shift, 'xóa hoặc hủy');
    const before = this.auditValues(shift);
    const action = shift.status === 'published' ? 'cancelled' : 'deleted';

    await this.dataSource.transaction(async (manager) => {
      if (shift.status === 'published') {
        shift.status = 'cancelled';
        shift.updatedAt = new Date();
      } else {
        shift.deletedAt = new Date();
        shift.updatedAt = new Date();
      }
      await manager.save(Shift, shift);
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: `shift.${action}`,
        entityType: 'shift',
        entityId: shift.id,
        oldValues: before,
        newValues: this.auditValues(shift),
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    if (action === 'cancelled') {
      await this.notifyAssignedEmployees([shift], 'schedule.cancelled', 'Ca làm đã bị hủy', `Ca ${shift.name} đã bị hủy khỏi lịch làm việc.`);
    }
    return { id, action };
  }

  async getShiftTemplates(actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    const qb = this.shiftTemplateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.branch', 'branch')
      .where('template.is_active = true');
    if (!scope.unrestricted) {
      qb.andWhere(new Brackets((where) => {
        where.where('template.branch_id IS NULL');
        if (scope.branchIds.length) where.orWhere('template.branch_id IN (:...branchIds)', { branchIds: scope.branchIds });
      }));
    }
    const templates = await qb.orderBy('template.name', 'ASC').getMany();
    return templates.map((template) => this.toTemplateResponse(template));
  }

  async createShiftTemplate(dto: CreateShiftTemplateDto, actor: AuthUser) {
    this.validateTemplateTime(dto.startTime, dto.endTime, dto.crossesMidnight, dto.unpaidBreakMinutes);
    const organizationId = await this.resolveTemplateOrganization(dto.branchId ?? null, actor);
    const template = this.shiftTemplateRepository.create({
      organizationId,
      branchId: dto.branchId ?? null,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      color: dto.color.toUpperCase(),
      startTime: dto.startTime,
      endTime: dto.endTime,
      crossesMidnight: dto.crossesMidnight,
      unpaidBreakMinutes: dto.unpaidBreakMinutes,
      requiredHeadcount: dto.requiredHeadcount,
      isActive: true,
    });
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const result = await manager.save(ShiftTemplate, template);
        await manager.save(AuditLog, manager.create(AuditLog, {
          actorUserId: actor.id,
          action: 'shift_template.created',
          entityType: 'shift_template',
          entityId: result.id,
          oldValues: null,
          newValues: this.templateAuditValues(result),
          ipAddress: null,
          userAgent: null,
          requestId: null,
        }));
        return result;
      });
      return this.getShiftTemplateResponse(saved.id, actor);
    } catch (error) {
      this.handleTemplatePersistenceError(error);
    }
  }

  async updateShiftTemplate(id: string, dto: UpdateShiftTemplateDto, actor: AuthUser) {
    const template = await this.getScopedTemplateEntity(id, actor);
    const branchId = dto.branchId === undefined ? template.branchId : dto.branchId;
    const organizationId = await this.resolveTemplateOrganization(branchId ?? null, actor);
    const startTime = dto.startTime ?? template.startTime.slice(0, 5);
    const endTime = dto.endTime ?? template.endTime.slice(0, 5);
    const crossesMidnight = dto.crossesMidnight ?? template.crossesMidnight;
    const breakMinutes = dto.unpaidBreakMinutes ?? template.unpaidBreakMinutes;
    this.validateTemplateTime(startTime, endTime, crossesMidnight, breakMinutes);
    const before = this.templateAuditValues(template);

    template.organizationId = organizationId;
    template.branchId = branchId ?? null;
    if (dto.code !== undefined) template.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.color !== undefined) template.color = dto.color.toUpperCase();
    template.startTime = startTime;
    template.endTime = endTime;
    template.crossesMidnight = crossesMidnight;
    template.unpaidBreakMinutes = breakMinutes;
    if (dto.requiredHeadcount !== undefined) template.requiredHeadcount = dto.requiredHeadcount;
    template.updatedAt = new Date();

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(ShiftTemplate, template);
        await manager.save(AuditLog, manager.create(AuditLog, {
          actorUserId: actor.id,
          action: 'shift_template.updated',
          entityType: 'shift_template',
          entityId: template.id,
          oldValues: before,
          newValues: this.templateAuditValues(template),
          ipAddress: null,
          userAgent: null,
          requestId: null,
        }));
      });
      return this.getShiftTemplateResponse(id, actor);
    } catch (error) {
      this.handleTemplatePersistenceError(error);
    }
  }

  async removeShiftTemplate(id: string, actor: AuthUser) {
    const template = await this.getScopedTemplateEntity(id, actor);
    const before = this.templateAuditValues(template);
    template.isActive = false;
    template.updatedAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.save(ShiftTemplate, template);
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'shift_template.deleted',
        entityType: 'shift_template',
        entityId: template.id,
        oldValues: before,
        newValues: { isActive: false },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    return { id, deleted: true };
  }

  async getShiftAssignments(shiftId: string, actor: AuthUser) {
    await this.getScopedShiftEntity(shiftId, actor);
    const assignments = await this.assignmentRepository.find({
      where: { shiftId, assignmentStatus: Not('cancelled') },
      relations: { employee: { department: true, position: true, primaryBranch: true } },
      order: { assignedAt: 'ASC' },
    });
    return assignments.map((assignment) => this.toAssignmentResponse(assignment));
  }

  async getShiftCandidates(shiftId: string, actor: AuthUser, search?: string) {
    const shift = await this.getScopedShiftEntity(shiftId, actor);
    this.assertShiftCanBeChanged(shift, 'phân công nhân viên');
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.position', 'position')
      .leftJoinAndSelect('employee.primaryBranch', 'branch')
      .where('employee.deleted_at IS NULL')
      .andWhere('employee.primary_branch_id = :branchId', { branchId: shift.branchId });
    if (search?.trim()) {
      qb.andWhere('(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.preferred_name ILIKE :search OR employee.employee_code ILIKE :search)', { search: `%${search.trim()}%` });
    }
    const employees = await qb.orderBy('employee.last_name', 'ASC').addOrderBy('employee.first_name', 'ASC').getMany();
    const availability = await this.getEmployeeAvailability(shift, employees.map((employee) => employee.id));
    return employees.map((employee) => {
      const state = availability.get(employee.id) ?? { assigned: false, conflict: false, onLeave: false };
      const reasons: string[] = [];
      if (employee.employmentStatus !== 'active') reasons.push('Nhân viên không ở trạng thái đang làm');
      if (!this.employeeWorksOnDate(employee, shift)) reasons.push('Ngoài thời gian làm việc tại doanh nghiệp');
      if (state.assigned) reasons.push('Đã được phân vào ca');
      if (state.conflict) reasons.push('Trùng với ca làm khác');
      if (state.onLeave) reasons.push('Có nghỉ phép đã được duyệt');
      const matchesDepartment = !shift.departmentId || employee.departmentId === shift.departmentId;
      const matchesPosition = !shift.positionId || employee.positionId === shift.positionId;
      return {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: this.employeeName(employee),
        initials: this.initials(this.employeeName(employee)),
        department: { id: employee.department.id, name: employee.department.name },
        position: { id: employee.position.id, name: employee.position.name },
        branch: { id: employee.primaryBranch.id, name: employee.primaryBranch.name },
        matchesDepartment,
        matchesPosition,
        recommended: matchesDepartment && matchesPosition,
        eligible: reasons.length === 0,
        reasons,
      };
    }).sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.fullName.localeCompare(b.fullName, 'vi'));
  }

  async assignEmployees(shiftId: string, dto: AssignEmployeesDto, actor: AuthUser) {
    const shift = await this.getScopedShiftEntity(shiftId, actor);
    this.assertShiftCanBeChanged(shift, 'phân công nhân viên');
    const employees = await this.employeeRepository.find({
      where: { id: In(dto.employeeIds), deletedAt: IsNull() },
      relations: { department: true, position: true, primaryBranch: true },
    });
    if (employees.length !== dto.employeeIds.length) throw new BadRequestException('Một hoặc nhiều nhân viên không hợp lệ');
    const availability = await this.getEmployeeAvailability(shift, dto.employeeIds);
    const errors: string[] = [];
    employees.forEach((employee) => {
      const state = availability.get(employee.id) ?? { assigned: false, conflict: false, onLeave: false };
      if (employee.primaryBranchId !== shift.branchId) errors.push(`${this.employeeName(employee)} không thuộc chi nhánh của ca`);
      if (employee.employmentStatus !== 'active' || !this.employeeWorksOnDate(employee, shift)) errors.push(`${this.employeeName(employee)} không đủ điều kiện làm việc`);
      if (state.conflict) errors.push(`${this.employeeName(employee)} bị trùng ca`);
      if (state.onLeave) errors.push(`${this.employeeName(employee)} đang nghỉ phép`);
      if (!dto.allowDepartmentOrPositionMismatch && shift.departmentId && employee.departmentId !== shift.departmentId) errors.push(`${this.employeeName(employee)} không thuộc phòng ban yêu cầu`);
      if (!dto.allowDepartmentOrPositionMismatch && shift.positionId && employee.positionId !== shift.positionId) errors.push(`${this.employeeName(employee)} không đúng vị trí yêu cầu`);
    });
    if (errors.length) throw new BadRequestException(errors);

    const activeCount = await this.assignmentRepository.count({ where: { shiftId, assignmentStatus: Not('cancelled') } });
    const newCount = employees.filter((employee) => !(availability.get(employee.id)?.assigned)).length;
    if (activeCount + newCount > shift.requiredHeadcount) throw new BadRequestException('Số nhân viên phân công vượt quá nhu cầu của ca');

    await this.dataSource.transaction(async (manager) => {
      for (const employee of employees) {
        const existing = await manager.findOneBy(ShiftAssignment, { shiftId, employeeId: employee.id });
        if (existing) {
          existing.assignmentStatus = 'assigned';
          existing.assignedBy = actor.id;
          existing.assignedAt = new Date();
          existing.cancelledAt = null;
          existing.cancellationReason = null;
          await manager.save(ShiftAssignment, existing);
        } else {
          await manager.save(ShiftAssignment, manager.create(ShiftAssignment, {
            shiftId,
            employeeId: employee.id,
            assignmentStatus: 'assigned',
            assignedBy: actor.id,
            cancelledAt: null,
            cancellationReason: null,
          }));
        }
      }
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'shift.employees_assigned',
        entityType: 'shift',
        entityId: shiftId,
        oldValues: null,
        newValues: { employeeIds: dto.employeeIds },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    if (shift.status === 'published') {
      await this.notifyAssignedEmployees([shift], 'schedule.assignment_changed', 'Bạn được phân ca mới', `Bạn vừa được phân vào ca ${shift.name}.`);
    }
    return this.getShiftAssignments(shiftId, actor);
  }

  async removeAssignment(shiftId: string, assignmentId: string, actor: AuthUser) {
    const shift = await this.getScopedShiftEntity(shiftId, actor);
    this.assertShiftCanBeChanged(shift, 'thay đổi phân công');
    const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId, shiftId }, relations: { employee: true } });
    if (!assignment || assignment.assignmentStatus === 'cancelled') throw new NotFoundException('Không tìm thấy phân công');
    assignment.assignmentStatus = 'cancelled';
    assignment.cancelledAt = new Date();
    assignment.cancellationReason = 'Gỡ khỏi ca bởi quản lý';
    await this.dataSource.transaction(async (manager) => {
      await manager.save(ShiftAssignment, assignment);
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'shift.employee_unassigned',
        entityType: 'shift',
        entityId: shiftId,
        oldValues: { employeeId: assignment.employeeId },
        newValues: { assignmentStatus: 'cancelled' },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    return this.getShiftAssignments(shiftId, actor);
  }

  async repeatShift(id: string, dto: RepeatShiftDto, actor: AuthUser) {
    const source = await this.getScopedShiftEntity(id, actor);
    this.assertShiftCanBeChanged(source, 'thiết lập lặp lại');
    const until = new Date(dto.until);
    const stepDays = dto.frequency === 'daily' ? 1 : 7;
    const groupId = source.recurrenceGroupId ?? randomUUID();
    const copies: Shift[] = [];
    for (let index = 1; index <= dto.occurrences; index++) {
      const startsAt = addUtcDays(source.startsAt, stepDays * index);
      if (startsAt > until) break;
      copies.push(this.shiftRepository.create({ ...this.copyableShift(source), startsAt, endsAt: addUtcDays(source.endsAt, stepDays * index), recurrenceGroupId: groupId, createdBy: actor.id }));
    }
    if (!copies.length) throw new BadRequestException('Không có ca lặp nào nằm trong thời hạn đã chọn');
    await this.dataSource.transaction(async (manager) => {
      source.recurrenceGroupId = groupId;
      await manager.save(Shift, source);
      await manager.save(Shift, copies);
      await manager.save(AuditLog, manager.create(AuditLog, { actorUserId: actor.id, action: 'shift.repeated', entityType: 'shift', entityId: source.id, oldValues: null, newValues: { frequency: dto.frequency, count: copies.length, recurrenceGroupId: groupId }, ipAddress: null, userAgent: null, requestId: null }));
    });
    return { recurrenceGroupId: groupId, created: copies.length };
  }

  async copySchedule(dto: CopyScheduleDto, actor: AuthUser) {
    const from = new Date(dto.sourceFrom), to = new Date(dto.sourceTo), target = new Date(dto.targetStart);
    if (to <= from) throw new BadRequestException('Khoảng lịch nguồn không hợp lệ');
    const scope = await this.resolveScope(actor);
    const qb = this.shiftRepository.createQueryBuilder('shift').where('shift.deleted_at IS NULL').andWhere('shift.starts_at >= :from AND shift.starts_at < :to', { from, to }).andWhere("shift.status <> 'cancelled'");
    this.applyScope(qb, scope);
    const source = await qb.orderBy('shift.starts_at', 'ASC').take(dto.maxShifts + 1).getMany();
    if (!source.length) throw new BadRequestException('Khoảng lịch nguồn không có ca để sao chép');
    if (source.length > dto.maxShifts) throw new BadRequestException(`Lịch nguồn vượt quá ${dto.maxShifts} ca`);
    const offset = target.getTime() - from.getTime();
    const copies = source.map((shift) => this.shiftRepository.create({ ...this.copyableShift(shift), startsAt: new Date(shift.startsAt.getTime() + offset), endsAt: new Date(shift.endsAt.getTime() + offset), recurrenceGroupId: null, createdBy: actor.id }));
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Shift, copies);
      await manager.save(AuditLog, manager.create(AuditLog, { actorUserId: actor.id, action: 'schedule.copied', entityType: 'schedule', entityId: null, oldValues: null, newValues: { sourceFrom: from, sourceTo: to, targetStart: target, count: copies.length }, ipAddress: null, userAgent: null, requestId: null }));
    });
    return { created: copies.length };
  }

  async getScheduleTemplates(actor: AuthUser) {
    const organizationId = await this.actorOrganizationId(actor);
    const templates = await this.scheduleTemplateRepository.find({ where: { organizationId, isActive: true }, order: { name: 'ASC' } });
    const items = templates.length ? await this.scheduleTemplateItemRepository.find({ where: { scheduleTemplateId: In(templates.map((item) => item.id)) }, relations: { shiftTemplate: { branch: true }, department: true, position: true }, order: { dayOffset: 'ASC' } }) : [];
    return templates.map((template) => ({ ...template, items: items.filter((item) => item.scheduleTemplateId === template.id).map((item) => ({ id: item.id, dayOffset: item.dayOffset, requiredHeadcount: item.requiredHeadcount, shiftTemplate: this.toTemplateResponse(item.shiftTemplate), department: item.department ? { id: item.department.id, name: item.department.name } : null, position: item.position ? { id: item.position.id, name: item.position.name } : null })) }));
  }

  async createScheduleTemplate(dto: CreateScheduleTemplateDto, actor: AuthUser) {
    if (!dto.items.length) throw new BadRequestException('Template lịch phải có ít nhất một ca');
    const organizationId = await this.actorOrganizationId(actor);
    const shiftTemplates = await this.shiftTemplateRepository.findBy({ id: In(dto.items.map((item) => item.shiftTemplateId)), organizationId, isActive: true });
    if (shiftTemplates.length !== new Set(dto.items.map((item) => item.shiftTemplateId)).size) throw new BadRequestException('Có mẫu thời gian ca không hợp lệ');
    const saved = await this.dataSource.transaction(async (manager) => {
      const template = await manager.save(ScheduleTemplate, manager.create(ScheduleTemplate, { organizationId, name: dto.name.trim(), description: dto.description?.trim() || null, isActive: true, createdBy: actor.id }));
      await manager.save(ScheduleTemplateItem, dto.items.map((item) => manager.create(ScheduleTemplateItem, { scheduleTemplateId: template.id, shiftTemplateId: item.shiftTemplateId, dayOffset: item.dayOffset, departmentId: item.departmentId ?? null, positionId: item.positionId ?? null, requiredHeadcount: item.requiredHeadcount })));
      return template;
    });
    return { id: saved.id };
  }

  async saveScheduleTemplateFromRange(dto: SaveScheduleTemplateFromRangeDto, actor: AuthUser) {
    const shifts = await this.scopedShiftsInRange(dto.from, dto.to, dto.branchId, actor);
    if (!shifts.length) throw new BadRequestException('Khoảng lịch không có ca để lưu template');
    const organizationId = shifts[0].branch.organizationId;
    if (shifts.some((shift) => shift.branch.organizationId !== organizationId)) throw new BadRequestException('Template lịch chỉ được thuộc một doanh nghiệp');
    const from = new Date(dto.from);
    const saved = await this.dataSource.transaction(async (manager) => {
      const scheduleTemplate = await manager.save(ScheduleTemplate, manager.create(ScheduleTemplate, { organizationId, name: dto.name.trim(), description: `Lưu từ lịch ${dto.from} - ${dto.to}`, isActive: true, createdBy: actor.id }));
      for (const shift of shifts) {
        let shiftTemplateId = shift.shiftTemplateId;
        if (!shiftTemplateId) {
          const startTime = localTime(shift.startsAt, shift.branch.timezone);
          const endTime = localTime(shift.endsAt, shift.branch.timezone);
          const crossesMidnight = localDate(shift.startsAt, shift.branch.timezone) !== localDate(shift.endsAt, shift.branch.timezone);
          const created = await manager.save(ShiftTemplate, manager.create(ShiftTemplate, { organizationId, branchId: shift.branchId, code: `AUTO_${randomUUID().slice(0, 8).toUpperCase()}`, name: shift.name, color: '#2563EB', startTime, endTime, crossesMidnight, unpaidBreakMinutes: shift.unpaidBreakMinutes, requiredHeadcount: shift.requiredHeadcount, isActive: true }));
          shiftTemplateId = created.id;
        }
        const dayOffset = Math.max(0, Math.round((startOfUtcDate(shift.startsAt).getTime() - startOfUtcDate(from).getTime()) / 86_400_000));
        await manager.save(ScheduleTemplateItem, manager.create(ScheduleTemplateItem, { scheduleTemplateId: scheduleTemplate.id, shiftTemplateId, dayOffset, departmentId: shift.departmentId, positionId: shift.positionId, requiredHeadcount: shift.requiredHeadcount }));
      }
      return scheduleTemplate;
    });
    return { id: saved.id, createdItems: shifts.length };
  }

  async applyScheduleTemplate(id: string, dto: ApplyScheduleTemplateDto, actor: AuthUser) {
    const branch = await this.branchRepository.findOneBy({ id: dto.branchId, deletedAt: IsNull(), isActive: true });
    if (!branch) throw new BadRequestException('Chi nhánh không hợp lệ');
    await this.assertReferencesInScope(branch.id, null, actor);
    const template = await this.scheduleTemplateRepository.findOneBy({ id, organizationId: branch.organizationId, isActive: true });
    if (!template) throw new NotFoundException('Không tìm thấy template lịch');
    const items = await this.scheduleTemplateItemRepository.find({ where: { scheduleTemplateId: id }, relations: { shiftTemplate: true } });
    const shifts = items.map((item) => {
      const date = addDateString(dto.startDate, item.dayOffset);
      const startsAt = zonedDate(date, item.shiftTemplate.startTime, branch.timezone);
      const endDate = item.shiftTemplate.crossesMidnight ? addDateString(date, 1) : date;
      return this.shiftRepository.create({ shiftTemplateId: item.shiftTemplateId, branchId: branch.id, departmentId: item.departmentId, positionId: item.positionId, name: item.shiftTemplate.name, startsAt, endsAt: zonedDate(endDate, item.shiftTemplate.endTime, branch.timezone), unpaidBreakMinutes: item.shiftTemplate.unpaidBreakMinutes, requiredHeadcount: item.requiredHeadcount, status: 'draft', recurrenceGroupId: null, notes: `Tạo từ template lịch: ${template.name}`, publishedAt: null, publishedBy: null, createdBy: actor.id, deletedAt: null });
    });
    await this.shiftRepository.save(shifts);
    return { created: shifts.length };
  }

  async validateSchedule(dto: ScheduleRangeDto, actor: AuthUser) {
    const shifts = await this.scopedShiftsInRange(dto.from, dto.to, dto.branchId, actor);
    const now = new Date();
    const counts = await this.getAssignmentCounts(shifts.map((shift) => shift.id));
    const understaffed = shifts.filter((shift) => (counts.get(shift.id) ?? 0) < shift.requiredHeadcount).map((shift) => ({ id: shift.id, name: shift.name, startsAt: shift.startsAt, assigned: counts.get(shift.id) ?? 0, required: shift.requiredHeadcount }));
    const pastDrafts = shifts
      .filter((shift) => shift.status === 'draft' && shift.startsAt <= now)
      .map((shift) => ({ id: shift.id, name: shift.name, startsAt: shift.startsAt, endsAt: shift.endsAt }));
    const conflicts = shifts.length ? await this.assignmentRepository.createQueryBuilder('a').innerJoin(ShiftAssignment, 'b', 'b.employee_id = a.employee_id AND b.id > a.id').innerJoin(Shift, 'sa', 'sa.id = a.shift_id').innerJoin(Shift, 'sb', 'sb.id = b.shift_id').innerJoin(Employee, 'employee', 'employee.id = a.employee_id').select(['a.employee_id AS "employeeId"', "CONCAT(employee.last_name, ' ', employee.first_name) AS \"employeeName\"", 'sa.id AS "firstShiftId"', 'sb.id AS "secondShiftId"']).where('a.shift_id IN (:...shiftIds) AND b.shift_id IN (:...shiftIds)', { shiftIds: shifts.map((shift) => shift.id) }).andWhere("a.assignment_status <> 'cancelled' AND b.assignment_status <> 'cancelled'").andWhere('sa.starts_at < sb.ends_at AND sa.ends_at > sb.starts_at').getRawMany() : [];
    return { valid: conflicts.length === 0 && understaffed.length === 0 && pastDrafts.length === 0, shiftCount: shifts.length, conflicts, understaffed, pastDrafts };
  }

  async publishSchedule(dto: PublishScheduleDto, actor: AuthUser) {
    const validation = await this.validateSchedule(dto, actor);
    if (validation.conflicts.length) throw new BadRequestException('Không thể công bố vì còn nhân viên bị trùng ca');
    if (validation.pastDrafts.length) throw new BadRequestException('Không thể công bố: có ca nháp đã đến hoặc qua giờ bắt đầu. Vui lòng sửa lại thời gian ca');
    if (validation.understaffed.length && !dto.allowUnderstaffed) throw new BadRequestException('Lịch còn thiếu nhân sự; cần xác nhận công bố thiếu người');
    const shifts = await this.scopedShiftsInRange(dto.from, dto.to, dto.branchId, actor);
    const draft = shifts.filter((shift) => shift.status === 'draft');
    await this.dataSource.transaction(async (manager) => {
      for (const shift of draft) { shift.status = 'published'; shift.publishedAt = new Date(); shift.publishedBy = actor.id; await manager.save(Shift, shift); }
      await manager.save(AuditLog, manager.create(AuditLog, { actorUserId: actor.id, action: 'schedule.published', entityType: 'schedule', entityId: null, oldValues: null, newValues: { from: dto.from, to: dto.to, shiftIds: draft.map((shift) => shift.id) }, ipAddress: null, userAgent: null, requestId: null }));
    });
    await this.notifyAssignedEmployees(draft, 'schedule.published', 'Lịch làm việc đã được công bố', 'Lịch làm việc mới của bạn đã được công bố.');
    return { published: draft.length, validation };
  }

  async getMySchedule(query: ScheduleRangeDto, actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết với hồ sơ nhân viên');
    const qb = this.shiftRepository.createQueryBuilder('shift').innerJoin('shift.assignments', 'assignment', 'assignment.employee_id = :employeeId AND assignment.assignment_status <> :cancelled', { employeeId: actor.employeeId, cancelled: 'cancelled' }).leftJoinAndSelect('shift.branch', 'branch').leftJoinAndSelect('shift.department', 'department').leftJoinAndSelect('shift.position', 'position').where('shift.deleted_at IS NULL').andWhere("shift.status = 'published'").andWhere('shift.starts_at >= :from AND shift.starts_at < :to', { from: new Date(query.from), to: new Date(query.to) }).orderBy('shift.starts_at', 'ASC');
    const shifts = await qb.getMany();
    return shifts.map((shift) => this.toResponse(shift, 1));
  }

  async getMyShiftDetail(id: string, actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết với hồ sơ nhân viên');
    const shift = await this.shiftRepository.createQueryBuilder('shift')
      .innerJoin('shift.assignments', 'mine', 'mine.employee_id = :employeeId AND mine.assignment_status <> :cancelled', { employeeId: actor.employeeId, cancelled: 'cancelled' })
      .leftJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department')
      .leftJoinAndSelect('shift.position', 'position')
      .where('shift.id = :id', { id })
      .andWhere('shift.deleted_at IS NULL')
      .andWhere("shift.status = 'published'")
      .getOne();
    if (!shift) throw new NotFoundException('Không tìm thấy ca làm trong lịch cá nhân');
    const assignments = await this.assignmentRepository.find({ where: { shiftId: id, assignmentStatus: Not('cancelled') }, relations: { employee: { department: true, position: true } }, order: { assignedAt: 'ASC' } });
    return {
      ...this.toResponse(shift, assignments.length),
      coworkers: assignments.filter((item) => item.employeeId !== actor.employeeId).map((item) => {
        const name = this.employeeName(item.employee);
        return { id: item.employee.id, employeeCode: item.employee.employeeCode, fullName: name, initials: this.initials(name), department: item.employee.department.name, position: item.employee.position.name };
      }),
    };
  }

  private async getShiftResponse(id: string) {
    const shift = await this.shiftRepository
      .createQueryBuilder('shift')
      .leftJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department')
      .leftJoinAndSelect('shift.position', 'position')
      .where('shift.id = :id', { id })
      .andWhere('shift.deleted_at IS NULL')
      .getOne();
    if (!shift) throw new NotFoundException('Không tìm thấy ca làm');
    const assignmentCounts = await this.getAssignmentCounts([shift.id]);
    return this.toResponse(shift, assignmentCounts.get(shift.id) ?? 0);
  }

  private copyableShift(shift: Shift) {
    return {
      shiftTemplateId: shift.shiftTemplateId,
      branchId: shift.branchId,
      departmentId: shift.departmentId,
      positionId: shift.positionId,
      name: shift.name,
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      requiredHeadcount: shift.requiredHeadcount,
      status: 'draft',
      notes: shift.notes,
      publishedAt: null,
      publishedBy: null,
      deletedAt: null,
    };
  }

  private async actorOrganizationId(actor: AuthUser) {
    if (actor.employeeId) {
      const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
      if (employee) return employee.organizationId;
    }
    const branch = await this.branchRepository.findOne({ where: { deletedAt: IsNull() }, order: { createdAt: 'ASC' } });
    if (!branch) throw new BadRequestException('Chưa có doanh nghiệp hoặc chi nhánh');
    return branch.organizationId;
  }

  private async scopedShiftsInRange(fromValue: string, toValue: string, branchId: string | undefined, actor: AuthUser) {
    const from = new Date(fromValue), to = new Date(toValue);
    if (to <= from) throw new BadRequestException('Khoảng lịch không hợp lệ');
    const scope = await this.resolveScope(actor);
    const qb = this.shiftRepository.createQueryBuilder('shift').leftJoinAndSelect('shift.branch', 'branch').leftJoinAndSelect('shift.department', 'department').leftJoinAndSelect('shift.position', 'position').where('shift.deleted_at IS NULL').andWhere("shift.status <> 'cancelled'").andWhere('shift.starts_at >= :from AND shift.starts_at < :to', { from, to });
    this.applyScope(qb, scope);
    if (branchId) qb.andWhere('shift.branch_id = :branchId', { branchId });
    return qb.orderBy('shift.starts_at', 'ASC').getMany();
  }

  private async notifyAssignedEmployees(shifts: Shift[], eventType: string, title: string, message: string) {
    if (!shifts.length) return;
    const rows = await this.assignmentRepository.createQueryBuilder('assignment').innerJoin(Employee, 'employee', 'employee.id = assignment.employee_id').select(['assignment.shift_id AS "shiftId"', 'employee.user_id AS "userId"']).where('assignment.shift_id IN (:...shiftIds)', { shiftIds: shifts.map((shift) => shift.id) }).andWhere("assignment.assignment_status <> 'cancelled'").andWhere('employee.user_id IS NOT NULL').getRawMany<{ shiftId: string; userId: string }>();
    if (!rows.length) return;
    await this.notificationRepository.save(rows.map((row) => this.notificationRepository.create({ userId: row.userId, eventType, title, message, data: { shiftId: row.shiftId }, actionUrl: '/my-schedule', readAt: null, expiresAt: null })));
  }

  private async getShiftEntity(id: string) {
    const shift = await this.shiftRepository.findOneBy({ id, deletedAt: IsNull() });
    if (!shift) throw new NotFoundException('Không tìm thấy ca làm');
    return shift;
  }

  private async getScopedShiftEntity(id: string, actor: AuthUser) {
    const shift = await this.shiftRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { branch: true, department: true, position: true },
    });
    if (!shift) throw new NotFoundException('Không tìm thấy ca làm');
    await this.assertShiftInScope(shift, actor);
    return shift;
  }

  private async getScopedTemplateEntity(id: string, actor: AuthUser) {
    const template = await this.shiftTemplateRepository.findOne({ where: { id }, relations: { branch: true } });
    if (!template || !template.isActive) throw new NotFoundException('Không tìm thấy mẫu ca');
    const scope = await this.resolveScope(actor);
    if (!scope.unrestricted && (!template.branchId || !scope.branchIds.includes(template.branchId))) {
      throw new ForbiddenException('Mẫu ca nằm ngoài phạm vi quản lý của bạn');
    }
    return template;
  }

  private async getShiftTemplateResponse(id: string, actor: AuthUser) {
    const template = await this.getScopedTemplateEntity(id, actor);
    return this.toTemplateResponse(template);
  }

  private async resolveTemplateOrganization(branchId: string | null, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    if (branchId) {
      const branch = await this.branchRepository.findOneBy({ id: branchId, deletedAt: IsNull(), isActive: true });
      if (!branch) throw new BadRequestException('Chi nhánh không hợp lệ');
      if (!scope.unrestricted && !scope.branchIds.includes(branch.id)) {
        throw new ForbiddenException('Chi nhánh nằm ngoài phạm vi quản lý của bạn');
      }
      return branch.organizationId;
    }
    if (!scope.unrestricted) throw new BadRequestException('Quản lý phải chọn chi nhánh cho mẫu ca');
    const branch = await this.branchRepository.findOne({ where: { deletedAt: IsNull(), isActive: true }, order: { createdAt: 'ASC' } });
    if (!branch) throw new BadRequestException('Chưa có chi nhánh để tạo mẫu ca');
    return branch.organizationId;
  }

  private validateTemplateTime(startTime: string, endTime: string, crossesMidnight: boolean, breakMinutes: number) {
    const toMinutes = (value: string) => {
      const [hours, minutes] = value.split(':').map(Number);
      return hours * 60 + minutes;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime) + (crossesMidnight ? 1440 : 0);
    if (end <= start) throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu; hãy bật qua ngày nếu ca kết thúc vào hôm sau');
    if (breakMinutes >= end - start) throw new BadRequestException('Thời gian nghỉ phải ngắn hơn thời lượng ca');
  }

  private toTemplateResponse(template: ShiftTemplate) {
    return {
      id: template.id,
      code: template.code,
      name: template.name,
      color: template.color?.trim() ?? '#2563EB',
      startTime: template.startTime.slice(0, 5),
      endTime: template.endTime.slice(0, 5),
      crossesMidnight: template.crossesMidnight,
      unpaidBreakMinutes: template.unpaidBreakMinutes,
      requiredHeadcount: template.requiredHeadcount,
      isActive: template.isActive,
      branch: template.branch ? { id: template.branch.id, code: template.branch.code, name: template.branch.name } : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private templateAuditValues(template: ShiftTemplate) {
    return {
      organizationId: template.organizationId,
      branchId: template.branchId,
      code: template.code,
      name: template.name,
      color: template.color?.trim() ?? null,
      startTime: template.startTime,
      endTime: template.endTime,
      crossesMidnight: template.crossesMidnight,
      unpaidBreakMinutes: template.unpaidBreakMinutes,
      requiredHeadcount: template.requiredHeadcount,
      isActive: template.isActive,
    };
  }

  private handleTemplatePersistenceError(error: unknown): never {
    if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === '23505') {
      throw new BadRequestException('Mã mẫu ca đã tồn tại');
    }
    throw error;
  }

  private toAssignmentResponse(assignment: ShiftAssignment) {
    const name = this.employeeName(assignment.employee);
    return {
      id: assignment.id,
      status: assignment.assignmentStatus,
      assignedAt: assignment.assignedAt,
      employee: {
        id: assignment.employee.id,
        employeeCode: assignment.employee.employeeCode,
        fullName: name,
        initials: this.initials(name),
        department: { id: assignment.employee.department.id, name: assignment.employee.department.name },
        position: { id: assignment.employee.position.id, name: assignment.employee.position.name },
        branch: { id: assignment.employee.primaryBranch.id, name: assignment.employee.primaryBranch.name },
      },
    };
  }

  private async getEmployeeAvailability(shift: Shift, employeeIds: string[]) {
    const result = new Map<string, { assigned: boolean; conflict: boolean; onLeave: boolean }>();
    employeeIds.forEach((id) => result.set(id, { assigned: false, conflict: false, onLeave: false }));
    if (!employeeIds.length) return result;

    const [currentAssignments, conflicts, approvedLeave] = await Promise.all([
      this.assignmentRepository.createQueryBuilder('assignment')
        .select('assignment.employee_id', 'employeeId')
        .where('assignment.shift_id = :shiftId', { shiftId: shift.id })
        .andWhere('assignment.employee_id IN (:...employeeIds)', { employeeIds })
        .andWhere("assignment.assignment_status <> 'cancelled'")
        .getRawMany<{ employeeId: string }>(),
      this.assignmentRepository.createQueryBuilder('assignment')
        .innerJoin('assignment.shift', 'otherShift')
        .select('assignment.employee_id', 'employeeId')
        .where('assignment.employee_id IN (:...employeeIds)', { employeeIds })
        .andWhere("assignment.assignment_status <> 'cancelled'")
        .andWhere('otherShift.id <> :shiftId', { shiftId: shift.id })
        .andWhere('otherShift.deleted_at IS NULL')
        .andWhere("otherShift.status <> 'cancelled'")
        .andWhere('otherShift.starts_at < :endsAt', { endsAt: shift.endsAt })
        .andWhere('otherShift.ends_at > :startsAt', { startsAt: shift.startsAt })
        .getRawMany<{ employeeId: string }>(),
      this.leaveRequestRepository.createQueryBuilder('leave')
        .select('leave.employee_id', 'employeeId')
        .where('leave.employee_id IN (:...employeeIds)', { employeeIds })
        .andWhere("leave.status = 'approved'")
        .andWhere('leave.starts_at < :endsAt', { endsAt: shift.endsAt })
        .andWhere('leave.ends_at > :startsAt', { startsAt: shift.startsAt })
        .getRawMany<{ employeeId: string }>(),
    ]);
    currentAssignments.forEach(({ employeeId }) => { result.get(employeeId)!.assigned = true; });
    conflicts.forEach(({ employeeId }) => { result.get(employeeId)!.conflict = true; });
    approvedLeave.forEach(({ employeeId }) => { result.get(employeeId)!.onLeave = true; });
    return result;
  }

  private async assertAssignedEmployeesAvailable(shift: Shift, startsAt: Date, endsAt: Date) {
    const assignments = await this.assignmentRepository.find({
      where: { shiftId: shift.id, assignmentStatus: Not('cancelled') },
      relations: { employee: true },
    });
    if (!assignments.length) return;

    const proposedShift = this.shiftRepository.create({ ...shift, startsAt, endsAt });
    const availability = await this.getEmployeeAvailability(proposedShift, assignments.map((item) => item.employeeId));
    const conflicts = assignments.filter((item) => availability.get(item.employeeId)?.conflict).map((item) => this.employeeName(item.employee));
    const onLeave = assignments.filter((item) => availability.get(item.employeeId)?.onLeave).map((item) => this.employeeName(item.employee));
    if (conflicts.length) throw new BadRequestException(`Không thể di chuyển ca: ${conflicts.join(', ')} bị trùng ca`);
    if (onLeave.length) throw new BadRequestException(`Không thể di chuyển ca: ${onLeave.join(', ')} đang có nghỉ phép đã duyệt`);
  }

  private employeeWorksOnDate(employee: Employee, shift: Shift) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: shift.branch.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(shift.startsAt);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    const workDate = `${value('year')}-${value('month')}-${value('day')}`;
    return employee.hireDate <= workDate && (!employee.terminationDate || employee.terminationDate >= workDate);
  }

  private employeeName(employee: Employee) {
    return employee.preferredName?.trim() || `${employee.lastName} ${employee.firstName}`.trim();
  }

  private initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('');
  }

  private async validateReferences(branchId: string, departmentId?: string | null, positionId?: string | null) {
    const branch = await this.branchRepository.findOneBy({ id: branchId, deletedAt: IsNull(), isActive: true });
    if (!branch) throw new BadRequestException('Chi nhánh không hợp lệ');
    const [department, position] = await Promise.all([
      departmentId ? this.departmentRepository.findOneBy({ id: departmentId, organizationId: branch.organizationId, deletedAt: IsNull(), isActive: true }) : Promise.resolve(null),
      positionId ? this.positionRepository.findOneBy({ id: positionId, organizationId: branch.organizationId, deletedAt: IsNull(), isActive: true }) : Promise.resolve(null),
    ]);
    if (departmentId && !department) throw new BadRequestException('Phòng ban không hợp lệ');
    if (positionId && !position) throw new BadRequestException('Vị trí không hợp lệ');
    return { branch, department, position };
  }

  private validateTimes(startsAt: string, endsAt: string, breakMinutes: number) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    }
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
    if (breakMinutes >= durationMinutes) throw new BadRequestException('Thời gian nghỉ phải ngắn hơn thời lượng ca');
  }

  private async resolveScope(actor: AuthUser): Promise<ScheduleScope> {
    const roleCodes = new Set(actor.roles.map((role) => role.code));
    if (roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMIN') || roleCodes.has('HR')) {
      return { unrestricted: true, branchIds: [], departmentIds: [] };
    }
    if (!roleCodes.has('MANAGER')) throw new ForbiddenException('Tài khoản không có phạm vi quản lý lịch');

    const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER');
    const branchIds = managerRoles.flatMap((role) => role.branchId ? [role.branchId] : []);
    const departmentIds = managerRoles.flatMap((role) => role.departmentId ? [role.departmentId] : []);
    if (branchIds.length === 0 && departmentIds.length === 0 && actor.employeeId) {
      const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
      if (employee) branchIds.push(employee.primaryBranchId);
    }
    if (branchIds.length === 0 && departmentIds.length === 0) throw new ForbiddenException('Tài khoản quản lý chưa được gán phạm vi chi nhánh hoặc phòng ban');
    return { unrestricted: false, branchIds: [...new Set(branchIds)], departmentIds: [...new Set(departmentIds)] };
  }

  private applyScope(qb: ReturnType<Repository<Shift>['createQueryBuilder']>, scope: ScheduleScope) {
    if (scope.unrestricted) return;
    qb.andWhere(new Brackets((where) => {
      if (scope.branchIds.length) where.where('shift.branch_id IN (:...scopeBranchIds)', { scopeBranchIds: scope.branchIds });
      if (scope.departmentIds.length) {
        const method = scope.branchIds.length ? 'orWhere' : 'where';
        where[method]('shift.department_id IN (:...scopeDepartmentIds)', { scopeDepartmentIds: scope.departmentIds });
      }
    }));
  }

  private async assertReferencesInScope(branchId: string, departmentId: string | null, actor: AuthUser) {
    const scope = await this.resolveScope(actor);
    if (scope.unrestricted) return;
    if (scope.branchIds.includes(branchId) || (departmentId && scope.departmentIds.includes(departmentId))) return;
    throw new ForbiddenException('Ca làm nằm ngoài phạm vi quản lý của bạn');
  }

  private async assertShiftInScope(shift: Shift, actor: AuthUser) {
    return this.assertReferencesInScope(shift.branchId, shift.departmentId, actor);
  }

  private assertShiftCanBeChanged(shift: Shift, action: string) {
    const now = new Date();
    if (shift.status === 'cancelled') {
      throw new BadRequestException(`Không thể ${action} ca đã hủy`);
    }
    if (shift.status === 'completed') {
      throw new BadRequestException(`Không thể ${action} ca đã kết thúc`);
    }
    if (shift.status === 'published' && shift.startsAt <= now) {
      throw new BadRequestException(`Không thể ${action} khi ca đã bắt đầu`);
    }
  }

  private toResponse(shift: Shift, assignmentCount: number) {
    const now = new Date();
    const canModify = shift.status === 'draft' || (shift.status === 'published' && shift.startsAt > now);
    const lockReason = shift.status === 'cancelled'
      ? 'Ca đã hủy'
      : shift.status === 'completed'
        ? 'Ca đã kết thúc'
        : shift.status === 'published' && shift.startsAt <= now
          ? 'Ca đã công bố và đã bắt đầu'
          : null;
    return {
      id: shift.id,
      shiftTemplateId: shift.shiftTemplateId,
      name: shift.name,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      requiredHeadcount: shift.requiredHeadcount,
      assignmentCount,
      openHeadcount: Math.max(shift.requiredHeadcount - assignmentCount, 0),
      status: shift.status,
      canModify,
      lockReason,
      notes: shift.notes,
      branch: { id: shift.branch.id, code: shift.branch.code, name: shift.branch.name, timezone: shift.branch.timezone },
      department: shift.department ? { id: shift.department.id, code: shift.department.code, name: shift.department.name } : null,
      position: shift.position ? { id: shift.position.id, code: shift.position.code, name: shift.position.name } : null,
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt,
    };
  }

  private async getAssignmentCounts(shiftIds: string[]) {
    if (shiftIds.length === 0) return new Map<string, number>();
    const rows = await this.assignmentRepository
      .createQueryBuilder('assignment')
      .select('assignment.shift_id', 'shiftId')
      .addSelect('COUNT(*)', 'count')
      .where('assignment.shift_id IN (:...shiftIds)', { shiftIds })
      .andWhere("assignment.assignment_status <> 'cancelled'")
      .groupBy('assignment.shift_id')
      .getRawMany<{ shiftId: string; count: string }>();
    return new Map(rows.map((row) => [row.shiftId, Number(row.count)]));
  }

  private auditValues(shift: Shift) {
    return {
      name: shift.name,
      branchId: shift.branchId,
      departmentId: shift.departmentId,
      positionId: shift.positionId,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      requiredHeadcount: shift.requiredHeadcount,
      status: shift.status,
      notes: shift.notes,
    };
  }
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function addDateString(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedDate(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const represented = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess.getTime() - (represented - guess.getTime()));
}

function localDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function localTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function startOfUtcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
