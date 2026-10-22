import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Branch } from "./entities/branch.entity";
import { Department } from "./entities/department.entity";
import { BranchDepartment } from "./entities/branch-department.entity";
import { Position } from "./entities/position.entity";
import { BranchOperatingHour } from "./entities/branch-operating-hour.entity";
import { BranchOperatingException } from "./entities/branch-operating-exception.entity";
import { BranchManagerAssignment } from "./entities/branch-manager-assignment.entity";
import { DepartmentPosition } from "./entities/department-position.entity";
import { Employee } from "../employees/entities/employee.entity";
import { Shift } from "../schedules/entities/shift.entity";
import { Organization } from "../core/entities/organization.entity";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { UserRole } from "../access-control/entities/user-role.entity";
import { Role } from "../access-control/entities/role.entity";
import { OrganizationController } from "./organization.controller";
import { OrganizationService } from "./organization.service";

const entities = [
  Branch,
  Department,
  BranchDepartment,
  Position,
  BranchOperatingHour,
  BranchOperatingException,
  BranchManagerAssignment,
  DepartmentPosition,
  Employee,
  Shift,
  Organization,
  AuditLog,
  UserRole,
  Role,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [TypeOrmModule, OrganizationService],
})
export class OrganizationModule {}
