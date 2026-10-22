import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, VersionColumn } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Check('payroll_period_dates_check', '(ends_on >= starts_on)')
@Check('payroll_period_payment_date_check', '((payment_date IS NULL) OR (payment_date >= ends_on))')
@Check('payroll_period_status_check', "status IN ('draft','calculating','needs_review','pending_approval','approved','returned','locked','partially_paid','paid','cancelled')")
@Unique('payroll_periods_organization_id_code_key', ['organizationId', 'code'])
@Entity({ name: 'payroll_periods', schema: 'workforce' })
export class PayrollPeriod {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'organization_id' }) organizationId!: string;
  @Column('varchar', { length: 30 }) code!: string;
  @Column('varchar', { length: 100 }) name!: string;
  @Column('date', { name: 'starts_on' }) startsOn!: string;
  @Column('date', { name: 'ends_on' }) endsOn!: string;
  @Column('date', { name: 'payment_date', nullable: true }) paymentDate!: string | null;
  @Column('varchar', { length: 24, default: 'draft' }) status!: string;
  @Column('text', { name: 'return_reason', nullable: true }) returnReason!: string | null;
  @Column('integer', { name: 'calculation_version', default: 0 }) calculationVersion!: number;
  @Column('varchar', { name: 'calculator_version', length: 30, default: 'payroll-v1' }) calculatorVersion!: string;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column('timestamptz', { name: 'approved_at', nullable: true }) approvedAt!: Date | null;
  @Column('uuid', { name: 'locked_by', nullable: true }) lockedBy!: string | null;
  @Column('timestamptz', { name: 'locked_at', nullable: true }) lockedAt!: Date | null;
  @Column('timestamptz', { name: 'published_at', nullable: true }) publishedAt!: Date | null;
  @VersionColumn({ name: 'version' }) version!: number;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' }) updatedAt!: Date;

  @ManyToOne(() => Organization) @JoinColumn({ name: 'organization_id' }) organization!: Organization;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'created_by' }) createdByUser!: User | null;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'approved_by' }) approvedByUser!: User | null;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'locked_by' }) lockedByUser!: User | null;
}
