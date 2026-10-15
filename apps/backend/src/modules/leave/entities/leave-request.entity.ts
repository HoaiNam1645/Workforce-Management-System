import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from './leave-type.entity';
import { User } from '../../access-control/entities/user.entity';

@Index("leave_requests_employee_time_idx", ["employeeId","startsAt","endsAt"])
@Index("leave_requests_status_idx", ["status","requestedAt"])
@Check("leave_requests_check", "(ends_at > starts_at)")
@Check("leave_requests_check1", "(((status)::text <> 'approved'::text) OR (reviewed_at IS NOT NULL))")
@Check("leave_requests_check2", "(((status)::text <> 'rejected'::text) OR (reviewed_at IS NOT NULL))")
@Check("leave_requests_requested_amount_check", "(requested_amount > (0)::numeric)")
@Check("leave_requests_status_check", "((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))")
@Entity({ name: 'leave_requests', schema: 'workforce' })
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('uuid', { name: 'leave_type_id' })
  leaveTypeId!: string;

  @Column('timestamptz', { name: 'starts_at' })
  startsAt!: Date;

  @Column('timestamptz', { name: 'ends_at' })
  endsAt!: Date;

  @Column('numeric', { name: 'requested_amount', precision: 8, scale: 2 })
  requestedAmount!: string;

  @Column('text', { name: 'reason', nullable: true })
  reason!: string | null;

  @Column('text', { name: 'attachment_url', nullable: true })
  attachmentUrl!: string | null;

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

  @Column('timestamptz', { name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_requests_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_requests_reviewed_by_fkey' })
  reviewedByUser!: User | null;

  @ManyToOne(() => LeaveType, {  })
  @JoinColumn({ name: 'leave_type_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_requests_leave_type_id_fkey' })
  leaveType!: LeaveType;
}
