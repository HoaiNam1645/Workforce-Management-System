import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementShiftSwaps1792812000000 implements MigrationInterface {
  name = 'ImplementShiftSwaps1792812000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workforce.shift_swap_requests DROP CONSTRAINT IF EXISTS shift_swap_requests_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.shift_swap_requests ADD COLUMN IF NOT EXISTS receiver_note text, ADD COLUMN IF NOT EXISTS expires_at timestamptz`);
    await queryRunner.query(`ALTER TABLE workforce.shift_swap_requests ADD CONSTRAINT shift_swap_requests_status_check CHECK (status IN ('pending_receiver','pending_manager','approved','rejected_by_receiver','rejected_by_manager','cancelled','expired','invalidated'))`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_active_offered_uidx ON workforce.shift_swap_requests(offered_assignment_id) WHERE status IN ('pending_receiver','pending_manager')`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS shift_swap_target_status_idx ON workforce.shift_swap_requests(target_employee_id,status,created_at DESC)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS workforce.shift_swap_request_history (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), request_id uuid NOT NULL REFERENCES workforce.shift_swap_requests(id) ON DELETE CASCADE,
      action varchar(40) NOT NULL, from_status varchar(30), to_status varchar(30) NOT NULL,
      acted_by uuid REFERENCES workforce.users(id), note text, snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS shift_swap_history_request_idx ON workforce.shift_swap_request_history(request_id,created_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.shift_swap_request_history`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.shift_swap_target_status_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.shift_swap_active_offered_uidx`);
    await queryRunner.query(`ALTER TABLE workforce.shift_swap_requests DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS receiver_note`);
  }
}
