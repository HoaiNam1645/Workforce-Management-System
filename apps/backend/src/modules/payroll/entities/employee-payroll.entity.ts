import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, VersionColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Timesheet } from '../../timesheets/entities/timesheet.entity';
import { PayrollPeriod } from './payroll-period.entity';

@Check('employee_payroll_status_check', "status IN ('draft','calculated','needs_review','approved','locked','partially_paid','paid','void')")
@Check('employee_payroll_money_check', 'base_salary >= 0 AND regular_pay >= 0 AND overtime_pay >= 0 AND holiday_pay >= 0 AND allowance_total >= 0 AND bonus_total >= 0 AND deduction_total >= 0 AND gross_pay >= 0 AND net_pay >= 0 AND paid_total >= 0 AND balance_due >= 0')
@Unique('employee_payrolls_payroll_period_id_employee_id_key', ['payrollPeriodId', 'employeeId'])
@Entity({ name: 'employee_payrolls', schema: 'workforce' })
export class EmployeePayroll {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'payroll_period_id' }) payrollPeriodId!: string;
  @Column('uuid', { name: 'employee_id' }) employeeId!: string;
  @Column('uuid', { name: 'timesheet_id', nullable: true }) timesheetId!: string | null;
  @Column('char', { name: 'currency_code', length: 3, default: 'VND' }) currencyCode!: string;
  @Column('varchar', { name: 'pay_type', length: 20, nullable: true }) payType!: string | null;
  @Column('numeric', { name: 'base_rate', precision: 18, scale: 2, default: 0 }) baseRate!: string;
  @Column('numeric', { name: 'base_salary', precision: 18, scale: 2, default: 0 }) baseSalary!: string;
  @Column('numeric', { name: 'regular_pay', precision: 18, scale: 2, default: 0 }) regularPay!: string;
  @Column('numeric', { name: 'overtime_pay', precision: 18, scale: 2, default: 0 }) overtimePay!: string;
  @Column('numeric', { name: 'holiday_pay', precision: 18, scale: 2, default: 0 }) holidayPay!: string;
  @Column('numeric', { name: 'allowance_total', precision: 18, scale: 2, default: 0 }) allowanceTotal!: string;
  @Column('numeric', { name: 'bonus_total', precision: 18, scale: 2, default: 0 }) bonusTotal!: string;
  @Column('numeric', { name: 'deduction_total', precision: 18, scale: 2, default: 0 }) deductionTotal!: string;
  @Column('numeric', { name: 'gross_pay', precision: 18, scale: 2, default: 0 }) grossPay!: string;
  @Column('numeric', { name: 'net_pay', precision: 18, scale: 2, default: 0 }) netPay!: string;
  @Column('numeric', { name: 'paid_total', precision: 18, scale: 2, default: 0 }) paidTotal!: string;
  @Column('numeric', { name: 'balance_due', precision: 18, scale: 2, default: 0 }) balanceDue!: string;
  @Column('varchar', { length: 24, default: 'draft' }) status!: string;
  @Column('jsonb', { name: 'salary_snapshot', nullable: true }) salarySnapshot!: Record<string, unknown> | null;
  @Column('jsonb', { name: 'timesheet_snapshot', nullable: true }) timesheetSnapshot!: Record<string, unknown> | null;
  @Column('jsonb', { name: 'calculation_snapshot', nullable: true }) calculationSnapshot!: Record<string, unknown> | null;
  @Column('jsonb', { name: 'validation_errors', default: () => "'[]'::jsonb" }) validationErrors!: string[];
  @Column('jsonb', { name: 'validation_warnings', default: () => "'[]'::jsonb" }) validationWarnings!: string[];
  @Column('timestamptz', { name: 'calculated_at', nullable: true }) calculatedAt!: Date | null;
  @Column('timestamptz', { name: 'published_at', nullable: true }) publishedAt!: Date | null;
  @Column('timestamptz', { name: 'paid_at', nullable: true }) paidAt!: Date | null;
  @VersionColumn({ name: 'version' }) version!: number;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' }) updatedAt!: Date;

  @ManyToOne(() => Timesheet, { nullable: true }) @JoinColumn({ name: 'timesheet_id' }) timesheet!: Timesheet | null;
  @ManyToOne(() => PayrollPeriod, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'payroll_period_id' }) payrollPeriod!: PayrollPeriod;
  @ManyToOne(() => Employee) @JoinColumn({ name: 'employee_id' }) employee!: Employee;
}
