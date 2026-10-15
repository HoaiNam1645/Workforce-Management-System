import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Organization } from '../../core/entities/organization.entity';

@Check("shift_templates_check", "(((crosses_midnight = false) AND (end_time > start_time)) OR (crosses_midnight = true))")
@Check("shift_templates_color_check", "(color ~ '^#[0-9A-Fa-f]{6}$'::text)")
@Check("shift_templates_required_headcount_check", "(required_headcount > 0)")
@Check("shift_templates_unpaid_break_minutes_check", "(unpaid_break_minutes >= 0)")
@Unique("shift_templates_organization_id_code_key", ["organizationId","code"])
@Entity({ name: 'shift_templates', schema: 'workforce' })
export class ShiftTemplate {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'organization_id' })
  organizationId!: string;

  @Column('uuid', { name: 'branch_id', nullable: true })
  branchId!: string | null;

  @Column('varchar', { name: 'code', length: 30 })
  code!: string;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('char', { name: 'color', nullable: true, length: 7, default: () => "'#2563EB'::bpchar" })
  color!: string | null;

  @Column('time', { name: 'start_time' })
  startTime!: string;

  @Column('time', { name: 'end_time' })
  endTime!: string;

  @Column('boolean', { name: 'crosses_midnight', default: () => "false" })
  crossesMidnight!: boolean;

  @Column('smallint', { name: 'unpaid_break_minutes', default: () => "0" })
  unpaidBreakMinutes!: number;

  @Column('smallint', { name: 'required_headcount', default: () => "1" })
  requiredHeadcount!: number;

  @Column('boolean', { name: 'is_active', default: () => "true" })
  isActive!: boolean;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Organization, {  })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_templates_organization_id_fkey' })
  organization!: Organization;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_templates_branch_id_fkey' })
  branch!: Branch | null;
}
