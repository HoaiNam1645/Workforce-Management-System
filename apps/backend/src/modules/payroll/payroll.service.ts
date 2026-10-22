import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AuthUser } from '../access-control/auth-user.type';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Organization } from '../core/entities/organization.entity';
import { EmployeeSalaryRate } from '../employees/entities/employee-salary-rate.entity';
import { Employee } from '../employees/entities/employee.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { TimesheetPeriod } from '../timesheets/entities/timesheet-period.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { CreatePayrollItemDto, CreatePayrollPeriodDto, CreatePayrollRuleDto, CreateSalaryRateDto, PayrollActionDto, PayrollListQueryDto, RecordPayrollPaymentDto, ReversePayrollPaymentDto, UpdatePayrollRuleDto } from './dto/payroll.dto';
import { EmployeePayroll } from './entities/employee-payroll.entity';
import { PayrollItem } from './entities/payroll-item.entity';
import { PayrollPaymentHistory } from './entities/payroll-payment-history.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PayrollRule } from './entities/payroll-rule.entity';
import { PayrollStatusHistory } from './entities/payroll-status-history.entity';

const CALCULATOR_VERSION = 'payroll-v1';
const EDITABLE_PERIODS = ['draft', 'returned', 'needs_review'];

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeSalaryRate) private readonly salaryRepository: Repository<EmployeeSalaryRate>,
    @InjectRepository(PayrollPeriod) private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(EmployeePayroll) private readonly payrollRepository: Repository<EmployeePayroll>,
    @InjectRepository(PayrollItem) private readonly itemRepository: Repository<PayrollItem>,
    @InjectRepository(PayrollPaymentHistory) private readonly paymentRepository: Repository<PayrollPaymentHistory>,
    @InjectRepository(PayrollRule) private readonly ruleRepository: Repository<PayrollRule>,
    @InjectRepository(PayrollStatusHistory) private readonly historyRepository: Repository<PayrollStatusHistory>,
    private readonly dataSource: DataSource,
  ) {}

  async getSalaryRates(query: PayrollListQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const today = this.dateOnly(new Date());
    const qb = this.employeeRepository.createQueryBuilder('employee')
      .leftJoinAndSelect('employee.primaryBranch', 'branch')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndMapOne('employee.currentSalary', EmployeeSalaryRate, 'salary', 'salary.employee_id = employee.id AND salary.effective_from <= :today AND (salary.effective_to IS NULL OR salary.effective_to >= :today)', { today })
      .where('employee.organization_id = :organizationId', { organizationId: organization.id })
      .andWhere('employee.deleted_at IS NULL');
    this.applyEmployeeFilters(qb, query);
    const employees = await qb.orderBy('employee.last_name', 'ASC').addOrderBy('employee.first_name', 'ASC').getMany();
    const rates = employees.length ? await this.salaryRepository.find({ where: { employeeId: In(employees.map((item) => item.id)) }, order: { effectiveFrom: 'DESC' } }) : [];
    const byEmployee = this.group(rates, (rate) => rate.employeeId);
    const items = employees.map((employee) => {
      const history = byEmployee.get(employee.id) ?? [];
      const current = history.find((rate) => rate.effectiveFrom <= today && (!rate.effectiveTo || rate.effectiveTo >= today)) ?? null;
      return { employee: this.employeeView(employee), currentRate: current, historyCount: history.length };
    });
    return {
      summary: {
        employees: items.length,
        configured: items.filter((item) => item.currentRate).length,
        missing: items.filter((item) => !item.currentRate).length,
        hourly: items.filter((item) => item.currentRate?.payType === 'hourly').length,
        monthly: items.filter((item) => item.currentRate?.payType === 'monthly').length,
      },
      items,
    };
  }

  async createSalaryRate(dto: CreateSalaryRateDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const employee = await this.employeeRepository.findOneBy({ id: dto.employeeId, organizationId: organization.id, deletedAt: IsNull() });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('Ngày kết thúc không được trước ngày hiệu lực');
    const overlap = await this.salaryRepository.createQueryBuilder('rate')
      .where('rate.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('rate.effective_from <= :endDate', { endDate: dto.effectiveTo ?? '9999-12-31' })
      .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :startDate)', { startDate: dto.effectiveFrom })
      .getOne();
    if (overlap) throw new ConflictException(`Khoảng hiệu lực bị chồng với mức lương từ ${overlap.effectiveFrom}${overlap.effectiveTo ? ` đến ${overlap.effectiveTo}` : ''}`);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rate = await manager.save(EmployeeSalaryRate, manager.create(EmployeeSalaryRate, {
          employeeId: employee.id,
          payType: dto.payType,
          baseRate: this.money(dto.baseRate),
          currencyCode: (dto.currencyCode ?? 'VND').toUpperCase(),
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo || null,
          note: dto.note?.trim() || null,
          createdBy: actor.id,
        }));
        await this.audit(manager, actor.id, 'payroll.salary_rate.created', 'employee_salary_rate', rate.id, null, rate);
        return rate;
      });
    } catch (error) {
      if (error instanceof QueryFailedError) throw new ConflictException('Khoảng hiệu lực mức lương bị chồng lấn');
      throw error;
    }
  }

  async getSalaryHistory(employeeId: string, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const employee = await this.employeeRepository.findOne({ where: { id: employeeId, organizationId: organization.id, deletedAt: IsNull() }, relations: { primaryBranch: true, department: true } });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    const rates = await this.salaryRepository.find({ where: { employeeId }, relations: { createdByUser: true }, order: { effectiveFrom: 'DESC' } });
    return { employee: this.employeeView(employee), items: rates.map((rate) => ({ ...rate, createdByName: rate.createdByUser?.displayName ?? 'Hệ thống' })) };
  }

  async getRules(actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.ruleRepository.find({ where: { organizationId: organization.id }, order: { ruleType: 'ASC', priority: 'ASC', effectiveFrom: 'DESC' } });
  }

  async createRule(dto: CreatePayrollRuleDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    this.validateRule(dto);
    return this.dataSource.transaction(async (manager) => {
      const rule = await manager.save(PayrollRule, manager.create(PayrollRule, this.ruleInput(organization.id, dto, actor.id)));
      await this.audit(manager, actor.id, 'payroll.rule.created', 'payroll_rule', rule.id, null, rule);
      return rule;
    });
  }

  async updateRule(id: string, dto: UpdatePayrollRuleDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    this.validateRule(dto);
    const rule = await this.ruleRepository.findOneBy({ id, organizationId: organization.id });
    if (!rule) throw new NotFoundException('Không tìm thấy quy tắc lương');
    const old = { ...rule };
    Object.assign(rule, this.ruleInput(organization.id, dto, rule.createdBy), { updatedAt: new Date() });
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PayrollRule, rule);
      await this.audit(manager, actor.id, 'payroll.rule.updated', 'payroll_rule', rule.id, old, saved);
      return saved;
    });
  }

  async getPeriods(query: PayrollListQueryDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const qb = this.periodRepository.createQueryBuilder('period').where('period.organization_id = :organizationId', { organizationId: organization.id });
    if (query.search?.trim()) qb.andWhere('(period.code ILIKE :search OR period.name ILIKE :search)', { search: `%${query.search.trim()}%` });
    if (query.status) qb.andWhere('period.status = :status', { status: query.status });
    if (query.from) qb.andWhere('period.ends_on >= :from', { from: query.from });
    if (query.to) qb.andWhere('period.starts_on <= :to', { to: query.to });
    const periods = await qb.orderBy('period.starts_on', 'DESC').getMany();
    const payrolls = periods.length ? await this.payrollRepository.findBy({ payrollPeriodId: In(periods.map((period) => period.id)) }) : [];
    const grouped = this.group(payrolls, (payroll) => payroll.payrollPeriodId);
    const items = periods.map((period) => this.periodView(period, grouped.get(period.id) ?? []));
    return {
      summary: {
        periods: items.length,
        open: items.filter((item) => !['locked', 'partially_paid', 'paid', 'cancelled'].includes(item.status)).length,
        needsReview: items.filter((item) => item.status === 'needs_review').length,
        netPay: this.money(items.reduce((sum, item) => sum + Number(item.totals.netPay), 0)),
        paid: this.money(items.reduce((sum, item) => sum + Number(item.totals.paidTotal), 0)),
      },
      items,
    };
  }

  async createPeriod(dto: CreatePayrollPeriodDto, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    if (dto.endsOn < dto.startsOn) throw new BadRequestException('Ngày kết thúc không được trước ngày bắt đầu');
    if (dto.paymentDate && dto.paymentDate < dto.endsOn) throw new BadRequestException('Ngày trả lương không được trước ngày kết thúc kỳ');
    const overlap = await this.periodRepository.createQueryBuilder('period')
      .where('period.organization_id = :organizationId', { organizationId: organization.id })
      .andWhere('period.status <> :cancelled', { cancelled: 'cancelled' })
      .andWhere('period.starts_on <= :endsOn AND period.ends_on >= :startsOn', { startsOn: dto.startsOn, endsOn: dto.endsOn })
      .getOne();
    if (overlap) throw new ConflictException(`Khoảng kỳ lương bị trùng với ${overlap.code}`);
    const code = dto.code.trim().toUpperCase();
    if (await this.periodRepository.findOneBy({ organizationId: organization.id, code })) throw new ConflictException('Mã kỳ lương đã tồn tại');
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.save(PayrollPeriod, manager.create(PayrollPeriod, {
        organizationId: organization.id, code, name: dto.name.trim(), startsOn: dto.startsOn, endsOn: dto.endsOn,
        paymentDate: dto.paymentDate || null, status: 'draft', createdBy: actor.id, calculatorVersion: CALCULATOR_VERSION,
      }));
      await manager.save(PayrollStatusHistory, manager.create(PayrollStatusHistory, { payrollPeriodId: period.id, fromStatus: null, toStatus: 'draft', actorUserId: actor.id }));
      await this.audit(manager, actor.id, 'payroll.period.created', 'payroll_period', period.id, null, period);
      return this.periodView(period, []);
    });
  }

  async getPeriod(id: string, query: PayrollListQueryDto, actor: AuthUser) {
    const period = await this.getOwnedPeriod(id, actor);
    const qb = this.payrollRepository.createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.employee', 'employee')
      .leftJoinAndSelect('employee.primaryBranch', 'branch')
      .leftJoinAndSelect('employee.department', 'department')
      .where('payroll.payroll_period_id = :id', { id });
    if (query.search?.trim()) qb.andWhere('(employee.employee_code ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.preferred_name ILIKE :search)', { search: `%${query.search.trim()}%` });
    if (query.status) qb.andWhere('payroll.status = :status', { status: query.status });
    if (query.employeeId) qb.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    if (query.branchId) qb.andWhere('employee.primary_branch_id = :branchId', { branchId: query.branchId });
    if (query.departmentId) qb.andWhere('employee.department_id = :departmentId', { departmentId: query.departmentId });
    const payrolls = await qb.orderBy('employee.last_name', 'ASC').addOrderBy('employee.first_name', 'ASC').getMany();
    const [allPayrolls, history] = await Promise.all([
      this.payrollRepository.findBy({ payrollPeriodId: id }),
      this.historyRepository.find({ where: { payrollPeriodId: id }, relations: { actorUser: true }, order: { createdAt: 'DESC' } }),
    ]);
    return {
      period: this.periodView(period, allPayrolls),
      items: payrolls.map((payroll) => ({ ...this.payrollView(payroll), employee: this.employeeView(payroll.employee) })),
      history: history.map((item) => ({ ...item, actorName: item.actorUser?.displayName ?? 'Hệ thống' })),
    };
  }

  async calculatePeriod(id: string, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.getRepository(PayrollPeriod).createQueryBuilder('period').setLock('pessimistic_write')
        .where('period.id = :id AND period.organization_id = :organizationId', { id, organizationId: organization.id }).getOne();
      if (!period) throw new NotFoundException('Không tìm thấy kỳ lương');
      if (!EDITABLE_PERIODS.includes(period.status)) throw new BadRequestException('Chỉ có thể tính kỳ lương nháp, bị trả lại hoặc cần kiểm tra');
      const fromStatus = period.status;
      period.status = 'calculating';
      period.calculationVersion += 1;
      period.calculatorVersion = CALCULATOR_VERSION;
      await manager.save(PayrollPeriod, period);

      const employees = await manager.getRepository(Employee).createQueryBuilder('employee')
        .where('employee.organization_id = :organizationId', { organizationId: organization.id })
        .andWhere('employee.deleted_at IS NULL')
        .andWhere('employee.hire_date <= :endsOn', { endsOn: period.endsOn })
        .andWhere('(employee.termination_date IS NULL OR employee.termination_date >= :startsOn)', { startsOn: period.startsOn })
        .getMany();
      const timesheetPeriod = await manager.getRepository(TimesheetPeriod).findOneBy({ organizationId: organization.id, startsOn: period.startsOn, endsOn: period.endsOn });
      const timesheets = timesheetPeriod ? await manager.getRepository(Timesheet).findBy({ periodId: timesheetPeriod.id }) : [];
      const timesheetByEmployee = new Map(timesheets.map((timesheet) => [timesheet.employeeId, timesheet]));
      let errorCount = 0;
      for (const employee of employees) {
        const errors: string[] = [];
        const warnings: string[] = [];
        const timesheet = timesheetByEmployee.get(employee.id) ?? null;
        if (!timesheet) errors.push('Không có bảng công tương ứng với kỳ lương');
        else if (timesheet.status !== 'locked') errors.push('Bảng công chưa khóa');
        const rates = await manager.getRepository(EmployeeSalaryRate).createQueryBuilder('rate')
          .where('rate.employee_id = :employeeId', { employeeId: employee.id })
          .andWhere('rate.effective_from <= :endsOn', { endsOn: period.endsOn })
          .andWhere('(rate.effective_to IS NULL OR rate.effective_to >= :startsOn)', { startsOn: period.startsOn })
          .orderBy('rate.effective_from', 'ASC').getMany();
        if (!rates.length) errors.push('Không có mức lương hiệu lực trong kỳ');
        const existing = await manager.getRepository(EmployeePayroll).findOneBy({ payrollPeriodId: period.id, employeeId: employee.id });
        const payroll = existing ?? manager.create(EmployeePayroll, { payrollPeriodId: period.id, employeeId: employee.id });
        payroll.timesheetId = timesheet?.id ?? null;
        payroll.validationErrors = errors;
        payroll.validationWarnings = warnings;
        payroll.status = errors.length ? 'needs_review' : 'draft';
        payroll.calculatedAt = new Date();
        payroll.salarySnapshot = { rates: rates.map((rate) => this.salarySnapshot(rate)) };
        payroll.timesheetSnapshot = timesheet ? this.timesheetSnapshot(timesheet) : null;
        payroll.calculationSnapshot = { version: CALCULATOR_VERSION, calculationVersion: period.calculationVersion, calculatedAt: new Date().toISOString() };
        await manager.save(EmployeePayroll, payroll);
        await manager.getRepository(PayrollItem).delete({ employeePayrollId: payroll.id, source: 'system' });
        if (!errors.length && timesheet) {
          await this.calculateEmployee(manager, period, payroll, timesheet, rates, organization.id, warnings);
        } else {
          await this.recomputeTotals(manager, payroll);
        }
        if (payroll.validationErrors.length) errorCount += 1;
      }
      period.status = errorCount ? 'needs_review' : 'draft';
      period.returnReason = null;
      await manager.save(PayrollPeriod, period);
      await manager.save(PayrollStatusHistory, manager.create(PayrollStatusHistory, {
        payrollPeriodId: period.id, fromStatus, toStatus: period.status, actorUserId: actor.id,
        snapshot: { employees: employees.length, errors: errorCount, calculationVersion: period.calculationVersion },
      }));
      await this.audit(manager, actor.id, 'payroll.period.calculated', 'payroll_period', period.id, { status: fromStatus }, { status: period.status, employees: employees.length, errors: errorCount });
      return this.getPeriodResult(manager, period);
    });
  }

  async submitPeriod(id: string, dto: PayrollActionDto, actor: AuthUser) {
    return this.changePeriodStatus(id, actor, ['draft', 'returned'], 'pending_approval', dto.reason, async (manager, period) => {
      const payrolls = await manager.getRepository(EmployeePayroll).findBy({ payrollPeriodId: period.id });
      if (!payrolls.length) throw new BadRequestException('Kỳ lương chưa có dữ liệu tính');
      if (payrolls.some((item) => item.status !== 'calculated' || item.validationErrors.length)) throw new BadRequestException('Kỳ lương còn bảng lương chưa tính xong hoặc có lỗi chặn');
    });
  }

  async approvePeriod(id: string, dto: PayrollActionDto, actor: AuthUser) {
    return this.changePeriodStatus(id, actor, ['pending_approval'], 'approved', dto.reason, async (manager, period) => {
      await manager.getRepository(EmployeePayroll).update({ payrollPeriodId: period.id, status: 'calculated' }, { status: 'approved' });
      period.approvedBy = actor.id;
      period.approvedAt = new Date();
    });
  }

  async returnPeriod(id: string, dto: PayrollActionDto, actor: AuthUser) {
    if (!dto.reason?.trim()) throw new BadRequestException('Cần nhập lý do trả lại kỳ lương');
    return this.changePeriodStatus(id, actor, ['pending_approval', 'approved'], 'returned', dto.reason, async (manager, period) => {
      await manager.getRepository(EmployeePayroll).createQueryBuilder().update().set({ status: 'calculated' }).where('payroll_period_id = :id AND status = :approved', { id: period.id, approved: 'approved' }).execute();
      period.returnReason = dto.reason!.trim();
      period.approvedBy = null;
      period.approvedAt = null;
    });
  }

  async lockPeriod(id: string, dto: PayrollActionDto, actor: AuthUser) {
    return this.changePeriodStatus(id, actor, ['approved'], 'locked', dto.reason, async (manager, period) => {
      const payrolls = await manager.getRepository(EmployeePayroll).findBy({ payrollPeriodId: period.id });
      if (!payrolls.length || payrolls.some((item) => item.status !== 'approved' || item.validationErrors.length)) throw new BadRequestException('Tất cả bảng lương phải được duyệt và không còn lỗi trước khi khóa');
      const now = new Date();
      await manager.getRepository(EmployeePayroll).update({ payrollPeriodId: period.id }, { status: 'locked', publishedAt: now });
      period.lockedBy = actor.id;
      period.lockedAt = now;
      period.publishedAt = now;
    });
  }

  async unlockPeriod(id: string, dto: PayrollActionDto, actor: AuthUser) {
    if (!dto.reason?.trim()) throw new BadRequestException('Cần nhập lý do mở khóa kỳ lương');
    return this.changePeriodStatus(id, actor, ['locked'], 'returned', dto.reason, async (manager, period) => {
      const payrolls = await manager.getRepository(EmployeePayroll).findBy({ payrollPeriodId: period.id });
      if (payrolls.some((item) => Number(item.paidTotal) > 0)) throw new BadRequestException('Không thể mở khóa kỳ đã phát sinh thanh toán');
      await manager.getRepository(EmployeePayroll).update({ payrollPeriodId: period.id }, { status: 'calculated', publishedAt: null });
      period.returnReason = dto.reason!.trim();
      period.lockedBy = null;
      period.lockedAt = null;
      period.publishedAt = null;
    });
  }

  async getEmployeePayroll(id: string, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const payroll = await this.payrollRepository.createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.employee', 'employee').leftJoinAndSelect('employee.primaryBranch', 'branch').leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('payroll.payrollPeriod', 'period').leftJoinAndSelect('payroll.timesheet', 'timesheet')
      .where('payroll.id = :id AND period.organization_id = :organizationId', { id, organizationId: organization.id }).getOne();
    if (!payroll) throw new NotFoundException('Không tìm thấy bảng lương nhân viên');
    const [items, payments] = await Promise.all([
      this.itemRepository.find({ where: { employeePayrollId: id }, relations: { createdByUser: true }, order: { workDate: 'ASC', createdAt: 'ASC' } }),
      this.paymentRepository.find({ where: { employeePayrollId: id }, relations: { createdByUser: true }, order: { paidAt: 'DESC' } }),
    ]);
    return { ...this.payrollView(payroll), employee: this.employeeView(payroll.employee), period: payroll.payrollPeriod, timesheet: payroll.timesheet, items: items.map((item) => ({ ...item, createdByName: item.createdByUser?.displayName ?? 'Hệ thống' })), payments: payments.map((payment) => ({ ...payment, createdByName: payment.createdByUser?.displayName ?? 'Hệ thống' })) };
  }

  async addItem(id: string, dto: CreatePayrollItemDto, actor: AuthUser) {
    return this.mutateItem(id, null, dto, actor);
  }

  async updateItem(id: string, itemId: string, dto: CreatePayrollItemDto, actor: AuthUser) {
    return this.mutateItem(id, itemId, dto, actor);
  }

  async deleteItem(id: string, itemId: string, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const payroll = await this.getEditablePayroll(manager, id, actor);
      const item = await manager.getRepository(PayrollItem).findOneBy({ id: itemId, employeePayrollId: id });
      if (!item) throw new NotFoundException('Không tìm thấy khoản lương');
      if (item.source !== 'manual') throw new BadRequestException('Không thể xóa trực tiếp khoản do hệ thống tính');
      await manager.remove(PayrollItem, item);
      await this.recomputeTotals(manager, payroll);
      await this.audit(manager, actor.id, 'payroll.item.deleted', 'payroll_item', item.id, item, { reason: 'manual_delete' });
      return this.getEmployeePayrollResult(manager, payroll.id);
    });
  }

  async recordPayment(id: string, dto: RecordPayrollPaymentDto, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const payroll = await manager.getRepository(EmployeePayroll).createQueryBuilder('payroll').setLock('pessimistic_write').leftJoinAndSelect('payroll.payrollPeriod', 'period').where('payroll.id = :id', { id }).getOne();
      if (!payroll) throw new NotFoundException('Không tìm thấy bảng lương');
      await this.assertPeriodOwned(payroll.payrollPeriod, actor);
      if (!['locked', 'partially_paid'].includes(payroll.status)) throw new BadRequestException('Chỉ được trả lương cho bảng lương đã khóa');
      const amount = this.round(dto.amount);
      if (amount > Number(payroll.balanceDue)) throw new BadRequestException('Số tiền thanh toán vượt số tiền còn phải trả');
      if (dto.referenceNumber) {
        const duplicate = await manager.getRepository(PayrollPaymentHistory).findOneBy({ referenceNumber: dto.referenceNumber.trim(), status: 'completed' });
        if (duplicate) throw new ConflictException('Mã tham chiếu thanh toán đã tồn tại');
      }
      const payment = await manager.save(PayrollPaymentHistory, manager.create(PayrollPaymentHistory, {
        employeePayrollId: id, amount: this.money(amount), paidAt: new Date(dto.paidAt), paymentMethod: dto.paymentMethod.trim(),
        referenceNumber: dto.referenceNumber?.trim() || null, note: dto.note?.trim() || null, createdBy: actor.id, status: 'completed',
      }));
      await this.refreshPaymentTotals(manager, payroll);
      await this.refreshPeriodPaymentStatus(manager, payroll.payrollPeriodId);
      await this.audit(manager, actor.id, 'payroll.payment.recorded', 'payroll_payment', payment.id, null, payment);
      return this.getEmployeePayrollResult(manager, id);
    });
  }

  async reversePayment(id: string, paymentId: string, dto: ReversePayrollPaymentDto, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const payroll = await manager.getRepository(EmployeePayroll).createQueryBuilder('payroll').setLock('pessimistic_write').leftJoinAndSelect('payroll.payrollPeriod', 'period').where('payroll.id = :id', { id }).getOne();
      if (!payroll) throw new NotFoundException('Không tìm thấy bảng lương');
      await this.assertPeriodOwned(payroll.payrollPeriod, actor);
      const payment = await manager.getRepository(PayrollPaymentHistory).findOneBy({ id: paymentId, employeePayrollId: id });
      if (!payment || payment.status !== 'completed') throw new BadRequestException('Giao dịch không tồn tại hoặc đã được đảo');
      payment.status = 'reversed';
      payment.note = [payment.note, `Đảo giao dịch: ${dto.reason.trim()}`].filter(Boolean).join('\n');
      await manager.save(PayrollPaymentHistory, payment);
      await manager.save(PayrollPaymentHistory, manager.create(PayrollPaymentHistory, {
        employeePayrollId: id, amount: payment.amount, paidAt: new Date(), paymentMethod: payment.paymentMethod,
        referenceNumber: null, note: `Giao dịch đảo cho ${payment.id}: ${dto.reason.trim()}`, createdBy: actor.id, status: 'reversed', reversalOfId: payment.id,
      }));
      await this.refreshPaymentTotals(manager, payroll);
      await this.refreshPeriodPaymentStatus(manager, payroll.payrollPeriodId);
      await this.audit(manager, actor.id, 'payroll.payment.reversed', 'payroll_payment', payment.id, { status: 'completed' }, { status: 'reversed', reason: dto.reason.trim() });
      return this.getEmployeePayrollResult(manager, id);
    });
  }

  async getMyPayslips(actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ nhân viên');
    const payrolls = await this.payrollRepository.createQueryBuilder('payroll').leftJoinAndSelect('payroll.payrollPeriod', 'period')
      .where('payroll.employee_id = :employeeId', { employeeId: actor.employeeId })
      .andWhere('payroll.published_at IS NOT NULL').andWhere('period.status IN (:...statuses)', { statuses: ['locked', 'partially_paid', 'paid'] })
      .orderBy('period.starts_on', 'DESC').getMany();
    return payrolls.map((payroll) => ({ ...this.payrollView(payroll), period: payroll.payrollPeriod }));
  }

  async getMyPayslip(id: string, actor: AuthUser) {
    if (!actor.employeeId) throw new ForbiddenException('Tài khoản chưa liên kết hồ sơ nhân viên');
    const payroll = await this.payrollRepository.findOne({ where: { id, employeeId: actor.employeeId }, relations: { payrollPeriod: true, employee: true, timesheet: true } });
    if (!payroll || !payroll.publishedAt || !['locked', 'partially_paid', 'paid'].includes(payroll.payrollPeriod.status)) throw new NotFoundException('Không tìm thấy phiếu lương đã công bố');
    const [items, payments] = await Promise.all([this.itemRepository.find({ where: { employeePayrollId: id }, order: { createdAt: 'ASC' } }), this.paymentRepository.find({ where: { employeePayrollId: id }, order: { paidAt: 'DESC' } })]);
    return { ...this.payrollView(payroll), employee: this.employeeView(payroll.employee), period: payroll.payrollPeriod, timesheet: payroll.timesheet, items, payments };
  }

  async exportPeriod(id: string, actor: AuthUser) {
    const period = await this.getOwnedPeriod(id, actor);
    const payrolls = await this.payrollRepository.find({ where: { payrollPeriodId: id }, relations: { employee: true }, order: { employee: { lastName: 'ASC' } } });
    const rows = [['Mã kỳ', 'Nhân viên', 'Mã NV', 'Loại lương', 'Lương thường', 'Overtime', 'Ngày lễ', 'Phụ cấp', 'Thưởng', 'Khấu trừ', 'Tổng thu nhập', 'Thực nhận', 'Đã trả', 'Còn lại', 'Trạng thái']];
    payrolls.forEach((payroll) => rows.push([period.code, this.employeeName(payroll.employee), payroll.employee.employeeCode, payroll.payType ?? '', payroll.regularPay, payroll.overtimePay, payroll.holidayPay, payroll.allowanceTotal, payroll.bonusTotal, payroll.deductionTotal, payroll.grossPay, payroll.netPay, payroll.paidTotal, payroll.balanceDue, payroll.status]));
    await this.dataSource.transaction((manager) => this.audit(manager, actor.id, 'payroll.period.exported', 'payroll_period', id, null, { format: 'csv', records: payrolls.length }));
    return `\uFEFF${rows.map((row) => row.map((value) => this.csv(value)).join(',')).join('\r\n')}`;
  }

  private async calculateEmployee(manager: EntityManager, period: PayrollPeriod, payroll: EmployeePayroll, timesheet: Timesheet, rates: EmployeeSalaryRate[], organizationId: string, warnings: string[]) {
    const entries = await manager.getRepository(TimesheetEntry).find({ where: { timesheetId: timesheet.id }, order: { workDate: 'ASC' } });
    const rules = await manager.getRepository(PayrollRule).find({ where: { organizationId, isActive: true }, order: { priority: 'ASC' } });
    const calculationEntries = entries.length ? entries : [manager.create(TimesheetEntry, {
      id: `aggregate:${timesheet.id}`, timesheetId: timesheet.id, workDate: period.startsOn, entryType: 'work', scheduledMinutes: timesheet.scheduledMinutes,
      workedMinutes: timesheet.workedMinutes, breakMinutes: timesheet.breakMinutes, regularMinutes: timesheet.regularMinutes, overtimeMinutes: timesheet.overtimeMinutes,
    })];
    if (!entries.length) warnings.push('Bảng công khóa không có dòng chi tiết; hệ thống dùng số tổng của bảng công');
    const createdItems: PayrollItem[] = [];
    const usedRates = new Set<string>();
    for (const entry of calculationEntries) {
      const rate = rates.find((item) => item.effectiveFrom <= entry.workDate && (!item.effectiveTo || item.effectiveTo >= entry.workDate));
      const paidMinutes = entry.regularMinutes + (entry.entryType === 'paid_leave' ? entry.scheduledMinutes : 0);
      if (!rate && (paidMinutes > 0 || entry.overtimeMinutes > 0)) {
        payroll.validationErrors.push(`Thiếu mức lương hiệu lực ngày ${entry.workDate}`);
        continue;
      }
      if (!rate) continue;
      usedRates.add(rate.id);
      payroll.currencyCode = rate.currencyCode;
      payroll.payType = rates.length === 1 ? rate.payType : 'mixed';
      payroll.baseRate = rate.baseRate;
      payroll.baseSalary = rate.baseRate;
      let baseHourly = Number(rate.baseRate);
      let regularAmount = 0;
      if (rate.payType === 'hourly') regularAmount = paidMinutes / 60 * Number(rate.baseRate);
      else {
        if (timesheet.scheduledMinutes <= 0) payroll.validationErrors.push('Không có phút công chuẩn để phân bổ lương cố định');
        else regularAmount = Number(rate.baseRate) * paidMinutes / timesheet.scheduledMinutes;
        baseHourly = timesheet.scheduledMinutes > 0 ? Number(rate.baseRate) / (timesheet.scheduledMinutes / 60) : 0;
      }
      if (paidMinutes > 0) createdItems.push(manager.create(PayrollItem, {
        employeePayrollId: payroll.id, itemType: 'earning', code: rate.payType === 'hourly' ? 'REGULAR_HOURLY' : 'REGULAR_MONTHLY',
        description: `${entry.entryType === 'paid_leave' ? 'Nghỉ có lương' : 'Lương thường'} ngày ${entry.workDate}`,
        quantity: String(paidMinutes / 60), rate: String(rate.payType === 'hourly' ? Number(rate.baseRate) : regularAmount / Math.max(paidMinutes / 60, 1)),
        amount: this.money(regularAmount), source: 'system', sourceKey: `regular:${entry.id}:${rate.id}`, workDate: entry.workDate,
        ruleSnapshot: { salaryRateId: rate.id, payType: rate.payType, baseRate: rate.baseRate, paidMinutes, scheduledMinutes: timesheet.scheduledMinutes },
      }));
      if (entry.overtimeMinutes > 0) {
        const rule = rules.find((item) => item.ruleType === 'overtime' && item.effectiveFrom <= entry.workDate && (!item.effectiveTo || item.effectiveTo >= entry.workDate));
        if (!rule) payroll.validationErrors.push(`Thiếu quy tắc overtime cho ngày ${entry.workDate}`);
        else {
          const overtimeRate = rule.fixedAmount == null ? baseHourly * Number(rule.multiplier) : Number(rule.fixedAmount);
          createdItems.push(manager.create(PayrollItem, {
          employeePayrollId: payroll.id, itemType: 'earning', code: `OT_${rule.code}`, description: `${rule.name} ngày ${entry.workDate}`,
          quantity: String(entry.overtimeMinutes / 60), rate: String(overtimeRate), amount: this.money(entry.overtimeMinutes / 60 * overtimeRate),
          source: 'system', sourceKey: `overtime:${entry.id}:${rule.id}:${rate.id}`, workDate: entry.workDate,
          ruleSnapshot: { ruleId: rule.id, multiplier: rule.multiplier, fixedAmount: rule.fixedAmount, salaryRateId: rate.id, baseHourly, overtimeMinutes: entry.overtimeMinutes },
        }));
        }
      }
      if (entry.entryType === 'holiday') {
        const rule = rules.find((item) => item.ruleType === 'holiday' && item.effectiveFrom <= entry.workDate && (!item.effectiveTo || item.effectiveTo >= entry.workDate));
        if (!rule) payroll.validationErrors.push(`Thiếu quy tắc ngày lễ cho ngày ${entry.workDate}`);
        else {
          const holidayRate = rule.fixedAmount == null ? baseHourly * Number(rule.multiplier) : Number(rule.fixedAmount);
          createdItems.push(manager.create(PayrollItem, {
          employeePayrollId: payroll.id, itemType: 'earning', code: `HOLIDAY_${rule.code}`, description: `${rule.name} ngày ${entry.workDate}`,
          quantity: String(entry.scheduledMinutes / 60), rate: String(holidayRate), amount: this.money(entry.scheduledMinutes / 60 * holidayRate),
          source: 'system', sourceKey: `holiday:${entry.id}:${rule.id}:${rate.id}`, workDate: entry.workDate, ruleSnapshot: { ruleId: rule.id, multiplier: rule.multiplier, fixedAmount: rule.fixedAmount, salaryRateId: rate.id },
        }));
        }
      }
    }
    if (createdItems.length) await manager.save(PayrollItem, createdItems);
    payroll.salarySnapshot = { rates: rates.filter((rate) => usedRates.has(rate.id)).map((rate) => this.salarySnapshot(rate)) };
    payroll.timesheetSnapshot = { ...this.timesheetSnapshot(timesheet), entries: calculationEntries.map((entry) => ({ id: entry.id, workDate: entry.workDate, entryType: entry.entryType, scheduledMinutes: entry.scheduledMinutes, regularMinutes: entry.regularMinutes, overtimeMinutes: entry.overtimeMinutes, breakMinutes: entry.breakMinutes })) };
    payroll.calculationSnapshot = { version: CALCULATOR_VERSION, formula: 'minute_based', monthlyProration: 'paid_minutes / scheduled_minutes', calculatedAt: new Date().toISOString() };
    await this.recomputeTotals(manager, payroll);
  }

  private async mutateItem(id: string, itemId: string | null, dto: CreatePayrollItemDto, actor: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const payroll = await this.getEditablePayroll(manager, id, actor);
      const old = itemId ? await manager.getRepository(PayrollItem).findOneBy({ id: itemId, employeePayrollId: id }) : null;
      if (itemId && !old) throw new NotFoundException('Không tìm thấy khoản lương');
      if (old && old.source !== 'manual') throw new BadRequestException('Không thể sửa trực tiếp khoản do hệ thống tính');
      const item = old ?? manager.create(PayrollItem, { employeePayrollId: id, source: 'manual', createdBy: actor.id });
      Object.assign(item, {
        itemType: dto.itemType, code: dto.code.trim().toUpperCase(), description: dto.description.trim(), quantity: String(dto.quantity ?? 1),
        rate: dto.rate == null ? null : String(dto.rate), amount: this.money(dto.amount), isTaxable: dto.isTaxable ?? true,
        workDate: dto.workDate || null, ruleSnapshot: { reason: dto.reason.trim() }, updatedAt: new Date(),
      });
      const saved = await manager.save(PayrollItem, item);
      await this.recomputeTotals(manager, payroll);
      await this.audit(manager, actor.id, old ? 'payroll.item.updated' : 'payroll.item.created', 'payroll_item', saved.id, old, { ...saved, reason: dto.reason.trim() });
      return this.getEmployeePayrollResult(manager, payroll.id);
    });
  }

  private async recomputeTotals(manager: EntityManager, payroll: EmployeePayroll) {
    const items = await manager.getRepository(PayrollItem).findBy({ employeePayrollId: payroll.id });
    const sum = (predicate: (item: PayrollItem) => boolean) => this.round(items.filter(predicate).reduce((total, item) => total + Number(item.amount), 0));
    const regularPay = sum((item) => item.itemType === 'earning' && item.code.startsWith('REGULAR_'));
    const overtimePay = sum((item) => item.itemType === 'earning' && item.code.startsWith('OT_'));
    const holidayPay = sum((item) => item.itemType === 'earning' && item.code.startsWith('HOLIDAY_'));
    const otherEarnings = sum((item) => item.itemType === 'earning' && !item.code.startsWith('REGULAR_') && !item.code.startsWith('OT_') && !item.code.startsWith('HOLIDAY_'));
    const allowanceTotal = sum((item) => item.itemType === 'allowance');
    const bonusTotal = sum((item) => item.itemType === 'bonus');
    const deductionTotal = sum((item) => item.itemType === 'deduction');
    const grossPay = this.round(regularPay + overtimePay + holidayPay + otherEarnings + allowanceTotal + bonusTotal);
    const errors = payroll.validationErrors.filter((error) => error !== 'Tổng khấu trừ vượt tổng thu nhập');
    if (deductionTotal > grossPay) errors.push('Tổng khấu trừ vượt tổng thu nhập');
    const netPay = Math.max(0, this.round(grossPay - deductionTotal));
    Object.assign(payroll, {
      regularPay: this.money(regularPay), overtimePay: this.money(overtimePay), holidayPay: this.money(holidayPay), allowanceTotal: this.money(allowanceTotal),
      bonusTotal: this.money(bonusTotal), deductionTotal: this.money(deductionTotal), grossPay: this.money(grossPay), netPay: this.money(netPay),
      balanceDue: this.money(Math.max(0, netPay - Number(payroll.paidTotal || 0))), validationErrors: errors,
      status: errors.length ? 'needs_review' : 'calculated', updatedAt: new Date(),
    });
    await manager.save(EmployeePayroll, payroll);
  }

  private async refreshPaymentTotals(manager: EntityManager, payroll: EmployeePayroll) {
    const result = await manager.getRepository(PayrollPaymentHistory).createQueryBuilder('payment').select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('payment.employee_payroll_id = :id AND payment.status = :status', { id: payroll.id, status: 'completed' }).getRawOne<{ total: string }>();
    const paid = this.round(Number(result?.total ?? 0));
    const balance = Math.max(0, this.round(Number(payroll.netPay) - paid));
    payroll.paidTotal = this.money(paid);
    payroll.balanceDue = this.money(balance);
    payroll.status = paid <= 0 ? 'locked' : balance > 0 ? 'partially_paid' : 'paid';
    payroll.paidAt = balance === 0 ? new Date() : null;
    await manager.save(EmployeePayroll, payroll);
  }

  private async refreshPeriodPaymentStatus(manager: EntityManager, periodId: string) {
    const period = await manager.getRepository(PayrollPeriod).findOneByOrFail({ id: periodId });
    const payrolls = await manager.getRepository(EmployeePayroll).findBy({ payrollPeriodId: periodId });
    period.status = payrolls.length && payrolls.every((item) => item.status === 'paid') ? 'paid' : payrolls.some((item) => ['partially_paid', 'paid'].includes(item.status)) ? 'partially_paid' : 'locked';
    await manager.save(PayrollPeriod, period);
  }

  private async changePeriodStatus(id: string, actor: AuthUser, allowed: string[], toStatus: string, reason: string | undefined, beforeSave: (manager: EntityManager, period: PayrollPeriod) => Promise<void>) {
    const organization = await this.resolveOrganization(actor);
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.getRepository(PayrollPeriod).createQueryBuilder('period').setLock('pessimistic_write').where('period.id = :id AND period.organization_id = :organizationId', { id, organizationId: organization.id }).getOne();
      if (!period) throw new NotFoundException('Không tìm thấy kỳ lương');
      if (!allowed.includes(period.status)) throw new BadRequestException(`Không thể chuyển kỳ lương từ trạng thái ${period.status}`);
      const fromStatus = period.status;
      await beforeSave(manager, period);
      period.status = toStatus;
      await manager.save(PayrollPeriod, period);
      await manager.save(PayrollStatusHistory, manager.create(PayrollStatusHistory, { payrollPeriodId: period.id, fromStatus, toStatus, reason: reason?.trim() || null, actorUserId: actor.id }));
      await this.audit(manager, actor.id, `payroll.period.${toStatus}`, 'payroll_period', period.id, { status: fromStatus }, { status: toStatus, reason: reason?.trim() || null });
      return this.getPeriodResult(manager, period);
    });
  }

  private async getEditablePayroll(manager: EntityManager, id: string, actor: AuthUser) {
    const payroll = await manager.getRepository(EmployeePayroll).findOne({ where: { id }, relations: { payrollPeriod: true } });
    if (!payroll) throw new NotFoundException('Không tìm thấy bảng lương');
    await this.assertPeriodOwned(payroll.payrollPeriod, actor);
    if (!EDITABLE_PERIODS.includes(payroll.payrollPeriod.status)) throw new BadRequestException('Không thể sửa khoản lương sau khi gửi duyệt hoặc khóa');
    return payroll;
  }

  private async getPeriodResult(manager: EntityManager, period: PayrollPeriod) {
    const payrolls = await manager.getRepository(EmployeePayroll).findBy({ payrollPeriodId: period.id });
    return this.periodView(period, payrolls);
  }

  private async getEmployeePayrollResult(manager: EntityManager, id: string) {
    const payroll = await manager.getRepository(EmployeePayroll).findOne({ where: { id }, relations: { employee: true, payrollPeriod: true, timesheet: true } });
    if (!payroll) throw new NotFoundException('Không tìm thấy bảng lương');
    const [items, payments] = await Promise.all([manager.getRepository(PayrollItem).findBy({ employeePayrollId: id }), manager.getRepository(PayrollPaymentHistory).findBy({ employeePayrollId: id })]);
    return { ...this.payrollView(payroll), employee: this.employeeView(payroll.employee), period: payroll.payrollPeriod, timesheet: payroll.timesheet, items, payments };
  }

  private async getOwnedPeriod(id: string, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    const period = await this.periodRepository.findOneBy({ id, organizationId: organization.id });
    if (!period) throw new NotFoundException('Không tìm thấy kỳ lương');
    return period;
  }

  private async assertPeriodOwned(period: PayrollPeriod, actor: AuthUser) {
    const organization = await this.resolveOrganization(actor);
    if (period.organizationId !== organization.id) throw new ForbiddenException('Không có quyền truy cập kỳ lương này');
  }

  private periodView(period: PayrollPeriod, payrolls: EmployeePayroll[]) {
    const total = (field: keyof EmployeePayroll) => this.money(payrolls.reduce((sum, item) => sum + Number(item[field] ?? 0), 0));
    return {
      ...period,
      employeeCount: payrolls.length,
      issueCount: payrolls.filter((item) => item.validationErrors.length > 0 || item.status === 'needs_review').length,
      warningCount: payrolls.reduce((sum, item) => sum + item.validationWarnings.length, 0),
      totals: { grossPay: total('grossPay'), deductionTotal: total('deductionTotal'), netPay: total('netPay'), paidTotal: total('paidTotal'), balanceDue: total('balanceDue') },
    };
  }

  private payrollView(payroll: EmployeePayroll) {
    return {
      id: payroll.id, payrollPeriodId: payroll.payrollPeriodId, employeeId: payroll.employeeId, timesheetId: payroll.timesheetId,
      currencyCode: payroll.currencyCode.trim(), payType: payroll.payType, baseRate: payroll.baseRate, baseSalary: payroll.baseSalary,
      regularPay: payroll.regularPay, overtimePay: payroll.overtimePay, holidayPay: payroll.holidayPay, allowanceTotal: payroll.allowanceTotal,
      bonusTotal: payroll.bonusTotal, deductionTotal: payroll.deductionTotal, grossPay: payroll.grossPay, netPay: payroll.netPay,
      paidTotal: payroll.paidTotal, balanceDue: payroll.balanceDue, status: payroll.status, salarySnapshot: payroll.salarySnapshot,
      timesheetSnapshot: payroll.timesheetSnapshot, calculationSnapshot: payroll.calculationSnapshot, validationErrors: payroll.validationErrors,
      validationWarnings: payroll.validationWarnings, calculatedAt: payroll.calculatedAt, publishedAt: payroll.publishedAt, paidAt: payroll.paidAt,
    };
  }

  private employeeView(employee: Employee) {
    return { id: employee.id, employeeCode: employee.employeeCode, fullName: this.employeeName(employee), employmentStatus: employee.employmentStatus, branch: employee.primaryBranch ? { id: employee.primaryBranch.id, name: employee.primaryBranch.name } : null, department: employee.department ? { id: employee.department.id, name: employee.department.name } : null };
  }

  private employeeName(employee: Employee) { return employee.preferredName || `${employee.lastName} ${employee.firstName}`.trim(); }
  private salarySnapshot(rate: EmployeeSalaryRate) { return { id: rate.id, payType: rate.payType, baseRate: rate.baseRate, currencyCode: rate.currencyCode.trim(), effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo }; }
  private timesheetSnapshot(timesheet: Timesheet) { return { id: timesheet.id, status: timesheet.status, scheduledMinutes: timesheet.scheduledMinutes, workedMinutes: timesheet.workedMinutes, breakMinutes: timesheet.breakMinutes, regularMinutes: timesheet.regularMinutes, overtimeMinutes: timesheet.overtimeMinutes, paidLeaveMinutes: timesheet.paidLeaveMinutes, unpaidLeaveMinutes: timesheet.unpaidLeaveMinutes, lockedAt: timesheet.lockedAt }; }

  private validateRule(dto: CreatePayrollRuleDto) {
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) throw new BadRequestException('Ngày kết thúc quy tắc không được trước ngày hiệu lực');
    if (dto.ruleType === 'overtime' && dto.multiplier <= 0 && !dto.fixedAmount) throw new BadRequestException('Quy tắc overtime cần hệ số hoặc số tiền cố định hợp lệ');
  }

  private ruleInput(organizationId: string, dto: CreatePayrollRuleDto, createdBy: string | null) {
    return { organizationId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), ruleType: dto.ruleType, multiplier: String(dto.multiplier), fixedAmount: dto.fixedAmount == null ? null : this.money(dto.fixedAmount), dayType: dto.dayType?.trim() || null, priority: dto.priority ?? 100, effectiveFrom: dto.effectiveFrom, effectiveTo: dto.effectiveTo || null, isActive: dto.isActive ?? true, conditions: dto.conditions ?? {}, createdBy, updatedAt: new Date() };
  }

  private applyEmployeeFilters(qb: ReturnType<Repository<Employee>['createQueryBuilder']>, query: PayrollListQueryDto) {
    if (query.search?.trim()) qb.andWhere('(employee.employee_code ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.preferred_name ILIKE :search)', { search: `%${query.search.trim()}%` });
    if (query.employeeId) qb.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    if (query.branchId) qb.andWhere('employee.primary_branch_id = :branchId', { branchId: query.branchId });
    if (query.departmentId) qb.andWhere('employee.department_id = :departmentId', { departmentId: query.departmentId });
  }

  private async resolveOrganization(actor: AuthUser) {
    if (actor.employeeId) {
      const employee = await this.employeeRepository.findOne({ where: { id: actor.employeeId, deletedAt: IsNull() }, relations: { organization: true } });
      if (employee) return employee.organization;
    }
    const organization = await this.organizationRepository.createQueryBuilder('organization').orderBy('organization.created_at', 'ASC').getOne();
    if (!organization) throw new BadRequestException('Doanh nghiệp chưa được cấu hình');
    return organization;
  }

  private async audit(manager: EntityManager, actorUserId: string | null, action: string, entityType: string, entityId: string | null, oldValues: unknown, newValues: unknown) {
    await manager.save(AuditLog, manager.create(AuditLog, { actorUserId, action, entityType, entityId, oldValues: oldValues as Record<string, unknown> | null, newValues: newValues as Record<string, unknown> | null }));
  }

  private group<T>(items: T[], key: (item: T) => string) { const map = new Map<string, T[]>(); items.forEach((item) => map.set(key(item), [...(map.get(key(item)) ?? []), item])); return map; }
  private round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private money(value: number) { return this.round(value).toFixed(2); }
  private dateOnly(value: Date) { return value.toISOString().slice(0, 10); }
  private csv(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
}
