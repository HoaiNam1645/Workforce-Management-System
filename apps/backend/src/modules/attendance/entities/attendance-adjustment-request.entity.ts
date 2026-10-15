import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("attendance_adjustment_requests_check", "((requested_check_in_at IS NOT NULL) OR (requested_check_out_at IS NOT NULL))")
@Check("attendance_adjustment_requests_check1", "((requested_check_out_at IS NULL) OR (requested_check_in_at IS NULL) OR (requested_check_out_at >= requested_check_in_at))")
@Check("attendance_adjustment_requests_check2", "((((status)::text = 'pending'::text) AND (reviewed_at IS NULL)) OR ((status)::text <> 'pending'::text))")
@Check("attendance_adjustment_requests_status_check", "((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))")
@Entity({ name: 'attendance_adjustment_requests', schema: 'workforce' })
export class AttendanceAdjustmentRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'attendance_record_id' })
  attendanceRecordId!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('timestamptz', { name: 'requested_check_in_at', nullable: true })
  requestedCheckInAt!: Date | null;

  @Column('timestamptz', { name: 'requested_check_out_at', nullable: true })
  requestedCheckOutAt!: Date | null;

  @Column('text', { name: 'reason' })
  reason!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'pending'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'requested_at', default: () => "CURRENT_TIMESTAMP" })
  requestedAt!: Date;

  @Column('uuid', { name: 'reviewed_by', nullable: true })
  reviewedBy!: string | null;

  @Column('timestamptz', { name: 'reviewed_at', nullable: true })
  reviewedAt!: Date | null;

  @Column('text', { name: 'review_note', nullable: true })
  reviewNote!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => AttendanceRecord, {  })
  @JoinColumn({ name: 'attendance_record_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_adjustment_requests_attendance_record_id_fkey' })
  attendanceRecord!: AttendanceRecord;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_adjustment_requests_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_adjustment_requests_reviewed_by_fkey' })
  reviewedByUser!: User | null;
}
