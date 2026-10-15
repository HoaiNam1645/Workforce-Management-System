import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { TimesheetPeriod } from './timesheet-period.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("timesheets_break_minutes_check", "(break_minutes >= 0)")
@Check("timesheets_check", "(((status)::text <> 'approved'::text) OR (approved_at IS NOT NULL))")
@Check("timesheets_check1", "(((status)::text <> 'locked'::text) OR (locked_at IS NOT NULL))")
@Check("timesheets_early_leave_minutes_check", "(early_leave_minutes >= 0)")
@Check("timesheets_late_minutes_check", "(late_minutes >= 0)")
@Check("timesheets_overtime_minutes_check", "(overtime_minutes >= 0)")
@Check("timesheets_paid_leave_minutes_check", "(paid_leave_minutes >= 0)")
@Check("timesheets_regular_minutes_check", "(regular_minutes >= 0)")
@Check("timesheets_scheduled_minutes_check", "(scheduled_minutes >= 0)")
@Check("timesheets_status_check", "((status)::text = ANY ((ARRAY['draft'::character varying, 'employee_confirmed'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'rejected'::character varying, 'locked'::character varying])::text[]))")
@Check("timesheets_unpaid_leave_minutes_check", "(unpaid_leave_minutes >= 0)")
@Check("timesheets_worked_minutes_check", "(worked_minutes >= 0)")
@Unique("timesheets_period_id_employee_id_key", ["periodId","employeeId"])
@Entity({ name: 'timesheets', schema: 'workforce' })
export class Timesheet {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'period_id' })
  periodId!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('varchar', { name: 'status', length: 25, default: () => "'draft'::character varying" })
  status!: string;

  @Column('integer', { name: 'scheduled_minutes', default: () => "0" })
  scheduledMinutes!: number;

  @Column('integer', { name: 'worked_minutes', default: () => "0" })
  workedMinutes!: number;

  @Column('integer', { name: 'break_minutes', default: () => "0" })
  breakMinutes!: number;

  @Column('integer', { name: 'regular_minutes', default: () => "0" })
  regularMinutes!: number;

  @Column('integer', { name: 'overtime_minutes', default: () => "0" })
  overtimeMinutes!: number;

  @Column('integer', { name: 'paid_leave_minutes', default: () => "0" })
  paidLeaveMinutes!: number;

  @Column('integer', { name: 'unpaid_leave_minutes', default: () => "0" })
  unpaidLeaveMinutes!: number;

  @Column('integer', { name: 'late_minutes', default: () => "0" })
  lateMinutes!: number;

  @Column('integer', { name: 'early_leave_minutes', default: () => "0" })
  earlyLeaveMinutes!: number;

  @Column('timestamptz', { name: 'submitted_at', nullable: true })
  submittedAt!: Date | null;

  @Column('uuid', { name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @Column('timestamptz', { name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  @Column('timestamptz', { name: 'locked_at', nullable: true })
  lockedAt!: Date | null;

  @Column('text', { name: 'notes', nullable: true })
  notes!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheets_approved_by_fkey' })
  approvedByUser!: User | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheets_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => TimesheetPeriod, {  })
  @JoinColumn({ name: 'period_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheets_period_id_fkey' })
  period!: TimesheetPeriod;
}
