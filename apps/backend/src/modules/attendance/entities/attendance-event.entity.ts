import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { User } from '../../access-control/entities/user.entity';

@Index("attendance_events_record_time_idx", ["attendanceRecordId","occurredAt"])
@Check("attendance_events_check", "((latitude IS NULL) = (longitude IS NULL))")
@Check("attendance_events_distance_from_branch_m_check", "(distance_from_branch_m >= (0)::numeric)")
@Check("attendance_events_event_type_check", "((event_type)::text = ANY ((ARRAY['check_in'::character varying, 'check_out'::character varying, 'break_start'::character varying, 'break_end'::character varying])::text[]))")
@Check("attendance_events_latitude_check", "((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))")
@Check("attendance_events_location_accuracy_m_check", "(location_accuracy_m >= (0)::numeric)")
@Check("attendance_events_longitude_check", "((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))")
@Check("attendance_events_method_check", "((method)::text = ANY ((ARRAY['mobile'::character varying, 'web'::character varying, 'manual'::character varying, 'import'::character varying])::text[]))")
@Entity({ name: 'attendance_events', schema: 'workforce' })
export class AttendanceEvent {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'attendance_record_id' })
  attendanceRecordId!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('varchar', { name: 'event_type', length: 20 })
  eventType!: string;

  @Column('timestamptz', { name: 'occurred_at' })
  occurredAt!: Date;

  @Column('timestamptz', { name: 'received_at', default: () => "CURRENT_TIMESTAMP" })
  receivedAt!: Date;

  @Column('varchar', { name: 'method', length: 20 })
  method!: string;

  @Column('varchar', { name: 'device_id', nullable: true, length: 255 })
  deviceId!: string | null;

  @Column('inet', { name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column('numeric', { name: 'latitude', nullable: true, precision: 10, scale: 7 })
  latitude!: string | null;

  @Column('numeric', { name: 'longitude', nullable: true, precision: 10, scale: 7 })
  longitude!: string | null;

  @Column('numeric', { name: 'location_accuracy_m', nullable: true, precision: 8, scale: 2 })
  locationAccuracyM!: string | null;

  @Column('numeric', { name: 'distance_from_branch_m', nullable: true, precision: 10, scale: 2 })
  distanceFromBranchM!: string | null;

  @Column('boolean', { name: 'is_within_geofence', nullable: true })
  isWithinGeofence!: boolean | null;

  @Column('text', { name: 'photo_url', nullable: true })
  photoUrl!: string | null;

  @Column('text', { name: 'note', nullable: true })
  note!: string | null;

  @Column('jsonb', { name: 'metadata', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_events_created_by_fkey' })
  createdByUser!: User | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_events_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => AttendanceRecord, {  })
  @JoinColumn({ name: 'attendance_record_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_events_attendance_record_id_fkey' })
  attendanceRecord!: AttendanceRecord;
}
