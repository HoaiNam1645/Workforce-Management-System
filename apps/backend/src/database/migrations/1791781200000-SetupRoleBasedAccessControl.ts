import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetupRoleBasedAccessControl1791781200000 implements MigrationInterface {
  name = 'SetupRoleBasedAccessControl1791781200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO workforce.roles (code, name, description, is_system)
      VALUES ('SUPER_ADMIN', 'Super Admin', 'Toàn quyền quản trị hệ thống và phân quyền', true)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_system = true
    `);

    await queryRunner.query(`
      DELETE FROM workforce.permissions WHERE code = 'employees.manage'
    `);

    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('employees.view', 'employees', 'view', 'Xem danh sách và hồ sơ nhân viên'),
        ('employees.create', 'employees', 'create', 'Thêm nhân viên'),
        ('employees.update', 'employees', 'update', 'Cập nhật hồ sơ và trạng thái nhân viên'),
        ('employees.delete', 'employees', 'delete', 'Xóa hồ sơ nhân viên'),
        ('employees.salary.view', 'employee_salary', 'view', 'Xem mức lương nhân viên'),
        ('employees.salary.manage', 'employee_salary', 'manage', 'Thiết lập và điều chỉnh mức lương'),
        ('employees.history.view', 'employee_history', 'view', 'Xem lịch sử làm việc'),
        ('employees.access.manage', 'employee_access', 'manage', 'Tạo tài khoản và gán vai trò cho nhân viên'),
        ('access.view', 'access_control', 'view', 'Xem vai trò và ma trận phân quyền'),
        ('access.manage', 'access_control', 'manage', 'Cập nhật ma trận phân quyền')
      ON CONFLICT (code) DO UPDATE SET
        module = EXCLUDED.module,
        action = EXCLUDED.action,
        description = EXCLUDED.description
    `);

    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      JOIN workforce.permissions p ON p.code = ANY (ARRAY[
        'employees.view', 'employees.create', 'employees.update', 'employees.delete',
        'employees.salary.view', 'employees.salary.manage', 'employees.history.view',
        'employees.access.manage', 'schedules.view', 'schedules.manage', 'schedules.publish',
        'attendance.view', 'attendance.adjust', 'timesheets.view', 'timesheets.approve',
        'timesheets.lock', 'leave.approve', 'shift_swaps.approve', 'payroll.view',
        'payroll.manage', 'payroll.approve', 'reports.view', 'reports.export',
        'tasks.manage', 'settings.manage', 'audit.view'
      ])
      WHERE r.code = 'ADMIN'
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      JOIN workforce.permissions p ON p.code = ANY (CASE r.code
        WHEN 'HR' THEN ARRAY[
          'employees.view', 'employees.create', 'employees.update', 'employees.history.view',
          'employees.access.manage', 'schedules.view', 'attendance.view', 'timesheets.view',
          'leave.approve', 'reports.view'
        ]
        WHEN 'MANAGER' THEN ARRAY[
          'employees.view', 'employees.history.view', 'schedules.view', 'schedules.manage',
          'schedules.publish', 'attendance.view', 'attendance.adjust', 'timesheets.view',
          'timesheets.approve', 'leave.approve', 'shift_swaps.approve', 'tasks.manage', 'reports.view'
        ]
        WHEN 'PAYROLL' THEN ARRAY[
          'employees.view', 'employees.salary.view', 'employees.salary.manage',
          'timesheets.view', 'timesheets.approve', 'timesheets.lock', 'payroll.view',
          'payroll.manage', 'payroll.approve', 'reports.view', 'reports.export'
        ]
        ELSE ARRAY[]::text[]
      END)
      WHERE r.code IN ('HR', 'MANAGER', 'PAYROLL')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.roles WHERE code = 'SUPER_ADMIN'`);
    await queryRunner.query(`
      DELETE FROM workforce.permissions WHERE code = ANY (ARRAY[
        'employees.create', 'employees.update', 'employees.delete', 'employees.salary.view',
        'employees.salary.manage', 'employees.history.view', 'employees.access.manage',
        'access.view', 'access.manage'
      ])
    `);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description)
      VALUES ('employees.manage', 'employees', 'manage', 'Thêm và cập nhật nhân viên')
      ON CONFLICT DO NOTHING
    `);
  }
}
