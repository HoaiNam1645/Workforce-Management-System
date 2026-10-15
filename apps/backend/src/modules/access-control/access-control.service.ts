import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcryptjs';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuthUser } from './auth-user.type';
import { LoginDto } from './dto/login.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(UserRole) private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(RolePermission) private readonly rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(Employee) private readonly employeeRepository: Repository<Employee>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: dto.email.trim() })
      .andWhere('user.deleted_at IS NULL')
      .getOne();
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }
    if (user.status === 'disabled') throw new ForbiddenException('Tài khoản đã bị vô hiệu hóa');
    if (user.status === 'invited') throw new ForbiddenException('Tài khoản chưa hoàn tất kích hoạt');
    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Tài khoản đang tạm khóa do đăng nhập sai nhiều lần');
    }
    if (user.status === 'locked') {
      user.status = 'active';
      user.lockedUntil = null;
      user.failedLoginCount = 0;
    }
    if (!(await compare(dto.password, user.passwordHash))) {
      user.failedLoginCount += 1;
      if (user.failedLoginCount >= 5) {
        user.status = 'locked';
        user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      user.updatedAt = new Date();
      await this.userRepository.save(user);
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    user.lastLoginAt = new Date();
    user.failedLoginCount = 0;
    user.updatedAt = new Date();
    await this.userRepository.save(user);
    const authUser = await this.getAuthUser(user.id);
    return {
      accessToken: await this.jwtService.signAsync({ sub: user.id, email: user.email }),
      user: authUser,
    };
  }

  async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.userRepository.findOneBy({ id: userId, deletedAt: IsNull() });
    if (!user || user.status === 'disabled' || user.status === 'locked') {
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
    }

    const [assignments, employee] = await Promise.all([
      this.userRoleRepository.find({ where: { userId }, relations: { role: true } }),
      this.employeeRepository.findOneBy({ userId, deletedAt: IsNull() }),
    ]);
    const roleIds = assignments.map((assignment) => assignment.roleId);
    const isSuperAdmin = assignments.some((assignment) => assignment.role.code === 'SUPER_ADMIN');
    const rolePermissions = isSuperAdmin
      ? (await this.permissionRepository.find()).map((permission) => ({ permission }))
      : roleIds.length
        ? await this.rolePermissionRepository.find({ where: { roleId: In(roleIds) }, relations: { permission: true } })
        : [];

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      employeeId: employee?.id ?? null,
      roles: assignments.map((assignment) => ({
        roleId: assignment.roleId,
        code: assignment.role.code,
        branchId: assignment.branchId,
        departmentId: assignment.departmentId,
      })),
      permissions: [...new Set(rolePermissions.map((item) => item.permission.code))].sort(),
    };
  }

  async getPermissionMatrix() {
    const [roles, permissions, assignments, memberCounts] = await Promise.all([
      this.roleRepository.find({ order: { createdAt: 'ASC' } }),
      this.permissionRepository.find({ order: { module: 'ASC', action: 'ASC' } }),
      this.rolePermissionRepository.find(),
      this.userRoleRepository
        .createQueryBuilder('userRole')
        .select('userRole.role_id', 'roleId')
        .addSelect('COUNT(DISTINCT userRole.user_id)', 'count')
        .groupBy('userRole.role_id')
        .getRawMany<{ roleId: string; count: string }>(),
    ]);
    const permissionIdsByRole = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      permissionIdsByRole.set(assignment.roleId, [...(permissionIdsByRole.get(assignment.roleId) ?? []), assignment.permissionId]);
    });
    const counts = new Map(memberCounts.map((item) => [item.roleId, Number(item.count)]));

    return {
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        locked: role.code === 'SUPER_ADMIN',
        memberCount: counts.get(role.id) ?? 0,
        permissionIds: role.code === 'SUPER_ADMIN' ? permissions.map((permission) => permission.id) : permissionIdsByRole.get(role.id) ?? [],
      })),
      permissions: permissions.map((permission) => ({
        id: permission.id,
        code: permission.code,
        module: permission.module,
        action: permission.action,
        description: permission.description,
      })),
    };
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto, actor: AuthUser) {
    const role = await this.roleRepository.findOneBy({ id: roleId });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.code === 'SUPER_ADMIN') throw new BadRequestException('Không thể thay đổi quyền của Super Admin');

    const permissions = dto.permissionIds.length
      ? await this.permissionRepository.find({ where: { id: In(dto.permissionIds) } })
      : [];
    if (permissions.length !== dto.permissionIds.length) throw new BadRequestException('Danh sách quyền không hợp lệ');
    if (actor.roles.some((item) => item.roleId === roleId) && !permissions.some((item) => item.code === 'access.manage')) {
      throw new BadRequestException('Không thể tự gỡ quyền quản lý phân quyền của tài khoản hiện tại');
    }

    const previousAssignments = await this.rolePermissionRepository.findBy({ roleId });
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });
      if (permissions.length) {
        await manager.save(RolePermission, permissions.map((permission) => manager.create(RolePermission, {
          roleId,
          permissionId: permission.id,
        })));
      }
      await manager.save(AuditLog, manager.create(AuditLog, {
        actorUserId: actor.id,
        action: 'role_permissions.updated',
        entityType: 'role',
        entityId: roleId,
        oldValues: { permissionIds: previousAssignments.map((item) => item.permissionId) },
        newValues: { permissionIds: dto.permissionIds },
        ipAddress: null,
        userAgent: null,
        requestId: null,
      }));
    });
    return this.getPermissionMatrix();
  }
}
