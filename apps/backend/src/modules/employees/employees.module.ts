import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { EmployeeWorkHistory } from './entities/employee-work-history.entity';
import { EmployeeSalaryRate } from './entities/employee-salary-rate.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { Organization } from '../core/entities/organization.entity';
import { Branch } from '../organization/entities/branch.entity';
import { Department } from '../organization/entities/department.entity';
import { Position } from '../organization/entities/position.entity';
import { User } from '../access-control/entities/user.entity';
import { Role } from '../access-control/entities/role.entity';
import { UserRole } from '../access-control/entities/user-role.entity';

const entities = [
  Employee,
  EmployeeWorkHistory,
  EmployeeSalaryRate,
  EmployeeDocument,
  Organization,
  Branch,
  Department,
  Position,
  User,
  Role,
  UserRole,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [TypeOrmModule, EmployeesService],
})
export class EmployeesModule {}
