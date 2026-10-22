import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { ShiftAssignment } from './shift-assignment.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("shift_swap_requests_check", "((target_employee_id IS NULL) OR (target_employee_id <> requester_id))")
@Check("shift_swap_requests_check1", "(((request_type)::text <> 'swap'::text) OR (requested_assignment_id IS NOT NULL))")
@Check("shift_swap_requests_request_type_check", "((request_type)::text = ANY ((ARRAY['swap'::character varying, 'give_away'::character varying])::text[]))")
@Check("shift_swap_requests_status_check", "((status)::text = ANY ((ARRAY['pending_receiver'::character varying, 'pending_manager'::character varying, 'approved'::character varying, 'rejected_by_receiver'::character varying, 'rejected_by_manager'::character varying, 'cancelled'::character varying, 'expired'::character varying, 'invalidated'::character varying])::text[]))")
@Entity({ name: 'shift_swap_requests', schema: 'workforce' })
export class ShiftSwapRequest {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'requester_id' })
  requesterId!: string;

  @Column('uuid', { name: 'offered_assignment_id' })
  offeredAssignmentId!: string;

  @Column('uuid', { name: 'target_employee_id', nullable: true })
  targetEmployeeId!: string | null;

  @Column('uuid', { name: 'requested_assignment_id', nullable: true })
  requestedAssignmentId!: string | null;

  @Column('varchar', { name: 'request_type', length: 20 })
  requestType!: string;

  @Column('text', { name: 'reason', nullable: true })
  reason!: string | null;

  @Column('varchar', { name: 'status', length: 25, default: () => "'pending_receiver'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'receiver_responded_at', nullable: true })
  receiverRespondedAt!: Date | null;

  @Column('text', { name: 'receiver_note', nullable: true })
  receiverNote!: string | null;

  @Column('timestamptz', { name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

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

  @ManyToOne(() => ShiftAssignment, {  })
  @JoinColumn({ name: 'offered_assignment_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_swap_requests_offered_assignment_id_fkey' })
  offeredAssignment!: ShiftAssignment;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'requester_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_swap_requests_requester_id_fkey' })
  requester!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_swap_requests_reviewed_by_fkey' })
  reviewedByUser!: User | null;

  @ManyToOne(() => ShiftAssignment, { nullable: true })
  @JoinColumn({ name: 'requested_assignment_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_swap_requests_requested_assignment_id_fkey' })
  requestedAssignment!: ShiftAssignment | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'target_employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_swap_requests_target_employee_id_fkey' })
  targetEmployee!: Employee | null;
}
