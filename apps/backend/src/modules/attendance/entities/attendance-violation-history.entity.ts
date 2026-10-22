import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { AttendanceViolation } from './attendance-violation.entity';

@Index('attendance_violation_history_violation_idx', ['attendanceViolationId', 'createdAt'])
@Entity({ name: 'attendance_violation_history', schema: 'workforce' })
export class AttendanceViolationHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'attendance_violation_id' })
  attendanceViolationId!: string;

  @Column('varchar', { name: 'event_type', length: 40 })
  eventType!: string;

  @Column('jsonb', { name: 'old_values', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column('jsonb', { name: 'new_values', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @Column('varchar', { name: 'source', length: 20, default: () => "'system'" })
  source!: string;

  @Column('text', { name: 'reason', nullable: true })
  reason!: string | null;

  @Column('uuid', { name: 'operation_id' })
  operationId!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => AttendanceViolation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_violation_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violation_history_violation_id_fkey' })
  attendanceViolation!: AttendanceViolation;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'attendance_violation_history_actor_user_id_fkey' })
  actorUser!: User | null;
}
