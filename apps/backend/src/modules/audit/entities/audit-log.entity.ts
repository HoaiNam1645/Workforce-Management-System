import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';

@Index("audit_logs_actor_idx", ["actorUserId","createdAt"])
@Index("audit_logs_entity_idx", ["entityType","entityId","createdAt"])
@Entity({ name: 'audit_logs', schema: 'workforce' })
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { name: 'id', type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId!: string | null;

  @Column('varchar', { name: 'action', length: 50 })
  action!: string;

  @Column('varchar', { name: 'entity_type', length: 100 })
  entityType!: string;

  @Column('text', { name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Column('jsonb', { name: 'old_values', nullable: true })
  oldValues!: Record<string, unknown> | null;

  @Column('jsonb', { name: 'new_values', nullable: true })
  newValues!: Record<string, unknown> | null;

  @Column('inet', { name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @Column('text', { name: 'user_agent', nullable: true })
  userAgent!: string | null;

  @Column('uuid', { name: 'request_id', nullable: true })
  requestId!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'audit_logs_actor_user_id_fkey' })
  actorUser!: User | null;
}
