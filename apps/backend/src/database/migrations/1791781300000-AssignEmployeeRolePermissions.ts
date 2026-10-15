import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignEmployeeRolePermissions1791781300000 implements MigrationInterface {
  name = 'AssignEmployeeRolePermissions1791781300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM workforce.roles r
      JOIN workforce.permissions p ON p.code = ANY (ARRAY[
        'schedules.view', 'attendance.clock', 'timesheets.view',
        'leave.request', 'shift_swaps.request'
      ])
      WHERE r.code = 'EMPLOYEE'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM workforce.role_permissions rp
      USING workforce.roles r, workforce.permissions p
      WHERE rp.role_id = r.id
        AND rp.permission_id = p.id
        AND r.code = 'EMPLOYEE'
        AND p.code = ANY (ARRAY[
          'schedules.view', 'attendance.clock', 'timesheets.view',
          'leave.request', 'shift_swaps.request'
        ])
    `);
  }
}
