import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from './leave-type.entity';

@Check("leave_balances_balance_year_check", "((balance_year >= 2000) AND (balance_year <= 2200))")
@Check("leave_balances_used_amount_check", "(used_amount >= (0)::numeric)")
@Unique("leave_balances_employee_id_leave_type_id_balance_year_key", ["employeeId","leaveTypeId","balanceYear"])
@Entity({ name: 'leave_balances', schema: 'workforce' })
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'leave_type_id' })
  leaveTypeId!: string;

  @Column('smallint', { name: 'balance_year' })
  balanceYear!: number;

  @Column('numeric', { name: 'opening_amount', precision: 8, scale: 2, default: () => "0" })
  openingAmount!: string;

  @Column('numeric', { name: 'accrued_amount', precision: 8, scale: 2, default: () => "0" })
  accruedAmount!: string;

  @Column('numeric', { name: 'used_amount', precision: 8, scale: 2, default: () => "0" })
  usedAmount!: string;

  @Column('numeric', { name: 'reserved_amount', precision: 8, scale: 2, default: () => "0" })
  reservedAmount!: string;

  @Column('numeric', { name: 'expired_amount', precision: 8, scale: 2, default: () => "0" })
  expiredAmount!: string;

  @Column('numeric', { name: 'adjusted_amount', precision: 8, scale: 2, default: () => "0" })
  adjustedAmount!: string;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => LeaveType, {  })
  @JoinColumn({ name: 'leave_type_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_balances_leave_type_id_fkey' })
  leaveType!: LeaveType;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_balances_employee_id_fkey' })
  employee!: Employee;
}
