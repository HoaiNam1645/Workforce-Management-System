import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { EmployeePayroll } from './employee-payroll.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("payroll_payment_history_amount_check", "(amount > (0)::numeric)")
@Entity({ name: 'payroll_payment_history', schema: 'workforce' })
export class PayrollPaymentHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_payroll_id' })
  employeePayrollId!: string;

  @Column('numeric', { name: 'amount', precision: 18, scale: 2 })
  amount!: string;

  @Column('timestamptz', { name: 'paid_at' })
  paidAt!: Date;

  @Column('varchar', { name: 'payment_method', nullable: true, length: 30 })
  paymentMethod!: string | null;

  @Column('varchar', { name: 'reference_number', nullable: true, length: 100 })
  referenceNumber!: string | null;

  @Column('text', { name: 'note', nullable: true })
  note!: string | null;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => EmployeePayroll, {  })
  @JoinColumn({ name: 'employee_payroll_id', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_payment_history_employee_payroll_id_fkey' })
  employeePayroll!: EmployeePayroll;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_payment_history_created_by_fkey' })
  createdByUser!: User | null;
}
