import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Organization } from '../core/entities/organization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { CreateLeaveEntitlementPolicyDto, UpdateLeaveEntitlementPolicyDto } from './dto/leave-entitlement-policy.dto';
import { AdjustLeaveBalanceDto, LeaveBalanceQueryDto } from './dto/leave-balance.dto';
import { CreateLeaveRequestDto } from './dto/leave-request.dto';
import { CreateLeaveTypeDto, LeaveTypeQueryDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveEntitlementPolicy } from './entities/leave-entitlement-policy.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveType) private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeaveEntitlementPolicy) private readonly policyRepository: Repository<LeaveEntitlementPolicy>,
    @InjectRepository(LeaveBalance) private readonly balanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveBalanceTransaction) private readonly transactionRepository: Repository<LeaveBalanceTransaction>,
    @InjectRepository(LeaveRequest) private readonly requestRepository: Repository<LeaveRequest>,
    @InjectRepository(Notification) private readonly notificationRepository: Repository<Notification>,
    private readonly dataSource: DataSource,
  ) {}

  async getBalanceOptions(actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const [employees, leaveTypes] = await Promise.all([
      this.employeeRepository.find({
        where: { organizationId: organization.id, deletedAt: IsNull() },
        relations: { primaryBranch: true, department: true },
        order: { lastName: 'ASC', firstName: 'ASC' },
      }),
      this.leaveTypeRepository.find({ where: { organizationId: organization.id, isActive: true }, order: { name: 'ASC' } }),
    ]);
    const visibleEmployees = this.filterEmployeesByScope(employees, actor);
    return {
      employees: visibleEmployees.map((employee) => ({
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: this.employeeName(employee),
        branch: { id: employee.primaryBranchId, name: employee.primaryBranch.name },
        department: { id: employee.departmentId, name: employee.department.name },
      })),
      leaveTypes: leaveTypes.map((type) => ({ id: type.id, code: type.code, name: type.name, color: type.color.trim(), unit: type.unit, tracksBalance: type.tracksBalance, isPaid: type.isPaid })),
      branches: [...new Map(visibleEmployees.map((employee) => [employee.primaryBranchId, { id: employee.primaryBranchId, name: employee.primaryBranch.name }])).values()],
      departments: [...new Map(visibleEmployees.map((employee) => [employee.departmentId, { id: employee.departmentId, name: employee.department.name }])).values()],
    };
  }

  async findBalances(query: LeaveBalanceQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const year = query.year ?? new Date().getFullYear();
    const builder = this.balanceRepository.createQueryBuilder('balance')
      .innerJoinAndSelect('balance.employee', 'employee')
      .innerJoinAndSelect('employee.primaryBranch', 'branch')
      .innerJoinAndSelect('employee.department', 'department')
      .innerJoinAndSelect('balance.leaveType', 'leaveType')
      .where('employee.organizationId = :organizationId', { organizationId: organization.id })
      .andWhere('employee.deletedAt IS NULL')
      .andWhere('balance.balanceYear = :year', { year });
    this.applyEmployeeScope(builder, actor);
    if (query.leaveTypeId) builder.andWhere('balance.leaveTypeId = :leaveTypeId', { leaveTypeId: query.leaveTypeId });
    if (query.branchId) builder.andWhere('employee.primaryBranchId = :branchId', { branchId: query.branchId });
    if (query.departmentId) builder.andWhere('employee.departmentId = :departmentId', { departmentId: query.departmentId });
    if (query.employeeId) builder.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    if (query.search?.trim()) builder.andWhere("(employee.employeeCode ILIKE :search OR CONCAT(employee.lastName, ' ', employee.firstName) ILIKE :search OR leaveType.name ILIKE :search)", { search: `%${query.search.trim()}%` });
    const balances = await builder.orderBy('employee.lastName', 'ASC').addOrderBy('employee.firstName', 'ASC').addOrderBy('leaveType.name', 'ASC').getMany();
    const items = balances.map((balance) => this.balanceView(balance));
    const filtered = items.filter((item) => {
      if (!query.status || query.status === 'all') return true;
      if (query.status === 'negative') return item.available < 0;
      if (query.status === 'depleted') return item.available === 0;
      if (query.status === 'low') return item.available > 0 && item.available <= Math.max(item.totalGranted * 0.25, 1);
      return item.available > Math.max(item.totalGranted * 0.25, 1);
    });
    const summary = filtered.reduce((result, item) => {
      result.employees.add(item.employee.id);
      result.granted += item.totalGranted;
      result.reserved += item.reserved;
      result.used += item.used;
      result.available += item.available;
      result.low += item.available <= Math.max(item.totalGranted * 0.25, 1) ? 1 : 0;
      const unit = item.leaveType.balanceUnit as 'day' | 'hour';
      result.byUnit[unit].granted += item.totalGranted;
      result.byUnit[unit].reserved += item.reserved;
      result.byUnit[unit].used += item.used;
      result.byUnit[unit].available += item.available;
      return result;
    }, {
      employees: new Set<string>(), granted: 0, reserved: 0, used: 0, available: 0, low: 0,
      byUnit: {
        day: { granted: 0, reserved: 0, used: 0, available: 0 },
        hour: { granted: 0, reserved: 0, used: 0, available: 0 },
      },
    });
    return { year, summary: { ...summary, employees: summary.employees.size }, items: filtered };
  }

  async getBalanceLedger(id: string, actor: AuthUser) {
    const balance = await this.balanceRepository.findOne({ where: { id }, relations: { employee: { primaryBranch: true, department: true }, leaveType: true } });
    if (!balance) throw new NotFoundException('Không tìm thấy số dư phép');
    this.assertEmployeeScope(balance.employee, actor);
    const transactions = await this.transactionRepository.find({ where: { leaveBalanceId: id }, order: { effectiveDate: 'DESC', createdAt: 'DESC' }, relations: { createdByUser: true } });
    return {
      balance: this.balanceView(balance),
      transactions: transactions.map((item) => ({
        id: item.id, type: item.transactionType, amount: Number(item.amount), balanceBefore: item.balanceBefore == null ? null : Number(item.balanceBefore), balanceAfter: item.balanceAfter == null ? null : Number(item.balanceAfter),
        effectiveDate: item.effectiveDate, description: item.description, createdBy: item.createdByUser?.displayName ?? 'Hệ thống', createdAt: item.createdAt,
      })),
    };
  }

  async adjustBalance(dto: AdjustLeaveBalanceDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const [employee, leaveType] = await Promise.all([
      this.employeeRepository.findOne({ where: { id: dto.employeeId, organizationId: organization.id, deletedAt: IsNull() }, relations: { primaryBranch: true, department: true } }),
      this.leaveTypeRepository.findOneBy({ id: dto.leaveTypeId, organizationId: organization.id }),
    ]);
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    if (!leaveType) throw new NotFoundException('Không tìm thấy loại nghỉ');
    this.assertEmployeeScope(employee, actor);
    if (!leaveType.tracksBalance) throw new BadRequestException('Loại nghỉ này không quản lý số dư');
    if (dto.reason.trim().length < 5) throw new BadRequestException('Lý do điều chỉnh phải có ít nhất 5 ký tự');
    return this.dataSource.transaction(async (manager) => {
      let balance = await manager.getRepository(LeaveBalance).createQueryBuilder('balance').setLock('pessimistic_write')
        .where('balance.employeeId = :employeeId AND balance.leaveTypeId = :leaveTypeId AND balance.balanceYear = :balanceYear', dto).getOne();
      if (!balance) balance = await manager.save(LeaveBalance, manager.create(LeaveBalance, { employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: dto.balanceYear, openingAmount: '0', accruedAmount: '0', usedAmount: '0', reservedAmount: '0', expiredAmount: '0', adjustedAmount: '0' }));
      const before = this.availableBalance(balance);
      const signedAmount = dto.direction === 'increase' ? dto.amount : -dto.amount;
      const after = before + signedAmount;
      if (!leaveType.allowNegativeBalance && after < 0) throw new BadRequestException(`Không thể điều chỉnh giảm vượt số dư khả dụng ${this.formatAmount(before)}`);
      balance.adjustedAmount = this.decimal(Number(balance.adjustedAmount) + signedAmount);
      balance.updatedAt = new Date();
      balance = await manager.save(LeaveBalance, balance);
      const transaction = await manager.save(LeaveBalanceTransaction, manager.create(LeaveBalanceTransaction, {
        leaveBalanceId: balance.id, leaveRequestId: null, transactionType: 'adjustment', amount: this.decimal(signedAmount),
        balanceBefore: this.decimal(before), balanceAfter: this.decimal(after), effectiveDate: dto.effectiveDate,
        description: dto.reason.trim(), createdBy: actor.id,
      }));
      await this.writeAudit(manager, actor.id, 'leave_balance.adjusted', 'leave_balance', balance.id, { available: before }, { available: after, amount: signedAmount, transactionId: transaction.id, reason: dto.reason.trim() });
      return this.balanceView({ ...balance, employee, leaveType } as LeaveBalance);
    });
  }

  async getMyLeave(actor: AuthUser) {
    const employee = await this.requireActorEmployee(actor);
    const [types, balances, requests] = await Promise.all([
      this.leaveTypeRepository.find({ where: { organizationId: employee.organizationId, isActive: true }, order: { name: 'ASC' } }),
      this.balanceRepository.find({ where: { employeeId: employee.id }, relations: { leaveType: true }, order: { balanceYear: 'DESC' } }),
      this.requestRepository.find({ where: { employeeId: employee.id }, relations: { leaveType: true }, order: { requestedAt: 'DESC' }, take: 50 }),
    ]);
    const currentYear = new Date().getFullYear();
    const balanceByType = new Map(balances.filter((item) => item.balanceYear === currentYear).map((item) => [item.leaveTypeId, item]));
    return {
      employee: { id: employee.id, employeeCode: employee.employeeCode, fullName: this.employeeName(employee) },
      leaveTypes: types.map((type) => {
        const balance = balanceByType.get(type.id);
        return { id: type.id, code: type.code, name: type.name, description: type.description, color: type.color.trim(), isPaid: type.isPaid, unit: type.unit, tracksBalance: type.tracksBalance, allowNegativeBalance: type.allowNegativeBalance, requiresAttachment: type.requiresAttachment, attachmentRequiredAfter: type.attachmentRequiredAfter == null ? null : Number(type.attachmentRequiredAfter), hoursPerDay: Number(type.hoursPerDay), hourIncrementMinutes: type.hourIncrementMinutes, minNoticeDays: type.minNoticeDays, allowRetroactive: type.allowRetroactive, balance: balance ? this.balanceNumbers(balance) : null };
      }),
      requests: requests.map((request) => this.requestView(request)),
    };
  }

  async previewRequest(dto: CreateLeaveRequestDto, actor: AuthUser) {
    const employee = await this.requireActorEmployee(actor);
    const leaveType = await this.leaveTypeRepository.findOneBy({ id: dto.leaveTypeId, organizationId: employee.organizationId, isActive: true });
    if (!leaveType) throw new NotFoundException('Loại nghỉ không tồn tại hoặc đã ngừng áp dụng');
    const calculated = this.calculateRequest(dto, leaveType);
    const balance = leaveType.tracksBalance ? await this.balanceRepository.findOneBy({ employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: calculated.balanceYear }) : null;
    const available = balance ? this.availableBalance(balance) : null;
    const overlap = await this.requestRepository.createQueryBuilder('request').where('request.employeeId = :employeeId', { employeeId: employee.id }).andWhere("request.status IN ('pending', 'approved')").andWhere("tstzrange(request.startsAt, request.endsAt, '[)') && tstzrange(:startsAt, :endsAt, '[)')", { startsAt: calculated.startsAt, endsAt: calculated.endsAt }).getOne();
    const errors = this.requestValidationErrors(dto, leaveType, calculated.balanceAmount, available, overlap);
    return { ...calculated, leaveType: { id: leaveType.id, name: leaveType.name, unit: leaveType.unit, isPaid: leaveType.isPaid, tracksBalance: leaveType.tracksBalance }, balance: available == null ? null : { available, deductedAmount: calculated.balanceAmount, afterRequest: available - calculated.balanceAmount }, overlap: overlap ? { id: overlap.id, startsAt: overlap.startsAt, endsAt: overlap.endsAt, status: overlap.status } : null, valid: errors.length === 0, errors };
  }

  async createRequest(dto: CreateLeaveRequestDto, actor: AuthUser) {
    const employee = await this.requireActorEmployee(actor);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const leaveType = await manager.findOneBy(LeaveType, { id: dto.leaveTypeId, organizationId: employee.organizationId, isActive: true });
        if (!leaveType) throw new NotFoundException('Loại nghỉ không tồn tại hoặc đã ngừng áp dụng');
        const calculated = this.calculateRequest(dto, leaveType);
        let balance: LeaveBalance | null = null;
        let available: number | null = null;
        if (leaveType.tracksBalance) {
          balance = await manager.getRepository(LeaveBalance).createQueryBuilder('balance').setLock('pessimistic_write').where('balance.employeeId = :employeeId AND balance.leaveTypeId = :leaveTypeId AND balance.balanceYear = :balanceYear', { employeeId: employee.id, leaveTypeId: leaveType.id, balanceYear: calculated.balanceYear }).getOne();
          available = balance ? this.availableBalance(balance) : 0;
        }
        const overlap = await manager.getRepository(LeaveRequest).createQueryBuilder('request').where('request.employeeId = :employeeId', { employeeId: employee.id }).andWhere("request.status IN ('pending', 'approved')").andWhere("tstzrange(request.startsAt, request.endsAt, '[)') && tstzrange(:startsAt, :endsAt, '[)')", { startsAt: calculated.startsAt, endsAt: calculated.endsAt }).getOne();
        const errors = this.requestValidationErrors(dto, leaveType, calculated.balanceAmount, available, overlap);
        if (errors.length) throw new BadRequestException(errors.join(' '));
        const status = leaveType.requiresApproval ? 'pending' : 'approved';
        const request = await manager.save(LeaveRequest, manager.create(LeaveRequest, {
          employeeId: employee.id, leaveTypeId: leaveType.id, startsAt: calculated.startsAt, endsAt: calculated.endsAt,
          requestMode: dto.requestMode, dayPart: dto.requestMode === 'half_day' ? dto.dayPart ?? null : null,
          requestedAmount: this.decimal(calculated.amount), unitSnapshot: calculated.unit, isPaidSnapshot: leaveType.isPaid,
          hoursPerDaySnapshot: leaveType.hoursPerDay, balanceYear: calculated.balanceYear, reason: dto.reason.trim(),
          attachmentUrl: dto.attachmentUrl?.trim() || null, status, requestedAt: new Date(), requestedBy: actor.id,
          reviewedBy: status === 'approved' ? actor.id : null, reviewedAt: status === 'approved' ? new Date() : null,
          reviewNote: status === 'approved' ? 'Tự động duyệt theo cấu hình loại nghỉ' : null, cancelledAt: null,
        }));
        if (balance) {
          const before = this.availableBalance(balance);
          if (status === 'pending') balance.reservedAmount = this.decimal(Number(balance.reservedAmount) + calculated.balanceAmount);
          else balance.usedAmount = this.decimal(Number(balance.usedAmount) + calculated.balanceAmount);
          balance.updatedAt = new Date();
          await manager.save(LeaveBalance, balance);
          await manager.save(LeaveBalanceTransaction, manager.create(LeaveBalanceTransaction, {
            leaveBalanceId: balance.id, leaveRequestId: request.id, transactionType: status === 'pending' ? 'reservation' : 'usage', amount: this.decimal(-calculated.balanceAmount),
            balanceBefore: this.decimal(before), balanceAfter: this.decimal(before - calculated.balanceAmount), effectiveDate: dto.startDate,
            description: status === 'pending' ? 'Giữ chỗ số dư cho yêu cầu nghỉ đang chờ duyệt' : 'Sử dụng số dư cho yêu cầu tự động duyệt', createdBy: actor.id,
          }));
        }
        await this.writeAudit(manager, actor.id, 'leave_request.created', 'leave_request', request.id, null, { status, amount: calculated.amount, unit: calculated.unit, startsAt: calculated.startsAt, endsAt: calculated.endsAt, isPaid: leaveType.isPaid });
        if (status === 'pending') await this.notifyLeaveApprovers(manager, employee, request, leaveType, actor.id);
        return this.requestView({ ...request, leaveType } as LeaveRequest);
      });
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { constraint?: string } }).driverError?.constraint === 'leave_requests_no_overlap') throw new ConflictException('Khoảng nghỉ bị trùng với một yêu cầu đang chờ hoặc đã duyệt');
      throw error;
    }
  }

  async findTypes(query: LeaveTypeQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const builder = this.leaveTypeRepository.createQueryBuilder('leaveType')
      .where('leaveType.organizationId = :organizationId', { organizationId: organization.id });
    const search = query.search?.trim();
    if (search) builder.andWhere('(leaveType.code ILIKE :search OR leaveType.name ILIKE :search OR leaveType.description ILIKE :search)', { search: `%${search}%` });
    if (query.status === 'active') builder.andWhere('leaveType.isActive = true');
    if (query.status === 'inactive') builder.andWhere('leaveType.isActive = false');
    if (query.payType === 'paid') builder.andWhere('leaveType.isPaid = true');
    if (query.payType === 'unpaid') builder.andWhere('leaveType.isPaid = false');
    if (query.tracksBalance !== undefined) builder.andWhere('leaveType.tracksBalance = :tracksBalance', { tracksBalance: query.tracksBalance === 'true' });
    const types = await builder.orderBy('leaveType.isActive', 'DESC').addOrderBy('leaveType.name', 'ASC').getMany();
    const ids = types.map((type) => type.id);
    const [policies, balanceCounts, requestCounts] = ids.length ? await Promise.all([
      this.policyRepository.createQueryBuilder('policy').where('policy.leaveTypeId IN (:...ids)', { ids }).orderBy('policy.effectiveFrom', 'DESC').getMany(),
      this.balanceRepository.createQueryBuilder('balance').select('balance.leave_type_id', 'leaveTypeId').addSelect('COUNT(DISTINCT balance.employee_id)', 'count').where('balance.leave_type_id IN (:...ids)', { ids }).groupBy('balance.leave_type_id').getRawMany<{ leaveTypeId: string; count: string }>(),
      this.requestRepository.createQueryBuilder('request').select('request.leave_type_id', 'leaveTypeId').addSelect('COUNT(*)', 'count').where('request.leave_type_id IN (:...ids)', { ids }).groupBy('request.leave_type_id').getRawMany<{ leaveTypeId: string; count: string }>(),
    ]) : [[], [], []];
    const today = this.dateOnly(new Date());
    const policiesByType = new Map<string, LeaveEntitlementPolicy[]>();
    policies.forEach((policy) => policiesByType.set(policy.leaveTypeId, [...(policiesByType.get(policy.leaveTypeId) ?? []), policy]));
    const employeesByType = new Map(balanceCounts.map((item) => [item.leaveTypeId, Number(item.count)]));
    const requestsByType = new Map(requestCounts.map((item) => [item.leaveTypeId, Number(item.count)]));
    const items = types.map((type) => {
      const typePolicies = policiesByType.get(type.id) ?? [];
      const currentPolicy = typePolicies.find((policy) => policy.isActive && policy.effectiveFrom <= today && (!policy.effectiveTo || policy.effectiveTo >= today)) ?? null;
      const nextPolicy = typePolicies.filter((policy) => policy.isActive && policy.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
      return this.typeView(type, currentPolicy, nextPolicy, employeesByType.get(type.id) ?? 0, requestsByType.get(type.id) ?? 0, typePolicies.length);
    });
    return {
      summary: {
        total: items.length,
        active: items.filter((item) => item.isActive).length,
        paid: items.filter((item) => item.isPaid && item.isActive).length,
        trackedBalance: items.filter((item) => item.tracksBalance && item.isActive).length,
        missingPolicy: items.filter((item) => item.tracksBalance && item.isActive && !item.currentPolicy && !item.nextPolicy).length,
      },
      items,
    };
  }

  async createType(dto: CreateLeaveTypeDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.leaveTypeRepository.findOneBy({ organizationId: organization.id, code });
    if (existing) throw new ConflictException('Mã loại nghỉ đã tồn tại');
    this.validateType(dto);
    return this.dataSource.transaction(async (manager) => {
      const type = await manager.save(LeaveType, manager.create(LeaveType, {
        organizationId: organization.id,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        color: dto.color.toUpperCase(),
        isPaid: dto.isPaid,
        unit: dto.unit,
        annualAllowance: null,
        tracksBalance: dto.tracksBalance,
        allowNegativeBalance: dto.tracksBalance ? dto.allowNegativeBalance : false,
        requiresAttachment: dto.requiresAttachment,
        attachmentRequiredAfter: dto.requiresAttachment && dto.attachmentRequiredAfter != null ? String(dto.attachmentRequiredAfter) : null,
        hoursPerDay: String(dto.hoursPerDay),
        hourIncrementMinutes: dto.hourIncrementMinutes,
        minNoticeDays: dto.minNoticeDays,
        allowRetroactive: dto.allowRetroactive,
        requiresApproval: dto.requiresApproval,
        isActive: dto.isActive,
      }));
      await this.writeAudit(manager, actor.id, 'leave_type.created', 'leave_type', type.id, null, this.snapshotType(type));
      return this.typeView(type, null, null, 0, 0, 0);
    });
  }

  async updateType(id: string, dto: UpdateLeaveTypeDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const type = await this.leaveTypeRepository.findOneBy({ id, organizationId: organization.id });
    if (!type) throw new NotFoundException('Không tìm thấy loại nghỉ');
    const merged = { ...this.snapshotType(type), ...dto } as CreateLeaveTypeDto;
    this.validateType(merged);
    if (dto.code && dto.code.trim().toUpperCase() !== type.code) {
      const [requests, balances] = await Promise.all([
        this.requestRepository.countBy({ leaveTypeId: id }),
        this.balanceRepository.countBy({ leaveTypeId: id }),
      ]);
      if (requests || balances) throw new BadRequestException('Không thể đổi mã loại nghỉ đã phát sinh dữ liệu');
      const duplicate = await this.leaveTypeRepository.findOneBy({ organizationId: organization.id, code: dto.code.trim().toUpperCase() });
      if (duplicate) throw new ConflictException('Mã loại nghỉ đã tồn tại');
    }
    const oldValues = this.snapshotType(type);
    if (dto.code !== undefined) type.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) type.name = dto.name.trim();
    if (dto.description !== undefined) type.description = dto.description?.trim() || null;
    if (dto.color !== undefined) type.color = dto.color.toUpperCase();
    if (dto.isPaid !== undefined) type.isPaid = dto.isPaid;
    if (dto.unit !== undefined) type.unit = dto.unit;
    if (dto.tracksBalance !== undefined) type.tracksBalance = dto.tracksBalance;
    if (dto.allowNegativeBalance !== undefined) type.allowNegativeBalance = type.tracksBalance ? dto.allowNegativeBalance : false;
    if (dto.requiresAttachment !== undefined) type.requiresAttachment = dto.requiresAttachment;
    if (dto.attachmentRequiredAfter !== undefined) type.attachmentRequiredAfter = type.requiresAttachment && dto.attachmentRequiredAfter != null ? String(dto.attachmentRequiredAfter) : null;
    if (!type.requiresAttachment) type.attachmentRequiredAfter = null;
    if (dto.hoursPerDay !== undefined) type.hoursPerDay = String(dto.hoursPerDay);
    if (dto.hourIncrementMinutes !== undefined) type.hourIncrementMinutes = dto.hourIncrementMinutes;
    if (dto.minNoticeDays !== undefined) type.minNoticeDays = dto.minNoticeDays;
    if (dto.allowRetroactive !== undefined) type.allowRetroactive = dto.allowRetroactive;
    if (dto.requiresApproval !== undefined) type.requiresApproval = dto.requiresApproval;
    if (dto.isActive !== undefined) type.isActive = dto.isActive;
    type.updatedAt = new Date();
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(LeaveType, type);
      await this.writeAudit(manager, actor.id, 'leave_type.updated', 'leave_type', type.id, oldValues, this.snapshotType(saved));
      const policies = await manager.find(LeaveEntitlementPolicy, { where: { leaveTypeId: id }, order: { effectiveFrom: 'DESC' } });
      return this.typeView(saved, this.currentPolicy(policies), this.nextPolicy(policies), await manager.count(LeaveBalance, { where: { leaveTypeId: id } }), await manager.count(LeaveRequest, { where: { leaveTypeId: id } }), policies.length);
    });
  }

  async createPolicy(leaveTypeId: string, dto: CreateLeaveEntitlementPolicyDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const type = await this.leaveTypeRepository.findOneBy({ id: leaveTypeId, organizationId: organization.id });
    if (!type) throw new NotFoundException('Không tìm thấy loại nghỉ');
    if (!type.tracksBalance) throw new BadRequestException('Loại nghỉ này không theo dõi số dư');
    await this.validatePolicyRange(leaveTypeId, dto, null);
    return this.dataSource.transaction(async (manager) => {
      const policy = await manager.save(LeaveEntitlementPolicy, manager.create(LeaveEntitlementPolicy, {
        organizationId: organization.id,
        leaveTypeId,
        name: dto.name.trim(),
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo || null,
        accrualMethod: dto.accrualMethod,
        allowanceAmount: String(dto.allowanceAmount),
        carryoverLimit: dto.carryoverLimit == null ? null : String(dto.carryoverLimit),
        maxBalance: dto.maxBalance == null ? null : String(dto.maxBalance),
        prorateNewHires: dto.prorateNewHires,
        appliesToEmploymentType: dto.appliesToEmploymentType || null,
        isActive: dto.isActive,
      }));
      type.annualAllowance = policy.allowanceAmount;
      type.updatedAt = new Date();
      await manager.save(LeaveType, type);
      await this.writeAudit(manager, actor.id, 'leave_policy.created', 'leave_entitlement_policy', policy.id, null, this.snapshotPolicy(policy));
      return this.policyView(policy, type);
    });
  }

  async updatePolicy(id: string, dto: UpdateLeaveEntitlementPolicyDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const policy = await this.policyRepository.findOne({ where: { id, organizationId: organization.id }, relations: { leaveType: true } });
    if (!policy) throw new NotFoundException('Không tìm thấy chính sách hạn mức');
    const merged: CreateLeaveEntitlementPolicyDto = {
      name: dto.name ?? policy.name,
      effectiveFrom: dto.effectiveFrom ?? policy.effectiveFrom,
      effectiveTo: dto.effectiveTo !== undefined ? dto.effectiveTo : policy.effectiveTo,
      accrualMethod: (dto.accrualMethod ?? policy.accrualMethod) as CreateLeaveEntitlementPolicyDto['accrualMethod'],
      allowanceAmount: dto.allowanceAmount ?? Number(policy.allowanceAmount),
      carryoverLimit: dto.carryoverLimit !== undefined ? dto.carryoverLimit : policy.carryoverLimit == null ? null : Number(policy.carryoverLimit),
      maxBalance: dto.maxBalance !== undefined ? dto.maxBalance : policy.maxBalance == null ? null : Number(policy.maxBalance),
      prorateNewHires: dto.prorateNewHires ?? policy.prorateNewHires,
      appliesToEmploymentType: dto.appliesToEmploymentType !== undefined ? dto.appliesToEmploymentType : policy.appliesToEmploymentType as 'full_time' | 'part_time' | null,
      isActive: dto.isActive ?? policy.isActive,
    };
    await this.validatePolicyRange(policy.leaveTypeId, merged, policy.id);
    const oldValues = this.snapshotPolicy(policy);
    Object.assign(policy, {
      name: merged.name.trim(), effectiveFrom: merged.effectiveFrom, effectiveTo: merged.effectiveTo || null,
      accrualMethod: merged.accrualMethod, allowanceAmount: String(merged.allowanceAmount),
      carryoverLimit: merged.carryoverLimit == null ? null : String(merged.carryoverLimit),
      maxBalance: merged.maxBalance == null ? null : String(merged.maxBalance),
      prorateNewHires: merged.prorateNewHires, appliesToEmploymentType: merged.appliesToEmploymentType || null,
      isActive: merged.isActive, updatedAt: new Date(),
    });
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(LeaveEntitlementPolicy, policy);
      policy.leaveType.annualAllowance = saved.allowanceAmount;
      policy.leaveType.updatedAt = new Date();
      await manager.save(LeaveType, policy.leaveType);
      await this.writeAudit(manager, actor.id, 'leave_policy.updated', 'leave_entitlement_policy', policy.id, oldValues, this.snapshotPolicy(saved));
      return this.policyView(saved, policy.leaveType);
    });
  }

  private validateType(dto: CreateLeaveTypeDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Tên loại nghỉ không được để trống');
    if (!dto.tracksBalance && dto.allowNegativeBalance) throw new BadRequestException('Không thể cho phép số dư âm khi loại nghỉ không theo dõi số dư');
    if (!dto.requiresAttachment && dto.attachmentRequiredAfter != null) throw new BadRequestException('Chỉ cấu hình ngưỡng tài liệu khi yêu cầu đính kèm được bật');
  }

  private calculateRequest(dto: CreateLeaveRequestDto, leaveType: LeaveType) {
    if (dto.endDate < dto.startDate) throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi');
    if (dto.startDate.slice(0, 4) !== dto.endDate.slice(0, 4)) throw new BadRequestException('Một yêu cầu nghỉ không được vượt qua hai năm số dư');
    if (dto.requestMode === 'hourly' && dto.startDate !== dto.endDate) throw new BadRequestException('Nghỉ theo giờ chỉ được tạo trong cùng một ngày');
    if (dto.requestMode === 'half_day' && dto.startDate !== dto.endDate) throw new BadRequestException('Nghỉ nửa ngày chỉ được tạo trong cùng một ngày');
    if (dto.requestMode === 'hourly' && leaveType.unit === 'day') throw new BadRequestException('Loại nghỉ này chỉ cho phép nghỉ theo ngày');
    if (dto.requestMode !== 'hourly' && leaveType.unit === 'hour') throw new BadRequestException('Loại nghỉ này chỉ cho phép nghỉ theo giờ');
    if (dto.requestMode === 'half_day' && !dto.dayPart) throw new BadRequestException('Vui lòng chọn nửa ngày đầu hoặc nửa ngày cuối');
    const offset = '+07:00';
    let startsAt: Date;
    let endsAt: Date;
    let amount: number;
    let unit: 'day' | 'hour';
    if (dto.requestMode === 'hourly') {
      if (!dto.startTime || !dto.endTime) throw new BadRequestException('Vui lòng nhập giờ bắt đầu và kết thúc');
      startsAt = new Date(`${dto.startDate}T${dto.startTime}:00${offset}`);
      endsAt = new Date(`${dto.endDate}T${dto.endTime}:00${offset}`);
      const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
      if (minutes <= 0) throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu');
      if (minutes % leaveType.hourIncrementMinutes !== 0) throw new BadRequestException(`Thời lượng nghỉ phải theo bước ${leaveType.hourIncrementMinutes} phút`);
      amount = minutes / 60;
      unit = 'hour';
    } else {
      if (dto.requestMode === 'half_day') {
        startsAt = new Date(`${dto.startDate}T${dto.dayPart === 'second_half' ? '12:00:00' : '00:00:00'}${offset}`);
        endsAt = new Date(`${dto.endDate}T${dto.dayPart === 'second_half' ? '24:00:00' : '12:00:00'}${offset}`);
      } else {
        startsAt = new Date(`${dto.startDate}T00:00:00${offset}`);
        endsAt = new Date(`${dto.endDate}T24:00:00${offset}`);
      }
      const days = this.businessDays(dto.startDate, dto.endDate);
      if (days === 0) throw new BadRequestException('Khoảng nghỉ không có ngày làm việc từ thứ Hai đến thứ Sáu');
      amount = dto.requestMode === 'half_day' ? 0.5 : days;
      unit = 'day';
    }
    const balanceAmount = unit === 'hour' && leaveType.unit === 'both'
      ? amount / Number(leaveType.hoursPerDay)
      : amount;
    return { startsAt, endsAt, amount, unit, balanceAmount, balanceYear: Number(dto.startDate.slice(0, 4)) };
  }

  private requestValidationErrors(dto: CreateLeaveRequestDto, leaveType: LeaveType, amount: number, available: number | null, overlap: LeaveRequest | null) {
    const errors: string[] = [];
    const today = this.dateInVietnam(new Date());
    if (!leaveType.allowRetroactive && dto.startDate < today) errors.push('Loại nghỉ này không cho phép gửi cho ngày đã qua.');
    const noticeDate = new Date(`${today}T00:00:00+07:00`);
    noticeDate.setDate(noticeDate.getDate() + leaveType.minNoticeDays);
    if (!leaveType.allowRetroactive && dto.startDate < this.dateInVietnam(noticeDate)) errors.push(`Yêu cầu phải được gửi trước ít nhất ${leaveType.minNoticeDays} ngày.`);
    if (leaveType.requiresAttachment && (!leaveType.attachmentRequiredAfter || amount >= Number(leaveType.attachmentRequiredAfter)) && !dto.attachmentUrl?.trim()) errors.push('Yêu cầu này bắt buộc có tài liệu đính kèm.');
    if (leaveType.tracksBalance && available != null && !leaveType.allowNegativeBalance && available < amount) errors.push(`Số dư khả dụng chỉ còn ${this.formatAmount(available)}, không đủ cho yêu cầu ${this.formatAmount(amount)}.`);
    if (overlap) errors.push('Khoảng nghỉ bị trùng với một yêu cầu đang chờ hoặc đã duyệt.');
    if (dto.reason.trim().length < 5) errors.push('Lý do nghỉ phải có ít nhất 5 ký tự.');
    return errors;
  }

  private balanceView(balance: LeaveBalance) {
    return {
      id: balance.id,
      year: balance.balanceYear,
      employee: { id: balance.employee.id, employeeCode: balance.employee.employeeCode, fullName: this.employeeName(balance.employee), branch: { id: balance.employee.primaryBranchId, name: balance.employee.primaryBranch.name }, department: { id: balance.employee.departmentId, name: balance.employee.department.name } },
      leaveType: { id: balance.leaveType.id, code: balance.leaveType.code, name: balance.leaveType.name, color: balance.leaveType.color.trim(), unit: balance.leaveType.unit, balanceUnit: balance.leaveType.unit === 'hour' ? 'hour' : 'day', isPaid: balance.leaveType.isPaid, allowNegativeBalance: balance.leaveType.allowNegativeBalance },
      ...this.balanceNumbers(balance),
      updatedAt: balance.updatedAt,
    };
  }

  private balanceNumbers(balance: LeaveBalance) {
    const opening = Number(balance.openingAmount);
    const accrued = Number(balance.accruedAmount);
    const adjusted = Number(balance.adjustedAmount);
    const reserved = Number(balance.reservedAmount ?? 0);
    const used = Number(balance.usedAmount);
    const expired = Number(balance.expiredAmount ?? 0);
    return { opening, accrued, adjusted, reserved, used, expired, totalGranted: opening + accrued + adjusted, available: opening + accrued + adjusted - reserved - used - expired };
  }

  private availableBalance(balance: LeaveBalance) {
    return this.balanceNumbers(balance).available;
  }

  private requestView(request: LeaveRequest) {
    return {
      id: request.id, leaveType: { id: request.leaveType.id, name: request.leaveType.name, color: request.leaveType.color.trim() },
      startsAt: request.startsAt, endsAt: request.endsAt, requestMode: request.requestMode, dayPart: request.dayPart,
      amount: Number(request.requestedAmount), unit: request.unitSnapshot, isPaid: request.isPaidSnapshot,
      reason: request.reason, attachmentUrl: request.attachmentUrl, status: request.status, requestedAt: request.requestedAt,
    };
  }

  private filterEmployeesByScope(employees: Employee[], actor: AuthUser) {
    if (actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'HR', 'PAYROLL'].includes(role.code))) return employees;
    if (actor.roles.some((role) => role.code === 'MANAGER')) return employees.filter((employee) => actor.roles.some((role) => role.code === 'MANAGER' && Boolean(role.branchId || role.departmentId) && (!role.branchId || role.branchId === employee.primaryBranchId) && (!role.departmentId || role.departmentId === employee.departmentId)));
    return actor.employeeId ? employees.filter((employee) => employee.id === actor.employeeId) : [];
  }

  private applyEmployeeScope(builder: ReturnType<Repository<LeaveBalance>['createQueryBuilder']>, actor: AuthUser) {
    if (actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'HR', 'PAYROLL'].includes(role.code))) return;
    const managerRoles = actor.roles.filter((role) => role.code === 'MANAGER');
    if (managerRoles.length) {
      const branchIds = managerRoles.map((role) => role.branchId).filter((value): value is string => Boolean(value));
      const departmentIds = managerRoles.map((role) => role.departmentId).filter((value): value is string => Boolean(value));
      if (!branchIds.length && !departmentIds.length) {
        builder.andWhere('1 = 0');
        return;
      }
      const conditions: string[] = [];
      if (branchIds.length) conditions.push('employee.primaryBranchId IN (:...scopeBranchIds)');
      if (departmentIds.length) conditions.push('employee.departmentId IN (:...scopeDepartmentIds)');
      builder.andWhere(`(${conditions.join(' OR ')})`, { scopeBranchIds: branchIds.length ? branchIds : ['00000000-0000-0000-0000-000000000000'], scopeDepartmentIds: departmentIds.length ? departmentIds : ['00000000-0000-0000-0000-000000000000'] });
      return;
    }
    builder.andWhere('employee.id = :scopeEmployeeId', { scopeEmployeeId: actor.employeeId ?? '00000000-0000-0000-0000-000000000000' });
  }

  private assertEmployeeScope(employee: Employee, actor: AuthUser) {
    if (!this.filterEmployeesByScope([employee], actor).length) throw new NotFoundException('Không tìm thấy nhân viên trong phạm vi được phép');
  }

  private async requireActorEmployee(actor: AuthUser) {
    if (!actor.employeeId) throw new BadRequestException('Tài khoản chưa liên kết hồ sơ nhân viên');
    const employee = await this.employeeRepository.findOne({ where: { id: actor.employeeId, deletedAt: IsNull() }, relations: { primaryBranch: true, department: true } });
    if (!employee) throw new NotFoundException('Không tìm thấy hồ sơ nhân viên');
    return employee;
  }

  private employeeName(employee: Employee) {
    return employee.preferredName?.trim() || `${employee.lastName} ${employee.firstName}`.trim();
  }

  private businessDays(from: string, to: string) {
    let count = 0;
    const current = new Date(`${from}T12:00:00+07:00`);
    const end = new Date(`${to}T12:00:00+07:00`);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) count += 1;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private dateInVietnam(date: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  private decimal(value: number) {
    return value.toFixed(2);
  }

  private formatAmount(value: number) {
    return Number(value.toFixed(2)).toLocaleString('vi-VN');
  }

  private async notifyLeaveApprovers(manager: EntityManager, employee: Employee, request: LeaveRequest, leaveType: LeaveType, requesterId: string) {
    const recipients = await manager.query<Array<{ user_id: string }>>(`
      SELECT DISTINCT ur.user_id
      FROM workforce.user_roles ur
      JOIN workforce.role_permissions rp ON rp.role_id = ur.role_id
      JOIN workforce.permissions p ON p.id = rp.permission_id AND p.code = 'leave.approve'
      JOIN workforce.users u ON u.id = ur.user_id AND u.status = 'active' AND u.deleted_at IS NULL
      WHERE ur.user_id <> $1
        AND (ur.branch_id IS NULL OR ur.branch_id = $2)
        AND (ur.department_id IS NULL OR ur.department_id = $3)
    `, [requesterId, employee.primaryBranchId, employee.departmentId]);
    if (!recipients.length) return;
    const employeeName = this.employeeName(employee);
    await manager.save(Notification, recipients.map(({ user_id: userId }) => manager.create(Notification, {
      userId,
      eventType: 'leave_request.submitted',
      title: 'Có yêu cầu nghỉ phép mới',
      message: `${employeeName} vừa gửi yêu cầu ${leaveType.name}.`,
      data: { leaveRequestId: request.id, employeeId: employee.id, leaveTypeId: leaveType.id },
      actionUrl: '/admin/leave',
      readAt: null,
      expiresAt: null,
    })));
  }

  private async validatePolicyRange(leaveTypeId: string, dto: CreateLeaveEntitlementPolicyDto, excludeId: string | null) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('Ngày kết thúc chính sách phải từ ngày bắt đầu trở đi');
    if (dto.maxBalance != null && dto.maxBalance < dto.allowanceAmount) throw new BadRequestException('Số dư tối đa không được thấp hơn hạn mức được cấp');
    if (dto.carryoverLimit != null && dto.maxBalance != null && dto.carryoverLimit > dto.maxBalance) throw new BadRequestException('Mức chuyển tiếp không được vượt số dư tối đa');
    if (!dto.isActive) return;
    const builder = this.policyRepository.createQueryBuilder('policy')
      .where('policy.leaveTypeId = :leaveTypeId', { leaveTypeId })
      .andWhere('policy.isActive = true')
      .andWhere('policy.effectiveFrom <= :rangeEnd', { rangeEnd: dto.effectiveTo ?? '9999-12-31' })
      .andWhere('(policy.effectiveTo IS NULL OR policy.effectiveTo >= :rangeStart)', { rangeStart: dto.effectiveFrom });
    if (dto.appliesToEmploymentType) {
      builder.andWhere('(policy.appliesToEmploymentType IS NULL OR policy.appliesToEmploymentType = :employmentType)', { employmentType: dto.appliesToEmploymentType });
    }
    if (excludeId) builder.andWhere('policy.id <> :excludeId', { excludeId });
    if (await builder.getExists()) throw new ConflictException('Khoảng hiệu lực bị trùng với một chính sách hạn mức đang hoạt động');
  }

  private async resolveOrganization(actor: AuthUser) {
    if (actor.employeeId) {
      const employee = await this.employeeRepository.findOneBy({ id: actor.employeeId, deletedAt: IsNull() });
      if (employee) {
        const organization = await this.organizationRepository.findOneBy({ id: employee.organizationId });
        if (organization) return organization;
      }
    }
    const [organization] = await this.organizationRepository.find({ order: { createdAt: 'ASC' }, take: 1 });
    if (!organization) throw new NotFoundException('Chưa cấu hình doanh nghiệp');
    return organization;
  }

  private currentPolicy(policies: LeaveEntitlementPolicy[]) {
    const today = this.dateOnly(new Date());
    return policies.find((policy) => policy.isActive && policy.effectiveFrom <= today && (!policy.effectiveTo || policy.effectiveTo >= today)) ?? null;
  }

  private nextPolicy(policies: LeaveEntitlementPolicy[]) {
    const today = this.dateOnly(new Date());
    return policies.filter((policy) => policy.isActive && policy.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
  }

  private typeView(type: LeaveType, currentPolicy: LeaveEntitlementPolicy | null, nextPolicy: LeaveEntitlementPolicy | null, employeesWithBalance: number, requests: number, policyCount: number) {
    return {
      id: type.id, code: type.code, name: type.name, description: type.description, color: type.color.trim(),
      isPaid: type.isPaid, unit: type.unit, tracksBalance: type.tracksBalance,
      allowNegativeBalance: type.allowNegativeBalance, requiresAttachment: type.requiresAttachment,
      attachmentRequiredAfter: type.attachmentRequiredAfter == null ? null : Number(type.attachmentRequiredAfter),
      hoursPerDay: Number(type.hoursPerDay), hourIncrementMinutes: type.hourIncrementMinutes,
      minNoticeDays: type.minNoticeDays, allowRetroactive: type.allowRetroactive,
      requiresApproval: type.requiresApproval, isActive: type.isActive,
      currentPolicy: currentPolicy ? this.policyView(currentPolicy, type) : null,
      nextPolicy: nextPolicy ? this.policyView(nextPolicy, type) : null,
      usage: { employeesWithBalance, requests, policyCount },
      createdAt: type.createdAt, updatedAt: type.updatedAt,
    };
  }

  private policyView(policy: LeaveEntitlementPolicy, type: LeaveType) {
    return {
      id: policy.id, leaveTypeId: policy.leaveTypeId, name: policy.name,
      effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo,
      accrualMethod: policy.accrualMethod, allowanceAmount: Number(policy.allowanceAmount), unit: type.unit,
      carryoverLimit: policy.carryoverLimit == null ? null : Number(policy.carryoverLimit),
      maxBalance: policy.maxBalance == null ? null : Number(policy.maxBalance),
      prorateNewHires: policy.prorateNewHires, appliesToEmploymentType: policy.appliesToEmploymentType,
      isActive: policy.isActive, createdAt: policy.createdAt, updatedAt: policy.updatedAt,
    };
  }

  private snapshotType(type: LeaveType) {
    return {
      code: type.code, name: type.name, description: type.description, color: type.color?.trim(), isPaid: type.isPaid,
      unit: type.unit, tracksBalance: type.tracksBalance, allowNegativeBalance: type.allowNegativeBalance,
      requiresAttachment: type.requiresAttachment, attachmentRequiredAfter: type.attachmentRequiredAfter == null ? null : Number(type.attachmentRequiredAfter),
      hoursPerDay: Number(type.hoursPerDay), hourIncrementMinutes: type.hourIncrementMinutes, minNoticeDays: type.minNoticeDays,
      allowRetroactive: type.allowRetroactive, requiresApproval: type.requiresApproval, isActive: type.isActive,
    };
  }

  private snapshotPolicy(policy: LeaveEntitlementPolicy) {
    return {
      name: policy.name, effectiveFrom: policy.effectiveFrom, effectiveTo: policy.effectiveTo,
      accrualMethod: policy.accrualMethod, allowanceAmount: Number(policy.allowanceAmount),
      carryoverLimit: policy.carryoverLimit == null ? null : Number(policy.carryoverLimit),
      maxBalance: policy.maxBalance == null ? null : Number(policy.maxBalance), prorateNewHires: policy.prorateNewHires,
      appliesToEmploymentType: policy.appliesToEmploymentType, isActive: policy.isActive,
    };
  }

  private async writeAudit(manager: EntityManager, actorUserId: string, action: string, entityType: string, entityId: string, oldValues: Record<string, unknown> | null, newValues: Record<string, unknown> | null) {
    await manager.save(AuditLog, manager.create(AuditLog, { actorUserId, action, entityType, entityId, oldValues, newValues, ipAddress: null, userAgent: null, requestId: null }));
  }

  private dateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
