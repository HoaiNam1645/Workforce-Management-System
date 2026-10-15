import { hash } from 'bcryptjs';
import { IsNull } from 'typeorm';
import dataSource from '../database/data-source';
import { Role } from '../modules/access-control/entities/role.entity';
import { UserRole } from '../modules/access-control/entities/user-role.entity';
import { User } from '../modules/access-control/entities/user.entity';

async function bootstrap() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'superadmin@lemiex.vn').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Lemiex Super Admin';
  if (!password || password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD phải có ít nhất 12 ký tự');
  }

  await dataSource.initialize();
  const role = await dataSource.getRepository(Role).findOneBy({ code: 'SUPER_ADMIN' });
  if (!role) throw new Error('Chưa có role SUPER_ADMIN. Hãy chạy migration trước.');

  await dataSource.transaction(async (manager) => {
    let user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .andWhere('user.deleted_at IS NULL')
      .getOne();
    if (!user) {
      user = manager.create(User, {
        email,
        phone: null,
        passwordHash: await hash(password, 12),
        displayName,
        status: 'active',
        lastLoginAt: null,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        deletedAt: null,
      });
    } else {
      user.passwordHash = await hash(password, 12);
      user.displayName = displayName;
      user.status = 'active';
      user.passwordChangedAt = new Date();
      user.updatedAt = new Date();
    }
    user = await manager.save(User, user);

    const existing = await manager.findOneBy(UserRole, {
      userId: user.id,
      roleId: role.id,
      branchId: IsNull(),
      departmentId: IsNull(),
    });
    if (!existing) {
      await manager.save(UserRole, manager.create(UserRole, {
        userId: user.id,
        roleId: role.id,
        branchId: null,
        departmentId: null,
        grantedBy: null,
      }));
    }
  });

  await dataSource.destroy();
  console.log(`Super Admin đã sẵn sàng: ${email}`);
}

void bootstrap().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
