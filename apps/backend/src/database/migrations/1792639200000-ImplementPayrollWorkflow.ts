import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementPayrollWorkflow1792639200000 implements MigrationInterface {
  name = 'ImplementPayrollWorkflow1792639200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`
      ALTER TABLE workforce.employee_salary_rates
      ADD CONSTRAINT employee_salary_rates_no_overlap
      EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
      )
    `);

    await queryRunner.query(`ALTER TABLE workforce.payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_periods DROP CONSTRAINT IF EXISTS payroll_period_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_periods ALTER COLUMN status TYPE varchar(24)`);
    await queryRunner.query(`
      ALTER TABLE workforce.payroll_periods
        ADD COLUMN IF NOT EXISTS return_reason text,
        ADD COLUMN IF NOT EXISTS calculation_version integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS calculator_version varchar(30) NOT NULL DEFAULT 'payroll-v1',
        ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES workforce.users(id),
        ADD COLUMN IF NOT EXISTS published_at timestamptz,
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT payroll_period_status_check CHECK (status IN ('draft','calculating','needs_review','pending_approval','approved','returned','locked','partially_paid','paid','cancelled'))
    `);

    await queryRunner.query(`ALTER TABLE workforce.employee_payrolls DROP CONSTRAINT IF EXISTS employee_payrolls_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.employee_payrolls DROP CONSTRAINT IF EXISTS employee_payroll_status_check`);
    await queryRunner.query(`ALTER TABLE workforce.employee_payrolls ALTER COLUMN status TYPE varchar(24)`);
    await queryRunner.query(`
      ALTER TABLE workforce.employee_payrolls
        ADD COLUMN IF NOT EXISTS pay_type varchar(20),
        ADD COLUMN IF NOT EXISTS base_rate numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS paid_total numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS balance_due numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS salary_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS timesheet_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS published_at timestamptz,
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT employee_payroll_status_check CHECK (status IN ('draft','calculated','needs_review','approved','locked','partially_paid','paid','void'))
    `);

    await queryRunner.query(`ALTER TABLE workforce.payroll_items DROP CONSTRAINT IF EXISTS payroll_items_item_type_check`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_items DROP CONSTRAINT IF EXISTS payroll_items_source_check`);
    await queryRunner.query(`
      ALTER TABLE workforce.payroll_items
        ALTER COLUMN quantity TYPE numeric(14,4),
        ALTER COLUMN rate TYPE numeric(18,4),
        ADD COLUMN IF NOT EXISTS source_key varchar(160),
        ADD COLUMN IF NOT EXISTS work_date date,
        ADD COLUMN IF NOT EXISTS rule_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES workforce.users(id),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD CONSTRAINT payroll_item_type_check CHECK (item_type IN ('earning','allowance','bonus','deduction')),
        ADD CONSTRAINT payroll_item_source_check CHECK (source IN ('system','manual','import')),
        ADD CONSTRAINT payroll_item_amount_check CHECK (amount >= 0 AND quantity >= 0)
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX payroll_items_source_key_uq ON workforce.payroll_items(employee_payroll_id, source_key) WHERE source_key IS NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE workforce.payroll_payment_history
        ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'completed',
        ADD COLUMN IF NOT EXISTS reversal_of_id uuid REFERENCES workforce.payroll_payment_history(id),
        ADD CONSTRAINT payroll_payment_status_check CHECK (status IN ('completed','reversed'))
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX payroll_payment_reference_uq ON workforce.payroll_payment_history(reference_number) WHERE reference_number IS NOT NULL AND status = 'completed'`);

    await queryRunner.query(`
      CREATE TABLE workforce.payroll_rules (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES workforce.organizations(id) ON DELETE CASCADE,
        code varchar(40) NOT NULL,
        name varchar(120) NOT NULL,
        rule_type varchar(20) NOT NULL CHECK (rule_type IN ('overtime','holiday','allowance')),
        multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (multiplier >= 0),
        fixed_amount numeric(18,2) CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
        day_type varchar(30),
        priority smallint NOT NULL DEFAULT 100,
        effective_from date NOT NULL,
        effective_to date,
        is_active boolean NOT NULL DEFAULT true,
        conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by uuid REFERENCES workforce.users(id),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT payroll_rules_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
        CONSTRAINT payroll_rules_org_code_from_key UNIQUE (organization_id, code, effective_from)
      )
    `);
    await queryRunner.query(`CREATE INDEX payroll_rules_lookup_idx ON workforce.payroll_rules(organization_id, rule_type, effective_from, effective_to) WHERE is_active`);
    await queryRunner.query(`
      CREATE TABLE workforce.payroll_status_history (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        payroll_period_id uuid NOT NULL REFERENCES workforce.payroll_periods(id) ON DELETE CASCADE,
        from_status varchar(24),
        to_status varchar(24) NOT NULL,
        reason text,
        snapshot jsonb,
        actor_user_id uuid REFERENCES workforce.users(id),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX payroll_status_history_period_idx ON workforce.payroll_status_history(payroll_period_id, created_at)`);

    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('payroll.calculate', 'payroll', 'calculate', 'Tạo và tính lại bảng lương'),
        ('payroll.items.manage', 'payroll', 'items_manage', 'Quản lý khoản lương thủ công'),
        ('payroll.lock', 'payroll', 'lock', 'Khóa kỳ lương'),
        ('payroll.unlock', 'payroll', 'unlock', 'Mở khóa kỳ lương có kiểm soát'),
        ('payroll.payment.record', 'payroll', 'payment_record', 'Ghi nhận và đảo giao dịch trả lương'),
        ('payroll.export', 'payroll', 'export', 'Xuất dữ liệu tiền lương'),
        ('payroll.self.view', 'payroll', 'self_view', 'Xem phiếu lương cá nhân')
      ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN' AND p.module = 'payroll' ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['payroll.view','payroll.calculate','payroll.items.manage','payroll.approve','payroll.lock','payroll.unlock','payroll.payment.record','payroll.export']
          WHEN 'PAYROLL' THEN ARRAY['payroll.view','payroll.calculate','payroll.items.manage','payroll.approve','payroll.lock','payroll.payment.record','payroll.export']
          WHEN 'HR' THEN ARRAY['payroll.view']
          WHEN 'EMPLOYEE' THEN ARRAY['payroll.self.view']
          ELSE ARRAY[]::text[]
        END
      ) WHERE r.code IN ('ADMIN','PAYROLL','HR','EMPLOYEE') ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = ANY (ARRAY['payroll.calculate','payroll.items.manage','payroll.lock','payroll.unlock','payroll.payment.record','payroll.export','payroll.self.view'])`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.payroll_status_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.payroll_rules`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.payroll_payment_reference_uq`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_payment_history DROP CONSTRAINT IF EXISTS payroll_payment_status_check, DROP COLUMN IF EXISTS reversal_of_id, DROP COLUMN IF EXISTS status`);
    await queryRunner.query(`DROP INDEX IF EXISTS workforce.payroll_items_source_key_uq`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_items DROP CONSTRAINT IF EXISTS payroll_item_amount_check, DROP CONSTRAINT IF EXISTS payroll_item_source_check, DROP CONSTRAINT IF EXISTS payroll_item_type_check, DROP COLUMN IF EXISTS source_key, DROP COLUMN IF EXISTS work_date, DROP COLUMN IF EXISTS rule_snapshot, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS updated_at`);
    await queryRunner.query(`ALTER TABLE workforce.employee_payrolls DROP CONSTRAINT IF EXISTS employee_payroll_status_check, DROP COLUMN IF EXISTS pay_type, DROP COLUMN IF EXISTS base_rate, DROP COLUMN IF EXISTS paid_total, DROP COLUMN IF EXISTS balance_due, DROP COLUMN IF EXISTS salary_snapshot, DROP COLUMN IF EXISTS timesheet_snapshot, DROP COLUMN IF EXISTS calculation_snapshot, DROP COLUMN IF EXISTS validation_errors, DROP COLUMN IF EXISTS validation_warnings, DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS version`);
    await queryRunner.query(`ALTER TABLE workforce.employee_payrolls ADD CONSTRAINT employee_payrolls_status_check CHECK (status IN ('draft','calculated','approved','paid'))`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_periods DROP CONSTRAINT IF EXISTS payroll_period_status_check, DROP COLUMN IF EXISTS return_reason, DROP COLUMN IF EXISTS calculation_version, DROP COLUMN IF EXISTS calculator_version, DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS version`);
    await queryRunner.query(`ALTER TABLE workforce.payroll_periods ADD CONSTRAINT payroll_periods_status_check CHECK (status IN ('draft','calculating','pending_approval','approved','locked','paid'))`);
    await queryRunner.query(`ALTER TABLE workforce.employee_salary_rates DROP CONSTRAINT IF EXISTS employee_salary_rates_no_overlap`);
  }
}
