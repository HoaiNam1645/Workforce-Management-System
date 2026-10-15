import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { Employee } from './employee.entity';
import { User } from '../../access-control/entities/user.entity';

@Index("employee_salary_rates_current_uq", ["employeeId"], { unique: true, where: "(effective_to IS NULL)" })
@Check("employee_salary_rates_base_rate_check", "(base_rate >= (0)::numeric)")
@Check("employee_salary_rates_check", "((effective_to IS NULL) OR (effective_to >= effective_from))")
@Check("employee_salary_rates_pay_type_check", "((pay_type)::text = ANY ((ARRAY['hourly'::character varying, 'monthly'::character varying])::text[]))")
@Entity({ name: 'employee_salary_rates', schema: 'workforce' })
export class EmployeeSalaryRate {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId!: string;

  @Column('varchar', { name: 'pay_type', length: 20 })
  payType!: string;

  @Column('numeric', { name: 'base_rate', precision: 18, scale: 2 })
  baseRate!: string;

  @Column('char', { name: 'currency_code', length: 3, default: () => "'VND'::bpchar" })
  currencyCode!: string;

  @Column('date', { name: 'effective_from' })
  effectiveFrom!: string;

  @Column('date', { name: 'effective_to', nullable: true })
  effectiveTo!: string | null;

  @Column('text', { name: 'note', nullable: true })
  note!: string | null;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => Employee, {  })
  @JoinColumn({ name: 'employee_id', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_salary_rates_employee_id_fkey' })
  employee!: Employee;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'employee_salary_rates_created_by_fkey' })
  createdByUser!: User | null;
}
