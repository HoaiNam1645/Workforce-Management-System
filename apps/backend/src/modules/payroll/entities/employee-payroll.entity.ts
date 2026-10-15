import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { PayrollPeriod } from './payroll-period.entity';
import { Timesheet } from '../../timesheets/entities/timesheet.entity';

@Check("employee_payrolls_allowance_total_check", "(allowance_total >= (0)::numeric)")
@Check("employee_payrolls_base_salary_check", "(base_salary >= (0)::numeric)")
@Check("employee_payrolls_bonus_total_check", "(bonus_total >= (0)::numeric)")
@Check("employee_payrolls_deduction_total_check", "(deduction_total >= (0)::numeric)")
@Check("employee_payrolls_gross_pay_check", "(gross_pay >= (0)::numeric)")
@Check("employee_payrolls_holiday_pay_check", "(holiday_pay >= (0)::numeric)")
@Check("employee_payrolls_net_pay_check", "(net_pay >= (0)::numeric)")
@Check("employee_payrolls_overtime_pay_check", "(overtime_pay >= (0)::numeric)")
@Check("employee_payrolls_regular_pay_check", "(regular_pay >= (0)::numeric)")
@Check("employee_payrolls_status_check", "((status)::text = ANY ((ARRAY['draft'::character varying, 'calculated'::character varying, 'approved'::character varying, 'paid'::character varying])::text[]))")
@Unique("employee_payrolls_payroll_period_id_employee_id_key", ["payrollPeriodId","employeeId"])
@Entity({ name: 'employee_payrolls', schema: 'workforce' })
export class EmployeePayroll {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'payroll_period_id' })
  payrollPeriodId!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'timesheet_id', nullable: true })
  timesheetId!: string | null;

  @Column('char', { name: 'currency_code', length: 3, default: () => "'VND'::bpchar" })
  currencyCode!: string;

  @Column('numeric', { name: 'base_salary', precision: 18, scale: 2, default: () => "0" })
  baseSalary!: string;

  @Column('numeric', { name: 'regular_pay', precision: 18, scale: 2, default: () => "0" })
  regularPay!: string;

  @Column('numeric', { name: 'overtime_pay', precision: 18, scale: 2, default: () => "0" })
  overtimePay!: string;

  @Column('numeric', { name: 'holiday_pay', precision: 18, scale: 2, default: () => "0" })
  holidayPay!: string;

  @Column('numeric', { name: 'allowance_total', precision: 18, scale: 2, default: () => "0" })
  allowanceTotal!: string;

  @Column('numeric', { name: 'bonus_total', precision: 18, scale: 2, default: () => "0" })
  bonusTotal!: string;

  @Column('numeric', { name: 'deduction_total', precision: 18, scale: 2, default: () => "0" })
  deductionTotal!: string;

  @Column('numeric', { name: 'gross_pay', precision: 18, scale: 2, default: () => "0" })
  grossPay!: string;

  @Column('numeric', { name: 'net_pay', precision: 18, scale: 2, default: () => "0" })
  netPay!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'draft'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'calculated_at', nullable: true })
  calculatedAt!: Date | null;

  @Column('timestamptz', { name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Timesheet, { nullable: true })
  @JoinColumn({ name: 'timesheet_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_payrolls_timesheet_id_fkey' })
  timesheet!: Timesheet | null;

  @ManyToOne(() => PayrollPeriod, {  })
  @JoinColumn({ name: 'payroll_period_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_payrolls_payroll_period_id_fkey' })
  payrollPeriod!: PayrollPeriod;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_payrolls_employee_id_fkey' })
  employee!: Employee;
}
