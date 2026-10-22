import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { LeaveEntitlementPolicy } from './leave-entitlement-policy.entity';

@Check("leave_types_annual_allowance_check", "(annual_allowance >= (0)::numeric)")
@Check("leave_types_attachment_required_after_check", "((attachment_required_after IS NULL) OR (attachment_required_after > (0)::numeric))")
@Check("leave_types_hour_increment_minutes_check", "(hour_increment_minutes = ANY (ARRAY[15, 30, 60]))")
@Check("leave_types_hours_per_day_check", "((hours_per_day > (0)::numeric) AND (hours_per_day <= (24)::numeric))")
@Check("leave_types_min_notice_days_check", "(min_notice_days >= 0)")
@Check("leave_types_unit_check", "((unit)::text = ANY ((ARRAY['day'::character varying, 'hour'::character varying, 'both'::character varying])::text[]))")
@Unique("leave_types_organization_id_code_key", ["organizationId","code"])
@Entity({ name: 'leave_types', schema: 'workforce' })
export class LeaveType {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 100 })
  name!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('char', { name: 'color', length: 7, default: () => "'#2563EB'::bpchar" })
  color!: string;

  @Column('boolean', { name: 'is_paid', default: () => "true" })
  isPaid!: boolean;

  @Column('varchar', { name: 'unit', length: 10, default: () => "'day'::character varying" })
  unit!: string;

  @Column('numeric', { name: 'annual_allowance', nullable: true, precision: 8, scale: 2 })
  annualAllowance!: string | null;

  @Column('boolean', { name: 'tracks_balance', default: () => "true" })
  tracksBalance!: boolean;

  @Column('boolean', { name: 'allow_negative_balance', default: () => "false" })
  allowNegativeBalance!: boolean;

  @Column('boolean', { name: 'requires_attachment', default: () => "false" })
  requiresAttachment!: boolean;

  @Column('numeric', { name: 'attachment_required_after', nullable: true, precision: 8, scale: 2 })
  attachmentRequiredAfter!: string | null;

  @Column('numeric', { name: 'hours_per_day', precision: 5, scale: 2, default: () => "8" })
  hoursPerDay!: string;

  @Column('smallint', { name: 'hour_increment_minutes', default: () => "30" })
  hourIncrementMinutes!: number;

  @Column('smallint', { name: 'min_notice_days', default: () => "0" })
  minNoticeDays!: number;

  @Column('boolean', { name: 'allow_retroactive', default: () => "false" })
  allowRetroactive!: boolean;

  @Column('boolean', { name: 'requires_approval', default: () => "true" })
  requiresApproval!: boolean;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_types_organization_id_fkey' })
  organization!: Organization;

  @OneToMany(() => LeaveEntitlementPolicy, (policy) => policy.leaveType)
  entitlementPolicies!: LeaveEntitlementPolicy[];
}
