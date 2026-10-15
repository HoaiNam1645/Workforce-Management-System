import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from './entities/policy.entity';
import { PolicyAcknowledgement } from './entities/policy-acknowledgement.entity';

const entities = [
  Policy,
  PolicyAcknowledgement,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class ComplianceModule {}
