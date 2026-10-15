import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { DataSource, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { Role } from '../access-control/entities/role.entity';
import { UserRole } from '../access-control/entities/user-role.entity';
import { User } from '../access-control/entities/user.entity';
import { AuthUser } from '../access-control/auth-user.type';
import { Organization } from '../core/entities/organization.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { Position } from '../organization/entities/position.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreateSalaryRateDto } from './dto/create-salary-rate.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';
import { EmployeeSalaryRate } from './entities/employee-salary-rate.entity';
import { EmployeeWorkHistory } from './entities/employee-work-history.entity';

type EmployeeWithRelations = Employee & {
  primaryBranch: Branch;
  department: Department;
  position: Position;
  manager: Employee | null;
};

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeWorkHistory)
    private readonly workHistoryRepository: Repository<EmployeeWorkHistory>,
    @InjectRepository(EmployeeSalaryRate)
    private readonly salaryRateRepository: Repository<EmployeeSalaryRate>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: EmployeeQueryDto) {
    const organizationId = await this.resolveOrganizationId(query.organizationId);
    if (!organizationId) return this.emptyPage(query.page, query.limit);

    const queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.primaryBranch', 'branch')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.position', 'position')
      .leftJoinAndSelect('employee.manager', 'manager')
      .where('employee.organization_id = :organizationId', { organizationId })
      .andWhere('employee.deleted_at IS NULL');

    if (query.search?.trim()) {
      queryBuilder.andWhere(
        `(
          employee.employee_code ILIKE :search
          OR employee.first_name ILIKE :search
          OR employee.last_name ILIKE :search
          OR employee.preferred_name ILIKE :search
          OR employee.work_email ILIKE :search
          OR employee.personal_email ILIKE :search
          OR employee.phone ILIKE :search
          OR department.name ILIKE :search
          OR position.name ILIKE :search
          OR branch.name ILIKE :search
        )`,
        { search: `%${query.search.trim()}%` },
      );
    }

    if (query.status) queryBuilder.andWhere('employee.employment_status = :status', { status: query.status });
    if (query.employmentType) queryBuilder.andWhere('employee.employment_type = :employmentType', { employmentType: query.employmentType });
    if (query.branchId) queryBuilder.andWhere('employee.primary_branch_id = :branchId', { branchId: query.branchId });
    if (query.departmentId) queryBuilder.andWhere('employee.department_id = :departmentId', { departmentId: query.departmentId });
    if (query.positionId) queryBuilder.andWhere('employee.position_id = :positionId', { positionId: query.positionId });

    const sortColumns: Record<string, string> = {
      employeeCode: 'employee.employee_code',
      firstName: 'employee.first_name',
      lastName: 'employee.last_name',
      hireDate: 'employee.hire_date',
      createdAt: 'employee.created_at',
    };
    queryBuilder
      .orderBy(sortColumns[query.sortBy] ?? sortColumns.createdAt, query.sortOrder)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [employees, total] = await queryBuilder.getManyAndCount();
    return {
      items: employees.map((employee) => this.toResponse(employee as EmployeeWithRelations)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getSummary(requestedOrganizationId?: string) {
    const organizationId = await this.resolveOrganizationId(requestedOrganizationId);
    if (!organizationId) {
      return { total: 0, active: 0, onLeave: 0, terminated: 0, fullTime: 0, partTime: 0 };
    }

    const result = await this.employeeRepository
      .createQueryBuilder('employee')
      .select('COUNT(*)', 'total')
      .addSelect("COUNT(*) FILTER (WHERE employee.employment_status = 'active')", 'active')
      .addSelect("COUNT(*) FILTER (WHERE employee.employment_status = 'on_leave')", 'onLeave')
      .addSelect("COUNT(*) FILTER (WHERE employee.employment_status = 'terminated')", 'terminated')
      .addSelect("COUNT(*) FILTER (WHERE employee.employment_type = 'full_time')", 'fullTime')
      .addSelect("COUNT(*) FILTER (WHERE employee.employment_type = 'part_time')", 'partTime')
      .where('employee.organization_id = :organizationId', { organizationId })
      .andWhere('employee.deleted_at IS NULL')
      .getRawOne<Record<string, string>>();

    return {
      total: Number(result?.total ?? 0),
      active: Number(result?.active ?? 0),
      onLeave: Number(result?.onLeave ?? 0),
      terminated: Number(result?.terminated ?? 0),
      fullTime: Number(result?.fullTime ?? 0),
      partTime: Number(result?.partTime ?? 0),
    };
  }

  async getOptions(requestedOrganizationId?: string, actor?: AuthUser) {
    const organizationId = await this.resolveOrganizationId(requestedOrganizationId);
    if (!organizationId) {
      return { organization: null, branches: [], departments: [], positions: [], roles: [] };
    }

    const [organization, branches, departments, positions, roles] = await Promise.all([
      this.organizationRepository.findOneBy({ id: organizationId }),
      this.branchRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      this.departmentRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      this.positionRepository.find({ where: { organizationId, deletedAt: IsNull(), isActive: true }, order: { name: 'ASC' } }),
      actor?.permissions.includes('employees.access.manage') ? this.roleRepository.find({ order: { name: 'ASC' } }) : Promise.resolve([]),
    ]);

    return {
      organization: organization ? { id: organization.id, code: organization.code, name: organization.name } : null,
      branches: branches.map(({ id, code, name }) => ({ id, code, name })),
      departments: departments.map(({ id, code, name }) => ({ id, code, name })),
      positions: positions.map(({ id, code, name, isManager }) => ({ id, code, name, isManager })),
      roles: actor ? roles.filter((role) => this.assignableRoleCodes(actor).has(role.code)).map((role) => this.toRoleResponse(role)) : [],
    };
  }

  async findOne(id: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { primaryBranch: true, department: true, position: true, manager: true },
    });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');

    const history = await this.workHistoryRepository.find({
      where: { employeeId: id },
      relations: { branch: true, department: true, position: true, manager: true },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });

    return {
      ...this.toResponse(employee as EmployeeWithRelations),
      personalEmail: employee.personalEmail,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      address: employee.address,
      emergencyContact: {
        name: employee.emergencyContactName,
        phone: employee.emergencyContactPhone,
        relationship: employee.emergencyContactRelationship,
      },
      terminationDate: employee.terminationDate,
      terminationReason: employee.terminationReason,
      managerId: employee.managerId,
      notes: employee.notes,
      workHistory: history.map((item) => ({
        id: item.id,
        branch: { id: item.branch.id, name: item.branch.name },
        department: { id: item.department.id, name: item.department.name },
        position: { id: item.position.id, name: item.position.name },
        manager: item.manager ? { id: item.manager.id, name: this.employeeName(item.manager) } : null,
        employmentType: item.employmentType,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        reason: item.reason,
      })),
    };
  }

  async getWorkHistory(id: string) {
    await this.getEmployeeEntity(id);
    const history = await this.workHistoryRepository.find({
      where: { employeeId: id },
      relations: { branch: true, department: true, position: true, manager: true },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });

    return history.map((item) => ({
      id: item.id,
      branch: { id: item.branch.id, name: item.branch.name },
      department: { id: item.department.id, name: item.department.name },
      position: { id: item.position.id, name: item.position.name },
      manager: item.manager ? { id: item.manager.id, name: this.employeeName(item.manager) } : null,
      employmentType: item.employmentType,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      reason: item.reason,
    }));
  }

  async getSalaryRates(id: string) {
    await this.getEmployeeEntity(id);
    const rates = await this.salaryRateRepository.find({
      where: { employeeId: id },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });

    return {
      current: rates.find((rate) => rate.effectiveTo === null)
        ? this.toSalaryRateResponse(rates.find((rate) => rate.effectiveTo === null)!)
        : null,
      history: rates.map((rate) => this.toSalaryRateResponse(rate)),
    };
  }

  async createSalaryRate(id: string, dto: CreateSalaryRateDto) {
    const employee = await this.getEmployeeEntity(id);
    if (dto.effectiveFrom < employee.hireDate) {
      throw new BadRequestException('Ngày áp dụng mức lương không thể trước ngày bắt đầu làm việc');
    }

    await this.dataSource.transaction(async (manager) => {
      const current = await manager.findOne(EmployeeSalaryRate, {
        where: { employeeId: id, effectiveTo: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (current && dto.effectiveFrom <= current.effectiveFrom) {
        throw new BadRequestException('Ngày áp dụng mới phải sau ngày áp dụng của mức lương hiện tại');
      }
      if (current) {
        current.effectiveTo = this.previousDate(dto.effectiveFrom);
        await manager.save(EmployeeSalaryRate, current);
      }
      await manager.save(EmployeeSalaryRate, manager.create(EmployeeSalaryRate, {
        employeeId: id,
        payType: dto.payType,
        baseRate: dto.baseRate.toFixed(2),
        currencyCode: dto.currencyCode.trim().toUpperCase(),
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: null,
        note: dto.note?.trim() || null,
        createdBy: null,
      }));
    });

    return this.getSalaryRates(id);
  }

  async getAccess(id: string, actor: AuthUser) {
    const employee = await this.getEmployeeEntity(id);
    const roles = await this.roleRepository.find({ order: { name: 'ASC' } });
    const allowedCodes = this.assignableRoleCodes(actor);
    const availableRoles = roles.filter((role) => allowedCodes.has(role.code));
    if (!employee.userId) {
      return {
        enabled: false,
        email: employee.workEmail ?? employee.personalEmail,
        status: null,
        roles: [],
        availableRoles: availableRoles.map((role) => this.toRoleResponse(role)),
      };
    }

    const [user, assignments] = await Promise.all([
      this.userRepository.findOneBy({ id: employee.userId, deletedAt: IsNull() }),
      this.userRoleRepository.find({
        where: { userId: employee.userId },
        relations: { role: true },
        order: { grantedAt: 'ASC' },
      }),
    ]);
    if (!user) {
      return {
        enabled: false,
        email: employee.workEmail ?? employee.personalEmail,
        status: null,
        roles: [],
        availableRoles: availableRoles.map((role) => this.toRoleResponse(role)),
      };
    }

    return {
      enabled: user.status !== 'disabled',
      email: user.email,
      status: user.status,
      roles: assignments.map((assignment) => this.toRoleResponse(assignment.role)),
      availableRoles: availableRoles.map((role) => this.toRoleResponse(role)),
    };
  }

  async updateAccess(id: string, dto: UpdateEmployeeAccessDto, actor: AuthUser) {
    const employee = await this.getEmployeeEntity(id);

    try {
      await this.dataSource.transaction(async (manager) => {
        let user = employee.userId
          ? await manager.findOne(User, { where: { id: employee.userId, deletedAt: IsNull() } })
          : null;

        if (!dto.enabled) {
          if (user) {
            user.status = 'disabled';
            user.updatedAt = new Date();
            await manager.save(User, user);
          }
          return;
        }

        const roleIds = dto.roleIds ?? [];
        if (roleIds.length === 0) throw new BadRequestException('Chọn ít nhất một vai trò truy cập');
        const roles = await manager.find(Role, { where: { id: In(roleIds) } });
        if (roles.length !== roleIds.length) throw new BadRequestException('Vai trò truy cập không hợp lệ');
        const allowedCodes = this.assignableRoleCodes(actor);
        if (roles.some((role) => !allowedCodes.has(role.code))) {
          throw new ForbiddenException('Bạn không được phép gán một hoặc nhiều vai trò đã chọn');
        }

        const email = (dto.email ?? employee.workEmail ?? employee.personalEmail)?.trim().toLowerCase();
        if (!email) throw new BadRequestException('Cần email để tạo tài khoản truy cập');

        if (!user) {
          if (!dto.password) throw new BadRequestException('Nhập mật khẩu ban đầu khi tạo tài khoản');
          const passwordHash = await hash(dto.password, 12);
          user = await manager.save(User, manager.create(User, {
            email,
            phone: null,
            passwordHash,
            displayName: this.employeeName(employee),
            status: dto.status && dto.status !== 'disabled' ? dto.status : 'active',
            lastLoginAt: null,
            passwordChangedAt: null,
            failedLoginCount: 0,
            lockedUntil: null,
            deletedAt: null,
          }));
          employee.userId = user.id;
          employee.updatedAt = new Date();
          await manager.save(Employee, employee);
        } else {
          user.email = email;
          user.displayName = this.employeeName(employee);
          user.status = dto.status && dto.status !== 'disabled' ? dto.status : user.status === 'disabled' ? 'invited' : user.status;
          user.updatedAt = new Date();
          if (dto.password) {
            user.passwordHash = await hash(dto.password, 12);
            user.passwordChangedAt = new Date();
          }
          await manager.save(User, user);
        }

        await manager.delete(UserRole, { userId: user.id });
        await manager.save(UserRole, roles.map((role) => manager.create(UserRole, {
          userId: user!.id,
          roleId: role.id,
          branchId: null,
          departmentId: null,
          grantedBy: null,
        })));
      });
      return this.getAccess(id, actor);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driverError = error.driverError as { code?: string };
        if (driverError.code === '23505') throw new ConflictException('Email đã được sử dụng bởi tài khoản khác');
      }
      throw error;
    }
  }

  async create(dto: CreateEmployeeDto, actor: AuthUser) {
    const organizationId = await this.requireOrganizationId(dto.organizationId);
    await this.validateReferences(organizationId, dto);
    this.validateTermination(dto.employmentStatus ?? 'active', dto.terminationDate);

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        let user: User | null = null;
        let roles: Role[] = [];
        if (dto.createAccount) {
          if (!actor.permissions.includes('employees.access.manage')) throw new ForbiddenException('Bạn không có quyền tạo tài khoản truy cập');
          const email = (dto.loginEmail ?? dto.workEmail)?.trim().toLowerCase();
          if (!email) throw new BadRequestException('Nhập email đăng nhập');
          if (!dto.password) throw new BadRequestException('Nhập mật khẩu ban đầu');
          const roleIds = dto.roleIds ?? [];
          if (!roleIds.length) throw new BadRequestException('Chọn ít nhất một vai trò truy cập');
          roles = await manager.find(Role, { where: { id: In(roleIds) } });
          if (roles.length !== roleIds.length || roles.some((role) => !this.assignableRoleCodes(actor).has(role.code))) throw new ForbiddenException('Vai trò truy cập không hợp lệ');
          user = await manager.save(User, manager.create(User, { email, phone: dto.phone?.trim() || null, passwordHash: await hash(dto.password, 12), displayName: `${dto.lastName.trim()} ${dto.firstName.trim()}`, status: 'active', lastLoginAt: null, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, deletedAt: null }));
        }
        const employee = manager.create(Employee, {
          organizationId,
          userId: user?.id ?? null,
          employeeCode: dto.employeeCode.trim(),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          preferredName: dto.preferredName?.trim() || null,
          dateOfBirth: dto.dateOfBirth ?? null,
          gender: dto.gender ?? null,
          personalEmail: dto.personalEmail?.trim().toLowerCase() || null,
          workEmail: dto.workEmail?.trim().toLowerCase() || null,
          phone: dto.phone?.trim() || null,
          address: dto.address?.trim() || null,
          emergencyContactName: dto.emergencyContactName?.trim() || null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() || null,
          emergencyContactRelationship: dto.emergencyContactRelationship?.trim() || null,
          employmentType: dto.employmentType,
          employmentStatus: dto.employmentStatus ?? 'active',
          hireDate: dto.hireDate,
          terminationDate: dto.terminationDate ?? null,
          terminationReason: dto.terminationReason?.trim() || null,
          primaryBranchId: dto.primaryBranchId,
          departmentId: dto.departmentId,
          positionId: dto.positionId,
          managerId: dto.managerId ?? null,
          avatarUrl: dto.avatarUrl?.trim() || null,
          notes: dto.notes?.trim() || null,
          deletedAt: null,
        });
        const saved = await manager.save(Employee, employee);
        if (user) await manager.save(UserRole, roles.map((role) => manager.create(UserRole, { userId: user!.id, roleId: role.id, branchId: null, departmentId: null, grantedBy: actor.id })));
        await manager.save(EmployeeWorkHistory, manager.create(EmployeeWorkHistory, {
          employeeId: saved.id,
          branchId: saved.primaryBranchId,
          departmentId: saved.departmentId,
          positionId: saved.positionId,
          managerId: saved.managerId,
          employmentType: saved.employmentType,
          effectiveFrom: saved.hireDate,
          effectiveTo: null,
          reason: 'Khởi tạo hồ sơ nhân viên',
          createdBy: null,
        }));
        return saved.id;
      });
      return this.findOne(id);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.getEmployeeEntity(id);
    if (dto.organizationId && dto.organizationId !== employee.organizationId) {
      throw new BadRequestException('Không thể chuyển nhân viên sang doanh nghiệp khác');
    }

    await this.validateReferences(employee.organizationId, {
      primaryBranchId: dto.primaryBranchId ?? employee.primaryBranchId,
      departmentId: dto.departmentId ?? employee.departmentId,
      positionId: dto.positionId ?? employee.positionId,
      managerId: dto.managerId === undefined ? employee.managerId : dto.managerId,
    });
    if (dto.managerId === id) throw new BadRequestException('Nhân viên không thể tự quản lý chính mình');

    const nextStatus = dto.employmentStatus ?? employee.employmentStatus;
    const nextTerminationDate = dto.terminationDate === undefined ? employee.terminationDate : dto.terminationDate;
    this.validateTermination(nextStatus, nextTerminationDate);

    const assignmentChanged =
      (dto.primaryBranchId !== undefined && dto.primaryBranchId !== employee.primaryBranchId)
      || (dto.departmentId !== undefined && dto.departmentId !== employee.departmentId)
      || (dto.positionId !== undefined && dto.positionId !== employee.positionId)
      || (dto.managerId !== undefined && dto.managerId !== employee.managerId)
      || (dto.employmentType !== undefined && dto.employmentType !== employee.employmentType);

    this.assignDefined(employee, dto);
    employee.employeeCode = employee.employeeCode.trim();
    employee.firstName = employee.firstName.trim();
    employee.lastName = employee.lastName.trim();
    employee.updatedAt = new Date();

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(Employee, employee);
        if (assignmentChanged) {
          const effectiveDate = this.today();
          await manager.update(EmployeeWorkHistory, { employeeId: id, effectiveTo: IsNull() }, { effectiveTo: effectiveDate });
          await manager.save(EmployeeWorkHistory, manager.create(EmployeeWorkHistory, {
            employeeId: id,
            branchId: employee.primaryBranchId,
            departmentId: employee.departmentId,
            positionId: employee.positionId,
            managerId: employee.managerId,
            employmentType: employee.employmentType,
            effectiveFrom: effectiveDate,
            effectiveTo: null,
            reason: 'Cập nhật thông tin công việc',
            createdBy: null,
          }));
        }
      });
      return this.findOne(id);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  updateStatus(id: string, dto: UpdateEmployeeStatusDto) {
    return this.update(id, dto);
  }

  async remove(id: string) {
    const employee = await this.getEmployeeEntity(id);
    const today = this.today();
    await this.dataSource.transaction(async (manager) => {
      employee.deletedAt = new Date();
      employee.updatedAt = new Date();
      if (employee.employmentStatus !== 'terminated') {
        employee.employmentStatus = 'terminated';
        employee.terminationDate = today;
        employee.terminationReason = employee.terminationReason ?? 'Xóa hồ sơ nhân viên';
      }
      await manager.save(Employee, employee);
      await manager.update(EmployeeWorkHistory, { employeeId: id, effectiveTo: IsNull() }, { effectiveTo: today });
    });
    return { id, deleted: true };
  }

  private async getEmployeeEntity(id: string) {
    const employee = await this.employeeRepository.findOneBy({ id, deletedAt: IsNull() });
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');
    return employee;
  }

  private async resolveOrganizationId(requestedOrganizationId?: string): Promise<string | null> {
    if (requestedOrganizationId) {
      const organization = await this.organizationRepository.findOneBy({ id: requestedOrganizationId });
      if (!organization) throw new NotFoundException('Không tìm thấy doanh nghiệp');
      return organization.id;
    }
    const [organization] = await this.organizationRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    return organization?.id ?? null;
  }

  private async requireOrganizationId(requestedOrganizationId?: string): Promise<string> {
    const organizationId = await this.resolveOrganizationId(requestedOrganizationId);
    if (!organizationId) throw new BadRequestException('Chưa cấu hình doanh nghiệp');
    return organizationId;
  }

  private async validateReferences(
    organizationId: string,
    references: Pick<CreateEmployeeDto, 'primaryBranchId' | 'departmentId' | 'positionId' | 'managerId'>,
  ) {
    const [branch, department, position, manager] = await Promise.all([
      this.branchRepository.findOneBy({ id: references.primaryBranchId, organizationId, deletedAt: IsNull() }),
      this.departmentRepository.findOneBy({ id: references.departmentId, organizationId, deletedAt: IsNull() }),
      this.positionRepository.findOneBy({ id: references.positionId, organizationId, deletedAt: IsNull() }),
      references.managerId
        ? this.employeeRepository.findOneBy({ id: references.managerId, organizationId, deletedAt: IsNull() })
        : Promise.resolve(null),
    ]);
    if (!branch) throw new BadRequestException('Chi nhánh không hợp lệ');
    if (!department) throw new BadRequestException('Phòng ban không hợp lệ');
    if (!position) throw new BadRequestException('Chức vụ không hợp lệ');
    if (references.managerId && !manager) throw new BadRequestException('Quản lý trực tiếp không hợp lệ');
  }

  private validateTermination(status: string, terminationDate?: string | null) {
    if (status === 'terminated' && !terminationDate) {
      throw new BadRequestException('Nhân viên nghỉ việc phải có ngày nghỉ việc');
    }
  }

  private assignDefined(employee: Employee, dto: UpdateEmployeeDto) {
    const mutableFields: Array<keyof UpdateEmployeeDto> = [
      'employeeCode', 'firstName', 'lastName', 'preferredName', 'dateOfBirth', 'gender',
      'personalEmail', 'workEmail', 'phone', 'address', 'emergencyContactName',
      'emergencyContactPhone', 'emergencyContactRelationship', 'employmentType',
      'employmentStatus', 'hireDate', 'terminationDate', 'terminationReason',
      'primaryBranchId', 'departmentId', 'positionId', 'managerId', 'avatarUrl', 'notes',
    ];
    const target = employee as unknown as Record<string, unknown>;
    const source = dto as unknown as Record<string, unknown>;
    mutableFields.forEach((field) => {
      if (source[field] !== undefined) target[field] = source[field];
    });
  }

  private toResponse(employee: EmployeeWithRelations) {
    const name = this.employeeName(employee);
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName: name,
      initials: this.initials(name),
      workEmail: employee.workEmail,
      personalEmail: employee.personalEmail,
      email: employee.workEmail ?? employee.personalEmail,
      phone: employee.phone,
      employmentType: employee.employmentType,
      employmentStatus: employee.employmentStatus,
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
      avatarUrl: employee.avatarUrl,
      branch: { id: employee.primaryBranch.id, code: employee.primaryBranch.code, name: employee.primaryBranch.name },
      department: { id: employee.department.id, code: employee.department.code, name: employee.department.name },
      position: { id: employee.position.id, code: employee.position.code, name: employee.position.name },
      manager: employee.manager ? { id: employee.manager.id, name: this.employeeName(employee.manager) } : null,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private employeeName(employee: Employee) {
    return employee.preferredName?.trim() || `${employee.lastName} ${employee.firstName}`.trim();
  }

  private initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('');
  }

  private emptyPage(page: number, limit: number) {
    return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
  }

  private today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }

  private previousDate(date: string) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  private toSalaryRateResponse(rate: EmployeeSalaryRate) {
    return {
      id: rate.id,
      payType: rate.payType,
      baseRate: Number(rate.baseRate),
      currencyCode: rate.currencyCode.trim(),
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
      note: rate.note,
      createdAt: rate.createdAt,
    };
  }

  private toRoleResponse(role: Role) {
    return { id: role.id, code: role.code, name: role.name, description: role.description };
  }

  private assignableRoleCodes(actor: AuthUser) {
    const actorRoles = new Set(actor.roles.map((role) => role.code));
    if (actorRoles.has('SUPER_ADMIN')) return new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'PAYROLL', 'EMPLOYEE']);
    if (actorRoles.has('ADMIN')) return new Set(['ADMIN', 'HR', 'MANAGER', 'PAYROLL', 'EMPLOYEE']);
    if (actorRoles.has('HR')) return new Set(['MANAGER', 'EMPLOYEE']);
    return new Set<string>();
  }

  private handlePersistenceError(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as { code?: string; constraint?: string };
      if (driverError.code === '23505' && driverError.constraint?.includes('users_email')) throw new ConflictException('Email đăng nhập đã được sử dụng');
      if (driverError.code === '23505') throw new ConflictException('Mã nhân viên đã tồn tại trong doanh nghiệp');
      if (driverError.code === '23503') throw new BadRequestException('Dữ liệu liên kết không hợp lệ');
      if (driverError.code === '23514') throw new BadRequestException('Dữ liệu nhân viên không thỏa điều kiện nghiệp vụ');
    }
    throw error;
  }
}
