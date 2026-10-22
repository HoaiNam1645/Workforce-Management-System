import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTasksAndCompliance1792552800000 implements MigrationInterface {
  name = 'RemoveTasksAndCompliance1792552800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.task_attachments`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.task_comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.task_checklist_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.task_assignees`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.tasks`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.policy_acknowledgements`);
    await queryRunner.query(`DROP TABLE IF EXISTS workforce.policies`);
    await queryRunner.query(`DELETE FROM workforce.permissions WHERE code = 'tasks.manage' OR module IN ('tasks', 'compliance')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workforce.tasks (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        title varchar(255) NOT NULL,
        description text,
        branch_id uuid REFERENCES workforce.branches(id),
        department_id uuid REFERENCES workforce.departments(id),
        related_shift_id uuid REFERENCES workforce.shifts(id),
        priority varchar(15) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status varchar(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'submitted', 'completed', 'cancelled')),
        starts_at timestamptz,
        due_at timestamptz,
        progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
        created_by uuid NOT NULL REFERENCES workforce.users(id),
        completed_at timestamptz,
        confirmed_by uuid REFERENCES workforce.users(id),
        confirmed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at timestamptz,
        CHECK (due_at IS NULL OR starts_at IS NULL OR due_at >= starts_at),
        CHECK (status <> 'completed' OR completed_at IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.task_assignees (
        task_id uuid NOT NULL REFERENCES workforce.tasks(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES workforce.employees(id),
        assigned_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        assigned_by uuid REFERENCES workforce.users(id),
        PRIMARY KEY (task_id, employee_id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.task_checklist_items (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id uuid NOT NULL REFERENCES workforce.tasks(id) ON DELETE CASCADE,
        content varchar(500) NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        is_completed boolean NOT NULL DEFAULT false,
        completed_by uuid REFERENCES workforce.users(id),
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.task_comments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id uuid NOT NULL REFERENCES workforce.tasks(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES workforce.users(id),
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.task_attachments (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        task_id uuid NOT NULL REFERENCES workforce.tasks(id) ON DELETE CASCADE,
        uploaded_by uuid NOT NULL REFERENCES workforce.users(id),
        file_name varchar(255) NOT NULL,
        file_url text NOT NULL,
        mime_type varchar(100),
        file_size_bytes bigint CHECK (file_size_bytes >= 0),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.policies (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES workforce.organizations(id),
        title varchar(255) NOT NULL,
        version varchar(30) NOT NULL,
        content text,
        file_url text,
        effective_on date NOT NULL,
        expires_on date,
        requires_acknowledgement boolean NOT NULL DEFAULT true,
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        published_at timestamptz,
        published_by uuid REFERENCES workforce.users(id),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (organization_id, title, version),
        CHECK (expires_on IS NULL OR expires_on >= effective_on),
        CHECK (status <> 'published' OR published_at IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE workforce.policy_acknowledgements (
        policy_id uuid NOT NULL REFERENCES workforce.policies(id),
        employee_id uuid NOT NULL REFERENCES workforce.employees(id),
        acknowledged_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address inet,
        PRIMARY KEY (policy_id, employee_id)
      )
    `);
    await queryRunner.query(`
      INSERT INTO workforce.permissions (code, module, action, description)
      VALUES ('tasks.manage', 'tasks', 'manage', 'Quản lý và giao công việc')
      ON CONFLICT (code) DO NOTHING
    `);
  }
}
