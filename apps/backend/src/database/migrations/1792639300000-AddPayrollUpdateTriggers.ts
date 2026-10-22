import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollUpdateTriggers1792639300000 implements MigrationInterface {
  name = 'AddPayrollUpdateTriggers1792639300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS payroll_items_set_updated_at_trg ON workforce.payroll_items`);
    await queryRunner.query(`CREATE TRIGGER payroll_items_set_updated_at_trg BEFORE UPDATE ON workforce.payroll_items FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS payroll_rules_set_updated_at_trg ON workforce.payroll_rules`);
    await queryRunner.query(`CREATE TRIGGER payroll_rules_set_updated_at_trg BEFORE UPDATE ON workforce.payroll_rules FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS payroll_rules_set_updated_at_trg ON workforce.payroll_rules`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS payroll_items_set_updated_at_trg ON workforce.payroll_items`);
  }
}
