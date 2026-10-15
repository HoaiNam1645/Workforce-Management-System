import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { CoreModule } from './modules/core/core.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { LaborCostsModule } from './modules/labor-costs/labor-costs.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { JwtAuthGuard } from './modules/access-control/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/access-control/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/backend/.env'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get<string>('DATABASE_USER', 'workforce'),
        password: config.get<string>('DATABASE_PASSWORD', 'workforce'),
        database: config.get<string>('DATABASE_NAME', 'workforce'),
        schema: 'workforce',
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get<string>('DATABASE_LOGGING', 'false') === 'true',
        ssl:
          config.get<string>('DATABASE_SSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        retryAttempts: 3,
        retryDelay: 1_000,
      }),
    }),
    CoreModule,
    AccessControlModule,
    OrganizationModule,
    EmployeesModule,
    SchedulesModule,
    AttendanceModule,
    LeaveModule,
    TimesheetsModule,
    PayrollModule,
    LaborCostsModule,
    TasksModule,
    ComplianceModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
  ],
})
export class AppModule {}
