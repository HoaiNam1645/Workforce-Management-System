import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { AttendanceRecord } from '../attendance/entities/attendance-record.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CreateShiftSwapDto, ShiftSwapActionDto, ShiftSwapQueryDto } from './dto/shift-swap.dto';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { ShiftSwapHistory } from './entities/shift-swap-history.entity';
import { ShiftSwapRequest } from './entities/shift-swap-request.entity';
import { Shift } from './entities/shift.entity';

const ACTIVE_STATUSES = ['pending_receiver', 'pending_manager'];

@Injectable()
export class ShiftSwapsService {
  constructor(
    @InjectRepository(ShiftSwapRequest) private readonly requestRepository: Repository<ShiftSwapRequest>,
    @InjectRepository(ShiftSwapHistory) private readonly historyRepository: Repository<ShiftSwapHistory>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepository: Repository<ShiftAssignment>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveRequest) private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(AttendanceRecord) private readonly attendanceRepository: Repository<AttendanceRecord>,
    private readonly dataSource: DataSource,
  ) {}

  async getOptions(actor: AuthUser) {
    const employee = await this.requireEmployee(actor);
    const now = new Date();
    const assignments = await this.assignmentRepository.createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.shift', 'shift')
      .leftJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department')
      .leftJoinAndSelect('shift.position', 'position')
      .where('assignment.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere("assignment.assignment_status IN ('assigned','confirmed')")
      .andWhere("shift.status = 'published' AND shift.deleted_at IS NULL AND shift.starts_at > :now", { now })
      .orderBy('shift.starts_at', 'ASC').getMany();
    const employees = await this.employeeRepository.find({
      where: { organizationId: employee.organizationId, employmentStatus: 'active', deletedAt: IsNull() },
      relations: { primaryBranch: true, department: true, position: true }, order: { lastName: 'ASC', firstName: 'ASC' },
    });
    const targetIds = employees.filter((item) => item.id !== employee.id).map((item) => item.id);
    const targetAssignments = targetIds.length ? await this.assignmentRepository.createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.shift', 'shift').leftJoinAndSelect('shift.branch', 'branch')
      .leftJoinAndSelect('shift.department', 'department').leftJoinAndSelect('shift.position', 'position')
      .where('assignment.employee_id IN (:...targetIds)', { targetIds })
      .andWhere("assignment.assignment_status IN ('assigned','confirmed')")
      .andWhere("shift.status = 'published' AND shift.deleted_at IS NULL AND shift.starts_at > :now", { now })
      .orderBy('shift.starts_at', 'ASC').getMany() : [];

    return {
      assignments: assignments.map((item) => this.assignmentView(item)),
      employees: employees.filter((item) => item.id !== employee.id).map((item) => ({
        id: item.id, employeeCode: item.employeeCode, fullName: this.employeeName(item),
        branch: item.primaryBranch?.name ?? 'Chưa phân chi nhánh', department: item.department?.name ?? 'Chưa phân phòng ban',
        position: item.position?.name ?? 'Chưa phân vị trí',
        assignments: targetAssignments.filter((assignment) => assignment.employeeId === item.id).map((assignment) => this.assignmentView(assignment)),
      })),
    };
  }

  async findMine(query: ShiftSwapQueryDto, actor: AuthUser) {
    const employee = await this.requireEmployee(actor);
    await this.expireRequests();
    const builder = this.baseQuery().where('(request.requester_id = :employeeId OR request.target_employee_id = :employeeId)', { employeeId: employee.id });
    if (query.status && query.status !== 'all') builder.andWhere('request.status = :status', { status: query.status });
    const items = await builder.orderBy('request.created_at', 'DESC').getMany();
    return { items: items.map((item) => this.requestView(item, employee.id)) };
  }

  async findForReview(query: ShiftSwapQueryDto, actor: AuthUser) {
    await this.expireRequests();
    const builder = this.baseQuery();
    this.applyScope(builder, actor);
    if (query.status && query.status !== 'all') builder.andWhere('request.status = :status', { status: query.status });
    const items = await builder.orderBy('request.created_at', 'DESC').getMany();
    return { items: items.map((item) => this.requestView(item, actor.employeeId)) };
  }

  async create(dto: CreateShiftSwapDto, actor: AuthUser) {
    const requester = await this.requireEmployee(actor);
    const offered = await this.loadAssignment(dto.offeredAssignmentId);
    if (offered.employeeId !== requester.id) throw new ForbiddenException('Ca này không thuộc lịch của bạn');
    const target = await this.employeeRepository.findOneBy({ id: dto.targetEmployeeId, organizationId: requester.organizationId, deletedAt: IsNull() });
    if (!target || target.employmentStatus !== 'active') throw new BadRequestException('Nhân viên thay thế không còn phù hợp');
    let requested: ShiftAssignment | null = null;
    if (dto.requestType === 'swap') {
      if (!dto.requestedAssignmentId) throw new BadRequestException('Vui lòng chọn ca muốn nhận');
      requested = await this.loadAssignment(dto.requestedAssignmentId);
      if (requested.employeeId !== target.id) throw new BadRequestException('Ca muốn nhận không thuộc nhân viên được chọn');
    }
    await this.validateExchange(offered, target, requested, requester);
    const active = await this.requestRepository.findOne({ where: { offeredAssignmentId: offered.id, status: In(ACTIVE_STATUSES) } });
    if (active) throw new BadRequestException('Ca này đang có một yêu cầu chưa hoàn tất');
    const expiresAt = new Date(Math.min(offered.shift.startsAt.getTime() - 60 * 60_000, Date.now() + 48 * 60 * 60_000));
    if (expiresAt <= new Date()) throw new BadRequestException('Đã quá thời hạn gửi yêu cầu cho ca này');
    const request = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(ShiftSwapRequest, manager.create(ShiftSwapRequest, {
        requesterId: requester.id, offeredAssignmentId: offered.id, targetEmployeeId: target.id,
        requestedAssignmentId: requested?.id ?? null, requestType: dto.requestType, reason: dto.reason?.trim() || null,
        status: 'pending_receiver', expiresAt,
      }));
      await this.addHistory(manager, created, 'created', null, 'pending_receiver', actor.id, dto.reason ?? null, this.snapshot(offered, requested));
      await this.notifyEmployee(manager, target, 'shift_swap_requested', 'Đề nghị đổi ca mới', `${this.employeeName(requester)} gửi đề nghị ${dto.requestType === 'swap' ? 'đổi ca' : 'nhường ca'} cho bạn.`, created.id);
      return created;
    });
    return this.findOneView(request.id, actor.employeeId);
  }

  async respond(id: string, accept: boolean, dto: ShiftSwapActionDto, actor: AuthUser) {
    const employee = await this.requireEmployee(actor);
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      if (request.targetEmployeeId !== employee.id) throw new ForbiddenException('Yêu cầu này không gửi cho bạn');
      if (request.status !== 'pending_receiver') throw new BadRequestException('Yêu cầu không còn chờ phản hồi');
      if (request.expiresAt && request.expiresAt <= new Date()) throw new BadRequestException('Yêu cầu đã hết hạn');
      if (accept) {
        await this.validateExchange(request.offeredAssignment, employee, request.requestedAssignment, request.requester, manager);
      }
      const from = request.status;
      request.status = accept ? 'pending_manager' : 'rejected_by_receiver';
      request.receiverRespondedAt = new Date(); request.receiverNote = dto.note?.trim() || null;
      await manager.save(request);
      await this.addHistory(manager, request, accept ? 'accepted' : 'rejected_by_receiver', from, request.status, actor.id, request.receiverNote, {});
      await this.notifyEmployee(manager, request.requester, accept ? 'shift_swap_accepted' : 'shift_swap_rejected', accept ? 'Đề nghị đã được chấp nhận' : 'Đề nghị đã bị từ chối', `${this.employeeName(employee)} đã ${accept ? 'chấp nhận' : 'từ chối'} đề nghị của bạn.`, request.id);
      if (accept) await this.notifyManagers(manager, request, 'Có yêu cầu đổi ca chờ duyệt');
      return { id: request.id, status: request.status };
    });
  }

  async review(id: string, approve: boolean, dto: ShiftSwapActionDto, actor: AuthUser) {
    if (!approve && !dto.note?.trim()) throw new BadRequestException('Vui lòng nhập lý do từ chối');
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      this.assertScope(request.offeredAssignment.shift, actor);
      if (request.status !== 'pending_manager') throw new BadRequestException('Yêu cầu không còn chờ duyệt');
      const from = request.status;
      if (approve) {
        if (!request.targetEmployee) throw new BadRequestException('Không còn thông tin người nhận ca');
        await this.validateExchange(request.offeredAssignment, request.targetEmployee, request.requestedAssignment, request.requester, manager);
        const offered = await manager.getRepository(ShiftAssignment).createQueryBuilder('assignment').setLock('pessimistic_write').where('assignment.id = :id', { id: request.offeredAssignmentId }).getOneOrFail();
        offered.employeeId = request.targetEmployeeId!; offered.assignedBy = actor.id; offered.assignedAt = new Date();
        if (request.requestType === 'swap' && request.requestedAssignmentId) {
          const requested = await manager.getRepository(ShiftAssignment).createQueryBuilder('assignment').setLock('pessimistic_write').where('assignment.id = :id', { id: request.requestedAssignmentId }).getOneOrFail();
          requested.employeeId = request.requesterId; requested.assignedBy = actor.id; requested.assignedAt = new Date();
          await manager.save(requested);
        }
        await manager.save(offered);
        request.status = 'approved';
      } else request.status = 'rejected_by_manager';
      request.reviewedBy = actor.id; request.reviewedAt = new Date(); request.reviewNote = dto.note?.trim() || null;
      await manager.save(request);
      await this.addHistory(manager, request, approve ? 'approved' : 'rejected_by_manager', from, request.status, actor.id, request.reviewNote, {});
      await this.notifyEmployee(manager, request.requester, approve ? 'shift_swap_approved' : 'shift_swap_rejected', approve ? 'Lịch làm việc đã được cập nhật' : 'Yêu cầu đổi ca không được duyệt', approve ? 'Yêu cầu đổi ca của bạn đã được duyệt.' : `Yêu cầu của bạn bị từ chối${request.reviewNote ? `: ${request.reviewNote}` : '.'}`, request.id);
      if (request.targetEmployee) await this.notifyEmployee(manager, request.targetEmployee, approve ? 'shift_swap_approved' : 'shift_swap_rejected', approve ? 'Lịch làm việc đã được cập nhật' : 'Yêu cầu đổi ca không được duyệt', approve ? 'Ca mới đã được cập nhật vào lịch của bạn.' : 'Yêu cầu liên quan đến bạn không được duyệt.', request.id);
      return { id: request.id, status: request.status };
    });
  }

  async cancel(id: string, dto: ShiftSwapActionDto, actor: AuthUser) {
    const employee = await this.requireEmployee(actor);
    return this.dataSource.transaction(async (manager) => {
      const request = await this.lockRequest(manager, id);
      if (request.requesterId !== employee.id) throw new ForbiddenException('Bạn không thể hủy yêu cầu này');
      if (!ACTIVE_STATUSES.includes(request.status)) throw new BadRequestException('Yêu cầu không còn có thể hủy');
      const from = request.status; request.status = 'cancelled'; request.reviewNote = dto.note?.trim() || null;
      await manager.save(request);
      await this.addHistory(manager, request, 'cancelled', from, request.status, actor.id, request.reviewNote, {});
      if (request.targetEmployee) await this.notifyEmployee(manager, request.targetEmployee, 'shift_swap_cancelled', 'Yêu cầu đổi ca đã hủy', `${this.employeeName(request.requester)} đã hủy đề nghị.`, request.id);
      return { id: request.id, status: request.status };
    });
  }

  async history(id: string, actor: AuthUser) {
    const request = await this.baseQuery().where('request.id = :id', { id }).getOne();
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu đổi ca');
    if (actor.employeeId !== request.requesterId && actor.employeeId !== request.targetEmployeeId) this.assertScope(request.offeredAssignment.shift, actor);
    return this.historyRepository.find({ where: { requestId: id }, relations: { actor: true }, order: { createdAt: 'ASC' } });
  }

  private baseQuery() {
    return this.requestRepository.createQueryBuilder('request')
      .innerJoinAndSelect('request.requester', 'requester').leftJoinAndSelect('request.targetEmployee', 'target')
      .innerJoinAndSelect('request.offeredAssignment', 'offered').innerJoinAndSelect('offered.shift', 'offeredShift')
      .leftJoinAndSelect('offeredShift.branch', 'offeredBranch').leftJoinAndSelect('offeredShift.department', 'offeredDepartment').leftJoinAndSelect('offeredShift.position', 'offeredPosition')
      .leftJoinAndSelect('request.requestedAssignment', 'requested').leftJoinAndSelect('requested.shift', 'requestedShift')
      .leftJoinAndSelect('requestedShift.branch', 'requestedBranch');
  }

  private async findOneView(id: string, employeeId: string | null) {
    const item = await this.baseQuery().where('request.id = :id', { id }).getOneOrFail();
    return this.requestView(item, employeeId);
  }

  private async lockRequest(manager: EntityManager, id: string) {
    const locked = await manager.getRepository(ShiftSwapRequest).createQueryBuilder('request').setLock('pessimistic_write')
      .where('request.id = :id', { id }).getOne();
    if (!locked) throw new NotFoundException('Không tìm thấy yêu cầu đổi ca');
    const request = await manager.getRepository(ShiftSwapRequest).createQueryBuilder('request')
      .innerJoinAndSelect('request.requester', 'requester').leftJoinAndSelect('request.targetEmployee', 'target')
      .innerJoinAndSelect('request.offeredAssignment', 'offered').innerJoinAndSelect('offered.shift', 'offeredShift')
      .leftJoinAndSelect('request.requestedAssignment', 'requested').leftJoinAndSelect('requested.shift', 'requestedShift')
      .where('request.id = :id', { id }).getOne();
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu đổi ca');
    return request;
  }

  private async loadAssignment(id: string) {
    const assignment = await this.assignmentRepository.findOne({ where: { id }, relations: { shift: { branch: true, department: true, position: true }, employee: true } });
    if (!assignment) throw new NotFoundException('Không tìm thấy phân ca');
    return assignment;
  }

  private async validateExchange(offered: ShiftAssignment, target: Employee, requested: ShiftAssignment | null, requester: Employee, manager?: EntityManager) {
    const attendanceRepo = manager?.getRepository(AttendanceRecord) ?? this.attendanceRepository;
    const leaveRepo = manager?.getRepository(LeaveRequest) ?? this.leaveRepository;
    const assignmentRepo = manager?.getRepository(ShiftAssignment) ?? this.assignmentRepository;
    const shifts = [offered.shift, requested?.shift].filter(Boolean) as Shift[];
    for (const shift of shifts) {
      if (shift.status !== 'published' || shift.deletedAt || shift.startsAt <= new Date()) throw new BadRequestException('Ca đã bắt đầu hoặc không còn cho phép đổi');
    }
    if (await attendanceRepo.exists({ where: { shiftAssignmentId: In([offered.id, ...(requested ? [requested.id] : [])]) } })) throw new BadRequestException('Ca đã phát sinh chấm công nên không thể đổi');
    await this.validateEmployeeForShift(target, offered.shift, requested?.id ?? null, assignmentRepo, leaveRepo);
    if (requested) await this.validateEmployeeForShift(requester, requested.shift, offered.id, assignmentRepo, leaveRepo);
  }

  private async validateEmployeeForShift(employee: Employee, shift: Shift, ignoredAssignmentId: string | null, assignmentRepo: Repository<ShiftAssignment>, leaveRepo: Repository<LeaveRequest>) {
    if (employee.employmentStatus !== 'active') throw new BadRequestException(`${this.employeeName(employee)} không ở trạng thái đang làm`);
    const conflict = await assignmentRepo.createQueryBuilder('assignment').innerJoin('assignment.shift', 'shift')
      .where('assignment.employee_id = :employeeId', { employeeId: employee.id }).andWhere("assignment.assignment_status IN ('assigned','confirmed')")
      .andWhere("shift.status = 'published' AND shift.starts_at < :endsAt AND shift.ends_at > :startsAt", { startsAt: shift.startsAt, endsAt: shift.endsAt })
      .andWhere(ignoredAssignmentId ? 'assignment.id <> :ignoredAssignmentId' : '1=1', { ignoredAssignmentId }).getOne();
    if (conflict) throw new BadRequestException(`${this.employeeName(employee)} bị trùng lịch với ca khác`);
    const leave = await leaveRepo.createQueryBuilder('leave').where('leave.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere("leave.status = 'approved' AND leave.starts_at < :endsAt AND leave.ends_at > :startsAt", { startsAt: shift.startsAt, endsAt: shift.endsAt }).getOne();
    if (leave) throw new BadRequestException(`${this.employeeName(employee)} đang có lịch nghỉ đã duyệt`);
  }

  private requestView(item: ShiftSwapRequest, employeeId: string | null) {
    return {
      id: item.id, requestType: item.requestType, status: item.status, reason: item.reason,
      receiverNote: item.receiverNote, reviewNote: item.reviewNote, createdAt: item.createdAt, expiresAt: item.expiresAt,
      requester: { id: item.requester.id, employeeCode: item.requester.employeeCode, fullName: this.employeeName(item.requester) },
      targetEmployee: item.targetEmployee ? { id: item.targetEmployee.id, employeeCode: item.targetEmployee.employeeCode, fullName: this.employeeName(item.targetEmployee) } : null,
      offeredAssignment: this.assignmentView(item.offeredAssignment), requestedAssignment: item.requestedAssignment ? this.assignmentView(item.requestedAssignment) : null,
      actions: { respond: item.targetEmployeeId === employeeId && item.status === 'pending_receiver', cancel: item.requesterId === employeeId && ACTIVE_STATUSES.includes(item.status) },
    };
  }

  private assignmentView(item: ShiftAssignment) {
    return { id: item.id, employeeId: item.employeeId, shift: { id: item.shift.id, name: item.shift.name, startsAt: item.shift.startsAt, endsAt: item.shift.endsAt, branch: item.shift.branch ? { id: item.shift.branch.id, name: item.shift.branch.name } : null, department: item.shift.department ? { id: item.shift.department.id, name: item.shift.department.name } : null, position: item.shift.position ? { id: item.shift.position.id, name: item.shift.position.name } : null } };
  }

  private snapshot(offered: ShiftAssignment, requested: ShiftAssignment | null) { return { offered: this.assignmentView(offered), requested: requested ? this.assignmentView(requested) : null }; }
  private employeeName(employee: Employee) { return `${employee.lastName} ${employee.firstName}`.replace(/\s+/g, ' ').trim(); }
  private async requireEmployee(actor: AuthUser) { if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ nhân viên'); const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() }); if (!employee) throw new ForbiddenException('Không tìm thấy hồ sơ nhân viên'); return employee; }
  private assertScope(shift: Shift, actor: AuthUser) { if (actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role.code))) return; const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER'); if (!managerRoles.some((role) => Boolean(role.branchId || role.departmentId) && (!role.branchId || role.branchId === shift.branchId) && (!role.departmentId || role.departmentId === shift.departmentId))) throw new ForbiddenException('Ca nằm ngoài phạm vi quản lý'); }
  private applyScope(builder: ReturnType<ShiftSwapsService['baseQuery']>, actor: AuthUser) { if (actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role.code))) return; const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER'); const branches = managerRoles.flatMap((role) => role.branchId ? [role.branchId] : []); const departments = managerRoles.flatMap((role) => role.departmentId ? [role.departmentId] : []); if (!branches.length && !departments.length) builder.andWhere('1=0'); else builder.andWhere('(offeredShift.branch_id IN (:...branches) OR offeredShift.department_id IN (:...departments))', { branches: branches.length ? branches : ['00000000-0000-0000-0000-000000000000'], departments: departments.length ? departments : ['00000000-0000-0000-0000-000000000000'] }); }
  private async addHistory(manager: EntityManager, request: ShiftSwapRequest, action: string, fromStatus: string | null, toStatus: string, actedBy: string | null, note: string | null, snapshotData: Record<string, unknown>) { await manager.save(ShiftSwapHistory, manager.create(ShiftSwapHistory, { requestId: request.id, action, fromStatus, toStatus, actedBy, note, snapshotData })); }
  private async notifyEmployee(manager: EntityManager, employee: Employee, eventType: string, title: string, message: string, requestId: string) { if (!employee.userId) return; await manager.save(Notification, manager.create(Notification, { userId: employee.userId, eventType, title, message, data: { shiftSwapRequestId: requestId }, actionUrl: '/shift-swaps' })); }
  private async notifyManagers(manager: EntityManager, request: ShiftSwapRequest, title: string) { const rows = await manager.query<Array<{ user_id: string }>>(`SELECT DISTINCT ur.user_id FROM workforce.user_roles ur JOIN workforce.roles r ON r.id=ur.role_id JOIN workforce.role_permissions rp ON rp.role_id=ur.role_id JOIN workforce.permissions p ON p.id=rp.permission_id AND p.code='shift_swaps.approve' JOIN workforce.users u ON u.id=ur.user_id AND u.status='active' AND u.deleted_at IS NULL WHERE r.code IN ('SUPER_ADMIN','ADMIN','HR') OR (r.code='MANAGER' AND (ur.branch_id=$1 OR ur.department_id=$2))`, [request.offeredAssignment.shift.branchId, request.offeredAssignment.shift.departmentId]); if (rows.length) await manager.save(Notification, rows.map((row) => manager.create(Notification, { userId: row.user_id, eventType: 'shift_swap_pending_manager', title, message: `${this.employeeName(request.requester)} đang chờ duyệt yêu cầu đổi ca.`, data: { shiftSwapRequestId: request.id }, actionUrl: '/admin/shift-swaps' }))); }
  private async expireRequests() { await this.requestRepository.createQueryBuilder().update().set({ status: 'expired' }).where("status IN ('pending_receiver','pending_manager') AND expires_at <= CURRENT_TIMESTAMP").execute(); }
}
