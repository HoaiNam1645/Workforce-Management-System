import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimesheetPeriod } from './entities/timesheet-period.entity';
import { Timesheet } from './entities/timesheet.entity';
import { TimesheetEntry } from './entities/timesheet-entry.entity';
import { TimesheetApprovalHistory } from './entities/timesheet-approval-history.entity';
import { AttendanceRecord } from '../attendance/entities/attendance-record.entity';
import { Organization } from '../core/entities/organization.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { ShiftAssignment } from '../schedules/entities/shift-assignment.entity';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';
import { TimesheetAdjustment } from './entities/timesheet-adjustment.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { EmployeePayroll } from '../payroll/entities/employee-payroll.entity';
import { PayrollPeriod } from '../payroll/entities/payroll-period.entity';

const entities = [
  TimesheetPeriod,
  Timesheet,
  TimesheetEntry,
  TimesheetApprovalHistory,
  AttendanceRecord,
  Organization,
  Employee,
  Branch,
  Department,
  ShiftAssignment,
  TimesheetAdjustment,
  AuditLog,
  EmployeePayroll,
  PayrollPeriod,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  exports: [TypeOrmModule, TimesheetsService],
})
export class TimesheetsModule {}
