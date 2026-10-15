import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Department } from '../../organization/entities/department.entity';
import { Position } from '../../organization/entities/position.entity';
import { ScheduleTemplate } from './schedule-template.entity';
import { ShiftTemplate } from './shift-template.entity';

@Check("schedule_template_items_day_offset_check", "((day_offset >= 0) AND (day_offset <= 365))")
@Check("schedule_template_items_required_headcount_check", "(required_headcount > 0)")
@Unique("schedule_template_items_schedule_template_id_shift_template_key", ["scheduleTemplateId","shiftTemplateId","dayOffset","departmentId","positionId"])
@Entity({ name: 'schedule_template_items', schema: 'workforce' })
export class ScheduleTemplateItem {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'schedule_template_id' })
  scheduleTemplateId!: string;

  @Column('uuid', { name: 'shift_template_id' })
  shiftTemplateId!: string;

  @Column('smallint', { name: 'day_offset' })
  dayOffset!: number;

  @Column('uuid', { name: 'department_id', nullable: true })
  departmentId!: string | null;

  @Column('uuid', { name: 'position_id', nullable: true })
  positionId!: string | null;

  @Column('smallint', { name: 'required_headcount', default: () => "1" })
  requiredHeadcount!: number;

  @ManyToOne(() => Position, { nullable: true })
  @JoinColumn({ name: 'position_id', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_template_items_position_id_fkey' })
  position!: Position | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_template_items_department_id_fkey' })
  department!: Department | null;

  @ManyToOne(() => ShiftTemplate, {  })
  @JoinColumn({ name: 'shift_template_id', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_template_items_shift_template_id_fkey' })
  shiftTemplate!: ShiftTemplate;

  @ManyToOne(() => ScheduleTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_template_id', referencedColumnName: 'id', foreignKeyConstraintName: 'schedule_template_items_schedule_template_id_fkey' })
  scheduleTemplate!: ScheduleTemplate;
}
