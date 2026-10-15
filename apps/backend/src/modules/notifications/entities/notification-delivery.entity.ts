import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Notification } from './notification.entity';

@Check("notification_deliveries_channel_check", "((channel)::text = ANY ((ARRAY['in_app'::character varying, 'email'::character varying, 'push'::character varying])::text[]))")
@Check("notification_deliveries_retry_count_check", "(retry_count >= 0)")
@Check("notification_deliveries_status_check", "((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'delivered'::character varying, 'failed'::character varying])::text[]))")
@Unique("notification_deliveries_notification_id_channel_key", ["notificationId","channel"])
@Entity({ name: 'notification_deliveries', schema: 'workforce' })
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'notification_id' })
  notificationId!: string;

  @Column('varchar', { name: 'channel', length: 10 })
  channel!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'pending'::character varying" })
  status!: string;

  @Column('varchar', { name: 'provider_message_id', nullable: true, length: 255 })
  providerMessageId!: string | null;

  @Column('timestamptz', { name: 'attempted_at', nullable: true })
  attemptedAt!: Date | null;

  @Column('timestamptz', { name: 'delivered_at', nullable: true })
  deliveredAt!: Date | null;

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage!: string | null;

  @Column('smallint', { name: 'retry_count', default: () => "0" })
  retryCount!: number;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id', referencedColumnName: 'id', foreignKeyConstraintName: 'notification_deliveries_notification_id_fkey' })
  notification!: Notification;
}
