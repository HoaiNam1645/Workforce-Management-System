import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { LeaveType } from './leave-type.entity';

@Index('leave_entitlement_policies_type_effective_idx', ['leaveTypeId', 'effectiveFrom', 'effectiveTo'])
@Check('leave_entitlement_policies_accrual_method_check', "((accrual_method)::text = ANY ((ARRAY['upfront'::character varying, 'monthly'::character varying, 'none'::character varying])::text[]))")
@Check('leave_entitlement_policies_allowance_amount_check', '(allowance_amount >= (0)::numeric)')
@Check('leave_entitlement_policies_carryover_limit_check', '((carryover_limit IS NULL) OR (carryover_limit >= (0)::numeric))')
@Check('leave_entitlement_policies_check', '((effective_to IS NULL) OR (effective_to >= effective_from))')
@Check('leave_entitlement_policies_employment_type_check', "((applies_to_employment_type IS NULL) OR ((applies_to_employment_type)::text = ANY ((ARRAY['full_time'::character varying, 'part_time'::character varying])::text[])))")
@Check('leave_entitlement_policies_max_balance_check', '((max_balance IS NULL) OR (max_balance >= (0)::numeric))')
@Entity({ name: 'leave_entitlement_policies', schema: 'workforce' })
export class LeaveEntitlementPolicy {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('uuid', { name: 'leave_type_id' })
  leaveTypeId!: string;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('date', { name: 'effective_from' })
  effectiveFrom!: string;

  @Column('date', { name: 'effective_to', nullable: true })
  effectiveTo!: string | null;

  @Column('varchar', { name: 'accrual_method', length: 20, default: () => "'upfront'::character varying" })
  accrualMethod!: string;

  @Column('numeric', { name: 'allowance_amount', precision: 8, scale: 2, default: () => "0" })
  allowanceAmount!: string;

  @Column('numeric', { name: 'carryover_limit', nullable: true, precision: 8, scale: 2 })
  carryoverLimit!: string | null;

  @Column('numeric', { name: 'max_balance', nullable: true, precision: 8, scale: 2 })
  maxBalance!: string | null;

  @Column('boolean', { name: 'prorate_new_hires', default: () => "true" })
  prorateNewHires!: boolean;

  @Column('varchar', { name: 'applies_to_employment_type', nullable: true, length: 20 })
  appliesToEmploymentType!: string | null;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_entitlement_policies_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.entitlementPolicies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_entitlement_policies_leave_type_id_fkey' })
  leaveType!: LeaveType;
}
