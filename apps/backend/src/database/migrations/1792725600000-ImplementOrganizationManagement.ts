import { MigrationInterface, QueryRunner } from "typeorm";

export class ImplementOrganizationManagement1792725600000
  implements MigrationInterface
{
  name = "ImplementOrganizationManagement1792725600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workforce.branches
        ADD COLUMN IF NOT EXISTS ward varchar(120),
        ADD COLUMN IF NOT EXISTS district varchar(120),
        ADD COLUMN IF NOT EXISTS province varchar(120),
        ADD COLUMN IF NOT EXISTS country_code varchar(2) NOT NULL DEFAULT 'VN',
        ADD COLUMN IF NOT EXISTS postal_code varchar(20),
        ADD COLUMN IF NOT EXISTS branch_type varchar(30) NOT NULL DEFAULT 'office',
        ADD COLUMN IF NOT EXISTS geofence_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS location_accuracy_m integer NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
        ADD CONSTRAINT branches_type_check CHECK (branch_type IN ('head_office','office','store','factory','warehouse','project_site','other')),
        ADD CONSTRAINT branches_geofence_config_check CHECK (NOT geofence_enabled OR (latitude IS NOT NULL AND longitude IS NOT NULL AND geofence_radius_m BETWEEN 20 AND 5000)),
        ADD CONSTRAINT branches_accuracy_check CHECK (location_accuracy_m BETWEEN 1 AND 5000)
    `);
    await queryRunner.query(
      `UPDATE workforce.branches SET geofence_enabled = (latitude IS NOT NULL AND longitude IS NOT NULL), branch_type = CASE WHEN is_head_office THEN 'head_office' ELSE branch_type END`,
    );
    await queryRunner.query(`
      ALTER TABLE workforce.branch_departments
        ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT CURRENT_DATE,
        ADD COLUMN IF NOT EXISTS effective_to date,
        ADD CONSTRAINT branch_departments_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.branch_operating_hours (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), branch_id uuid NOT NULL REFERENCES workforce.branches(id) ON DELETE CASCADE,
        day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), is_closed boolean NOT NULL DEFAULT false,
        opens_at time, closes_at time, spans_next_day boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT branch_operating_hours_branch_day_key UNIQUE (branch_id, day_of_week),
        CONSTRAINT branch_operating_hours_time_check CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      INSERT INTO workforce.branch_operating_hours (branch_id, day_of_week, is_closed, opens_at, closes_at)
      SELECT b.id, d.day, CASE WHEN d.day IN (0,6) THEN true ELSE false END,
        CASE WHEN d.day IN (0,6) THEN NULL ELSE COALESCE(b.opening_time, '08:00') END,
        CASE WHEN d.day IN (0,6) THEN NULL ELSE COALESCE(b.closing_time, '17:00') END
      FROM workforce.branches b CROSS JOIN generate_series(0,6) d(day)
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.branch_operating_exceptions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), branch_id uuid NOT NULL REFERENCES workforce.branches(id) ON DELETE CASCADE,
        exception_date date NOT NULL, is_closed boolean NOT NULL DEFAULT true, opens_at time, closes_at time,
        spans_next_day boolean NOT NULL DEFAULT false, name varchar(150) NOT NULL, note text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT branch_operating_exceptions_branch_date_key UNIQUE (branch_id, exception_date),
        CONSTRAINT branch_operating_exceptions_time_check CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.branch_manager_assignments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), branch_id uuid NOT NULL REFERENCES workforce.branches(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES workforce.employees(id), responsibility varchar(120) NOT NULL DEFAULT 'Quản lý chi nhánh',
        is_primary boolean NOT NULL DEFAULT false, effective_from date NOT NULL, effective_to date,
        created_by uuid REFERENCES workforce.users(id), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT branch_manager_assignment_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX branch_manager_primary_current_uq ON workforce.branch_manager_assignments(branch_id) WHERE is_primary AND effective_to IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX branch_manager_active_idx ON workforce.branch_manager_assignments(branch_id, effective_from, effective_to)`,
    );
    await queryRunner.query(`
      CREATE TABLE workforce.department_positions (
        department_id uuid NOT NULL REFERENCES workforce.departments(id) ON DELETE CASCADE,
        position_id uuid NOT NULL REFERENCES workforce.positions(id) ON DELETE CASCADE,
        is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (department_id, position_id)
      )
    `);
    await queryRunner.query(
      `CREATE TRIGGER branch_operating_hours_set_updated_at_trg BEFORE UPDATE ON workforce.branch_operating_hours FOR EACH ROW EXECUTE FUNCTION workforce.set_updated_at()`,
    );

    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description) VALUES
        ('organization.view', 'organization', 'view', 'Xem thông tin doanh nghiệp và cơ cấu tổ chức'),
        ('branches.view', 'organization', 'branches_view', 'Xem danh sách và chi tiết chi nhánh'),
        ('branches.manage', 'organization', 'branches_manage', 'Tạo, sửa và ngừng hoạt động chi nhánh'),
        ('branches.geofence.manage', 'organization', 'geofence_manage', 'Quản lý GPS và geofence chi nhánh'),
        ('branches.operating_hours.manage', 'organization', 'operating_hours_manage', 'Quản lý giờ hoạt động chi nhánh'),
        ('branches.managers.manage', 'organization', 'managers_manage', 'Quản lý người phụ trách chi nhánh'),
        ('branches.scope.manage', 'organization', 'scope_manage', 'Quản lý phạm vi truy cập theo chi nhánh'),
        ('departments.view', 'organization', 'departments_view', 'Xem phòng ban và cơ cấu tổ chức'),
        ('departments.manage', 'organization', 'departments_manage', 'Quản lý phòng ban và cơ cấu'),
        ('positions.view', 'organization', 'positions_view', 'Xem danh sách vị trí công việc'),
        ('positions.manage', 'organization', 'positions_manage', 'Quản lý vị trí công việc')
      ON CONFLICT (code) DO UPDATE SET module=EXCLUDED.module, action=EXCLUDED.action, description=EXCLUDED.description
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r CROSS JOIN workforce.permissions p
      WHERE r.code='SUPER_ADMIN' AND p.module='organization' ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO workforce.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM workforce.roles r JOIN workforce.permissions p ON p.code = ANY (
        CASE r.code
          WHEN 'ADMIN' THEN ARRAY['organization.view','branches.view','branches.manage','branches.geofence.manage','branches.operating_hours.manage','branches.managers.manage','branches.scope.manage','departments.view','departments.manage','positions.view','positions.manage']
          WHEN 'HR' THEN ARRAY['organization.view','branches.view','departments.view','departments.manage','positions.view','positions.manage']
          WHEN 'MANAGER' THEN ARRAY['organization.view','branches.view','departments.view','positions.view']
          WHEN 'PAYROLL' THEN ARRAY['organization.view','branches.view','departments.view','positions.view']
          ELSE ARRAY[]::text[]
        END
      ) WHERE r.code IN ('ADMIN','HR','MANAGER','PAYROLL') ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM workforce.permissions WHERE module='organization'`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS workforce.department_positions`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS workforce.branch_manager_assignments`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS workforce.branch_operating_exceptions`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS workforce.branch_operating_hours`,
    );
    await queryRunner.query(
      `ALTER TABLE workforce.branch_departments DROP CONSTRAINT IF EXISTS branch_departments_dates_check, DROP COLUMN IF EXISTS effective_from, DROP COLUMN IF EXISTS effective_to`,
    );
    await queryRunner.query(
      `ALTER TABLE workforce.branches DROP CONSTRAINT IF EXISTS branches_type_check, DROP CONSTRAINT IF EXISTS branches_geofence_config_check, DROP CONSTRAINT IF EXISTS branches_accuracy_check, DROP COLUMN IF EXISTS ward, DROP COLUMN IF EXISTS district, DROP COLUMN IF EXISTS province, DROP COLUMN IF EXISTS country_code, DROP COLUMN IF EXISTS postal_code, DROP COLUMN IF EXISTS branch_type, DROP COLUMN IF EXISTS geofence_enabled, DROP COLUMN IF EXISTS location_accuracy_m, DROP COLUMN IF EXISTS notes, DROP COLUMN IF EXISTS version`,
    );
  }
}
