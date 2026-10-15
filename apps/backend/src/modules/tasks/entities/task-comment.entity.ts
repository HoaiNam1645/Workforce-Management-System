import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'task_comments', schema: 'workforce' })
export class TaskComment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'task_id' })
  taskId!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('text', { name: 'content' })
  content!: string;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @Column('timestamptz', { name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => User, {  })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_comments_user_id_fkey' })
  user!: User;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_comments_task_id_fkey' })
  task!: Task;
}
