import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveRequest } from './leave-request.entity';
import { User } from '../../access-control/entities/user.entity';

@Check("leave_balance_transactions_amount_check", "(amount <> (0)::numeric)")
@Check("leave_balance_transactions_transaction_type_check", "((transaction_type)::text = ANY ((ARRAY['opening'::character varying, 'accrual'::character varying, 'reservation'::character varying, 'release'::character varying, 'usage'::character varying, 'refund'::character varying, 'adjustment'::character varying, 'expiry'::character varying])::text[]))")
@Entity({ name: 'leave_balance_transactions', schema: 'workforce' })
export class LeaveBalanceTransaction {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column('uuid', { name: 'leave_balance_id' })
  leaveBalanceId!: string;

  @Column('uuid', { name: 'leave_request_id', nullable: true })
  leaveRequestId!: string | null;

  @Column('varchar', { name: 'transaction_type', length: 20 })
  transactionType!: string;

  @Column('numeric', { name: 'amount', precision: 8, scale: 2 })
  amount!: string;

  @Column('numeric', { name: 'balance_before', nullable: true, precision: 8, scale: 2 })
  balanceBefore!: string | null;

  @Column('numeric', { name: 'balance_after', nullable: true, precision: 8, scale: 2 })
  balanceAfter!: string | null;

  @Column('date', { name: 'effective_date', default: () => "CURRENT_DATE" })
  effectiveDate!: string;

  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @Column('uuid', { name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => "CURRENT_TIMESTAMP" })
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_balance_transactions_created_by_fkey' })
  createdByUser!: User | null;

  @ManyToOne(() => LeaveBalance, {  })
  @JoinColumn({ name: 'leave_balance_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_balance_transactions_leave_balance_id_fkey' })
  leaveBalance!: LeaveBalance;

  @ManyToOne(() => LeaveRequest, { nullable: true })
  @JoinColumn({ name: 'leave_request_id', referencedColumnName: 'id', foreignKeyConstraintName: 'leave_balance_transactions_leave_request_id_fkey' })
  leaveRequest!: LeaveRequest | null;
}
