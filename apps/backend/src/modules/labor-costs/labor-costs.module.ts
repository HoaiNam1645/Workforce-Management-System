import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LaborBudget } from './entities/labor-budget.entity';
import { BranchRevenue } from './entities/branch-revenue.entity';

const entities = [
  LaborBudget,
  BranchRevenue,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class LaborCostsModule {}
