import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExcessiveBreakViolation1791868300000 implements MigrationInterface {
  name = 'AddExcessiveBreakViolation1791868300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_violations
      DROP CONSTRAINT attendance_violations_violation_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_violations
      ADD CONSTRAINT attendance_violations_violation_type_check
      CHECK (violation_type IN ('late', 'early_leave', 'missing_check_in',
        'missing_check_out', 'unauthorized_absence', 'outside_geofence',
        'insufficient_hours', 'excessive_break'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM workforce.attendance_violations
      WHERE violation_type = 'excessive_break'
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_violations
      DROP CONSTRAINT attendance_violations_violation_type_check
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_violations
      ADD CONSTRAINT attendance_violations_violation_type_check
      CHECK (violation_type IN ('late', 'early_leave', 'missing_check_in',
        'missing_check_out', 'unauthorized_absence', 'outside_geofence',
        'insufficient_hours'))
    `);
  }
}
