import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementLeaveBalancesAndRequests1792213500000 implements MigrationInterface {
  name = 'ImplementLeaveBalancesAndRequests1792213500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`
      ALTER TABLE workforce.leave_balances
        ADD COLUMN IF NOT EXISTS reserved_amount numeric(8,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS expired_amount numeric(8,2) NOT NULL DEFAULT 0,
        ADD CONSTRAINT leave_balances_reserved_amount_check CHECK (reserved_amount >= 0),
        ADD CONSTRAINT leave_balances_expired_amount_check CHECK (expired_amount >= 0)
    `);
    await queryRunner.query(`ALTER TABLE workforce.leave_balance_transactions DROP CONSTRAINT IF EXISTS leave_balance_transactions_transaction_type_check`);
    await queryRunner.query(`
      ALTER TABLE workforce.leave_balance_transactions
        ADD COLUMN IF NOT EXISTS balance_before numeric(8,2),
        ADD COLUMN IF NOT EXISTS balance_after numeric(8,2),
        ADD COLUMN IF NOT EXISTS effective_date date NOT NULL DEFAULT CURRENT_DATE,
        ADD CONSTRAINT leave_balance_transactions_transaction_type_check
          CHECK (transaction_type IN ('opening', 'accrual', 'reservation', 'release', 'usage', 'refund', 'adjustment', 'expiry'))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_balance_transactions_request_type_uq
      ON workforce.leave_balance_transactions(leave_request_id, transaction_type)
      WHERE leave_request_id IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE workforce.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_status_check`);
    await queryRunner.query(`
      ALTER TABLE workforce.leave_requests
        ADD COLUMN IF NOT EXISTS request_mode varchar(20) NOT NULL DEFAULT 'full_day',
        ADD COLUMN IF NOT EXISTS day_part varchar(20),
        ADD COLUMN IF NOT EXISTS unit_snapshot varchar(10) NOT NULL DEFAULT 'day',
        ADD COLUMN IF NOT EXISTS is_paid_snapshot boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS hours_per_day_snapshot numeric(5,2) NOT NULL DEFAULT 8,
        ADD COLUMN IF NOT EXISTS balance_year smallint,
        ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES workforce.users(id),
        ADD CONSTRAINT leave_requests_request_mode_check CHECK (request_mode IN ('full_day', 'half_day', 'hourly')),
        ADD CONSTRAINT leave_requests_day_part_check CHECK (day_part IS NULL OR day_part IN ('first_half', 'second_half')),
        ADD CONSTRAINT leave_requests_status_check CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled'))
    `);
    await queryRunner.query(`UPDATE workforce.leave_requests SET balance_year = EXTRACT(YEAR FROM starts_at)::smallint WHERE balance_year IS NULL`);
    await queryRunner.query(`ALTER TABLE workforce.leave_requests ALTER COLUMN balance_year SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE workforce.leave_requests
      ADD CONSTRAINT leave_requests_no_overlap
      EXCLUDE USING gist (
        employee_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      ) WHERE (status IN ('pending', 'approved'))
    `);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('leave_balances.view', 'leave', 'view_balances', 'Xem số dư phép trong phạm vi được giao'),
        ('leave_balances.adjust', 'leave', 'adjust_balances', 'Điều chỉnh tăng hoặc giảm số dư phép'),
        ('leave_balances.self.view', 'leave', 'view_self_balance', 'Xem số dư phép cá nhân'),
        ('leave_requests.view', 'leave', 'view_requests', 'Xem danh sách yêu cầu nghỉ phép')
      ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN' AND p.code = ANY (ARRAY['leave_balances.view', 'leave_balances.adjust', 'leave_balances.self.view', 'leave_requests.view'])
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['leave_balances.view', 'leave_balances.adjust', 'leave_requests.view']
          WHEN 'HR' THEN ARRAY['leave_balances.view', 'leave_balances.adjust', 'leave_requests.view']
          WHEN 'MANAGER' THEN ARRAY['leave_balances.view', 'leave_requests.view']
          WHEN 'PAYROLL' THEN ARRAY['leave_balances.view', 'leave_requests.view']
          WHEN 'EMPLOYEE' THEN ARRAY['leave_balances.self.view']
          ELSE ARRAY[]::text[]
        END
      )
      WHERE r.code IN ('ADMIN', 'HR', 'MANAGER', 'PAYROLL', 'EMPLOYEE')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = ANY (ARRAY['leave_balances.view', 'leave_balances.adjust', 'leave_balances.self.view', 'leave_requests.view'])`);
    await queryRunner.query(`ALTER TABLE workforce.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_no_overlap, DROP CONSTRAINT IF EXISTS leave_requests_day_part_check, DROP CONSTRAINT IF EXISTS leave_requests_request_mode_check, DROP CONSTRAINT IF EXISTS leave_requests_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.leave_requests DROP COLUMN IF EXISTS requested_by, DROP COLUMN IF EXISTS balance_year, DROP COLUMN IF EXISTS hours_per_day_snapshot, DROP COLUMN IF EXISTS is_paid_snapshot, DROP COLUMN IF EXISTS unit_snapshot, DROP COLUMN IF EXISTS day_part, DROP COLUMN IF EXISTS request_mode`);
    await queryRunner.query(`ALTER TABLE workforce.leave_requests ADD CONSTRAINT leave_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.leave_balance_transactions_request_type_uq`);
    await queryRunner.query(`ALTER TABLE workforce.leave_balance_transactions DROP CONSTRAINT IF EXISTS leave_balance_transactions_transaction_type_check, DROP COLUMN IF EXISTS effective_date, DROP COLUMN IF EXISTS balance_after, DROP COLUMN IF EXISTS balance_before`);
    await queryRunner.query(`ALTER TABLE workforce.leave_balance_transactions ADD CONSTRAINT leave_balance_transactions_transaction_type_check CHECK (transaction_type IN ('opening', 'accrual', 'usage', 'refund', 'adjustment', 'expiry'))`);
    await queryRunner.query(`ALTER TABLE workforce.leave_balances DROP CONSTRAINT IF EXISTS leave_balances_expired_amount_check, DROP CONSTRAINT IF EXISTS leave_balances_reserved_amount_check, DROP COLUMN IF EXISTS expired_amount, DROP COLUMN IF EXISTS reserved_amount`);
  }
}
