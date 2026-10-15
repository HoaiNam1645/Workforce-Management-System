import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduleTemplateAndAssignmentPermissions1791781600000 implements MigrationInterface {
  name = 'AddScheduleTemplateAndAssignmentPermissions1791781600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('schedules.templates.manage', 'schedules', 'templates_manage', 'Cấu hình mẫu thời gian ca'),
        ('schedules.assign', 'schedules', 'assign', 'Phân ca cho nhân viên')
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      CROSS JOIN workforce.permissions p
      WHERE r.code IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER')
        AND p.code IN ('schedules.templates.manage', 'schedules.assign')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM workforce.permissions
      WHERE code IN ('schedules.templates.manage', 'schedules.assign')
    `);
  }
}
