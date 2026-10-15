import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftTemplate } from './entities/shift-template.entity';
import { ScheduleTemplate } from './entities/schedule-template.entity';
import { ScheduleTemplateItem } from './entities/schedule-template-item.entity';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { ShiftSwapRequest } from './entities/shift-swap-request.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { Position } from '../organization/entities/position.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

const entities = [
  ShiftTemplate,
  ScheduleTemplate,
  ScheduleTemplateItem,
  Shift,
  ShiftAssignment,
  ShiftSwapRequest,
  Branch,
  Department,
  Position,
  Employee,
  LeaveRequest,
  Notification,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [TypeOrmModule, SchedulesService],
})
export class SchedulesModule {}
