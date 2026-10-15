import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveKioskAndDeviceAttendanceMethods1791781700000 implements MigrationInterface {
  name = 'RemoveKioskAndDeviceAttendanceMethods1791781700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE workforce.attendance_events
      SET method = 'web'
      WHERE method IN ('kiosk', 'device')
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_events
      DROP CONSTRAINT attendance_events_method_check
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_events
      ADD CONSTRAINT attendance_events_method_check
      CHECK (method IN ('mobile', 'web', 'manual', 'import'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_events
      DROP CONSTRAINT attendance_events_method_check
    `);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_events
      ADD CONSTRAINT attendance_events_method_check
      CHECK (method IN ('mobile', 'web', 'kiosk', 'device', 'manual', 'import'))
    `);
  }
}
