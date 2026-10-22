import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveBalanceTransaction } from './entities/leave-balance-transaction.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveEntitlementPolicy } from './entities/leave-entitlement-policy.entity';
import { Organization } from '../core/entities/organization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

const entities = [
  LeaveType,
  LeaveBalance,
  LeaveBalanceTransaction,
  LeaveRequest,
  LeaveEntitlementPolicy,
  Organization,
  Employee,
  AuditLog,
  Notification,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [TypeOrmModule, LeaveService],
})
export class LeaveModule {}
