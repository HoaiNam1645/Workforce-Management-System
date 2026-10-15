import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("timesheet_periods_check", "(ends_on >= starts_on)")
@Check("timesheet_periods_check1", "(((status)::text <> 'locked'::text) OR (locked_at IS NOT NULL))")
@Check("timesheet_periods_status_check", "((status)::text = ANY ((ARRAY['open'::character varying, 'processing'::character varying, 'locked'::character varying])::text[]))")
@Unique("timesheet_periods_organization_id_starts_on_ends_on_key", ["organizationId","startsOn","endsOn"])
@Entity({ name: 'timesheet_periods', schema: 'workforce' })
export class TimesheetPeriod {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'name', length: 100 })
  name!: string;

  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  @Column('date', { name: 'ends_on' })
  endsOn!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'open'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'locked_at', nullable: true })
  lockedAt!: Date | null;

  @Column('uuid', { name: 'locked_by', nullable: true })
  lockedBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'locked_by', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_periods_locked_by_fkey' })
  lockedByUser!: User | null;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'timesheet_periods_organization_id_fkey' })
  organization!: Organization;
}
