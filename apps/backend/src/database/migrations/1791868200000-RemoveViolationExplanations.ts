import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveViolationExplanations1791868200000 implements MigrationInterface {
  name = 'RemoveViolationExplanations1791868200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS workforce.violation_explanations');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workforce.violation_explanations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        violation_id uuid NOT NULL REFERENCES workforce.attendance_violations(id),
        employee_id uuid NOT NULL REFERENCES workforce.employees(id),
        explanation text NOT NULL,
        attachment_url text,
        status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        submitted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by uuid REFERENCES workforce.users(id),
        reviewed_at timestamptz,
        review_note text
      )
    `);
  }
}
