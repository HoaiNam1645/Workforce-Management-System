import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { EmployeePayroll } from './entities/employee-payroll.entity';
import { PayrollItem } from './entities/payroll-item.entity';
import { PayrollPaymentHistory } from './entities/payroll-payment-history.entity';
import { PayrollRule } from './entities/payroll-rule.entity';
import { PayrollStatusHistory } from './entities/payroll-status-history.entity';
import { EmployeeSalaryRate } from '../employees/entities/employee-salary-rate.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Organization } from '../core/entities/organization.entity';
import { Timesheet } from '../timesheets/entities/timesheet.entity';
import { TimesheetPeriod } from '../timesheets/entities/timesheet-period.entity';
import { TimesheetEntry } from '../timesheets/entities/timesheet-entry.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

const entities = [
  PayrollPeriod,
  EmployeePayroll,
  PayrollItem,
  PayrollPaymentHistory,
  PayrollRule,
  PayrollStatusHistory,
  EmployeeSalaryRate,
  Employee,
  Organization,
  Timesheet,
  TimesheetPeriod,
  TimesheetEntry,
  AuditLog,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [TypeOrmModule, PayrollService],
})
export class PayrollModule {}
