import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordRejectedClockAttempts1792466400000 implements MigrationInterface {
  name = 'RecordRejectedClockAttempts1792466400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workforce.attendance_clock_attempts (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        employee_id uuid NOT NULL REFERENCES workforce.employees(id) ON DELETE CASCADE,
        shift_assignment_id uuid REFERENCES workforce.shift_assignments(id) ON DELETE SET NULL,
        branch_id uuid NOT NULL REFERENCES workforce.branches(id),
        work_date date NOT NULL,
        event_type varchar(20) NOT NULL CHECK (event_type IN ('check_in', 'check_out', 'break_start', 'break_end')),
        attempted_at timestamptz NOT NULL,
        method varchar(20) NOT NULL CHECK (method IN ('mobile', 'web')),
        rejection_reason varchar(40) NOT NULL CHECK (rejection_reason IN ('outside_geofence')),
        rejection_message text NOT NULL,
        device_id varchar(255),
        ip_address inet,
        latitude numeric(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude numeric(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        location_accuracy_m numeric(8,2) CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
        distance_from_branch_m numeric(10,2) NOT NULL CHECK (distance_from_branch_m >= 0),
        geofence_radius_m integer NOT NULL CHECK (geofence_radius_m > 0),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid REFERENCES workforce.users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX attendance_clock_attempts_employee_date_idx ON workforce.attendance_clock_attempts(employee_id, work_date, attempted_at)`);
    await queryRunner.query(`CREATE INDEX attendance_clock_attempts_assignment_idx ON workforce.attendance_clock_attempts(shift_assignment_id, attempted_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.attendance_clock_attempts`);
  }
}
