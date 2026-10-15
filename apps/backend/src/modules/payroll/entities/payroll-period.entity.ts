import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("payroll_periods_check", "(ends_on >= starts_on)")
@Check("payroll_periods_check1", "((payment_date IS NULL) OR (payment_date >= ends_on))")
@Check("payroll_periods_check2", "(((status)::text <> 'locked'::text) OR (locked_at IS NOT NULL))")
@Check("payroll_periods_status_check", "((status)::text = ANY ((ARRAY['draft'::character varying, 'calculating'::character varying, 'pending_approval'::character varying, 'approved'::character varying, 'locked'::character varying, 'paid'::character varying])::text[]))")
@Unique("payroll_periods_organization_id_code_key", ["organizationId","code"])
@Entity({ name: 'payroll_periods', schema: 'workforce' })
export class PayrollPeriod {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 100 })
  name!: string;

  @Column('date', { name: 'starts_on' })
  startsOn!: string;

  @Column('date', { name: 'ends_on' })
  endsOn!: string;

  @Column('date', { name: 'payment_date', nullable: true })
  paymentDate!: string | null;

  @Column('varchar', { name: 'status', length: 20, default: () => "'draft'::character varying" })
  status!: string;

  @Column('uuid', { name: 'approved_by', nullable: true })
  approvedBy!: string | null;

  @Column('timestamptz', { name: 'approved_at', nullable: true })
  approvedAt!: Date | null;

  @Column('uuid', { name: 'locked_by', nullable: true })
  lockedBy!: string | null;

  @Column('timestamptz', { name: 'locked_at', nullable: true })
  lockedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_periods_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_periods_approved_by_fkey' })
  approvedByUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'locked_by', referencedColumnName: 'id', foreignKeyConstraintName: 'payroll_periods_locked_by_fkey' })
  lockedByUser!: User | null;
}
