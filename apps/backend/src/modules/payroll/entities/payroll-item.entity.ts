import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { EmployeePayroll } from './employee-payroll.entity';

@Check("payroll_items_item_type_check", "((item_type)::text = ANY ((ARRAY['earning'::character varying, 'allowance'::character varying, 'bonus'::character varying, 'deduction'::character varying])::text[]))")
@Check("payroll_items_source_check", "((source)::text = ANY ((ARRAY['system'::character varying, 'manual'::character varying, 'import'::character varying])::text[]))")
@Entity({ name: 'payroll_items', schema: 'workforce' })
export class PayrollItem {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_payroll_id' })
  employeePayrollId!: string;

  @Column('varchar', { name: 'item_type', length: 20 })
  itemType!: string;

  @Column('varchar', { name: 'code', length: 50 })
  code!: string;

  @Column('varchar', { name: 'description', length: 255 })
  description!: string;

  @Column('numeric', { name: 'quantity', precision: 12, scale: 2, default: () => "1" })
  quantity!: string;

  @Column('numeric', { name: 'rate', nullable: true, precision: 18, scale: 2 })
  rate!: string | null;

  @Column('numeric', { name: 'amount', precision: 18, scale: 2 })
  amount!: string;

  @Column('boolean', { name: 'is_taxable', default: () => "true" })
  isTaxable!: boolean;

  @Column('varchar', { name: 'source', length: 20, default: () => "'system'::character varying" })
  source!: string;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => EmployeePayroll, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_payroll_id', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_items_employee_payroll_id_fkey' })
  employeePayroll!: EmployeePayroll;
}
