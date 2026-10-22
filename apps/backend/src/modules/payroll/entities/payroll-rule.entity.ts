import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';
import { User } from '../../access-control/entities/user.entity';

@Check('payroll_rule_type_check', "rule_type IN ('overtime','holiday','allowance')")
@Check('payroll_rule_values_check', 'multiplier >= 0 AND (fixed_amount IS NULL OR fixed_amount >= 0) AND (effective_to IS NULL OR effective_to >= effective_from)')
@Unique('payroll_rules_org_code_from_key', ['organizationId', 'code', 'effectiveFrom'])
@Entity({ name: 'payroll_rules', schema: 'workforce' })
export class PayrollRule {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'organization_id' }) organizationId!: string;
  @Column('varchar', { length: 40 }) code!: string;
  @Column('varchar', { length: 120 }) name!: string;
  @Column('varchar', { name: 'rule_type', length: 20 }) ruleType!: string;
  @Column('numeric', { precision: 8, scale: 4, default: 1 }) multiplier!: string;
  @Column('numeric', { name: 'fixed_amount', precision: 18, scale: 2, nullable: true }) fixedAmount!: string | null;
  @Column('varchar', { name: 'day_type', length: 30, nullable: true }) dayType!: string | null;
  @Column('smallint', { name: 'priority', default: 100 }) priority!: number;
  @Column('date', { name: 'effective_from' }) effectiveFrom!: string;
  @Column('date', { name: 'effective_to', nullable: true }) effectiveTo!: string | null;
  @Column('boolean', { name: 'is_active', default: true }) isActive!: boolean;
  @Column('jsonb', { name: 'conditions', default: () => "'{}'::jsonb" }) conditions!: Record<string, unknown>;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
  @Column('timestamptz', { name: 'created_at', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'CURRENT_TIMESTAMP' }) updatedAt!: Date;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'organization_id' }) organization!: Organization;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'created_by' }) createdByUser!: User | null;
}
