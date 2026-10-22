import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { Branch } from '../../organization/entities/branch.entity';
import { ShiftAssignment } from '../../schedules/entities/shift-assignment.entity';

@Index('attendance_clock_attempts_employee_date_idx', ['employeeId', 'workDate', 'attemptedAt'])
@Index('attendance_clock_attempts_assignment_idx', ['shiftAssignmentId', 'attemptedAt'])
@Check('attendance_clock_attempts_event_type_check', "event_type IN ('check_in', 'check_out', 'break_start', 'break_end')")
@Check('attendance_clock_attempts_rejection_reason_check', "rejection_reason IN ('outside_geofence')")
@Entity({ name: 'attendance_clock_attempts', schema: 'workforce' })
export class AttendanceClockAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'shift_assignment_id', nullable: true })
  shiftAssignmentId!: string | null;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('date', { name: 'work_date' })
  workDate!: string;

  @Column('varchar', { name: 'event_type', length: 20 })
  eventType!: string;

  @Column('timestamptz', { name: 'attempted_at' })
  attemptedAt!: Date;

  @Column('varchar', { name: 'method', length: 20 })
  method!: string;

  @Column('varchar', { name: 'rejection_reason', length: 40 })
  rejectionReason!: string;

  @Column('text', { name: 'rejection_message' })
  rejectionMessage!: string;

  @Column('varchar', { name: 'device_id', nullable: true, length: 255 })
  deviceId!: string | null;

  @Column('inet', { name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column('numeric', { name: 'latitude', precision: 10, scale: 7 })
  latitude!: string;

  @Column('numeric', { name: 'longitude', precision: 10, scale: 7 })
  longitude!: string;

  @Column('numeric', { name: 'location_accuracy_m', nullable: true, precision: 8, scale: 2 })
  locationAccuracyM!: string | null;

  @Column('numeric', { name: 'distance_from_branch_m', precision: 10, scale: 2 })
  distanceFromBranchM!: string;

  @Column('integer', { name: 'geofence_radius_m' })
  geofenceRadiusM!: number;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id', foreignKeyConstraintName: 'attendance_clock_attempts_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => ShiftAssignment, { nullable: true })
  @JoinColumn({ name: 'shift_assignment_id', foreignKeyConstraintName: 'attendance_clock_attempts_shift_assignment_id_fkey' })
  shiftAssignment!: ShiftAssignment | null;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id', foreignKeyConstraintName: 'attendance_clock_attempts_branch_id_fkey' })
  branch!: Branch;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'attendance_clock_attempts_created_by_fkey' })
  createdByUser!: User | null;
}
