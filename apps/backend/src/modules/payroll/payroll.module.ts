import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { EmployeePayroll } from './entities/employee-payroll.entity';
import { PayrollItem } from './entities/payroll-item.entity';
import { PayrollPaymentHistory } from './entities/payroll-payment-history.entity';

const entities = [
  PayrollPeriod,
  EmployeePayroll,
  PayrollItem,
  PayrollPaymentHistory,
];

@Module({
  imports: [TypeOrmModule.forFeature(entities)],
  exports: [TypeOrmModule],
})
export class PayrollModule {}
