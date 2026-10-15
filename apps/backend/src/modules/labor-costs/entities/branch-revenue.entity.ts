import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Branch } from '../../organization/entities/branch.entity';

@Check("branch_revenues_amount_check", "(amount >= (0)::numeric)")
@Check("branch_revenues_source_check", "((source)::text = ANY ((ARRAY['manual'::character varying, 'import'::character varying, 'integration'::character varying])::text[]))")
@Unique("branch_revenues_branch_id_revenue_date_key", ["branchId","revenueDate"])
@Entity({ name: 'branch_revenues', schema: 'workforce' })
export class BranchRevenue {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'branch_id' })
  branchId!: string;

  @Column('date', { name: 'revenue_date' })
  revenueDate!: string;

  @Column('numeric', { name: 'amount', precision: 18, scale: 2 })
  amount!: string;

  @Column('char', { name: 'currency_code', length: 3, default: () => "'VND'::bpchar" })
  currencyCode!: string;

  @Column('varchar', { name: 'source', length: 20, default: () => "'manual'::character varying" })
  source!: string;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => "CURRENT_TIMESTAMP" })
  updatedAt!: Date;

  @ManyToOne(() => Branch, {  })
  @JoinColumn({ name: 'branch_id', referencedColumnName: 'id', foreignKeyConstraintName: 'branch_revenues_branch_id_fkey' })
  branch!: Branch;
}
