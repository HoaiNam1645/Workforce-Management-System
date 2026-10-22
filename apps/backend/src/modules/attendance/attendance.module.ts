import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { AttendanceEvent } from './entities/attendance-event.entity';
import { AttendanceAdjustmentRequest } from './entities/attendance-adjustment-request.entity';
import { AttendanceViolation } from './entities/attendance-violation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ShiftAssignment } from '../schedules/entities/shift-assignment.entity';
import { Shift } from '../schedules/entities/shift.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { Branch } from '../organization/entities/branch.entity';
import { Organization } from '../core/entities/organization.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { AttendanceAnomalySetting } from './entities/attendance-anomaly-setting.entity';
import { AttendanceViolationHistory } from './entities/attendance-violation-history.entity';
import { AttendanceAnomalyService } from './attendance-anomaly.service';
import { AttendanceClockAttempt } from './entities/attendance-clock-attempt.entity';

const entities = [
  AttendanceRecord,
  AttendanceEvent,
  AttendanceAdjustmentRequest,
  AttendanceViolation,
  Employee,
  ShiftAssignment,
  Shift,
  Branch,
  Organization,
  LeaveRequest,
  AttendanceAnomalySetting,
  AttendanceViolationHistory,
  AttendanceClockAttempt,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceAnomalyService],
  exports: [TypeOrmModule, AttendanceService, AttendanceAnomalyService],
})
export class AttendanceModule {}
