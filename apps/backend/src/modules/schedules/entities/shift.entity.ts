import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Position } from '../../organization/entities/position.entity';
import { ShiftTemplate } from './shift-template.entity';
import { User } from '../../access-control/entities/user.entity';
import { ShiftAssignment } from './shift-assignment.entity';

@Index("shifts_branch_time_idx", ["branchId","startsAt"], { where: "(deleted_at IS NULL)" })
@Index("shifts_time_idx", ["startsAt","endsAt"], { where: "(deleted_at IS NULL)" })
@Check("shifts_check", "(ends_at > starts_at)")
@Check("shifts_check1", "(((status)::text <> 'published'::text) OR (published_at IS NOT NULL))")
@Check("shifts_required_headcount_check", "(required_headcount > 0)")
@Check("shifts_status_check", "((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))")
@Check("shifts_unpaid_break_minutes_check", "(unpaid_break_minutes >= 0)")
@Entity({ name: 'shifts', schema: 'workforce' })
export class Shift {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'shift_template_id', nullable: true })
  shiftTemplateId!: string | null;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('uuid', { name: 'department_id', nullable: true })
  departmentId!: string | null;

  @Column('uuid', { name: 'position_id', nullable: true })
  positionId!: string | null;

  @Column('varchar', { name: 'name', length: 150 })
  name!: string;

  @Column('timestamptz', { name: 'starts_at' })
  startsAt!: Date;

  @Column('timestamptz', { name: 'ends_at' })
  endsAt!: Date;

  @Column('smallint', { name: 'unpaid_break_minutes', default: () => "0" })
  unpaidBreakMinutes!: number;

  @Column('smallint', { name: 'required_headcount', default: () => "1" })
  requiredHeadcount!: number;

  @Column('varchar', { name: 'status', length: 20, default: () => "'draft'::character varying" })
  status!: string;

  @Column('uuid', { name: 'recurrence_group_id', nullable: true })
  recurrenceGroupId!: string | null;

  @Column('text', { name: 'notes', nullable: true })
  notes!: string | null;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @Column('uuid', { name: 'published_by', nullable: true })
  publishedBy!: string | null;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Position, { nullable: true })
  @JoinColumn({ name: 'position_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_position_id_fkey' })
  position!: Position | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_department_id_fkey' })
  department!: Department | null;

  @ManyToOne(() => ShiftTemplate, { nullable: true })
  @JoinColumn({ name: 'shift_template_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_shift_template_id_fkey' })
  shiftTemplate!: ShiftTemplate | null;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_branch_id_fkey' })
  branch!: Branch;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_created_by_fkey' })
  createdByUser!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'published_by', referencedColumnName: 'id', foreignKeyConstraintName: 'shifts_published_by_fkey' })
  publishedByUser!: User | null;

  @OneToMany(() => ShiftAssignment, (assignment) => assignment.shift)
  assignments!: ShiftAssignment[];
}
