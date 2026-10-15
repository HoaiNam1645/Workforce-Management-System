import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'notification_preferences', schema: 'workforce' })
export class NotificationPreference {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId!: string;

  @PrimaryColumn('varchar', { name: 'event_type', length: 50 })
  eventType!: string;

  @Column('boolean', { name: 'in_app_enabled', default: () => "true" })
  inAppEnabled!: boolean;

  @Column('boolean', { name: 'email_enabled', default: () => "false" })
  emailEnabled!: boolean;

  @Column('boolean', { name: 'push_enabled', default: () => "true" })
  pushEnabled!: boolean;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'notification_preferences_user_id_fkey' })
  user!: User;
}
