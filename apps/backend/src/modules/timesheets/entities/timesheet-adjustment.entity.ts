import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from '../../access-control/entities/user.entity';
import { Timesheet } from './timesheet.entity';

@Index('timesheet_adjustments_timesheet_date_idx', ['timesheetId', 'workDate'])
@Unique('timesheet_adjustments_timesheet_source_key_key', ['timesheetId', 'sourceKey'])
@Check('timesheet_adjustments_break_minutes_check', '(break_minutes >= 0)')
@Check('timesheet_adjustments_regular_minutes_check', '(regular_minutes >= 0)')
@Check('timesheet_adjustments_overtime_minutes_check', '(overtime_minutes >= 0)')
@Entity({ name: 'timesheet_adjustments', schema: 'workforce' })
export class TimesheetAdjustment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'timesheet_id' })
  timesheetId!: string;

  @Column('varchar', { name: 'source_key', length: 100 })
  sourceKey!: string;

  @Column('date', { name: 'work_date' })
  workDate!: string;

  @Column('integer', { name: 'break_minutes' })
  breakMinutes!: number;

  @Column('integer', { name: 'regular_minutes' })
  regularMinutes!: number;

  @Column('integer', { name: 'overtime_minutes' })
  overtimeMinutes!: number;

  @Column('text', { name: 'reason' })
  reason!: string;

  @Column('uuid', { name: 'adjusted_by' })
  adjustedBy!: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @ManyToOne(() => Timesheet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timesheet_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_adjustments_timesheet_id_fkey' })
  timesheet!: Timesheet;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'adjusted_by', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_adjustments_adjusted_by_fkey' })
  adjustedByUser!: User;
}
