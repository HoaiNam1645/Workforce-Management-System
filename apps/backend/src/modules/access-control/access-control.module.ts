import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';

const entities = [
  User,
  Role,
  Permission,
  RolePermission,
  UserRole,
  Employee,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(entities),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'local-development-secret-change-before-production'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') as never },
      }),
    }),
  ],
  controllers: [AccessControlController],
  providers: [AccessControlService, JwtAuthGuard, PermissionsGuard],
  exports: [TypeOrmModule, AccessControlService, JwtAuthGuard, PermissionsGuard, JwtModule],
})
export class AccessControlModule {}
