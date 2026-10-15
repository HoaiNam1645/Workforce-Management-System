import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Shift } from './shift.entity';
import { User } from '../../access-control/entities/user.entity';

@Index("shift_assignments_employee_idx", ["employeeId","assignmentStatus"])
@Check("shift_assignments_assignment_status_check", "((assignment_status)::text = ANY ((ARRAY['assigned'::character varying, 'confirmed'::character varying, 'declined'::character varying, 'cancelled'::character varying])::text[]))")
@Unique("shift_assignments_shift_id_employee_id_key", ["shiftId","employeeId"])
@Entity({ name: 'shift_assignments', schema: 'workforce' })
export class ShiftAssignment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'shift_id' })
  shiftId!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('varchar', { name: 'assignment_status', length: 20, default: () => "'assigned'::character varying" })
  assignmentStatus!: string;

  @Column('uuid', { name: 'assigned_by', nullable: true })
  assignedBy!: string | null;

  @Column('timestamptz', { name: 'assigned_at', default: () => "CURRENT_TIMESTAMP" })
  assignedAt!: Date;

  @Column('timestamptz', { name: 'cancelled_at', nullable: true })
  cancelledAt!: Date | null;

  @Column('text', { name: 'cancellation_reason', nullable: true })
  cancellationReason!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_assignments_assigned_by_fkey' })
  assignedByUser!: User | null;

  @ManyToOne(() => Shift, (shift) => shift.assignments)
  @JoinColumn({ name: 'shift_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_assignments_shift_id_fkey' })
  shift!: Shift;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'shift_assignments_employee_id_fkey' })
  employee!: Employee;
}
