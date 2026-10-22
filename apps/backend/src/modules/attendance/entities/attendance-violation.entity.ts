import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ShiftAssignment } from '../../schedules/entities/shift-assignment.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("attendance_violations_minutes_affected_check", "(minutes_affected >= 0)")
@Check("attendance_violations_severity_check", "((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[]))")
@Check("attendance_violations_status_check", "((status)::text = ANY ((ARRAY['provisional'::character varying, 'active'::character varying, 'cleared'::character varying, 'excluded'::character varying])::text[]))")
@Check("attendance_violations_violation_type_check", "((violation_type)::text = ANY ((ARRAY['late'::character varying, 'early_leave'::character varying, 'missing_check_in'::character varying, 'missing_check_out'::character varying, 'absence'::character varying, 'outside_geofence'::character varying, 'insufficient_hours'::character varying, 'excessive_break'::character varying, 'outside_schedule'::character varying])::text[]))")
@Unique("attendance_violations_employee_id_attendance_record_id_viol_key", ["employeeId","attendanceRecordId","violationType","violationDate"])
@Entity({ name: 'attendance_violations', schema: 'workforce' })
export class AttendanceViolation {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'attendance_record_id', nullable: true })
  attendanceRecordId!: string | null;

  @Column('uuid', { name: 'shift_assignment_id', nullable: true })
  shiftAssignmentId!: string | null;

  @Column('varchar', { name: 'violation_type', length: 30 })
  violationType!: string;

  @Column('date', { name: 'violation_date' })
  violationDate!: string;

  @Column('integer', { name: 'minutes_affected', default: () => "0" })
  minutesAffected!: number;

  @Column('varchar', { name: 'severity', length: 15, default: () => "'warning'::character varying" })
  severity!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'open'::character varying" })
  status!: string;

  @Column('text', { name: 'details', nullable: true })
  details!: string | null;

  @Column('timestamptz', { name: 'scheduled_start_at', nullable: true })
  scheduledStartAt!: Date | null;

  @Column('timestamptz', { name: 'scheduled_end_at', nullable: true })
  scheduledEndAt!: Date | null;

  @Column('timestamptz', { name: 'actual_start_at', nullable: true })
  actualStartAt!: Date | null;

  @Column('timestamptz', { name: 'actual_end_at', nullable: true })
  actualEndAt!: Date | null;

  @Column('integer', { name: 'grace_minutes', default: () => '0' })
  graceMinutes!: number;

  @Column('jsonb', { name: 'calculation_snapshot', default: () => "'{}'::jsonb" })
  calculationSnapshot!: Record<string, unknown>;

  @Column('integer', { name: 'calculation_version', default: () => '1' })
  calculationVersion!: number;

  @Column('timestamptz', { name: 'first_detected_at', default: () => 'CURRENT_TIMESTAMP' })
  firstDetectedAt!: Date;

  @Column('timestamptz', { name: 'last_detected_at', default: () => 'CURRENT_TIMESTAMP' })
  lastDetectedAt!: Date;

  @Column('timestamptz', { name: 'finalized_at', nullable: true })
  finalizedAt!: Date | null;

  @Column('timestamptz', { name: 'cleared_at', nullable: true })
  clearedAt!: Date | null;

  @Column('text', { name: 'cleared_reason', nullable: true })
  clearedReason!: string | null;

  @Column('uuid', { name: 'excluded_by', nullable: true })
  excludedBy!: string | null;

  @Column('timestamptz', { name: 'excluded_at', nullable: true })
  excludedAt!: Date | null;

  @Column('text', { name: 'exclusion_reason', nullable: true })
  exclusionReason!: string | null;

  @Column('timestamptz', { name: 'source_updated_at', nullable: true })
  sourceUpdatedAt!: Date | null;

  @Column('timestamptz', { name: 'detected_at', default: () => "CURRENT_TIMESTAMP" })
  detectedAt!: Date;

  @Column('uuid', { name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @Column('timestamptz', { name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column('text', { name: 'resolution_note', nullable: true })
  resolutionNote!: string | null;

  @ManyToOne(() => AttendanceRecord, { nullable: true })
  @JoinColumn({ name: 'attendance_record_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violations_attendance_record_id_fkey' })
  attendanceRecord!: AttendanceRecord | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violations_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violations_resolved_by_fkey' })
  resolvedByUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'excluded_by', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violations_excluded_by_fkey' })
  excludedByUser!: User | null;

  @ManyToOne(() => ShiftAssignment, { nullable: true })
  @JoinColumn({ name: 'shift_assignment_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violations_shift_assignment_id_fkey' })
  shiftAssignment!: ShiftAssignment | null;
}
