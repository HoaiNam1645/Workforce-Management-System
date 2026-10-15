import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Organization } from '../../core/entities/organization.entity';

@Check("leave_types_annual_allowance_check", "(annual_allowance >= (0)::numeric)")
@Check("leave_types_unit_check", "((unit)::text = ANY ((ARRAY['day'::character varying, 'hour'::character varying])::text[]))")
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

  @Column('boolean', { name: 'is_paid', default: () => "true" })
  isPaid!: boolean;

  @Column('varchar', { name: 'unit', length: 10, default: () => "'day'::character varying" })
  unit!: string;

  @Column('numeric', { name: 'annual_allowance', nullable: true, precision: 8, scale: 2 })
  annualAllowance!: string | null;

  @Column('boolean', { name: 'allow_negative_balance', default: () => "false" })
  allowNegativeBalance!: boolean;

  @Column('boolean', { name: 'requires_attachment', default: () => "false" })
  requiresAttachment!: boolean;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_types_organization_id_fkey' })
  organization!: Organization;
}
