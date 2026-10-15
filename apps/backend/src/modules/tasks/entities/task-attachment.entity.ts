import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("task_attachments_file_size_bytes_check", "(file_size_bytes >= 0)")
@Entity({ name: 'task_attachments', schema: 'workforce' })
export class TaskAttachment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'task_id' })
  taskId!: string;

  @Column('uuid', { name: 'uploaded_by' })
  uploadedBy!: string;

  @Column('varchar', { name: 'file_name', length: 255 })
  fileName!: string;

  @Column('text', { name: 'file_url' })
  fileUrl!: string;

  @Column('varchar', { name: 'mime_type', nullable: true, length: 100 })
  mimeType!: string | null;

  @Column('bigint', { name: 'file_size_bytes', nullable: true })
  fileSizeBytes!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => User, {  })
  @JoinColumn({ name: 'uploaded_by', referencedColumnName: 'id', foreignKeyConstraintName: 'task_attachments_uploaded_by_fkey' })
  uploadedByUser!: User;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_attachments_task_id_fkey' })
  task!: Task;
}
