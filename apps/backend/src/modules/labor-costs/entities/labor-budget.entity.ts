import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("labor_budgets_budget_amount_check", "(budget_amount >= (0)::numeric)")
@Check("labor_budgets_check", "(ends_on >= starts_on)")
@Check("labor_budgets_warning_threshold_percent_check", "((warning_threshold_percent >= (0)::numeric) AND (warning_threshold_percent <= (1000)::numeric))")
@Unique("labor_budgets_branch_id_department_id_starts_on_ends_on_key", ["branchId","departmentId","startsOn","endsOn"])
@Entity({ name: 'labor_budgets', schema: 'workforce' })
export class LaborBudget {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('uuid', { name: 'department_id', nullable: true })
  departmentId!: string | null;

  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  @Column('date', { name: 'ends_on' })
  endsOn!: string;

  @Column('numeric', { name: 'budget_amount', precision: 18, scale: 2 })
  budgetAmount!: string;

  @Column('char', { name: 'currency_code', length: 3, default: () => "'VND'::bpchar" })
  currencyCode!: string;

  @Column('numeric', { name: 'warning_threshold_percent', precision: 5, scale: 2, default: () => "90" })
  warningThresholdPercent!: string;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'labor_budgets_department_id_fkey' })
  department!: Department | null;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'labor_budgets_branch_id_fkey' })
  branch!: Branch;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'labor_budgets_created_by_fkey' })
  createdByUser!: User | null;
}
