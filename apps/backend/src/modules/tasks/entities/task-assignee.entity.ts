import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Task } from './task.entity';
import { User } from '../../access-control/entities/user.entity';

@Entity({ name: 'task_assignees', schema: 'workforce' })
export class TaskAssignee {
  @PrimaryColumn('uuid', { name: 'task_id' })
  taskId!: string;

  @PrimaryColumn('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('timestamptz', { name: 'assigned_at', default: () => "CURRENT_TIMESTAMP" })
  assignedAt!: Date;

  @Column('uuid', { name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_assignees_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by', referencedColumnName: 'id', foreignKeyConstraintName: 'task_assignees_assigned_by_fkey' })
  assignedByUser!: User | null;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id', referencedColumnName: 'id', foreignKeyConstraintName: 'task_assignees_task_id_fkey' })
  task!: Task;
}
