import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { ShiftSwapRequest } from './shift-swap-request.entity';

@Entity({ name: 'shift_swap_request_history', schema: 'workforce' })
export class ShiftSwapHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'request_id' })
  requestId!: string;

  @Column('varchar', { length: 40 })
  action!: string;

  @Column('varchar', { name: 'from_status', length: 30, nullable: true })
  fromStatus!: string | null;

  @Column('varchar', { name: 'to_status', length: 30 })
  toStatus!: string;

  @Column('uuid', { name: 'acted_by', nullable: true })
  actedBy!: string | null;

  @Column('text', { nullable: true })
  note!: string | null;

  @Column('jsonb', { name: 'snapshot_data', default: () => "'{}'::jsonb" })
  snapshotData!: Record<string, unknown>;

  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @ManyToOne(() => ShiftSwapRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: ShiftSwapRequest;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'acted_by' })
  actor!: User | null;
}
