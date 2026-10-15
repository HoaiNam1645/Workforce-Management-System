import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparatePersonalSchedulePermission1791781500000 implements MigrationInterface {
  name = 'SeparatePersonalSchedulePermission1791781500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description)
      VALUES ('schedules.self.view', 'personal_schedule', 'view', 'Xem lịch làm việc cá nhân')
      ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
    `);
    await queryRunner.query(`
      DELETE FROM workforce.role_permissions rp
      USING workforce.roles r, workforce.permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.code = 'EMPLOYEE'
        AND p.code = 'schedules.view'
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      CROSS JOIN workforce.permissions p
      WHERE r.code = 'EMPLOYEE' AND p.code = 'schedules.self.view'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      CROSS JOIN workforce.permissions p
      WHERE r.code = 'EMPLOYEE' AND p.code = 'schedules.view'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = 'schedules.self.view'`);
  }
}
