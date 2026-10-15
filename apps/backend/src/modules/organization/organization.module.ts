import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './entities/branch.entity';
import { Department } from './entities/department.entity';
import { BranchDepartment } from './entities/branch-department.entity';
import { Position } from './entities/position.entity';

const entities = [
  Branch,
  Department,
  BranchDepartment,
  Position,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class OrganizationModule {}
