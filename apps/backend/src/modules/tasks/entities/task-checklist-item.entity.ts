import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'task_checklist_items', schema: 'workforce' })
export class TaskChecklistItem {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'task_id' })
  taskId!: string;

  @Column('varchar', { name: 'content', length: 500 })
  content!: string;

  @Column('integer', { name: 'sort_order', default: () => "0" })
  sortOrder!: number;

  @Column('boolean', { name: 'is_completed', default: () => "false" })
  isCompleted!: boolean;

  @Column('uuid', { name: 'completed_by', nullable: true })
  completedBy!: string | null;

  @Column('timestamptz', { name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_checklist_items_task_id_fkey' })
  task!: Task;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'completed_by', referencedColumnName: 'id', foreignKeyConstraintName: 'task_checklist_items_completed_by_fkey' })
  completedByUser!: User | null;
}
