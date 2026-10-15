import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ShiftAssignment } from '../../schedules/entities/shift-assignment.entity';

@Index("attendance_records_employee_date_idx", ["employeeId","workDate"])
@Check("attendance_records_break_minutes_check", "(break_minutes >= 0)")
@Check("attendance_records_check", "((actual_check_out_at IS NULL) OR (actual_check_in_at IS NULL) OR (actual_check_out_at >= actual_check_in_at))")
@Check("attendance_records_early_leave_minutes_check", "(early_leave_minutes >= 0)")
@Check("attendance_records_late_minutes_check", "(late_minutes >= 0)")
@Check("attendance_records_overtime_minutes_check", "(overtime_minutes >= 0)")
@Check("attendance_records_scheduled_minutes_check", "(scheduled_minutes >= 0)")
@Check("attendance_records_source_check", "((source)::text = ANY ((ARRAY['system'::character varying, 'manual'::character varying, 'import'::character varying])::text[]))")
@Check("attendance_records_status_check", "((status)::text = ANY ((ARRAY['open'::character varying, 'completed'::character varying, 'missing_check_in'::character varying, 'missing_check_out'::character varying, 'absent'::character varying, 'adjusted'::character varying])::text[]))")
@Check("attendance_records_worked_minutes_check", "(worked_minutes >= 0)")
@Unique("attendance_records_employee_id_shift_assignment_id_work_dat_key", ["employeeId","shiftAssignmentId","workDate"])
@Entity({ name: 'attendance_records', schema: 'workforce' })
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'shift_assignment_id', nullable: true })
  shiftAssignmentId!: string | null;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('date', { name: 'work_date' })
  workDate!: string;

  @Column('timestamptz', { name: 'actual_check_in_at', nullable: true })
  actualCheckInAt!: Date | null;

  @Column('timestamptz', { name: 'actual_check_out_at', nullable: true })
  actualCheckOutAt!: Date | null;

  @Column('integer', { name: 'scheduled_minutes', default: () => "0" })
  scheduledMinutes!: number;

  @Column('integer', { name: 'worked_minutes', default: () => "0" })
  workedMinutes!: number;

  @Column('integer', { name: 'break_minutes', default: () => "0" })
  breakMinutes!: number;

  @Column('integer', { name: 'late_minutes', default: () => "0" })
  lateMinutes!: number;

  @Column('integer', { name: 'early_leave_minutes', default: () => "0" })
  earlyLeaveMinutes!: number;

  @Column('integer', { name: 'overtime_minutes', default: () => "0" })
  overtimeMinutes!: number;

  @Column('varchar', { name: 'status', length: 25, default: () => "'open'::character varying" })
  status!: string;

  @Column('varchar', { name: 'source', length: 20, default: () => "'system'::character varying" })
  source!: string;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_records_branch_id_fkey' })
  branch!: Branch;

  @ManyToOne(() => ShiftAssignment, { nullable: true })
  @JoinColumn({ name: 'shift_assignment_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_records_shift_assignment_id_fkey' })
  shiftAssignment!: ShiftAssignment | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_records_employee_id_fkey' })
  employee!: Employee;
}
