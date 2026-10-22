import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimesheetEntrySnapshots1792213300000 implements MigrationInterface {
  name = 'AddTimesheetEntrySnapshots1792213300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workforce.timesheet_entries ADD COLUMN IF NOT EXISTS snapshot_data jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workforce.timesheet_entries DROP COLUMN IF EXISTS snapshot_data`);
  }
}
