import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimesheetPeriod } from './entities/timesheet-period.entity';
import { Timesheet } from './entities/timesheet.entity';
import { TimesheetEntry } from './entities/timesheet-entry.entity';
import { TimesheetApprovalHistory } from './entities/timesheet-approval-history.entity';

const entities = [
  TimesheetPeriod,
  Timesheet,
  TimesheetEntry,
  TimesheetApprovalHistory,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class TimesheetsModule {}
