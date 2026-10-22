import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfigureLeaveTypesAndEntitlements1792213400000 implements MigrationInterface {
  name = 'ConfigureLeaveTypesAndEntitlements1792213400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workforce.leave_types DROP CONSTRAINT IF EXISTS leave_types_unit_check`);
    await queryRunner.query(`
      ALTER TABLE workforce.leave_types
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS color char(7) NOT NULL DEFAULT '#2563EB',
        ADD COLUMN IF NOT EXISTS tracks_balance boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS attachment_required_after numeric(8,2),
        ADD COLUMN IF NOT EXISTS hours_per_day numeric(5,2) NOT NULL DEFAULT 8,
        ADD COLUMN IF NOT EXISTS hour_increment_minutes smallint NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS min_notice_days smallint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS allow_retroactive boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT true,
        ADD CONSTRAINT leave_types_unit_check CHECK (unit IN ('day', 'hour', 'both')),
        ADD CONSTRAINT leave_types_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
        ADD CONSTRAINT leave_types_hours_per_day_check CHECK (hours_per_day > 0 AND hours_per_day <= 24),
        ADD CONSTRAINT leave_types_hour_increment_minutes_check CHECK (hour_increment_minutes IN (15, 30, 60)),
        ADD CONSTRAINT leave_types_min_notice_days_check CHECK (min_notice_days >= 0),
        ADD CONSTRAINT leave_types_attachment_required_after_check CHECK (attachment_required_after IS NULL OR attachment_required_after > 0)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workforce.leave_entitlement_policies (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES workforce.organizations(id),
        leave_type_id uuid NOT NULL REFERENCES workforce.leave_types(id) ON DELETE CASCADE,
        name varchar(150) NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        accrual_method varchar(20) NOT NULL DEFAULT 'upfront' CHECK (accrual_method IN ('upfront', 'monthly', 'none')),
        allowance_amount numeric(8,2) NOT NULL DEFAULT 0 CHECK (allowance_amount >= 0),
        carryover_limit numeric(8,2) CHECK (carryover_limit IS NULL OR carryover_limit >= 0),
        max_balance numeric(8,2) CHECK (max_balance IS NULL OR max_balance >= 0),
        prorate_new_hires boolean NOT NULL DEFAULT true,
        applies_to_employment_type varchar(20) CHECK (applies_to_employment_type IS NULL OR applies_to_employment_type IN ('full_time', 'part_time')),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT leave_entitlement_policies_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS leave_entitlement_policies_type_effective_idx ON workforce.leave_entitlement_policies(leave_type_id, effective_from, effective_to)`);
    await queryRunner.query(`
      INSERT INTO workforce.leave_entitlement_policies (
        organization_id, leave_type_id, name, effective_from, accrual_method, allowance_amount, is_active
      )
      SELECT lt.organization_id, lt.id, 'Chính sách hiện tại', DATE_TRUNC('year', CURRENT_DATE)::date,
        'upfront', lt.annual_allowance, true
      FROM workforce.leave_types lt
      WHERE lt.annual_allowance IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM workforce.leave_entitlement_policies p WHERE p.leave_type_id = lt.id)
    `);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('leave_types.view', 'leave', 'view', 'Xem danh sách và cấu hình loại nghỉ'),
        ('leave_types.manage', 'leave', 'manage', 'Tạo và cập nhật loại nghỉ'),
        ('leave_entitlements.manage', 'leave', 'configure', 'Cấu hình chính sách hạn mức ngày phép')
      ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, action = EXCLUDED.action, description = EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code = 'SUPER_ADMIN' AND p.code = ANY (ARRAY['leave_types.view', 'leave_types.manage', 'leave_entitlements.manage'])
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['leave_types.view', 'leave_types.manage', 'leave_entitlements.manage']
          WHEN 'HR' THEN ARRAY['leave_types.view', 'leave_types.manage', 'leave_entitlements.manage']
          WHEN 'MANAGER' THEN ARRAY['leave_types.view']
          WHEN 'PAYROLL' THEN ARRAY['leave_types.view']
          WHEN 'EMPLOYEE' THEN ARRAY['leave_types.view']
          ELSE ARRAY[]::text[]
        END
      )
      WHERE r.code IN ('ADMIN', 'HR', 'MANAGER', 'PAYROLL', 'EMPLOYEE')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = ANY (ARRAY['leave_types.view', 'leave_types.manage', 'leave_entitlements.manage'])`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.leave_entitlement_policies`);
    await queryRunner.query(`ALTER TABLE workforce.leave_types DROP CONSTRAINT IF EXISTS leave_types_attachment_required_after_check, DROP CONSTRAINT IF EXISTS leave_types_min_notice_days_check, DROP CONSTRAINT IF EXISTS leave_types_hour_increment_minutes_check, DROP CONSTRAINT IF EXISTS leave_types_hours_per_day_check, DROP CONSTRAINT IF EXISTS leave_types_color_check, DROP CONSTRAINT IF EXISTS leave_types_unit_check`);
    await queryRunner.query(`ALTER TABLE workforce.leave_types DROP COLUMN IF EXISTS requires_approval, DROP COLUMN IF EXISTS allow_retroactive, DROP COLUMN IF EXISTS min_notice_days, DROP COLUMN IF EXISTS hour_increment_minutes, DROP COLUMN IF EXISTS hours_per_day, DROP COLUMN IF EXISTS attachment_required_after, DROP COLUMN IF EXISTS tracks_balance, DROP COLUMN IF EXISTS color, DROP COLUMN IF EXISTS description`);
    await queryRunner.query(`ALTER TABLE workforce.leave_types ADD CONSTRAINT leave_types_unit_check CHECK (unit IN ('day', 'hour'))`);
  }
}
