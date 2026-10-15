import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';

@Index("notifications_user_unread_idx", ["userId","createdAt"], { where: "(read_at IS NULL)" })
@Entity({ name: 'notifications', schema: 'workforce' })
export class Notification {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { name: 'event_type', length: 50 })
  eventType!: string;

  @Column('varchar', { name: 'title', length: 255 })
  title!: string;

  @Column('text', { name: 'message' })
  message!: string;

  @Column('jsonb', { name: 'data', default: () => "'{}'::jsonb" })
  data!: Record<string, unknown>;

  @Column('text', { name: 'action_url', nullable: true })
  actionUrl!: string | null;

  @Column('timestamptz', { name: 'read_at', nullable: true })
  readAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'notifications_user_id_fkey' })
  user!: User;
}
