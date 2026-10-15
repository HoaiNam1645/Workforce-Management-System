import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';
import { Department } from '../../organization/entities/department.entity';
import { Shift } from '../../schedules/entities/shift.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("tasks_check", "((due_at IS NULL) OR (starts_at IS NULL) OR (due_at >= starts_at))")
@Check("tasks_check1", "(((status)::text <> 'completed'::text) OR (completed_at IS NOT NULL))")
@Check("tasks_priority_check", "((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))")
@Check("tasks_progress_percent_check", "((progress_percent >= 0) AND (progress_percent <= 100))")
@Check("tasks_status_check", "((status)::text = ANY ((ARRAY['todo'::character varying, 'in_progress'::character varying, 'submitted'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))")
@Entity({ name: 'tasks', schema: 'workforce' })
export class Task {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('varchar', { name: 'title', length: 255 })
  title!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('uuid', { name: 'branch_id', nullable: true })
  branchId!: string | null;

  @Column('uuid', { name: 'department_id', nullable: true })
  departmentId!: string | null;

  @Column('uuid', { name: 'related_shift_id', nullable: true })
  relatedShiftId!: string | null;

  @Column('varchar', { name: 'priority', length: 15, default: () => "'medium'::character varying" })
  priority!: string;

  @Column('varchar', { name: 'status', length: 20, default: () => "'todo'::character varying" })
  status!: string;

  @Column('timestamptz', { name: 'starts_at', nullable: true })
  startsAt!: Date | null;

  @Column('timestamptz', { name: 'due_at', nullable: true })
  dueAt!: Date | null;

  @Column('smallint', { name: 'progress_percent', default: () => "0" })
  progressPercent!: number;

  @Column('uuid', { name: 'created_by' })
  createdBy!: string;

  @Column('timestamptz', { name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column('uuid', { name: 'confirmed_by', nullable: true })
  confirmedBy!: string | null;

  @Column('timestamptz', { name: 'confirmed_at', nullable: true })
  confirmedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => User, {  })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'tasks_created_by_fkey' })
  createdByUser!: User;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'tasks_branch_id_fkey' })
  branch!: Branch | null;

  @ManyToOne(() => Shift, { nullable: true })
  @JoinColumn({ name: 'related_shift_id', referencedColumnName: 'id', foreignKeyConstraintName: 'tasks_related_shift_id_fkey' })
  relatedShift!: Shift | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'confirmed_by', referencedColumnName: 'id', foreignKeyConstraintName: 'tasks_confirmed_by_fkey' })
  confirmedByUser!: User | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'tasks_department_id_fkey' })
  department!: Department | null;
}
