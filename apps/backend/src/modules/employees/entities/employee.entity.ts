import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Organization } from '../../core/entities/organization.entity';
import { Position } from '../../organization/entities/position.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("employees_check", "((manager_id IS NULL) OR (manager_id <> id))")
@Check("employees_check1", "((termination_date IS NULL) OR (termination_date >= hire_date))")
@Check("employees_check2", "(((employment_status)::text <> 'terminated'::text) OR (termination_date IS NOT NULL))")
@Check("employees_employment_status_check", "((employment_status)::text = ANY ((ARRAY['active'::character varying, 'on_leave'::character varying, 'terminated'::character varying])::text[]))")
@Check("employees_employment_type_check", "((employment_type)::text = ANY ((ARRAY['full_time'::character varying, 'part_time'::character varying])::text[]))")
@Check("employees_gender_check", "((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying, 'undisclosed'::character varying])::text[]))")
@Unique("employees_organization_id_employee_code_key", ["organizationId","employeeCode"])
@Unique("employees_user_id_key", ["userId"])
@Entity({ name: 'employees', schema: 'workforce' })
export class Employee {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('uuid', { name: 'user_id', nullable: true })
  userId!: string | null;

  @Column('varchar', { name: 'employee_code', length: 30 })
  employeeCode!: string;

  @Column('varchar', { name: 'first_name', length: 80 })
  firstName!: string;

  @Column('varchar', { name: 'last_name', length: 80 })
  lastName!: string;

  @Column('varchar', { name: 'preferred_name', nullable: true, length: 150 })
  preferredName!: string | null;

  @Column('date', { name: 'date_of_birth', nullable: true })
  dateOfBirth!: string | null;

  @Column('varchar', { name: 'gender', nullable: true, length: 20 })
  gender!: string | null;

  @Column('varchar', { name: 'personal_email', nullable: true, length: 255 })
  personalEmail!: string | null;

  @Column('varchar', { name: 'work_email', nullable: true, length: 255 })
  workEmail!: string | null;

  @Column('varchar', { name: 'phone', nullable: true, length: 30 })
  phone!: string | null;

  @Column('text', { name: 'address', nullable: true })
  address!: string | null;

  @Column('varchar', { name: 'emergency_contact_name', nullable: true, length: 150 })
  emergencyContactName!: string | null;

  @Column('varchar', { name: 'emergency_contact_phone', nullable: true, length: 30 })
  emergencyContactPhone!: string | null;

  @Column('varchar', { name: 'emergency_contact_relationship', nullable: true, length: 50 })
  emergencyContactRelationship!: string | null;

  @Column('varchar', { name: 'employment_type', length: 20 })
  employmentType!: string;

  @Column('varchar', { name: 'employment_status', length: 20, default: () => "'active'::character varying" })
  employmentStatus!: string;

  @Column('date', { name: 'hire_date' })
  hireDate!: string;

  @Column('date', { name: 'termination_date', nullable: true })
  terminationDate!: string | null;

  @Column('text', { name: 'termination_reason', nullable: true })
  terminationReason!: string | null;

  @Column('uuid', { name: 'primary_branch_id' })
  primaryBranchId!: string;

  @Column('uuid', { name: 'department_id' })
  departmentId!: string;

  @Column('uuid', { name: 'position_id' })
  positionId!: string;

  @Column('uuid', { name: 'manager_id', nullable: true })
  managerId!: string | null;

  @Column('text', { name: 'avatar_url', nullable: true })
  avatarUrl!: string | null;

  @Column('text', { name: 'notes', nullable: true })
  notes!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'primary_branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_primary_branch_id_fkey' })
  primaryBranch!: Branch;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_user_id_fkey' })
  user!: User | null;

  @ManyToOne(() => Department, {  })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_department_id_fkey' })
  department!: Department;

  @ManyToOne(() => Position, {  })
  @JoinColumn({ name: 'position_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_position_id_fkey' })
  position!: Position;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employees_manager_id_fkey' })
  manager!: Employee | null;
}
