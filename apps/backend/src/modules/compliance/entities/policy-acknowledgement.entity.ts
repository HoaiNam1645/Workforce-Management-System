import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Policy } from './policy.entity';

@Entity({ name: 'policy_acknowledgements', schema: 'workforce' })
export class PolicyAcknowledgement {
  @PrimaryColumn('uuid', { name: 'policy_id' })
  policyId!: string;

  @PrimaryColumn('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('timestamptz', { name: 'acknowledged_at', default: () => "CURRENT_TIMESTAMP" })
  acknowledgedAt!: Date;

  @Column('inet', { name: 'ip_address', nullable: true })
  ipAddress!: string | null;

  @ManyToOne(() => Policy, {  })
  @JoinColumn({ name: 'policy_id', referencedColumnName: 'id', foreignKeyConstraintName: 'policy_acknowledgements_policy_id_fkey' })
  policy!: Policy;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'policy_acknowledgements_employee_id_fkey' })
  employee!: Employee;
}
