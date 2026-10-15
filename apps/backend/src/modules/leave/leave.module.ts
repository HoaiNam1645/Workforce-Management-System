import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveRequest } from './entities/leave-request.entity';

const entities = [
  LeaveType,
  LeaveBalance,
  LeaveBalanceTransaction,
  LeaveRequest,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class LeaveModule {}
