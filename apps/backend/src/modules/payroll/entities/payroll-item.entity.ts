import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { EmployeePayroll } from './employee-payroll.entity';

@Check('payroll_item_type_check', "item_type IN ('earning','allowance','bonus','deduction')")
@Check('payroll_item_source_check', "source IN ('system','manual','import')")
@Check('payroll_item_amount_check', 'amount >= 0 AND quantity >= 0')
@Index('payroll_items_source_key_uq', ['employeePayrollId', 'sourceKey'], { unique: true, where: 'source_key IS NOT NULL' })
@Entity({ name: 'payroll_items', schema: 'workforce' })
export class PayrollItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'employee_payroll_id' }) employeePayrollId!: string;
  @Column('varchar', { name: 'item_type', length: 20 }) itemType!: string;
  @Column('varchar', { length: 50 }) code!: string;
  @Column('varchar', { length: 255 }) description!: string;
  @Column('numeric', { precision: 14, scale: 4, default: 1 }) quantity!: string;
  @Column('numeric', { nullable: true, precision: 18, scale: 4 }) rate!: string | null;
  @Column('numeric', { precision: 18, scale: 2 }) amount!: string;
  @Column('boolean', { name: 'is_taxable', default: true }) isTaxable!: boolean;
  @Column('varchar', { length: 20, default: 'system' }) source!: string;
  @Column('varchar', { name: 'source_key', length: 160, nullable: true }) sourceKey!: string | null;
  @Column('date', { name: 'work_date', nullable: true }) workDate!: string | null;
  @Column('jsonb', { name: 'rule_snapshot', nullable: true }) ruleSnapshot!: Record<string, unknown> | null;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' }) updatedAt!: Date;

  @ManyToOne(() => EmployeePayroll, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'employee_payroll_id' }) employeePayroll!: EmployeePayroll;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'created_by' }) createdByUser!: User | null;
}
