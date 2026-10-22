import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteTimesheetWorkflow1792213200000 implements MigrationInterface {
  name = 'CompleteTimesheetWorkflow1792213200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workforce.timesheet_adjustments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        timesheet_id uuid NOT NULL REFERENCES workforce.timesheets(id) ON DELETE CASCADE,
        source_key varchar(100) NOT NULL,
        work_date date NOT NULL,
        break_minutes integer NOT NULL CHECK (break_minutes >= 0),
        regular_minutes integer NOT NULL CHECK (regular_minutes >= 0),
        overtime_minutes integer NOT NULL CHECK (overtime_minutes >= 0),
        reason text NOT NULL,
        adjusted_by uuid NOT NULL REFERENCES workforce.users(id),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT timesheet_adjustments_timesheet_source_key_key UNIQUE (timesheet_id, source_key)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS timesheet_adjustments_timesheet_date_idx ON workforce.timesheet_adjustments(timesheet_id, work_date)`);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('timesheets.adjust', 'timesheets', 'adjust', 'Điều chỉnh và tổng hợp bảng công'),
        ('timesheets.unlock', 'timesheets', 'unlock', 'Mở khóa bảng công theo quyền'),
        ('timesheets.export', 'timesheets', 'export', 'Xuất dữ liệu bảng công')
      ON CONFLICT (code) DO UPDATE SET
        module = EXCLUDED.module,
        action = EXCLUDED.action,
        description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN' AND p.code = ANY (ARRAY['timesheets.adjust', 'timesheets.unlock', 'timesheets.export'])
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['timesheets.adjust', 'timesheets.unlock', 'timesheets.export']
          WHEN 'HR' THEN ARRAY['timesheets.adjust', 'timesheets.export']
          WHEN 'MANAGER' THEN ARRAY['timesheets.adjust', 'timesheets.export']
          WHEN 'PAYROLL' THEN ARRAY['timesheets.unlock', 'timesheets.export']
          ELSE ARRAY[]::text[]
        END
      )
      WHERE r.code IN ('ADMIN', 'HR', 'MANAGER', 'PAYROLL')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = ANY (ARRAY['timesheets.adjust', 'timesheets.unlock', 'timesheets.export'])`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.timesheet_adjustments`);
  }
}
