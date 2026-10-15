import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAdminRole1791781400000 implements MigrationInterface {
  name = 'RenameAdminRole1791781400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE workforce.roles
      SET name = 'Quản trị doanh nghiệp',
          description = 'Toàn quyền vận hành trong doanh nghiệp',
          updated_at = CURRENT_TIMESTAMP
      WHERE code = 'ADMIN'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE workforce.roles
      SET name = 'Quản trị hệ thống',
          description = 'Toàn quyền cấu hình và quản trị hệ thống',
          updated_at = CURRENT_TIMESTAMP
      WHERE code = 'ADMIN'
    `);
  }
}
