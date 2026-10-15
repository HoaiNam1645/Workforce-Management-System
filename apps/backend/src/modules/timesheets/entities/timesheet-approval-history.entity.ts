import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Timesheet } from './timesheet.entity';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'timesheet_approval_history', schema: 'workforce' })
export class TimesheetApprovalHistory {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'timesheet_id' })
  timesheetId!: string;

  @Column('varchar', { name: 'from_status', nullable: true, length: 25 })
  fromStatus!: string | null;

  @Column('varchar', { name: 'to_status', length: 25 })
  toStatus!: string;

  @Column('uuid', { name: 'action_by' })
  actionBy!: string;

  @Column('text', { name: 'note', nullable: true })
  note!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => Timesheet, {  })
  @JoinColumn({ name: 'timesheet_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_approval_history_timesheet_id_fkey' })
  timesheet!: Timesheet;

  @ManyToOne(() => User, {  })
  @JoinColumn({ name: 'action_by', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_approval_history_action_by_fkey' })
  actionByUser!: User;
}
