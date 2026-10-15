import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Employee } from './employee.entity';
import { Position } from '../../organization/entities/position.entity';
import { User } from '../../access-control/entities/user.entity';

@Index("employee_work_history_current_uq", ["employeeId"], { unique: true, where: "(effective_to IS NULL)" })
@Check("employee_work_history_check", "((effective_to IS NULL) OR (effective_to >= effective_from))")
@Check("employee_work_history_employment_type_check", "((employment_type)::text = ANY ((ARRAY['full_time'::character varying, 'part_time'::character varying])::text[]))")
@Entity({ name: 'employee_work_history', schema: 'workforce' })
export class EmployeeWorkHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('uuid', { name: 'department_id' })
  departmentId!: string;

  @Column('uuid', { name: 'position_id' })
  positionId!: string;

  @Column('uuid', { name: 'manager_id', nullable: true })
  managerId!: string | null;

  @Column('varchar', { name: 'employment_type', length: 20 })
  employmentType!: string;

  @Column('date', { name: 'effective_from' })
  effectiveFrom!: string;

  @Column('date', { name: 'effective_to', nullable: true })
  effectiveTo!: string | null;

  @Column('text', { name: 'reason', nullable: true })
  reason!: string | null;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => Position, {  })
  @JoinColumn({ name: 'position_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_position_id_fkey' })
  position!: Position;

  @ManyToOne(() => Department, {  })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_department_id_fkey' })
  department!: Department;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_branch_id_fkey' })
  branch!: Branch;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_manager_id_fkey' })
  manager!: Employee | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_work_history_created_by_fkey' })
  createdByUser!: User | null;
}
