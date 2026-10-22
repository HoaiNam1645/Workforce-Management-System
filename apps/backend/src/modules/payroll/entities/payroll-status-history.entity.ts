import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { PayrollPeriod } from './payroll-period.entity';

@Entity({ name: 'payroll_status_history', schema: 'workforce' })
export class PayrollStatusHistory {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'payroll_period_id' }) payrollPeriodId!: string;
  @Column('varchar', { name: 'from_status', length: 24, nullable: true }) fromStatus!: string | null;
  @Column('varchar', { name: 'to_status', length: 24 }) toStatus!: string;
  @Column('text', { nullable: true }) reason!: string | null;
  @Column('jsonb', { nullable: true }) snapshot!: Record<string, unknown> | null;
  @Column('uuid', { name: 'actor_user_id', nullable: true }) actorUserId!: string | null;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @ManyToOne(() => PayrollPeriod, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'payroll_period_id' }) payrollPeriod!: PayrollPeriod;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'actor_user_id' }) actorUser!: User | null;
}
