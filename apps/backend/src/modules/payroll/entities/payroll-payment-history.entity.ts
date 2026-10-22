import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { EmployeePayroll } from './employee-payroll.entity';

@Check('payroll_payment_amount_check', 'amount > 0')
@Check('payroll_payment_status_check', "status IN ('completed','reversed')")
@Index('payroll_payment_reference_uq', ['referenceNumber'], { unique: true, where: "reference_number IS NOT NULL AND status = 'completed'" })
@Entity({ name: 'payroll_payment_history', schema: 'workforce' })
export class PayrollPaymentHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'employee_payroll_id' }) employeePayrollId!: string;
  @Column('numeric', { precision: 18, scale: 2 }) amount!: string;
  @Column('timestamptz', { name: 'paid_at' }) paidAt!: Date;
  @Column('varchar', { name: 'payment_method', nullable: true, length: 30 }) paymentMethod!: string | null;
  @Column('varchar', { name: 'reference_number', nullable: true, length: 100 }) referenceNumber!: string | null;
  @Column('varchar', { length: 20, default: 'completed' }) status!: string;
  @Column('uuid', { name: 'reversal_of_id', nullable: true }) reversalOfId!: string | null;
  @Column('text', { nullable: true }) note!: string | null;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;

  @ManyToOne(() => EmployeePayroll) @JoinColumn({ name: 'employee_payroll_id' }) employeePayroll!: EmployeePayroll;
  @ManyToOne(() => PayrollPaymentHistory, { nullable: true }) @JoinColumn({ name: 'reversal_of_id' }) reversalOf!: PayrollPaymentHistory | null;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'created_by' }) createdByUser!: User | null;
}
