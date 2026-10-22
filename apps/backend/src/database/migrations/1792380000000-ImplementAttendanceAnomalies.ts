import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementAttendanceAnomalies1792380000000 implements MigrationInterface {
  name = 'ImplementAttendanceAnomalies1792380000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations DROP CONSTRAINT IF EXISTS attendance_violations_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations DROP CONSTRAINT IF EXISTS attendance_violations_violation_type_check`);
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations DROP CONSTRAINT IF EXISTS attendance_violations_employee_id_attendance_record_id_viol_key`);
    await queryRunner.query(`UPDATE workforce.attendance_violations SET violation_type = 'absence' WHERE violation_type = 'unauthorized_absence'`);
    await queryRunner.query(`UPDATE workforce.attendance_violations SET status = CASE WHEN status = 'waived' THEN 'excluded' ELSE 'active' END`);
    await queryRunner.query(`
      ALTER TABLE workforce.attendance_violations
        ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
        ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
        ADD COLUMN IF NOT EXISTS actual_start_at timestamptz,
        ADD COLUMN IF NOT EXISTS actual_end_at timestamptz,
        ADD COLUMN IF NOT EXISTS grace_minutes integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS calculation_version integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS first_detected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_detected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
        ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
        ADD COLUMN IF NOT EXISTS cleared_reason text,
        ADD COLUMN IF NOT EXISTS excluded_by uuid REFERENCES workforce.users(id),
        ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
        ADD COLUMN IF NOT EXISTS exclusion_reason text,
        ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
        ADD CONSTRAINT attendance_violations_status_check CHECK (status IN ('provisional', 'active', 'cleared', 'excluded')),
        ADD CONSTRAINT attendance_violations_violation_type_check CHECK (violation_type IN ('late', 'early_leave', 'missing_check_in', 'missing_check_out', 'absence', 'outside_geofence', 'insufficient_hours', 'excessive_break', 'outside_schedule'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX attendance_violations_identity_uq
      ON workforce.attendance_violations (
        employee_id,
        COALESCE(attendance_record_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(shift_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid),
        violation_type,
        violation_date
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.attendance_anomaly_settings (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES workforce.organizations(id) ON DELETE CASCADE,
        late_grace_minutes smallint NOT NULL DEFAULT 15,
        early_leave_grace_minutes smallint NOT NULL DEFAULT 0,
        insufficient_tolerance_minutes smallint NOT NULL DEFAULT 0,
        missing_check_in_reminder_minutes smallint NOT NULL DEFAULT 15,
        max_location_accuracy_m integer NOT NULL DEFAULT 100,
        late_critical_minutes smallint NOT NULL DEFAULT 60,
        early_leave_critical_minutes smallint NOT NULL DEFAULT 60,
        break_critical_minutes smallint NOT NULL DEFAULT 30,
        insufficient_critical_minutes smallint NOT NULL DEFAULT 60,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT attendance_anomaly_settings_organization_key UNIQUE (organization_id),
        CONSTRAINT attendance_anomaly_settings_values_check CHECK (late_grace_minutes >= 0 AND early_leave_grace_minutes >= 0 AND insufficient_tolerance_minutes >= 0 AND max_location_accuracy_m > 0)
      )
    `);
    await queryRunner.query(`
      INSERT INTO workforce.attendance_anomaly_settings (organization_id, late_grace_minutes, early_leave_grace_minutes)
      SELECT id, GREATEST(late_grace_minutes, 15), early_leave_grace_minutes FROM workforce.organizations
      ON CONFLICT (organization_id) DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.attendance_violation_history (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        attendance_violation_id uuid NOT NULL REFERENCES workforce.attendance_violations(id) ON DELETE CASCADE,
        event_type varchar(40) NOT NULL,
        old_values jsonb,
        new_values jsonb,
        actor_user_id uuid REFERENCES workforce.users(id),
        source varchar(20) NOT NULL DEFAULT 'system',
        reason text,
        operation_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX attendance_violation_history_violation_idx ON workforce.attendance_violation_history(attendance_violation_id, created_at)`);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('attendance_anomalies.self.view', 'attendance_anomalies', 'self_view', 'Xem bất thường chấm công cá nhân'),
        ('attendance_anomalies.view', 'attendance_anomalies', 'view', 'Xem bất thường chấm công theo phạm vi'),
        ('attendance_anomalies.details.view', 'attendance_anomalies', 'details_view', 'Xem cách tính và bằng chứng bất thường'),
        ('attendance_anomalies.location.view', 'attendance_anomalies', 'location_view', 'Xem bằng chứng vị trí chấm công'),
        ('attendance_anomalies.exclude', 'attendance_anomalies', 'exclude', 'Loại hoặc khôi phục ngoại lệ chấm công'),
        ('attendance_anomalies.config.manage', 'attendance_anomalies', 'config_manage', 'Quản lý ngưỡng phát hiện bất thường')
      ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN' AND p.module = 'attendance_anomalies'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['attendance_anomalies.view','attendance_anomalies.details.view','attendance_anomalies.location.view','attendance_anomalies.exclude','attendance_anomalies.config.manage']
          WHEN 'HR' THEN ARRAY['attendance_anomalies.view','attendance_anomalies.details.view','attendance_anomalies.location.view','attendance_anomalies.exclude']
          WHEN 'MANAGER' THEN ARRAY['attendance_anomalies.view','attendance_anomalies.details.view','attendance_anomalies.location.view']
          WHEN 'PAYROLL' THEN ARRAY['attendance_anomalies.view','attendance_anomalies.details.view']
          WHEN 'EMPLOYEE' THEN ARRAY['attendance_anomalies.self.view']
          ELSE ARRAY[]::text[]
        END
      ) WHERE r.code IN ('ADMIN','HR','MANAGER','PAYROLL','EMPLOYEE')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE module = 'attendance_anomalies'`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.attendance_violation_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.attendance_anomaly_settings`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.attendance_violations_identity_uq`);
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations DROP CONSTRAINT IF EXISTS attendance_violations_status_check, DROP CONSTRAINT IF EXISTS attendance_violations_violation_type_check`);
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations DROP COLUMN IF EXISTS source_updated_at, DROP COLUMN IF EXISTS exclusion_reason, DROP COLUMN IF EXISTS excluded_at, DROP COLUMN IF EXISTS excluded_by, DROP COLUMN IF EXISTS cleared_reason, DROP COLUMN IF EXISTS cleared_at, DROP COLUMN IF EXISTS finalized_at, DROP COLUMN IF EXISTS last_detected_at, DROP COLUMN IF EXISTS first_detected_at, DROP COLUMN IF EXISTS calculation_version, DROP COLUMN IF EXISTS calculation_snapshot, DROP COLUMN IF EXISTS grace_minutes, DROP COLUMN IF EXISTS actual_end_at, DROP COLUMN IF EXISTS actual_start_at, DROP COLUMN IF EXISTS scheduled_end_at, DROP COLUMN IF EXISTS scheduled_start_at`);
    await queryRunner.query(`UPDATE workforce.attendance_violations SET violation_type = 'unauthorized_absence' WHERE violation_type = 'absence'`);
    await queryRunner.query(`UPDATE workforce.attendance_violations SET status = CASE WHEN status = 'excluded' THEN 'waived' ELSE 'accepted' END`);
    await queryRunner.query(`ALTER TABLE workforce.attendance_violations ADD CONSTRAINT attendance_violations_status_check CHECK (status IN ('open','explained','accepted','rejected','waived')), ADD CONSTRAINT attendance_violations_violation_type_check CHECK (violation_type IN ('late','early_leave','missing_check_in','missing_check_out','unauthorized_absence','outside_geofence','insufficient_hours','excessive_break'))`);
  }
}
