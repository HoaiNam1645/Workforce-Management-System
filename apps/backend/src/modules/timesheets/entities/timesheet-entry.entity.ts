import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AttendanceRecord } from '../../attendance/entities/attendance-record.entity';
import { Timesheet } from './timesheet.entity';

@Check("timesheet_entries_break_minutes_check", "(break_minutes >= 0)")
@Check("timesheet_entries_entry_type_check", "((entry_type)::text = ANY ((ARRAY['work'::character varying, 'paid_leave'::character varying, 'unpaid_leave'::character varying, 'holiday'::character varying, 'adjustment'::character varying])::text[]))")
@Check("timesheet_entries_overtime_minutes_check", "(overtime_minutes >= 0)")
@Check("timesheet_entries_regular_minutes_check", "(regular_minutes >= 0)")
@Check("timesheet_entries_scheduled_minutes_check", "(scheduled_minutes >= 0)")
@Check("timesheet_entries_worked_minutes_check", "(worked_minutes >= 0)")
@Unique("timesheet_entries_timesheet_id_attendance_record_id_work_da_key", ["timesheetId","attendanceRecordId","workDate","entryType"])
@Entity({ name: 'timesheet_entries', schema: 'workforce' })
export class TimesheetEntry {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'timesheet_id' })
  timesheetId!: string;

  @Column('uuid', { name: 'attendance_record_id', nullable: true })
  attendanceRecordId!: string | null;

  @Column('date', { name: 'work_date' })
  workDate!: string;

  @Column('varchar', { name: 'entry_type', length: 20 })
  entryType!: string;

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

  @Column('text', { name: 'note', nullable: true })
  note!: string | null;

  @Column('jsonb', { name: 'snapshot_data', nullable: true })
  snapshotData!: Record<string, unknown>[] | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => AttendanceRecord, { nullable: true })
  @JoinColumn({ name: 'attendance_record_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_entries_attendance_record_id_fkey' })
  attendanceRecord!: AttendanceRecord | null;

  @ManyToOne(() => Timesheet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timesheet_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_entries_timesheet_id_fkey' })
  timesheet!: Timesheet;
}
